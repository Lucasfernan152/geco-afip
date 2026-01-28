import * as soap from 'soap';
import { wsaaService } from './wsaa.service';
import { certificateService } from './certificate.service';
import logger from '../utils/logger';
import config from '../config/config';

/**
 * Servicio para consultar el Padrón de AFIP (ws_sr_padron_a5)
 * Permite obtener datos de contribuyentes por CUIT/CUIL
 */

export interface PadronPersona {
  success: boolean;
  data?: {
    razonSocial: string;
    domicilio: string;
    condicionIVA: string;
    tipoDocumento: string;
    numeroDocumento: string;
    provincia?: string;
    localidad?: string;
    codigoPostal?: string;
  };
  error?: string;
}

/**
 * Mapea el código de IVA de AFIP a texto legible
 */
function mapearCondicionIVA(codigo: number): string {
  const condiciones: { [key: number]: string } = {
    1: 'Responsable Inscripto',
    2: 'Responsable No Inscripto',
    3: 'No Responsable',
    4: 'Exento',
    5: 'Consumidor Final',
    6: 'Responsable Monotributo',
    9: 'IVA Sujeto No Categorizado',
    10: 'IVA Liberado - Ley 19.640',
    11: 'IVA Responsable Inscripto - Agente de Percepción',
    12: 'Pequeño Contribuyente Eventual',
    13: 'Monotributista Social',
  };

  return condiciones[codigo] || `Código ${codigo}`;
}

/**
 * Normaliza un CUIT/CUIL/DNI
 */
function normalizarDocumento(documento: string): string {
  return documento.replace(/[-\s]/g, '');
}

/**
 * Valida formato de CUIT/CUIL
 */
function validarCUIT(cuit: string): boolean {
  const cuitLimpio = normalizarDocumento(cuit);

  if (cuitLimpio.length !== 11 || !/^\d+$/.test(cuitLimpio)) {
    return false;
  }

  // Validar dígito verificador
  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitos = cuitLimpio.split('').map(Number);
  const digitoVerificador = digitos[10];

  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += digitos[i] * multiplicadores[i];
  }

  const resto = suma % 11;
  const resultado = 11 - resto;

  if (resultado === 11) {
    return digitoVerificador === 0;
  } else if (resultado === 10) {
    return digitoVerificador === 9;
  } else {
    return digitoVerificador === resultado;
  }
}

/**
 * Consulta el padrón de AFIP usando el servicio ws_sr_padron_a5
 * Requiere autenticación WSAA previa
 */
export async function consultarPadron(businessId: number, cuit: string): Promise<PadronPersona> {
  try {
    const cuitLimpio = normalizarDocumento(cuit);

    logger.info(`Consultando padrón AFIP para CUIT: ${cuitLimpio}, business: ${businessId}`);

    // Validar formato de CUIT
    if (!validarCUIT(cuitLimpio)) {
      return {
        success: false,
        error: 'CUIT inválido. Debe tener 11 dígitos y dígito verificador correcto.',
      };
    }

    // Obtener información del certificado para obtener el CUIT del business
    const certInfo = await certificateService.getCertificateInfo(businessId);
    if (!certInfo || !certInfo.cuit) {
      return {
        success: false,
        error: 'No se encontró certificado para el negocio',
      };
    }

    const cuitCertificado = certInfo.cuit.replace(/[-\s]/g, ''); // CUIT del certificado
    logger.info(`CUIT del certificado: ${cuitCertificado}, consultando: ${cuitLimpio}`);

    // Obtener ticket de acceso (TA) para el servicio de padrón
    const ta = await wsaaService.getTicketAcceso(businessId, 'ws_sr_padron_a5');

    if (!ta || !ta.token || !ta.sign) {
      return {
        success: false,
        error:
          'No se pudo obtener ticket de acceso de AFIP. Verifique que el certificado esté configurado correctamente.',
      };
    }

    // URL del servicio según ambiente
    const wsdlUrl =
      config.environment === 'produccion'
        ? 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL'
        : 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL';

    logger.info(`Conectando a WSDL de padrón: ${wsdlUrl}`);

    // Crear cliente SOAP
    const client = await soap.createClientAsync(wsdlUrl, {
      disableCache: true,
    });

    // Preparar request
    const request = {
      token: ta.token,
      sign: ta.sign,
      cuitRepresentada: cuitCertificado, // CUIT del certificado (quien hace la consulta)
      idPersona: cuitLimpio, // CUIT a consultar
    };

    logger.info('Enviando request a AFIP padrón...');

    // Llamar al servicio
    const [result] = await client.getPersonaAsync(request);

    logger.info('Respuesta recibida de AFIP padrón');

    // LOG: Mostrar respuesta completa para debugging
    logger.info('Respuesta COMPLETA de AFIP:', JSON.stringify(result, null, 2).substring(0, 2000));

    // Verificar respuesta
    if (!result || !result.personaReturn) {
      logger.warn('Sin datos en respuesta de AFIP');
      return {
        success: false,
        error: 'No se encontraron datos para el CUIT ingresado',
      };
    }

    const persona = result.personaReturn.datosGenerales || result.personaReturn;
    logger.info(
      'Datos de persona (datosGenerales):',
      JSON.stringify(persona, null, 2).substring(0, 1000)
    );

    // Parsear datos
    logger.info('persona.razonSocial:', persona.razonSocial);
    logger.info('persona.nombre:', persona.nombre);
    logger.info(
      'persona.domicilioFiscal:',
      persona.domicilioFiscal ? JSON.stringify(persona.domicilioFiscal).substring(0, 200) : 'N/A'
    );
    logger.info(
      'persona.impuesto:',
      persona.impuesto ? JSON.stringify(persona.impuesto).substring(0, 300) : 'N/A'
    );

    const datos: PadronPersona['data'] = {
      razonSocial: persona.razonSocial || persona.nombre || '',
      domicilio: '',
      condicionIVA: '',
      tipoDocumento: 'CUIT',
      numeroDocumento: cuitLimpio,
      provincia: '',
      localidad: '',
      codigoPostal: '',
    };

    // Construir domicilio
    if (persona.domicilioFiscal) {
      const dom = persona.domicilioFiscal;
      const partes: string[] = [];

      if (dom.direccion) partes.push(dom.direccion);
      if (dom.localidad) {
        partes.push(dom.localidad);
        datos.localidad = dom.localidad;
      }
      // AFIP puede devolver descripcionProvincia o desc_provincia
      const provincia = dom.descripcionProvincia || dom.descProvicia || dom.desc_provincia;
      if (provincia) {
        partes.push(provincia);
        datos.provincia = provincia;
      }
      if (dom.codPostal || dom.cod_postal) {
        const cp = dom.codPostal || dom.cod_postal;
        partes.push(`(${cp})`);
        datos.codigoPostal = cp;
      }

      datos.domicilio = partes.join(', ');
    }

    // Obtener condición IVA (impuesto 30 = IVA)
    // AFIP devuelve el impuesto en datosRegimenGeneral.impuesto
    const impuestos = result.personaReturn.datosRegimenGeneral?.impuesto || persona.impuestos || [];
    if (Array.isArray(impuestos)) {
      const iva = impuestos.find((imp: any) => imp.idImpuesto === 30);
      if (iva && iva.descripcionImpuesto) {
        datos.condicionIVA = iva.descripcionImpuesto;
      }
    }

    // Si no se encontró IVA en impuestos, intentar por estado
    if (!datos.condicionIVA && persona.estadoClave) {
      // Estado puede indicar si es monotributista, RI, etc.
      if (persona.estadoClave === 'ACTIVO') {
        datos.condicionIVA = 'Responsable Inscripto';
      }
    }

    // Fallback si no se encontró condición IVA
    if (!datos.condicionIVA) {
      datos.condicionIVA = 'No especificado';
    }

    // Verificar si AFIP devolvió datos vacíos
    if (!datos.razonSocial && !datos.domicilio) {
      logger.warn(`AFIP devolvió datos vacíos para ${cuitLimpio}`);
      return {
        success: false,
        error:
          'El CUIT no tiene datos registrados en el padrón de AFIP o tiene pendiente la constitución del domicilio fiscal electrónico.',
      };
    }

    logger.info(`Datos obtenidos exitosamente para ${cuitLimpio}: ${datos.razonSocial}`);

    return {
      success: true,
      data: datos,
    };
  } catch (error: any) {
    logger.error('Error consultando padrón AFIP:', error.message);

    // Parsear errores específicos de AFIP
    if (error.message && error.message.includes('No autorizado')) {
      return {
        success: false,
        error:
          'No está autorizado para consultar el padrón. Verifique que el servicio ws_sr_padron_a5 esté habilitado en AFIP.',
      };
    }

    if (error.message && error.message.includes('No existe')) {
      return {
        success: false,
        error: 'CUIT no encontrado en el padrón de AFIP',
      };
    }

    return {
      success: false,
      error: `Error al consultar AFIP: ${error.message}`,
    };
  }
}

/**
 * Para DNI (8 dígitos), devuelve datos básicos sin consultar AFIP
 */
export async function consultarDNI(dni: string): Promise<PadronPersona> {
  const dniLimpio = normalizarDocumento(dni);

  if (dniLimpio.length !== 8 || !/^\d+$/.test(dniLimpio)) {
    return {
      success: false,
      error: 'DNI inválido. Debe tener 8 dígitos.',
    };
  }

  return {
    success: true,
    data: {
      razonSocial: '', // No disponible para DNI
      domicilio: '',
      condicionIVA: 'Consumidor Final',
      tipoDocumento: 'DNI',
      numeroDocumento: dniLimpio,
    },
  };
}

export const padronService = {
  consultarPadron,
  consultarDNI,
  validarCUIT,
  normalizarDocumento,
};
