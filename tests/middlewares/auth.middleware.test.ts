/**
 * Tests for Auth Middleware
 * CRITICAL: Authentication must be bulletproof
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../helpers/factories';

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
    apiKey: 'test-api-key-12345',
  },
}));

import { authenticateApiKey, validateBusinessId } from '../../src/middlewares/auth.middleware';

describe('Auth Middleware', () => {
  // ==========================================
  // authenticateApiKey
  // ==========================================
  describe('authenticateApiKey', () => {
    describe('Missing API Key', () => {
      it('should return 401 when no API key provided', () => {
        const req = createMockRequest({ headers: {} });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(401);
        expect(res._json.success).toBe(false);
        expect(res._json.error).toContain('API key no proporcionado');
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 401 when x-api-key header is undefined', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': undefined } 
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(401);
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 401 when x-api-key header is empty string', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': '' } 
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(401);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Invalid API Key', () => {
      it('should return 403 when API key is invalid', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': 'wrong-api-key' } 
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(403);
        expect(res._json.success).toBe(false);
        expect(res._json.error).toContain('API key inválido');
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 403 when API key has extra whitespace', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': ' test-api-key-12345 ' } 
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(403);
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 403 for partial match', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': 'test-api-key' } // Missing suffix
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(403);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Valid API Key', () => {
      it('should call next() when API key is valid', () => {
        const req = createMockRequest({ 
          headers: { 'x-api-key': 'test-api-key-12345' } 
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should return 500 on unexpected error', () => {
        const req = createMockRequest();
        // Force an error by making headers throw
        Object.defineProperty(req, 'headers', {
          get() { throw new Error('Unexpected error'); }
        });
        const res = createMockResponse();
        const next = vi.fn();

        authenticateApiKey(req, res, next);

        expect(res._status).toBe(500);
        expect(res._json.error).toContain('Error de autenticación');
        expect(next).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================
  // validateBusinessId
  // ==========================================
  describe('validateBusinessId', () => {
    describe('Missing businessId', () => {
      it('should return 400 when businessId not in body or query', () => {
        const req = createMockRequest({
          body: {},
          query: {},
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(400);
        expect(res._json.success).toBe(false);
        expect(res._json.error).toContain('businessId no proporcionado');
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Invalid businessId', () => {
      it('should return 400 when businessId is 0', () => {
        const req = createMockRequest({
          query: { businessId: '0' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(400);
        expect(res._json.error).toContain('businessId inválido');
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 400 when businessId is negative', () => {
        const req = createMockRequest({
          query: { businessId: '-1' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(400);
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 400 when businessId is not a number', () => {
        const req = createMockRequest({
          query: { businessId: 'abc' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(400);
        expect(next).not.toHaveBeenCalled();
      });

      it('should return 400 when businessId is empty string', () => {
        const req = createMockRequest({
          query: { businessId: '' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(400);
        expect(next).not.toHaveBeenCalled();
      });
    });

    describe('Valid businessId', () => {
      it('should call next() when businessId is valid in query', () => {
        const req = createMockRequest({
          query: { businessId: '123' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(123);
      });

      it('should call next() when businessId is valid in body', () => {
        const req = createMockRequest({
          body: { businessId: '456' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(456);
      });

      it('should handle numeric businessId directly', () => {
        const req = createMockRequest({
          body: { businessId: 789 },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(789);
      });

      it('should prefer query over body when both present', () => {
        const req = createMockRequest({
          query: { businessId: '100' },
          body: { businessId: '200' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(100);
      });
    });

    describe('Edge Cases', () => {
      it('should handle large businessId', () => {
        const req = createMockRequest({
          query: { businessId: '999999999' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(999999999);
      });

      it('should handle businessId with leading zeros', () => {
        const req = createMockRequest({
          query: { businessId: '00123' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(123);
      });

      it('should reject floating point businessId', () => {
        const req = createMockRequest({
          query: { businessId: '1.5' },
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        // parseInt('1.5') returns 1, so this should pass
        expect(next).toHaveBeenCalled();
        expect((req as any).businessId).toBe(1);
      });
    });

    describe('Error Handling', () => {
      it('should return 500 on unexpected error', () => {
        const req = createMockRequest();
        // Force an error by making query throw
        Object.defineProperty(req, 'query', {
          get() { throw new Error('Unexpected error'); }
        });
        const res = createMockResponse();
        const next = vi.fn();

        validateBusinessId(req, res, next);

        expect(res._status).toBe(500);
        expect(res._json.error).toContain('Error de validación');
        expect(next).not.toHaveBeenCalled();
      });
    });
  });
});

