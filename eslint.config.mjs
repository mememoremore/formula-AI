// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import stylistic from '@stylistic/eslint-plugin'

export default withNuxt(
  {
    ignores: [
      '.nuxt/**',
      '.output/**',
      '.tools/**',
      'tmp/**',
      'artifacts/**',
      'backups/**',
      'server/generated/**',
    ],
  },
  {
    name: 'formula/conventions',
    rules: {
      // Prettier owns whitespace; optional Vue props intentionally default to undefined.
      'vue/html-self-closing': [
        'warn',
        { html: { void: 'always', normal: 'always', component: 'always' } },
      ],
      'vue/require-default-prop': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-invalid-void-type': ['error', { allowInGenericTypeArguments: true }],
    },
  },
  {
    name: 'formula/frontend-spacing',
    files: ['app/**/*.{vue,ts,js}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        // Related declarations remain compact; do not split a multi-variable declaration.
        { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: '*', next: 'function' },
        { blankLine: 'always', prev: 'function', next: '*' },
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
      ],
    },
  },
  {
    name: 'formula/page-fragments',
    files: ['app/pages/**/*.vue'],
    // Existing Vue 3 pages use fragments; page transitions are not enabled in this project.
    rules: { 'vue/no-multiple-template-root': 'off' },
  },
  {
    name: 'formula/security-filters',
    files: [
      'shared/formula-title.ts',
      'shared/formula-validation.ts',
      'shared/navigation.ts',
      'shared/schemas/explanation.ts',
      'shared/schemas/library-input.ts',
      'server/services/image-upload.ts',
      'server/api/account/exports/[[]id]/download.get.ts',
      'server/chat/settings.ts',
      'app/utils/export-state.ts',
      'tests/support/test-diagnostics.ts',
    ],
    // These expressions reject control characters in untrusted input; they are intentional.
    rules: { 'no-control-regex': 'off' },
  },
  {
    name: 'formula/dictionary-cleanup',
    files: [
      'server/worker/recovery.ts',
      'shared/navigation.ts',
      'tests/support/test-runtime.ts',
      'tests/support/vitest-setup.ts',
    ],
    rules: { '@typescript-eslint/no-dynamic-delete': 'off' },
  },
  {
    name: 'formula/callback-contracts',
    files: [
      'scripts/test-environment.ts',
      'tests/task-recovery.test.ts',
      'server/worker/start.ts',
      'tests/e2e/worker.ts',
    ],
    // Both synchronous and asynchronous teardown callbacks are supported.
    rules: { '@typescript-eslint/no-invalid-void-type': 'off' },
  },
  {
    name: 'formula/test-generators',
    files: ['tests/chat-governance.test.ts', 'tests/explanation-api.test.ts'],
    // Failure fixtures deliberately throw before producing their first streamed chunk.
    rules: { 'require-yield': 'off' },
  },
  {
    name: 'formula/injected-browser-snippets',
    files: ['tests/design-preview/*.js'],
    // Loaded as browser snippets by the preview tools, rather than imported as modules.
    rules: { 'no-unused-vars': 'off' },
  },
)
