/**
 * Tipos de datos para AFIP
 */

// Tipos de comprobante según AFIP
export enum TipoComprobante {
  FACTURA_A = 1,
  NOTA_DEBITO_A = 2,
  NOTA_CREDITO_A = 3,
  FACTURA_B = 6,
  NOTA_DEBITO_B = 7,
  NOTA_CREDITO_B = 8,
  FACTURA_C = 11,
  NOTA_DEBITO_C = 12,
  NOTA_CREDITO_C = 13,
}

// Tipos de documento
export enum TipoDocumento {
  CUIT = 80,
  CUIL = 86,
  CDI = 87,
  LE = 89,
  LC = 90,
  CI_EXTRANJERA = 91,
  EN_TRAMITE = 92,
  ACTA_NACIMIENTO = 93,
  CI_BS_AS_RNP = 95,
  DNI = 96,
  PASAPORTE = 94,
  CI_POLICIA_FEDERAL = 0,
  CI_BUENOS_AIRES = 1,
  CI_CATAMARCA = 2,
  CI_CORDOBA = 3,
  CI_CORRIENTES = 4,
  CI_ENTRE_RIOS = 5,
  CI_JUJUY = 6,
  CI_MENDOZA = 7,
  CI_LA_RIOJA = 8,
  CI_SALTA = 9,
  CI_SAN_JUAN = 10,
  CI_SAN_LUIS = 11,
  CI_SANTA_FE = 12,
  CI_SANTIAGO_DEL_ESTERO = 13,
  CI_TUCUMAN = 14,
  CI_CHACO = 16,
  CI_CHUBUT = 17,
  CI_FORMOSA = 18,
  CI_MISIONES = 19,
  CI_NEUQUEN = 20,
  CI_LA_PAMPA = 21,
  CI_RIO_NEGRO = 22,
  CI_SANTA_CRUZ = 23,
  CI_TIERRA_DEL_FUEGO = 24,
}

// Tipos de concepto
export enum TipoConcepto {
  PRODUCTOS = 1,
  SERVICIOS = 2,
  PRODUCTOS_Y_SERVICIOS = 3,
}

// Tipos de IVA
export enum TipoIVA {
  IVA_0 = 3,
  IVA_10_5 = 4,
  IVA_21 = 5,
  IVA_27 = 6,
  IVA_5 = 8,
  IVA_2_5 = 9,
  EXENTO = 1,
  NO_GRAVADO = 2,
}

// Condición IVA
export enum CondicionIVA {
  RESPONSABLE_INSCRIPTO = 'responsable_inscripto',
  MONOTRIBUTO = 'monotributo',
  EXENTO = 'exento',
  CONSUMIDOR_FINAL = 'consumidor_final',
  RESPONSABLE_NO_INSCRIPTO = 'responsable_no_inscripto',
}

// Request para autorizar factura
export interface AfipAuthorizeRequest {
  businessId: number;
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
  concepto: number;
  
  // Datos del cliente
  tipoDocumento: number;
  numeroDocumento: string;
  condicionIVA: number; // Condición IVA del receptor (obligatorio según RG 5616)
  
  // Fechas (formato YYYYMMDD)
  fechaComprobante: string;
  fechaServicioDesde?: string;
  fechaServicioHasta?: string;
  fechaVencimientoPago?: string;
  
  // Importes
  importeTotal: number;
  importeNeto: number;
  importeExento: number;
  importeIVA: number;
  importeTributos: number;
  
  // Detalle IVA
  iva?: Array<{
    baseImponible: number;
    importe: number;
    id: number; // Tipo de IVA según enum
  }>;
  
  // Otros tributos (opcional)
  tributos?: Array<{
    id: number;
    descripcion: string;
    baseImponible: number;
    alicuota: number;
    importe: number;
  }>;
  
  // Comprobantes asociados (para notas de crédito)
  comprobantesAsociados?: Array<{
    tipo: number;
    puntoVenta: number;
    numero: number;
    cuit?: string;
  }>;
}

// Response de autorización
export interface AfipAuthorizeResponse {
  success: boolean;
  cae?: string;
  caeVto?: string;
  numeroComprobante?: number;
  tipoComprobante?: number;
  fechaProceso?: string;
  resultado?: string;
  observaciones?: Array<{
    code: number;
    msg: string;
  }>;
  errores?: Array<{
    code: number;
    msg: string;
  }>;
  error?: string;
  reproceso?: string;
}

// Ticket de Acceso (TA)
export interface TicketAcceso {
  token: string;
  sign: string;
  expirationTime: Date;
}

// Información del certificado
export interface CertificateInfo {
  businessId: number;
  cuit: string;
  certPath: string;
  keyPath: string;
  password?: string;
  validFrom?: Date;
  validTo?: Date;
}

// Request para último comprobante
export interface LastVoucherRequest {
  businessId: number;
  cuit: string;
  puntoVenta: number;
  tipoComprobante: number;
}

// Response para último comprobante
export interface LastVoucherResponse {
  success: boolean;
  numeroComprobante?: number;
  error?: string;
}

