import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships. Four suites:
 *   - a11y.spec.ts    — the axe WCAG gate.
 *   - claims.spec.ts  — the page tells the truth, including its negative claim.
 *   - layout.spec.ts  — composition: what is above the fold, what a phone can
 *                       read, where a fragment link lands. Measured as numbers
 *                       rather than compared as pixels; see the file for why.
 *   - smoke.spec.ts   — the small cross-engine and post-deploy check. Set
 *                       PQ_CHOOSER_BASE_URL to point it at the live site.
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
    {
      name: 'layout',
      testMatch: /layout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'smoke-chromium',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      // Firefox, because a module worker and WebCrypto are the two things most
      // likely to differ between engines, and both are load-bearing here.
      name: 'smoke-firefox',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], colorScheme: 'dark' },
    },
    {
      // WebKit is NOT in the CI job: it needs system libraries that only
      // `playwright install --with-deps` provides on the GitHub runner image,
      // and that apt step is banned in this fleet -- it wedged 547 runs. Run it
      // locally with `npm run test:smoke:webkit`, where the browser is present.
      name: 'smoke-webkit',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Safari'], colorScheme: 'dark' },
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
