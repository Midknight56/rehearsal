import { expect, test, type Page } from '@playwright/test';
import { applyImport, importFile, openFair, readHash, simulate } from './helpers';

// 8.5, replay half (task 16): one scenario carries the workbook, the floor plan, the run and the replay.
async function checkReplayOf(page: Page, expectations: { checkinSeconds: string; hashFromPanel: string }): Promise<void> {
  await simulate(page);
  expect(await readHash(page)).toBe(expectations.hashFromPanel);
  await expect(page.getByRole('heading', { name: 'Game view' })).toContainText(expectations.hashFromPanel.slice(0, 8));
  const box = page.getByRole('combobox', { name: 'Find attendee' });
  await box.fill('doors#0000');
  await box.press('Enter');
  await expect(page.getByRole('table', { name: 'Timeline of doors#0000' })).toContainText(`(${expectations.checkinSeconds})`);
}

test.describe('8.5 import, simulate, replay on one scenario', () => {
  test('the baseline: workbook cells, one hash, floor plan labels and the 00:04.167 walk', async ({ page }) => {
    await openFair(page);
    await importFile(page, 'public/examples/harbor-hall/harbor-hall.xlsx');
    await applyImport(page);
    await expect(page.getByLabel('servers of checkin')).toHaveValue('1');
    await expect(page.getByLabel('servers of packs')).toHaveValue('2');
    await expect(page.getByLabel('cell_x of packs')).toHaveValue('34');
    const hash = await readHash(page);
    await expect(page.getByText('Check-in desk').first()).toBeVisible();
    await page.getByRole('button', { name: 'Inspect packs' }).click();
    await checkReplayOf(page, { checkinSeconds: '00:04.167', hashFromPanel: hash });
  });

  test('the shorter route: packs at (14,8), labels 5 m · 4.2 s, 4 m · 3.3 s, 9 m · 7.5 s', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('scenario-tab-shorter-route').click();
    await expect(page.getByLabel('cell_x of packs')).toHaveValue('14');
    await expect(page.getByLabel('cell_y of packs')).toHaveValue('8');
    for (const label of ['5 m · 4.2 s', '4 m · 3.3 s', '9 m · 7.5 s']) await expect(page.getByText(label).first()).toBeVisible();
    await checkReplayOf(page, { checkinSeconds: '00:04.167', hashFromPanel: await readHash(page) });
  });
});
