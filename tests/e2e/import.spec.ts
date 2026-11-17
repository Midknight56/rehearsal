import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { applyImport, importFile, openFair, readHash, readStatus } from './helpers';

const FIXTURES = 'tests/imports/fixtures';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import' });
// A message appears in the error list and again beside the row it names; the list is the one to read.
const errorList = (page: Page) => dialog(page).getByRole('list', { name: 'Import errors' });

test.describe('1.1 template downloads', () => {
  test('offers arrivals.csv, stations.csv and rehearsal-template.xlsx byte-for-byte', async ({ page }) => {
    await openFair(page);
    for (const name of ['arrivals.csv', 'stations.csv', 'rehearsal-template.xlsx']) {
      await page.getByRole('button', { name: 'Download templates' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name }).click()]);
      expect(download.suggestedFilename()).toBe(name);
      expect(readFileSync((await download.path()) as string)).toEqual(readFileSync(`public/examples/${name}`));
    }
  });
});

test.describe('1.3 size refusal', () => {
  test('refuses a CSV above 2,097,152 bytes with the message and no preview', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByTestId('import-arrivals-csv').setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2_097_153, 'a') });
    await expect(errorList(page).getByText('big.csv is 2.00 MiB; the limit is 2 MiB.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply import' })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('1.5 and 1.6 the four matrix-row-13 fixtures leave the hash unchanged', () => {
  const cases: [string, string, string, string][] = [
    ['duplicate header', 'import-arrivals-csv', 'arrivals-duplicate-header.csv', 'Column "start_min" appears twice in row 1.'],
    ['invalid route', 'import-arrivals-csv', 'arrivals-invalid-route.csv', 'Row 2, route: station "lounge" is not defined.'],
    ['negative count', 'import-arrivals-csv', 'arrivals-negative-count.csv', 'Row 2, count: must be a whole number of 0 or more (got "-5").'],
  ];
  for (const [name, testId, file, message] of cases) {
    test(`${name}: ${message}`, async ({ page }) => {
      await openFair(page);
      const before = await readHash(page);
      await importFile(page, `${FIXTURES}/${file}`, testId);
      await expect(errorList(page).getByText(message)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Apply import' })).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Escape');
      expect(await readHash(page)).toBe(before);
    });
  }

  test('unreachable station: both engine messages, scenario unchanged', async ({ page }) => {
    await openFair(page);
    const ring = JSON.parse(readFileSync(`${FIXTURES}/layout-ring-30-4.json`, 'utf8'));
    const baseline = JSON.parse(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8'));
    await page.evaluate((s) => (window as unknown as { __rehearsal: { loadScenario(j: string): void } }).__rehearsal.loadScenario(s), JSON.stringify({ ...baseline, layout: ring }));
    const before = await readHash(page);
    await importFile(page, `${FIXTURES}/stations-unreachable.csv`, 'import-stations-csv');
    await expect(errorList(page).getByText('Row 3, cell_x/cell_y: No walkable path between entrance (0,12) and station "packs" (30,4).')).toBeVisible();
    await expect(errorList(page).getByText('Current scenario, cohort "doors", route: No walkable path between station "checkin" (10,12) and station "packs" (30,4).')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await readHash(page)).toBe(before);
  });
});

test.describe('1.7 apply', () => {
  test('announces the import and moves focus to the first changed table', async ({ page }) => {
    await openFair(page);
    await importFile(page, 'public/examples/stations.csv', 'import-stations-csv');
    await applyImport(page);
    expect(await readStatus(page)).toBe('Imported 0 cohorts and 2 stations from stations.csv.');
    await expect(page.getByRole('table', { name: 'Stations' }).locator(':focus')).toHaveCount(1);
  });
});

test.describe('2.1 to 2.3 workbook files', () => {
  test('harbor-hall-extra-sheet.xlsx lists Attendees under Not read and applies with an unchanged hash', async ({ page }) => {
    await openFair(page);
    const before = await readHash(page);
    await importFile(page, `${FIXTURES}/harbor-hall-extra-sheet.xlsx`);
    await expect(dialog(page).getByText('Sheets read: Arrivals, Stations, Settings. Not read: Attendees.')).toBeVisible();
    await applyImport(page);
    expect(await readHash(page)).toBe(before);
  });

  test('harbor-hall-missing-stations.xlsx is refused with the sheet list', async ({ page }) => {
    await openFair(page);
    await importFile(page, `${FIXTURES}/harbor-hall-missing-stations.xlsx`);
    await expect(dialog(page).getByText('The workbook has no sheet named "Stations". Sheets found: Arrivals, Settings.')).toBeVisible();
  });
});

test.describe('2.5 formulas', () => {
  test('a saved value is used, marked and listed', async ({ page }) => {
    await openFair(page);
    await importFile(page, `${FIXTURES}/harbor-hall-formula-saved.xlsx`);
    await expect(dialog(page).getByText('formula (saved value used)')).toBeVisible();
    await expect(dialog(page).getByText('Formula cells: Stations!C3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply import' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a formula with no saved value keeps Apply import disabled', async ({ page }) => {
    await openFair(page);
    await importFile(page, `${FIXTURES}/harbor-hall-formula-unsaved.xlsx`);
    await expect(errorList(page).getByText('Stations!C3 (servers) is a formula with no saved value. Open the workbook, let it calculate, save, and import again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply import' })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('2.7 three ways to the same hash (matrix row 14)', () => {
  test('harbor-hall.xlsx and the CSV pair give the hash of baseline.json', async ({ page }) => {
    await openFair(page);
    const expected = await readHash(page);
    await importFile(page, 'public/examples/harbor-hall/harbor-hall.xlsx');
    await applyImport(page);
    expect(await readHash(page)).toBe(expected);
    await importFile(page, 'public/examples/harbor-hall/arrivals.csv', 'import-arrivals-csv');
    await importFile(page, 'public/examples/harbor-hall/stations.csv', 'import-stations-csv');
    await applyImport(page);
    expect(await readHash(page)).toBe(expected);
  });
});
