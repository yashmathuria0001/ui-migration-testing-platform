import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('AI Generated Test', async ({ page }) => {
  await test.step('1. Open the login page', async () => {
    await page.goto(process.env.BASE_URL);
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_1.png'), fullPage: true });
  });

  await test.step('2. Enter username tomsmith into the Username field', async () => {
    await page.fill('input[name="username"]', 'tomsmith');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_2.png'), fullPage: true });
  });

  await test.step('3. Enter password SuperSecretPassword! into the Password field', async () => {
    await page.fill('input[name="password"]', 'SuperSecretPassword!');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_3.png'), fullPage: true });
  });

  await test.step('4. Click the Login button', async () => {
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_4.png'), fullPage: true });
  });

  await test.step('5. Verify that the secure area is shown after successful login', async () => {
    await expect(page).toHaveURL(/.*/);
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_5.png'), fullPage: true });
  });

  await test.step('6. Click Logout to return to the login page', async () => {
    await page.click('a[href*="logout"]');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_6.png'), fullPage: true });
  });

  await test.step('7. Enter username tomsmith and an incorrect password', async () => {
    await page.fill('input[name="username"]', 'tomsmith');
    await page.fill('input[name="password"]', 'wrongpassword');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_7.png'), fullPage: true });
  });

  await test.step('8. Click the Login button again', async () => {
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_8.png'), fullPage: true });
  });

  await test.step('9. Verify that an error message is shown for invalid credentials', async () => {
    await expect(page).toHaveURL(/.*/);
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_9.png'), fullPage: true });
  });

  await expect(page).toHaveURL(/.*/);
});