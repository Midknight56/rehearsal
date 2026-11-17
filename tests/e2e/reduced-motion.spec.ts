import { expect, test, type Page } from '@playwright/test';
import { openFair, simulate } from './helpers';
import { keyboardJourney } from './journey';

// 9.4 (matrix row 19)
async function expectReducedMotionLayout(page: Page): Promise<void> {
  await simulate(page);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');
  const order = await page.getByRole('application', { name: 'Game view' }).evaluate((wrapper) => {
    const all = [...wrapper.ownerDocument.querySelectorAll('button, input[type="range"], input[type="radio"]')];
    const name = (el: Element) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
    return all.map(name);
  });
  expect(order.indexOf('Step back')).toBeLessThan(order.indexOf('Play'));
  expect(order.indexOf('Step forward')).toBeLessThan(order.indexOf('Play'));
  expect(order.indexOf('Simulated time')).toBeLessThan(order.indexOf('Play'));
  const duration = await page.evaluate(() => getComputedStyle(document.body).transitionDuration);
  expect(duration).toBe('0s');
}

test.describe('prefers-reduced-motion: reduce', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('the result loads paused, Step and the scrubber come before Play, Follow starts off, transitions are 0s', async ({ page }) => {
    await openFair(page);
    await expectReducedMotionLayout(page);
  });

  test('the keyboard journey of 9.3 still completes', async ({ page }) => {
    await keyboardJourney(page);
  });
});

test.describe('the Motion toggle set to Reduce', () => {
  test('gives the same layout and is persisted as motion in localStorage', async ({ page }) => {
    await openFair(page);
    await page.getByRole('combobox', { name: 'Motion' }).selectOption('reduce');
    await expectReducedMotionLayout(page);
    const stored = await page.evaluate(() => localStorage.getItem('rehearsal.prefs.v1'));
    expect(JSON.parse(stored as string)).toEqual({ version: 1, motion: 'reduce' });
  });
});
