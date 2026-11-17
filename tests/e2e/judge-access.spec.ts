import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Request } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';

// Steps and assertions of the `Playwright journeys` table (judge-access.spec.ts). It runs only against a deployed build:
// paired-comparison-and-release task 16 sets BASE_URL. Without it the spec is skipped.
const BASE_URL = process.env.BASE_URL;
test.skip(BASE_URL === undefined || BASE_URL === '', 'BASE_URL not set');

const FETCH_TYPES = new Set(['document', 'script', 'stylesheet', 'image', 'fetch', 'other']);

test('judge access: no login, the three tabs, a complete comparison and same-origin requests only', async ({ browser }) => {
  const base = new URL(BASE_URL as string);
  const context = await browser.newContext({ baseURL: base.href, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));

  await page.goto('/');
  await expect(page.locator('input[type="password"], form[action*="login" i]')).toHaveCount(0);
  await page.getByTestId('try-community-fair').click();
  for (const key of ['baseline', 'plus-one-checkin', 'shorter-route']) await expect(page.getByTestId(`scenario-tab-${key}`)).toBeVisible();

  await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Compare', exact: true }).click();
  await page.getByTestId('pick-baseline-baseline').click();
  await page.getByTestId('pick-candidate-plus-one-checkin').click();
  await page.getByTestId('run-comparison').click();
  await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 120_000 });

  const lines = requests.map((r) => `${r.method()} ${r.resourceType()} ${r.url()}`);
  const offOrigin = requests.filter((r) => /^https?:/.test(r.url()) && new URL(r.url()).origin !== base.origin);
  const notGet = requests.filter((r) => r.method() !== 'GET');
  const wrongType = requests.filter((r) => !FETCH_TYPES.has(r.resourceType()));
  const pass = offOrigin.length === 0 && notGet.length === 0 && wrongType.length === 0;

  const date = new Date().toISOString().slice(0, 10);
  mkdirSync('docs/acceptance', { recursive: true });
  writeFileSync(
    `docs/acceptance/${date}-release.md`,
    `# Release network inspection\n\nURL: ${base.href}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nnetwork-inspection: ${pass ? 'pass' : 'fail'}\n`,
    { encoding: 'utf8' },
  );
  expect(offOrigin.map((r) => r.url())).toEqual([]);
  expect(notGet.map((r) => r.url())).toEqual([]);
  expect(wrongType.map((r) => r.url())).toEqual([]);
  await context.close();
});
