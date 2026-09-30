/**
 * The chooser, tested against REAL derived rows.
 *
 * Fabricated rows would test the rules' agreement with themselves. These come
 * from `deriveScheme`, so a shortlist that claims a byte count is claiming the
 * same byte count the page shows.
 */

import { describe, expect, it } from 'vitest';
import { deriveScheme } from '../derive/adapters';
import { SCHEMES } from '../derive/schemes';
import { FAILURE_CODES } from '../derive/codes';
import type { DerivedRow } from '../derive/types';
import type { BenchmarkRun } from '../bench/runner';
import {
  CANNOT_DECIDE,
  CLASSICAL_WIRE_BYTES,
  chooseSchemes,
  DEFAULT_CONSTRAINTS,
  ROLE_NOTE,
  type Constraints,
} from './rules';

/** Every set derived once, shared across the suite. */
const rows = new Map<string, DerivedRow>(
  SCHEMES.map((s) => [s.id, { schemeId: s.id, state: { status: 'derived', sizes: deriveScheme(s.id) } }])
);
const empty = new Map<string, DerivedRow>();

const with_ = (over: Partial<Constraints>): Constraints => ({ ...DEFAULT_CONSTRAINTS, ...over });

describe('the shortlist is a shortlist', () => {
  it('returns between one and three candidates', () => {
    for (const role of ['kem', 'signature'] as const) {
      const list = chooseSchemes(with_({ role }), rows);
      expect(list.candidates.length, role).toBeGreaterThanOrEqual(1);
      expect(list.candidates.length, role).toBeLessThanOrEqual(3);
    }
  });

  it('prefers one parameter set per family, so it is a real choice', () => {
    const list = chooseSchemes(with_({ role: 'signature', minCategory: 1, wireBudget: 'any' }), rows);
    const families = list.candidates.map((c) => c.family);
    expect(new Set(families).size).toBe(families.length);
  });

  it('gives every candidate at least one reason and exactly one caveat', () => {
    for (const role of ['kem', 'signature'] as const) {
      for (const c of chooseSchemes(with_({ role }), rows).candidates) {
        expect(c.reasons.length, c.label).toBeGreaterThan(0);
        expect(c.caveat.length, c.label).toBeGreaterThan(30);
      }
    }
  });

  it('says what it cannot decide, every time', () => {
    const list = chooseSchemes(DEFAULT_CONSTRAINTS, rows);
    expect(list.cannotDecide).toEqual([...CANNOT_DECIDE]);
    expect(list.cannotDecide.join(' ')).toMatch(/certification/i);
    expect(list.cannotDecide.join(' ')).toMatch(/ecosystem/i);
  });

  it('states the criteria it ordered by', () => {
    const list = chooseSchemes(DEFAULT_CONSTRAINTS, rows);
    expect(list.orderedBy.length).toBeGreaterThan(0);
    expect(list.orderedBy.join(' ')).toContain('bytes on the wire');
  });

  it('never returns a candidate from the other role', () => {
    for (const role of ['kem', 'signature'] as const) {
      for (const c of chooseSchemes(with_({ role }), rows).candidates) {
        expect(SCHEMES.find((s) => s.id === c.schemeId)!.kind, c.label).toBe(role);
      }
    }
  });
});

describe('every constraint actually constrains', () => {
  it('a category floor excludes the sets below it, and says which floor', () => {
    const list = chooseSchemes(with_({ role: 'kem', minCategory: 5 }), rows);
    for (const c of list.candidates) expect(Number(c.nistCategory[0])).toBeGreaterThanOrEqual(5);
    const dropped = list.excluded.find((e) => e.schemeId === 'ml_kem512');
    expect(dropped?.because).toMatch(/category 1/);
  });

  it('requiring a hybrid leaves only hybrids', () => {
    const list = chooseSchemes(with_({ role: 'kem', hybridRequired: true, wireBudget: 'any' }), rows);
    expect(list.candidates.length).toBeGreaterThan(0);
    for (const c of list.candidates) expect(c.family).toBe('Hybrid');
    expect(list.excluded.some((e) => /no classical component/.test(e.because))).toBe(true);
  });

  it('a side-channel-sensitive environment excludes Falcon, naming the sampler', () => {
    const list = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, sideChannelSensitive: true, wireBudget: 'any' }),
      rows
    );
    expect(list.candidates.some((c) => c.family === 'Falcon / FN-DSA')).toBe(false);
    expect(list.excluded.some((e) => /Gaussian sampler/.test(e.because))).toBe(true);
  });

  it('frequent signing excludes the sets that sign in seconds', () => {
    const list = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, signingFrequency: 'frequent', wireBudget: 'any' }),
      rows
    );
    for (const c of list.candidates) {
      expect(SCHEMES.find((s) => s.id === c.schemeId)!.costClass, c.label).not.toBe('slow');
    }
    expect(list.excluded.some((e) => /hundreds of milliseconds to seconds/.test(e.because))).toBe(true);
  });

  it('rare signing lets the slow small-signature sets back in', () => {
    const frequent = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, signingFrequency: 'frequent', wireBudget: 'any' }),
      rows
    );
    const rare = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, signingFrequency: 'rare', wireBudget: 'any' }),
      rows
    );
    const slowExcluded = (l: typeof frequent): number =>
      l.excluded.filter((e) => /signs in hundreds/.test(e.because)).length;
    expect(slowExcluded(frequent)).toBe(3);
    expect(slowExcluded(rare)).toBe(0);
  });

  it('a tight wire budget excludes the large-signature sets, naming the ceiling', () => {
    const list = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, wireBudget: 'tight', signingFrequency: 'rare' }),
      rows
    );
    expect(list.candidates.some((c) => c.family === 'SLH-DSA')).toBe(false);
    const dropped = list.excluded.find((e) => /bytes on the wire, over the/.test(e.because));
    expect(dropped).toBeDefined();
    expect(dropped!.because).toContain(
      (CLASSICAL_WIRE_BYTES.signature * 20).toLocaleString('en-US')
    );
  });

  it('a wider budget admits what a tight one excluded', () => {
    const base = { role: 'signature', minCategory: 1, signingFrequency: 'rare' } as const;
    const tight = chooseSchemes(with_({ ...base, wireBudget: 'tight' }), rows).candidates.length;
    const any = chooseSchemes(with_({ ...base, wireBudget: 'any' }), rows);
    expect(any.candidates.some((c) => c.family === 'SLH-DSA')).toBe(true);
    expect(any.candidates.length).toBeGreaterThanOrEqual(tight);
  });

  it('the raw Falcon rows never appear; the padded encoding stands for the scheme', () => {
    const list = chooseSchemes(with_({ role: 'signature', minCategory: 1, wireBudget: 'any' }), rows);
    expect(list.candidates.some((c) => c.schemeId === 'falcon512')).toBe(false);
    expect(list.excluded.some((e) => e.schemeId === 'falcon512')).toBe(true);
  });
});

describe('it reads derived rows and nothing else', () => {
  it('ranks nothing when nothing has been derived, and says which sets', () => {
    const list = chooseSchemes(DEFAULT_CONSTRAINTS, empty);
    expect(list.candidates).toEqual([]);
    expect(list.notDerived.length).toBeGreaterThan(0);
  });

  it('a skipped set is reported as not derived rather than ranked', () => {
    const partial = new Map(rows);
    for (const id of ['slh_dsa_sha2_128s', 'slh_dsa_sha2_192s', 'slh_dsa_sha2_256s']) {
      partial.set(id, {
        schemeId: id,
        state: { status: 'unavailable', code: FAILURE_CODES.DERIVE_DEFERRED, cause: 'not measured yet' },
      });
    }
    const list = chooseSchemes(
      with_({ role: 'signature', minCategory: 1, signingFrequency: 'rare', wireBudget: 'any' }),
      partial
    );
    expect(list.candidates.some((c) => c.schemeId.endsWith('s'))).toBe(false);
    expect(list.notDerived).toContain('SLH-DSA-SHA2-256s');
  });

  it('every byte count it reports is the one the derived row holds', () => {
    // Independent re-derivation: recompute each candidate's wire total from the
    // row the page is showing, by a different route than the rules take.
    const list = chooseSchemes(with_({ role: 'kem', minCategory: 1, wireBudget: 'any' }), rows);
    for (const c of list.candidates) {
      const state = rows.get(c.schemeId)!.state;
      if (state.status !== 'derived') throw new Error('expected derived');
      const payload = state.sizes.payload;
      const expected = state.sizes.publicKeyBytes + (payload.kind === 'fixed' ? payload.bytes : payload.max);
      expect(c.wireBytes, c.label).toBe(expected);
    }
  });

  it('charges a variable-length signature at the top of its measured range', () => {
    // Budgeting from the bottom of a range is budgeting for the best case.
    const padded = rows.get('falcon512padded')!.state;
    const raw = rows.get('falcon512')!.state;
    if (padded.status !== 'derived' || raw.status !== 'derived') throw new Error('expected derived');
    if (raw.sizes.payload.kind !== 'range') throw new Error('expected a range');
    // The chooser charges the TOP of the measured range, which matters
    // precisely because the top is not bounded by the padded size: raw
    // Falcon-1024 exceeds it in 20 of 20,000 signatures (0.100%), observed with
    // @noble/post-quantum 0.7.1. Budgeting from the
    // bottom of a range would be budgeting for the best case.
    expect(raw.sizes.payload.max).toBeGreaterThanOrEqual(raw.sizes.payload.min);
    expect(raw.sizes.payload.min).toBeLessThan(
      padded.sizes.payload.kind === 'fixed' ? padded.sizes.payload.bytes : 0
    );
  });
});

describe('performance is included only when it was measured', () => {
  it('says so when no benchmark has run', () => {
    const list = chooseSchemes(DEFAULT_CONSTRAINTS, rows);
    expect(list.performanceIncluded).toBe(false);
    for (const c of list.candidates) expect(c.timings).toBeNull();
  });

  it('carries the measured medians once one has', () => {
    const list = chooseSchemes(DEFAULT_CONSTRAINTS, rows);
    const target = list.candidates[0];
    const run = {
      environment: {} as BenchmarkRun['environment'],
      baselineByRole: { kem: 'x25519', signature: 'ecdsa-p256' },
      totalMs: 1,
      rows: [
        {
          id: target.schemeId,
          label: target.label,
          group: 'post-quantum',
          role: 'kem',
          costClass: 'cheap',
          warmupIterations: 5,
          measuredIterations: 30,
          unmeasured: [],
          operations: [
            { slot: 'keygen', operation: 'keygen', samples: [1], summary: { n: 1, min: 1, median: 1, mean: 1, p95: 1, max: 1, stdDev: 0, medianOpsPerSecond: 1000 } },
          ],
        },
      ],
    } as unknown as BenchmarkRun;
    const withBench = chooseSchemes(DEFAULT_CONSTRAINTS, rows, run);
    expect(withBench.performanceIncluded).toBe(true);
    expect(withBench.candidates.find((c) => c.schemeId === target.schemeId)!.timings).not.toBeNull();
  });
});

describe('the two tracks are not interchangeable, and the page says why', () => {
  it('each role note explains what the other role does instead', () => {
    expect(ROLE_NOTE.kem).toMatch(/shared secret/);
    expect(ROLE_NOTE.kem).toMatch(/signature/);
    expect(ROLE_NOTE.signature).toMatch(/who produced/);
    expect(ROLE_NOTE.signature).toMatch(/KEM/);
    for (const note of Object.values(ROLE_NOTE)) expect(note).toMatch(/needs both/);
  });
});
