/**
 * Test setup for geco-afip
 * This file runs before each test file
 */

import { vi, beforeEach } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.AFIP_ENVIRONMENT = 'homologacion';
process.env.PORT = '4001';
process.env.AUTH_SECRET = 'test-secret-key-for-testing';

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

