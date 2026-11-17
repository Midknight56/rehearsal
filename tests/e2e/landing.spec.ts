import { expect, test } from '@playwright/test';
import { readStatus } from './helpers';

test.describe('10.1 landing', () => {
  test('shows the heading, the pitch line and the buttons, with Try the community fair as the first Tab stop and no modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeVisible();
    await expect(page.getByText('A spreadsheet, a floor plan and a game engine, stitched into an event rehearsal.')).toBeVisible();
    await expect(page.getByText('Everything runs in this browser.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import a spreadsheet or CSV' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('try-community-fair')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('10.2 the community fair example', () => {
  test('makes three requests and opens three tabs with the baseline current', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/examples/')) requested.push(new URL(r.url()).pathname);
    });
    await page.goto('/');
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    expect(requested.sort()).toEqual([
      '/examples/harbor-hall/baseline.json',
      '/examples/harbor-hall/plus-one-checkin.json',
      '/examples/harbor-hall/shorter-route.json',
    ]);
    for (const key of ['baseline', 'plus-one-checkin', 'shorter-route']) await expect(page.getByTestId(`scenario-tab-${key}`)).toBeVisible();
    await expect(page.getByTestId('scenario-tab-plus-one-checkin')).toHaveText('Harbor Hall Community Fair: extra check-in staff');
    await expect(page.getByTestId('scenario-tab-shorter-route')).toHaveText('Harbor Hall Community Fair: shorter walking route');
  });

  test('keeps the landing screen and says why when a request fails with a 500', async ({ page }) => {
    await page.route('**/examples/harbor-hall/baseline.json', (route) => route.fulfill({ status: 500, body: 'no' }));
    await page.goto('/');
    await page.getByTestId('try-community-fair').click();
    await expect.poll(() => readStatus(page)).toBe('The community fair example could not be loaded (500). Reload the page, or import a spreadsheet.');
    await expect(page.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeVisible();
    await expect(page.getByTestId('try-community-fair')).toBeFocused();
  });
});
