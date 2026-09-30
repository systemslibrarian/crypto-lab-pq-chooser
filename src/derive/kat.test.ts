/**
 * Known-answer tests: what the library derives, against what the standards say.
 *
 * Nineteen parameter sets, every one of them actually run. The registry drives
 * the loop, so a parameter set added to `schemes.ts` without a published figure
 * to check it against fails here rather than shipping unchecked.
 *
 * These are slow by nature — SLH-DSA-256s signs in seconds — which is why the
 * Vitest timeout in `vite.config.ts` is generous. That timeout measures the
 * scheme, not the test.
 */

import { describe, expect, it } from 'vitest';
import { SCHEMES, SCHEMES_BY_ID } from './schemes';
import { deriveScheme, KEMS, SIGNERS, DERIVATION_MESSAGE } from './adapters';
import { ROUND3_STALE_SIGNATURE_SIZES, SPEC_SIZES } from './spec-sizes';
import type { DerivedSizes } from './types';

/**
 * Derive each parameter set once and assert several things about that one run.
 *
 * Not an optimisation for its own sake: SLH-DSA-256s signs in about 4.5 seconds,
 * and re-deriving it for every assertion would put a minute of hash-based
 * signing into a suite that learns nothing extra from the repetition.
 */
const memo = new Map<string, DerivedSizes>();
const derived = (id: string): DerivedSizes => {
  const hit = memo.get(id);
  if (hit) return hit;
  const sizes = deriveScheme(id);
  memo.set(id, sizes);
  return sizes;
};

describe('the published sizes cover the registry', () => {
  it('has a spec entry for every parameter set on the page', () => {
    const missing = SCHEMES.filter((s) => !SPEC_SIZES[s.id]).map((s) => s.id);
    expect(missing, 'every row needs a published figure to be checked against').toEqual([]);
  });

  it('has no spec entry for a parameter set the page does not derive', () => {
    const ids = new Set(SCHEMES.map((s) => s.id));
    const orphans = Object.keys(SPEC_SIZES).filter((id) => !ids.has(id));
    expect(orphans, 'a spec entry with no row is a figure nothing checks').toEqual([]);
  });

  it('exports an adapter for every parameter set', () => {
    const missing = SCHEMES.filter((s) =>
      s.kind === 'kem' ? !KEMS[s.id] : !SIGNERS[s.id]
    ).map((s) => s.id);
    expect(missing).toEqual([]);
  });
});

describe.each(SCHEMES.map((s) => [s.id, s.label] as const))(
  'KAT: %s (%s)',
  (id, _label) => {
    const scheme = SCHEMES_BY_ID.get(id)!;
    const spec = SPEC_SIZES[id];

    it('derives the published public-key and secret-key lengths', () => {
      const sizes = derived(id);
      expect(sizes.publicKeyBytes, 'public key').toBe(spec.publicKey);
      expect(sizes.secretKeyBytes, 'secret key').toBe(spec.secretKey);
    });

    it('round-trips: decapsulation agrees, or verification returns true', () => {
      const sizes = derived(id);
      expect(
        sizes.roundTripOk,
        'a size read off output nobody checked is a measurement of an unknown function'
      ).toBe(true);
    });

    it('derives the published ciphertext or signature length', () => {
      const sizes = derived(id);
      if (scheme.variableLength) {
        // A variable-length signature has no published value to equal, so what
        // is checked is that it really varies and that it sits in the band
        // around the padded encoding.
        //
        // NOT `max < padded`. That was the assertion here and it was an
        // assumption, not a measurement: over 20,000 signatures observed offline
        // with @noble/post-quantum 0.7.1, raw Falcon-1024 exceeded its padded size
        // in 20 of them (0.100%). The test flaked about once in seven runs until
        // the claim was measured instead of assumed. That rate is an observation
        // with a sample size, not a bound - at 4,000 signatures the study saw 3.
        expect(spec.payloadIsPaddedUpperBound, 'variable rows are compared with the padded encoding').toBe(true);
        expect(sizes.payload.kind).toBe('range');
        if (sizes.payload.kind !== 'range') throw new Error('unreachable');
        expect(sizes.payload.distinct, 'a variable-length signature must vary').toBeGreaterThan(1);
        expect(sizes.payload.min, 'the typical compressed signature is smaller than the padded one').toBeLessThan(
          spec.payload
        );
        // A loose ceiling: the compressed form tracks the padded size closely,
        // and anything far above it would mean the encoding had changed.
        expect(sizes.payload.max, 'the compressed form stays in the band around the padded size').toBeLessThanOrEqual(
          spec.payload + 16
        );
      } else {
        expect(sizes.payload.kind).toBe('fixed');
        if (sizes.payload.kind !== 'fixed') throw new Error('unreachable');
        expect(sizes.payload.bytes).toBe(spec.payload);
      }
    });
  }
);

describe('the variable-length flag is a claim about the library, not a label', () => {
  it.each(SCHEMES.map((s) => [s.id, s.label] as const))(
    '%s renders a range if and only if the library varies (%s)',
    (id) => {
      const scheme = SCHEMES_BY_ID.get(id)!;
      const sizes = derived(id);
      expect(
        sizes.payload.kind === 'range',
        'a row flagged variable must measure as variable, and a row not flagged must not'
      ).toBe(scheme.variableLength === true);
    }
  );
});

describe('the stale Round-3 sizes must not come back', () => {
  it.each(Object.entries(ROUND3_STALE_SIGNATURE_SIZES))(
    '%s does not produce the Round-3 signature size',
    (id, stale) => {
      const sizes = derived(id);
      if (sizes.payload.kind !== 'fixed') throw new Error('expected a fixed signature size');
      expect(sizes.payload.bytes, `${id} must not be the Round-3 size`).not.toBe(stale);
      expect(sizes.payload.bytes).toBe(SPEC_SIZES[id].payload);
    }
  );

  it('records the exact growth FIPS 204 introduced', () => {
    // The commitment hash widened, and the signature grew by exactly that much
    // at 65 and 87 while 44 was unchanged. Stating the DELTA rather than the two
    // sizes is what makes this a check on the reason rather than on the digits.
    expect(SPEC_SIZES.ml_dsa65.payload - ROUND3_STALE_SIGNATURE_SIZES.ml_dsa65).toBe(16);
    expect(SPEC_SIZES.ml_dsa87.payload - ROUND3_STALE_SIGNATURE_SIZES.ml_dsa87).toBe(32);
  });
});

describe('hybrid sizes really are the concatenation they claim to be', () => {
  it.each([
    ['ml_kem768_x25519', 'ml_kem768'],
    ['QSF_ml_kem768_p256', 'ml_kem768'],
    ['QSF_ml_kem1024_p384', 'ml_kem1024'],
  ])('%s carries its post-quantum component plus a classical share', (hybridId, baseId) => {
    const hybrid = derived(hybridId);
    const base = derived(baseId);
    if (hybrid.payload.kind !== 'fixed' || base.payload.kind !== 'fixed') {
      throw new Error('KEM ciphertexts are fixed length');
    }
    const pkOverhead = hybrid.publicKeyBytes - base.publicKeyBytes;
    const ctOverhead = hybrid.payload.bytes - base.payload.bytes;
    // The classical half is the same share in both directions.
    expect(pkOverhead, 'the classical public key rides alongside').toBe(ctOverhead);
    expect(pkOverhead).toBeGreaterThan(0);
    // ...and it is what the composition says it is.
    expect(hybrid.publicKeyBytes).toBe(SPEC_SIZES[hybridId].publicKey);
    expect(hybrid.payload.bytes).toBe(SPEC_SIZES[hybridId].payload);
  });
});

describe('signatures verify only over what was signed', () => {
  it.each(SCHEMES.filter((s) => s.kind === 'signature').map((s) => [s.id] as const))(
    '%s rejects a modified message',
    (id) => {
      const signer = SIGNERS[id];
      const keys = signer.keygen();
      const signature = signer.sign(DERIVATION_MESSAGE, keys.secretKey);
      expect(signer.verify(signature, DERIVATION_MESSAGE, keys.publicKey)).toBe(true);
      const tampered = Uint8Array.from(DERIVATION_MESSAGE);
      tampered[0] ^= 0x01;
      expect(signer.verify(signature, tampered, keys.publicKey)).toBe(false);
    }
  );
});
