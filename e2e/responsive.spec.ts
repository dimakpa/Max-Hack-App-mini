import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('new request screen is usable without overlap', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Какая техника нужна?' })).toBeVisible();
  await expect(page.getByTestId('describe-start')).toBeVisible();
  await expect(page.getByTestId('manual-start')).toBeVisible();
  mkdirSync('qa/screenshots', { recursive: true });
  await page.screenshot({ path: `qa/screenshots/${testInfo.project.name}-new-request.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('persisted dispatcher session opens the supplier order list', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('techzakaz-demo-role', 'dispatcher-a'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Заявки поставщика' })).toBeVisible();
});
