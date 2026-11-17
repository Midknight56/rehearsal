import { defineConfig, devices } from '@playwright/test';

// Headless Chromium only. Two preview servers: the test build (window.__rehearsal present, set by
// VITE_REHEARSAL_TEST=1 from .env.test and `--mode test`) and a plain production build for hook-absent.spec.ts.
// Playwright starts and stops both; nothing is left running.
export const TEST_URL = 'http://localhost:4273';
export const PRODUCTION_URL = 'http://localhost:4274';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: TEST_URL,
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npx vite build --mode test --outDir dist-test && npx vite preview --outDir dist-test --port 4273 --strictPort',
      url: TEST_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite build --outDir dist-prod && npx vite preview --outDir dist-prod --port 4274 --strictPort',
      url: PRODUCTION_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
