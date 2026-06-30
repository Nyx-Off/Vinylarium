import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Pragmatic baseline (not type-checked, so it's fast and CI-friendly). The
// codebase intentionally uses `any` at the Discogs/Prisma boundaries, so that
// rule is off; unused vars are a warning to keep the signal useful without
// blocking. Tighten over time.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'prisma/**', '**/*.test.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setInterval: 'readonly', setTimeout: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', fetch: 'readonly', Response: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
