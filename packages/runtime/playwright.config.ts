// packages/runtime/playwright.config.ts (owner: Dev B)
// Local Playwright config for the runtime smoke test, so it does not touch the e2e/ tree
// owned by Dev C/D. Run: npx playwright test --config packages/runtime/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: /\.pw\.ts$/,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
