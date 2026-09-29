/**
 * The handshake calculator.
 *
 * The claim worth testing is not "the arithmetic is right" — it is that there
 * is no arithmetic: the total is the length of a buffer that exists, and the
 * parts are lengths of the buffers that went into it.
 */

import { describe, expect, it } from 'vitest';
import { computeHandshake, computeHybridOverhead, concatBytes } from './handshake';
import { deriveScheme } from '../derive/adapters';

describe('concatBytes', () => {
  it('joins end to end and preserves order', () => {
    const joined = concatBytes([Uint8Array.of(1, 2), Uint8Array.of(3), Uint8Array.of(4, 5)]);
    expect([...joined]).toEqual([1, 2, 3, 4, 5]);
  });

  it('is empty for no chunks', () => {
    expect(concatBytes([]).length).toBe(0);
  });
});

describe('computeHandshake', () => {
  it('reports four objects, in wire order', () => {
    const cost = computeHandshake('ml_kem768', 'ml_dsa65');
    expect(cost.parts.map((p) => p.message)).toEqual([
      'ClientHello',
      'ServerHello',
      'Certificate',
      'CertificateVerify',
    ]);
  });

  it('the total is the concatenation’s length, and the parts sum to it', () => {
    const cost = computeHandshake('ml_kem768', 'ml_dsa65');
    expect(cost.totalBytes).toBe(cost.sumOfParts);
    expect(cost.totalBytes).toBeGreaterThan(0);
  });

  it('the parts are the sizes the table derived for those schemes', () => {
    // An independent re-derivation: the panel's four numbers should be the same
    // four the matrix produced, arrived at by a different call.
    const kem = deriveScheme('ml_kem768');
    const sig = deriveScheme('ml_dsa65');
    if (kem.payload.kind !== 'fixed' || sig.payload.kind !== 'fixed') {
      throw new Error('both are fixed-length here');
    }
    const cost = computeHandshake('ml_kem768', 'ml_dsa65');
    expect(cost.parts[0].bytes).toBe(kem.publicKeyBytes);
    expect(cost.parts[1].bytes).toBe(kem.payload.bytes);
    expect(cost.parts[2].bytes).toBe(sig.publicKeyBytes);
    expect(cost.parts[3].bytes).toBe(sig.payload.bytes);
  });

  it('flags a variable-length signature so the total is not read as fixed', () => {
    expect(computeHandshake('ml_kem768', 'falcon512').signatureVariable).toBe(true);
    expect(computeHandshake('ml_kem768', 'falcon512padded').signatureVariable).toBe(false);
  });

  it('a Falcon handshake really does move between runs', () => {
    // Twelve draws. If they were all identical the panel's caveat would be
    // decoration, and this test is what stops it becoming that.
    const totals = new Set(
      Array.from({ length: 12 }, () => computeHandshake('ml_kem768', 'falcon512').totalBytes)
    );
    expect(totals.size, 'a variable-length signature should vary').toBeGreaterThan(1);
  });

  it('refuses a signature scheme in the KEM slot, and the reverse', () => {
    expect(() => computeHandshake('ml_dsa65', 'ml_dsa65')).toThrow(/not a KEM/);
    expect(() => computeHandshake('ml_kem768', 'ml_kem768')).toThrow(/not a signature scheme/);
  });

  it('refuses an unknown parameter set by name', () => {
    expect(() => computeHandshake('ml_kem999', 'ml_dsa65')).toThrow(/not a KEM/);
  });
});

describe('computeHybridOverhead', () => {
  it('measures the hybrid against its own post-quantum component', () => {
    const overhead = computeHybridOverhead('ml_kem768_x25519', 'ml_kem768');
    expect(overhead.hybridBytes).toBeGreaterThan(overhead.baseBytes);
    expect(overhead.overheadBytes).toBe(overhead.hybridBytes - overhead.baseBytes);
  });

  it('the percentage is derived from the two byte counts, not quoted', () => {
    const o = computeHybridOverhead('ml_kem768_x25519', 'ml_kem768');
    expect(o.overheadPercent).toBeCloseTo((o.overheadBytes / o.baseBytes) * 100, 10);
  });

  it('the overhead is a whole second key exchange for a few percent', () => {
    // The claim the panel makes, as a measurement. Bounded loosely on purpose:
    // pinning it to a decimal place would be typing in the number again.
    const o = computeHybridOverhead('ml_kem768_x25519', 'ml_kem768');
    expect(o.overheadPercent).toBeGreaterThan(1);
    expect(o.overheadPercent).toBeLessThan(10);
  });

  it('refuses a scheme that is not a KEM', () => {
    expect(() => computeHybridOverhead('ml_dsa65', 'ml_kem768')).toThrow(/not a derivable KEM/);
  });
});
