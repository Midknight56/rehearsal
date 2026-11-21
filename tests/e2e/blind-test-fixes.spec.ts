import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { gameDebug, openFair, simulate } from './helpers';

// Maintenance job "blind test fixes" (2026-11-20): what three first-time testers reported for Rehearsal, each checked in the
// page at the two design sizes. docs/acceptance/blind-test-fixes-2026-11-20.md lists every report and its state.

const PHONE = { width: 360, height: 640 };
const DESKTOP = { width: 1920, height: 1080 };

const screens = (page: Page) => page.getByRole('navigation', { name: 'Screens' });
const tab = (page: Page, name: string) => screens(page).getByRole('button', { name, exact: true });

/** Tables under main whose box passes the 16 px phone edge, or whose content is wider than the box that holds it. */
async function cutTables(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const table of document.querySelectorAll('main table')) {
      const r = table.getBoundingClientRect();
      if (r.width === 0 || table.closest('[hidden], dialog:not([open])') !== null) continue;
      const name = table.querySelector('caption')?.textContent ?? '(no caption)';
      if (r.right > W - 16 + 0.5 || r.left < 16 - 0.5) out.push(`${name}: spans ${r.left.toFixed(0)} to ${r.right.toFixed(0)} of ${W}`);
      const holder = table.parentElement as HTMLElement;
      if (holder.scrollWidth > holder.clientWidth + 1) out.push(`${name}: ${holder.scrollWidth} px of content in ${holder.clientWidth} px, the rest is off screen`);
      for (const cell of table.querySelectorAll('td, th')) {
        // A header row kept only for a screen reader (clipped to nothing) is not on screen.
        const head = cell.closest('thead');
        if (head !== null && getComputedStyle(head).clipPath !== 'none' && head.getBoundingClientRect().width <= 1) continue;
        const c = cell.getBoundingClientRect();
        if (c.width > 0 && c.right > W - 16 + 0.5) out.push(`${name}: a cell ends at ${c.right.toFixed(0)}`);
      }
    }
    return out;
  });
}

/** Text whose box passes the screen edge, inside the given root. */
async function cutText(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const W = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const root of document.querySelectorAll(sel)) {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
        if (!own) continue;
        // Text kept only for a screen reader (clipped to nothing) is not on screen.
        if ([...document.querySelectorAll('.visually-hidden, thead')].some((h) => h.contains(el) && getComputedStyle(h).clipPath !== 'none')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > W + 0.5) out.push(`"${(el.textContent ?? '').slice(0, 40)}" ends at ${r.right.toFixed(0)} of ${W}`);
        const html = el as HTMLElement;
        if (html.scrollWidth > html.clientWidth + 1 && getComputedStyle(html).overflowX !== 'visible') out.push(`"${(el.textContent ?? '').slice(0, 40)}" is cut: ${html.scrollWidth} > ${html.clientWidth}`);
      }
    }
    return out;
  }, selector);
}

test.describe('servers 0 (sonnet-a, sonnet-b)', () => {
  test.use({ viewport: DESKTOP });

  test('BT1 after a run, Servers 0 hides the old results and Simulate never says Run complete', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await expect(page.getByRole('table', { name: 'Result metrics' })).toBeVisible();
    const servers = page.getByRole('textbox', { name: 'servers of checkin' });
    await servers.fill('0');
    await servers.press('Tab');
    await expect(page.locator('main .field-error').filter({ hasText: /servers must be a whole number from 1 to 20 \(got 0\)/ })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Result metrics' })).toBeHidden();
    await expect(page.getByRole('table', { name: 'Station results' })).toBeHidden();
    await page.getByRole('button', { name: 'Simulate' }).click();
    await expect(page.getByRole('status')).toContainText('Run blocked');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('status')).not.toContainText('Run complete');
    await expect(page.getByRole('table', { name: 'Result metrics' })).toBeHidden();
    await expect(page.getByRole('group', { name: 'Run' })).toContainText('servers of checkin');
    // Fixing the field brings the run back.
    await servers.fill('2');
    await servers.press('Tab');
    await simulate(page);
    await expect(page.getByRole('table', { name: 'Result metrics' })).toBeVisible();
  });

  test('BT2 with no run yet, Servers 0 and Simulate start no run', async ({ page }) => {
    await openFair(page);
    const servers = page.getByRole('textbox', { name: 'servers of checkin' });
    await servers.fill('0');
    await servers.press('Enter');
    await page.getByRole('button', { name: 'Simulate' }).click();
    await expect(page.getByRole('status')).toContainText('Run blocked');
    await page.waitForTimeout(1500);
    await expect(page.getByRole('status')).not.toContainText('Run complete');
    await expect(page.getByRole('table', { name: 'Result metrics' })).toHaveCount(0);
  });
});

test.describe('phone tables (sonnet-a, sonnet-b)', () => {
  test.use({ viewport: PHONE });

  test('BT3 Arrivals and Stations fit inside the phone screen', async ({ page }) => {
    await openFair(page);
    expect(await cutTables(page)).toEqual([]);
  });

  test('BT4 Result metrics and Station results fit inside the phone screen', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    expect(await cutTables(page)).toEqual([]);
    // "Counted over" no longer wraps one word per line: each value is on at most two lines.
    const lines = await page.evaluate(() => {
      const table = [...document.querySelectorAll('table')].find((t) => t.querySelector('caption')?.textContent === 'Result metrics')!;
      return [...table.querySelectorAll('tbody tr')].map((tr) => {
        const td = tr.querySelectorAll('td')[1] as HTMLElement;
        const range = document.createRange();
        range.selectNodeContents(td);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        const lh = parseFloat(getComputedStyle(td).lineHeight) || 22;
        return Math.round((Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top))) / lh);
      });
    });
    expect(Math.max(...lines)).toBeLessThanOrEqual(2);
  });

  test('BT5 the run sheet tables and the hash line fit inside the phone screen', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Run sheet').click();
    await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
    expect(await cutTables(page)).toEqual([]);
    expect(await cutText(page, '#run-sheet')).toEqual([]);
  });

  test('BT6 the Compare tables fit inside the phone screen', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Compare').click();
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
    expect(await cutTables(page)).toEqual([]);
  });
});

test.describe('count 999999 (sonnet-a)', () => {
  test.use({ viewport: DESKTOP });
  test('BT7 the count box shows all six digits of 999999', async ({ page }) => {
    await openFair(page);
    const count = page.getByRole('textbox', { name: 'count of doors' });
    await count.fill('999999');
    await count.press('Tab');
    const fits = await count.evaluate((el) => (el as HTMLInputElement).scrollWidth <= (el as HTMLInputElement).clientWidth + 1);
    expect(fits).toBe(true);
  });
});

test.describe('Compare order (sonnet-a, sonnet-b)', () => {
  test.use({ viewport: DESKTOP });
  test('BT8 Compare starts with the plain fair as baseline and reads like the landing sentence', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-result')).toContainText('cuts the mean wait', { timeout: 30_000 });
    await page.getByTestId('try-community-fair').click();
    await tab(page, 'Compare').click();
    await expect(page.getByTestId('pick-baseline-baseline')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('pick-candidate-plus-one-checkin')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
    await expect(page.getByTestId('compare-headline')).toContainText('drops by', { timeout: 5_000 });
  });
});

test.describe('plain words (haiku, sonnet-a, sonnet-b)', () => {
  test.use({ viewport: DESKTOP });

  test('BT9 the Plan screen says in plain words what each column means', async ({ page }) => {
    await openFair(page);
    const arrivals = page.getByRole('list', { name: 'What the arrivals columns mean' });
    await expect(arrivals).toBeVisible();
    for (const term of ['Cohort ID', 'Start and End (min)', 'Count (people)', 'Arrival pattern', 'Route']) await expect(arrivals).toContainText(term);
    await expect(arrivals).toContainText('even');
    await expect(arrivals).toContainText('uniform');
    await expect(arrivals).toContainText('|');
    const stations = page.getByRole('list', { name: 'What the stations columns mean' });
    await expect(stations).toBeVisible();
    for (const term of ['Station ID', 'Label', 'Servers', 'Service min, mode and max (s)', 'Cell (x, y)']) await expect(stations).toContainText(term);
    await expect(page.getByRole('region', { name: 'Layout' })).toContainText('nobody can walk through');
    await expect(page.getByRole('region', { name: 'Assumptions' })).toContainText('first in, first out');
    await expect(page.getByRole('region', { name: 'Assumptions' })).toContainText('fingerprint');
  });

  test('BT10 the results say what replication 0 and the hash are', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    const results = page.getByRole('region', { name: 'Run and results' });
    await expect(results.getByText(/Replication 0 is the first simulated run/)).toBeVisible();
    await expect(results.getByText(/fingerprint of the plan/)).toBeVisible();
  });

  test('BT11 the Compare screen says what paired runs, the range and p95 mean', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Compare').click();
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
    const help = page.getByRole('list', { name: 'How to read this comparison' });
    await expect(help).toBeVisible();
    await expect(help).toContainText('paired run');
    await expect(help).toContainText('same simulated attendees');
    await expect(help).toContainText('Mean change');
    await expect(help).toContainText('variation across these simulated runs');
    await expect(help).toContainText('p95');
  });

  test('BT12 the landing says the moving picture is a sample and what a spreadsheet needs', async ({ page }) => {
    await page.goto('/');
    const preview = page.getByTestId('landing-preview');
    // The words sit above the moving picture, so they are read before it.
    const sample = preview.getByText(/^A sample:/);
    await expect(sample).toBeVisible();
    const textBox = await sample.boundingBox();
    const canvasBox = await page.getByTestId('landing-canvas').boundingBox();
    expect((textBox?.y ?? 9999) + (textBox?.height ?? 0)).toBeLessThanOrEqual(canvasBox?.y ?? 0);
    await expect(page.getByText(/sheets named Arrivals and Stations/)).toBeVisible();
  });
});

for (const size of [PHONE, DESKTOP]) {
  test.describe(`starting point at ${size.width} x ${size.height} (haiku, sonnet-a, sonnet-b)`, () => {
    test.use({ viewport: size });
    test('BT13 the first view of the Plan screen says what to do and leads to Simulate', async ({ page }) => {
      await openFair(page);
      const steps = page.getByRole('list', { name: 'How to use this page' });
      await expect(steps).toBeVisible();
      const box = await steps.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(size.height);
      await expect(steps).toContainText('Simulate');
      await expect(steps).toContainText('Compare');
      await page.getByRole('button', { name: 'Go to the run' }).click();
      await expect(page.getByRole('button', { name: 'Simulate' })).toBeFocused();
      await expect(page.getByRole('button', { name: 'Simulate' })).toBeInViewport();
      // The new control keeps 16 px from the screen edge and 12 px from its neighbours.
      const gaps = await page.evaluate(() => {
        const go = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Go to the run')!;
        const r = go.getBoundingClientRect();
        const W = document.documentElement.clientWidth;
        const out: string[] = [];
        if (r.left < 16 - 0.5 || r.right > W - 16 + 0.5) out.push(`edge ${r.left} to ${r.right}`);
        for (const other of document.querySelectorAll('main button, main input, main select')) {
          if (other === go) continue;
          const o = other.getBoundingClientRect();
          if (o.width === 0) continue;
          const gap = Math.max(o.left - r.right, r.left - o.right, o.top - r.bottom, r.top - o.bottom);
          if (gap < 12 - 0.5) out.push(`${(other.textContent ?? other.getAttribute('aria-label') ?? '').slice(0, 30)} is ${gap.toFixed(1)} px away`);
        }
        return out;
      });
      expect(gaps).toEqual([]);
    });

    test('BT14 the top bar has one control named Compare', async ({ page }) => {
      await openFair(page);
      await expect(page.locator('header').getByRole('button', { name: 'Compare', exact: true })).toHaveCount(1);
    });
  });
}

test.describe('run sheet headings (sonnet-b)', () => {
  test.use({ viewport: PHONE });
  test('BT15 each run sheet table title shows once', async ({ page }) => {
    await openFair(page);
    await tab(page, 'Run sheet').click();
    const counts = await page.evaluate(() => {
      const sheet = document.querySelector('#run-sheet')!;
      const shown = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && getComputedStyle(el).clip !== 'rect(0px, 0px, 0px, 0px)';
      };
      const titles = [...sheet.querySelectorAll('h2')].map((h) => h.textContent ?? '');
      return titles.map((t) => [t, [...sheet.querySelectorAll('h2, caption')].filter((e) => e.textContent === t && shown(e)).length] as const);
    });
    for (const [title, n] of counts) expect(n, title).toBe(1);
  });
});

/** Controls under 12 px from a neighbour, and HTML text under 12 px. The drawings (the floor plan SVG and the game canvas) are not HTML text and are listed in the fixes document. */
async function spacing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shown = (el: Element): boolean => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 && el.closest('[hidden], dialog:not([open]), .visually-hidden') === null;
    };
    const name = (el: Element): string => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
    const controls = [...document.querySelectorAll('button, select, input:not([type=radio]):not([type=hidden]), .speed label')].filter((el) => shown(el) && el.closest('nav[aria-label="Screens"]') === null);
    const out: string[] = [];
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!;
        const b = controls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const x = a.getBoundingClientRect();
        const y = b.getBoundingClientRect();
        const gap = Math.max(x.left - y.right, y.left - x.right, x.top - y.bottom, y.top - x.bottom);
        if (gap < 11.5) out.push(`${name(a)} and ${name(b)} are ${gap.toFixed(1)} px apart`);
      }
    }
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el) || el.closest('.floorplan svg') !== null) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (own && parseFloat(getComputedStyle(el).fontSize) < 11.95) out.push(`${name(el)} is ${getComputedStyle(el).fontSize}`);
    }
    return out;
  });
}

for (const size of [PHONE, DESKTOP]) {
  test.describe(`job rules at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });
    test('BT16 every control keeps 12 px from its neighbours and every HTML text is at least 12 px', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('landing-result')).toBeVisible({ timeout: 30_000 });
      expect(await spacing(page), 'landing').toEqual([]);
      await page.getByTestId('try-community-fair').click();
      await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
      expect(await spacing(page), 'plan').toEqual([]);
      await simulate(page);
      expect(await spacing(page), 'after Simulate').toEqual([]);
      await tab(page, 'Compare').click();
      await page.getByTestId('run-comparison').click();
      await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
      expect(await spacing(page), 'compare').toEqual([]);
      await tab(page, 'Run sheet').click();
      await expect(page.getByRole('article', { name: 'Run sheet' })).toBeVisible();
      expect(await spacing(page), 'run sheet').toEqual([]);
    });
  });
}
// The reports below did not reproduce; these tests record what was measured.
test.describe('not reproduced', () => {
  test('NR1 at 360 x 640 the bottom tab bar covers nothing at the end of the page', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openFair(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const result = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="Screens"]')!.getBoundingClientRect();
      const controls = [...document.querySelectorAll('main button, main input, main select')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
      const last = Math.max(...controls.map((r) => r.bottom));
      return { barTop: bar.top, last };
    });
    expect(result.last).toBeLessThanOrEqual(result.barTop);
  });

  test('NR2 the landing shows no Cancel button to a person', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Try the community fair' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  });

  test('NR3 with Import open, Open JSON behind it cannot be reached by a person', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Import' })).toBeVisible();
    const modal = await page.getByRole('dialog', { name: 'Import' }).evaluate((d) => d.matches(':modal'));
    expect(modal).toBe(true);
    const reachable = await page.getByTestId('import-json').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === el;
    });
    expect(reachable).toBe(false);
  });

  for (const size of [{ width: 390, height: 844 }, PHONE]) {
    test(`NR4 landing map labels at ${size.width} x ${size.height} are inside the canvas and clear of each other`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(page.getByTestId('landing-result')).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1000);
      const b = (await gameDebug(page)).labelBounds as { canvas: { width: number; height: number }; labels: { text: string; left: number; top: number; right: number; bottom: number }[] };
      const problems: string[] = [];
      for (const l of b.labels) if (l.left < -0.01 || l.top < -0.01 || l.right > b.canvas.width + 0.01 || l.bottom > b.canvas.height + 0.01) problems.push(`${l.text} outside`);
      for (let i = 0; i < b.labels.length; i++) {
        for (let j = i + 1; j < b.labels.length; j++) {
          const p = b.labels[i]!;
          const q = b.labels[j]!;
          if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) problems.push(`${p.text} overlaps ${q.text}`);
        }
      }
      console.log(`landing labels ${size.width}: ${JSON.stringify(b.labels.map((l) => [l.text, Math.round(l.left), Math.round(l.right)]))} canvas ${b.canvas.width}`);
      expect(problems).toEqual([]);
    });
  }
});
