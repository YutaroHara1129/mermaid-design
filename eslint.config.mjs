import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.runtime/**',
      '.test-output/**',
      '.benchmark-output/**',
      '.vitest/**',
      'coverage/**',
      '.husky/_/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, mermaid: 'readonly' } },
  },
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
];
