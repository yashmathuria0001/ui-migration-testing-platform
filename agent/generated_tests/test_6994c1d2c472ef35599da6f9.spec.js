import { test, expect } from '@playwright/test';

test('AI Generated Test', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"]', 'username');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*/);
});