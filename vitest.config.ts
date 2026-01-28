import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // Test files
        'tests/**/*',
        '**/*.test.ts',
        '**/*.spec.ts',
        // Entry points
        'src/server.ts',
        // Configuration
        'vitest.config.ts',
        // Logger (simple wrapper)
        'src/utils/logger.ts',
        // Types (TypeScript types only)
        'src/types/**/*',
        // Config (environment variables)
        'src/config/config.ts',
        // Certificate service - complex crypto operations that require real certificates
        // Tested via integration tests and mocked at higher level
        'src/services/certificate.service.ts',
      ],
      // CRITICAL: This is a billing microservice - high thresholds required
      // Note: certificate.service.ts is excluded because it handles low-level
      // crypto/file operations that are better tested via integration tests
      thresholds: {
        statements: 70,
        branches: 75,
        functions: 80,
        lines: 70,
      },
    },
    testTimeout: 30000, // 30s for SOAP tests
  },
});

