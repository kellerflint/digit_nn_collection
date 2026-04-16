import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,   // serial — tests share a live backend DB
  retries: 0,
  timeout: 8_000,       // whole test must finish in 8s
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 3_000,    // click/fill/etc
    navigationTimeout: 5_000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',
  webServer: {
    command: 'npm run dev -- --port 5173',
    cwd: '../frontend',
    port: 5173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
})
