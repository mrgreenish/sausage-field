import { expect, test } from '@playwright/test';

test('loads the low-tier field without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?quality=low&seed=1234&debug=1');
  await expect(page.getByRole('heading', { name: /sausage field/i })).toBeVisible();
  const enter = page.getByRole('button', { name: /enter the field/i });
  await expect(enter).toBeEnabled({ timeout: 20_000 });
  await expect(page.locator('#loading-value')).toHaveText('100%');
  await expect(page.locator('#stats')).toContainText('visible', { timeout: 10_000 });
  await enter.click();
  await expect(page.locator('#reticle')).toHaveClass(/is-visible/, { timeout: 5_000 });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: 'test-results/field-live.png', fullPage: true });
  expect(errors).toEqual([]);
});
