/**
 * Tests for Padron Service
 * CRITICAL: CUIT validation is essential for correct billing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VALID_CUITS,
  INVALID_CUITS,
  VALID_DNIS,
  INVALID_DNIS,
  createCertificateInfo,
  createValidTicketAcceso,
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
    environment: 'homologacion',
    wsaaUrl: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfeUrl: 'https://wswhomo.afip.gob.ar/wsfev1/service.asmx?WSDL',
    certsPath: '/certs',
  },
}));

// Mock certificate service
const mockGetCertificateInfo = vi.fn();
vi.mock('../../src/services/certificate.service', () => ({
  certificateService: {
    getCertificateInfo: (...args: any[]) => mockGetCertificateInfo(...args),
  },
}));

// Mock WSAA service
const mockGetTicketAcceso = vi.fn();
vi.mock('../../src/services/wsaa.service', () => ({
  wsaaService: {
    getTicketAcceso: (...args: any[]) => mockGetTicketAcceso(...args),
  },
}));

// Mock soap
const mockCreateClientAsync = vi.fn();
vi.mock('soap', () => ({
  createClientAsync: (...args: any[]) => mockCreateClientAsync(...args),
}));

import { padronService } from '../../src/services/padron.service';

describe('PadronService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================
  // normalizarDocumento
  // ==========================================
  describe('normalizarDocumento', () => {
    it('should remove hyphens from CUIT', () => {
      expect(padronService.normalizarDocumento('20-12345678-9')).toBe('20123456789');
    });

    it('should remove spaces from CUIT', () => {
      expect(padronService.normalizarDocumento('20 12345678 9')).toBe('20123456789');
    });

    it('should remove mixed separators', () => {
      expect(padronService.normalizarDocumento('20- 12345678- 9')).toBe('20123456789');
    });

    it('should return same string if no separators', () => {
      expect(padronService.normalizarDocumento('20123456789')).toBe('20123456789');
    });

    it('should handle empty string', () => {
      expect(padronService.normalizarDocumento('')).toBe('');
    });

    it('should handle DNI format', () => {
      expect(padronService.normalizarDocumento('12.345.678')).toBe('12.345.678'); // Only removes - and spaces
    });
  });

  // ==========================================
  // validarCUIT - CRITICAL
  // Helper function to calculate correct verifier digit
  // ==========================================
  function calcularDigitoVerificador(cuitBase: string): number {
    const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const digitos = cuitBase.split('').map(Number);
    let suma = 0;
    for (let i = 0; i < 10; i++) {
      suma += digitos[i] * multiplicadores[i];
    }
    const resto = suma % 11;
    const resultado = 11 - resto;
    if (resultado === 11) return 0;
    if (resultado === 10) return 9;
    return resultado;
  }

  describe('validarCUIT', () => {
    describe('Valid CUITs', () => {
      it('should validate CUIT with calculated verifier', () => {
        // Base CUIT: 2012345678
        const base = '2012345678';
        const verifier = calcularDigitoVerificador(base + '0'); // Add placeholder
        // Recalculate properly
        const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        const digitos = base.split('').map(Number);
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += digitos[i] * multiplicadores[i];
        }
        const resto = suma % 11;
        const resultado = 11 - resto;
        const correctVerifier = resultado === 11 ? 0 : resultado === 10 ? 9 : resultado;
        const validCuit = base + correctVerifier;
        
        expect(padronService.validarCUIT(validCuit)).toBe(true);
      });

      it('should validate CUIT with hyphens when normalized', () => {
        // First find a valid CUIT, then test with hyphens
        const base = '2012345678';
        const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        const digitos = base.split('').map(Number);
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += digitos[i] * multiplicadores[i];
        }
        const resto = suma % 11;
        const resultado = 11 - resto;
        const correctVerifier = resultado === 11 ? 0 : resultado === 10 ? 9 : resultado;
        const validCuitWithHyphens = `${base.slice(0,2)}-${base.slice(2)}-${correctVerifier}`;
        
        expect(padronService.validarCUIT(validCuitWithHyphens)).toBe(true);
      });

      it('should validate known AFIP CUIT (AFIP itself)', () => {
        // AFIP's own CUIT: 33-69345023-9
        expect(padronService.validarCUIT('33693450239')).toBe(true);
      });

      it('should validate another known valid CUIT', () => {
        // Calculate a valid CUIT dynamically
        const base = '2020000002';
        const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        const digitos = base.split('').map(Number);
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += digitos[i] * multiplicadores[i];
        }
        const resto = suma % 11;
        const resultado = 11 - resto;
        const correctVerifier = resultado === 11 ? 0 : resultado === 10 ? 9 : resultado;
        const validCuit = base + correctVerifier;
        
        expect(padronService.validarCUIT(validCuit)).toBe(true);
      });
    });

    describe('Invalid CUITs', () => {
      it('should reject CUIT with wrong length (10 digits)', () => {
        expect(padronService.validarCUIT('2012345678')).toBe(false);
      });

      it('should reject CUIT with wrong length (12 digits)', () => {
        expect(padronService.validarCUIT('201234567890')).toBe(false);
      });

      it('should reject CUIT with letters', () => {
        expect(padronService.validarCUIT('20a23456789')).toBe(false);
      });

      it('should reject CUIT with wrong verifier digit', () => {
        // Find correct digit for base 2012345678, then test wrong ones
        const base = '2012345678';
        const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        const digitos = base.split('').map(Number);
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += digitos[i] * multiplicadores[i];
        }
        const resto = suma % 11;
        const resultado = 11 - resto;
        const correctVerifier = resultado === 11 ? 0 : resultado === 10 ? 9 : resultado;
        
        // Test all wrong verifiers
        for (let i = 0; i <= 9; i++) {
          if (i !== correctVerifier) {
            expect(padronService.validarCUIT(base + i)).toBe(false);
          }
        }
      });

      it('should reject empty string', () => {
        expect(padronService.validarCUIT('')).toBe(false);
      });

      it('should reject only spaces', () => {
        expect(padronService.validarCUIT('           ')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle special characters (not removed)', () => {
        expect(padronService.validarCUIT('20/12345678/9')).toBe(false);
      });

      it('should reject CUIT starting with invalid prefix', () => {
        // Valid prefixes are 20, 23, 24, 27, 30, 33, 34
        expect(padronService.validarCUIT('15123456789')).toBe(false);
      });
    });
  });

  // ==========================================
  // consultarDNI
  // ==========================================
  describe('consultarDNI', () => {
    it('should return consumer final for valid DNI', async () => {
      const result = await padronService.consultarDNI('12345678');

      expect(result.success).toBe(true);
      expect(result.data?.tipoDocumento).toBe('DNI');
      expect(result.data?.numeroDocumento).toBe('12345678');
      expect(result.data?.condicionIVA).toBe('Consumidor Final');
    });

    it('should normalize DNI with hyphens', async () => {
      const result = await padronService.consultarDNI('12-345-678');

      expect(result.success).toBe(true);
      expect(result.data?.numeroDocumento).toBe('12345678');
    });

    it('should reject DNI with 7 digits', async () => {
      const result = await padronService.consultarDNI('1234567');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNI inválido');
    });

    it('should reject DNI with 9 digits', async () => {
      const result = await padronService.consultarDNI('123456789');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNI inválido');
    });

    it('should reject DNI with letters', async () => {
      const result = await padronService.consultarDNI('1234567a');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DNI inválido');
    });

    it('should handle empty DNI', async () => {
      const result = await padronService.consultarDNI('');

      expect(result.success).toBe(false);
    });

    it('should return empty razonSocial and domicilio', async () => {
      const result = await padronService.consultarDNI('12345678');

      expect(result.data?.razonSocial).toBe('');
      expect(result.data?.domicilio).toBe('');
    });
  });

  // ==========================================
  // consultarPadron - AFIP Integration
  // Using valid CUIT: 33693450239 (AFIP's CUIT)
  // ==========================================
  describe('consultarPadron', () => {
    const VALID_CUIT = '33693450239';
    const VALID_CUIT_WITH_HYPHENS = '33-69345023-9';

    beforeEach(() => {
      mockGetCertificateInfo.mockResolvedValue(createCertificateInfo({ cuit: VALID_CUIT }));
      mockGetTicketAcceso.mockResolvedValue(createValidTicketAcceso());
    });

    it('should reject invalid CUIT format', async () => {
      const result = await padronService.consultarPadron(1, '12345678901'); // Wrong verifier

      expect(result.success).toBe(false);
      expect(result.error).toContain('CUIT inválido');
    });

    it('should return error when no certificate found', async () => {
      mockGetCertificateInfo.mockResolvedValue(null);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró certificado');
    });

    it('should return error when certificate has no CUIT', async () => {
      mockGetCertificateInfo.mockResolvedValue({
        ...createCertificateInfo(),
        cuit: undefined,
      });

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró certificado');
    });

    it('should return error when ticket acceso fails', async () => {
      mockGetTicketAcceso.mockResolvedValue(null);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se pudo obtener ticket de acceso');
    });

    it('should return error when ticket has no token', async () => {
      mockGetTicketAcceso.mockResolvedValue({
        ...createValidTicketAcceso(),
        token: null,
      });

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
    });

    it('should handle SOAP client creation error', async () => {
      mockCreateClientAsync.mockRejectedValue(new Error('SOAP connection failed'));

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Error al consultar AFIP');
    });

    it('should handle SOAP getPersona error - No autorizado', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockRejectedValue(new Error('No autorizado para este servicio')),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No está autorizado');
    });

    it('should handle SOAP getPersona error - No existe', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockRejectedValue(new Error('No existe persona con ese CUIT')),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('CUIT no encontrado');
    });

    it('should handle empty AFIP response', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([{}]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontraron datos');
    });

    it('should parse successful AFIP response', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([
          {
            personaReturn: {
              datosGenerales: {
                razonSocial: 'EMPRESA TEST SA',
                domicilioFiscal: {
                  direccion: 'Av. Test 123',
                  localidad: 'Buenos Aires',
                  descripcionProvincia: 'CIUDAD AUTONOMA BUENOS AIRES',
                  codPostal: '1001',
                },
              },
              datosRegimenGeneral: {
                impuesto: [
                  { idImpuesto: 30, descripcionImpuesto: 'IVA' },
                  { idImpuesto: 20, descripcionImpuesto: 'Ganancias' },
                ],
              },
            },
          },
        ]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(true);
      expect(result.data?.razonSocial).toBe('EMPRESA TEST SA');
      expect(result.data?.domicilio).toContain('Av. Test 123');
      expect(result.data?.provincia).toBe('CIUDAD AUTONOMA BUENOS AIRES');
      expect(result.data?.localidad).toBe('Buenos Aires');
      expect(result.data?.codigoPostal).toBe('1001');
      expect(result.data?.condicionIVA).toBe('IVA');
    });

    it('should handle response without IVA impuesto', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([
          {
            personaReturn: {
              datosGenerales: {
                razonSocial: 'PERSONA TEST',
                estadoClave: 'ACTIVO',
              },
            },
          },
        ]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(true);
      expect(result.data?.condicionIVA).toBe('Responsable Inscripto');
    });

    it('should return error for empty razonSocial and domicilio', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([
          {
            personaReturn: {
              datosGenerales: {
                razonSocial: '',
              },
            },
          },
        ]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no tiene datos registrados');
    });

    it('should use nombre when razonSocial is not present', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([
          {
            personaReturn: {
              datosGenerales: {
                nombre: 'JUAN PEREZ',
                domicilioFiscal: {
                  direccion: 'Calle 1',
                },
              },
            },
          },
        ]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      const result = await padronService.consultarPadron(1, VALID_CUIT);

      expect(result.success).toBe(true);
      expect(result.data?.razonSocial).toBe('JUAN PEREZ');
    });

    it('should normalize CUIT with hyphens before querying', async () => {
      const mockSoapClient = {
        getPersonaAsync: vi.fn().mockResolvedValue([
          {
            personaReturn: {
              datosGenerales: {
                razonSocial: 'TEST',
                domicilioFiscal: { direccion: 'Test 1' },
              },
            },
          },
        ]),
      };
      mockCreateClientAsync.mockResolvedValue(mockSoapClient);

      await padronService.consultarPadron(1, VALID_CUIT_WITH_HYPHENS);

      // Verify that the normalized CUIT was used in the request
      expect(mockSoapClient.getPersonaAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          idPersona: VALID_CUIT,
        })
      );
    });
  });

  // ==========================================
  // CUIT Validation Algorithm Tests
  // ==========================================
  describe('CUIT Verifier Digit Algorithm', () => {
    // The algorithm uses multiplicators [5,4,3,2,7,6,5,4,3,2]
    // and calculates: 11 - (suma % 11)
    // Special cases: result 11 -> 0, result 10 -> 9

    it('should correctly validate dynamically calculated CUITs', () => {
      // Test the algorithm by calculating the correct verifier
      const bases = ['2012345678', '3012345678', '2712345678'];
      const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

      bases.forEach(base => {
        const digitos = base.split('').map(Number);
        let suma = 0;
        for (let i = 0; i < 10; i++) {
          suma += digitos[i] * multiplicadores[i];
        }
        const resto = suma % 11;
        const resultado = 11 - resto;
        const correctVerifier = resultado === 11 ? 0 : resultado === 10 ? 9 : resultado;
        const validCuit = base + correctVerifier;

        // The calculated CUIT should be valid
        expect(padronService.validarCUIT(validCuit)).toBe(true);
        
        // All other verifiers should be invalid
        for (let i = 0; i <= 9; i++) {
          if (i !== correctVerifier) {
            expect(padronService.validarCUIT(base + i)).toBe(false);
          }
        }
      });
    });

    it('should validate AFIP official CUIT', () => {
      // AFIP's own CUIT is publicly known and verified
      expect(padronService.validarCUIT('33693450239')).toBe(true);
    });
  });
});

