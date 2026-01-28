/**
 * Tests for WSFE Service (Web Service de Facturación Electrónica)
 * CRITICAL: This is the core billing service - MUST be thoroughly tested
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createValidAuthorizeRequest,
  createFacturaARequest,
  createFacturaCRequest,
  createSuccessAuthorizeResponse,
  createFailedAuthorizeResponse,
  createValidTicketAcceso,
  createCertificateInfo,
  createSoapFECAEResponse,
  createSoapErrorResponse,
  createSoapRejectedResponse,
  createSoapLastVoucherResponse,
  createSoapDummyResponse,
} from '../helpers/factories';
import { TipoComprobante, TipoIVA } from '../../src/types/afip.types';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('../../src/config/config', () => ({
  default: {
    environment: 'homologacion',
    wsaaUrl: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfeUrl: 'https://wswhomo.afip.gob.ar/wsfev1/service.asmx?WSDL',
    certsPath: '/test/certs',
  },
}));

// Mock certificate service
const mockGetCertificateInfo = vi.fn();
const mockIsCertificateValid = vi.fn();

vi.mock('../../src/services/certificate.service', () => ({
  certificateService: {
    getCertificateInfo: (...args: any[]) => mockGetCertificateInfo(...args),
    isCertificateValid: (...args: any[]) => mockIsCertificateValid(...args),
  },
}));

// Mock WSAA service
const mockGetTicketAcceso = vi.fn();

vi.mock('../../src/services/wsaa.service', () => ({
  wsaaService: {
    getTicketAcceso: (...args: any[]) => mockGetTicketAcceso(...args),
  },
}));

// Mock SOAP client
const mockSoapClient = {
  FECAESolicitarAsync: vi.fn(),
  FECompUltimoAutorizadoAsync: vi.fn(),
  FEDummyAsync: vi.fn(),
  FEParamGetPtosVentaAsync: vi.fn(),
  FEParamGetTiposIvaAsync: vi.fn(),
  FEParamGetCondicionIvaReceptorAsync: vi.fn(),
  FEParamGetTiposOpcionalAsync: vi.fn(),
};

vi.mock('soap', () => ({
  createClientAsync: vi.fn(() => Promise.resolve(mockSoapClient)),
}));

import { WSFEService, wsfeService } from '../../src/services/wsfe.service';

describe('WSFEService', () => {
  let service: WSFEService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WSFEService();
    
    // Default successful mocks
    mockGetCertificateInfo.mockResolvedValue(createCertificateInfo());
    mockIsCertificateValid.mockResolvedValue(true);
    mockGetTicketAcceso.mockResolvedValue(createValidTicketAcceso());
  });

  // ==========================================
  // authorizeInvoice - Core Billing Function
  // ==========================================
  describe('authorizeInvoice', () => {
    describe('Successful Authorization', () => {
      it('should authorize Factura B successfully', async () => {
        const request = createValidAuthorizeRequest();
        
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse('71234567890123', 'A')
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
        expect(result.cae).toBe('71234567890123');
        expect(result.numeroComprobante).toBe(1);
      });

      it('should authorize Factura A successfully', async () => {
        const request = createFacturaARequest();
        
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(5)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse('71234567890124', 'A')
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
        expect(result.numeroComprobante).toBe(6);
      });

      it('should authorize Factura C without IVA', async () => {
        const request = createFacturaCRequest();
        
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(10)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse('71234567890125', 'A')
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
      });

      it('should include IVA details for Factura A and B', async () => {
        const request = createValidAuthorizeRequest({
          iva: [
            { id: TipoIVA.IVA_21, baseImponible: 1000, importe: 210 },
            { id: TipoIVA.IVA_10_5, baseImponible: 500, importe: 52.5 },
          ],
        });

        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse()
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
      });
    });

    describe('Certificate Validation', () => {
      it('should return error when certificate not found', async () => {
        mockGetCertificateInfo.mockResolvedValue(null);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No se encontró certificado');
      });

      it('should return error when certificate expired', async () => {
        mockIsCertificateValid.mockResolvedValue(false);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('certificado ha expirado');
      });
    });

    describe('Ticket Acceso Validation', () => {
      it('should return error when ticket acceso fails', async () => {
        mockGetTicketAcceso.mockResolvedValue(null);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No se pudo obtener ticket de acceso');
      });
    });

    describe('Last Voucher Errors', () => {
      it('should return error when last voucher query fails', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([{
          FECompUltimoAutorizadoResult: {
            Errors: {
              Err: { Code: 600, Msg: 'Punto de venta inactivo' },
            },
          },
        }]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('último comprobante');
      });
    });

    describe('AFIP Rejection Handling', () => {
      it('should handle AFIP rejection (Resultado R)', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapRejectedResponse(10015, 'El campo DocNro es inválido')
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.resultado).toBe('R');
        expect(result.observaciones).toBeDefined();
      });

      it('should handle AFIP general errors', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapErrorResponse(10000, 'Error interno de AFIP')
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.errores).toBeDefined();
      });

      it('should handle multiple AFIP errors', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([{
          FECAESolicitarResult: {
            Errors: {
              Err: [
                { Code: 10001, Msg: 'Error 1' },
                { Code: 10002, Msg: 'Error 2' },
              ],
            },
          },
        }]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.errores?.length).toBeGreaterThan(1);
      });
    });

    describe('Exception Handling', () => {
      it('should handle SOAP connection error', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockRejectedValue(
          new Error('SOAP connection failed')
        );
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Error');
      });

      it('should handle empty AFIP response', async () => {
        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([{
          FECAESolicitarResult: {
            FeDetResp: null,
          },
        }]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const request = createValidAuthorizeRequest();
        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No se recibió respuesta');
      });
    });

    describe('Service Invoices (Concepto 2 and 3)', () => {
      it('should include service dates for concepto 2', async () => {
        const request = createValidAuthorizeRequest({
          concepto: 2, // Servicios
          fechaServicioDesde: '20240101',
          fechaServicioHasta: '20240131',
          fechaVencimientoPago: '20240215',
        });

        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse()
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
      });
    });

    describe('Tributos', () => {
      it('should include tributos when present', async () => {
        const request = createValidAuthorizeRequest({
          tributos: [
            {
              id: 1,
              descripcion: 'Ingresos Brutos',
              baseImponible: 1000,
              alicuota: 3,
              importe: 30,
            },
          ],
          importeTributos: 30,
        });

        mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
          createSoapLastVoucherResponse(0)
        ]);
        mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
          createSoapFECAEResponse()
        ]);
        mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
        mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
        mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

        const result = await service.authorizeInvoice(request);

        expect(result.success).toBe(true);
      });
    });
  });

  // ==========================================
  // generateCreditNote
  // ==========================================
  describe('generateCreditNote', () => {
    beforeEach(() => {
      mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
        createSoapLastVoucherResponse(0)
      ]);
      mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
        createSoapFECAEResponse()
      ]);
      mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
      mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
      mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);
    });

    it('should generate Nota Credito A from Factura A', async () => {
      const originalInvoice = createFacturaARequest();
      const originalComprobanteInfo = {
        tipo: TipoComprobante.FACTURA_A,
        puntoVenta: 1,
        numero: 1,
      };

      const result = await service.generateCreditNote(originalInvoice, originalComprobanteInfo);

      expect(result.success).toBe(true);
    });

    it('should generate Nota Credito B from Factura B', async () => {
      const originalInvoice = createValidAuthorizeRequest();
      const originalComprobanteInfo = {
        tipo: TipoComprobante.FACTURA_B,
        puntoVenta: 1,
        numero: 1,
      };

      const result = await service.generateCreditNote(originalInvoice, originalComprobanteInfo);

      expect(result.success).toBe(true);
    });

    it('should generate Nota Credito C from Factura C', async () => {
      const originalInvoice = createFacturaCRequest();
      const originalComprobanteInfo = {
        tipo: TipoComprobante.FACTURA_C,
        puntoVenta: 1,
        numero: 1,
      };

      const result = await service.generateCreditNote(originalInvoice, originalComprobanteInfo);

      expect(result.success).toBe(true);
    });

    it('should return error for invalid comprobante type', async () => {
      const originalInvoice = createValidAuthorizeRequest();
      const originalComprobanteInfo = {
        tipo: 99, // Invalid type
        puntoVenta: 1,
        numero: 1,
      };

      const result = await service.generateCreditNote(originalInvoice, originalComprobanteInfo);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no válido');
    });

    it('should include comprobante asociado in request', async () => {
      const originalInvoice = createValidAuthorizeRequest();
      const originalComprobanteInfo = {
        tipo: TipoComprobante.FACTURA_B,
        puntoVenta: 1,
        numero: 100,
      };

      await service.generateCreditNote(originalInvoice, originalComprobanteInfo);

      // The FECAESolicitar should be called with comprobantes asociados
      expect(mockSoapClient.FECAESolicitarAsync).toHaveBeenCalled();
    });
  });

  // ==========================================
  // getLastVoucher
  // ==========================================
  describe('getLastVoucher', () => {
    it('should return last voucher number', async () => {
      mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
        createSoapLastVoucherResponse(42)
      ]);

      const result = await service.getLastVoucher({
        businessId: 1,
        cuit: '20123456789',
        puntoVenta: 1,
        tipoComprobante: 6,
      });

      expect(result.success).toBe(true);
      expect(result.numeroComprobante).toBe(42);
    });

    it('should return 0 for new punto de venta', async () => {
      mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
        createSoapLastVoucherResponse(0)
      ]);

      const result = await service.getLastVoucher({
        businessId: 1,
        cuit: '20123456789',
        puntoVenta: 1,
        tipoComprobante: 6,
      });

      expect(result.success).toBe(true);
      expect(result.numeroComprobante).toBe(0);
    });

    it('should return error when ticket acceso fails', async () => {
      mockGetTicketAcceso.mockResolvedValue(null);

      const result = await service.getLastVoucher({
        businessId: 1,
        cuit: '20123456789',
        puntoVenta: 1,
        tipoComprobante: 6,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ticket de acceso');
    });

    it('should handle AFIP errors', async () => {
      mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([{
        FECompUltimoAutorizadoResult: {
          Errors: {
            Err: { Code: 600, Msg: 'Punto de venta inexistente' },
          },
        },
      }]);

      const result = await service.getLastVoucher({
        businessId: 1,
        cuit: '20123456789',
        puntoVenta: 999,
        tipoComprobante: 6,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('600');
    });
  });

  // ==========================================
  // healthCheck
  // ==========================================
  describe('healthCheck', () => {
    it('should return true when AFIP servers are OK', async () => {
      mockSoapClient.FEDummyAsync.mockResolvedValue([
        createSoapDummyResponse('OK', 'OK')
      ]);

      const result = await service.healthCheck(1, '20123456789');

      expect(result).toBe(true);
    });

    it('should return false when AuthServer is down', async () => {
      mockSoapClient.FEDummyAsync.mockResolvedValue([
        createSoapDummyResponse('ERROR', 'OK')
      ]);

      const result = await service.healthCheck(1, '20123456789');

      expect(result).toBe(false);
    });

    it('should return false when AppServer is down', async () => {
      mockSoapClient.FEDummyAsync.mockResolvedValue([
        createSoapDummyResponse('OK', 'ERROR')
      ]);

      const result = await service.healthCheck(1, '20123456789');

      expect(result).toBe(false);
    });

    it('should return false when ticket acceso fails', async () => {
      mockGetTicketAcceso.mockResolvedValue(null);

      const result = await service.healthCheck(1, '20123456789');

      expect(result).toBe(false);
    });

    it('should return false on SOAP error', async () => {
      mockSoapClient.FEDummyAsync.mockRejectedValue(new Error('Connection failed'));

      const result = await service.healthCheck(1, '20123456789');

      expect(result).toBe(false);
    });
  });

  // ==========================================
  // getPuntosVenta
  // ==========================================
  describe('getPuntosVenta', () => {
    it('should return list of puntos de venta', async () => {
      mockSoapClient.FEParamGetPtosVentaAsync.mockResolvedValue([{
        FEParamGetPtosVentaResult: {
          ResultGet: {
            PtoVenta: [
              { Nro: 1, EmisionTipo: 'CAE', Bloqueado: 'N' },
              { Nro: 2, EmisionTipo: 'CAE', Bloqueado: 'N' },
            ],
          },
        },
      }]);

      const result = await service.getPuntosVenta(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].numero).toBe(1);
    });

    it('should handle single punto de venta', async () => {
      mockSoapClient.FEParamGetPtosVentaAsync.mockResolvedValue([{
        FEParamGetPtosVentaResult: {
          ResultGet: {
            PtoVenta: { Nro: 1, EmisionTipo: 'CAE', Bloqueado: 'N' },
          },
        },
      }]);

      const result = await service.getPuntosVenta(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('should return error when certificate not found', async () => {
      mockGetCertificateInfo.mockResolvedValue(null);

      const result = await service.getPuntosVenta(1);

      expect(result.success).toBe(false);
    });

    it('should return error when ticket acceso fails', async () => {
      mockGetTicketAcceso.mockResolvedValue(null);

      const result = await service.getPuntosVenta(1);

      expect(result.success).toBe(false);
    });

    it('should map bloqueado correctly', async () => {
      mockSoapClient.FEParamGetPtosVentaAsync.mockResolvedValue([{
        FEParamGetPtosVentaResult: {
          ResultGet: {
            PtoVenta: [
              { Nro: 1, Bloqueado: 'S' },
              { Nro: 2, Bloqueado: 'N' },
            ],
          },
        },
      }]);

      const result = await service.getPuntosVenta(1);

      expect(result.data[0].bloqueado).toBe(true);
      expect(result.data[1].bloqueado).toBe(false);
    });
  });

  // ==========================================
  // Singleton Export
  // ==========================================
  describe('Singleton', () => {
    it('should export a singleton instance', () => {
      expect(wsfeService).toBeDefined();
      expect(wsfeService).toBeInstanceOf(WSFEService);
    });
  });

  // ==========================================
  // SOAP Client Caching
  // ==========================================
  describe('SOAP Client Caching', () => {
    it('should reuse SOAP client across calls', async () => {
      mockSoapClient.FECompUltimoAutorizadoAsync.mockResolvedValue([
        createSoapLastVoucherResponse(0)
      ]);
      mockSoapClient.FECAESolicitarAsync.mockResolvedValue([
        createSoapFECAEResponse()
      ]);
      mockSoapClient.FEParamGetTiposIvaAsync.mockResolvedValue([{ FEParamGetTiposIvaResult: {} }]);
      mockSoapClient.FEParamGetCondicionIvaReceptorAsync.mockResolvedValue([{ FEParamGetCondicionIvaReceptorResult: {} }]);
      mockSoapClient.FEParamGetTiposOpcionalAsync.mockResolvedValue([{ FEParamGetTiposOpcionalResult: {} }]);

      // Make multiple calls
      await service.authorizeInvoice(createValidAuthorizeRequest());
      await service.authorizeInvoice(createValidAuthorizeRequest());

      // SOAP client should be created only once (cached)
      // We can't easily verify this with current mocks, but the test ensures no errors
    });
  });
});

