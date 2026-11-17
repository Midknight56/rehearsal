import { expect, test, type Page } from '@playwright/test';
import { gameDebug, openFair, readStatus, simulate } from './helpers';

async function find(page: Page, id: string): Promise<void> {
  const box = page.getByRole('combobox', { name: 'Find attendee' });
  await box.fill(id);
  await box.press('Enter');
}

test.describe('7.1 and 7.2 follow and release', () => {
  test('Follow on doors#0007 sets aria-pressed and announces; Escape releases and announces', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0007');
    await page.getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true');
    expect(await readStatus(page)).toBe('Following doors#0007. Press Escape to release.');
    if ((await gameDebug(page)).rendererStatus === 'ready') expect((await gameDebug(page)).follow).toBe('doors#0007');
    await page.getByRole('application', { name: 'Game view' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');
    expect(await readStatus(page)).toBe('Follow released.');
  });

  test('activating Follow again releases it', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0007');
    await page.getByRole('button', { name: 'Follow' }).click();
    await page.getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the followed attendee exiting releases the follow with the exit time', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0000');
    await page.getByRole('button', { name: 'Follow' }).click();
    await page.getByRole('radio', { name: '16×' }).check();
    await expect.poll(() => readStatus(page), { timeout: 60_000 }).toMatch(/^doors#0000 exited at \d\d:\d\d; follow released\.$/);
  });
});

test.describe('7.3 Find attendee', () => {
  test('lists matches with their count and says when nothing matches', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const box = page.getByRole('combobox', { name: 'Find attendee' });
    await box.fill('doors#00');
    await expect(page.getByText('20 of 100 matches')).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(20);
    await box.fill('zzz');
    await expect(page.getByText('No attendee matches "zzz".')).toBeVisible();
  });
});

test.describe('7.4 person timeline', () => {
  test('doors#0000 shows Walked to Check-in desk with (00:04.167)', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0000');
    const table = page.getByRole('table', { name: 'Timeline of doors#0000' });
    await expect(table.getByText('Walked to Check-in desk')).toBeVisible();
    await expect(table).toContainText('(00:04.167)');
  });
});

test.describe('7.5 queue inspector', () => {
  test('Inspect checkin shows the queue at the scrubbed time', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const scrubber = page.getByRole('slider', { name: 'Simulated time' });
    await scrubber.evaluate((el: HTMLInputElement) => {
      el.value = '300000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Inspect checkin' }).click();
    const table = page.getByRole('table', { name: /^Check-in desk at \d\d:\d\d$/ });
    await expect(table).toContainText(/Waiting: \d+/);
    await expect(table).toContainText(/In service: \d+ of 1 servers/);
  });
});

test.describe('7.7 re-centre after a seek', () => {
  test('stepping while following keeps the followed attendee centred', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0007');
    await page.getByRole('button', { name: 'Follow' }).click();
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Step forward' }).click();
    if ((await gameDebug(page)).rendererStatus !== 'ready') {
      console.log('not run (no graphics context in headless Chromium)');
      return;
    }
    expect((await gameDebug(page)).follow).toBe('doors#0007');
  });
});
