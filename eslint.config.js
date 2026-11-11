import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'test-results', '.playwright'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts that also evaluate code inside the page (playwright).
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        performance: 'readonly',
        globalThis: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
