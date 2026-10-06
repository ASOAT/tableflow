import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', 'dist/**', 'release/**', 'tests/component-lab/dist/**', '.npm-cache/**', 'test-results/**', 'playwright-report/**', '.test-artifacts/**'] },
  { ...js.configs.recommended, files: ['**/*.mjs'], languageOptions: { globals: { console: 'readonly', setTimeout: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly' } } },
  { files: ['scripts/package-smoke.mjs', 'scripts/smoke-world.mjs', 'scripts/store-screenshots.mjs'], languageOptions: { globals: { chrome: 'readonly', navigator: 'readonly', document: 'readonly', window: 'readonly' } } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.ts'] })),
  { files: ['**/*.ts'], rules: { 'no-debugger': 'error', 'no-unreachable': 'error', 'no-constant-condition': 'error' } },
];
