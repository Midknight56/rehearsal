import { expect, test } from '@playwright/test';
import { gameDebug, openFair, simulate } from './helpers';

const BANNER = 'The game view could not start in this browser. The timeline and result tables have every number.';

test.describe('6.8 the canvas cannot start', () => {
  test('?renderer=off shows the banner, keeps the inspector, the timeline and the results working', async ({ page }) => {
    await page.goto('/?renderer=off');
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    await simulate(page);
    await expect(page.getByText(BANNER)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry game view' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    const box = page.getByRole('combobox', { name: 'Find attendee' });
    await box.fill('doors#0001');
    await box.press('Enter');
    await expect(page.getByRole('table', { name: 'Timeline of doors#0001' })).toBeVisible();
    await page.getByRole('button', { name: 'Inspect checkin' }).click();
    await expect(page.getByRole('table', { name: /^Check-in desk at/ })).toBeVisible();
    await expect(page.getByRole('table', { name: /result|metric/i }).first()).toBeVisible();
  });

  test('forceRendererFailure(true) then Retry game view after forceRendererFailure(false) draws the trace', async ({ page }) => {
    await openFair(page);
    await page.evaluate(() => (window as unknown as { __rehearsal: { forceRendererFailure(b: boolean): void } }).__rehearsal.forceRendererFailure(true));
    await simulate(page);
    await expect(page.getByText(BANNER)).toBeVisible();
    await page.evaluate(() => (window as unknown as { __rehearsal: { forceRendererFailure(b: boolean): void } }).__rehearsal.forceRendererFailure(false));
    await page.getByRole('button', { name: 'Retry game view' }).click();
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect((await gameDebug(page)).rendererStatus).toBe('ready');
    // Seek to 60,000 ms, past the first arrival at 12,208 ms, through the scrubber, as follow.spec.ts does.
    await page.getByRole('slider', { name: 'Simulated time' }).evaluate((el: HTMLInputElement) => {
      el.value = '60000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(async () => (await gameDebug(page)).spritesDrawn).toBeGreaterThan(0);
  });
});
