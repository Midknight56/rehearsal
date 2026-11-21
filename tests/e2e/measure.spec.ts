import { test, expect } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { gameDebug, loadFixture, openFair, simulate } from './helpers';

// A measurement, not a check (matrix row 29): it runs only with MEASURE=1, prints readings and asserts no timing.
//   $env:MEASURE = '1'; npx playwright test tests/e2e/measure.spec.ts; Remove-Item Env:MEASURE
// Readings are for the test build (dist-test on port 4273) in headless Chromium and are recorded in docs/performance.md.
test.skip(process.env.MEASURE !== '1', 'a measurement, not a check: set MEASURE=1');

// Named throttling profile for the first-load reading, applied through CDP Network.emulateNetworkConditions.
// The values are the Lighthouse mobile simulation values: 150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up.
const PROFILE = { name: 'Lighthouse mobile (150 ms latency, 1.6 Mbit/s down, 750 kbit/s up)', latency: 150, downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8), uploadThroughput: Math.round((750 * 1024) / 8) };

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

test('timing.pairedMs from the Compare screen, three runs', async ({ page }) => {
  const readings: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    await openFair(page);
    await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByTestId('pick-baseline-baseline').click();
    await page.getByTestId('pick-candidate-plus-one-checkin').click();
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
    const text = (await page.getByText(/^30 paired runs took [\d.]+ s on this device$/).textContent()) ?? '';
    readings.push(Number(/took ([\d.]+) s/.exec(text)?.[1]) * 1000);
    await page.goto('/');
  }
  console.log(`MEASURE pairedMs (shown to 0.1 s) readings: ${readings.map((r) => r.toFixed(0)).join(', ')} ms; median ${median(readings).toFixed(0)} ms; headless Chromium, ${test.info().project.name}, test build`);
});

test('first load to a usable Try the community fair example under a named throttling profile', async ({ browser }) => {
  const readings: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const context = await browser.newContext({ baseURL: 'http://localhost:4273' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: PROFILE.latency, downloadThroughput: PROFILE.downloadThroughput, uploadThroughput: PROFILE.uploadThroughput });
    const started = Date.now();
    await page.goto('/');
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeVisible();
    readings.push(Date.now() - started);
    await context.close();
  }
  console.log(`MEASURE first load (navigation start to the baseline heading and the Simulate button) under ${PROFILE.name}, latency ${PROFILE.latency} ms, download ${PROFILE.downloadThroughput} B/s, upload ${PROFILE.uploadThroughput} B/s, cold cache, headless Chromium: ${readings.join(', ')} ms; median ${median(readings)} ms`);
});

async function framesWhilePlaying(page: import('@playwright/test').Page, label: string, seekMs?: number): Promise<void> {
  const debug = await gameDebug(page);
  if (debug.rendererStatus !== 'ready') {
    console.log(`MEASURE framesLast2s ${label}: not measured (renderer status ${String(debug.rendererStatus)})`);
    return;
  }
  if (seekMs !== undefined) {
    // Seek to a busy part of the run (the scrubber reads the trace; playback continues from there).
    await page.getByRole('slider', { name: 'Simulated time' }).evaluate((el: HTMLInputElement, value: number) => {
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, seekMs);
  }
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  const samples: number[] = [];
  const drawn: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    await page.waitForTimeout(2_100); // a sample is the frame count of the last 2 s, so wait a full window between samples
    const reading = await gameDebug(page);
    samples.push(reading.framesLast2s as number);
    drawn.push(reading.spritesDrawn as number);
  }
  console.log(`MEASURE framesLast2s ${label}: ${samples.join(', ')} frames in 2 s; median ${median(samples)} (${(median(samples) / 2).toFixed(1)} frames per second); spritesDrawn at the samples ${drawn.join(', ')}; headless Chromium, test build`);
}

test('framesLast2s for Harbor Hall baseline at 1x', async ({ page }) => {
  await openFair(page);
  await simulate(page);
  await page.getByRole('radio', { name: '1\u00d7' }).check();
  await framesWhilePlaying(page, 'Harbor Hall baseline at 1x', 300_000);
});

test('framesLast2s for large-1200 at 4x', async ({ page }) => {
  await openFair(page);
  await loadFixture(page, 'large-1200');
  await simulate(page);
  await page.getByRole('radio', { name: '4\u00d7' }).check();
  await framesWhilePlaying(page, 'tests/e2e/fixtures/large-1200.json at 4x', 600_000);
});
