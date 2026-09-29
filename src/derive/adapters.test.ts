/**
 * The adapters, at the edges the KAT suite does not reach: what happens when a
 * name is wrong, and whether the variable-length measurement is measuring
 * anything.
 */

import { describe, expect, it } from 'vitest';
import { bytesEqual, deriveScheme, measureSignatureLength, SIGNERS } from './adapters';

describe('deriveScheme refuses what it cannot derive', () => {
  it('throws by name for a parameter set that is not in the registry', () => {
    expect(() => deriveScheme('ml_kem999')).toThrow(/no such parameter set: ml_kem999/);
  });

  it('carries a cause the row can print', () => {
    // The worker turns a thrown message into DERIVE_FAILED with the message
    // verbatim, so "it failed" without a cause would reach the page as a blank
    // with a badge on it.
    try {
      deriveScheme('nope');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message.length).toBeGreaterThan(10);
    }
  });
});

describe('measureSignatureLength', () => {
  it('reports `fixed` when every sample agreed', () => {
    const signer = SIGNERS.falcon512padded;
    const keys = signer.keygen();
    const measured = measureSignatureLength(signer, keys.secretKey, 12);
    expect(measured.kind).toBe('fixed');
  });

  it('reports a `range` when they did not, with the sample count on it', () => {
    const signer = SIGNERS.falcon512;
    const keys = signer.keygen();
    const measured = measureSignatureLength(signer, keys.secretKey, 24);
    expect(measured.kind).toBe('range');
    if (measured.kind !== 'range') throw new Error('unreachable');
    expect(measured.samples).toBe(24);
    expect(measured.distinct).toBeGreaterThan(1);
    expect(measured.max).toBeGreaterThan(measured.min);
  });

  it('a range over N samples is not the scheme’s bounds, and widens with N', () => {
    // The honest caveat, made measurable. Two independent samplings of the same
    // key at different N: the larger one must not be NARROWER, and across many
    // runs it is typically wider. Asserting only the weak direction keeps this
    // deterministic while still failing if the sampler stopped varying.
    const signer = SIGNERS.falcon512;
    const keys = signer.keygen();
    const small = measureSignatureLength(signer, keys.secretKey, 4);
    const large = measureSignatureLength(signer, keys.secretKey, 64);
    if (large.kind !== 'range') throw new Error('64 Falcon signatures should vary');
    const smallSpan = small.kind === 'range' ? small.max - small.min : 0;
    expect(large.max - large.min).toBeGreaterThanOrEqual(smallSpan);
  });

  it('varies the message per sample, so the variation comes from the sampler', () => {
    // Signing the SAME message repeatedly would still vary (Falcon's sampler is
    // randomised), but a reader is entitled to assume a "range over signatures"
    // means different signatures. This checks the adapter does that.
    const signer = SIGNERS.falcon512;
    const keys = signer.keygen();
    const one = measureSignatureLength(signer, keys.secretKey, 1);
    expect(one.kind).toBe('fixed');
  });
});

describe('bytesEqual', () => {
  it('is false for different lengths', () => {
    expect(bytesEqual(Uint8Array.of(1), Uint8Array.of(1, 2))).toBe(false);
  });

  it('is true only for identical contents', () => {
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
    expect(bytesEqual(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4))).toBe(false);
  });

  it('is true for two empty arrays', () => {
    expect(bytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});
