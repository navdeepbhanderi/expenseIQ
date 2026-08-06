// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

/**
 * Type-aware linting is the point here.
 *
 * A plain syntactic linter on a NestJS + Prisma codebase catches almost
 * nothing worth catching. The rules that actually earn their keep —
 * no-floating-promises, no-misused-promises, require-await — need the type
 * checker, and each of them maps to a real failure mode in this app: a
 * forgotten `await` on a Prisma write silently loses data, and an async
 * function passed where a sync one is expected swallows its rejection.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/generated/**',
      // This file configures the linter; it isn't part of the TS program, so
      // type-aware rules have no project to resolve it against.
      'eslint.config.mjs',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierRecommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── Bugs, not style ────────────────────────────────────────────────
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // ── Typing discipline ──────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Decorator metadata means Nest classes routinely have empty constructors
    // and parameter properties that read as unused to a syntactic pass.
    files: ['**/*.module.ts', '**/*.controller.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  {
    // Tests deliberately construct invalid input and poke at internals.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  {
    // The seed script is a CLI: printing to stdout is its job.
    files: ['prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
