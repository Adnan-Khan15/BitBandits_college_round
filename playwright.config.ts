import { defineConfig, devices } from '@playwright/test'

// OWNER: Dev C - extend this stub (docs/PLAN.md section 13.5).
// Chromium only for the MVP (docs/PLAN.md section 8).
export default defineConfig({
  testDir: 'e2e',
  retries: 1,
  fullyParallel: false,
  use: {
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
