import { appendFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { importFile, openFair, simulate } from './helpers';

// An automated axe scan of every screen and state a person can reach (spec .kiro/specs/axe-scan). Headless Chromium only.
// The scan reads the DOM and computed styles; it cannot read inside the canvas of the game view. No rule is disabled and no
// element is excluded. A serious or critical violation fails the state's test; moderate and minor ones are printed and counted.
// With A11Y_REPORT=<path> each state also appends one JSON line to that file (delete the file before a run).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
type Impact = (typeof IMPACTS)[number];

/** Waits for finite animations to end (a screen fades in over 150 ms); axe reads the colours of the moment it runs, and a half faded screen is not a state a person stays on. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

/** Runs axe on the page, prints the counts, and fails with every serious or critical violation listed. */
async function scan(page: Page, state: string): Promise<void> {
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const counts: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const lines: string[] = [];
  const blocking: string[] = [];
  for (const violation of results.violations) {
    const impact = (violation.impact ?? 'minor') as Impact;
    counts[impact] += 1;
    const targets = violation.nodes.map((node) => node.target.join(' ')).join(' | ');
    const line = `rule ${violation.id}, impact ${impact}, target ${targets}, state "${state}"`;
    lines.push(line);
    if (BLOCKING.has(impact)) blocking.push(line);
  }
  const rules = [...new Set(results.violations.map((v) => v.id))];
  console.log(`a11y ${state}: critical ${counts.critical}, serious ${counts.serious}, moderate ${counts.moderate}, minor ${counts.minor}, needs review ${results.incomplete.length}${results.incomplete.length > 0 ? ` (${results.incomplete.map((i) => i.id).join(', ')})` : ''}${rules.length > 0 ? ` [${rules.join(', ')}]` : ''}`);
  for (const line of lines) console.log(`  ${line}`);
  if (process.env.A11Y_REPORT !== undefined) appendFileSync(process.env.A11Y_REPORT, `${JSON.stringify({ state, counts, rules, details: lines, axe: results.testEngine.version })}\n`);
  expect(blocking, `serious or critical violations in "${state}":\n${blocking.join('\n')}`).toEqual([]);
}

const FIXTURES = 'tests/imports/fixtures';
const WORKBOOK = 'public/examples/harbor-hall/harbor-hall.xlsx';
const screenButtons = (page: Page) => page.getByRole('group', { name: 'Screen buttons' });

async function waitForPreviewLine(page: Page): Promise<void> {
  await expect(page.getByTestId('landing-result')).toBeVisible({ timeout: 90_000 });
}

async function openedPage(context: BrowserContext, page: Page, testId: string): Promise<Page> {
  const [tab] = await Promise.all([context.waitForEvent('page'), page.getByTestId(testId).click()]);
  await tab.waitForLoadState();
  return tab;
}

async function compare(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(screenButtons(page).getByRole('button', { name: 'Back to plan' })).toBeVisible();
}

async function runComparison(page: Page): Promise<void> {
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await page.getByTestId('run-comparison').click();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
}

test.describe('landing', () => {
  test('landing, preview playing', async ({ page }) => {
    await page.goto('/');
    await waitForPreviewLine(page);
    await scan(page, 'landing, preview playing');
  });

  test('landing, saved scenario list open', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('save-scenario').click();
    await expect(page.getByRole('status')).toContainText('Saved');
    await page.reload();
    await page.getByRole('button', { name: 'Open a saved scenario' }).click();
    await expect(page.getByRole('list', { name: 'Saved scenarios' })).toBeVisible();
    await scan(page, 'landing, saved scenario list open');
  });

  test.describe('reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });
    test('landing, reduced motion on', async ({ page }) => {
      await page.goto('/');
      await waitForPreviewLine(page);
      await scan(page, 'landing, reduced motion on');
    });
  });
});

test.describe('plan screen', () => {
  test('plan, baseline loaded', async ({ page }) => {
    await openFair(page);
    await scan(page, 'plan, baseline loaded');
  });

  test('plan, after Simulate with game view and result tables', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await expect(page.getByRole('heading', { name: 'Game view' })).toBeVisible();
    await scan(page, 'plan, after Simulate with game view and result tables');
  });

  test('plan, floor plan with a station selected', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Inspect packs' }).click();
    await scan(page, 'plan, floor plan with a station selected');
  });

  test('plan, game view with an attendee selected', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.getByRole('combobox', { name: 'Find attendee' }).fill('doors#0007');
    await page.getByRole('combobox', { name: 'Find attendee' }).press('Enter');
    await scan(page, 'plan, game view with an attendee selected');
  });

  test('plan, status region with a message', async ({ page }) => {
    await openFair(page);
    await page.getByTestId('save-scenario').click();
    await expect(page.getByRole('status')).toContainText('Saved');
    await scan(page, 'plan, status region with a message');
  });

  for (const [value, label] of [['system', 'System'], ['reduce', 'Reduce'], ['allow', 'Allow']] as const) {
    test(`plan, Motion toggle set to ${label}`, async ({ page }) => {
      await openFair(page);
      await page.getByRole('combobox', { name: 'Motion' }).selectOption(value);
      await expect(page.getByRole('combobox', { name: 'Motion' })).toHaveValue(value);
      await scan(page, `plan, Motion toggle set to ${label}`);
    });
  }
});

test.describe('import dialog', () => {
  test('import dialog, picking step', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import' })).toBeVisible();
    await scan(page, 'import dialog, picking step');
  });

  test('import dialog, preview step with a workbook', async ({ page }) => {
    await openFair(page);
    await importFile(page, WORKBOOK);
    await expect(page.getByText('Sheets read: Arrivals, Stations, Settings.')).toBeVisible();
    await scan(page, 'import dialog, preview step with a workbook');
  });

  test('import dialog, preview step with CSV files', async ({ page }) => {
    await openFair(page);
    await importFile(page, 'public/examples/stations.csv', 'import-stations-csv');
    await scan(page, 'import dialog, preview step with CSV files');
  });

  test('import dialog, failed import with the error list', async ({ page }) => {
    await openFair(page);
    await importFile(page, `${FIXTURES}/arrivals-invalid-route.csv`, 'import-arrivals-csv');
    await expect(page.getByRole('list', { name: 'Import errors' })).toBeVisible();
    await scan(page, 'import dialog, failed import with the error list');
  });
});

test.describe('compare and print', () => {
  test('compare, before a comparison', async ({ page }) => {
    await openFair(page);
    await compare(page);
    await scan(page, 'compare, before a comparison');
  });

  test('compare, after a comparison', async ({ page }) => {
    await openFair(page);
    await compare(page);
    await runComparison(page);
    await scan(page, 'compare, after a comparison');
  });

  test('printable comparison document', async ({ page, context }) => {
    await openFair(page);
    await compare(page);
    await runComparison(page);
    const printable = await openedPage(context, page, 'open-printable-comparison');
    await scan(printable, 'printable comparison document');
  });

  test('run sheet screen', async ({ page }) => {
    await openFair(page);
    await screenButtons(page).getByRole('button', { name: 'Print run sheet' }).click();
    await expect(page.locator('#run-sheet')).toBeVisible();
    await scan(page, 'run sheet screen');
  });

  test('run sheet document opened from Compare', async ({ page, context }) => {
    await openFair(page);
    await compare(page);
    const sheet = await openedPage(context, page, 'open-run-sheet');
    await scan(sheet, 'run sheet document opened from Compare');
  });
});
