import { Request, Response } from 'express';
import logger from '../utils/logger';
import { wsfeService } from '../services/wsfe.service';
import { certificateService } from '../services/certificate.service';
import { padronService } from '../services/padron.service';
import * as wsaa from '../services/wsaa.service';
import { AfipAuthorizeRequest } from '../types/afip.types';

/**
 * Autorizar una factura en AFIP
 */
export async function authorizeInvoice(req: Request, res: Response) {
  try {
    const request: AfipAuthorizeRequest = req.body;

    logger.info(`[POST /afip/authorize] Business: ${request.businessId}, CUIT: ${request.cuit}`);

    // Validaciones básicas
    if (!request.businessId || !request.cuit || !request.puntoVenta) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: businessId, cuit, puntoVenta',
      });
    }

    // Verificar que existe certificado
    const certInfo = await certificateService.getCertificateInfo(request.businessId);
    if (!certInfo) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró certificado configurado para este negocio',
      });
    }

    // Autorizar en AFIP
    const result = await wsfeService.authorizeInvoice(request);

    if (result.success) {
      logger.info(`Invoice authorized successfully. CAE: ${result.cae}`);
      return res.json(result);
    } else {
      logger.warn(`Invoice authorization failed: ${result.error}`);
      return res.status(400).json(result);
    }
  } catch (error: any) {
    logger.error('Error in authorizeInvoice controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Generar nota de crédito
 */
export async function generateCreditNote(req: Request, res: Response) {
  try {
    const { originalInvoice, originalComprobanteInfo } = req.body;

    logger.info(`[POST /afip/credit-note] Business: ${originalInvoice.businessId}`);

    if (!originalInvoice || !originalComprobanteInfo) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: originalInvoice, originalComprobanteInfo',
      });
    }

    // Generar nota de crédito
    const result = await wsfeService.generateCreditNote(originalInvoice, originalComprobanteInfo);

    if (result.success) {
      logger.info(`Credit note generated successfully. CAE: ${result.cae}`);
      return res.json(result);
    } else {
      logger.warn(`Credit note generation failed: ${result.error}`);
      return res.status(400).json(result);
    }
  } catch (error: any) {
    logger.error('Error in generateCreditNote controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Obtener último número de comprobante autorizado
 */
export async function getLastVoucher(req: Request, res: Response) {
  try {
    const { businessId, cuit } = req.query;
    const { ptoVta, tipoComp } = req.params;

    logger.info(`[GET /afip/last-voucher] Business: ${businessId}, PtoVta: ${ptoVta}, Tipo: ${tipoComp}`);

    if (!businessId || !cuit || !ptoVta || !tipoComp) {
      return res.status(400).json({
        success: false,
        error: 'Faltan parámetros requeridos: businessId, cuit, ptoVta, tipoComp',
      });
    }

    const result = await wsfeService.getLastVoucher({
      businessId: parseInt(businessId as string),
      cuit: cuit as string,
      puntoVenta: parseInt(ptoVta),
      tipoComprobante: parseInt(tipoComp),
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Error in getLastVoucher controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Health check del servicio y conexión con AFIP
 */
export async function healthCheck(req: Request, res: Response) {
  try {
    const { businessId, cuit } = req.query;

    const health: any = {
      service: 'afip-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    // Si se proporciona businessId y cuit, verificar conexión con AFIP
    if (businessId && cuit) {
      const afipStatus = await wsfeService.healthCheck(
        parseInt(businessId as string),
        cuit as string
      );
      health.afipConnection = afipStatus ? 'ok' : 'error';
    }

    return res.json(health);
  } catch (error: any) {
    logger.error('Error in healthCheck controller:', error.message);
    return res.status(500).json({
      service: 'afip-service',
      status: 'error',
      error: error.message,
    });
  }
}

/**
 * Subir certificado
 */
export async function uploadCertificate(req: Request, res: Response) {
  try {
    const { businessId, cuit, password, pfxBase64 } = req.body;

    logger.info(`[POST /afip/certificate] Uploading certificate for business ${businessId}`);

    if (!businessId || !cuit || !pfxBase64) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: businessId, cuit, pfxBase64',
      });
    }

    // Decodificar base64
    const pfxBuffer = Buffer.from(pfxBase64, 'base64');

    // Guardar certificado
    const result = await certificateService.saveCertificateFromPfx(
      businessId,
      cuit,
      pfxBuffer,
      password || ''
    );

    if (result) {
      return res.json({
        success: true,
        message: 'Certificado guardado exitosamente',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Error al guardar el certificado',
      });
    }
  } catch (error: any) {
    logger.error('Error in uploadCertificate controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Generar CSR
 */
export async function generateCSR(req: Request, res: Response) {
  try {
    const { businessId, cuit, organizationName } = req.body;

    logger.info(`[POST /afip/generate-csr] Generating CSR for business ${businessId}`);

    if (!businessId || !cuit || !organizationName) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: businessId, cuit, organizationName',
      });
    }

    const csr = await certificateService.generateCSR(businessId, cuit, organizationName);

    if (csr) {
      return res.json({
        success: true,
        csr,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Error al generar CSR',
      });
    }
  } catch (error: any) {
    logger.error('Error in generateCSR controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
    });
  }
}

/**
 * Subir certificado desde archivo .crt (AFIP)
 */
export async function uploadCertificateFromCrt(req: Request, res: Response) {
  try {
    const { businessId, password, crtBase64, cuit } = req.body;

    logger.info(`[POST /afip/certificate-crt] Uploading CRT for business ${businessId}`);

    if (!businessId || !crtBase64) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: businessId, crtBase64',
      });
    }

    // Decodificar base64
    const crtBuffer = Buffer.from(crtBase64, 'base64');

    // Guardar certificado combinándolo con la clave privada existente
    // El CUIT se puede proporcionar manualmente o se intenta extraer del certificado
    const result = await certificateService.saveCertificateFromCrt(
      businessId,
      crtBuffer,
      password || 'geco-afip',
      cuit // Puede ser undefined si no se proporciona
    );

    if (result) {
      return res.json({
        success: true,
        message: 'Certificado guardado exitosamente. La clave privada se combinó automáticamente.',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Error al guardar el certificado',
      });
    }
  } catch (error: any) {
    logger.error('Error in uploadCertificateFromCrt controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}

/**
 * Subir certificado CRT con su clave privada KEY
 */
export async function uploadCertificateFromCrtKey(req: Request, res: Response) {
  try {
    const { businessId, password, crtBase64, keyBase64 } = req.body;

    logger.info(`[POST /afip/certificate-crt-key] Uploading CRT + KEY for business ${businessId}`);

    if (!businessId || !crtBase64 || !keyBase64) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos: businessId, crtBase64, keyBase64',
      });
    }

    // Decodificar base64
    const crtBuffer = Buffer.from(crtBase64, 'base64');
    const keyBuffer = Buffer.from(keyBase64, 'base64');

    // Guardar certificado con su clave privada
    // El CUIT se puede proporcionar manualmente o se intenta extraer del certificado
    const result = await certificateService.saveCertificateFromCrtKey(
      businessId,
      crtBuffer,
      keyBuffer,
      password || 'geco-afip'
    );

    if (result) {
      return res.json({
        success: true,
        message: 'Certificado y clave privada guardados exitosamente.',
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Error al guardar el certificado y clave privada',
      });
    }
  } catch (error: any) {
    logger.error('Error in uploadCertificateFromCrtKey controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}

/**
 * Consultar datos fiscales del padrón de AFIP
 */
export async function consultarPadron(req: Request, res: Response) {
  try {
    const { businessId, documento } = req.query;

    logger.info(`[GET /afip/padron] Business: ${businessId}, Documento: ${documento}`);

    if (!businessId || !documento) {
      return res.status(400).json({
        success: false,
        error: 'Faltan parámetros requeridos: businessId, documento',
      });
    }

    const businessIdNum = parseInt(businessId as string);
    const documentoStr = documento as string;
    const documentoLimpio = padronService.normalizarDocumento(documentoStr);

    // Detectar si es DNI o CUIT
    if (documentoLimpio.length === 8) {
      // DNI: devolver datos básicos sin consultar AFIP
      const result = await padronService.consultarDNI(documentoStr);
      return res.json(result);
    } else if (documentoLimpio.length === 11) {
      // CUIT: consultar en AFIP
      const result = await padronService.consultarPadron(businessIdNum, documentoStr);
      return res.json(result);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Formato de documento inválido. Debe ser DNI (8 dígitos) o CUIT (11 dígitos).',
      });
    }
  } catch (error: any) {
    logger.error('Error in consultarPadron controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}

/**
 * Limpiar cache de tickets WSAA
 * Útil cuando AFIP indica que ya existe un ticket y queremos forzar uno nuevo después de que expire
 */
export async function clearCache(req: Request, res: Response) {
  try {
    const { businessId, service } = req.query;

    logger.info(`[DELETE /afip/cache] Clearing cache for business: ${businessId}, service: ${service}`);

    const wsaaService = new wsaa.WSAAService();
    
    if (businessId && service) {
      wsaaService.clearCache(parseInt(businessId as string), service as string);
      return res.json({
        success: true,
        message: `Cache cleared for business ${businessId}, service ${service}`,
      });
    } else if (businessId) {
      wsaaService.clearCache(parseInt(businessId as string));
      return res.json({
        success: true,
        message: `All cache cleared for business ${businessId}`,
      });
    } else {
      wsaaService.clearCache();
      return res.json({
        success: true,
        message: 'All cache cleared',
      });
    }
  } catch (error: any) {
    logger.error('Error in clearCache controller:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error clearing cache',
    });
  }
}

/**
 * Obtener puntos de venta autorizados en AFIP
 */
export async function getPuntosVenta(req: Request, res: Response) {
  try {
    const { businessId } = req.query;

    logger.info(`[GET /afip/puntos-venta] Business: ${businessId}`);

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'businessId es requerido',
      });
    }

    const result = await wsfeService.getPuntosVenta(parseInt(businessId as string));
    return res.json(result);
  } catch (error: any) {
    logger.error('Error in getPuntosVenta controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}

/**
 * Obtener información del certificado
 */
export async function getCertificateInfo(req: Request, res: Response) {
  try {
    // Obtener businessId del query, body o del middleware
    const businessId = req.query.businessId || req.body?.businessId || (req as any).businessId;

    logger.info(`[GET /afip/certificate-info] Business: ${businessId}`);

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'businessId es requerido',
      });
    }

    const businessIdNum = typeof businessId === 'number' ? businessId : parseInt(businessId as string);
    const certInfo = await certificateService.getCertificateInfo(businessIdNum);
    
    if (!certInfo) {
      return res.json({
        success: false,
        exists: false,
        error: 'No hay certificado registrado',
      });
    }

    return res.json({
      success: true,
      exists: true,
      data: certInfo,
    });
  } catch (error: any) {
    logger.error('Error in getCertificateInfo controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}

/**
 * Eliminar certificado
 */
export async function deleteCertificate(req: Request, res: Response) {
  try {
    const { businessId } = req.body;

    logger.info(`[DELETE /afip/certificate] Business: ${businessId}`);

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'businessId es requerido',
      });
    }

    // Eliminar directorio completo del certificado
    const fs = require('fs');
    const path = require('path');
    const config = require('../config/config').default;
    
    const certDir = path.join(config.certsPath, businessId.toString());
    
    logger.info(`[DELETE] Looking for certificate directory: ${certDir}`);
    
    if (fs.existsSync(certDir)) {
      // Eliminar todos los archivos del directorio
      const files = fs.readdirSync(certDir);
      for (const file of files) {
        const filePath = path.join(certDir, file);
        fs.unlinkSync(filePath);
        logger.info(`[DELETE] Deleted file: ${filePath}`);
      }
      
      // Eliminar el directorio
      fs.rmdirSync(certDir);
      logger.info(`[DELETE] Deleted directory: ${certDir}`);
      
      return res.json({
        success: true,
        message: 'Certificado y clave privada eliminados correctamente',
      });
    } else {
      logger.warn(`No certificate directory found for business ${businessId}`);
      return res.json({
        success: true,
        message: 'No se encontraron archivos de certificado (ya estaba eliminado)',
      });
    }
  } catch (error: any) {
    logger.error('Error in deleteCertificate controller:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error interno del servidor',
    });
  }
}