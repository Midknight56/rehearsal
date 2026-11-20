// Landing preview (spec landing-preview): the community fair replays in the game view on the landing, with the paired result
// line beside it. Headless Chromium against the test build, whose window.__rehearsal reports the game view clock.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const IMG = 'docs/acceptance/img';
const SENTENCE = 'One more check-in desk cuts the mean wait by 297.4 s. Lower in 30 of 30 paired runs.';
type Probe = { clockMs: number; playing: boolean; speed: number; rendererStatus: string; framesLast2s: number; spritesDrawn: number };
type Hooked = { __rehearsal?: { gameView(): { debug(): Probe; seek?(ms: number): void; sampleNow(): { perStation: Record<string, { waiting: number }> } } } };
const LOOP_START_MS = 240_000;
const LOOP_END_MS = 960_000;

/** Resolves with performance.now() (ms since navigation start) at the first frame where the clock is past 04:00 (the loop start) while playing and frames are drawn. */
async function firstMovingFrameMs(page: Page): Promise<number> {
  const handle = await page.waitForFunction(
    () => {
      try {
        const d = (window as unknown as Hooked).__rehearsal?.gameView().debug();
        return d !== undefined && d.rendererStatus === 'ready' && d.playing && d.clockMs > 240_000 && d.framesLast2s > 0 ? performance.now() : false;
      } catch {
        return false;
      }
    },
    null,
    { polling: 'raf', timeout: 20_000 },
  );
  return (await handle.jsonValue()) as number;
}

const probe = (page: Page): Promise<Probe> => page.evaluate(() => (window as unknown as Hooked).__rehearsal!.gameView().debug());
/** Like probe, but -1 while the test hook or the view is not there yet. */
const clockOf = (page: Page): Promise<number> => page.evaluate(() => { try { return (window as unknown as Hooked).__rehearsal!.gameView().debug().clockMs; } catch { return -1; } });

test.describe('the preview on the landing', () => {
  test('shows the first moving frame within 2,000 ms of the landing showing', async ({ page }) => {
    await page.goto('/');
    const ms = await firstMovingFrameMs(page);
    console.log(`landing-preview: first moving frame at ${ms.toFixed(0)} ms after navigation start (headless Chromium)`);
    expect(ms).toBeLessThan(2000);
    const d = await probe(page);
    expect(d.playing).toBe(true);
  });

  test('plays at 4x from 04:00 and the picture has a name and a text alternative', async ({ page }) => {
    await page.goto('/');
    await firstMovingFrameMs(page);
    const d = await probe(page);
    expect(d.clockMs).toBeGreaterThanOrEqual(LOOP_START_MS);
    expect(d.speed).toBe(4);
    await expect(page.getByTestId('landing-clock')).toContainText('playing at 4\u00d7');
    const picture = page.getByRole('img', { name: /community fair/i });
    await expect(picture).toBeVisible();
    const describedBy = await picture.getAttribute('aria-describedby');
    expect((await page.locator(`#${describedBy}`).textContent())?.length).toBeGreaterThan(20);
    await expect(page.getByText('Replay of replication 0, one example run')).toBeVisible();
  });

  test('shows people and a line one second after the first moving frame', async ({ page }) => {
    await page.goto('/');
    await firstMovingFrameMs(page);
    await page.waitForTimeout(1000);
    const seen = await page.evaluate(() => {
      const view = (window as unknown as Hooked).__rehearsal!.gameView();
      return { sprites: view.debug().spritesDrawn, waiting: view.sampleNow().perStation.checkin?.waiting ?? -1, clockMs: view.debug().clockMs };
    });
    console.log(`landing-preview: one second after the first moving frame: clock ${seen.clockMs} ms, sprites drawn ${seen.sprites}, waiting at checkin ${seen.waiting}`);
    expect(seen.sprites).toBeGreaterThanOrEqual(8);
    expect(seen.waiting).toBeGreaterThanOrEqual(5);
  });

  test('loops: the clock passes 16:00 at least once in 10 seconds and never reads below 04:00', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await firstMovingFrameMs(page);
    // At 4x the replay needs 180 s of real time to cross 12 simulated minutes, so the test moves the clock to 15:55 with the
    // handle's own seek and lets the preview's loop do the rest. The loop itself is not touched.
    await page.evaluate((ms) => (window as unknown as Hooked).__rehearsal!.gameView().seek!(ms), LOOP_END_MS - 5000);
    const readings = await page.evaluate(
      (ms) =>
        new Promise<number[]>((resolve) => {
          const out: number[] = [];
          const started = performance.now();
          const tick = (): void => {
            out.push((window as unknown as Hooked).__rehearsal!.gameView().debug().clockMs);
            if (performance.now() - started >= ms) resolve(out);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      10_000,
    );
    const max = Math.max(...readings);
    const min = Math.min(...readings);
    let wraps = 0;
    for (let i = 1; i < readings.length; i += 1) if (readings[i]! < readings[i - 1]!) wraps += 1;
    console.log(`landing-preview: loop over 10 s after a seek to 15:55: ${readings.length} readings, min ${min} ms, max ${max} ms, ${wraps} wrap(s)`);
    expect(max).toBeGreaterThanOrEqual(LOOP_END_MS - 1000);
    expect(wraps).toBeGreaterThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(LOOP_START_MS);
    await expect(page.getByTestId('landing-clock')).toContainText('playing at 4\u00d7');
  });
  test('builds the result line from the paired run', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-result')).toHaveText(SENTENCE, { timeout: 30_000 });
  });

  test('keeps Try the community fair as the first Tab stop and adds no stop inside the preview', async ({ page }) => {
    await page.goto('/');
    await firstMovingFrameMs(page);
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('try-community-fair')).toBeFocused();
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => document.querySelector('[data-testid="landing-preview"]')?.contains(document.activeElement) ?? false);
      expect(inside).toBe(false);
    }
    const labels = await page.getByRole('button').allTextContents();
    expect(labels.slice(0, 2)).toEqual(['Try the community fair', 'Import a spreadsheet or CSV']);
  });

  test('makes exactly three requests under /examples/ for the preview and Try the community fair together', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/examples/')) requested.push(new URL(r.url()).pathname);
    });
    await page.goto('/');
    await firstMovingFrameMs(page);
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    expect(requested).toHaveLength(3);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('shows one still frame with the clock paused at 05:00', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('landing-clock')).toContainText('05:00', { timeout: 15_000 });
    await expect.poll(() => clockOf(page), { timeout: 10_000 }).toBe(300_000);
    await page.waitForTimeout(1200);
    const d = await probe(page);
    expect(d.clockMs).toBe(300_000);
    expect(d.playing).toBe(false);
  });
});

test.setTimeout(60_000);

type Audit = { problems: string[]; measures: string[] };

async function audit(page: Page): Promise<Audit> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const measures: string[] = [];
    const root = document.querySelector('main.landing') as HTMLElement;
    const W = window.innerWidth;
    const rectOf = (el: Element): DOMRect => el.getBoundingClientRect();
    const shown = (el: Element): boolean => {
      const r = rectOf(el);
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const name = (el: Element): string => `${el.tagName.toLowerCase()}${el.getAttribute('data-landing-part') ? `[${el.getAttribute('data-landing-part')}]` : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
    measures.push(`viewport ${W} x ${window.innerHeight}; scrollWidth ${document.documentElement.scrollWidth}`);
    if (document.documentElement.scrollWidth > W) problems.push(`horizontal scroll: scrollWidth ${document.documentElement.scrollWidth} > ${W}`);

    const parts = [...root.querySelectorAll('[data-landing-part]')].filter(shown);
    if (parts.length < 4) problems.push(`only ${parts.length} landing parts found`);
    for (const p of parts) {
      const r = rectOf(p);
      measures.push(`part ${p.getAttribute('data-landing-part')}: x ${r.left.toFixed(0)} to ${r.right.toFixed(0)}, y ${r.top.toFixed(0)} to ${r.bottom.toFixed(0)}`);
    }
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j < parts.length; j += 1) {
        const a = rectOf(parts[i]!);
        const b = rectOf(parts[j]!);
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) {
          problems.push(`parts overlap: ${name(parts[i]!)} and ${name(parts[j]!)}`);
        }
      }
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!shown(el)) continue;
      const s = getComputedStyle(el);
      if (s.position === 'absolute' && el.closest('.visually-hidden') !== null) continue;
      const r = rectOf(el);
      if (r.left < -0.5 || r.right > W + 0.5) problems.push(`clipped by the viewport edge: ${name(el)} x ${r.left.toFixed(1)} to ${r.right.toFixed(1)}`);
    }

    const controls = [...root.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(shown);
    for (const c of controls) {
      const r = rectOf(c);
      measures.push(`control ${name(c)}: ${r.width.toFixed(0)} x ${r.height.toFixed(0)} at ${r.left.toFixed(0)}, ${r.top.toFixed(0)}`);
      if (r.width < 43.5 || r.height < 43.5) problems.push(`control under 44 x 44: ${name(c)} is ${r.width.toFixed(1)} x ${r.height.toFixed(1)}`);
    }
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const a = rectOf(controls[i]!);
        const b = rectOf(controls[j]!);
        const dx = Math.max(a.left - b.right, b.left - a.right);
        const dy = Math.max(a.top - b.bottom, b.top - a.bottom);
        const gap = Math.max(dx, dy);
        if (gap < 7.5) problems.push(`controls under 8 px apart (${gap.toFixed(1)}): ${name(controls[i]!)} and ${name(controls[j]!)}`);
      }
    }
    for (const el of [...root.querySelectorAll('*')]) {
      if (!shown(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
      if (own && parseFloat(getComputedStyle(el).fontSize) < 12) problems.push(`text under 12 px: ${name(el)} is ${getComputedStyle(el).fontSize}`);
    }
    const canvas = root.querySelector('canvas');
    if (canvas === null) problems.push('no canvas on the landing');
    else {
      const r = rectOf(canvas);
      measures.push(`canvas ${r.width.toFixed(0)} x ${r.height.toFixed(0)}`);
      if (r.width < 200 || r.height < 100) problems.push(`canvas too small: ${r.width} x ${r.height}`);
    }
    return { problems, measures };
  });
}

for (const size of [
  { width: 360, height: 640 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`layout at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    test('has no horizontal scroll, overlap, clipping, small control or small text', async ({ page }) => {
      await page.goto('/');
      await firstMovingFrameMs(page);
      await expect(page.getByTestId('landing-result')).toBeVisible({ timeout: 30_000 });
      const result = await audit(page);
      console.log(`landing-preview layout ${size.width}x${size.height}:\n${result.measures.join('\n')}`);
      expect(result.problems).toEqual([]);
    });

    test('is captured after the replay has run 3 seconds', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('landing-result')).toBeVisible({ timeout: 30_000 });
      await firstMovingFrameMs(page);
      await page.waitForTimeout(3000);
      const seen = await probe(page);
      console.log(`landing-preview capture ${size.width}x${size.height}: clock ${seen.clockMs} ms, sprites drawn ${seen.spritesDrawn}`);
      mkdirSync(IMG, { recursive: true });
      await page.screenshot({ path: `${IMG}/landing-preview-${size.width}x${size.height}.png`, fullPage: true });
    });
  });
}
