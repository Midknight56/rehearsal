import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT, RANGE_LABEL, STALE_TEXT, replayLabel } from '../../src/comparison/labels';
import { GHOST_LEGEND } from '../../src/comparison/replay-contract';
import { gameDebug, openFair } from './helpers';

// The steps and assertions of the `Playwright journeys` table of paired-comparison-and-release/design.md, row compare.spec.ts.
async function openCompare(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' })).toBeVisible();
}

async function runComparison(page: Page): Promise<void> {
  await page.getByTestId('run-comparison').click();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
}

test('compare: change list, cards, replay label, ghost legend, replicate 7, a population change and a stale label', async ({ page }) => {
  await openFair(page);
  await openCompare(page);
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await runComparison(page);

  const items = page.getByTestId('change-list').getByRole('listitem');
  await expect(items).toHaveCount(1);
  await expect(items).toHaveText('Station "Check-in desk": servers 1 \u2192 2');
  await expect(page.getByTestId('change-list')).toHaveAttribute('data-kind', 'single');
  await expect(page.getByTestId('metric-card-queueWait.mean').locator('[data-field=range]')).toContainText(RANGE_LABEL);
  await expect(page.getByTestId('metric-card-queueWait.mean').locator('[data-field=runs]')).toHaveText(
    /^Candidate had lower mean queue wait in \d+ of 30 runs; the same simulated attendees and random draws were used in both\.$/,
  );
  await expect(page.getByTestId('replay-label')).toHaveText(replayLabel(0));
  await expect(page.getByTestId('ghost-legend')).toHaveText(GHOST_LEGEND);
  await expect(page.getByTestId('replay-layer-baseline')).toHaveAttribute('data-replication', '0');
  await expect(page.getByTestId('replay-layer-candidate')).toHaveAttribute('data-replication', '0');
  await expect(page.getByTestId('population-change')).toHaveCount(0);

  // Replication 7: both layers follow once the replicate has loaded; the status region and compare-status never carry a frame count.
  await page.getByTestId('replicate-select').selectOption('7');
  await expect(page.getByTestId('replay-layer-candidate')).toHaveAttribute('data-replication', '7', { timeout: 60_000 });
  await expect(page.getByTestId('replay-layer-baseline')).toHaveAttribute('data-replication', '7');
  await expect(page.getByTestId('replay-label')).toHaveText(replayLabel(7));
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT);

  // The candidate's doors count becomes 130: the populations differ.
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' }).click();
  await page.getByTestId('scenario-tab-plus-one-checkin').click();
  await page.getByLabel('count of doors').fill('130');
  await page.getByLabel('count of doors').press('Enter');
  await openCompare(page);
  await expect(page.getByTestId('compare-status')).toHaveText(STALE_TEXT);
  await runComparison(page);
  await expect(page.getByTestId('population-change')).toContainText('Cohort "doors": count 120 \u2192 130 people');
  await expect(page.getByTestId('metric-card-queueWait.mean').locator('[data-field=runs]')).toContainText('the attendee populations differ (120 vs 130 people)');

  // An edit of the baseline's check-in servers makes the result stale.
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Back to plan' }).click();
  await page.getByTestId('scenario-tab-baseline').click();
  await page.getByLabel('servers of checkin').fill('3');
  await page.getByLabel('servers of checkin').press('Enter');
  await openCompare(page);
  await expect(page.getByTestId('compare-status')).toHaveText(STALE_TEXT);
  await expect(page.getByTestId('change-list')).toBeVisible();
});

test('compare: the status region is one element and is not written per frame', async ({ page }) => {
  await openFair(page);
  await openCompare(page);
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await runComparison(page);
  await expect(page.getByRole('status')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText(COMPLETE_TEXT);
  const before = await page.getByRole('status').textContent();
  await page.waitForTimeout(2000);
  expect(await page.getByRole('status').textContent()).toBe(before);
  expect(await page.locator('[aria-live]').count()).toBe(0);
});

test('compare: the canvas draws the baseline ghost on one clock within the sprite budget', async ({ page }) => {
  await openFair(page);
  await openCompare(page);
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await runComparison(page);
  const debug = await gameDebug(page);
  if (debug.rendererStatus !== 'ready') {
    console.log('not run (no graphics context in headless Chromium)');
    return;
  }
  await expect.poll(async () => (await gameDebug(page)).ghostLoaded).toBe(true);
  expect(await page.locator('canvas').count()).toBe(1);
  await page.getByRole('application', { name: 'Game view' }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('slider', { name: 'Simulated time' }).evaluate((el: HTMLInputElement) => {
    el.value = '600000';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const after = await gameDebug(page);
  expect(after.spritesDrawn as number).toBeLessThanOrEqual(1000);
  expect(after.spritesDrawn as number).toBeGreaterThan(0);
});
