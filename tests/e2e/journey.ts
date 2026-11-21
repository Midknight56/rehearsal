import { expect, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { assertFocusVisibleAndUnobscured, backTabTo, readHash, readStatus, tabTo } from './helpers';

/**
 * 9.3 (matrix row 20): the journey with keyboard input only. Files are chosen through the input element, which is the
 * only way to hand a file to headless Chromium. After the replay it compares (a baseline and a candidate picked by keyboard),
 * returns to the plan, exports the scenario as JSON and opens that file again (9.3, task 19).
 */
export async function keyboardJourney(page: Page): Promise<void> {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('try-community-fair')).toBeFocused();
  await assertFocusVisibleAndUnobscured(page);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();

  await tabTo(page, 'Import', { checkFocus: true });
  await page.keyboard.press('Enter');
  await page.getByTestId('import-workbook').setInputFiles('public/examples/harbor-hall/harbor-hall.xlsx');
  await expect(page.getByText('Sheets read: Arrivals, Stations, Settings.')).toBeVisible();
  await tabTo(page, 'Apply import', { checkFocus: true });
  await page.keyboard.press('Enter');
  expect(await readStatus(page)).toContain('Imported');

  await tabTo(page, 'Inspect packs', { checkFocus: true });
  await page.keyboard.press('Enter');
  await tabTo(page, 'Floor plan', { checkFocus: true });
  await page.keyboard.press('ArrowUp');
  await expect(page.getByLabel('cell_y of packs')).toHaveValue('11');
  await page.keyboard.press('Escape');
  for (let i = 0; i < 29; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(page.getByRole('list', { name: 'Blocked cells' })).toContainText('(5, 5)');

  await tabTo(page, 'Simulate', { checkFocus: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Run complete', { timeout: 60_000 });

  await tabTo(page, 'Game view', { checkFocus: true });
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  await page.keyboard.press('Space');
  if (reduced) {
    // 9.4: the result loaded paused, so the first Space starts playback and the second returns to Play.
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
  }
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  const readout = page.getByText(/^\d\d:\d\d \/ \d\d:\d\d$/);
  const before = ((await readout.textContent()) ?? '').slice(0, 5);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => ((await readout.textContent()) ?? '').slice(0, 5)).not.toBe(before);

  await tabTo(page, 'Find attendee', { checkFocus: true });
  await page.keyboard.type('doors#0007');
  await page.keyboard.press('Enter');
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(await readStatus(page)).toBe('Follow released.');

  // 9.3 (task 19): Compare, back to the plan, Export JSON, then open that file through Open JSON.
  const title = ((await page.getByRole('heading', { level: 1 }).textContent()) ?? '').trim();
  const hash = await readHash(page);
  await backTabTo(page, 'Compare', { checkFocus: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Compare scenarios' })).toBeFocused();
  // Since the blind test fixes (2026-11-20) the first tab and the next one are preselected; the keyboard still picks both.
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await tabTo(page, new RegExp(`^(Use as baseline|Baseline): ${escaped}$`), { checkFocus: true });
  await page.keyboard.press('Enter');
  await tabTo(page, /^(Use as candidate|Candidate): Harbor Hall Community Fair: extra check-in staff$/, { checkFocus: true });
  await page.keyboard.press('Enter');
  await tabTo(page, 'Run comparison', { checkFocus: true });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
  await backTabTo(page, 'Back to plan', { checkFocus: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeFocused();

  await tabTo(page, 'Export JSON', { checkFocus: true });
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const name = /^[a-z0-9-]+-([0-9a-f]{8})\.json$/.exec(download.suggestedFilename());
  expect(name?.[1]).toBe(hash.slice(0, 8));
  await page.getByTestId('import-json').setInputFiles(await download.path());
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await readStatus(page)).toBe(`Opened "${title}".`);
  await expect.poll(async () => {
    try {
      return await readHash(page);
    } catch {
      return '';
    }
  }).toBe(hash);
}
