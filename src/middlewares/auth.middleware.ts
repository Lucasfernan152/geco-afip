import { Request, Response, NextFunction } from 'express';
import config from '../config/config';
import logger from '../utils/logger';

/**
 * Middleware de autenticación para validar API Key
 * Solo permite requests del backend principal con API key válido
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    // Obtener API key del header
    const apiKey = req.headers['x-api-key'] as string;

    // Verificar que existe
    if (!apiKey) {
      logger.warn(`[Auth] Request sin API key desde ${req.ip} a ${req.path}`);
      return res.status(401).json({
        success: false,
        error: 'API key no proporcionado',
      });
    }

    // Verificar que coincide con el configurado
    if (apiKey !== config.apiKey) {
      logger.warn(`[Auth] API key inválido desde ${req.ip} a ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'API key inválido',
      });
    }

    // API key válido, continuar
    logger.debug(`[Auth] API key válido para ${req.path}`);
    next();
  } catch (error: any) {
    logger.error('[Auth] Error en middleware de autenticación:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Error de autenticación',
    });
  }
}

/**
 * Middleware para validar que el businessId en el request corresponde
 * al usuario autenticado (se usa junto con authenticateApiKey)
 */
export function validateBusinessId(req: Request, res: Response, next: NextFunction) {
  try {
    // Obtener businessId del body o query (con optional chaining para evitar errores)
    const businessId = req.query?.businessId || req.body?.businessId;

    if (!businessId) {
      logger.warn(`[Auth] Request sin businessId desde ${req.ip} a ${req.path}`);
      return res.status(400).json({
        success: false,
        error: 'businessId no proporcionado',
      });
    }

    // Validar que sea un número
    const businessIdNum =
      typeof businessId === 'number' ? businessId : parseInt(businessId as string);
    if (isNaN(businessIdNum) || businessIdNum <= 0) {
      logger.warn(`[Auth] businessId inválido: ${businessId} desde ${req.ip}`);
      return res.status(400).json({
        success: false,
        error: 'businessId inválido',
      });
    }

    // Guardar en req para uso posterior
    (req as any).businessId = businessIdNum;

    logger.debug(`[Auth] businessId validado: ${businessIdNum}`);
    next();
  } catch (error: any) {
    const errorMsg = error?.message || 'Error desconocido';
    logger.error(`[Auth] Error validando businessId: ${errorMsg}`);
    return res.status(500).json({
      success: false,
      error: 'Error de validación',
    });
  }
}
