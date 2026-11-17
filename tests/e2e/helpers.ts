import { readFileSync } from 'node:fs';
import { expect, type Download, type Page } from '@playwright/test';

/** Activates `Try the community fair` and waits for the Plan screen heading of the baseline. */
export async function openFair(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('try-community-fair').click();
  await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
}

/** Opens `Import`, sets the file input named by `testId` and waits for the preview. */
export async function importFile(page: Page, path: string | string[], testId = 'import-workbook'): Promise<void> {
  if ((await page.getByRole('dialog', { name: 'Import' }).count()) === 0) {
    await page.getByRole('button', { name: 'Import', exact: true }).click();
  }
  await page.getByTestId(testId).setInputFiles(path);
  // The preview is ready when a preview table or the error list shows; a refused file shows the error list.
  await expect(page.getByRole('dialog', { name: 'Import' }).locator('table, ul[aria-label="Import errors"]').first()).toBeVisible();
}

/** Activates `Apply import`; the status region announces it. */
export async function applyImport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Apply import' }).click();
  await expect(page.getByRole('status')).toContainText('Imported');
}

/** The 64-hex text after `Scenario hash:` in the assumptions panel. */
export async function readHash(page: Page): Promise<string> {
  const text = (await page.getByText(/Scenario hash:/).first().textContent()) ?? '';
  const match = /Scenario hash:\s*([0-9a-f]{64})/.exec(text);
  if (match === null) throw new Error(`No 64-hex hash found in "${text}"`);
  return match[1] as string;
}

/** Clicks `Simulate` and waits for `Run complete`. */
export async function simulate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.getByRole('status')).toContainText('Run complete', { timeout: 60_000 });
}

/** Presses Tab until the focused element has the accessible name; fails after 300 presses. With checkFocus, asserts the focus ring after every Tab (matrix row 20). */
export async function tabTo(page: Page, name: string | RegExp, options: { checkFocus?: boolean } = {}): Promise<void> {
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Tab');
    if (options.checkFocus === true) await assertFocusVisibleAndUnobscured(page);
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return '';
      const labelledBy = el.getAttribute('aria-labelledby');
      const labelled = labelledBy === null ? '' : labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      return (el.getAttribute('aria-label') ?? labelled) || (el as HTMLInputElement).labels?.[0]?.textContent || el.textContent || '';
    });
    const text = focused.trim();
    if (typeof name === 'string' ? text === name : name.test(text)) return;
  }
  throw new Error(`tabTo: no focusable element named ${String(name)} after 300 Tab presses`);
}

/** Shift+Tab until the focused element has the accessible name (a control earlier in the page); fails after 300 presses. */
export async function backTabTo(page: Page, name: string | RegExp, options: { checkFocus?: boolean } = {}): Promise<void> {
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Shift+Tab');
    if (options.checkFocus === true) await assertFocusVisibleAndUnobscured(page);
    const text = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return '';
      const labelledBy = el.getAttribute('aria-labelledby');
      const labelled = labelledBy === null ? '' : labelledBy.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
      return ((el.getAttribute('aria-label') ?? labelled) || (el as HTMLInputElement).labels?.[0]?.textContent || el.textContent || '').trim();
    });
    if (typeof name === 'string' ? text === name : name.test(text)) return;
  }
  throw new Error(`backTabTo: no focusable element named ${String(name)} after 300 Shift+Tab presses`);
}

/** After a Tab: the focused element has an outline-style other than none and is the topmost element at its centre. */
export async function assertFocusVisibleAndUnobscured(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return { ok: false, reason: 'focus is on body' };
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const reachable = hit !== null && (hit === el || el.contains(hit));
    return { ok: style.outlineStyle !== 'none' && reachable, reason: `outline-style ${style.outlineStyle}, reachable ${String(reachable)}` };
  });
  expect(result.ok, result.reason).toBe(true);
}

/** The text of the one status region. */
export async function readStatus(page: Page): Promise<string> {
  return ((await page.getByRole('status').textContent()) ?? '').trim();
}

/** window.__rehearsal.gameView().debug(); the test build only. */
export async function gameDebug(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as unknown as { __rehearsal: { gameView(): { debug(): Record<string, unknown> } } }).__rehearsal.gameView().debug());
}

/** Loads tests/e2e/fixtures/<name>.json through window.__rehearsal.loadScenario. */
export async function loadFixture(page: Page, name: string): Promise<void> {
  const json = readFileSync(`tests/e2e/fixtures/${name}.json`, 'utf8');
  await page.evaluate((text) => (window as unknown as { __rehearsal: { loadScenario(json: string): void } }).__rehearsal.loadScenario(text), json);
}

/** Waits for a download whose suggested name matches the pattern, run while `trigger` is clicked or pressed. */
export async function expectDownload(page: Page, pattern: RegExp, trigger: () => Promise<void>): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  expect(download.suggestedFilename()).toMatch(pattern);
  return download;
}

/** The text of a window.__rehearsal.lastResultJson(tabKey) call. */
export async function lastResultJson(page: Page, tabKey: string): Promise<string> {
  return page.evaluate((key) => (window as unknown as { __rehearsal: { lastResultJson(k: string): string } }).__rehearsal.lastResultJson(key), tabKey);
}
