import { expect, test, type Page } from '@playwright/test';
import { openFair, readStatus, simulate } from './helpers';

const cellOf = async (page: Page, id: string): Promise<[string, string]> => [
  await page.getByLabel(`cell_x of ${id}`).inputValue(),
  await page.getByLabel(`cell_y of ${id}`).inputValue(),
];
const floorPlan = (page: Page) => page.getByRole('application', { name: 'Floor plan' });

async function dragPacksTo(page: Page, x: number, y: number): Promise<void> {
  const from = (await page.locator('[data-station="packs"]').boundingBox())!;
  const to = (await page.locator(`rect[data-cell="${x},${y}"]`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

test.describe('3.2 to 3.4 moving a station (matrix row 15)', () => {
  test('dragging packs to (12,7) updates the inputs and announces it', async ({ page }) => {
    await openFair(page);
    await dragPacksTo(page, 12, 7);
    expect(await cellOf(page, 'packs')).toEqual(['12', '7']);
    expect(await readStatus(page)).toBe('Welcome packs moved to (12, 7).');
  });

  test('typing (12,7) moves the marker', async ({ page }) => {
    await openFair(page);
    await page.getByLabel('cell_x of packs').fill('12');
    await page.getByLabel('cell_y of packs').fill('7');
    await page.getByLabel('cell_y of packs').press('Enter');
    await expect(page.locator('[data-station="packs"]')).toHaveAttribute('data-cell', '12,7');
  });

  test('ArrowUp moves the selected station exactly one cell', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Inspect packs' }).click();
    await floorPlan(page).focus();
    await page.keyboard.press('ArrowUp');
    expect(await cellOf(page, 'packs')).toEqual(['34', '11']);
    await page.keyboard.press('ArrowUp');
    expect(await cellOf(page, 'packs')).toEqual(['34', '10']);
  });
});

test.describe('3.5 refusals', () => {
  for (const [x, y, text] of [
    ['16', '21', 'Cell (16, 21) is blocked.'],
    ['45', '12', 'Cell (45, 12) is outside the 40 × 24 grid.'],
    ['0', '12', 'Cell (0, 12) is the entrance.'],
    ['0', '4', 'Cell (0, 4) is the exit.'],
    ['10', '12', 'Cell (10, 12) is used by Check-in desk.'],
  ]) {
    test(`typing (${x}, ${y}) shows "${text}" and keeps the typed values`, async ({ page }) => {
      await openFair(page);
      await page.getByLabel('cell_x of packs').fill(x as string);
      await page.getByLabel('cell_y of packs').fill(y as string);
      await page.getByLabel('cell_y of packs').press('Enter');
      await expect(page.getByText(text).first()).toBeVisible();
      expect(await readStatus(page)).toBe(text);
      expect(await cellOf(page, 'packs')).toEqual([x, y]);
      await expect(page.locator('[data-station="packs"]')).toHaveAttribute('data-cell', '34,12');
    });
  }
});

test.describe('3.6 delete guard (matrix row 15)', () => {
  test('deleting a routed station is refused with the exact text and nothing changes', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Delete checkin' }).click();
    const text = 'Check-in desk (checkin) is on the route of cohort "doors". Remove it from the route before deleting the station.';
    await expect(page.getByText(text).first()).toBeVisible();
    expect(await readStatus(page)).toBe(text);
    await expect(page.getByLabel('cell_x of checkin')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete checkin' })).toBeFocused();
  });
});

test.describe('3.7 Escape', () => {
  test('clears a station selection to the cell cursor so the arrows move the cursor', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Inspect packs' }).click();
    await floorPlan(page).focus();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowLeft');
    expect(await cellOf(page, 'packs')).toEqual(['34', '12']);
    await expect(page.locator('rect.cursor')).toHaveAttribute('data-cell', '33,12');
  });
});

test.describe('4.1 undo and redo', () => {
  test('three moves, three undos, three redos', async ({ page }) => {
    await openFair(page);
    await page.getByRole('button', { name: 'Inspect packs' }).click();
    await floorPlan(page).focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    expect(await cellOf(page, 'packs')).toEqual(['34', '9']);
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Undo' }).click();
    expect(await cellOf(page, 'packs')).toEqual(['34', '12']);
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Redo' }).click();
    expect(await cellOf(page, 'packs')).toEqual(['34', '9']);
  });
});

test.describe('4.3 stale label (matrix row 17, stale portion; task 9)', () => {
  test('Stale — rerun appears after an edit and goes after undo', async ({ page }) => {
    await openFair(page);
    await simulate(page);
    await expect(page.getByText('Stale — rerun')).toHaveCount(0);
    await page.getByLabel('servers of checkin').fill('2');
    await page.getByLabel('servers of checkin').press('Enter');
    await expect(page.getByText('Stale — rerun').first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('Stale — rerun')).toHaveCount(0);
  });
});
