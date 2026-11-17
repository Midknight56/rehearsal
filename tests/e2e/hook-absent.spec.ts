import { expect, test } from '@playwright/test';
// 10.8: the plain production build, served by the second webServer, has no test hook.
test.use({ baseURL: 'http://localhost:4274' });

test('window.__rehearsal is undefined in the production build, on the landing screen and on the Plan screen', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { __rehearsal?: unknown }).__rehearsal)).toBeUndefined();
  await page.getByTestId('try-community-fair').click();
  await expect(page.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeVisible();
  expect(await page.evaluate(() => 'undefined' === typeof (window as unknown as { __rehearsal?: unknown }).__rehearsal)).toBe(true);
});
