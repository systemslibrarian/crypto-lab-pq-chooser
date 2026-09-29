import { expect, test, type Page } from '@playwright/test';
import { boot, startDerivation, waitForMatrixSettled, waitForRowState } from './gate';

/**
 * The claims suite: the page tells the truth.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING: compare two values the page itself
 * printed, rather than asserting against a hardcoded string. A test that
 * re-derives the same expression the source uses will happily agree with a bug.
 *
 * BUT INTERNAL CONSISTENCY IS NOT ENOUGH — a page can be consistently wrong. A
 * test that only checks the page agrees with itself survives a mutation that
 * corrupts the underlying maths, because the corrupted value is reported
 * consistently everywhere. So this file mixes three kinds:
 *
 *   CROSS-CHECKS            two surfaces that must agree — the status line's
 *                           counter against the rows it counts; the misquote
 *                           panel's verdict against the matrix cell that
 *                           settles it; the handshake parts against the matrix
 *                           rows for the same schemes.
 *   INDEPENDENT RE-DERIVATIONS  recompute a claim from the page's own raw
 *                           output by a different route than the source takes
 *                           — the hybrid overhead percentage from two printed
 *                           byte counts, the Falcon range against the padded
 *                           row, the category column's unalignment from the
 *                           rendered categories.
 *   PARTS-SUM-TO-WHOLE      the four handshake components against the total.
 *
 * Every figure below is read OFF THE PAGE. There is not one expected byte count
 * written into this file, which is the same rule the page itself is built on.
 */

/** Digits out of a rendered cell: "1,184 B" -> 1184. */
function digits(text: string): number {
  const match = text.replace(/,/g, '').match(/\d+/);
  if (!match) throw new Error(`no number in ${JSON.stringify(text)}`);
  return Number(match[0]);
}

/** Every number in a rendered cell, in order. */
function allDigits(text: string): number[] {
  return [...text.replace(/,/g, '').matchAll(/\d+/g)].map((m) => Number(m[0]));
}

async function cell(page: Page, schemeId: string, which: string): Promise<string> {
  return page.locator(`tr[data-row="${schemeId}"] td[data-cell="${which}"]`).innerText();
}

/**
 * Load the page and let it derive.
 *
 * `slow: false` (the default) presses Skip slow sets first, which takes the
 * derivation from about nine seconds to under two. It is not a shortcut around
 * anything: the three SLH-DSA `s` rows are irrelevant to a test about the
 * handshake total or the retirement notice, and a suite that spends four
 * minutes re-signing with SLH-DSA-256s twenty times over is a suite that gets
 * skipped. The tests that are actually ABOUT those rows pass `slow: true`.
 */
async function derivedPage(page: Page, { slow = false } = {}): Promise<void> {
  await boot(page, 'hold-derivation');
  if (!slow) await page.locator('#skip-slow').click();
  await startDerivation(page);
  await waitForMatrixSettled(page);
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(slow ? 19 : 16);
}

test.describe('the matrix reports what it derived', () => {
  test('the status counter matches the rows it counts', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page, { slow: true });
    const status = await page.locator('#matrix-status').innerText();
    const [derived, total] = allDigits(status);
    expect(derived).toBe(await page.locator('tr[data-state="derived"]').count());
    expect(total).toBe(await page.locator('tr[data-row]').count());
  });

  test('Falcon renders a range, and its padded twin renders a point', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);

    // Independent re-derivation of the panel's whole argument, from two cells.
    const raw = await cell(page, 'falcon512', 'payload');
    const padded = await cell(page, 'falcon512padded', 'payload');
    expect(await page.locator('tr[data-row="falcon512"] td[data-cell="payload"]').getAttribute('data-payload-kind')).toBe('range');
    expect(await page.locator('tr[data-row="falcon512padded"] td[data-cell="payload"]').getAttribute('data-payload-kind')).toBe('fixed');

    const [min, max, distinct, samples] = allDigits(raw);
    const paddedBytes = digits(padded);
    expect(max, 'a raw compressed signature must be shorter than the padded encoding').toBeLessThan(paddedBytes);
    expect(min).toBeLessThanOrEqual(max);
    expect(distinct, 'a range that took one length is not a range').toBeGreaterThan(1);
    expect(distinct).toBeLessThanOrEqual(samples);
  });

  test('the NIST category column really is unaligned, as its caption says', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    const caption = await page.locator('#matrix-caption').innerText();
    expect(caption).toMatch(/do not line up/);

    // Re-derived from the rendered cells rather than from the caption's prose:
    // the caption's example must be true of what is on screen.
    const category = async (id: string): Promise<string> =>
      (await page.locator(`tr[data-row="${id}"] td.numeric`).first().innerText()).trim();
    const mlDsa = await category('ml_dsa44');
    const falcon = await category('falcon512');
    const slh = await category('slh_dsa_sha2_128s');
    expect(falcon, 'Falcon-512 is category 1').toBe(slh);
    expect(mlDsa, 'the smallest ML-DSA set is NOT the same category').not.toBe(falcon);
    expect(caption).toContain(`category ${mlDsa}`);
  });

  test('every hybrid row carries its post-quantum component plus a classical share', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    // Cross-check between two rows of the same table, by a route the source
    // does not take: the source derives each row independently and never
    // subtracts one from another.
    const hybridPk = digits(await cell(page, 'ml_kem768_x25519', 'public-key'));
    const hybridCt = digits(await cell(page, 'ml_kem768_x25519', 'payload'));
    const basePk = digits(await cell(page, 'ml_kem768', 'public-key'));
    const baseCt = digits(await cell(page, 'ml_kem768', 'payload'));
    expect(hybridPk - basePk, 'the classical share rides in both directions').toBe(hybridCt - baseCt);
    expect(hybridPk - basePk).toBeGreaterThan(0);
  });
});

test.describe('the misquote panel is settled by the page’s own output', () => {
  test('rows 1 and 2 quote what the matrix shows, and contradict the stale figure', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    for (const [row, schemeId] of [
      ['1', 'ml_dsa65'],
      ['2', 'ml_dsa87'],
    ] as const) {
      const verdict = await page.locator(`[data-misquote="${row}"] .observed`).innerText();
      expect(await page.locator(`[data-misquote="${row}"] .observed`).getAttribute('data-verdict')).toBe('contradicted');
      const derived = digits(await cell(page, schemeId, 'payload'));
      // Past the row number in `.misquote-n` and past the scheme's own digits
      // ("ML-DSA-65"): a byte count in these claims is three digits or more.
      const claimed = await page
        .locator(`[data-misquote="${row}"] .misquote-claim`)
        .evaluate((el) => {
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelector('.misquote-n')?.remove();
          const match = (clone.textContent ?? '').replace(/,/g, '').match(/\d{3,}/);
          if (!match) throw new Error(`no claimed byte count in ${clone.textContent}`);
          return Number(match[0]);
        });
      // The verdict names BOTH numbers, and they are the two the page holds.
      expect(verdict).toContain(String(derived));
      expect(verdict).toContain(String(claimed));
      expect(derived, 'a "misquote" the library agrees with is not a misquote').not.toBe(claimed);
    }
  });

  test('row 3 reports the same Falcon range the matrix measured', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    const verdict = await page.locator('[data-misquote="3"] .observed').innerText();
    const [min, max] = allDigits(await cell(page, 'falcon512', 'payload'));
    expect(verdict).toContain(String(min));
    expect(verdict).toContain(String(max));
    expect(verdict).toContain(String(digits(await cell(page, 'falcon512padded', 'payload'))));
  });

  test('row 4 reports the same two figures the ML-KEM-1024 row shows', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    const pk = digits(await cell(page, 'ml_kem1024', 'public-key'));
    const ct = digits(await cell(page, 'ml_kem1024', 'payload'));
    const verdict = await page.locator('[data-misquote="4"] .observed').innerText();
    expect(verdict).toContain(String(pk));
    expect(verdict).toContain(String(ct));
    // The trap, re-derived: the pattern holds at the smaller sets and breaks here.
    expect(digits(await cell(page, 'ml_kem512', 'payload'))).toBeLessThan(
      digits(await cell(page, 'ml_kem512', 'public-key'))
    );
    expect(ct).toBe(pk);
  });

  test('row 5 says it was cited rather than measured', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    const observed = page.locator('[data-misquote="5"] .observed');
    expect(await observed.getAttribute('data-verdict')).toBe('not-derivable');
    // The row says it was not derived, and names where it came from instead.
    await expect(observed).toContainText('Not derived here');
    await expect(observed).toContainText('cited from crypto-lab-multivariate');
  });

  test('no verdict is left pending once the evidence exists', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await expect(page.locator('[data-verdict="pending"]')).toHaveCount(0);
    await expect(page.locator('[data-verdict="confirms-misquote"]')).toHaveCount(0);
  });
});

test.describe('the handshake total is a measurement, not a sum of constants', () => {
  test('the parts sum to the printed total, and match the matrix rows', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#wire-run').click();
    await expect(page.locator('[data-wire-total]')).toBeVisible();

    // Parts-sum-to-whole, both read off the page.
    const parts = await page.locator('[data-part-bytes]').allInnerTexts();
    const sum = parts.map(digits).reduce((a, b) => a + b, 0);
    expect(digits(await page.locator('[data-wire-total]').innerText())).toBe(sum);

    // Cross-surface: the four components are the four figures the matrix
    // derived for the same two schemes, arrived at by a separate worker call.
    const kemPk = digits(await cell(page, 'ml_kem768', 'public-key'));
    const kemCt = digits(await cell(page, 'ml_kem768', 'payload'));
    const sigPk = digits(await cell(page, 'ml_dsa65', 'public-key'));
    const sigBytes = digits(await cell(page, 'ml_dsa65', 'payload'));
    expect(parts.map(digits)).toEqual([kemPk, kemCt, sigPk, sigBytes]);
  });

  test('the hybrid overhead percentage is what its own two byte counts imply', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await expect(page.locator('[data-hybrid-overhead]')).toBeVisible();
    const hybrid = digits(await page.locator('[data-hybrid-bytes]').innerText());
    const base = digits(await page.locator('[data-base-bytes]').innerText());
    const overhead = digits(await page.locator('[data-overhead-bytes]').innerText());
    const printed = Number(await page.locator('[data-overhead-percent]').getAttribute('data-overhead-percent'));

    expect(overhead).toBe(hybrid - base);
    // Recomputed here from the two printed byte counts, which is a different
    // route than the source takes (it divides its own two measurements).
    expect(printed).toBeCloseTo(((hybrid - base) / base) * 100, 2);

    // And the hybrid figure agrees with the matrix, which derived it separately.
    const matrixHybrid =
      digits(await cell(page, 'ml_kem768_x25519', 'public-key')) +
      digits(await cell(page, 'ml_kem768_x25519', 'payload'));
    expect(hybrid).toBe(matrixHybrid);
  });

  test('a variable-length signature is flagged, and the total moves between runs', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.selectOption('#wire-sig', 'falcon512');
    const totals = new Set<number>();
    for (let i = 0; i < 10; i++) {
      await page.locator('#wire-run').click();
      await expect(page.locator('[data-wire-total]')).toBeVisible();
      totals.add(digits(await page.locator('[data-wire-total]').innerText()));
    }
    await expect(page.locator('#wire-output')).toContainText('variable-length');
    expect(totals.size, 'a handshake priced with a variable-length signature should move').toBeGreaterThan(1);
  });
});

test.describe('every failure path is reachable and names its actual cause', () => {
  test('CLAIM_CONTRADICTED names what the library produced instead', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#claim-run').click();
    const verdict = page.locator('[data-claim-code="CLAIM_CONTRADICTED"]');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText(String(digits(await cell(page, 'ml_dsa65', 'payload'))));
    await expect(verdict).toContainText('3293');
  });

  test('CLAIM_MALFORMED says what was wrong with the input', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.fill('#claim-bytes', '1e3');
    await page.locator('#claim-run').click();
    const verdict = page.locator('[data-claim-code="CLAIM_MALFORMED"]');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('not a whole number of bytes');
  });

  test('CLAIM_NOT_DERIVED refuses to answer from the published figure', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, 'hold-derivation');
    await page.locator('#skip-slow').click();
    await startDerivation(page);
    await waitForMatrixSettled(page);
    await page.selectOption('#claim-scheme', 'slh_dsa_sha2_192s');
    await page.locator('#claim-run').click();
    const verdict = page.locator('[data-claim-code="CLAIM_NOT_DERIVED"]');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('skipped by you');
    await expect(verdict).toContainText('published figure would answer this instantly');
  });

  test('DERIVE_SKIPPED marks the skipped rows, with no number and no blank', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, 'hold-derivation');
    await page.locator('#skip-slow').click();
    await startDerivation(page);
    await waitForMatrixSettled(page);
    await expect(page.locator('tr[data-code="DERIVE_SKIPPED"]')).toHaveCount(3);
    for (const id of ['slh_dsa_sha2_128s', 'slh_dsa_sha2_192s', 'slh_dsa_sha2_256s']) {
      const row = page.locator(`tr[data-row="${id}"]`);
      await expect(row).toContainText('skipped by you');
      // No figure, and not a blank either: the reason is the cell's content.
      for (const which of ['public-key', 'payload', 'secret-key']) {
        const text = await row.locator(`td[data-cell="${which}"]`).innerText();
        expect(text.replace(/[^\d]/g, ''), `${id} ${which} must hold no number`).toBe('');
      }
      await expect(row.locator('td[data-cell="payload"] .sr-only')).toHaveCount(1);
    }
  });

  test('WORKER_UNAVAILABLE explains itself on every row and in the status line', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, 'no-worker');
    await expect(page.locator('tr[data-code="WORKER_UNAVAILABLE"]')).toHaveCount(19);
    await expect(page.locator('#matrix-status')).toContainText('no Web Worker');
    await expect(page.locator('#matrix-body')).toContainText('freeze the page');
  });

  test('BENCH_NOT_MEASURED states the reason RSA keygen is not timed', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#bench-run').click();
    await expect(page.locator('#bench-table')).toBeVisible({ timeout: 300_000 });
    const cellText = await page.locator('[data-bench-code="BENCH_NOT_MEASURED"]').innerText();
    expect(cellText).toContain('not measured');
    expect(cellText).toContain('randomised prime search');
    // ...and the cell holds no timing, which is the point of stating it.
    expect(cellText).not.toMatch(/\bms\b/);
  });

  test('the benchmark prints the sample count and the clock it ran against', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#bench-run').click();
    await expect(page.locator('#bench-table')).toBeVisible({ timeout: 300_000 });
    // A timing without these is a number, not a measurement.
    await expect(page.locator('#bench-table')).toContainText('n=');
    await expect(page.locator('#bench-environment')).toContainText('Timer resolution');
    await expect(page.locator('#bench-environment')).toContainText('Run took');
    await expect(page.locator('#bench-environment')).toContainText('Library');
  });
});

test.describe('a verdict is retired when its inputs change, and not otherwise', () => {
  test('changing the parameter set retires the claim verdict, and says so', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#claim-run').click();
    await expect(page.locator('[data-claim-code="CLAIM_CONTRADICTED"]')).toBeVisible();

    await page.selectOption('#claim-scheme', 'ml_dsa87');
    // The stale verdict is GONE...
    await expect(page.locator('[data-claim-code="CLAIM_CONTRADICTED"]')).toHaveCount(0);
    // ...and the page says it was retired rather than leaving a blank.
    await expect(page.locator('[data-retired="true"]')).toBeVisible();
    await expect(page.locator('[data-retired="true"]')).toContainText('no longer describes');
  });

  test('re-selecting the same value does NOT retire a fresh verdict', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#claim-run').click();
    await expect(page.locator('[data-claim-code="CLAIM_CONTRADICTED"]')).toBeVisible();
    await page.selectOption('#claim-scheme', 'ml_dsa65');
    await page.selectOption('#claim-field', 'payload');
    await expect(page.locator('[data-retired="true"]')).toHaveCount(0);
    await expect(page.locator('[data-claim-code="CLAIM_CONTRADICTED"]')).toBeVisible();
  });

  test('changing the priced schemes retires the handshake', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#wire-run').click();
    await expect(page.locator('[data-wire-total]')).toBeVisible();
    await page.selectOption('#wire-sig', 'falcon1024');
    await expect(page.locator('[data-wire-total]')).toHaveCount(0);
    await expect(page.locator('#wire-output [data-retired="true"]')).toBeVisible();
  });
});

test.describe('what the page shows before it has derived anything', () => {
  test('no published figure appears anywhere while the matrix is queued', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, 'hold-derivation');
    await expect(page.locator('tr[data-state="pending"]')).toHaveCount(19);

    // Every figure cell holds a reason and no digits. Checked in the browser,
    // where a renderer that reached for a constant would actually show one.
    const cells = page.locator('td[data-cell]');
    const count = await cells.count();
    expect(count).toBe(19 * 3);
    for (let i = 0; i < count; i++) {
      const text = await cells.nth(i).innerText();
      expect(text.replace(/[^\d]/g, ''), 'a queued row must hold no number').toBe('');
    }
  });

  test('the [hidden] attribute is never outranked by a class rule', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    // The cascade trap: a class rule setting `display` outranks the UA's
    // `[hidden]` rule, so the element paints while the code believes it is
    // hidden. This page uses no `[hidden]` today; the probe is what makes that
    // a measurement, and what catches the day one is added with a class on it.
    const painted = await page.$$eval('[hidden]', (els) =>
      els
        .filter((el) => (el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }))
        .map((el) => `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`)
    );
    expect(painted, 'an element with [hidden] that still paints').toEqual([]);
  });
});

/**
 * §4.1d — the negative claim.
 *
 * THE CLAIM: a derivation that succeeds says nothing about whether the scheme
 * is safe to use. Nothing this page measures — not a size, not a timing, not a
 * completed round trip — can tell a rejected ML-KEM ciphertext from an accepted
 * one, because ML-KEM decapsulation reports no failure at all.
 *
 * THE FIXTURE: corrupt one bit of one ciphertext byte and decapsulate it. Every
 * check the page performs reports success and the shared secret is wrong.
 *
 * The three assertions §4.1d requires are below. Per §4.1c they have to bite:
 * delete the negative-claim text and the third fails; break any check inside
 * the fixture and the second fails.
 */
test.describe('negative claim: what a page made of measurements cannot see', () => {
  test('the fixture is reachable, everything is green, and the limit is on screen', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);

    // 1. REACH THE FIXTURE, through the UI.
    await page.locator('#fixture-run').click();
    await expect(page.locator('[data-fixture-checks]')).toBeVisible();

    // 2. EVERYTHING IS GREEN — asserted against the rendered checks, not a flag
    //    this test sets. If any check fails, the fixture is demonstrating the
    //    mechanism working rather than its limit.
    await expect(page.locator('[data-check="pass"]')).toHaveCount(4);
    await expect(page.locator('[data-check="fail"]')).toHaveCount(0);
    await expect(page.locator('[data-error-code="KEM_NO_FAILURE_CODE"]')).toContainText('none');

    // ...and the answer is wrong anyway, which is what makes it a limit.
    await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();
    const honest = await page.locator('[data-honest-secret]').innerText();
    const recovered = await page.locator('[data-recovered-secret]').innerText();
    expect(recovered, 'the recovered secret must not be the sender’s').not.toBe(honest);
    await expect(page.locator('[data-fixture-verdict="mismatch"]')).toContainText('AND WRONG');

    // 3. THE LIMITATION IS ON SCREEN IN THAT STATE — visible, not in the README
    //    and not behind a disclosure the reader has to open.
    const claim = page.locator('[data-negative-claim]');
    await expect(claim).toBeVisible();
    await expect(claim).toContainText('ML-KEM decapsulation reports no error');
    await expect(claim).toContainText('not a size, not a timing, not a completed round trip');
    expect(
      await claim.evaluate((el) => el.closest('details') === null),
      'the negative claim must not be behind a disclosure'
    ).toBe(true);
  });

  test('it is the mechanism, not the byte: a different byte gives the same answer', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    await page.locator('#fixture-run').click();
    await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();
    const first = await page.locator('[data-fixture-verdict]').innerText();

    for (let i = 0; i < 3; i++) {
      await page.locator('#fixture-again').click();
      await expect(page.locator('[data-check="pass"]')).toHaveCount(4);
      await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();
    }
    const later = await page.locator('[data-fixture-verdict]').innerText();
    // The verdict is the same and the byte is not, which is the difference
    // between a mechanism and a coincidence.
    expect(later.split('\n')[0]).toBe(first.split('\n')[0]);
    expect(later).not.toBe(first);
  });

  test('the implementation-risk column says what the sizes cannot', async ({ page }) => {
    test.setTimeout(600_000);
    // This one needs the slow rows: the claim it checks is that the `s` variant
    // in the derivation log cost more than the `f` variant beside it.
    await derivedPage(page, { slow: true });
    // Every risk row points somewhere a reader can go and check it.
    const links = page.locator('#risk a[href^="https://systemslibrarian.github.io/crypto-lab-"]');
    expect(await links.count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator('#risk')).toContainText('Implicit rejection');
    await expect(page.locator('#risk')).toContainText('KyberSlash');
    // ...and the SLH-DSA row cites this page's own measurement, which the
    // derivation log actually holds.
    await expect(page.locator('#risk')).toContainText('derivation log on this page timed');
    await page.locator('#log-panel > summary').click();
    const slowEntry = page.locator('li[data-log-scheme="slh_dsa_sha2_256s"]');
    await expect(slowEntry).toBeVisible();
    const fastEntry = page.locator('li[data-log-scheme="slh_dsa_sha2_256f"]');
    // The claim the risk row makes, re-derived from the log: the `s` variant
    // costs more than the `f` variant it sits beside.
    const parse = async (loc: typeof slowEntry): Promise<number> => {
      const text = await loc.innerText();
      const match = text.match(/([\d.]+)\s*(ms|s)\b/);
      if (!match) throw new Error(`no duration in ${JSON.stringify(text)}`);
      return Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    };
    expect(await parse(slowEntry)).toBeGreaterThan(await parse(fastEntry));
  });
});

test.describe('honest scoping is on the page, not only in the README', () => {
  test('the page says what is real, what is not measured, and what it does not prove', async ({ page }) => {
    test.setTimeout(600_000);
    await derivedPage(page);
    const scope = page.locator('#scope');
    await expect(scope).toContainText('Not production cryptography');
    await expect(scope).toContainText('not a security ranking');
    await expect(scope).toContainText('Smaller is not safer');
    await expect(scope).toContainText('says nothing about constant-time behaviour');
    await expect(scope).toContainText('UOV is not among the nineteen sets this page derives');
  });

  test('the slow sets are last, so the wait teaches before any number appears', async ({ page }) => {
    test.setTimeout(600_000);
    await boot(page, 'hold-derivation');
    await startDerivation(page);
    // While the last slow set is measuring, every cheap and moderate row has
    // already landed. That ordering is the mechanism this page exists to show,
    // so it is asserted rather than left to the eye.
    await waitForRowState(page, 'slh_dsa_sha2_256s', 'deriving');
    await expect(page.locator('tr[data-state="pending"]')).toHaveCount(0);
    await expect(page.locator('tr[data-row="ml_kem512"]')).toHaveAttribute('data-state', 'derived');
    await expect(page.locator('tr[data-row="slh_dsa_sha2_256f"]')).toHaveAttribute('data-state', 'derived');
    await expect(page.locator('tr[data-row="slh_dsa_sha2_256s"]')).toContainText('measuring');
  });
});
