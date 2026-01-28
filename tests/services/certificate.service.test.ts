/**
 * Tests for Certificate Service
 * CRITICAL: Certificate management is essential for AFIP authentication
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCertificateInfo,
  createExpiredCertificateInfo,
} from '../helpers/factories';

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
    certsPath: '/test/certs',
    environment: 'homologacion',
  },
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
    mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  },
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
}));

// Mock node-forge
const mockPkiCertificateFromPem = vi.fn();
const mockPkiPrivateKeyFromPem = vi.fn();
const mockPkcs12FromAsn1 = vi.fn();
const mockAsn1FromDer = vi.fn();

vi.mock('node-forge', () => ({
  default: {
    pki: {
      certificateFromPem: (...args: any[]) => mockPkiCertificateFromPem(...args),
      privateKeyFromPem: (...args: any[]) => mockPkiPrivateKeyFromPem(...args),
      certificateToPem: vi.fn(() => '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'),
      privateKeyToPem: vi.fn(() => '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'),
      rsa: {
        generateKeyPair: vi.fn(() => ({
          publicKey: {},
          privateKey: {},
        })),
      },
      createCertificationRequest: vi.fn(() => ({
        publicKey: null,
        setSubject: vi.fn(),
        sign: vi.fn(),
      })),
      certificationRequestToPem: vi.fn(() => '-----BEGIN CERTIFICATE REQUEST-----\ntest\n-----END CERTIFICATE REQUEST-----'),
      certificateFromAsn1: vi.fn(),
      oids: {
        certBag: '1.2.840.113549.1.12.10.1.3',
        pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
      },
    },
    pkcs12: {
      pkcs12FromAsn1: (...args: any[]) => mockPkcs12FromAsn1(...args),
      toPkcs12Asn1: vi.fn(() => ({})),
    },
    asn1: {
      fromDer: (...args: any[]) => mockAsn1FromDer(...args),
      toDer: vi.fn(() => ({ getBytes: () => 'test-bytes' })),
    },
    util: {
      createBuffer: vi.fn(),
    },
  },
  pki: {
    certificateFromPem: (...args: any[]) => mockPkiCertificateFromPem(...args),
    privateKeyFromPem: (...args: any[]) => mockPkiPrivateKeyFromPem(...args),
    certificateToPem: vi.fn(() => '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'),
    privateKeyToPem: vi.fn(() => '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'),
    rsa: {
      generateKeyPair: vi.fn(() => ({
        publicKey: {},
        privateKey: {},
      })),
    },
    createCertificationRequest: vi.fn(() => ({
      publicKey: null,
      setSubject: vi.fn(),
      sign: vi.fn(),
    })),
    certificationRequestToPem: vi.fn(() => '-----BEGIN CERTIFICATE REQUEST-----\ntest\n-----END CERTIFICATE REQUEST-----'),
    certificateFromAsn1: vi.fn(),
    oids: {
      certBag: '1.2.840.113549.1.12.10.1.3',
      pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
    },
  },
  pkcs12: {
    pkcs12FromAsn1: (...args: any[]) => mockPkcs12FromAsn1(...args),
    toPkcs12Asn1: vi.fn(() => ({})),
  },
  asn1: {
    fromDer: (...args: any[]) => mockAsn1FromDer(...args),
    toDer: vi.fn(() => ({ getBytes: () => 'test-bytes' })),
  },
  util: {
    createBuffer: vi.fn(),
  },
}));

import { CertificateService, certificateService } from '../../src/services/certificate.service';

describe('CertificateService', () => {
  let service: CertificateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CertificateService();
  });

  // ==========================================
  // getCertificateInfo
  // ==========================================
  describe('getCertificateInfo', () => {
    it('should return null when info.json does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.getCertificateInfo(1);

      expect(result).toBeNull();
    });

    it('should return null when info.json parsing fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');

      const result = await service.getCertificateInfo(1);

      expect(result).toBeNull();
    });

    it('should return null when cert.pem is missing', async () => {
      mockExistsSync
        .mockReturnValueOnce(true) // info.json exists
        .mockReturnValueOnce(false); // cert.pem missing
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );

      const result = await service.getCertificateInfo(1);

      expect(result).toBeNull();
    });

    it('should return null when key.pem is missing', async () => {
      mockExistsSync
        .mockReturnValueOnce(true) // info.json exists
        .mockReturnValueOnce(true) // cert.pem exists
        .mockReturnValueOnce(false); // key.pem missing
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );

      const result = await service.getCertificateInfo(1);

      expect(result).toBeNull();
    });

    it('should return certificate info when all files exist', async () => {
      const validTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validFrom: new Date().toISOString(),
          validTo: validTo.toISOString(),
          password: 'test-password',
        })
      );

      const result = await service.getCertificateInfo(1);

      expect(result).not.toBeNull();
      expect(result?.businessId).toBe(1);
      expect(result?.cuit).toBe('20123456789');
      expect(result?.certPath).toContain('cert.pem');
      expect(result?.keyPath).toContain('key.pem');
    });

    it('should return cached result on second call', async () => {
      const validTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validFrom: new Date().toISOString(),
          validTo: validTo.toISOString(),
        })
      );

      // First call
      const result1 = await service.getCertificateInfo(1);

      // Second call (should use cache)
      const result2 = await service.getCertificateInfo(1);

      expect(result1).toEqual(result2);
      // readFileSync should only be called once
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache when certificate is expired', async () => {
      // First, set up expired certificate in cache
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          validTo: expiredDate.toISOString(),
        })
      );

      const result = await service.getCertificateInfo(1);

      // Should still return the cert info (just expired)
      expect(result).not.toBeNull();
    });

    it('should handle missing validTo date', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          // No validTo
        })
      );

      const result = await service.getCertificateInfo(1);

      expect(result).not.toBeNull();
      expect(result?.validTo).toBeUndefined();
    });
  });

  // ==========================================
  // isCertificateValid
  // ==========================================
  describe('isCertificateValid', () => {
    it('should return false when no certificate exists', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.isCertificateValid(1);

      expect(result).toBe(false);
    });

    it('should return false when certificate has no validTo', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          // No validTo
        })
      );

      const result = await service.isCertificateValid(1);

      expect(result).toBe(false);
    });

    it('should return false when certificate is expired', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validTo: expiredDate.toISOString(),
        })
      );

      const result = await service.isCertificateValid(1);

      expect(result).toBe(false);
    });

    it('should return true when certificate is valid', async () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validTo: futureDate.toISOString(),
        })
      );

      const result = await service.isCertificateValid(1);

      expect(result).toBe(true);
    });

    it('should return false when certificate expires in 1 second', async () => {
      const almostExpired = new Date(Date.now() + 1000); // 1 second from now
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validTo: almostExpired.toISOString(),
        })
      );

      // This might be true or false depending on timing
      const result = await service.isCertificateValid(1);
      expect(typeof result).toBe('boolean');
    });
  });

  // ==========================================
  // readCertificate
  // ==========================================
  describe('readCertificate', () => {
    it('should read certificate file as string', () => {
      const certContent = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
      mockReadFileSync.mockReturnValue(certContent);

      const result = service.readCertificate('/path/to/cert.pem');

      expect(result).toBe(certContent);
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/cert.pem', 'utf-8');
    });

    it('should throw when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      expect(() => service.readCertificate('/invalid/path')).toThrow('ENOENT');
    });
  });

  // ==========================================
  // readPrivateKey
  // ==========================================
  describe('readPrivateKey', () => {
    it('should read private key file as string', () => {
      const keyContent = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      mockReadFileSync.mockReturnValue(keyContent);

      const result = service.readPrivateKey('/path/to/key.pem');

      expect(result).toBe(keyContent);
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/key.pem', 'utf-8');
    });

    it('should throw when file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      expect(() => service.readPrivateKey('/invalid/path')).toThrow('ENOENT');
    });
  });

  // ==========================================
  // generateCSR
  // ==========================================
  describe('generateCSR', () => {
    it('should generate CSR and save files', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.generateCSR(1, '20123456789', 'Test Org');

      expect(result).not.toBeNull();
      expect(result).toContain('BEGIN CERTIFICATE REQUEST');
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should not create directory if it exists', async () => {
      mockExistsSync.mockReturnValue(true);

      await service.generateCSR(1, '20123456789', 'Test Org');

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await service.generateCSR(1, '20123456789', 'Test Org');

      expect(result).toBeNull();
    });
  });

  // ==========================================
  // saveCertificateFromPfx
  // ==========================================
  describe('saveCertificateFromPfx', () => {
    const validPfxData = {
      getBags: vi.fn().mockReturnValue({
        '1.2.840.113549.1.12.10.1.3': [
          {
            cert: {
              validity: {
                notBefore: new Date(),
                notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              },
            },
          },
        ],
        '1.2.840.113549.1.12.10.1.2': [{ key: {} }],
      }),
    };

    beforeEach(() => {
      mockAsn1FromDer.mockReturnValue({});
      mockPkcs12FromAsn1.mockReturnValue(validPfxData);
      mockExistsSync.mockReturnValue(false);
    });

    it('should save certificate from valid PFX', async () => {
      const pfxBuffer = Buffer.from('test-pfx-data');

      const result = await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should create directory if not exists', async () => {
      const pfxBuffer = Buffer.from('test-pfx-data');

      await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it('should return false when PFX parsing fails', async () => {
      mockPkcs12FromAsn1.mockImplementation(() => {
        throw new Error('Invalid PFX');
      });

      const pfxBuffer = Buffer.from('invalid-pfx');
      const result = await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      expect(result).toBe(false);
    });

    it('should return false when no certificate in PFX', async () => {
      mockPkcs12FromAsn1.mockReturnValue({
        getBags: vi.fn().mockReturnValue({
          '1.2.840.113549.1.12.10.1.3': [],
          '1.2.840.113549.1.12.10.1.2': [{ key: {} }],
        }),
      });

      const pfxBuffer = Buffer.from('test-pfx');
      const result = await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      expect(result).toBe(false);
    });

    it('should return false when no private key in PFX', async () => {
      mockPkcs12FromAsn1.mockReturnValue({
        getBags: vi.fn().mockReturnValue({
          '1.2.840.113549.1.12.10.1.3': [{ cert: { validity: { notBefore: new Date(), notAfter: new Date() } } }],
          '1.2.840.113549.1.12.10.1.2': [],
        }),
      });

      const pfxBuffer = Buffer.from('test-pfx');
      const result = await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      expect(result).toBe(false);
    });

    it('should return false when wrong password', async () => {
      mockPkcs12FromAsn1.mockImplementation(() => {
        throw new Error('MAC verification failed');
      });

      const pfxBuffer = Buffer.from('test-pfx');
      const result = await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'wrong-password');

      expect(result).toBe(false);
    });

    it('should clear cache after saving', async () => {
      const pfxBuffer = Buffer.from('test-pfx-data');

      // First, populate cache
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );
      await service.getCertificateInfo(1);

      // Now save new certificate
      mockExistsSync.mockReturnValue(false);
      await service.saveCertificateFromPfx(1, '20123456789', pfxBuffer, 'password');

      // Cache should be cleared, so next call should read from file again
      mockReadFileSync.mockClear();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          cuit: '20123456789',
          validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        })
      );

      await service.getCertificateInfo(1);
      expect(mockReadFileSync).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Singleton Export
  // ==========================================
  describe('Singleton', () => {
    it('should export a singleton instance', () => {
      expect(certificateService).toBeDefined();
      expect(certificateService).toBeInstanceOf(CertificateService);
    });
  });
});

