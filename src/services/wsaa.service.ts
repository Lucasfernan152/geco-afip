import forge from 'node-forge';
import axios from 'axios';
import { create as createXml } from 'xmlbuilder2';
import { XMLParser } from 'fast-xml-parser';
import config from '../config/config';
import logger from '../utils/logger';
import { certificateService } from './certificate.service';
import { TicketAcceso } from '../types/afip.types';
import fs from 'fs';
import path from 'path';

/**
 * Servicio WSAA - Web Service de Autenticación y Autorización de AFIP
 * Genera y gestiona tokens de acceso para consumir servicios de AFIP
 */
export class WSAAService {
  private ticketCache: Map<string, TicketAcceso> = new Map();
  private cacheDir = path.join(__dirname, '../../cache');

  /**
   * Obtener ticket de acceso (TA) válido para un business
   * Busca primero en memoria, luego en disco, y solo pide uno nuevo si no existe
   */
  async getTicketAcceso(
    businessId: number,
    service: string = 'wsfe'
  ): Promise<TicketAcceso | null> {
    try {
      const cacheKey = `${businessId}_${service}`;
      const cacheFile = path.join(this.cacheDir, `ta_${cacheKey}.json`);

      // 1. Verificar cache en memoria
      if (this.ticketCache.has(cacheKey)) {
        const cached = this.ticketCache.get(cacheKey)!;
        if (this.isTicketValid(cached)) {
          logger.debug(
            `Using cached TA from memory for business ${businessId}, service ${service}`
          );
          return cached;
        }
        // Si expiró, remover del cache
        this.ticketCache.delete(cacheKey);
        logger.info(`TA expired in memory for business ${businessId}`);
      }

      // 2. Intentar cargar desde disco
      if (fs.existsSync(cacheFile)) {
        try {
          const fileContent = fs.readFileSync(cacheFile, 'utf-8');
          const cached = JSON.parse(fileContent);

          // Reconstruir objetos Date
          cached.generationTime = new Date(cached.generationTime);
          cached.expirationTime = new Date(cached.expirationTime);

          if (this.isTicketValid(cached)) {
            logger.info(
              `✓ TA recuperado desde cache de disco para business ${businessId}, service ${service}`
            );
            logger.debug(`TA expires at: ${cached.expirationTime.toISOString()}`);
            this.ticketCache.set(cacheKey, cached);
            return cached;
          }

          // Si expiró, eliminar archivo
          logger.info(`TA expired on disk for business ${businessId}, deleting cache file`);
          fs.unlinkSync(cacheFile);
        } catch (error: any) {
          logger.warn(`Error reading TA cache file: ${error.message}`);
          // Continuar para obtener uno nuevo
        }
      }

      // 3. Obtener nuevo ticket solo si no existe uno válido
      logger.info(
        `No valid TA found, requesting new one for business ${businessId}, service ${service}`
      );
      const ticket = await this.requestTicketAcceso(businessId, service);

      if (ticket) {
        // Guardar en memoria
        this.ticketCache.set(cacheKey, ticket);

        // Guardar en disco
        try {
          if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
          }
          fs.writeFileSync(cacheFile, JSON.stringify(ticket, null, 2));
          logger.info(`✓ TA guardado en cache de disco: ${cacheFile}`);
        } catch (error: any) {
          logger.warn(`Error saving TA cache file: ${error.message}`);
          // No es crítico, el ticket está en memoria
        }
      }

      return ticket;
    } catch (error: any) {
      logger.error(`Error getting ticket acceso for business ${businessId}:`, error.message);
      return null;
    }
  }

  /**
   * Verificar si un ticket es válido (con 5 minutos de margen de seguridad)
   */
  private isTicketValid(ticket: TicketAcceso): boolean {
    const now = new Date();
    const expirationWithMargin = new Date(ticket.expirationTime.getTime() - 5 * 60 * 1000);
    return expirationWithMargin > now;
  }

  /**
   * Solicitar nuevo ticket de acceso a AFIP
   */
  private async requestTicketAcceso(
    businessId: number,
    service: string
  ): Promise<TicketAcceso | null> {
    try {
      logger.info(`Requesting new TA for business ${businessId}, service ${service}`);

      // Obtener certificado
      const certInfo = await certificateService.getCertificateInfo(businessId);
      if (!certInfo) {
        throw new Error(`No certificate found for business ${businessId}`);
      }

      // Generar TRA (Ticket de Requerimiento de Acceso)
      const tra = this.generateTRA(service);

      // Firmar TRA
      const cms = this.signTRA(tra, certInfo.certPath, certInfo.keyPath);

      // Enviar a AFIP
      const response = await this.sendToAFIP(cms);

      // Parsear respuesta
      const ticket = this.parseResponse(response);

      logger.info(`TA obtained successfully for business ${businessId}`);
      logger.debug(`TA expires at: ${ticket.expirationTime.toISOString()}`);

      return ticket;
    } catch (error: any) {
      logger.error(`Error requesting ticket acceso for business ${businessId}:`, error.message);
      return null;
    }
  }

  /**
   * Generar TRA (Ticket de Requerimiento de Acceso)
   */
  private generateTRA(service: string): string {
    const now = new Date();
    const uniqueId = Math.floor(now.getTime() / 1000);

    // Fecha de generación (ahora)
    const generationTime = now.toISOString();

    // Fecha de expiración (12 horas después)
    const expirationTime = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    const tra = createXml({ version: '1.0', encoding: 'UTF-8' })
      .ele('loginTicketRequest', { version: '1.0' })
      .ele('header')
      .ele('uniqueId')
      .txt(uniqueId.toString())
      .up()
      .ele('generationTime')
      .txt(generationTime)
      .up()
      .ele('expirationTime')
      .txt(expirationTime)
      .up()
      .up()
      .ele('service')
      .txt(service)
      .up()
      .up()
      .end({ prettyPrint: true });

    logger.debug('TRA generated:', tra);
    return tra;
  }

  /**
   * Firmar TRA con certificado digital
   */
  private signTRA(tra: string, certPath: string, keyPath: string): string {
    try {
      // Leer certificado y clave privada
      const certPem = certificateService.readCertificate(certPath);
      const keyPem = certificateService.readPrivateKey(keyPath);

      // Convertir a objetos forge
      const cert = forge.pki.certificateFromPem(certPem);
      const privateKey = forge.pki.privateKeyFromPem(keyPem);

      // Crear mensaje PKCS#7
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(tra, 'utf8');

      p7.addCertificate(cert);
      p7.addSigner({
        key: privateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data,
          },
          {
            type: forge.pki.oids.messageDigest,
          },
          {
            type: forge.pki.oids.signingTime,
            // @ts-expect-error - forge types incorrectos, acepta Date object
            value: new Date(),
          },
        ],
      });

      // Firmar
      p7.sign();

      // Convertir a DER y luego a base64
      const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const cms = forge.util.encode64(der);

      return cms;
    } catch (error: any) {
      logger.error('Error signing TRA:', error.message);
      throw error;
    }
  }

  /**
   * Enviar CMS firmado a AFIP
   */
  private async sendToAFIP(cms: string): Promise<string> {
    try {
      const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

      logger.debug('Sending request to AFIP WSAA:', config.wsaaUrl);

      const response = await axios.post(config.wsaaUrl, soapRequest, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '',
        },
        timeout: 30000, // 30 segundos
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        const responseData =
          typeof error.response.data === 'string'
            ? error.response.data.substring(0, 1000)
            : JSON.stringify(error.response.data).substring(0, 1000);
        logger.error('AFIP WSAA HTTP error:', error.response.status, responseData);

        // Detectar error de ticket ya existente
        if (
          responseData.includes('alreadyAuthenticated') ||
          responseData.includes('ya posee un TA valido')
        ) {
          logger.warn(
            '⚠️  AFIP indicates TA already exists on their server (cached for up to 12 hours).'
          );
          logger.info(
            '💡 Note: The existing TA on AFIP server is not accessible to us. This is a limitation of AFIP homologation environment.'
          );
          throw new Error(
            'AFIP ya tiene un ticket válido cacheado en su servidor. Expirará en máximo 12 horas desde su creación.'
          );
        }

        throw new Error(
          `AFIP WSAA HTTP error: ${error.response.status} - ${error.response.statusText}`
        );
      }
      throw error;
    }
  }

  /**
   * Parsear respuesta de AFIP y extraer token, sign y expirationTime
   */
  private parseResponse(xmlResponse: string): TicketAcceso {
    try {
      // Log para debug en caso de error
      logger.debug('AFIP WSAA raw response:', xmlResponse.substring(0, 500));

      const parser = new XMLParser({
        ignoreAttributes: false,
        parseTagValue: true,
      });

      const result = parser.parse(xmlResponse);

      // Navegar por la estructura SOAP
      const body =
        result['soap:Envelope']?.[' soap:Body'] ||
        result['soapenv:Envelope']?.['soapenv:Body'] ||
        result['env:Envelope']?.['env:Body'];

      if (!body) {
        throw new Error('Invalid SOAP response structure');
      }

      const loginResponse = body['loginCmsResponse'] || body['ns1:loginCmsResponse'];

      if (!loginResponse) {
        // Verificar si hay un fault
        const fault = body['soap:Fault'] || body['soapenv:Fault'] || body['env:Fault'];
        if (fault) {
          const faultCode = fault.faultcode || fault['faultcode'] || '';
          const faultString = fault.faultstring || fault['faultstring'] || 'Unknown error';
          const faultDetail = fault.detail || fault['detail'] || '';

          // Crear mensaje de error más descriptivo
          let errorMsg = `AFIP WSAA Fault: ${faultString}`;

          // Detectar errores comunes
          if (
            faultCode.includes('cms.cert.untrusted') ||
            faultString.includes('Certificado no emitido')
          ) {
            errorMsg =
              '❌ Certificado no confiable. Posibles causas:\n' +
              '• El certificado no fue emitido por AFIP\n' +
              '• Estás usando un certificado de homologación en producción (o viceversa)\n' +
              '• El certificado no está firmado correctamente\n' +
              'Solución: Verifica que el ambiente (.env) coincida con el certificado';
          } else if (faultString.includes('expired') || faultString.includes('expirado')) {
            errorMsg =
              '❌ Certificado expirado. Debes generar un nuevo CSR y solicitar nuevo certificado en AFIP.';
          }

          logger.error('AFIP Fault details:', { faultCode, faultString, faultDetail });
          throw new Error(errorMsg);
        }
        throw new Error('No loginCmsResponse in SOAP response');
      }

      const loginReturn = loginResponse['loginCmsReturn'] || loginResponse['ns1:loginCmsReturn'];

      if (!loginReturn) {
        throw new Error('No loginCmsReturn in response');
      }

      // Parsear el XML interno (loginReturn contiene otro XML)
      const taXml =
        typeof loginReturn === 'string' ? loginReturn : loginReturn['#text'] || loginReturn;
      const taResult = parser.parse(taXml);

      const credentials = taResult['loginTicketResponse']?.['credentials'];

      if (!credentials) {
        throw new Error('No credentials in TA response');
      }

      const token = credentials['token'];
      const sign = credentials['sign'];
      const expirationTimeStr = taResult['loginTicketResponse']?.['header']?.['expirationTime'];

      if (!token || !sign || !expirationTimeStr) {
        throw new Error('Missing token, sign or expirationTime in TA');
      }

      const expirationTime = new Date(expirationTimeStr);

      return {
        token,
        sign,
        expirationTime,
      };
    } catch (error: any) {
      logger.error('Error parsing WSAA response:', error.message);
      logger.debug('Response XML:', xmlResponse);
      throw error;
    }
  }

  /**
   * Limpiar cache de tickets (memoria y disco)
   */
  clearCache(businessId?: number, service?: string): void {
    if (businessId && service) {
      const cacheKey = `${businessId}_${service}`;
      const cacheFile = path.join(this.cacheDir, `ta_${cacheKey}.json`);

      // Limpiar de memoria
      this.ticketCache.delete(cacheKey);

      // Limpiar de disco
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        logger.info(
          `✓ Cleared TA cache (memory + disk) for business ${businessId}, service ${service}`
        );
      } else {
        logger.info(`✓ Cleared TA cache (memory) for business ${businessId}, service ${service}`);
      }
    } else if (businessId) {
      // Limpiar todos los servicios de un business
      const keysToDelete: string[] = [];
      this.ticketCache.forEach((_, key) => {
        if (key.startsWith(`${businessId}_`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => {
        this.ticketCache.delete(key);
        const cacheFile = path.join(this.cacheDir, `ta_${key}.json`);
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
        }
      });
      logger.info(`✓ Cleared all TA cache (memory + disk) for business ${businessId}`);
    } else {
      // Limpiar todo
      this.ticketCache.clear();

      // Limpiar todos los archivos del directorio cache
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        files.forEach((file) => {
          if (file.startsWith('ta_') && file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file));
          }
        });
      }
      logger.info('✓ Cleared all TA cache (memory + disk)');
    }
  }
}

// Singleton
export const wsaaService = new WSAAService();
