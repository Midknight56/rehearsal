import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { STALE_LABEL } from '../../src/ui/state/selectors';
import { openFair, readHash, simulate } from './helpers';

// Requirements 8.1 to 8.4 and 8.6 on the React run sheet. Matrix row 28 records this rendering's scrollHeight; run-sheet.spec.ts
// records the generator's document.
const TABS = [
  { key: 'baseline', title: 'Harbor Hall Community Fair: baseline', per: '38.0 m per attendee', seconds: ['4.167 s', '10.000 s', '17.500 s', '31.667 s'], hours: 'Staff-hours: 2.00 h' },
  { key: 'plus-one-checkin', title: 'Harbor Hall Community Fair: extra check-in staff', per: '38.0 m per attendee', seconds: ['4.167 s', '10.000 s', '17.500 s'], hours: 'Staff-hours: 2.67 h' },
  { key: 'shorter-route', title: 'Harbor Hall Community Fair: shorter walking route', per: '18.0 m per attendee', seconds: ['4.167 s', '3.334 s', '7.500 s', '15.001 s'], hours: 'Staff-hours: 2.00 h' },
] as const;

const openPrint = async (page: Page): Promise<void> => {
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Print run sheet' }).click();
  await expect(page.locator('#run-sheet')).toBeVisible();
};

test.describe('8.1 to 8.3 the Print screen', () => {
  for (const tab of TABS) {
    test(`${tab.key}: the model's numbers, one hash, and one page under print media (scrollHeight at most 960 px at 704 px)`, async ({ page }) => {
      await openFair(page);
      await page.getByTestId(`scenario-tab-${tab.key}`).click();
      const hash = await readHash(page);
      await openPrint(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${tab.title} (run sheet)`);
      await expect(page.locator('main h1')).toBeFocused();
      const sheet = page.locator('#run-sheet');
      for (const text of [...tab.seconds, tab.per, tab.hours, `Scenario hash: ${hash}`, 'Model version: 0.1.0']) await expect(sheet).toContainText(text);
      await expect(sheet).not.toContainText(STALE_LABEL);
      await expect(page.getByTestId('run-sheet-results')).toContainText('no run needed');

      // scrollHeight of the root is never below the viewport height, so the viewport is shorter than the sheet (400 px) to read its content height.
      await page.setViewportSize({ width: 704, height: 400 });
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('status')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
      expect(await page.locator('canvas').count()).toBe(0);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      console.log(`print.spec scrollHeight ${tab.key}: ${height} px (React run sheet, print media, 704 px wide)`);
      expect(height).toBeLessThanOrEqual(960);
    });
  }

  test('Print calls window.print and Back to plan returns to the Plan screen', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __printCalls: number }).__printCalls = 0;
      window.print = () => {
        (window as unknown as { __printCalls: number }).__printCalls += 1;
      };
    });
    await openFair(page);
    await openPrint(page);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(1);
    await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' }).click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
  });
});

test.describe('8.4 Save as HTML', () => {
  test('saves run-sheet-<hash8>.html with the generator document and the numbers of the screen', async ({ page }) => {
    await openFair(page);
    const hash = await readHash(page);
    await openPrint(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save as HTML' }).click()]);
    expect(download.suggestedFilename()).toBe(`run-sheet-${hash.slice(0, 8)}.html`);
    const html = readFileSync((await download.path()) as string, 'utf8');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    for (const text of ['4.167 s', '10.000 s', '17.500 s', '31.667 s', '38.0 m per attendee', 'Staff-hours: 2.00 h', hash]) expect(html).toContain(text);
    await expect(page.getByRole('status')).toHaveText(`Saved run-sheet-${hash.slice(0, 8)}.html.`);
  });

  test('a station label <script>alert(1)</script> is text on screen and escaped in the file', async ({ page }) => {
    await openFair(page);
    const baseline = JSON.parse(readFileSync('public/examples/harbor-hall/baseline.json', 'utf8')) as { stations: { id: string; label: string }[] };
    const hostile = { ...baseline, stations: baseline.stations.map((s) => (s.id === 'checkin' ? { ...s, label: '<script>alert(1)</script>' } : s)) };
    await page.evaluate((text) => (window as unknown as { __rehearsal: { loadScenario(j: string): void } }).__rehearsal.loadScenario(text), JSON.stringify(hostile));
    await openPrint(page);
    await expect(page.locator('#run-sheet')).toContainText('<script>alert(1)</script>');
    expect(await page.locator('#run-sheet script').count()).toBe(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save as HTML' }).click()]);
    const html = readFileSync((await download.path()) as string, 'utf8');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
  });
});

test.describe('8.6 no run needed, stale only on the results line, blocked route', () => {
  test('after a run and an edit the stale label is on the results line only', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await openPrint(page);
    await expect(page.getByTestId('run-sheet-results')).toContainText('replication 0');
    await expect(page.getByTestId('run-sheet-results')).not.toContainText(STALE_LABEL);
    await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' }).click();
    await page.getByLabel('servers of checkin').fill('2');
    await page.getByLabel('servers of checkin').press('Enter');
    await openPrint(page);
    await expect(page.getByTestId('run-sheet-results')).toContainText(STALE_LABEL);
    await expect(page.locator('#run-sheet table', { hasText: STALE_LABEL })).toHaveCount(0);
    await expect(page.locator('#run-sheet')).toContainText('Staff-hours: 2.67 h');
  });

  test('Print run sheet is aria-disabled with the 4.4 message while a route has no path', async ({ page }) => {
    await openFair(page);
    // The stage already blocks (20, 20) to (20, 23); blocking (20, 0) to (20, 19) closes column x = 20 (as blocked-route.spec.ts does).
    for (let y = 0; y < 20; y++) {
      await page.getByLabel('Blocked cell x').fill('20');
      await page.getByLabel('Blocked cell y').fill(String(y));
      await page.getByRole('button', { name: 'Add cell' }).click();
    }
    const button = page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Print run sheet' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const message = 'Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs). Clear a corridor on the floor plan or move a station.';
    await expect(page.getByText(message).first()).toBeVisible();
    await button.focus();
    await expect(button).toBeFocused();
    await button.press('Enter');
    await expect(page.getByRole('status')).toHaveText(message);
    await expect(page.locator('#run-sheet')).toHaveCount(0);
  });
});