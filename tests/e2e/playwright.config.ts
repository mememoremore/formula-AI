import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { loadTestManifest } from '../support/test-runtime.ts'

const config = loadTestManifest()
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 180000,
  expect: { timeout: 30000 },
  retries: 0,
  maxFailures: 1,
  reporter: [['line']],
  outputDir: resolve('tmp/r1-test', config.runId, 'browser-private'),
  use: {
    baseURL: config.apiUrl,
    browserName: 'chromium',
    headless: true,
    actionTimeout: 30000,
    trace: { mode: 'retain-on-failure', snapshots: false, screenshots: false, sources: false },
    screenshot: 'off',
    video: 'off',
    acceptDownloads: true,
  },
})
