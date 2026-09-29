import { expect, test } from '@playwright/test';

/**
 * Cross-browser and production smoke.
 *
 * The a11y and claims gates run in one Chromium against a local preview, which
 * leaves two things unexercised: engines that are not Chromium, and the
 * deployed artefact — where the project base path and the module worker are
 * served by GitHub Pages rather than by `vite preview`, and where a wrong
 * `base` or a worker chunk that 404s would be invisible until a visitor
 * arrived.
 *
 * `PQ_CHOOSER_BASE_URL` points this at the live site; without it, it runs
 * against the same preview as everything else.
 *
 * It is deliberately small. A smoke test that duplicates the claims suite in
 * three engines takes three times as long to tell you the same thing; what is
 * checked here is what differs BETWEEN environments — module workers, WebCrypto
 * availability, asset paths, and whether real cryptography ran at all.
 */

const LIVE = process.env.PQ_CHOOSER_BASE_URL;

test('real derivation, in this engine, against this deployment', async ({ page }) => {
  test.setTimeout(300_000);

  const failedRequests: string[] = [];
  const errors: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(LIVE ?? '.');

  // The page rendered, and the chooser is the thing that rendered first.
  await expect(page.locator('#chooser')).toBeVisible();
  await expect(page.locator('tr[data-row]')).toHaveCount(19);

  // The module worker started and real cryptography ran. This is the assertion
  // that catches a wrong `base` or a missing worker chunk on a deployment:
  // nothing else on the page can reach a derived state without it.
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(16, { timeout: 180_000 });
  await expect(page.locator('[data-shortlist-state="ready"]')).toBeVisible();
  await expect(page.locator('.candidate')).not.toHaveCount(0);

  // Two derived figures cross-checked against each other, so a green run here
  // means arithmetic happened rather than that a skeleton painted.
  const pk = await page.locator('tr[data-row="ml_kem768"] td[data-cell="public-key"]').innerText();
  const hybridPk = await page
    .locator('tr[data-row="ml_kem768_x25519"] td[data-cell="public-key"]')
    .innerText();
  const num = (t: string): number => Number(t.replace(/,/g, '').match(/\d+/)![0]);
  expect(num(hybridPk) - num(pk), 'the hybrid carries a classical share').toBeGreaterThan(0);

  // WebCrypto is reachable in this engine, which the benchmark depends on.
  expect(await page.evaluate(() => typeof crypto.subtle?.generateKey === 'function')).toBe(true);

  // The negative-claim fixture, because it is the one exhibit whose failure
  // would be a cryptographic surprise rather than a layout one.
  await page.locator('#fixture-run').click();
  await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();

  expect(failedRequests, failedRequests.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});
