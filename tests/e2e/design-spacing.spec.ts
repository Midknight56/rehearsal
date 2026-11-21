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
        // The tab bar is a full-width bar on a phone by design.
        if (checkEdge && el.closest('nav[aria-label="Screens"]') === null) {
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
          // The tab bar is fixed to the bottom of the window on a phone, so it sits over content that scrolls under it; the tab bar test below checks it at the end of the page.
          if (a.el.closest('nav[aria-label="Screens"]') !== null || b.el.closest('nav[aria-label="Screens"]') !== null) continue;
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
      await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
      await page.getByTestId('pick-baseline-baseline').click();
      await page.getByTestId('pick-candidate-plus-one-checkin').click();
      await page.getByTestId('run-comparison').click();
      await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
      expect(await audit(page, edge)).toEqual([]);
    });

    test('Run sheet', async ({ page }) => {
      await openFair(page);
      await page.getByRole('group', { name: 'Screen buttons' }).getByRole('button', { name: 'Print run sheet' }).click();
      await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
      expect(await audit(page, edge)).toEqual([]);
    });
  });
}

// Maintenance job "blackboard design, complete": the tab bar. Plan, Game view, Compare, Run sheet in a nav named Screens.
const PUMPKIN = 'rgb(255, 154, 61)';
const screens = (page: Page) => page.getByRole('navigation', { name: 'Screens' });
const tab = (page: Page, name: string) => screens(page).getByRole('button', { name, exact: true });
const currentTabs = (page: Page) => screens(page).locator('button[aria-current="page"]').allTextContents();
const toolbar = (page: Page) => page.getByRole('group', { name: 'Screen buttons' });

test.describe('tab bar at 1920 x 1080', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('is in the 72 px top bar: 17 px 600, the current tab chalk with a 3 px pumpkin rule below', async ({ page }) => {
    await openFair(page);
    const nav = screens(page);
    await expect(nav.getByRole('button')).toHaveText(['Plan', 'Game view', 'Compare', 'Run sheet']);
    const facts = await page.evaluate(() => {
      const bar = document.querySelector('header.topbar') as HTMLElement;
      const nav = bar.querySelector('nav[aria-label="Screens"]') as HTMLElement;
      const current = nav.querySelector('button[aria-current="page"]') as HTMLElement;
      const other = [...nav.querySelectorAll('button')].find((b) => b !== current) as HTMLElement;
      const b = bar.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      const c = getComputedStyle(current);
      const o = getComputedStyle(other);
      return {
        barTop: b.top, barHeight: b.height, navInside: n.top >= b.top - 0.5 && n.bottom <= b.bottom + 0.5, position: getComputedStyle(nav).position,
        size: c.fontSize, weight: c.fontWeight, colour: c.color, rule: c.borderBottomWidth, ruleColour: c.borderBottomColor, otherRule: o.borderBottomColor,
        currentLabel: current.textContent,
      };
    });
    expect(facts.barTop).toBe(0);
    expect(facts.barHeight).toBeGreaterThanOrEqual(72);
    expect(facts.barHeight).toBeLessThanOrEqual(80);
    expect(facts.navInside).toBe(true);
    expect(facts.position).not.toBe('fixed');
    expect(facts.size).toBe('17px');
    expect(facts.weight).toBe('600');
    expect(facts.colour).toBe('rgb(242, 239, 230)');
    expect(facts.rule).toBe('3px');
    expect(facts.ruleColour).toBe(PUMPKIN);
    expect(facts.otherRule).not.toBe(PUMPKIN);
    expect(facts.currentLabel).toBe('Plan');
  });

  test('each tab opens its screen, aria-current follows, and focus moves to the new screen heading', async ({ page }) => {
    await openFair(page);
    expect(await currentTabs(page)).toEqual(['Plan']);
    await tab(page, 'Compare').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compare scenarios' })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Compare']);
    await tab(page, 'Run sheet').click();
    await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Run sheet']);
    await tab(page, 'Plan').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Hall Community Fair: baseline' })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Plan']);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // Blind test fixes 2026-11-20: the Plan screen's second Compare button was removed; the Compare tab is the one Compare control.
  test('keeps the Print run sheet and Back to plan buttons of each screen, with the same behaviour', async ({ page }) => {
    await openFair(page);
    await expect(toolbar(page).getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0);
    await tab(page, 'Compare').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compare scenarios' })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Compare']);
    await toolbar(page).getByRole('button', { name: 'Back to plan' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Hall Community Fair: baseline' })).toBeFocused();
    await toolbar(page).getByRole('button', { name: 'Print run sheet' }).click();
    await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
    expect(await currentTabs(page)).toEqual(['Run sheet']);
  });

  test('Game view with no run shows the Plan screen at Simulate and says what to press', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Game view').click();
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Press Simulate to see the game view.');
    expect(await currentTabs(page)).toEqual(['Game view']);
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeInViewport();
    // From another screen the same.
    await tab(page, 'Compare').click();
    await tab(page, 'Game view').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('Press Simulate to see the game view.');
  });

  test('Game view with a run moves focus and scroll to the Game view heading', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await tab(page, 'Game view').click();
    const heading = page.getByRole('heading', { name: 'Game view' });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(await currentTabs(page)).toEqual(['Game view']);
    // From the Compare screen: back to Plan, then the heading.
    await tab(page, 'Compare').click();
    await tab(page, 'Game view').click();
    await expect(page.getByRole('heading', { name: 'Game view' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Game view' })).toBeInViewport();
    expect(await currentTabs(page)).toEqual(['Game view']);
    await tab(page, 'Plan').click();
    expect(await currentTabs(page)).toEqual(['Plan']);
  });

  test('the tabs are in the Tab order and work with Enter and Space', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Compare').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Compare scenarios' })).toBeFocused();
    await tab(page, 'Plan').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Hall Community Fair: baseline' })).toBeFocused();
    // Tab goes through the four tabs in order, then to the buttons of the screen's own toolbar.
    await tab(page, 'Plan').focus();
    const order: string[] = ['Plan'];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      order.push((await page.evaluate(() => document.activeElement?.textContent ?? '')).trim());
    }
    expect(order).toEqual(['Plan', 'Game view', 'Compare', 'Run sheet', 'Print run sheet', 'Go to the run']);
  });

  test('has no cross fade under reduced motion, and a 150 ms fade otherwise', async ({ page }) => {
    await openFair(page);
    const fade = () => page.evaluate(() => { const s = getComputedStyle(document.querySelector('main') as HTMLElement); return `${s.animationName} ${s.animationDuration}`; });
    expect(await fade()).toBe('screen-in 0.15s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await fade()).toMatch(/^none /);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByLabel('Motion').selectOption('reduce');
    expect(await fade()).toMatch(/^none /);
  });
});

test.describe('tab bar at 360 x 640', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
  });

  test('is the 64 px bottom bar of four equal tabs: 13 px 600, the current tab with a 3 px pumpkin rule on top', async ({ page }) => {
    await openFair(page);
    const facts = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Screens"]') as HTMLElement;
      const n = nav.getBoundingClientRect();
      const buttons = [...nav.querySelectorAll('button')] as HTMLElement[];
      const current = nav.querySelector('button[aria-current="page"]') as HTMLElement;
      const c = getComputedStyle(current);
      return {
        position: getComputedStyle(nav).position, top: n.top, bottom: n.bottom, height: n.height, left: n.left, right: n.right,
        widths: buttons.map((b) => Math.round(b.getBoundingClientRect().width * 10) / 10), heights: buttons.map((b) => b.getBoundingClientRect().height),
        size: c.fontSize, weight: c.fontWeight, rule: c.borderTopWidth, ruleColour: c.borderTopColor, bottomRule: c.borderBottomWidth,
        innerHeight: window.innerHeight, innerWidth: window.innerWidth,
      };
    });
    expect(facts.position).toBe('fixed');
    expect(facts.height).toBe(64);
    expect(facts.bottom).toBe(facts.innerHeight);
    expect(facts.left).toBe(0);
    expect(facts.right).toBe(facts.innerWidth);
    expect(facts.widths).toEqual([90, 90, 90, 90]);
    expect(Math.min(...facts.heights)).toBeGreaterThanOrEqual(44);
    expect(facts.size).toBe('13px');
    expect(facts.weight).toBe('600');
    expect(facts.rule).toBe('3px');
    expect(facts.ruleColour).toBe(PUMPKIN);
    expect(facts.bottomRule).toBe('0px');
    expect(await currentTabs(page)).toEqual(['Plan']);
  });

  test('the page ends above the bar: at the end of every screen no control is under it', async ({ page }) => {
    await openFair(page);
    const covered = async (): Promise<string[]> => {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return page.evaluate(() => {
        const bar = (document.querySelector('nav[aria-label="Screens"]') as HTMLElement).getBoundingClientRect();
        const problems: string[] = [];
        if (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight - 1) problems.push('did not reach the end of the page');
        for (const el of document.querySelectorAll('button, input, select, a[href], textarea, [tabindex="0"]')) {
          if (el.closest('nav[aria-label="Screens"]') !== null) continue;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden' || s.display === 'none') continue;
          if (r.bottom > bar.top + 0.5 && r.top < bar.bottom - 0.5) problems.push(`${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" is under the tab bar`);
        }
        const last = document.querySelector('main') as HTMLElement;
        if (last.getBoundingClientRect().bottom > bar.top + 0.5) problems.push('main runs under the tab bar');
        return problems;
      });
    };
    expect(await covered()).toEqual([]);
    await simulate(page);
    expect(await covered()).toEqual([]);
    await tab(page, 'Compare').click();
    expect(await covered()).toEqual([]);
    await tab(page, 'Run sheet').click();
    await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
    expect(await covered()).toEqual([]);
  });

  test('each tab opens its screen from the bottom bar, and Game view with a run reaches the heading above the bar', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await tab(page, 'Game view').click();
    const heading = page.getByRole('heading', { name: 'Game view' });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(await currentTabs(page)).toEqual(['Game view']);
    await tab(page, 'Compare').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compare scenarios' })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Compare']);
    await tab(page, 'Run sheet').click();
    await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
    expect(await currentTabs(page)).toEqual(['Run sheet']);
    await tab(page, 'Plan').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Harbor Hall Community Fair: baseline' })).toBeFocused();
    expect(await currentTabs(page)).toEqual(['Plan']);
  });

  test('Game view with no run says what to press', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Game view').click();
    await expect(page.getByRole('status')).toHaveText('Press Simulate to see the game view.');
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeInViewport();
  });
});