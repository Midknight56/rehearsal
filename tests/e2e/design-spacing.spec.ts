import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { openFair, simulate } from './helpers';

// Maintenance job "blackboard design": spacing, hit targets and clipping of every visible control on four views, at the two
// design sizes. The audit runs in the page; a problem is a string naming the control and the measurement.

const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '360x640', width: 360, height: 640 },
] as const;

const MIN_HIT_PX = 44;
const PHONE_EDGE_PX = 16;

async function audit(page: Page, edge: boolean): Promise<string[]> {
  return page.evaluate(
    ({ minHit, edgePx, checkEdge }) => {
      const problems: string[] = [];
      const name = (el: Element): string => {
        const labelled = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
        return `${el.tagName.toLowerCase()} "${(labelled || el.textContent || '').trim().slice(0, 40)}"`;
      };
      const shown = (el: Element): boolean => {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        return el.closest('[hidden], dialog:not([open])') === null;
      };
      const radios = [...document.querySelectorAll('input[type="radio"], input[type="checkbox"]')];
      // A radio or checkbox is measured through its label; every other control is measured itself.
      const targets: Element[] = [
        ...document.querySelectorAll('button, select, input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'),
        ...radios.map((r) => (r as HTMLInputElement).labels?.[0] ?? r),
      ].filter((el, i, all) => all.indexOf(el) === i && shown(el));

      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > width) problems.push(`page scrolls sideways: scrollWidth ${document.documentElement.scrollWidth} > ${width}`);
      if (document.body.scrollWidth > width) problems.push(`body scrolls sideways: scrollWidth ${document.body.scrollWidth} > ${width}`);

      const scrollerOf = (el: Element): Element | null => {
        for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
          const x = getComputedStyle(p).overflowX;
          if (x === 'auto' || x === 'scroll') return p;
        }
        return null;
      };

      const boxes: { el: Element; r: DOMRect }[] = [];
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        boxes.push({ el, r });
        if (r.height < minHit - 0.5) problems.push(`${name(el)} is ${r.height.toFixed(1)} px tall, needs ${minHit}`);
        const html = el as HTMLElement;
        if (html.scrollWidth > html.clientWidth + 1 && html.clientWidth > 0) problems.push(`${name(el)} text is clipped: scrollWidth ${html.scrollWidth} > clientWidth ${html.clientWidth}`);
        if (checkEdge) {
          const scroller = scrollerOf(el);
          const box = (scroller ?? el).getBoundingClientRect();
          if (box.left < edgePx - 0.5 || box.right > width - edgePx + 0.5) {
            problems.push(`${scroller === null ? name(el) : `scroll wrapper of ${name(el)}`} spans ${box.left.toFixed(1)} to ${box.right.toFixed(1)}, needs ${edgePx} px edges of ${width}`);
          }
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1) problems.push(`${name(a.el)} overlaps ${name(b.el)} by ${w.toFixed(1)} x ${h.toFixed(1)} px`);
        }
      }
      return problems;
    },
    { minHit: MIN_HIT_PX, edgePx: PHONE_EDGE_PX, checkEdge: edge },
  );
}

for (const size of SIZES) {
  test.describe(`design spacing at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });
    const edge = size.width <= 480;

    test('Plan', async ({ page }) => {
      await openFair(page);
      expect(await audit(page, edge)).toEqual([]);
    });

    test('Game view after Simulate', async ({ page }) => {
      await openFair(page);
      await simulate(page);
      await expect(page.getByRole('application', { name: 'Game view' })).toBeVisible();
      expect(await audit(page, edge)).toEqual([]);
    });

    test('Compare after a 30 run comparison', async ({ page }) => {
      await openFair(page);
      await page.getByRole('button', { name: 'Compare', exact: true }).click();
      await page.getByTestId('pick-baseline-baseline').click();
      await page.getByTestId('pick-candidate-plus-one-checkin').click();
      await page.getByTestId('run-comparison').click();
      await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
      expect(await audit(page, edge)).toEqual([]);
    });

    test('Run sheet', async ({ page }) => {
      await openFair(page);
      await page.getByRole('button', { name: 'Print run sheet' }).click();
      await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
      expect(await audit(page, edge)).toEqual([]);
    });
  });
}
