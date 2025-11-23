import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

export default tseslint.config(
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint strict type-checked rules (maximum strictness)
  ...tseslint.configs.strictTypeChecked,

  // Prettier (disable conflicting rules)
  prettier,

  // Custom configuration for TypeScript files
  {
    files: ['src/**/*.ts'],

    plugins: {
      import: importPlugin,
      'unused-imports': unusedImports,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,  // v8 feature - faster than 'project'
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // Import rules
      'import/no-self-import': 'warn',
      'import/no-cycle': 'warn',
      'import/order': ['error', {
        'groups': [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'never',
        'alphabetize': { order: 'asc', caseInsensitive: true }
      }],

      // Unused imports (with auto-fix)
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      }],

      // Code quality
      'curly': ['error', 'multi-line'],
      'no-template-curly-in-string': 'error',
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      'radix': 'error',
      'no-irregular-whitespace': ['error', { skipComments: true }],

      // TypeScript-specific (already in strictTypeChecked, but explicit for visibility)
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/strict-boolean-expressions': ['warn', {
        allowString: true,
        allowNumber: true,
        allowNullableObject: true,
      }],
    },
  },

  // Ignore patterns
  {
    ignores: ['dist/**', 'node_modules/**', '*.mjs', '*.js'],
  }
);
