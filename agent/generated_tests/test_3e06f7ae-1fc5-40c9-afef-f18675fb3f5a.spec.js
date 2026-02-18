import { test, expect } from '@playwright/test';

test('AI Generated Test', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="password"]', 'test123');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*/);
};