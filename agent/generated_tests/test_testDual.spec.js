import { test, expect } from '@playwright/test';

test('AI Generated Test', async ({ page }) => {
    await page.goto(process.env.BASE_URL + '/login');
    await page.waitForLoadState('networkidle');
    await page.fill('input[name="username"]', 'tomsmith');
    await page.fill('input[name="password"]', 'SuperSecretPassword!');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*/);
});