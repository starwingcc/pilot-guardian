// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config'
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default defineConfig([
  globalIgnores([
    '.output',
    '.wxt',
    'coverage',
    'playwright-report',
    'test-results',
    'docs',
    '.agents',
    '.claude',
    'mockups',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['entrypoints/background.ts'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
])
