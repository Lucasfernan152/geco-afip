import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import config from './config/config';
import logger from './utils/logger';
import * as invoiceController from './controllers/invoice.controller';
import { authenticateApiKey, validateBusinessId } from './middlewares/auth.middleware';
import fs from 'fs';
import path from 'path';

const app: Express = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check (público - no requiere autenticación)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    service: 'afip-service',
    status: 'ok',
    environment: config.environment,
    timestamp: new Date().toISOString(),
  });
});

// Aplicar autenticación a todas las rutas de AFIP (excepto health checks)
app.use('/afip', authenticateApiKey);

// AFIP Routes (todas protegidas con API key)
app.post('/afip/authorize', validateBusinessId, invoiceController.authorizeInvoice);
app.post('/afip/credit-note', validateBusinessId, invoiceController.generateCreditNote);
app.get('/afip/last-voucher/:ptoVta/:tipoComp', validateBusinessId, invoiceController.getLastVoucher);
app.get('/afip/health', validateBusinessId, invoiceController.healthCheck);
app.post('/afip/certificate', validateBusinessId, invoiceController.uploadCertificate);
app.post('/afip/certificate-crt', validateBusinessId, invoiceController.uploadCertificateFromCrt);
app.post('/afip/certificate-crt-key', validateBusinessId, invoiceController.uploadCertificateFromCrtKey);
app.get('/afip/certificate-info', validateBusinessId, invoiceController.getCertificateInfo);
app.delete('/afip/certificate', validateBusinessId, invoiceController.deleteCertificate);
app.post('/afip/generate-csr', validateBusinessId, invoiceController.generateCSR);
app.get('/afip/padron', validateBusinessId, invoiceController.consultarPadron);
app.get('/afip/puntos-venta', validateBusinessId, invoiceController.getPuntosVenta);
app.delete('/afip/cache', validateBusinessId, invoiceController.clearCache);

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
  });
});

// Crear directorios necesarios
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

if (!fs.existsSync(config.certsPath)) {
  fs.mkdirSync(config.certsPath, { recursive: true });
}

// Iniciar servidor
app.listen(config.port, () => {
  logger.info('='.repeat(60));
  logger.info(`🚀 AFIP Microservice started`);
  logger.info(`📡 Port: ${config.port}`);
  logger.info(`🌍 Environment: ${config.environment}`);
  logger.info(`🔐 WSAA URL: ${config.wsaaUrl}`);
  logger.info(`📄 WSFE URL: ${config.wsfeUrl}`);
  logger.info(`📁 Certs path: ${config.certsPath}`);
  logger.info(`🔑 API Key configured: ${config.apiKey ? 'Yes (length: ' + config.apiKey.length + ')' : 'No - WARNING!'}`);
  logger.info('='.repeat(60));
});

export default app;

