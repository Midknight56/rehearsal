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

type Box = { text: string; left: number; top: number; right: number; bottom: number };
const overlaps = (a: Box, b: Box): boolean => a.left < b.right - 0.01 && b.left < a.right - 0.01 && a.top < b.bottom - 0.01 && b.top < a.bottom - 0.01;
const inside = (b: Box, c: { left: number; top: number; right: number; bottom: number }): boolean => b.left >= c.left - 0.01 && b.top >= c.top - 0.01 && b.right <= c.right + 0.01 && b.bottom <= c.bottom + 0.01;

/** Label rules of the job, applied to boxes in canvas CSS px: height floor, inside the canvas, no label over another label or a marker. */
function labelProblems(labels: Box[], markers: Box[], canvas: { left: number; top: number; right: number; bottom: number }, minHeight: number, ownMarker: (label: Box, marker: Box) => boolean = () => false): string[] {
  const out: string[] = [];
  const fmt = (b: Box): string => `"${b.text}" ${b.left.toFixed(1)},${b.top.toFixed(1)} to ${b.right.toFixed(1)},${b.bottom.toFixed(1)}`;
  for (const l of labels) {
    if (l.bottom - l.top < minHeight - 0.01) out.push(`${fmt(l)} is ${(l.bottom - l.top).toFixed(1)} px tall, under ${minHeight}`);
    if (!inside(l, canvas)) out.push(`${fmt(l)} is not inside the canvas`);
  }
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) if (overlaps(labels[i] as Box, labels[j] as Box)) out.push(`${fmt(labels[i] as Box)} overlaps ${fmt(labels[j] as Box)}`);
    for (const m of markers) if (!ownMarker(labels[i] as Box, m) && overlaps(labels[i] as Box, m)) out.push(`${fmt(labels[i] as Box)} overlaps marker ${fmt(m)}`);
  }
  return out;
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

    test('5. no two text labels of the Compare slope chart overlap and each lies inside the chart', async ({ page }) => {
      await openFair(page);
      await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Compare', exact: true }).click();
      await page.getByTestId('pick-baseline-baseline').click();
      await page.getByTestId('pick-candidate-plus-one-checkin').click();
      await page.getByTestId('run-comparison').click();
      await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
      const chart = await page.evaluate(() => {
        const svg = document.querySelector('[data-testid="slope-chart"] svg') as SVGSVGElement;
        const c = svg.getBoundingClientRect();
        const labels = [...svg.querySelectorAll('text')].map((t) => {
          const r = t.getBoundingClientRect();
          return { text: t.textContent ?? '', left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        });
        return { canvas: { left: c.left, top: c.top, right: c.right, bottom: c.bottom }, labels };
      });
      expect(chart.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['0 s', 'Baseline', 'Candidate']));
      expect(labelProblems(chart.labels, [], chart.canvas, 0)).toEqual([]);
    });

    test('6. Plan floor plan labels are readable, inside the plan and clear of each other and of the markers after Fit', async ({ page }) => {
      await openFair(page);
      await page.getByRole('button', { name: 'Fit', exact: true }).first().click();
      const plan = await page.evaluate(() => {
        const rect = (el: Element, text: string): { text: string; left: number; top: number; right: number; bottom: number } => {
          const r = el.getBoundingClientRect();
          return { text, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const svg = document.querySelector('.floorplan svg') as SVGSVGElement;
        const c = svg.getBoundingClientRect();
        const labels = [...svg.querySelectorAll('text')].map((t) => rect(t, `${t.getAttribute('class') ?? 'lane'}: ${t.textContent ?? ''}`));
        const markers = [...svg.querySelectorAll('.marker rect, .gate')].map((m) => rect(m, `marker ${m.closest('[data-station]')?.getAttribute('data-station') ?? m.closest('[data-role]')?.getAttribute('data-role') ?? ''}`));
        return { canvas: { left: c.left, top: c.top, right: c.right, bottom: c.bottom }, labels, markers };
      });
      // A station number sits inside its own marker; every other pairing is checked.
      const own = (l: Box, m: Box): boolean => l.text.startsWith('marker-glyph') && m.text.startsWith('marker ') && !m.text.endsWith('entrance') && !m.text.endsWith('exit') && l.left >= m.left - 0.01 && l.right <= m.right + 0.01 && l.top >= m.top - 0.01 && l.bottom <= m.bottom + 0.01;
      expect(plan.labels.some((l) => l.text.includes('the line forms here'))).toBe(true);
      // The server count is the marker's own number and scales with the marker, so the height floor applies to the words, not to it.
      const floor = size.width >= 1000 ? 11 : 10;
      const problems = labelProblems(plan.labels, plan.markers, plan.canvas, floor, own).filter((p) => !(p.startsWith('"marker-glyph') && p.includes('px tall')));
      expect(problems).toEqual([]);
    });

    test('7. Game view labels are readable, inside the canvas and clear of each other and of the markers after Fit', async ({ page }) => {
      await openFair(page);
      await simulate(page);
      await page.getByRole('button', { name: 'Fit' }).click();
      const b = (await gameDebug(page)).labelBounds as { canvas: { width: number; height: number }; labels: Box[]; pathLabels: Box[]; markers: Box[] };
      expect(b.labels.map((l) => l.text)).toEqual(expect.arrayContaining(['In', 'Out']));
      expect(b.markers.length).toBeGreaterThanOrEqual(4);
      const all = [...b.labels, ...b.pathLabels];
      expect(labelProblems(all, b.markers, { left: 0, top: 0, right: b.canvas.width, bottom: b.canvas.height }, size.width >= 1000 ? 11 : 10)).toEqual([]);
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