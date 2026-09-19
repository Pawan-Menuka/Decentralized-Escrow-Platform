import { expect, test } from '@playwright/test';

test('fails closed when public deployment configuration is absent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(/configuration required/i);
});
