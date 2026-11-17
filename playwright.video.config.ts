import { defineConfig, devices } from '@playwright/test';

// The storyboard capture (requirement 13): headless Chromium, 1,280 x 720, video on. BASE_URL is the deployed build. Without it
// Playwright starts the plain production build on this repository's preview port 4274 and stops it when the run ends.
export const LOCAL_URL = 'http://localhost:4274';
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/video',
  outputDir: 'tests/video/out/raw',
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL === undefined || BASE_URL === '' ? LOCAL_URL : BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer:
    BASE_URL === undefined || BASE_URL === ''
      ? {
        command: 'npx vite build --outDir dist-prod && npx vite preview --outDir dist-prod --port 4274 --strictPort',
        url: LOCAL_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
      : undefined,
});
