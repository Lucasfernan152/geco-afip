import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
const rootDir = path.resolve(__dirname, '../..');
const envPath = path.join(rootDir, '.env');
dotenv.config({ path: envPath });

export interface AfipConfig {
  port: number;
  environment: 'homologacion' | 'produccion';
  wsaaUrl: string;
  wsfeUrl: string;
  mainAppUrl: string;
  logLevel: string;
  certsPath: string;
  apiKey: string; // API Key para autenticar requests del backend principal
}

const isProduction = process.env.AFIP_ENVIRONMENT === 'produccion';

// Generar API key por defecto si no existe (solo para desarrollo)
const defaultApiKey =
  process.env.AFIP_API_KEY ||
  (() => {
    const generatedKey = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    console.warn(
      `⚠️  No se encontró AFIP_API_KEY en variables de entorno. Usando clave temporal: ${generatedKey}`
    );
    console.warn(
      `⚠️  En producción, DEBES configurar una API key segura en las variables de entorno.`
    );
    return generatedKey;
  })();

const config: AfipConfig = {
  port: parseInt(process.env.PORT || '5002', 10),
  environment: isProduction ? 'produccion' : 'homologacion',

  // URLs según ambiente
  wsaaUrl: isProduction
    ? process.env.AFIP_WSAA_URL_PRODUCCION || 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
    : process.env.AFIP_WSAA_URL_HOMOLOGACION || 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',

  wsfeUrl: isProduction
    ? process.env.AFIP_WSFE_URL_PRODUCCION ||
      'https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL'
    : process.env.AFIP_WSFE_URL_HOMOLOGACION ||
      'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',

  mainAppUrl: process.env.MAIN_APP_URL || 'http://localhost:5001',
  logLevel: process.env.LOG_LEVEL || 'info',
  certsPath: path.join(__dirname, '../../certs'),
  apiKey: defaultApiKey,
};

export default config;
