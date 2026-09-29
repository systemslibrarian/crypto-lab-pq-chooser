import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships. Two suites:
 *   - a11y.spec.ts    — the axe WCAG gate.
 *   - claims.spec.ts  — the page tells the truth, including its negative claim.
 *
 * Port 4693 is unique to this lab across the fleet (never the Vite default
 * 4173): with 200+ labs side by side, a shared port means `reuseExistingServer`
 * silently scans a DIFFERENT lab's preview, which has really happened here.
 *
 * 4646 was the first choice and was taken between picking it and using it --
 * `crypto-lab-glass-box` claimed it in a parallel session, in its working tree
 * only, which is exactly why the rule is that a port must be unique in
 * COMMITTED state. Re-checked against every sibling's working tree AND HEAD,
 * and against what was actually listening, before settling here.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // The drive waits on a nineteen-set derivation whose slowest member signs in
  // seconds, and runs a real benchmark. That is the lab, not a slow test.
  timeout: 600_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4693/crypto-lab-pq-chooser/',
  },
  projects: [
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      // Dark is the only theme, so the scan runs in the one the page ships.
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'claims',
      testMatch: /claims\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
  ],
  webServer: {
    // Build before serving: `vite preview` only serves whatever is already in
    // dist/, so without this a failing build leaves the previous good bundle in
    // place and the suite passes green against code that no longer compiles.
    command: 'npm run build && npm run preview -- --port 4693 --strictPort',
    url: 'http://localhost:4693/crypto-lab-pq-chooser/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
