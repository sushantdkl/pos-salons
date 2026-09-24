import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  // Lint every source extension — without this, .jsx files were silently skipped.
  { files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'] },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    '.next-qa/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.kilo/**',
  ]),
]);

export default eslintConfig;
