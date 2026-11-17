import { expect, test } from '@playwright/test';
import { keyboardJourney } from './journey';

test('9.3 the journey with keyboard input only, a visible unobscured focus ring after every Tab', async ({ page }) => {
  await keyboardJourney(page);
});

test('9.1 names: the floor plan and game view wrappers and the Find attendee combobox', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('try-community-fair').click();
  await expect(page.getByRole('application', { name: 'Floor plan' })).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('application', { name: 'Game view' })).toHaveAttribute('tabindex', '0');
  const combobox = page.getByRole('combobox', { name: 'Find attendee' });
  for (const attribute of ['aria-expanded', 'aria-controls']) await expect(combobox).toHaveAttribute(attribute, /.*/);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button, input, select')].filter((el) => {
      const e = el as HTMLInputElement;
      return (e.getAttribute('aria-label') ?? e.labels?.[0]?.textContent ?? e.textContent ?? '').trim() === '' && e.type !== 'hidden';
    }).length,
  );
  expect(unnamed).toBe(0);
});

test.describe('9.8 viewports', () => {
  for (const [width, height] of [[1280, 720], [1024, 640]]) {
    test(`no horizontal page scroll at ${width} x ${height}`, async ({ page }) => {
      await page.setViewportSize({ width: width as number, height: height as number });
      await page.goto('/');
      await page.getByTestId('try-community-fair').click();
      await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }

  test('at 640 x 360 the panels stack and every control is reachable by vertical scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto('/');
    await page.getByTestId('try-community-fair').click();
    await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(640);
    await page.getByRole('button', { name: 'Simulate' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Simulate' })).toBeVisible();
  });
});
