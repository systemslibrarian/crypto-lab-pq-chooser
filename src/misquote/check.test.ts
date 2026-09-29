/**
 * The misquote verdicts and the claim checker.
 *
 * Both are pure functions over derived rows, which is what lets them be tested
 * against REAL library output here and driven through the UI in the claims
 * suite. The rows below are derived, not fabricated — a fabricated row would
 * test the renderer's agreement with itself.
 */

import { describe, expect, it } from 'vitest';
import { deriveScheme } from '../derive/adapters';
import { SCHEMES } from '../derive/schemes';
import { FAILURE_CODES } from '../derive/codes';
import type { DerivedRow } from '../derive/types';
import { MISQUOTE_ROWS } from './rows';
import { checkClaim, resolveMisquote } from './check';

/** Derive the handful of sets these tests need, once. */
const NEEDED = ['ml_dsa65', 'ml_dsa87', 'ml_kem1024', 'ml_kem768', 'falcon512', 'falcon512padded'];
const rows = new Map<string, DerivedRow>(
  NEEDED.map((id) => [id, { schemeId: id, state: { status: 'derived', sizes: deriveScheme(id) } }])
);
const empty = new Map<string, DerivedRow>();

const rowByNumber = (n: number) => MISQUOTE_ROWS.find((r) => r.n === n)!;

describe('resolveMisquote', () => {
  it('row 1: the library contradicts the Round-3 ML-DSA-65 figure', () => {
    const verdict = resolveMisquote(rowByNumber(1), rows);
    expect(verdict.status).toBe('contradicted');
    expect(verdict.observed).toContain('ML-DSA-65');
  });

  it('row 2: the library contradicts the Round-3 ML-DSA-87 figure', () => {
    expect(resolveMisquote(rowByNumber(2), rows).status).toBe('contradicted');
  });

  it('row 3: sixteen Falcon signatures take more than one length', () => {
    const verdict = resolveMisquote(rowByNumber(3), rows);
    expect(verdict.status).toBe('contradicted');
    expect(verdict.observed).toMatch(/different lengths/);
    expect(verdict.observed).toMatch(/every time/);
  });

  it('row 4: ML-KEM-1024’s ciphertext is not larger than its public key', () => {
    const verdict = resolveMisquote(rowByNumber(4), rows);
    expect(verdict.status).toBe('contradicted');
    expect(verdict.observed).toContain('the same size');
  });

  it('row 4 is a trap only because the pattern holds at the smaller sets', () => {
    // An independent re-derivation of the claim the row is about, rather than a
    // restatement of the row.
    for (const id of ['ml_kem512', 'ml_kem768']) {
      const s = deriveScheme(id);
      if (s.payload.kind !== 'fixed') throw new Error('KEM ciphertexts are fixed');
      expect(s.payload.bytes, `${id} ciphertext vs public key`).toBeLessThan(s.publicKeyBytes);
    }
    const big = deriveScheme('ml_kem1024');
    if (big.payload.kind !== 'fixed') throw new Error('KEM ciphertexts are fixed');
    expect(big.payload.bytes).toBe(big.publicKeyBytes);
  });

  it('row 5 says it was cited rather than measured', () => {
    const verdict = resolveMisquote(rowByNumber(5), rows);
    expect(verdict.status).toBe('not-derivable');
    expect(verdict.observed).toContain('crypto-lab-multivariate');
  });

  it('every derivable row is pending until its evidence exists', () => {
    for (const row of MISQUOTE_ROWS.filter((r) => r.check.kind !== 'cited')) {
      expect(resolveMisquote(row, empty).status, `row ${row.n}`).toBe('pending');
    }
  });

  it('a pending verdict carries no figure at all', () => {
    for (const row of MISQUOTE_ROWS.filter((r) => r.check.kind !== 'cited')) {
      expect(resolveMisquote(row, empty).observed).toBe('');
    }
  });
});

describe('checkClaim — the break-it-yourself interaction', () => {
  it('confirms a claim that matches what ran', () => {
    const derived = rows.get('ml_dsa65')!;
    if (derived.state.status !== 'derived' || derived.state.sizes.payload.kind !== 'fixed') {
      throw new Error('expected a fixed size');
    }
    const actual = derived.state.sizes.payload.bytes;
    const result = checkClaim('ml_dsa65', 'payload', String(actual), rows);
    expect(result.outcome).toBe('confirmed');
    expect(result.message).toContain(String(actual));
  });

  it('CLAIM_CONTRADICTED: names what the library produced instead', () => {
    const result = checkClaim('ml_dsa65', 'payload', '3293', rows);
    expect(result.outcome).toBe('failed');
    expect(result.code).toBe(FAILURE_CODES.CLAIM_CONTRADICTED);
    expect(result.message).toContain('3293');
  });

  it.each(['', '  ', 'twelve', '12.5', '-4', '0', '1e3'])(
    'CLAIM_MALFORMED for %j',
    (input) => {
      const result = checkClaim('ml_dsa65', 'payload', input, rows);
      expect(result.outcome).toBe('failed');
      expect(result.code).toBe(FAILURE_CODES.CLAIM_MALFORMED);
    }
  );

  it('CLAIM_NOT_DERIVED: refuses to answer from the published figure', () => {
    const result = checkClaim('slh_dsa_sha2_192s', 'payload', '16224', rows);
    expect(result.outcome).toBe('failed');
    expect(result.code).toBe(FAILURE_CODES.CLAIM_NOT_DERIVED);
    // The refusal says WHY it is refusing rather than reading as a bug.
    expect(result.message).toMatch(/published figure would answer this instantly/);
  });

  it('CLAIM_NOT_DERIVED carries the row’s own cause when the set was skipped', () => {
    const skipped = new Map(rows);
    skipped.set('slh_dsa_sha2_192s', {
      schemeId: 'slh_dsa_sha2_192s',
      state: {
        status: 'unavailable',
        code: FAILURE_CODES.DERIVE_SKIPPED,
        cause: 'not measured, skipped by you',
      },
    });
    const result = checkClaim('slh_dsa_sha2_192s', 'payload', '16224', skipped);
    expect(result.code).toBe(FAILURE_CODES.CLAIM_NOT_DERIVED);
    expect(result.message).toContain('skipped by you');
  });

  it('a range answers about the range, and refuses to have a single right answer', () => {
    const inside = checkClaim('falcon512', 'payload', '654', rows);
    // 654 may or may not be inside a given sample; either way the wording must
    // deny that the scheme has one signature size.
    expect(inside.message).toMatch(/no single (signature size|number)/);
  });

  it('a claim outside the measured Falcon range is contradicted', () => {
    const result = checkClaim('falcon512', 'payload', '900', rows);
    expect(result.outcome).toBe('failed');
    expect(result.code).toBe(FAILURE_CODES.CLAIM_CONTRADICTED);
  });

  it('checks public keys as well as payloads', () => {
    const derived = rows.get('ml_kem768')!;
    if (derived.state.status !== 'derived') throw new Error('expected derived');
    const actual = derived.state.sizes.publicKeyBytes;
    expect(checkClaim('ml_kem768', 'publicKey', String(actual), rows).outcome).toBe('confirmed');
    expect(checkClaim('ml_kem768', 'publicKey', String(actual + 1), rows).code).toBe(
      FAILURE_CODES.CLAIM_CONTRADICTED
    );
  });

  it('names the right noun for a KEM and for a signature scheme', () => {
    expect(checkClaim('ml_kem768', 'payload', '1', rows).message).toContain('ciphertext');
    expect(checkClaim('ml_dsa65', 'payload', '1', rows).message).toContain('signature');
  });

  it('every scheme on the page is selectable in the checker', () => {
    // The panel builds its options from the registry, so this guards the day a
    // row is added to one and not the other.
    for (const scheme of SCHEMES) {
      const result = checkClaim(scheme.id, 'payload', '1', rows);
      expect(result.outcome, scheme.id).toBe('failed');
      expect(
        [FAILURE_CODES.CLAIM_CONTRADICTED, FAILURE_CODES.CLAIM_NOT_DERIVED],
        scheme.id
      ).toContain(result.code);
    }
  });
});
