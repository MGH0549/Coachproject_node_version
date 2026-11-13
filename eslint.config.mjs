import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'generated/**',
      'coverage/**',
      '.tmp/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
      },
    },
  },
);
