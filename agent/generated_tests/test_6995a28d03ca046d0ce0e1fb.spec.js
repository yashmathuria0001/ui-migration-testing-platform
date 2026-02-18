import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('AI Generated Test', async ({ page }) => {
  await test.step('1. Open the home page', async () => {
    await page.goto(process.env.BASE_URL);
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_1.png'), fullPage: true });
  });

  await test.step('2. Click on the Login button in the header', async () => {
    await page.click('text="Login"');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_2.png'), fullPage: true });
  });

  await test.step('3. Enter valid username and password and submit', async () => {
    await page.fill('input[name="username"]', 'valid_username');
    await page.fill('input[name="password"]', 'valid_password');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_3.png'), fullPage: true });
  });

  await test.step('4. Verify that the dashboard page is visible', async () => {
    await expect(page).toHaveURL(/\/dashboard/);
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_4.png'), fullPage: true });
  });

  await test.step('5. Open the user profile menu and check that the user name is correct', async () => {
    await page.click('text="Profile"');
    await expect(page).toContainText('valid_username');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_5.png'), fullPage: true });
  });

  await expect(page).toHaveURL(/.*/);
});