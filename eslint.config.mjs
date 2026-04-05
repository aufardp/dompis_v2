import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // 1. Load basic Next.js configs
  ...compat.extends('next/core-web-vitals'),

  // 2. Custom Rules & Ignored Files
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: [
      '.next/*',
      'out/*',
      'build/*',
      'node_modules/*',
      'eslint.config.mjs',
    ],
  },
];

export default eslintConfig;
