import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  driveSkippedState,
  driveWorkerlessState,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches, at desktop and phone width:
 * first paint with all nineteen rows queued and not one figure on screen; the
 * shared skip link focused; the last SLH-DSA `s` set measuring while the other
 * eighteen rows have settled; the whole matrix derived with four misquotes
 * contradicted by the page's own output; both disclosures opened through their
 * summaries; the claim checker contradicting a claim, refusing a malformed one,
 * and confirming one typed from a figure read off the page; a computed TLS
 * handshake and then one priced with a variable-length signature; a real
 * benchmark run including RSA-2048's deliberately unmeasured keygen cell; the
 * negative-claim fixture in its every-check-green-and-wrong state, twice; three
 * hover states; two focus rings; and a scroll region focused. Then, on their
 * own page loads: the three slow sets abandoned by the reader and the claim
 * checker refusing to answer from a published figure, and a browser with no Web
 * Worker where every row says why it has no number.
 *
 * See `gate.ts` for why nothing is injected into the page, why no panel is
 * revealed from script, why the shipped defaults are asserted rather than
 * assumed, why `violations` is not the whole oracle — and, particular to this
 * lab, why the derivation is held until the gate releases it, which is what
 * makes a streaming page's states reproducible instead of raced.
 */

for (const viewport of [null, NARROW] as const) {
  const label = viewport ? 'dark @380px' : 'dark';

  test(`no WCAG A/AA violations in ${label}`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    if (viewport) await page.setViewportSize(viewport);
    await boot(page, 'hold-derivation');
    await driveAllStates(page, label);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations with the slow sets skipped in ${label}`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    if (viewport) await page.setViewportSize(viewport);
    await boot(page, 'hold-derivation');
    await driveSkippedState(page, label);
    expect(errors, errors.join('\n')).toEqual([]);
    reportCollected();
  });

  test(`no WCAG A/AA violations without a Web Worker in ${label}`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    if (viewport) await page.setViewportSize(viewport);
    await boot(page, 'no-worker');
    await driveWorkerlessState(page, label);
    expect(errors, errors.join('\n')).toEqual([]);
    reportCollected();
  });
}
