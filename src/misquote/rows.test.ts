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
import { SCHEMES_BY_ID } from '../derive/schemes';
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

  it('row 4 names a KEM', () => {
    const row = MISQUOTE_ROWS[3];
    if (row.check.kind !== 'relation') throw new Error('row 4 is the relation row');
    expect(SCHEMES_BY_ID.get(row.check.schemeId)?.kind).toBe('kem');
  });

  it('row 5 is cited, and says which lab it is cited from', () => {
    const row = MISQUOTE_ROWS[4];
    if (row.check.kind !== 'cited') throw new Error('row 5 is the cited row');
    expect(row.check.source).toBe('crypto-lab-multivariate');
    expect(row.correction).toContain('6328');
  });

  it('the UOV arithmetic in row 5 is stated so it can be checked', () => {
    // m * n(n+1)/2 for ov-Ip: 44 * 112 * 113 / 2.
    const n = 112;
    const m = 44;
    const publicKeyBytes = (m * n * (n + 1)) / 2;
    expect(publicKeyBytes).toBe(278_432);
    // ...and that really is 272 KiB, not 278.
    expect(Math.round(publicKeyBytes / 1024)).toBe(272);
    expect(MISQUOTE_ROWS[4].correction).toContain('272 KiB');
  });
});
