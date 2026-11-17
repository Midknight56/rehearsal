import { expect, test, type Page } from '@playwright/test';
import { gameDebug, openFair, readStatus, simulate } from './helpers';

// Maintenance job "layout polish": six visible defects measured at 1,280 x 720 on the Harbor Hall baseline.
// Each test measures with getBoundingClientRect or canvas pixel reads, through the test build's window.__rehearsal hook.

type Box = { left: number; top: number; right: number; bottom: number };

async function dragPacksTo(page: Page, cell: string): Promise<void> {
  const from = (await page.locator('[data-station="packs"]').boundingBox())!;
  const to = (await page.locator(`rect[data-cell="${cell}"]`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

type Projection = { canvas: { width: number; height: number }; cellPx: number; entrance: [number, number]; exit: [number, number]; stations: Record<string, [number, number]> };

async function projection(page: Page): Promise<Projection> {
  const debug = await gameDebug(page);
  expect(debug.rendererStatus).toBe('ready');
  return debug.projection as Projection;
}

/** Bounding box of the pixels of the game canvas that differ from the board colour, read from a screenshot of the canvas. */
async function floorPixels(page: Page): Promise<{ width: number; height: number; box: Box | null }> {
  const png = await page.locator('.game-canvas canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.naturalWidth;
    surface.height = image.naturalHeight;
    const ctx = surface.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, surface.width, surface.height);
    let box: { left: number; top: number; right: number; bottom: number } | null = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const differs = Math.abs((data[i] as number) - 11) > 6 || Math.abs((data[i + 1] as number) - 18) > 6 || Math.abs((data[i + 2] as number) - 32) > 6;
        if (!differs) continue;
        if (box === null) box = { left: x, top: y, right: x + 1, bottom: y + 1 };
        else {
          box.left = Math.min(box.left, x);
          box.top = Math.min(box.top, y);
          box.right = Math.max(box.right, x + 1);
          box.bottom = Math.max(box.bottom, y + 1);
        }
      }
    }
    return { width, height, box };
  }, png.toString('base64'));
}

/** The floor's pixel box is the same within one pixel (antialiasing at its edge). */
function expectSameFloor(actual: { box: Box | null }, expected: { box: Box | null }, when: string): void {
  expect(actual.box, when).not.toBeNull();
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) expect(Math.abs(actual.box![edge] - expected.box![edge]), `floor  edge `).toBeLessThanOrEqual(1);
}

test.describe('layout polish at 1280 px', () => {
  test('1. the status region covers no input or button', async ({ page }) => {
    await openFair(page);
    await dragPacksTo(page, '12,7');
    expect(await readStatus(page)).toBe('Welcome packs moved to (12, 7).');
    await expect(page.getByRole('status')).toHaveCount(1);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= height; y += 120) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const overlaps = await page.evaluate(() => {
        const s = document.querySelector('[role="status"]')!.getBoundingClientRect();
        const hits: string[] = [];
        for (const el of document.querySelectorAll('input, button, select')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top) hits.push(el.getAttribute('aria-label') ?? el.textContent ?? el.tagName);
        }
        return hits;
      });
      expect(overlaps, `status region overlaps controls at scrollY ${y}`).toEqual([]);
    }
  });

  test('2. every text input in the Arrivals and Stations tables shows its whole value', async ({ page }) => {
    await openFair(page);
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="Arrivals"] input[type="text"], section[aria-label="Stations"] input[type="text"]')]
        .filter((el) => (el as HTMLInputElement).scrollWidth > (el as HTMLInputElement).clientWidth)
        .map((el) => `${el.getAttribute('aria-label')}="${(el as HTMLInputElement).value}" ${(el as HTMLInputElement).scrollWidth} > ${(el as HTMLInputElement).clientWidth}`),
    );
    expect(cut).toEqual([]);
  });

  test('3. the Arrivals table lies inside its panel', async ({ page }) => {
    await openFair(page);
    const outside = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label="Arrivals"]')!.getBoundingClientRect();
      const out: string[] = [];
      for (const el of document.querySelectorAll('section[aria-label="Arrivals"] th, section[aria-label="Arrivals"] td input, section[aria-label="Arrivals"] td select, section[aria-label="Arrivals"] td button')) {
        const r = el.getBoundingClientRect();
        if (r.left < panel.left - 0.5 || r.right > panel.right + 0.5) out.push(`${el.getAttribute('aria-label') ?? el.textContent}: ${r.left.toFixed(1)}..${r.right.toFixed(1)} vs panel ${panel.left.toFixed(1)}..${panel.right.toFixed(1)}`);
      }
      return out;
    });
    expect(outside).toEqual([]);
  });

  test('4. after Fit the floor plan grid fills the canvas width', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Fit' }).click();
    const m = await page.evaluate(() => {
      const wrapper = document.querySelector('.floorplan-wrapper') as HTMLElement;
      const w = wrapper.getBoundingClientRect();
      const cells = [...document.querySelectorAll('.floorplan rect.cell')].map((c) => c.getBoundingClientRect());
      return { wrapperWidth: wrapper.clientWidth, left: Math.min(...cells.map((c) => c.left)) - w.left - wrapper.clientLeft, right: Math.max(...cells.map((c) => c.right)) - w.left - wrapper.clientLeft, cell: cells[0]!.width };
    });
    expect(m.wrapperWidth - m.right).toBeLessThanOrEqual(m.cell);
    expect(m.left).toBeLessThanOrEqual(m.cell);
  });

  test('5. the game view shows the whole floor and Find attendee leaves the camera alone', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    const p = await projection(page);
    const points: Record<string, [number, number]> = { entrance: p.entrance, exit: p.exit, ...p.stations };
    expect(Object.keys(points).sort()).toEqual(['checkin', 'entrance', 'exit', 'packs']);
    for (const [name, [x, y]] of Object.entries(points)) {
      expect(x, `${name} x`).toBeGreaterThanOrEqual(0);
      expect(x, `${name} x`).toBeLessThanOrEqual(p.canvas.width);
      expect(y, `${name} y`).toBeGreaterThanOrEqual(0);
      expect(y, `${name} y`).toBeLessThanOrEqual(p.canvas.height);
    }
    const before = await floorPixels(page);
    expect(before.box).not.toBeNull();
    const box = before.box!;
    expect(Math.abs((box.left + box.right) / 2 - before.width / 2), 'floor centred horizontally').toBeLessThanOrEqual(p.cellPx);
    expect(Math.abs((box.top + box.bottom) / 2 - before.height / 2), 'floor centred vertically').toBeLessThanOrEqual(p.cellPx);
    expect(Math.max((box.right - box.left) / before.width, (box.bottom - box.top) / before.height), 'floor fills one axis').toBeGreaterThanOrEqual(0.95);
    // The left edge of the floor is on the canvas, not hundreds of pixels in.
    expect(box.left).toBeLessThanOrEqual(before.width / 2);

    const combo = page.getByRole('combobox', { name: 'Find attendee' });
    await combo.fill('doors#0007');
    await combo.press('Enter');
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');
    expect(await projection(page)).toEqual(p);
    expectSameFloor(await floorPixels(page), before, 'after Find attendee');

    // Following moves the camera; releasing it puts the whole floor back.
    await page.getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('application', { name: 'Game view' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => projection(page)).toEqual(p);
    expectSameFloor(await floorPixels(page), before, 'after releasing Follow');
  });

  test('6. blocked cells are listed as rectangles, one Remove each, one undo entry per removal', async ({ page }) => {
    await openFair(page);
    const list = page.getByRole('list', { name: 'Blocked cells' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('listitem').first()).toContainText('(16, 20) to (23, 23), 32 cells');
    await expect(list.getByRole('button', { name: /^Remove/ })).toHaveCount(1);

    await list.getByRole('button', { name: 'Remove (16, 20) to (23, 23)' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(0);
    expect(await readStatus(page)).toBe('Removed 32 blocked cells.');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('(16, 20) to (23, 23), 32 cells');
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true');

    // One cell is still removable from the floor plan: select it, press Space.
    await page.locator('rect.cell[data-cell="16,20"]').click();
    await page.getByRole('application', { name: 'Floor plan' }).focus();
    await page.keyboard.press('Space');
    await expect(list).not.toContainText('(16, 20), 1 cell');
    const total = await list.getByRole('listitem').allTextContents();
    expect(total.map((t) => Number(/, (\d+) cells?/.exec(t)![1])).reduce((a, b) => a + b, 0)).toBe(31);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
  });
});
