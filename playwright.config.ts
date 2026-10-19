import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env['COGENTA_E2E_PORT'] ?? 4660)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: '.cogenta/remediation-2026-10-03/e2e-results.json' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'fr-FR',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'firefox-security',
      testMatch: '**/menu-security.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-security',
      testMatch: '**/menu-security.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'node scripts/playwright-server.mjs',
    url: `http://127.0.0.1:${port}/qa-e2e-ready`,
    timeout: 180_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
})
