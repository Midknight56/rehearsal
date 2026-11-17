import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { gameDebug, openFair, simulate } from './helpers';

// Maintenance job "blackboard design, fixes": four visible faults, each measured in the page at the two design sizes.

const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '360x640', width: 360, height: 640 },
] as const;

/** Words (runs of non-space characters) of every text node under the selector that are split across two line boxes. */
async function splitWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const problems: string[] = [];
    for (const root of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        const parent = node.parentElement;
        if (parent === null || parent.getClientRects().length === 0) continue;
        for (const m of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
          if (tops.size > 1) problems.push(`"${m[0]}" is split across ${tops.size} lines in ${parent.tagName.toLowerCase()}`);
        }
      }
    }
    return problems;
  }, selector);
}

/** A number and its unit that sit on more than one line, as strings. */
async function brokenNumbers(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const problems: string[] = [];
    const pattern = /[-+\u2212]?\d[\d.,]*(?:\s(?:s|ms|%|h|people|attendees)\b\.?)?/g;
    for (const root of document.querySelectorAll(sel)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const m of text.matchAll(pattern)) {
          const range = document.createRange();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
          if (tops.size > 1) problems.push(`"${m[0]}" is split across ${tops.size} lines`);
        }
      }
    }
    return problems;
  }, selector);
}

for (const size of SIZES) {
  test.describe(`design fixes at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test('1. no word of the run sheet is split across lines', async ({ page }) => {
      await openFair(page);
      await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Print run sheet' }).click();
      await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
      expect(await splitWords(page, '.run-sheet')).toEqual([]);
    });

    test('2. every station label, the entrance and the exit lie inside the canvas after Fit', async ({ page }) => {
      await openFair(page);
      await simulate(page);
      await page.getByRole('button', { name: 'Fit' }).click();
      const debug = await gameDebug(page);
      const bounds = debug.labelBounds as { canvas: { width: number; height: number }; labels: { text: string; left: number; top: number; right: number; bottom: number }[] };
      expect(bounds.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['Welcome packs', 'In', 'Out']));
      expect(bounds.labels).toHaveLength(4);
      const outside = bounds.labels
        .filter((l) => l.left < 0 || l.top < 0 || l.right > bounds.canvas.width || l.bottom > bounds.canvas.height)
        .map((l) => `${l.text}: ${l.left.toFixed(1)},${l.top.toFixed(1)} to ${l.right.toFixed(1)},${l.bottom.toFixed(1)} of ${bounds.canvas.width}x${bounds.canvas.height}`);
      expect(outside).toEqual([]);
    });

    test('3. Compare numbers stay with their unit and the large value fits its card', async ({ page }) => {
      await openFair(page);
      await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Compare', exact: true }).click();
      await page.getByTestId('pick-baseline-baseline').click();
      await page.getByTestId('pick-candidate-plus-one-checkin').click();
      await page.getByTestId('run-comparison').click();
      await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
      expect(await brokenNumbers(page, '[data-testid="compare-headline"], .metric-card')).toEqual([]);
      const problems = await page.evaluate(() =>
        [...document.querySelectorAll('.metric-card strong[data-field="mean-change"]')].flatMap((el) => {
          const card = el.closest('.metric-card') as HTMLElement;
          const r = el.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          const lineBoxes = new Set([...el.getClientRects()].map((x) => Math.round(x.top))).size;
          const out: string[] = [];
          if (lineBoxes > 1) out.push(`"${el.textContent}" wraps onto ${lineBoxes} lines`);
          if (r.right > c.right + 0.5 || r.left < c.left - 0.5) out.push(`"${el.textContent}" spans ${r.left}-${r.right}, card ${c.left}-${c.right}`);
          if ((el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1) out.push(`"${el.textContent}" overflows its box`);
          return out;
        }),
      );
      expect(problems).toEqual([]);
    });

    // The gap is asked for at 360x640 only.
    if (size.width <= 480) {
      test('4. the gap between the top bar and the first heading is at most 24 px', async ({ page }) => {
        await openFair(page);
        const gap = await page.evaluate(() => {
          const bar = document.querySelector('.topbar')!.getBoundingClientRect();
          const h = document.querySelector('main h1')!.getBoundingClientRect();
          return h.top - bar.bottom;
        });
        expect(gap).toBeLessThanOrEqual(24);
      });
    }
  });
}