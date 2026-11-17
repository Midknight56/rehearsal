import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Download, type Page, type TestInfo } from '@playwright/test';
import Papa from 'papaparse';
import { COMPLETE_TEXT, RANGE_LABEL, saveErrorText } from '../../src/comparison/labels';
import { LIMITS_TEXT, NOT_A_FORECAST } from '../../src/exports/assumptions-text';
import { applyImport, importFile, openFair, readHash } from './helpers';

// The `exports.spec.ts` row of the Playwright journeys table (paired-comparison-and-release design): scenario JSON, CSVs, workbook,
// printable comparison and the save-failure block, with the hostile strings of tests/comparison/fixtures/hostile.json.
test.setTimeout(240_000);

const HOSTILE = 'tests/comparison/fixtures/hostile.json';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Review the scenario file' });

async function openCompare(page: Page): Promise<void> {
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' })).toBeVisible();
}

async function runComparison(page: Page, baseline: string, candidate: string): Promise<void> {
  await page.getByTestId(`pick-baseline-${baseline}`).click();
  await page.getByTestId(`pick-candidate-${candidate}`).click();
  await page.getByTestId('run-comparison').click();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
}

async function save(page: Page, testInfo: TestInfo, testId: string): Promise<{ download: Download; file: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { download, file };
}

/** Cells that are text (not numbers) and start with a formula character. */
function formulaCells(csv: string): string[] {
  return (Papa.parse<string[]>(csv, { skipEmptyLines: true }).data as string[][])
    .flat()
    .filter((cell) => /^[=+\-@]/.test(cell) && !Number.isFinite(Number(cell)));
}

async function openedPage(context: BrowserContext, page: Page, testId: string): Promise<Page> {
  const [tab] = await Promise.all([context.waitForEvent('page'), page.getByTestId(testId).click()]);
  await tab.waitForLoadState();
  return tab;
}

test('Harbor Hall: JSON re-import, CSVs, workbook round trip, printable comparison, Save', async ({ page, context }, testInfo) => {
  await openFair(page);
  await openCompare(page);
  await runComparison(page, 'baseline', 'plus-one-checkin');
  const baselineHash = /[0-9a-f]{64}/.exec((await page.getByTestId('scenario-hash-baseline').textContent()) ?? '')?.[0] ?? '';
  expect(baselineHash).toHaveLength(64);

  const json = await save(page, testInfo, 'export-scenario-json');
  expect(json.download.suggestedFilename()).toBe(`harbor-hall-community-fair-baseline-${baselineHash.slice(0, 8)}.json`);

  const results = await save(page, testInfo, 'export-results-csv');
  const resultRows = Papa.parse<Record<string, string>>(readFileSync(results.file, 'utf8'), { header: true, skipEmptyLines: true }).data;
  expect(resultRows).toHaveLength(1140);
  expect(resultRows.every((r) => /^[0-9a-f]{64}$/.test(r.scenario_hash ?? ''))).toBe(true);

  const comparisonCsv = await save(page, testInfo, 'export-comparison-csv');
  const comparisonText = readFileSync(comparisonCsv.file, 'utf8');
  const comparisonRows = Papa.parse<Record<string, string>>(comparisonText, { header: true, skipEmptyLines: true }).data;
  expect(comparisonRows).toHaveLength(19);
  expect(comparisonRows.every((r) => r.range_label === RANGE_LABEL)).toBe(true);
  expect(formulaCells(comparisonText)).toEqual([]);

  const workbook = await save(page, testInfo, 'export-workbook');
  expect(workbook.download.suggestedFilename()).toBe(`harbor-hall-community-fair-baseline-${baselineHash.slice(0, 8)}.xlsx`);

  const printable = await openedPage(context, page, 'open-printable-comparison');
  const printableText = (await printable.locator('body').textContent()) ?? '';
  for (const text of [RANGE_LABEL, NOT_A_FORECAST, LIMITS_TEXT, baselineHash]) expect(printableText).toContain(text);
  expect(await printable.locator('script').count()).toBe(0);
  await printable.close();

  // Scenario JSON re-import: the preview shows the hash of scenario-hash-baseline and applies without error.
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' }).click();
  await page.getByTestId('import-json').setInputFiles(json.file);
  await expect(dialog(page)).toContainText(`hash ${baselineHash.slice(0, 8)}, model 0.1.0`);
  await dialog(page).getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Opened "Harbor Hall Community Fair: baseline".');
  expect(await readHash(page)).toBe(baselineHash);

  // Workbook re-import into the same layout: the same canonical hash (R7 round trip).
  await importFile(page, workbook.file);
  await applyImport(page);
  expect(await readHash(page)).toBe(baselineHash);

  // Save keeps a bounded summary: no segments, no per-replication differences.
  await openCompare(page);
  await runComparison(page, 'baseline', 'plus-one-checkin');
  await page.getByTestId('save-scenario').click();
  await expect(page.getByRole('status')).toContainText('Saved');
  const values = await page.evaluate(() => Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? ''));
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(value).not.toContain('"segments"');
    expect(value).not.toContain('"differences"');
  }
});

test('hostile strings: escaped in the printable comparison, no formula cell in any CSV', async ({ page, context }, testInfo) => {
  await openFair(page);
  for (const tab of ['baseline', 'plus-one-checkin']) {
    await page.getByTestId(`scenario-tab-${tab}`).click();
    await page.getByTestId('import-json').setInputFiles(HOSTILE);
    await dialog(page).getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Opened "-Harbor".');
  }
  await expect(page.getByText('<script>alert(1)</script>').first()).toBeVisible();
  await page.getByLabel('servers of evil').fill('2');
  await page.getByLabel('servers of evil').press('Enter');

  await openCompare(page);
  await runComparison(page, 'baseline', 'plus-one-checkin');
  for (const testId of ['export-results-csv', 'export-comparison-csv']) {
    const { file } = await save(page, testInfo, testId);
    const text = readFileSync(file, 'utf8');
    expect(text.length).toBeGreaterThan(100);
    expect(formulaCells(text), testId).toEqual([]);
    expect(text).toContain('stations.evil.');
  }
  const printable = await openedPage(context, page, 'open-printable-comparison');
  const html = await printable.content();
  expect(await printable.locator('body').textContent()).toContain('<script>alert(1)</script>');
  expect(await printable.locator('script').count()).toBe(0);
  expect(html).not.toMatch(/<script/i);
  await printable.close();
});

test('a quota failure on save shows the reason and the three recovery controls, and the comparison stays', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await openFair(page);
  await openCompare(page);
  await runComparison(page, 'baseline', 'plus-one-checkin');
  await page.getByTestId('save-scenario').click();
  await expect(page.getByTestId('save-error')).toHaveText(saveErrorText('quota'));
  await expect(page.getByTestId('save-error')).toHaveText('Could not save: storage quota exceeded.');
  for (const id of ['retry-save', 'download-scenario-json', 'download-comparison-csv']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('change-list')).toBeVisible();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-comparison-csv').click()]);
  expect(download.suggestedFilename()).toMatch(/^comparison-summary-[0-9a-f]{8}-[0-9a-f]{8}\.csv$/);
});