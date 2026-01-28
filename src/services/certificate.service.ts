import fs from 'fs';
import path from 'path';
import forge from 'node-forge';
import config from '../config/config';
import logger from '../utils/logger';
import { CertificateInfo } from '../types/afip.types';

/**
 * Servicio para gestionar certificados AFIP
 */
export class CertificateService {
  private certsCache: Map<number, CertificateInfo> = new Map();

  /**
   * Obtener información del certificado para un business
   */
  async getCertificateInfo(businessId: number): Promise<CertificateInfo | null> {
    try {
      // Verificar cache
      if (this.certsCache.has(businessId)) {
        const cached = this.certsCache.get(businessId)!;
        // Verificar si el certificado aún es válido
        if (cached.validTo && cached.validTo > new Date()) {
          return cached;
        }
        // Si expiró, remover del cache
        this.certsCache.delete(businessId);
      }

      const certDir = path.join(config.certsPath, businessId.toString());
      const infoPath = path.join(certDir, 'info.json');

      if (!fs.existsSync(infoPath)) {
        logger.warn(`No certificate info found for business ${businessId}`);
        return null;
      }

      const infoData = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));

      const certInfo: CertificateInfo = {
        businessId,
        cuit: infoData.cuit,
        certPath: path.join(certDir, 'cert.pem'),
        keyPath: path.join(certDir, 'key.pem'),
        password: infoData.password,
        validFrom: infoData.validFrom ? new Date(infoData.validFrom) : undefined,
        validTo: infoData.validTo ? new Date(infoData.validTo) : undefined,
      };

      // Verificar que los archivos existan
      if (!fs.existsSync(certInfo.certPath) || !fs.existsSync(certInfo.keyPath)) {
        logger.error(`Certificate files missing for business ${businessId}`);
        return null;
      }

      // Guardar en cache
      this.certsCache.set(businessId, certInfo);

      return certInfo;
    } catch (error: any) {
      logger.error(`Error getting certificate info for business ${businessId}:`, error.message);
      return null;
    }
  }

  /**
   * Guardar certificado desde archivo .pfx/.p12
   */
  async saveCertificateFromPfx(
    businessId: number,
    cuit: string,
    pfxBuffer: Buffer,
    password: string
  ): Promise<boolean> {
    try {
      logger.info(`Saving certificate for business ${businessId}, CUIT: ${cuit}`);

      // Decodificar PFX
      const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      // Extraer certificado y clave privada
      const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = bags[forge.pki.oids.certBag]?.[0];

      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];

      if (!certBag || !keyBag) {
        throw new Error('No se pudo extraer el certificado o la clave privada del archivo PFX');
      }

      const certificate = certBag.cert;
      const privateKey = keyBag.key;

      if (!certificate || !privateKey) {
        throw new Error('Certificado o clave privada inválidos');
      }

      // Convertir a PEM
      const certPem = forge.pki.certificateToPem(certificate);
      const keyPem = forge.pki.privateKeyToPem(privateKey);

      // Extraer fechas de validez
      const validFrom = certificate.validity.notBefore;
      const validTo = certificate.validity.notAfter;

      // Crear directorio si no existe
      const certDir = path.join(config.certsPath, businessId.toString());
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }

      // Guardar archivos
      const certPath = path.join(certDir, 'cert.pem');
      const keyPath = path.join(certDir, 'key.pem');
      const infoPath = path.join(certDir, 'info.json');

      fs.writeFileSync(certPath, certPem, 'utf-8');
      fs.writeFileSync(keyPath, keyPem, 'utf-8');

      // Guardar información
      const info = {
        businessId,
        cuit,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        password: password, // Guardamos el password encriptado (en producción usar un vault)
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');

      // Limpiar cache
      this.certsCache.delete(businessId);

      logger.info(`Certificate saved successfully for business ${businessId}`);
      logger.info(`Certificate valid from ${validFrom.toISOString()} to ${validTo.toISOString()}`);

      return true;
    } catch (error: any) {
      logger.error(`Error saving certificate for business ${businessId}:`, error.message);
      return false;
    }
  }

  /**
   * Generar CSR (Certificate Signing Request)
   */
  async generateCSR(
    businessId: number,
    cuit: string,
    organizationName: string
  ): Promise<string | null> {
    try {
      logger.info(`Generating CSR for business ${businessId}, CUIT: ${cuit}`);

      // Generar par de claves
      const keys = forge.pki.rsa.generateKeyPair(2048);

      // Crear CSR
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = keys.publicKey;
      csr.setSubject([
        { name: 'commonName', value: `CUIT ${cuit}` },
        { name: 'organizationName', value: organizationName },
        { name: 'countryName', value: 'AR' },
      ]);

      // Firmar CSR
      csr.sign(keys.privateKey);

      // Convertir a PEM
      const csrPem = forge.pki.certificationRequestToPem(csr);
      const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

      // Guardar clave privada temporalmente
      const certDir = path.join(config.certsPath, businessId.toString());
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }

      const keyPath = path.join(certDir, 'key.pem');
      const csrPath = path.join(certDir, 'request.csr');

      fs.writeFileSync(keyPath, keyPem, 'utf-8');
      fs.writeFileSync(csrPath, csrPem, 'utf-8');

      logger.info(`CSR generated successfully for business ${businessId}`);
      logger.info(`CSR saved to: ${csrPath}`);

      return csrPem;
    } catch (error: any) {
      logger.error(`Error generating CSR for business ${businessId}:`, error.message);
      return null;
    }
  }

  /**
   * Guardar certificado desde archivo .crt con su clave privada .key
   */
  async saveCertificateFromCrtKey(
    businessId: number,
    crtBuffer: Buffer,
    keyBuffer: Buffer,
    password: string
  ): Promise<boolean> {
    try {
      logger.info(`Saving certificate from CRT + KEY for business ${businessId}`);

      const certDir = path.join(config.certsPath, businessId.toString());

      // Crear directorio si no existe
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
        logger.info(`Created certificate directory: ${certDir}`);
      }

      // Convertir el CRT a PEM si es necesario
      let certPem: string;
      let certificate;
      try {
        // Intentar como PEM directo
        certPem = crtBuffer.toString('utf-8');
        certificate = forge.pki.certificateFromPem(certPem);
        logger.info('Certificate parsed as PEM');
      } catch (pemError) {
        logger.info('Failed to parse as PEM, trying DER format');
        try {
          // Si falla, intentar como DER
          const der = forge.util.createBuffer(crtBuffer.toString('binary'));
          const asn1 = forge.asn1.fromDer(der);
          certificate = forge.pki.certificateFromAsn1(asn1);
          certPem = forge.pki.certificateToPem(certificate);
          logger.info('Certificate parsed as DER and converted to PEM');
        } catch (derError: any) {
          logger.error('Failed to parse certificate:', derError.message);
          throw new Error(
            'No se pudo leer el certificado. Asegúrate de que sea un archivo .crt válido de AFIP.'
          );
        }
      }

      // Convertir la clave privada a PEM si es necesario
      let keyPem: string;
      let privateKey;
      try {
        // Intentar como PEM directo
        keyPem = keyBuffer.toString('utf-8');
        privateKey = forge.pki.privateKeyFromPem(keyPem);
        logger.info('Private key parsed as PEM');
      } catch (pemError) {
        logger.error('Failed to parse private key as PEM');
        throw new Error(
          'No se pudo leer la clave privada. Asegúrate de que sea un archivo .key válido en formato PEM.'
        );
      }

      // Log del subject completo para debugging
      logger.info(
        'Certificate subject attributes:',
        JSON.stringify(
          certificate.subject.attributes.map((a: any) => ({
            type: a.type,
            name: a.name,
            shortName: a.shortName,
            value: a.value,
          }))
        )
      );

      // También buscar en el issuer
      logger.info(
        'Certificate issuer attributes:',
        JSON.stringify(
          certificate.issuer.attributes.map((a: any) => ({
            type: a.type,
            name: a.name,
            shortName: a.shortName,
            value: a.value,
          }))
        )
      );

      // Extraer CUIT del certificado
      let cuit: string | null = null;

      // 1. Intentar obtener del serialNumber field del subject
      const serialNumberField = certificate.subject.getField('serialNumber');
      if (serialNumberField && serialNumberField.value) {
        logger.info(`SerialNumber field found: "${serialNumberField.value}"`);
        const cuitMatch = serialNumberField.value.match(/\d{11}/);
        if (cuitMatch) {
          cuit = cuitMatch[0];
          logger.info(`CUIT extraído del serialNumber field: ${cuit}`);
        }
      } else {
        logger.info('No serialNumber field found in certificate subject');
      }

      // 2. Buscar en CN (Common Name)
      if (!cuit) {
        const cnField =
          certificate.subject.getField('CN') || certificate.subject.getField('commonName');
        if (cnField && cnField.value) {
          logger.info(`CN field found: "${cnField.value}"`);
          const cuitMatch = cnField.value.match(/\d{11}/);
          if (cuitMatch) {
            cuit = cuitMatch[0];
            logger.info(`CUIT extraído del CN: ${cuit}`);
          }
        } else {
          logger.info('No CN/commonName field found in certificate');
        }
      }

      // 3. Buscar en todos los atributos del subject por shortName conocidos
      if (!cuit) {
        const knownCuitFields = [
          'serialNumber',
          'CN',
          'commonName',
          'UID',
          'userId',
          'SERIALNUMBER',
          'O',
          'organizationName',
        ];
        for (const fieldName of knownCuitFields) {
          const field = certificate.subject.attributes.find(
            (a: any) => a.shortName === fieldName || a.name === fieldName
          );
          if (field && field.value) {
            logger.info(`Found field ${fieldName}: "${field.value}"`);
            const cuitMatch = field.value.toString().match(/\d{11}/);
            if (cuitMatch) {
              cuit = cuitMatch[0];
              logger.info(`CUIT extraído del campo ${fieldName}: ${cuit}`);
              break;
            }
          }
        }
      }

      // 4. Buscar en el subject completo como último recurso
      if (!cuit) {
        const subjectStr = certificate.subject.attributes
          .map((a: any) => `${a.name || a.shortName}=${a.value}`)
          .join(', ');
        logger.info(`Searching CUIT in full subject: "${subjectStr}"`);
        const cuitMatch = subjectStr.match(/\d{11}/);
        if (cuitMatch) {
          cuit = cuitMatch[0];
          logger.info(`CUIT extraído del subject completo: ${cuit}`);
        }
      }

      // 5. Buscar en el issuer si no se encontró en el subject
      if (!cuit) {
        const issuerStr = certificate.issuer.attributes
          .map((a: any) => `${a.name || a.shortName}=${a.value}`)
          .join(', ');
        logger.info(`Searching CUIT in issuer: "${issuerStr}"`);
        const cuitMatch = issuerStr.match(/\d{11}/);
        if (cuitMatch) {
          cuit = cuitMatch[0];
          logger.info(`CUIT extraído del issuer: ${cuit}`);
        }
      }

      if (!cuit) {
        logger.error(
          'No CUIT found in certificate. Full subject:',
          JSON.stringify(certificate.subject.attributes)
        );
        throw new Error(
          'No se pudo extraer el CUIT del certificado. El certificado no contiene un CUIT válido de 11 dígitos.'
        );
      }

      logger.info(`✓ CUIT final extraído: ${cuit}`);

      // Extraer fechas de validez
      const validFrom = certificate.validity.notBefore;
      const validTo = certificate.validity.notAfter;

      // Guardar certificado PEM
      const certPath = path.join(certDir, 'cert.pem');
      fs.writeFileSync(certPath, certPem, 'utf-8');
      logger.info(`Certificate saved to: ${certPath}`);

      // Guardar clave privada PEM
      const keyPath = path.join(certDir, 'key.pem');
      fs.writeFileSync(keyPath, keyPem, 'utf-8');
      logger.info(`Private key saved to: ${keyPath}`);

      // Crear archivo .pfx para compatibilidad
      const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, {
        algorithm: '3des',
      });
      const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
      const pfxPath = path.join(certDir, 'cert.pfx');
      fs.writeFileSync(pfxPath, p12Der, 'binary');
      logger.info(`PFX file created at: ${pfxPath}`);

      // Actualizar info.json
      const infoPath = path.join(certDir, 'info.json');
      const info = {
        businessId,
        cuit,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        password: password,
        createdAt: new Date().toISOString(),
        uploadMethod: 'crt-key',
      };

      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');
      logger.info(`Certificate info saved to: ${infoPath}`);

      // Limpiar cache
      this.certsCache.delete(businessId);

      logger.info(`✓ Certificate and key saved successfully for business ${businessId}`);
      logger.info(
        `✓ Certificate valid from ${validFrom.toISOString()} to ${validTo.toISOString()}`
      );

      return true;
    } catch (error: any) {
      logger.error(
        `Error saving certificate from CRT + KEY for business ${businessId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Guardar certificado desde archivo .crt (AFIP) combinándolo con la clave existente
   */
  async saveCertificateFromCrt(
    businessId: number,
    crtBuffer: Buffer,
    password: string,
    providedCuit?: string
  ): Promise<boolean> {
    try {
      logger.info(`Saving certificate from CRT for business ${businessId}`);

      const certDir = path.join(config.certsPath, businessId.toString());

      // Crear directorio si no existe
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
        logger.info(`Created certificate directory: ${certDir}`);
      }

      // Convertir el CRT a PEM si es necesario
      let certPem: string;
      let certificate;
      try {
        // Intentar como PEM directo
        certPem = crtBuffer.toString('utf-8');
        certificate = forge.pki.certificateFromPem(certPem); // Validar
        logger.info('Certificate parsed as PEM');
      } catch (pemError) {
        logger.info('Failed to parse as PEM, trying DER format');
        try {
          // Si falla, intentar como DER
          const der = forge.util.createBuffer(crtBuffer.toString('binary'));
          const asn1 = forge.asn1.fromDer(der);
          certificate = forge.pki.certificateFromAsn1(asn1);
          certPem = forge.pki.certificateToPem(certificate);
          logger.info('Certificate parsed as DER and converted to PEM');
        } catch (derError: any) {
          logger.error('Failed to parse certificate:', derError.message);
          throw new Error(
            'No se pudo leer el certificado. Asegúrate de que sea un archivo .crt válido de AFIP.'
          );
        }
      }

      // Log del subject completo para debugging
      logger.info(
        'Certificate subject attributes:',
        JSON.stringify(
          certificate.subject.attributes.map((a: any) => ({
            type: a.type,
            name: a.name,
            shortName: a.shortName,
            value: a.value,
          }))
        )
      );

      // También buscar en extensiones y otros campos del certificado
      logger.info('Certificate serial number (raw):', certificate.serialNumber);
      if (certificate.extensions) {
        logger.info(
          'Certificate extensions:',
          JSON.stringify(
            certificate.extensions.map((e: any) => ({ name: e.name, id: e.id, value: e.value }))
          )
        );
      }

      // Usar el CUIT proporcionado o extraerlo del certificado
      let cuit: string | null = providedCuit || null;

      if (cuit) {
        // Validar que el CUIT proporcionado tenga 11 dígitos
        const cleanCuit = cuit.replace(/[^0-9]/g, '');
        if (cleanCuit.length !== 11) {
          throw new Error('El CUIT proporcionado debe tener 11 dígitos.');
        }
        cuit = cleanCuit;
        logger.info(`✓ Usando CUIT proporcionado: ${cuit}`);
      } else {
        // Intentar extraer CUIT del certificado
        // El CUIT puede estar en varios campos según el tipo de certificado de AFIP

        // 1. Intentar obtener del serialNumber field del subject
        const serialNumberField = certificate.subject.getField('serialNumber');
        if (serialNumberField && serialNumberField.value) {
          logger.info(`SerialNumber field found: "${serialNumberField.value}"`);
          const cuitMatch = serialNumberField.value.match(/\d{11}/);
          if (cuitMatch) {
            cuit = cuitMatch[0];
            logger.info(`CUIT extraído del serialNumber field: ${cuit}`);
          }
        } else {
          logger.info('No serialNumber field found in certificate subject');
        }

        // 2. Buscar en CN (Common Name)
        if (!cuit) {
          const cnField =
            certificate.subject.getField('CN') || certificate.subject.getField('commonName');
          if (cnField && cnField.value) {
            logger.info(`CN field found: "${cnField.value}"`);
            const cuitMatch = cnField.value.match(/\d{11}/);
            if (cuitMatch) {
              cuit = cuitMatch[0];
              logger.info(`CUIT extraído del CN: ${cuit}`);
            }
          } else {
            logger.info('No CN/commonName field found in certificate');
          }
        }

        // 3. Buscar en todos los atributos del subject por shortName conocidos
        if (!cuit) {
          const knownCuitFields = [
            'serialNumber',
            'CN',
            'commonName',
            'UID',
            'userId',
            'SERIALNUMBER',
          ];
          for (const fieldName of knownCuitFields) {
            const field = certificate.subject.attributes.find(
              (a: any) => a.shortName === fieldName || a.name === fieldName
            );
            if (field && field.value) {
              logger.info(`Found field ${fieldName}: "${field.value}"`);
              const cuitMatch = field.value.toString().match(/\d{11}/);
              if (cuitMatch) {
                cuit = cuitMatch[0];
                logger.info(`CUIT extraído del campo ${fieldName}: ${cuit}`);
                break;
              }
            }
          }
        }

        // 4. Buscar en el subject completo como último recurso
        if (!cuit) {
          const subjectStr = certificate.subject.attributes
            .map((a: any) => `${a.name || a.shortName}=${a.value}`)
            .join(', ');
          logger.info(`Searching CUIT in full subject: "${subjectStr}"`);
          const cuitMatch = subjectStr.match(/\d{11}/);
          if (cuitMatch) {
            cuit = cuitMatch[0];
            logger.info(`CUIT extraído del subject completo: ${cuit}`);
          }
        }

        if (!cuit) {
          logger.error(
            'No CUIT found in certificate. Full subject:',
            JSON.stringify(certificate.subject.attributes)
          );
          throw new Error(
            'No se pudo extraer el CUIT del certificado. El certificado no contiene un CUIT válido de 11 dígitos. Por favor proporciona el CUIT manualmente.'
          );
        }

        logger.info(`✓ CUIT extraído del certificado: ${cuit}`);
      }

      // Verificar si existe una clave privada
      const keyPath = path.join(certDir, 'key.pem');
      let privateKey;

      if (fs.existsSync(keyPath)) {
        // Usar la clave privada existente
        logger.info('Using existing private key');
        const keyPem = fs.readFileSync(keyPath, 'utf-8');
        privateKey = forge.pki.privateKeyFromPem(keyPem);
      } else {
        // Generar una nueva clave privada
        logger.info('Generating new private key');
        const keys = forge.pki.rsa.generateKeyPair(2048);
        privateKey = keys.privateKey;
        const keyPem = forge.pki.privateKeyToPem(privateKey);
        fs.writeFileSync(keyPath, keyPem, 'utf-8');
        logger.info('New private key generated and saved');
      }

      // Extraer fechas de validez
      const validFrom = certificate.validity.notBefore;
      const validTo = certificate.validity.notAfter;

      // Guardar certificado PEM
      const certPath = path.join(certDir, 'cert.pem');
      fs.writeFileSync(certPath, certPem, 'utf-8');

      // Crear archivo .pfx para compatibilidad
      const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, {
        algorithm: '3des',
      });
      const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
      const pfxPath = path.join(certDir, 'cert.pfx');
      fs.writeFileSync(pfxPath, p12Der, 'binary');

      // Actualizar info.json
      const infoPath = path.join(certDir, 'info.json');
      const info = {
        businessId,
        cuit,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
        password: password,
        createdAt: new Date().toISOString(),
        uploadMethod: 'crt', // Marca que se subió como CRT
      };

      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), 'utf-8');

      // Limpiar cache
      this.certsCache.delete(businessId);

      logger.info(`Certificate saved successfully from CRT for business ${businessId}`);
      logger.info(`Certificate valid from ${validFrom.toISOString()} to ${validTo.toISOString()}`);

      return true;
    } catch (error: any) {
      logger.error(`Error saving certificate from CRT for business ${businessId}:`, error.message);
      throw error;
    }
  }

  /**
   * Verificar si un certificado está válido
   */
  async isCertificateValid(businessId: number): Promise<boolean> {
    const certInfo = await this.getCertificateInfo(businessId);

    if (!certInfo || !certInfo.validTo) {
      return false;
    }

    const now = new Date();
    return certInfo.validTo > now;
  }

  /**
   * Leer certificado como string
   */
  readCertificate(certPath: string): string {
    return fs.readFileSync(certPath, 'utf-8');
  }

  /**
   * Leer clave privada como string
   */
  readPrivateKey(keyPath: string): string {
    return fs.readFileSync(keyPath, 'utf-8');
  }
}

// Singleton
export const certificateService = new CertificateService();
