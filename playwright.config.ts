import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT || 3001)
const baseURL = process.env.E2E_BASE_URL?.trim() || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--disable-dev-shm-usage'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && node server/index.mjs',
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: String(port),
          NODE_ENV: 'test',
        },
      },
})
