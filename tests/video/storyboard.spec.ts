import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { applyImport, importFile, openFair, simulate } from '../e2e/helpers';
import { SEGMENTS, buildManifest, type ClipPart, type Segment } from './manifest';

// One clip per storyboard segment (requirement 13). Each drives the build through the helpers of the journeys and only shows
// what the build shows: no overlay, caption or number is added to the page. The pauses let a viewer read the screen.
const OUT = 'tests/video/out';
const PARTS = `${OUT}/parts`;
const hold = (page: Page, ms: number): Promise<void> => page.waitForTimeout(ms);

test.beforeAll(() => {
  rmSync(PARTS, { recursive: true, force: true });
  mkdirSync(PARTS, { recursive: true });
});

/** Closes the page so the video is complete, saves it as <segment>.webm and records its length. */
async function finish(page: Page, segment: Segment, startedAt: number): Promise<void> {
  const video = page.video();
  await page.close();
  if (video === null) throw new Error('No video was recorded; check the video option of playwright.video.config.ts.');
  const file = `${segment}.webm`;
  await video.saveAs(`${OUT}/${file}`);
  const part: ClipPart = { segment, file, durationMs: Date.now() - startedAt };
  writeFileSync(`${PARTS}/${segment}.json`, `${JSON.stringify(part)}\n`, 'utf8');
}

async function compareFair(page: Page): Promise<void> {
  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await page.getByTestId('run-comparison').click();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 120_000 });
}

test('import: the preview names the sheets read', async ({ page }) => {
  const startedAt = Date.now();
  await openFair(page);
  await hold(page, 1500);
  await importFile(page, 'public/examples/harbor-hall/harbor-hall.xlsx');
  await expect(page.getByText('Sheets read: Arrivals, Stations, Settings.')).toBeVisible();
  await hold(page, 3500);
  await applyImport(page);
  await hold(page, 2000);
  await finish(page, 'import', startedAt);
});

test('game-view: the replay at 4x with the follow camera on doors#0007', async ({ page }) => {
  const startedAt = Date.now();
  await openFair(page);
  await simulate(page);
  await page.getByRole('radio', { name: '4\u00d7' }).check();
  const find = page.getByRole('combobox', { name: 'Find attendee' });
  await find.fill('doors#0007');
  await find.press('Enter');
  await page.getByRole('button', { name: 'Follow' }).click();
  await hold(page, 8000);
  await finish(page, 'game-view', startedAt);
});

test('extra-staff: the Compare screen with the ghost on one clock and the change list', async ({ page }) => {
  const startedAt = Date.now();
  await openFair(page);
  await compareFair(page);
  await hold(page, 6000);
  await page.getByTestId('change-list').scrollIntoViewIfNeeded();
  await hold(page, 3000);
  await finish(page, 'extra-staff', startedAt);
});

test('floor-plan: the shorter-route tab with the floor plan labels', async ({ page }) => {
  const startedAt = Date.now();
  await openFair(page);
  await page.getByTestId('scenario-tab-shorter-route').click();
  await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: shorter walking route' })).toBeVisible();
  await page.getByRole('application', { name: 'Floor plan' }).scrollIntoViewIfNeeded();
  await hold(page, 4000);
  await page.getByRole('button', { name: 'Select doors' }).click();
  await hold(page, 3000);
  await finish(page, 'floor-plan', startedAt);
});

// The printable run sheet joins this segment only when scenario-editor-and-replay task 15 has run; it has not, so it shows the cards.
test('variation-and-print: the 30-run cards', async ({ page }) => {
  const startedAt = Date.now();
  await openFair(page);
  await compareFair(page);
  await page.getByTestId('metric-card-queueWait.mean').scrollIntoViewIfNeeded();
  await hold(page, 4500);
  await page.getByTestId('metric-card-journeyTime.mean').scrollIntoViewIfNeeded();
  await hold(page, 3500);
  await finish(page, 'variation-and-print', startedAt);
});

test('manifest: one entry per segment with the commit hash', async () => {
  const parts = readdirSync(PARTS).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${PARTS}/${f}`, 'utf8')) as ClipPart);
  expect(parts.map((p) => p.segment).sort()).toEqual([...SEGMENTS].sort());
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const baseUrl = process.env.BASE_URL === undefined || process.env.BASE_URL === '' ? 'http://localhost:4274 (local preview, not a deployed build)' : process.env.BASE_URL;
  writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(buildManifest(parts, { commit, baseUrl }), null, 2)}\n`, 'utf8');
});
