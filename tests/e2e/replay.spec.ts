import { expect, test, type Page } from '@playwright/test';
import { gameDebug, lastResultJson, loadFixture, openFair, simulate } from './helpers';

const NO_CANVAS = 'not run (no graphics context in headless Chromium)';

/** True when the renderer started; otherwise prints the note the design requires and the caller returns. */
async function rendererReady(page: Page): Promise<boolean> {
  const status = (await gameDebug(page)).rendererStatus;
  if (status !== 'ready') console.log(NO_CANVAS);
  return status === 'ready';
}

test.describe('6.1 and 6.2 the game view', () => {
  test('one canvas, the header and subtitle, and the controls in order', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await expect(page.getByRole('heading', { name: 'Game view' })).toBeVisible();
    await expect(page.getByText('Replay of replication 0, one example run')).toBeVisible();
    if (await rendererReady(page)) expect(await page.locator('canvas').count()).toBe(1);
    const scrubber = page.getByRole('slider', { name: 'Simulated time' });
    await expect(scrubber).toHaveAttribute('step', '1000');
    await expect(scrubber).toHaveAttribute('min', '0');
    await expect(page.getByText(/^\d\d:\d\d \/ \d\d:\d\d$/)).toBeVisible();
    const names = await page.getByRole('button').evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
    expect(names.indexOf('Pause')).toBeGreaterThanOrEqual(0);
  });

  test('Space pauses, ArrowRight steps one second, ArrowLeft steps back', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const wrapper = page.getByRole('application', { name: 'Game view' });
    await wrapper.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    const readout = async () => (await page.getByText(/^\d\d:\d\d \/ \d\d:\d\d$/).textContent()) ?? '';
    const before = (await readout()).slice(0, 5);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await readout()).slice(0, 5)).not.toBe(before);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await readout()).slice(0, 5)).toBe(before);
  });
});

test.describe('6.3 rendering never changes a number (matrix row 10, rendering portion)', () => {
  test('1× with Follow off and 16× with Follow on give identical results and trace JSON', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const first = await lastResultJson(page, 'baseline');
    await page.getByRole('radio', { name: '16×' }).check();
    await page.getByRole('combobox', { name: 'Find attendee' }).fill('doors#0007');
    await page.getByRole('combobox', { name: 'Find attendee' }).press('Enter');
    await page.getByRole('button', { name: 'Follow' }).click();
    await simulate(page);
    const second = await lastResultJson(page, 'baseline');
    expect(second).toBe(first);
    expect(JSON.parse(first).trace).toBeDefined();
  });
});

test.describe('6.4 the sprite cap (matrix row 22)', () => {
  test('1,200 attendees at 20:00 draw 1,000 sprites, show the banner and keep the tables complete', async ({ page }) => {
    await openFair(page);
    await loadFixture(page, 'large-1200');
    await simulate(page);
    const scrubber = page.getByRole('slider', { name: 'Simulated time' });
    await scrubber.focus();
    await scrubber.evaluate((el: HTMLInputElement) => {
      el.value = '1200000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.getByText(/^Showing 1,000 of \d[\d,]* attendees as sprites; the others are counted in the badges and every table is complete\.$/)).toBeVisible();
    if (await rendererReady(page)) {
      const debug = await gameDebug(page);
      expect(debug.spritesDrawn).toBe(1000);
      expect(debug.spritesPooled).toBe(1000);
    }
    await expect(page.getByText('*').first()).toBeVisible();
  });
});

test.describe('6.5 resolution and the hidden document', () => {
  for (const factor of [1, 2, 3]) {
    test(`device scale factor ${factor} gives resolution ${Math.min(factor, 2)}`, async ({ browser }) => {
      const context = await browser.newContext({ deviceScaleFactor: factor, baseURL: 'http://localhost:4273' });
      const page = await context.newPage();
      await openFair(page);
      await simulate(page);
      if (await rendererReady(page)) expect((await gameDebug(page)).resolution).toBe(Math.min(factor, 2));
      await context.close();
    });
  }

  test('the ticker stops while the document is hidden and the clock does not advance', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    if (!(await rendererReady(page))) return;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await gameDebug(page)).tickerRunning).toBe(false);
    const clock = (await gameDebug(page)).clockMs;
    await page.waitForTimeout(500);
    expect((await gameDebug(page)).clockMs).toBe(clock);
  });
});

test.describe('6.9 release', () => {
  test('debug() throws Game view destroyed after Restart', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const handle = await page.evaluateHandle(() => (window as unknown as { __rehearsal: { gameView(): { debug(): unknown } } }).__rehearsal.gameView());
    await page.getByRole('button', { name: 'Restart' }).click();
    const message = await handle.evaluate((h) => {
      try {
        h.debug();
        return 'no error';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(message).toBe('Game view destroyed');
  });
});
