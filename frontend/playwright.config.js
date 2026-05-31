import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1400, height: 1100 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
