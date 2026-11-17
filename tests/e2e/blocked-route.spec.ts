import { expect, test } from '@playwright/test';
import { openFair, readStatus, simulate } from './helpers';

// 4.4, matrix row 16. The stage already blocks (20, 20) to (20, 23); blocking (20, 0) to (20, 19) one by one through the
// layout panel (Space on a blocked cell would unblock it) closes column x = 20 for every y of the 24 rows.
test('blocking every corridor between checkin and packs blocks the run and keeps the previous results labelled stale', async ({ page }) => {
  await openFair(page);
  await simulate(page);
  for (let y = 0; y < 20; y++) {
    await page.getByLabel('Blocked cell x').fill('20');
    await page.getByLabel('Blocked cell y').fill(String(y));
    await page.getByRole('button', { name: 'Add cell' }).click();
  }
  await page.getByRole('button', { name: 'Simulate' }).click();
  const message = 'Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs). Clear a corridor on the floor plan or move a station.';
  await expect(page.getByText(message).first()).toBeVisible();
  expect(await readStatus(page)).toBe(message);
  await expect(page.getByText('Stale, rerun').first()).toBeVisible();
  await expect(page.getByRole('table', { name: /result|metric/i }).first()).toBeVisible();
});
