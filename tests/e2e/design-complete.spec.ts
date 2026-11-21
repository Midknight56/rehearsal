import { expect, test, type Page } from '@playwright/test';
import { COMPLETE_TEXT } from '../../src/comparison/labels';
import { gameDebug, openFair, simulate } from './helpers';

// Maintenance job "blackboard design, complete": ghosts at full size, the followed guest, the floor filling its panel, the chalk
// look, and the Motion section of the handoff. Drawing only: nothing here reads a model number.

const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080, ghost: 26 },
  { name: '360x640', width: 360, height: 640, ghost: 14 },
] as const;

type Motion = { ghostPx: number; ringScale: number; cameraEasing: boolean; glideActive: boolean; chalkTexture: boolean; zoom: number; fitZoom: number };
type Projection = { canvas: { width: number; height: number }; cellPx: number; floor: { left: number; top: number; right: number; bottom: number } };
const motion = async (page: Page): Promise<Motion> => (await gameDebug(page)).motion as Motion;
const projection = async (page: Page): Promise<Projection> => (await gameDebug(page)).projection as Projection;

async function find(page: Page, id: string): Promise<void> {
  const box = page.getByRole('combobox', { name: 'Find attendee' });
  await box.fill(id);
  await box.press('Enter');
}

/** Pauses at `ms` of simulated time through the scrubber, as a person would. */
async function pauseAt(page: Page, ms: number): Promise<void> {
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('slider', { name: 'Simulated time' }).evaluate((el: HTMLInputElement, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, ms);
}

for (const size of SIZES) {
  test.describe(`design complete at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
    });

    test('ghosts are drawn at full size: the design size on the fitted floor, larger with the camera zoom', async ({ page }) => {
      await openFair(page);
      await simulate(page);
      await page.getByRole('button', { name: 'Fit' }).click();
      const m = await motion(page);
      expect(m.ghostPx).toBe(size.ghost);
      expect(m.zoom).toBeCloseTo(m.fitZoom, 6);
      await pauseAt(page, 120_000);
      await find(page, 'doors#0007');
      await page.getByRole('button', { name: 'Follow' }).click();
      await expect.poll(async () => (await motion(page)).cameraEasing, { timeout: 5000 }).toBe(false);
      const zoomed = await motion(page);
      expect(zoomed.zoom).toBeGreaterThanOrEqual(2);
      expect(zoomed.ghostPx).toBe(Math.min(52, Math.round((size.ghost * zoomed.zoom) / zoomed.fitZoom)));
      expect(zoomed.ghostPx).toBeGreaterThan(size.ghost);
    });

    test('the floor fills the Game view canvas and the Plan floor plan panel as far as its proportions allow', async ({ page }) => {
      await openFair(page);
      await simulate(page);
      await page.getByRole('button', { name: 'Fit' }).click();
      const p = await projection(page);
      const floorW = p.floor.right - p.floor.left;
      const floorH = p.floor.bottom - p.floor.top;
      // The canvas has the floor's proportions (40 by 24 cells), so the longer side meets the edge within one cell, and so does the shorter.
      expect(Math.abs(p.canvas.width - floorW)).toBeLessThanOrEqual(p.cellPx);
      expect(Math.abs(p.canvas.height - floorH)).toBeLessThanOrEqual(p.cellPx);
      expect(p.floor.left).toBeGreaterThanOrEqual(-p.cellPx);
      expect(p.floor.right).toBeLessThanOrEqual(p.canvas.width + p.cellPx);
      expect(Math.abs(p.canvas.width / p.canvas.height - 40 / 24)).toBeLessThan(0.02);
      if (size.width === 360) expect(p.canvas.width).toBe(328);
      // Plan: the SVG after Fit.
      await page.getByRole('button', { name: 'Fit', exact: true }).first().scrollIntoViewIfNeeded();
      const plan = await page.evaluate(() => {
        const wrapper = document.querySelector('.floorplan-wrapper') as HTMLElement;
        const svg = wrapper.querySelector('svg') as SVGElement;
        return { wrapper: wrapper.clientWidth, svg: svg.getBoundingClientRect().width, cell: svg.getBoundingClientRect().width / 40 };
      });
      expect(plan.svg).toBeLessThanOrEqual(plan.wrapper + 1);
      expect(plan.wrapper - plan.svg).toBeLessThanOrEqual(plan.cell);
    });

    test('the chalk look: textured strokes in the canvas, dashed pumpkin lanes and filtered strokes only on the floor plan', async ({ page }) => {
      await openFair(page);
      expect((await page.evaluate(() => document.querySelectorAll('.floorplan [data-lane]').length))).toBe(2);
      const plan = await page.evaluate(() => {
        const lane = document.querySelector('.floorplan [data-lane] rect') as SVGRectElement;
        const s = getComputedStyle(lane);
        const strokes = [...document.querySelectorAll('.floorplan [filter]')];
        return {
          dash: s.strokeDasharray, stroke: s.stroke,
          filtered: strokes.map((e) => e.tagName.toLowerCase()),
          textFiltered: document.querySelectorAll('.floorplan text[filter], .floorplan g[filter], .floorplan text *[filter]').length,
          filter: document.querySelector('#chalk-rough') !== null,
          widths: [...document.querySelectorAll('.floorplan .gate, .floorplan .marker rect, .floorplan .route polyline')].map((e) => Number.parseFloat(getComputedStyle(e).strokeWidth)),
        };
      });
      expect(plan.dash).not.toBe('none');
      expect(plan.stroke).toBe('rgb(255, 154, 61)');
      expect(plan.filter).toBe(true);
      expect(plan.filtered.length).toBeGreaterThan(5);
      expect(new Set(plan.filtered)).toEqual(new Set(['rect', 'polyline', 'line'].filter((t) => plan.filtered.includes(t))));
      expect(plan.textFiltered).toBe(0);
      for (const w of plan.widths) {
        expect(w).toBeGreaterThanOrEqual(2);
        expect(w).toBeLessThanOrEqual(3);
      }
      await simulate(page);
      expect((await motion(page)).chalkTexture).toBe(true);
      await expect.poll(async () => ((await gameDebug(page)).labelBounds as { pathLabels: unknown[] }).pathLabels.length).toBeGreaterThan(0);
      const bounds = (await gameDebug(page)).labelBounds as { canvas: { width: number; height: number }; pathLabels: { text: string; left: number; top: number; right: number; bottom: number }[] };
      expect(bounds.pathLabels.length).toBeGreaterThan(0);
      for (const l of bounds.pathLabels) {
        expect(l.text).toMatch(/^[\d.]+ m$/);
        expect(l.left).toBeGreaterThanOrEqual(0);
        expect(l.top).toBeGreaterThanOrEqual(0);
        expect(l.right).toBeLessThanOrEqual(bounds.canvas.width);
        expect(l.bottom).toBeLessThanOrEqual(bounds.canvas.height);
      }
    });
  });
}

test.describe('motion (Motion section of the design)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('following: the camera eases 400 ms and the ring pulses once 1 to 1.25 to 1 in 600 ms, then both are at rest', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await pauseAt(page, 120_000);
    await find(page, 'doors#0007');
    // A clock that stands still until runFor moves it, so the timings below do not depend on how fast this PC is.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.getByRole('button', { name: 'Follow' }).click();
    await page.clock.runFor(16);
    expect((await motion(page)).cameraEasing).toBe(true);
    await page.clock.runFor(284);
    const peak = await motion(page);
    expect(peak.ringScale).toBeGreaterThan(1.2);
    expect(peak.ringScale).toBeLessThanOrEqual(1.25 + 1e-6);
    expect(peak.cameraEasing).toBe(true);
    await page.clock.runFor(150);
    expect((await motion(page)).cameraEasing).toBe(false);
    await page.clock.runFor(300);
    const rest = await motion(page);
    expect(rest.ringScale).toBe(1);
    expect(rest.zoom).toBe(2);
    // Releasing eases back to the whole floor and lands exactly on the fit.
    await page.getByRole('application', { name: 'Game view' }).focus();
    await page.keyboard.press('Escape');
    await page.clock.runFor(16);
    expect((await motion(page)).cameraEasing).toBe(true);
    await page.clock.runFor(500);
    const fit = await motion(page);
    expect(fit.cameraEasing).toBe(false);
    expect(fit.zoom).toBeCloseTo(fit.fitZoom, 6);
  });

  test('reduced motion (system setting): following snaps, no pulse, no easing; playback still moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFair(page);
    await simulate(page);
    await find(page, 'doors#0007');
    await page.getByRole('button', { name: 'Follow' }).click();
    const m = await motion(page);
    expect(m.cameraEasing).toBe(false);
    expect(m.ringScale).toBe(1);
    expect(m.zoom).toBe(2);
    await page.getByRole('button', { name: 'Play' }).click();
    const before = (await gameDebug(page)).clockMs as number;
    await expect.poll(async () => (await gameDebug(page)).clockMs as number).toBeGreaterThan(before);
    await page.getByRole('application', { name: 'Game view' }).focus();
    await page.keyboard.press('Escape');
    const fit = await motion(page);
    expect(fit.cameraEasing).toBe(false);
    expect(fit.zoom).toBeCloseTo(fit.fitZoom, 6);
  });

  test('reduced motion (the Motion toggle): the same, without a reload', async ({ page }) => {
    await openFair(page);
    await page.getByLabel('Motion').selectOption('reduce');
    await simulate(page);
    await find(page, 'doors#0007');
    await page.getByRole('button', { name: 'Follow' }).click();
    const m = await motion(page);
    expect(m.cameraEasing).toBe(false);
    expect(m.ringScale).toBe(1);
  });

  test('step forward and back glide 120 ms; scrubbing snaps', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await pauseAt(page, 60_000);
    // A clock that stands still until runFor moves it, so the timings below do not depend on how fast this PC is.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.getByRole('button', { name: 'Step forward' }).click();
    await page.clock.runFor(16);
    expect((await motion(page)).glideActive).toBe(true);
    await page.clock.runFor(130);
    expect((await motion(page)).glideActive).toBe(false);
    await page.getByRole('button', { name: 'Step back' }).click();
    await page.clock.runFor(16);
    expect((await motion(page)).glideActive).toBe(true);
    await page.clock.runFor(130);
    expect((await motion(page)).glideActive).toBe(false);
    await page.getByRole('slider', { name: 'Simulated time' }).evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, '300000');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.clock.runFor(16);
    expect((await motion(page)).glideActive).toBe(false);
  });

  async function compare(page: Page): Promise<void> {
    await openFair(page);
    await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Compare', exact: true }).click();
    await page.getByTestId('pick-baseline-baseline').click();
    await page.getByTestId('pick-candidate-plus-one-checkin').click();
    await page.getByTestId('run-comparison').click();
    await expect(page.getByTestId('compare-status')).toHaveText(COMPLETE_TEXT, { timeout: 90_000 });
  }

  test('Compare: 30 lines draw left to right, 400 ms each, 20 ms apart; the headline counts up to the exact value and settles on the plain sentence', async ({ page }) => {
    await compare(page);
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="slope-line"]')].map((l) => { const s = getComputedStyle(l); return { name: s.animationName, duration: s.animationDuration, delay: s.animationDelay }; }),
    );
    expect(lines).toHaveLength(30);
    lines.forEach((l, i) => {
      expect(l.name).toBe('draw-line');
      expect(l.duration).toBe('0.4s');
      expect(l.delay).toBe(`${(i * 20) / 1000}s`);
    });
    const headline = page.locator('[data-testid="compare-headline"] .headline-text');
    await expect(headline).toHaveText(/^Mean queue wait (drops|rises) by \d+\.\d s\.$/, { timeout: 5000 });
    await expect(headline.locator('[aria-hidden="true"]')).toHaveCount(0);
  });

  test('Compare under reduced motion: no line drawing, no count up; the sentence is there at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await compare(page);
    const names = await page.evaluate(() => [...document.querySelectorAll('[data-testid="slope-line"]')].map((l) => getComputedStyle(l).animationName));
    expect(new Set(names)).toEqual(new Set(['none']));
    const headline = page.locator('[data-testid="compare-headline"] .headline-text');
    await expect(headline).toHaveText(/^Mean queue wait (drops|rises) by \d+\.\d s\.$/);
    await expect(headline.locator('[aria-hidden="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('main') as HTMLElement).animationName)).toBe('none');
  });
});
