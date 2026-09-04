import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the multi-user browser tests.
 *
 * These tests drive two real Chromium contexts against a running stack. They do
 * not start the stack themselves — `webServer` is deliberately not configured,
 * because spinning up ten microservices from a test runner produces failures
 * that are impossible to attribute. Start the stack first (see
 * tests/e2e/playwright/README.md), then run the tests.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // Multi-user tests coordinate two browsers; running files in parallel makes
  // timing assertions meaningless on a laptop.
  fullyParallel: false,
  workers: 1,

  // A collaboration test that needs a retry to pass is telling you something
  // real. Retry once in CI to absorb genuine infrastructure flake, never locally.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],

  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  outputDir: 'test-results',
});
