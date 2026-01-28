/**
 * Tests for Invoice Controller
 * CRITICAL: Entry point for all billing operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  createValidAuthorizeRequest,
  createSuccessAuthorizeResponse,
  createFailedAuthorizeResponse,
  createCertificateInfo,
} from '../helpers/factories';
import { TipoComprobante } from '../../src/types/afip.types';

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock services
const mockAuthorizeInvoice = vi.fn();
const mockGenerateCreditNote = vi.fn();
const mockGetLastVoucher = vi.fn();
const mockHealthCheck = vi.fn();
const mockGetPuntosVenta = vi.fn();

vi.mock('../../src/services/wsfe.service', () => ({
  wsfeService: {
    authorizeInvoice: (...args: any[]) => mockAuthorizeInvoice(...args),
    generateCreditNote: (...args: any[]) => mockGenerateCreditNote(...args),
    getLastVoucher: (...args: any[]) => mockGetLastVoucher(...args),
    healthCheck: (...args: any[]) => mockHealthCheck(...args),
    getPuntosVenta: (...args: any[]) => mockGetPuntosVenta(...args),
  },
}));

const mockGetCertificateInfo = vi.fn();
const mockSaveCertificateFromPfx = vi.fn();
const mockSaveCertificateFromCrt = vi.fn();
const mockSaveCertificateFromCrtKey = vi.fn();
const mockGenerateCSR = vi.fn();

vi.mock('../../src/services/certificate.service', () => ({
  certificateService: {
    getCertificateInfo: (...args: any[]) => mockGetCertificateInfo(...args),
    saveCertificateFromPfx: (...args: any[]) => mockSaveCertificateFromPfx(...args),
    saveCertificateFromCrt: (...args: any[]) => mockSaveCertificateFromCrt(...args),
    saveCertificateFromCrtKey: (...args: any[]) => mockSaveCertificateFromCrtKey(...args),
    generateCSR: (...args: any[]) => mockGenerateCSR(...args),
  },
}));

const mockConsultarPadron = vi.fn();
const mockConsultarDNI = vi.fn();
const mockNormalizarDocumento = vi.fn();

vi.mock('../../src/services/padron.service', () => ({
  padronService: {
    consultarPadron: (...args: any[]) => mockConsultarPadron(...args),
    consultarDNI: (...args: any[]) => mockConsultarDNI(...args),
    normalizarDocumento: (...args: any[]) => mockNormalizarDocumento(...args),
  },
}));

vi.mock('../../src/services/wsaa.service', () => ({
  WSAAService: vi.fn(() => ({
    clearCache: vi.fn(),
  })),
}));

import * as controller from '../../src/controllers/invoice.controller';

describe('Invoice Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizarDocumento.mockImplementation((doc: string) => doc.replace(/[-\s]/g, ''));
  });

  // ==========================================
  // authorizeInvoice
  // ==========================================
  describe('authorizeInvoice', () => {
    it('should return 400 when missing required fields', async () => {
      const req = createMockRequest({
        body: { businessId: 1 }, // Missing cuit and puntoVenta
      });
      const res = createMockResponse();

      await controller.authorizeInvoice(req, res);

      expect(res._status).toBe(400);
      expect(res._json.success).toBe(false);
      expect(res._json.error).toContain('Faltan campos requeridos');
    });

    it('should return 404 when certificate not found', async () => {
      const req = createMockRequest({
        body: createValidAuthorizeRequest(),
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockResolvedValue(null);

      await controller.authorizeInvoice(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toContain('certificado');
    });

    it('should return 200 on successful authorization', async () => {
      const req = createMockRequest({
        body: createValidAuthorizeRequest(),
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockResolvedValue(createCertificateInfo());
      mockAuthorizeInvoice.mockResolvedValue(createSuccessAuthorizeResponse());

      await controller.authorizeInvoice(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.cae).toBeDefined();
    });

    it('should return 400 on AFIP rejection', async () => {
      const req = createMockRequest({
        body: createValidAuthorizeRequest(),
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockResolvedValue(createCertificateInfo());
      mockAuthorizeInvoice.mockResolvedValue(createFailedAuthorizeResponse('Error de AFIP'));

      await controller.authorizeInvoice(req, res);

      expect(res._status).toBe(400);
      expect(res._json.success).toBe(false);
    });

    it('should return 500 on unexpected error', async () => {
      const req = createMockRequest({
        body: createValidAuthorizeRequest(),
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockRejectedValue(new Error('Unexpected error'));

      await controller.authorizeInvoice(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toContain('Error interno');
    });
  });

  // ==========================================
  // generateCreditNote
  // ==========================================
  describe('generateCreditNote', () => {
    it('should return 400 when missing required fields', async () => {
      const req = createMockRequest({
        body: { originalInvoice: {} }, // Missing originalComprobanteInfo
      });
      const res = createMockResponse();

      await controller.generateCreditNote(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Faltan campos requeridos');
    });

    it('should return 200 on successful credit note', async () => {
      const req = createMockRequest({
        body: {
          originalInvoice: createValidAuthorizeRequest(),
          originalComprobanteInfo: {
            tipo: TipoComprobante.FACTURA_B,
            puntoVenta: 1,
            numero: 1,
          },
        },
      });
      const res = createMockResponse();
      mockGenerateCreditNote.mockResolvedValue(createSuccessAuthorizeResponse());

      await controller.generateCreditNote(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
    });

    it('should return 400 on credit note failure', async () => {
      const req = createMockRequest({
        body: {
          originalInvoice: createValidAuthorizeRequest(),
          originalComprobanteInfo: {
            tipo: TipoComprobante.FACTURA_B,
            puntoVenta: 1,
            numero: 1,
          },
        },
      });
      const res = createMockResponse();
      mockGenerateCreditNote.mockResolvedValue(createFailedAuthorizeResponse('Error'));

      await controller.generateCreditNote(req, res);

      expect(res._status).toBe(400);
    });
  });

  // ==========================================
  // getLastVoucher
  // ==========================================
  describe('getLastVoucher', () => {
    it('should return 400 when missing required params', async () => {
      const req = createMockRequest({
        query: { businessId: '1' }, // Missing cuit
        params: { ptoVta: '1', tipoComp: '6' },
      });
      const res = createMockResponse();

      await controller.getLastVoucher(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Faltan parámetros');
    });

    it('should return 200 with last voucher number', async () => {
      const req = createMockRequest({
        query: { businessId: '1', cuit: '20123456789' },
        params: { ptoVta: '1', tipoComp: '6' },
      });
      const res = createMockResponse();
      mockGetLastVoucher.mockResolvedValue({ success: true, numeroComprobante: 42 });

      await controller.getLastVoucher(req, res);

      expect(res._status).toBe(200);
      expect(res._json.numeroComprobante).toBe(42);
    });
  });

  // ==========================================
  // healthCheck
  // ==========================================
  describe('healthCheck', () => {
    it('should return basic health without AFIP check', async () => {
      const req = createMockRequest({
        query: {},
      });
      const res = createMockResponse();

      await controller.healthCheck(req, res);

      expect(res._status).toBe(200);
      expect(res._json.service).toBe('afip-service');
      expect(res._json.status).toBe('ok');
    });

    it('should include AFIP status when businessId provided', async () => {
      const req = createMockRequest({
        query: { businessId: '1', cuit: '20123456789' },
      });
      const res = createMockResponse();
      mockHealthCheck.mockResolvedValue(true);

      await controller.healthCheck(req, res);

      expect(res._status).toBe(200);
      expect(res._json.afipConnection).toBe('ok');
    });

    it('should show AFIP error when connection fails', async () => {
      const req = createMockRequest({
        query: { businessId: '1', cuit: '20123456789' },
      });
      const res = createMockResponse();
      mockHealthCheck.mockResolvedValue(false);

      await controller.healthCheck(req, res);

      expect(res._status).toBe(200);
      expect(res._json.afipConnection).toBe('error');
    });
  });

  // ==========================================
  // uploadCertificate
  // ==========================================
  describe('uploadCertificate', () => {
    it('should return 400 when missing required fields', async () => {
      const req = createMockRequest({
        body: { businessId: 1 }, // Missing cuit and pfxBase64
      });
      const res = createMockResponse();

      await controller.uploadCertificate(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Faltan campos requeridos');
    });

    it('should return 200 on successful upload', async () => {
      const req = createMockRequest({
        body: {
          businessId: 1,
          cuit: '20123456789',
          pfxBase64: 'base64data',
          password: 'test',
        },
      });
      const res = createMockResponse();
      mockSaveCertificateFromPfx.mockResolvedValue(true);

      await controller.uploadCertificate(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
    });

    it('should return 400 on upload failure', async () => {
      const req = createMockRequest({
        body: {
          businessId: 1,
          cuit: '20123456789',
          pfxBase64: 'base64data',
        },
      });
      const res = createMockResponse();
      mockSaveCertificateFromPfx.mockResolvedValue(false);

      await controller.uploadCertificate(req, res);

      expect(res._status).toBe(400);
    });
  });

  // ==========================================
  // generateCSR
  // ==========================================
  describe('generateCSR', () => {
    it('should return 400 when missing required fields', async () => {
      const req = createMockRequest({
        body: { businessId: 1 }, // Missing cuit and organizationName
      });
      const res = createMockResponse();

      await controller.generateCSR(req, res);

      expect(res._status).toBe(400);
    });

    it('should return 200 with CSR on success', async () => {
      const req = createMockRequest({
        body: {
          businessId: 1,
          cuit: '20123456789',
          organizationName: 'Test Org',
        },
      });
      const res = createMockResponse();
      mockGenerateCSR.mockResolvedValue('-----BEGIN CERTIFICATE REQUEST-----\ntest\n-----END CERTIFICATE REQUEST-----');

      await controller.generateCSR(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.csr).toBeDefined();
    });
  });

  // ==========================================
  // consultarPadron
  // ==========================================
  describe('consultarPadron', () => {
    it('should return 400 when missing required params', async () => {
      const req = createMockRequest({
        query: { businessId: '1' }, // Missing documento
      });
      const res = createMockResponse();

      await controller.consultarPadron(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Faltan parámetros');
    });

    it('should call consultarDNI for 8 digit documento', async () => {
      const req = createMockRequest({
        query: { businessId: '1', documento: '12345678' },
      });
      const res = createMockResponse();
      mockConsultarDNI.mockResolvedValue({ success: true, data: {} });

      await controller.consultarPadron(req, res);

      expect(mockConsultarDNI).toHaveBeenCalled();
      expect(mockConsultarPadron).not.toHaveBeenCalled();
    });

    it('should call consultarPadron for 11 digit documento', async () => {
      const req = createMockRequest({
        query: { businessId: '1', documento: '20123456789' },
      });
      const res = createMockResponse();
      mockConsultarPadron.mockResolvedValue({ success: true, data: {} });

      await controller.consultarPadron(req, res);

      expect(mockConsultarPadron).toHaveBeenCalled();
    });

    it('should return 400 for invalid documento length', async () => {
      const req = createMockRequest({
        query: { businessId: '1', documento: '12345' },
      });
      const res = createMockResponse();

      await controller.consultarPadron(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('Formato de documento inválido');
    });
  });

  // ==========================================
  // getPuntosVenta
  // ==========================================
  describe('getPuntosVenta', () => {
    it('should return 400 when businessId missing', async () => {
      const req = createMockRequest({
        query: {},
      });
      const res = createMockResponse();

      await controller.getPuntosVenta(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toContain('businessId es requerido');
    });

    it('should return 200 with puntos de venta', async () => {
      const req = createMockRequest({
        query: { businessId: '1' },
      });
      const res = createMockResponse();
      mockGetPuntosVenta.mockResolvedValue({
        success: true,
        data: [{ numero: 1 }, { numero: 2 }],
      });

      await controller.getPuntosVenta(req, res);

      expect(res._status).toBe(200);
      expect(res._json.data).toHaveLength(2);
    });
  });

  // ==========================================
  // getCertificateInfo
  // ==========================================
  describe('getCertificateInfo', () => {
    it('should return 400 when businessId missing', async () => {
      const req = createMockRequest({
        query: {},
        body: {},
      });
      const res = createMockResponse();

      await controller.getCertificateInfo(req, res);

      expect(res._status).toBe(400);
    });

    it('should return certificate info when exists', async () => {
      const req = createMockRequest({
        query: { businessId: '1' },
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockResolvedValue(createCertificateInfo());

      await controller.getCertificateInfo(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
      expect(res._json.exists).toBe(true);
    });

    it('should return exists false when no certificate', async () => {
      const req = createMockRequest({
        query: { businessId: '1' },
      });
      const res = createMockResponse();
      mockGetCertificateInfo.mockResolvedValue(null);

      await controller.getCertificateInfo(req, res);

      expect(res._status).toBe(200);
      expect(res._json.exists).toBe(false);
    });
  });

  // ==========================================
  // clearCache
  // ==========================================
  describe('clearCache', () => {
    it('should clear cache for specific business and service', async () => {
      const req = createMockRequest({
        query: { businessId: '1', service: 'wsfe' },
      });
      const res = createMockResponse();

      await controller.clearCache(req, res);

      expect(res._status).toBe(200);
      expect(res._json.success).toBe(true);
    });

    it('should clear all cache when no params', async () => {
      const req = createMockRequest({
        query: {},
      });
      const res = createMockResponse();

      await controller.clearCache(req, res);

      expect(res._status).toBe(200);
      expect(res._json.message).toContain('All cache cleared');
    });
  });
});

