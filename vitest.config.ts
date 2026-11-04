import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { vitestLogicFiles } from './tests/support/unit-files.ts'

export default defineConfig({
  // Never load root .env: only tests/support/empty.env is used by explicit dotenv imports.
  envDir: fileURLToPath(new URL('./tests/support', import.meta.url)),
  plugins: [vue()],
  define: { 'import.meta.client': true },
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    globals: false,
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          environment: 'node',
          include: vitestLogicFiles,
          setupFiles: ['./tests/support/vitest-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'components',
          environment: 'happy-dom',
          include: ['tests/components/**/*.test.ts'],
          setupFiles: ['./tests/support/vitest-setup.ts', './tests/support/component-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'artifacts/coverage',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'app/utils/**/*.ts',
        'app/queries/**/*.ts',
        'app/composables/useAccountMutation.ts',
        'app/composables/useFormulaMutations.ts',
        'app/composables/useManualFormulaCreation.ts',
        'app/composables/useAccountLibrary.ts',
        'app/composables/useAccountCategories.ts',
        'app/composables/useAccountQueryOwner.ts',
        'app/composables/useFormulaViewsInvalidation.ts',
        'shared/**/*.ts',
        'app/components/ChatComposer.vue',
        'app/components/TaskProgress.vue',
        'app/components/DiagnosticCopy.vue',
      ],
      exclude: ['shared/types/**'],
    },
  },
})
