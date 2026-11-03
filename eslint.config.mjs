import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/**', 'knowledge/**', '.claude/**', 'node_modules/**'] },
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          'packages/*/tsconfig.json',
          'packages/*/tsconfig.test.json',
          'apps/web/tsconfig.app.json',
          'apps/web/tsconfig.test.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
