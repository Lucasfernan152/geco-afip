const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Warnings - cosas a mejorar gradualmente
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
      '@typescript-eslint/prefer-as-const': 'warn',
      
      // Desactivados
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-case-declarations': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '*.config.js',
    ],
  }
);

