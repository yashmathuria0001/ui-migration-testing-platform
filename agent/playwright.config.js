// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './generated_tests',
  timeout: 50000,
  use: {
    headless: true,
  },
});
