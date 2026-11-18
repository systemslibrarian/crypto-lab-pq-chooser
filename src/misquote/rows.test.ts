/**
 * The misquote panel's data, checked for the thing data like this always drifts
 * into: quietly becoming right.
 *
 * A row whose "misquote" is actually what the library produces is not a
 * misquote, and a panel carrying one would be teaching a wrong correction with
 * a confident face. So every claimed figure is checked against real output and
 * required to DISAGREE.
 */

import { describe, expect, it } from 'vitest';
import { MISQUOTE_ROWS } from './rows';
import { deriveScheme } from '../derive/adapters';
import { SCHEMES, SCHEMES_BY_ID } from '../derive/schemes';
import { DISTINCTIVE_SPEC_INTEGERS } from '../derive/spec-sizes';

describe('the panel is exactly the five rows the audit earned', () => {
  it('has five rows, numbered one to five', () => {
    expect(MISQUOTE_ROWS).toHaveLength(5);
    expect(MISQUOTE_ROWS.map((r) => r.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives every row an evidence anchor', () => {
    for (const row of MISQUOTE_ROWS) {
      expect(row.evidence.length, `row ${row.n}`).toBeGreaterThan(20);
    }
  });

  it('cites another lab for the rows that came from one', () => {
    const cited = MISQUOTE_ROWS.filter((r) => /crypto-lab-/.test(r.evidence));
    expect(cited.map((r) => r.n)).toEqual([1, 2, 3, 5]);
    // Row 4 is the one with no incident behind it, and its evidence says so
    // rather than borrowing a citation.
    expect(MISQUOTE_ROWS[3].evidence).toMatch(/No incident behind this one/);
  });
});

describe('every claimed figure really is wrong', () => {
  it.each(
    MISQUOTE_ROWS.filter((r) => r.check.kind === 'value').map(
      (r) => [r.n, r.check as { kind: 'value'; schemeId: string; field: string; claimed: number }] as const
    )
  )('row %i: the library does not produce the claimed length', (_n, check) => {
    const sizes = deriveScheme(check.schemeId);
    const actual =
      check.field === 'publicKey'
        ? sizes.publicKeyBytes
        : sizes.payload.kind === 'fixed'
          ? sizes.payload.bytes
          : -1;
    expect(actual).toBeGreaterThan(0);
    expect(actual, 'a "misquote" the library agrees with is not a misquote').not.toBe(check.claimed);
  });

  it('no claimed figure is a published size for a set this page derives', () => {
    const claimed = MISQUOTE_ROWS.filter((r) => r.check.kind === 'value').map(
      (r) => (r.check as { claimed: number }).claimed
    );
    const collisions = claimed.filter((c) => DISTINCTIVE_SPEC_INTEGERS.includes(c));
    expect(collisions, 'a claimed figure that is also a real size would refute itself').toEqual([]);
  });
});

describe('the shape-based rows point at parameter sets that exist', () => {
  it('row 3 names a raw Falcon variant and its padded twin', () => {
    const row = MISQUOTE_ROWS[2];
    if (row.check.kind !== 'variable') throw new Error('row 3 is the variable-length row');
    expect(SCHEMES_BY_ID.get(row.check.rawSchemeId)?.variableLength).toBe(true);
    expect(SCHEMES_BY_ID.get(row.check.paddedSchemeId)?.variableLength).toBeUndefined();
  });

  it('row 4 names every ML-KEM parameter set, because the claim is an "always"', () => {
    const row = MISQUOTE_ROWS[3];
    if (row.check.kind !== 'relation') throw new Error('row 4 is the relation row');
    const named = [...row.check.schemeIds];
    for (const id of named) expect(SCHEMES_BY_ID.get(id)?.kind, id).toBe('kem');
    // Every unhybridised ML-KEM set the page derives has to be in the check.
    // With only ML-KEM-1024 in it, the row's own sentence about the other two
    // sets was wrong and no verdict on the page contradicted it.
    const mlKemSets = SCHEMES.filter((s) => /^ml_kem\d+$/.test(s.id)).map((s) => s.id);
    expect(named.slice().sort()).toEqual(mlKemSets.slice().sort());
    expect(named.length).toBe(3);
  });

  it('row 4 does not claim the relation holds at any parameter set', () => {
    // The correction used to read "It holds at ML-KEM-512 and ML-KEM-768".
    // Both are false: the ciphertext is smaller at both (see check.test.ts,
    // which re-derives all three comparisons from library output).
    expect(MISQUOTE_ROWS[3].correction).toMatch(/holds at no ML-KEM parameter set/);
    expect(MISQUOTE_ROWS[3].correction).not.toMatch(/holds at ML-KEM-512/);
  });

  it('row 5 is cited, and says which lab it is cited from', () => {
    const row = MISQUOTE_ROWS[4];
    if (row.check.kind !== 'cited') throw new Error('row 5 is the cited row');
    expect(row.check.source).toBe('crypto-lab-multivariate');
    expect(row.correction).toContain('6328');
  });

  it('the UOV arithmetic in row 5 is stated so it can be checked', () => {
    // The misquote is a REAL historical error -- crypto-lab-multivariate once
    // labelled 278,432 bytes as '278 KB' -- so it stays at the Round-2 figure
    // it was made about. That is why this row is cited rather than measured.
    // m * n(n+1)/2 for uov-Ip Round 2: 44 * 112 * 113 / 2.
    const roundTwo = (44 * 112 * 113) / 2;
    expect(roundTwo).toBe(278_432);
    // ...and that really is 272 KiB, not 278.
    expect(Math.round(roundTwo / 1024)).toBe(272);
    expect(MISQUOTE_ROWS[4].correction).toContain('272 KiB');

    // The cited row moved to Round 3 on 2026-11-18, and the correction carries
    // the same formula over the new set so the lesson lands on the live figure
    // too: the identical misreading of 321,300 would say "321 KB".
    const roundThree = (45 * 119 * 120) / 2;
    expect(roundThree).toBe(321_300);
    expect(Number((roundThree / 1024).toFixed(1))).toBe(313.8);
    expect(MISQUOTE_ROWS[4].correction).toContain('45 \u00d7 7140 = 321,300');
    expect(MISQUOTE_ROWS[4].correction).toContain('313.8 KiB');
  });

  it('every correction whose figure is round-specific names its round', () => {
    // Rows 1 and 2 already said "Round-3"; row 5 gave uov-Ip's (112, 44, 256)
    // with no round at all. Those are the Round-2 figures: UOV specification
    // version 2.0 (5 February 2025) Table 1 gives uov-Ip n=112, m=44, q=256 and
    // |epk| = 278 432 bytes, while version 3.0 (30 August 2026), the Round-3
    // submission, moves the set to (119, 45) with 321,300 bytes. Row 5 now
    // names BOTH, because the misquote belongs to the first and the cited row
    // has moved to the second.
    for (const n of [1, 2, 5]) {
      const row = MISQUOTE_ROWS[n - 1];
      expect(row.n).toBe(n);
      expect(row.correction, `row ${n} names the round its figure comes from`).toMatch(
        /Round-[23]|Round [23]/,
      );
    }
    expect(MISQUOTE_ROWS[4].correction).toContain('Round-2 submission');
    expect(MISQUOTE_ROWS[4].correction).toContain('version 2.0');
    expect(MISQUOTE_ROWS[4].correction).toContain('321,300');
  });
});
