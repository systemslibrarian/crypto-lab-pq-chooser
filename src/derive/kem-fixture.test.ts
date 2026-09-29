/**
 * The negative claim's fixture, tested where the page cannot be.
 *
 * `e2e/claims.spec.ts` drives this through the UI and asserts the three things
 * §4.1d asks for. What it cannot do is run it enough times to establish that
 * implicit rejection is the mechanism rather than the outcome of one lucky
 * byte, or check that the fixture would NOTICE if the library started raising.
 */

import { describe, expect, it } from 'vitest';
import { runKemFixture, NEGATIVE_CLAIM } from './kem-fixture';

describe('ML-KEM implicit rejection', () => {
  it.each([0, 1, 17, 255, 543, 1087])(
    'flipping byte %i returns a full-length secret and raises nothing',
    (index) => {
      const result = runKemFixture(index);
      expect(result.raisedNoError, 'decapsulation must not throw').toBe(true);
      expect(result.secretsMatch, 'and must not return the sender’s secret').toBe(false);
    }
  );

  it('every check the page performs passes in that state', () => {
    // This is assertion 2 of the negative-claim contract, checked here as well
    // as in the browser: if any check fails, the fixture has stopped
    // demonstrating a limit and started demonstrating the mechanism working.
    const result = runKemFixture(17);
    expect(result.checks.map((c) => c.passed)).toEqual([true, true, true, true]);
  });

  it('changes exactly one bit of exactly one byte', () => {
    const result = runKemFixture(17);
    expect(result.flippedFrom ^ result.flippedTo).toBe(1);
    expect(result.flippedByteIndex).toBe(17);
  });

  it('wraps the byte index into the ciphertext rather than throwing', () => {
    // The page advances a counter, so the index runs past the ciphertext.
    const result = runKemFixture(999_999);
    expect(result.flippedByteIndex).toBeGreaterThanOrEqual(0);
    expect(result.flippedByteIndex).toBeLessThan(result.cipherTextBytes);
  });

  it('reports the two secrets as different prefixes', () => {
    const result = runKemFixture(42);
    expect(result.honestSecretPrefix).not.toBe(result.recoveredSecretPrefix);
    expect(result.honestSecretPrefix).toMatch(/^([0-9a-f]{2} ){7}[0-9a-f]{2}$/);
  });
});

describe('the negative claim itself', () => {
  it('is scoped to the construction on the page, not to the field', () => {
    // "ML-KEM decapsulation reports no error" is true and is what the fixture
    // shows. "Post-quantum KEMs cannot detect corruption" would be false — an
    // AEAD over the derived key detects it immediately — and a claim scoped to
    // the field rather than to the construction is the failure mode section
    // 4.1d warns about.
    expect(NEGATIVE_CLAIM).toContain('ML-KEM decapsulation');
    expect(NEGATIVE_CLAIM).not.toMatch(/all post-quantum|every KEM|KEMs cannot/i);
  });

  it('names what on this page could not have failed', () => {
    expect(NEGATIVE_CLAIM).toMatch(/size/);
    expect(NEGATIVE_CLAIM).toMatch(/timing/);
    expect(NEGATIVE_CLAIM).toMatch(/round trip/);
  });
});
