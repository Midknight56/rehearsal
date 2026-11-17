import { expect, type Page } from '@playwright/test';
import { assertFocusVisibleAndUnobscured, readStatus, tabTo } from './helpers';

/**
 * 9.3 (matrix row 20): the journey with keyboard input only. Files are chosen through the input element, which is the
 * only way to hand a file to headless Chromium. The Compare, Export JSON and re-import steps are added by task 19.
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
  await page.keyboard.press('Space');
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
}
