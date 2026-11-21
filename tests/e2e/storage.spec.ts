import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT, saveErrorText } from '../../src/comparison/labels';
import { lastResultJson, openFair, readHash, readStatus, simulate } from './helpers';

// Requirements 10.3 to 10.7 (matrix row 18 and the saved-scenario part of row 14).
const TITLE = 'Harbor Hall Community Fair: baseline';
const baselineText = readFileSync('public/examples/harbor-hall/baseline.json', 'utf8');
const plusOneText = readFileSync('public/examples/harbor-hall/plus-one-checkin.json', 'utf8');

const failNextWrite = (page: Page, name: string): Promise<void> =>
  page.evaluate((n) => (window as unknown as { __rehearsal: { storage: { failNextWrite(n: string): void } } }).__rehearsal.storage.failNextWrite(n), name);
const stored = (page: Page, key: string): Promise<string | null> => page.evaluate((k) => localStorage.getItem(k), key);
const jsonFile = (name: string, text: string): { name: string; mimeType: string; buffer: Buffer } => ({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });

test.describe('10.3 Save and the saved list', () => {
  test('writes the bare scenario, announces the count, and the landing screen offers it after a reload', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('save-scenario').click();
    await expect(page.getByRole('status')).toHaveText(`Saved "${TITLE}" (1 of 10).`);
    const raw = JSON.parse((await stored(page, 'rehearsal.scenarios.v1')) as string) as { version: number; scenarios: { id: string; scenario: { schemaVersion: number } }[] };
    expect(raw.version).toBe(1);
    expect(raw.scenarios).toHaveLength(1);
    expect(raw.scenarios[0]?.scenario.schemaVersion).toBe(1);
    await page.getByTestId('save-scenario').click();
    expect(JSON.parse((await stored(page, 'rehearsal.scenarios.v1')) as string).scenarios).toHaveLength(1);

    await page.reload();
    await page.getByRole('button', { name: 'Open a saved scenario' }).click();
    await page.getByRole('button', { name: `Open ${TITLE}` }).click();
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  });

  test('Delete asks first, Cancel keeps the entry and Delete removes it', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('save-scenario').click();
    await expect(page.getByRole('status')).toContainText('Saved');
    await page.reload();
    await page.getByRole('button', { name: 'Open a saved scenario' }).click();
    await page.getByRole('button', { name: `Delete ${TITLE}` }).click();
    await expect(page.getByText(`Delete "${TITLE}" from this browser?`)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await stored(page, 'rehearsal.scenarios.v1')).toContain(TITLE);
    await page.getByRole('button', { name: `Delete ${TITLE}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open a saved scenario' })).toHaveCount(0);
    expect(JSON.parse((await stored(page, 'rehearsal.scenarios.v1')) as string).scenarios).toEqual([]);
  });

  test('unreadable storage starts with none and says so once', async ({ page }) => {
    await page.addInitScript(() => {
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string): string | null {
        if (key === 'rehearsal.scenarios.v1') throw new DOMException('denied', 'SecurityError');
        return original.call(this, key);
      };
    });
    await page.goto('/');
    await expect.poll(() => readStatus(page)).toBe('Saved scenarios could not be read; starting with none.');
    await expect(page.getByRole('button', { name: 'Open a saved scenario' })).toHaveCount(0);
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  });
});

test.describe('10.4 and 10.5 a failed save (matrix row 18)', () => {
  test('a quota failure shows the reason and the recovery controls and changes nothing in memory', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.getByLabel('servers of checkin').fill('2');
    await page.getByLabel('servers of checkin').press('Enter');
    const hashBefore = await readHash(page);
    const resultBefore = await lastResultJson(page, 'baseline');
    const undoBefore = await page.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled');

    await failNextWrite(page, 'QuotaExceededError');
    await page.getByTestId('save-scenario').click();
    await expect(page.getByTestId('save-error')).toHaveText('Could not save: storage quota exceeded.');
    await expect(page.getByRole('status')).toHaveText(saveErrorText('quota'));
    await expect(page.getByTestId('retry-save')).toBeVisible();
    await expect(page.getByTestId('download-scenario-json')).toBeVisible();
    await expect(page.getByTestId('download-comparison-csv')).toHaveCount(0);

    expect(await readHash(page)).toBe(hashBefore);
    expect(await lastResultJson(page, 'baseline')).toBe(resultBefore);
    expect(await page.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe(undoBefore);
    await expect(page.getByLabel('servers of checkin')).toHaveValue('2');
    expect(await stored(page, 'rehearsal.scenarios.v1')).toBeNull();

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-scenario-json').click()]);
    expect(download.suggestedFilename()).toMatch(/^harbor-hall-community-fair-baseline-[0-9a-f]{8}\.json$/);

    await page.getByTestId('retry-save').click();
    await expect(page.getByTestId('save-error')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText(`Saved "${TITLE}" (1 of 10).`);
  });

  test('a full list of 10 refuses an eleventh scenario with the limit reason', async ({ page }) => {
    await openFair(page);
    await page.evaluate((text) => {
      const scenario = JSON.parse(text) as { id: string };
      const scenarios = Array.from({ length: 10 }, (_, i) => ({
        id: `other-${i}`, title: `Other ${i}`, savedAt: '2026-11-16T10:00:00.000Z', hash: 'a'.repeat(64), scenario: { ...scenario, id: `other-${i}` },
      }));
      localStorage.setItem('rehearsal.scenarios.v1', JSON.stringify({ version: 1, scenarios }));
    }, baselineText);
    const before = await stored(page, 'rehearsal.scenarios.v1');
    await page.getByTestId('save-scenario').click();
    await expect(page.getByTestId('save-error')).toHaveText('Could not save: 10 saved scenarios already; delete one first.');
    expect(await stored(page, 'rehearsal.scenarios.v1')).toBe(before);
  });

  test('storage that refuses writes reports that it is unavailable', async ({ page }) => {
    await openFair(page);
    await failNextWrite(page, 'SecurityError');
    await page.getByTestId('save-scenario').click();
    await expect(page.getByTestId('save-error')).toHaveText('Could not save: storage is unavailable in this browser.');
  });
});

test.describe('10.6 the comparison summary', () => {
  async function compare(page: Page): Promise<void> {
    await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByTestId('pick-baseline-baseline').click();
    await page.getByTestId('pick-candidate-plus-one-checkin').click();
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
  }

  test('stores a bounded summary with no differences, segments or traces', async ({ page }) => {
    await openFair(page);
    await compare(page);
    await page.getByTestId('save-scenario').click();
    await expect.poll(() => stored(page, 'rehearsal.comparisons.v1')).not.toBeNull();
    const raw = (await stored(page, 'rehearsal.comparisons.v1')) as string;
    expect(JSON.parse(raw).summaries).toHaveLength(1);
    for (const word of ['"differences"', '"segments"', '"trace"', '"events"']) expect(raw).not.toContain(word);
    for (const key of ['rehearsal.scenarios.v1', 'rehearsal.comparisons.v1', 'rehearsal.prefs.v1']) {
      expect((await stored(page, key)) ?? '').not.toContain('"segments"');
    }
  });

  test('a quota failure on the Compare screen keeps the comparison on screen', async ({ page }) => {
    await openFair(page);
    await compare(page);
    await failNextWrite(page, 'QuotaExceededError');
    await page.getByTestId('save-scenario').click();
    await expect(page.getByTestId('save-error')).toHaveText('Could not save: storage quota exceeded.');
    await expect(page.getByTestId('change-list')).toBeVisible();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT);
    await expect(page.getByTestId('download-comparison-csv')).toBeVisible();
  });
});

test.describe('10.7 Open JSON', () => {
  test('previews the bare file, then Open replaces the current tab', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('import-json').setInputFiles(jsonFile('plus-one.json', plusOneText));
    await expect(page.getByText(/^Harbor Hall Community Fair: extra check-in staff, hash [0-9a-f]{8}, model 0\.1\.0$/)).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: extra check-in staff' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Opened "Harbor Hall Community Fair: extra check-in staff".');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  });

  test('{} is refused with its message and changes nothing', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('import-json').setInputFiles(jsonFile('empty.json', '{}'));
    await expect(page.getByText('This file is not a Rehearsal scenario export (expected "format": "rehearsal-scenario") or a bare scenario (expected "schemaVersion": 1).').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  });

  test('a modelVersion 0.2.0 file shows its warning in the dialog and in the assumptions panel', async ({ page }) => {
    const warning = 'This scenario was saved with model version 0.2.0; the engine is 0.1.0. Results may differ from the saved export.';
    await openFair(page);
    await page.getByTestId('import-json').setInputFiles(jsonFile('old.json', JSON.stringify({ ...JSON.parse(baselineText), modelVersion: '0.2.0' })));
    await expect(page.getByRole('dialog').getByText(warning)).toBeVisible();
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Assumptions' }).getByText(warning)).toBeVisible();
  });

  test('the landing screen opens a scenario JSON into the Plan screen', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('import-json').setInputFiles(jsonFile('plus-one.json', plusOneText));
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: extra check-in staff' })).toBeVisible();
  });
});
