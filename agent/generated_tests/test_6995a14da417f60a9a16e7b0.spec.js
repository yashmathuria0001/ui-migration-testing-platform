import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('AI Generated Test', async ({ page }) => {
  await test.step('1. Open page', async () => {
    await page.goto(process.env.BASE_URL + '/oldsite.com');
    await page.waitForLoadState('networkidle');
    const dir = path.join('screenshots', process.env.RUN_LABEL || 'run', process.env.TEST_RUN_ID || 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'step_1.png'), fullPage: true });
  });
  await expect(page).toHaveURL(/.*/);
});