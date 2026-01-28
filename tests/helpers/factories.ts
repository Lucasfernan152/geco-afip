/**
 * Test factories for creating mock data
 * CRITICAL: These must match real AFIP data structures
 */

import { vi } from 'vitest';
import { Request, Response } from 'express';
import {
  AfipAuthorizeRequest,
  AfipAuthorizeResponse,
  TicketAcceso,
  CertificateInfo,
  TipoComprobante,
  TipoDocumento,
  TipoConcepto,
  TipoIVA,
} from '../../src/types/afip.types';

// ==========================================
// Request/Response Mocks
// ==========================================

export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  } as Request;
}

export function createMockResponse(): Response & {
  _status: number;
  _json: any;
  _getData: () => any;
} {
  const res: any = {
    _status: 200,
    _json: null,
    status: vi.fn(function (this: any, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: any, data: any) {
      this._json = data;
      return this;
    }),
    send: vi.fn(function (this: any, data: any) {
      this._json = data;
      return this;
    }),
    _getData: function () {
      return this._json;
    },
  };
  return res;
}

// ==========================================
// AFIP Data Factories
// ==========================================

/**
 * Create a valid AFIP authorize request for Factura B
 */
export function createValidAuthorizeRequest(
  overrides: Partial<AfipAuthorizeRequest> = {}
): AfipAuthorizeRequest {
  const today = new Date();
  const fechaStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  return {
    businessId: 1,
    cuit: '20123456789',
    puntoVenta: 1,
    tipoComprobante: TipoComprobante.FACTURA_B,
    concepto: TipoConcepto.PRODUCTOS,
    tipoDocumento: TipoDocumento.DNI,
    numeroDocumento: '12345678',
    condicionIVA: 5, // Consumidor Final
    fechaComprobante: fechaStr,
    importeTotal: 1210,
    importeNeto: 1000,
    importeExento: 0,
    importeIVA: 210,
    importeTributos: 0,
    iva: [
      {
        id: TipoIVA.IVA_21,
        baseImponible: 1000,
        importe: 210,
      },
    ],
    ...overrides,
  };
}

/**
 * Create a valid AFIP authorize request for Factura A
 */
export function createFacturaARequest(
  overrides: Partial<AfipAuthorizeRequest> = {}
): AfipAuthorizeRequest {
  return createValidAuthorizeRequest({
    tipoComprobante: TipoComprobante.FACTURA_A,
    tipoDocumento: TipoDocumento.CUIT,
    numeroDocumento: '30123456789',
    condicionIVA: 1, // Responsable Inscripto
    ...overrides,
  });
}

/**
 * Create a valid AFIP authorize request for Factura C
 */
export function createFacturaCRequest(
  overrides: Partial<AfipAuthorizeRequest> = {}
): AfipAuthorizeRequest {
  return createValidAuthorizeRequest({
    tipoComprobante: TipoComprobante.FACTURA_C,
    importeIVA: 0, // Factura C no discrimina IVA
    iva: undefined, // No IVA array for Factura C
    ...overrides,
  });
}

/**
 * Create successful AFIP authorization response
 */
export function createSuccessAuthorizeResponse(
  overrides: Partial<AfipAuthorizeResponse> = {}
): AfipAuthorizeResponse {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);
  const caeVto = futureDate.toISOString().slice(0, 10).replace(/-/g, '');

  return {
    success: true,
    cae: '71234567890123',
    caeVto,
    numeroComprobante: 1,
    tipoComprobante: TipoComprobante.FACTURA_B,
    fechaProceso: new Date().toISOString(),
    resultado: 'A',
    observaciones: [],
    ...overrides,
  };
}

/**
 * Create failed AFIP authorization response
 */
export function createFailedAuthorizeResponse(
  error: string,
  errorCode: number = 10000
): AfipAuthorizeResponse {
  return {
    success: false,
    error,
    errores: [{ code: errorCode, msg: error }],
    resultado: 'R',
  };
}

/**
 * Create valid ticket de acceso (TA)
 */
export function createValidTicketAcceso(
  overrides: Partial<TicketAcceso> = {}
): TicketAcceso {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 12);

  return {
    token: 'PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48dGE+PHRva2VuPnRlc3QtdG9rZW48L3Rva2VuPjwvdGE+',
    sign: 'dGVzdC1zaWduYXR1cmUtYmFzZTY0',
    expirationTime: expiration,
    ...overrides,
  };
}

/**
 * Create expired ticket de acceso
 */
export function createExpiredTicketAcceso(): TicketAcceso {
  const expired = new Date();
  expired.setHours(expired.getHours() - 1);

  return {
    token: 'expired-token',
    sign: 'expired-sign',
    expirationTime: expired,
  };
}

/**
 * Create certificate info
 */
export function createCertificateInfo(
  overrides: Partial<CertificateInfo> = {}
): CertificateInfo {
  const validFrom = new Date();
  validFrom.setFullYear(validFrom.getFullYear() - 1);
  const validTo = new Date();
  validTo.setFullYear(validTo.getFullYear() + 1);

  return {
    businessId: 1,
    cuit: '20123456789',
    certPath: '/certs/1/cert.pem',
    keyPath: '/certs/1/key.pem',
    password: 'test-password',
    validFrom,
    validTo,
    ...overrides,
  };
}

/**
 * Create expired certificate info
 */
export function createExpiredCertificateInfo(): CertificateInfo {
  const validFrom = new Date();
  validFrom.setFullYear(validFrom.getFullYear() - 2);
  const validTo = new Date();
  validTo.setFullYear(validTo.getFullYear() - 1);

  return {
    businessId: 1,
    cuit: '20123456789',
    certPath: '/certs/1/cert.pem',
    keyPath: '/certs/1/key.pem',
    validFrom,
    validTo,
  };
}

// ==========================================
// SOAP Response Mocks
// ==========================================

/**
 * Create successful SOAP response for FECAESolicitar
 */
export function createSoapFECAEResponse(
  cae: string = '71234567890123',
  resultado: string = 'A'
): any {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10);
  const caeVto = futureDate.toISOString().slice(0, 10).replace(/-/g, '');

  return {
    FECAESolicitarResult: {
      FeCabResp: {
        Cuit: '20123456789',
        PtoVta: 1,
        CbteTipo: 6,
        FchProceso: new Date().toISOString(),
        CantReg: 1,
        Resultado: resultado,
        Reproceso: 'N',
      },
      FeDetResp: {
        FECAEDetResponse: {
          Concepto: 1,
          DocTipo: 96,
          DocNro: '12345678',
          CbteDesde: 1,
          CbteHasta: 1,
          CbteFch: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          Resultado: resultado,
          CAE: cae,
          CAEFchVto: caeVto,
        },
      },
    },
  };
}

/**
 * Create SOAP response with errors
 */
export function createSoapErrorResponse(
  errorCode: number,
  errorMsg: string
): any {
  return {
    FECAESolicitarResult: {
      Errors: {
        Err: {
          Code: errorCode,
          Msg: errorMsg,
        },
      },
    },
  };
}

/**
 * Create SOAP response with observations (comprobante rechazado)
 */
export function createSoapRejectedResponse(
  obsCode: number,
  obsMsg: string
): any {
  return {
    FECAESolicitarResult: {
      FeCabResp: {
        Resultado: 'R',
      },
      FeDetResp: {
        FECAEDetResponse: {
          Resultado: 'R',
          Observaciones: {
            Obs: {
              Code: obsCode,
              Msg: obsMsg,
            },
          },
        },
      },
    },
  };
}

/**
 * Create SOAP response for FECompUltimoAutorizado
 */
export function createSoapLastVoucherResponse(numeroComprobante: number): any {
  return {
    FECompUltimoAutorizadoResult: {
      PtoVta: 1,
      CbteTipo: 6,
      CbteNro: numeroComprobante,
    },
  };
}

/**
 * Create SOAP response for FEDummy (health check)
 */
export function createSoapDummyResponse(
  authServer: string = 'OK',
  appServer: string = 'OK'
): any {
  return {
    FEDummyResult: {
      AuthServer: authServer,
      AppServer: appServer,
      DbServer: 'OK',
    },
  };
}

// ==========================================
// CUIT Validation Helpers
// ==========================================

export const VALID_CUITS = {
  PERSONA_FISICA: '20123456789',
  PERSONA_JURIDICA: '30123456789',
  MONOTRIBUTO: '20987654321',
  RESPONSABLE_INSCRIPTO: '30716539685',
};

export const INVALID_CUITS = {
  WRONG_LENGTH: '2012345678', // 10 digits
  WRONG_VERIFIER: '20123456780', // Invalid verifier digit
  NOT_NUMERIC: '20-12345678-9',
  EMPTY: '',
};

export const VALID_DNIS = {
  STANDARD: '12345678',
  WITH_LEADING_ZERO: '01234567',
};

export const INVALID_DNIS = {
  TOO_SHORT: '1234567',
  TOO_LONG: '123456789',
  NOT_NUMERIC: '1234567a',
};

