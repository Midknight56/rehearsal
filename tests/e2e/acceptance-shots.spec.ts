import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadFixture, openFair, readStatus, simulate } from './helpers';

// Task 14: the four headless screenshots of docs/acceptance/scenario-editor-and-replay.md. Each test asserts what its image shows.
const IMG = 'docs/acceptance/img';
const shot = async (page: Page, name: string): Promise<void> => {
  mkdirSync(IMG, { recursive: true });
  await page.screenshot({ path: `${IMG}/${name}.png`, fullPage: true });
};

test('screenshot: the drag of packs to (12,7)', async ({ page }) => {
  await openFair(page);
  const from = (await page.locator('[data-station="packs"]').boundingBox())!;
  const to = (await page.locator('rect[data-cell="12,7"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await readStatus(page)).toBe('Welcome packs moved to (12, 7).');
  await shot(page, 'drag-packs');
});

test('screenshot: the blocked-route message', async ({ page }) => {
  await openFair(page);
  await simulate(page);
  for (let y = 0; y < 20; y++) {
    await page.getByLabel('Blocked cell x').fill('20');
    await page.getByLabel('Blocked cell y').fill(String(y));
    await page.getByRole('button', { name: 'Add cell' }).click();
  }
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByText('Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs).', { exact: false }).first()).toBeVisible();
  await shot(page, 'blocked-route');
});

test('screenshot: the sprite-cap banner', async ({ page }) => {
  await openFair(page);
  await loadFixture(page, 'large-1200');
  await simulate(page);
  const scrubber = page.getByRole('slider', { name: 'Simulated time' });
  await scrubber.evaluate((el: HTMLInputElement) => {
    el.value = '1200000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByText(/^Showing 1,000 of \d[\d,]* attendees as sprites/)).toBeVisible();
  await shot(page, 'sprite-cap');
});

test.describe('reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('screenshot: the control order with reduced motion', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const order = await page.getByRole('group', { name: 'Replay controls' }).evaluate((g) => [...g.querySelectorAll('button, input')].map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''));
    expect(order.indexOf('Step back')).toBeLessThan(order.indexOf('Play'));
    await shot(page, 'reduced-motion-order');
  });
});