import { mkdirSync, writeFileSync } from 'node:fs';
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
    for (const label of ['5 m \u00b7 4.2 s', '12 m \u00b7 10.0 s', '21 m \u00b7 17.5 s']) await expect(page.getByText(label).first()).toBeVisible();
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

test.describe('task 16 labels screenshot', () => {
  test('saves docs/acceptance/img/labels.png: the Game view header with Follow pressed and the landing pitch line', async ({ page }) => {
    await page.goto('/');
    const pitch = page.getByText('A spreadsheet, a floor plan and a game engine, stitched into an event rehearsal.');
    await expect(pitch).toBeVisible();
    const pitchShot = await pitch.screenshot();
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    await simulate(page);
    const box = page.getByRole('combobox', { name: 'Find attendee' });
    await box.fill('doors#0000');
    await box.press('Enter');
    await page.getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true');
    const header = page.getByTestId('game-view-panel');
    await expect(page.getByText('Replay of replication 0, one example run')).toBeVisible();
    const headerShot = await header.screenshot();
    // One image: the two captures stacked on a blank page (data URIs, no network).
    const sheet = await page.context().newPage();
    const img = (shot: Buffer) => '<img style="display:block;margin:8px" src="data:image/png;base64,' + shot.toString('base64') + '">';
    await sheet.setContent('<body style="margin:0;background:#fff">' + img(pitchShot) + img(headerShot) + '</body>');
    mkdirSync('docs/acceptance/img', { recursive: true });
    writeFileSync('docs/acceptance/img/labels.png', await sheet.locator('body').screenshot());
    await sheet.close();
  });
});
