import * as soap from 'soap';
import config from '../config/config';
import logger from '../utils/logger';
import { wsaaService } from './wsaa.service';
import { certificateService } from './certificate.service';
import {
  AfipAuthorizeRequest,
  AfipAuthorizeResponse,
  LastVoucherRequest,
  LastVoucherResponse,
  TipoComprobante,
} from '../types/afip.types';

/**
 * Servicio WSFE - Web Service de Facturación Electrónica de AFIP
 */
export class WSFEService {
  private soapClient: any = null;

  /**
   * Obtener cliente SOAP (con cache)
   */
  private async getSoapClient(): Promise<any> {
    if (this.soapClient) {
      return this.soapClient;
    }

    try {
      logger.info(`Connecting to AFIP WSFE: ${config.wsfeUrl}`);
      this.soapClient = await soap.createClientAsync(config.wsfeUrl, {
        disableCache: false,
        endpoint: config.wsfeUrl.replace('?WSDL', ''),
      });
      logger.info('SOAP client created successfully');
      return this.soapClient;
    } catch (error: any) {
      logger.error('Error creating SOAP client:', error.message);
      throw error;
    }
  }

  /**
   * Autorizar factura en AFIP
   */
  async authorizeInvoice(request: AfipAuthorizeRequest): Promise<AfipAuthorizeResponse> {
    try {
      logger.info(`Authorizing invoice for business ${request.businessId}, CUIT: ${request.cuit}, Tipo: ${request.tipoComprobante}`);
      logger.info(`[DEBUG] Request condicionIVA: ${request.condicionIVA} (type: ${typeof request.condicionIVA})`);
      logger.info(`[DEBUG] Full request: ${JSON.stringify(request, null, 2)}`);

      // [DEBUG] Consultar tipos de IVA válidos (alícuotas)
      const condicionesResult = await this.getCondicionesIVA(request.businessId, request.cuit);
      if (condicionesResult.success) {
        logger.info('[DEBUG] Tipos IVA (alícuotas) válidas desde AFIP:', JSON.stringify(condicionesResult.data, null, 2));
      }

      // [DEBUG] Consultar condiciones IVA del receptor válidas
      const condicionesReceptorResult = await this.getCondicionesIVAReceptor(request.businessId, request.cuit);
      if (condicionesReceptorResult.success) {
        logger.info('[DEBUG] Condiciones IVA del receptor válidas desde AFIP:', JSON.stringify(condicionesReceptorResult.data, null, 2));
      }

      // [DEBUG] Consultar tipos de datos opcionales disponibles
      const tiposOpcionalesResult = await this.getTiposOpcionales(request.businessId, request.cuit);
      if (tiposOpcionalesResult.success) {
        logger.info('[DEBUG] Tipos de datos opcionales disponibles desde AFIP:', JSON.stringify(tiposOpcionalesResult.data, null, 2));
      }

      // Validar certificado
      const certInfo = await certificateService.getCertificateInfo(request.businessId);
      if (!certInfo) {
        return {
          success: false,
          error: 'No se encontró certificado para el negocio',
        };
      }

      // Validar que el certificado esté vigente
      const isValid = await certificateService.isCertificateValid(request.businessId);
      if (!isValid) {
        return {
          success: false,
          error: 'El certificado ha expirado',
        };
      }

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(request.businessId, 'wsfe');
      if (!ta) {
        return {
          success: false,
          error: 'No se pudo obtener ticket de acceso de AFIP',
        };
      }

      // Obtener último número de comprobante
      const lastVoucher = await this.getLastVoucher({
        businessId: request.businessId,
        cuit: request.cuit,
        puntoVenta: request.puntoVenta,
        tipoComprobante: request.tipoComprobante,
      });

      if (!lastVoucher.success) {
        return {
          success: false,
          error: `No se pudo obtener último comprobante: ${lastVoucher.error}`,
        };
      }

      const numeroComprobante = (lastVoucher.numeroComprobante || 0) + 1;

      // Preparar datos del comprobante
      const feDetReq = this.buildFeDetReq(request, numeroComprobante);

      // Crear cliente SOAP
      const client = await this.getSoapClient();

      // Preparar request SOAP
      const soapRequest = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: request.cuit,
        },
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: request.puntoVenta,
            CbteTipo: request.tipoComprobante,
          },
          FeDetReq: {
            FECAEDetRequest: feDetReq,
          },
        },
      };

      logger.info('[DEBUG] SOAP Request to AFIP:', JSON.stringify(soapRequest, null, 2));

      // Llamar a AFIP
      const [result] = await client.FECAESolicitarAsync(soapRequest);

      logger.info('[DEBUG] SOAP Response from AFIP:', JSON.stringify(result, null, 2));

      // Parsear respuesta
      return this.parseAuthorizeResponse(result, numeroComprobante, request.tipoComprobante);
    } catch (error: any) {
      logger.error('Error authorizing invoice:', error.message);
      return {
        success: false,
        error: `Error al autorizar: ${error.message}`,
      };
    }
  }

  /**
   * Generar nota de crédito
   */
  async generateCreditNote(
    originalInvoice: AfipAuthorizeRequest,
    originalComprobanteInfo: {
      tipo: number;
      puntoVenta: number;
      numero: number;
    }
  ): Promise<AfipAuthorizeResponse> {
    try {
      logger.info(`Generating credit note for business ${originalInvoice.businessId}`);

      // Determinar tipo de nota de crédito según tipo de factura
      let tipoNotaCredito: number;
      switch (originalComprobanteInfo.tipo) {
        case TipoComprobante.FACTURA_A:
          tipoNotaCredito = TipoComprobante.NOTA_CREDITO_A;
          break;
        case TipoComprobante.FACTURA_B:
          tipoNotaCredito = TipoComprobante.NOTA_CREDITO_B;
          break;
        case TipoComprobante.FACTURA_C:
          tipoNotaCredito = TipoComprobante.NOTA_CREDITO_C;
          break;
        default:
          return {
            success: false,
            error: 'Tipo de comprobante no válido para nota de crédito',
          };
      }

      // Crear request para nota de crédito
      const creditNoteRequest: AfipAuthorizeRequest = {
        ...originalInvoice,
        tipoComprobante: tipoNotaCredito,
        comprobantesAsociados: [
          {
            tipo: originalComprobanteInfo.tipo,
            puntoVenta: originalComprobanteInfo.puntoVenta,
            numero: originalComprobanteInfo.numero,
            cuit: originalInvoice.cuit,
          },
        ],
      };

      // Autorizar nota de crédito
      return await this.authorizeInvoice(creditNoteRequest);
    } catch (error: any) {
      logger.error('Error generating credit note:', error.message);
      return {
        success: false,
        error: `Error al generar nota de crédito: ${error.message}`,
      };
    }
  }

  /**
   * Obtener condiciones IVA del receptor válidas según AFIP
   */
  async getCondicionesIVAReceptor(businessId: number, cuit: string): Promise<any> {
    try {
      logger.info(`[DEBUG] Getting condiciones IVA del receptor from AFIP for business ${businessId}`);

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(businessId, 'wsfe');
      if (!ta) {
        return { success: false, error: 'No se pudo obtener ticket de acceso de AFIP' };
      }

      // Obtener cliente SOAP
      const client = await this.getSoapClient();

      // Preparar request
      const request = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: cuit,
        },
      };

      logger.info('[DEBUG] Calling FEParamGetCondicionIvaReceptor');
      const [result] = await client.FEParamGetCondicionIvaReceptorAsync(request);
      logger.info('[DEBUG] FEParamGetCondicionIvaReceptor response:', JSON.stringify(result, null, 2));

      return { success: true, data: result };
    } catch (error: any) {
      logger.error('[DEBUG] Error getting condiciones IVA receptor:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener tipos de datos opcionales disponibles según AFIP
   */
  async getTiposOpcionales(businessId: number, cuit: string): Promise<any> {
    try {
      logger.info(`[DEBUG] Getting tipos opcionales from AFIP for business ${businessId}`);

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(businessId, 'wsfe');
      if (!ta) {
        return { success: false, error: 'No se pudo obtener ticket de acceso de AFIP' };
      }

      // Obtener cliente SOAP
      const client = await this.getSoapClient();

      // Preparar request
      const request = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: cuit,
        },
      };

      logger.info('[DEBUG] Calling FEParamGetTiposOpcional');
      const [result] = await client.FEParamGetTiposOpcionalAsync(request);
      logger.info('[DEBUG] FEParamGetTiposOpcional response:', JSON.stringify(result, null, 2));

      return { success: true, data: result };
    } catch (error: any) {
      logger.error('[DEBUG] Error getting tipos opcionales:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener condiciones IVA válidas según AFIP (alícuotas)
   */
  async getCondicionesIVA(businessId: number, cuit: string): Promise<any> {
    try {
      logger.info(`[DEBUG] Getting condiciones IVA (alícuotas) from AFIP for business ${businessId}`);

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(businessId, 'wsfe');
      if (!ta) {
        return { success: false, error: 'No se pudo obtener ticket de acceso de AFIP' };
      }

      // Obtener cliente SOAP
      const client = await this.getSoapClient();

      // Preparar request
      const request = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: cuit,
        },
      };

      logger.info('[DEBUG] Calling FEParamGetTiposIva');
      const [result] = await client.FEParamGetTiposIvaAsync(request);
      logger.info('[DEBUG] FEParamGetTiposIva response:', JSON.stringify(result, null, 2));

      return { success: true, data: result };
    } catch (error: any) {
      logger.error('[DEBUG] Error getting condiciones IVA:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener último número de comprobante autorizado
   */
  async getLastVoucher(request: LastVoucherRequest): Promise<LastVoucherResponse> {
    try {
      logger.info(
        `Getting last voucher for business ${request.businessId}, PtoVta: ${request.puntoVenta}, Tipo: ${request.tipoComprobante}`
      );

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(request.businessId, 'wsfe');
      if (!ta) {
        return {
          success: false,
          error: 'No se pudo obtener ticket de acceso de AFIP',
        };
      }

      // Crear cliente SOAP
      const client = await this.getSoapClient();

      // Preparar request
      const soapRequest = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: request.cuit,
        },
        PtoVta: request.puntoVenta,
        CbteTipo: request.tipoComprobante,
      };

      // Llamar a AFIP
      const [result] = await client.FECompUltimoAutorizadoAsync(soapRequest);

      if (result.FECompUltimoAutorizadoResult?.Errors) {
        const errors = Array.isArray(result.FECompUltimoAutorizadoResult.Errors.Err)
          ? result.FECompUltimoAutorizadoResult.Errors.Err
          : [result.FECompUltimoAutorizadoResult.Errors.Err];
        
        const errorMsg = errors.map((e: any) => `${e.Code}: ${e.Msg}`).join(', ');
        return {
          success: false,
          error: errorMsg,
        };
      }

      const numeroComprobante = result.FECompUltimoAutorizadoResult?.CbteNro || 0;

      logger.info(`Last voucher number: ${numeroComprobante}`);

      return {
        success: true,
        numeroComprobante,
      };
    } catch (error: any) {
      logger.error('Error getting last voucher:', error.message);
      return {
        success: false,
        error: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Construir detalle del comprobante para AFIP
   */
  private buildFeDetReq(request: AfipAuthorizeRequest, numeroComprobante: number): any {
    logger.info(`[DEBUG] Building FeDetReq with condicionIVA: ${request.condicionIVA} (type: ${typeof request.condicionIVA})`);
    
    // Para Facturas C (tipo 11, 13): no se discrimina IVA
    const esFacturaC = [11, 13].includes(request.tipoComprobante);
    
    const feDetReq: any = {
      Concepto: request.concepto,
      DocTipo: request.tipoDocumento,
      DocNro: parseInt(request.numeroDocumento) || 0,
      CbteDesde: numeroComprobante,
      CbteHasta: numeroComprobante,
      CbteFch: request.fechaComprobante,
      ImpTotal: request.importeTotal.toFixed(2),
      ImpTotConc: 0, // Importe neto no gravado
      ImpNeto: esFacturaC ? request.importeTotal.toFixed(2) : request.importeNeto.toFixed(2), // En Factura C, ImpNeto = ImpTotal
      ImpOpEx: request.importeExento.toFixed(2),
      ImpIVA: esFacturaC ? '0.00' : request.importeIVA.toFixed(2), // En Factura C, IVA debe ser 0
      ImpTrib: request.importeTributos.toFixed(2),
      MonId: 'PES', // Pesos argentinos
      MonCotiz: 1,
      CondicionIVAReceptorId: request.condicionIVA, // Obligatorio según RG 5616
    };
    
    logger.info(`[DEBUG] Building FeDetReq with CondicionIVAReceptorId: ${request.condicionIVA}, esFacturaC: ${esFacturaC}`);

    // Fechas de servicio (solo para concepto servicios o productos y servicios)
    if (request.concepto !== 1) {
      feDetReq.FchServDesde = request.fechaServicioDesde;
      feDetReq.FchServHasta = request.fechaServicioHasta;
      feDetReq.FchVtoPago = request.fechaVencimientoPago;
    }

    // IVA: solo para Facturas A y B, NO para Facturas C
    if (!esFacturaC && request.iva && request.iva.length > 0) {
      feDetReq.Iva = {
        AlicIva: request.iva.map(i => ({
          Id: i.id,
          BaseImp: i.baseImponible.toFixed(2),
          Importe: i.importe.toFixed(2),
        })),
      };
    }

    // Tributos
    if (request.tributos && request.tributos.length > 0) {
      feDetReq.Tributos = {
        Tributo: request.tributos.map(t => ({
          Id: t.id,
          Desc: t.descripcion,
          BaseImp: t.baseImponible.toFixed(2),
          Alic: t.alicuota.toFixed(2),
          Importe: t.importe.toFixed(2),
        })),
      };
    }

    // Comprobantes asociados (para notas de crédito)
    if (request.comprobantesAsociados && request.comprobantesAsociados.length > 0) {
      feDetReq.CbtesAsoc = {
        CbteAsoc: request.comprobantesAsociados.map(c => ({
          Tipo: c.tipo,
          PtoVta: c.puntoVenta,
          Nro: c.numero,
          Cuit: c.cuit,
        })),
      };
    }

    return feDetReq;
  }

  /**
   * Parsear respuesta de autorización
   */
  private parseAuthorizeResponse(result: any, numeroComprobante: number, tipoComprobante: number): AfipAuthorizeResponse {
    try {
      const feResp = result.FECAESolicitarResult;

      // Verificar errores generales
      if (feResp.Errors) {
        const errors = Array.isArray(feResp.Errors.Err) ? feResp.Errors.Err : [feResp.Errors.Err];
        return {
          success: false,
          errores: errors.map((e: any) => ({ code: e.Code, msg: e.Msg })),
          error: errors.map((e: any) => `${e.Code}: ${e.Msg}`).join(', '),
        };
      }

      // Obtener detalle del comprobante
      const feDetResp = feResp.FeDetResp?.FECAEDetResponse;
      
      if (!feDetResp) {
        return {
          success: false,
          error: 'No se recibió respuesta del comprobante',
        };
      }

      const detalle = Array.isArray(feDetResp) ? feDetResp[0] : feDetResp;

      // Verificar resultado
      if (detalle.Resultado !== 'A') {
        // A = Aprobado, R = Rechazado, O = Observado
        const observaciones = detalle.Observaciones?.Obs
          ? Array.isArray(detalle.Observaciones.Obs)
            ? detalle.Observaciones.Obs
            : [detalle.Observaciones.Obs]
          : [];

        return {
          success: false,
          resultado: detalle.Resultado,
          observaciones: observaciones.map((o: any) => ({ code: o.Code, msg: o.Msg })),
          error: observaciones.length > 0
            ? observaciones.map((o: any) => `${o.Code}: ${o.Msg}`).join(', ')
            : 'Comprobante rechazado',
        };
      }

      // Éxito - extraer CAE
      return {
        success: true,
        cae: detalle.CAE,
        caeVto: detalle.CAEFchVto,
        numeroComprobante,
        tipoComprobante,  // Agregar el tipo de comprobante
        fechaProceso: feResp.FeCabResp?.FchProceso,
        resultado: detalle.Resultado,
        observaciones: detalle.Observaciones?.Obs
          ? Array.isArray(detalle.Observaciones.Obs)
            ? detalle.Observaciones.Obs.map((o: any) => ({ code: o.Code, msg: o.Msg }))
            : [{ code: detalle.Observaciones.Obs.Code, msg: detalle.Observaciones.Obs.Msg }]
          : [],
      };
    } catch (error: any) {
      logger.error('Error parsing authorize response:', error.message);
      return {
        success: false,
        error: `Error al parsear respuesta: ${error.message}`,
      };
    }
  }

  /**
   * Validar estado del servidor de AFIP
   */
  async healthCheck(businessId: number, cuit: string): Promise<boolean> {
    try {
      const ta = await wsaaService.getTicketAcceso(businessId, 'wsfe');
      if (!ta) {
        return false;
      }

      const client = await this.getSoapClient();

      const [result] = await client.FEDummyAsync();

      return result.FEDummyResult?.AuthServer === 'OK' && result.FEDummyResult?.AppServer === 'OK';
    } catch (error: any) {
      logger.error('Health check failed:', error.message);
      return false;
    }
  }

  /**
   * Obtener puntos de venta autorizados en AFIP
   */
  async getPuntosVenta(businessId: number): Promise<any> {
    try {
      logger.info(`Getting puntos de venta for business ${businessId}`);

      // Obtener certificado
      const certInfo = await certificateService.getCertificateInfo(businessId);
      if (!certInfo) {
        throw new Error('Certificate not found for business');
      }

      // Obtener ticket de acceso
      const ta = await wsaaService.getTicketAcceso(businessId, 'wsfe');
      if (!ta) {
        throw new Error('Could not get ticket acceso');
      }

      const client = await this.getSoapClient();

      const request = {
        Auth: {
          Token: ta.token,
          Sign: ta.sign,
          Cuit: certInfo.cuit.replace(/[-\s]/g, ''),
        },
      };

      logger.info('Requesting puntos de venta from AFIP...');
      const [result] = await client.FEParamGetPtosVentaAsync(request);

      logger.info('AFIP puntos de venta response received');

      if (result && result.FEParamGetPtosVentaResult) {
        const resultGet = result.FEParamGetPtosVentaResult.ResultGet;
        const puntosVenta = resultGet?.PtoVenta || [];
        
        // Normalizar respuesta (puede venir como array o objeto único)
        const puntosArray = Array.isArray(puntosVenta) ? puntosVenta : [puntosVenta];
        
        logger.info(`Puntos de venta parsed: ${puntosArray.length} puntos encontrados`);
        
        return {
          success: true,
          data: puntosArray.map((pv: any) => ({
            numero: pv.Nro || pv.numero,
            descripcion: pv.Desc || pv.descripcion || null,
            direccion: pv.Direccion || pv.direccion || null,
            estado: pv.EmisionTipo || pv.estado || 'ACTIVO',
            bloqueado: pv.Bloqueado === 'S' || pv.bloqueado === 'S',
            fechaBaja: pv.FchBaja || pv.fechaBaja || null,
          })),
        };
      }

      return {
        success: false,
        error: 'No se pudieron obtener los puntos de venta',
      };
    } catch (error: any) {
      logger.error('Error getting puntos de venta:', error.message);
      return {
        success: false,
        error: error.message || 'Error al obtener puntos de venta de AFIP',
      };
    }
  }
}

// Singleton
export const wsfeService = new WSFEService();

