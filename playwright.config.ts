import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'cd api && STORAGE_DRIVER=local PORT=3000 RL_AUTH_NEW_PER_MINUTE=1000 RL_AUTH_NEW_PER_DAY=1000 RL_UPLOAD_PER_MINUTE=1000 RL_INVITE_ACCEPT_PER_MINUTE=1000 node dist/main',
      url: 'http://localhost:3000/health',
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      command: 'npx serve -s ui -l 5173',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 20000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
