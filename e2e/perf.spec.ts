import { expect, test } from '@playwright/test';

/**
 * Performance budgets, in the two units that matter to a visitor.
 *
 * TIME TO FIRST ACTIONABLE RESULT and TIME TO CORE-READY are budgeted
 * SEPARATELY from all-sets-complete, because they are separate claims and the
 * gap between them is the whole scheduling decision this page made. Measuring
 * only "everything is finished" would have reported the page as healthy
 * throughout the version where a visitor waited twenty-four seconds before the
 * first number appeared.
 *
 * The budgets are deliberately loose. They are not a target to optimise
 * against; they are a tripwire for the specific regression of deriving the
 * expensive sets eagerly again — which measured about 13 s here and 24 s in a
 * reviewer's browser, against a core pass of about 2 s. Anything between those
 * two numbers is the regression, and the budgets sit in that gap.
 *
 * This runs against the production build like every other suite, and it does
 * NOT hold the derivation: it measures the page a visitor actually gets.
 */

/** The chooser must be usable this fast, with no derived figures required. */
const FIRST_ACTIONABLE_MS = 5_000;
/** Sixteen sets derived and a shortlist on screen. */
const CORE_READY_MS = 20_000;

test('time to first actionable result, and to core-ready', async ({ page }) => {
  test.setTimeout(300_000);

  const started = Date.now();
  await page.goto('.');

  // First actionable: the role selector is on screen and can be pressed. It
  // needs nothing derived, which is the point -- a visitor can start choosing
  // before any cryptography has finished.
  await expect(page.locator('#role-kem')).toBeEnabled();
  await page.locator('#role-signature').click();
  await expect(page.locator('#role-signature')).toHaveAttribute('aria-selected', 'true');
  const firstActionable = Date.now() - started;

  // Core-ready: sixteen derived, three deferred, a shortlist rendered.
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(16, { timeout: CORE_READY_MS });
  await expect(page.locator('[data-shortlist-state="ready"]')).toBeVisible();
  const coreReady = Date.now() - started;

  console.log(`PERF first-actionable=${firstActionable}ms core-ready=${coreReady}ms`);

  expect(
    firstActionable,
    `the chooser must be usable before anything is derived (took ${firstActionable}ms)`
  ).toBeLessThan(FIRST_ACTIONABLE_MS);
  expect(
    coreReady,
    `the core comparison must be ready well inside the cost of deriving everything (took ${coreReady}ms)`
  ).toBeLessThan(CORE_READY_MS);

  // The budget above is only meaningful if core-ready is genuinely NOT
  // all-sets-complete. Asserted, so the two can never quietly become one
  // measurement again.
  await expect(page.locator('tr[data-code="DERIVE_DEFERRED"]')).toHaveCount(3);
  await expect(page.locator('#derivation-strip')).toContainText('measured only when you ask');
});

test('the shortlist does not wait for the expensive sets', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('.');
  // A candidate is on screen while three parameter sets are still unmeasured.
  // This is the scheduling decision, expressed as something that can fail.
  await expect(page.locator('.candidate').first()).toBeVisible({ timeout: CORE_READY_MS });
  await expect(page.locator('tr[data-code="DERIVE_DEFERRED"]')).toHaveCount(3);
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(16);
});
