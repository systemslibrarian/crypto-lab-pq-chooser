import { describe, expect, it } from 'vitest';
import { deriveScheme } from '../derive/adapters';
import { SCHEMES } from '../derive/schemes';
import { FAILURE_CODES } from '../derive/codes';
import type { DerivedRow } from '../derive/types';
import { DEFAULT_CONSTRAINTS } from '../choose/rules';
import { buildRunExport, exportFilename, toCSV } from './run-export';

const rows = new Map<string, DerivedRow>(
  SCHEMES.filter((s) => s.costClass !== 'slow').map((s) => [
    s.id,
    { schemeId: s.id, state: { status: 'derived', sizes: deriveScheme(s.id) } },
  ])
);
for (const s of SCHEMES.filter((s) => s.costClass === 'slow')) {
  rows.set(s.id, {
    schemeId: s.id,
    state: { status: 'unavailable', code: FAILURE_CODES.DERIVE_DEFERRED, cause: 'not measured yet' },
  });
}

const run = buildRunExport(rows, null, DEFAULT_CONSTRAINTS, ['ml_kem768']);

describe('the export describes the run, not just the numbers', () => {
  it('carries every parameter set, derived or not', () => {
    expect(run.schemes).toHaveLength(SCHEMES.length);
    expect(run.schemes.filter((s) => s.state === 'derived').length).toBe(SCHEMES.length - 3);
  });

  it('says WHY a set has no figure rather than omitting the row', () => {
    const deferred = run.schemes.filter((s) => s.state === 'deferred-or-unavailable');
    expect(deferred).toHaveLength(3);
    for (const s of deferred) {
      expect(s.code).toBe(FAILURE_CODES.DERIVE_DEFERRED);
      expect(s.cause).toBeTruthy();
      expect(s.publicKeyBytes, 'a set with no figure must export no figure').toBeUndefined();
    }
  });

  it('records the Falcon sample metadata, so a range can be read correctly', () => {
    const falcon = run.schemes.find((s) => s.id === 'falcon512')!;
    expect(falcon.payloadKind).toBe('range');
    expect(falcon.payloadSamples).toBe(run.falconSamplesPerRow);
    expect(falcon.payloadDistinctLengths).toBeGreaterThan(1);
    expect(falcon.payloadMin).toBeLessThanOrEqual(falcon.payloadMax!);
  });

  it('names the library and the moment', () => {
    expect(run.library.name).toBe('@noble/post-quantum');
    expect(() => new Date(run.generatedAt).toISOString()).not.toThrow();
  });

  it('carries no environment block when no benchmark ran, rather than an empty one', () => {
    // A timing needs the environment; an absent benchmark needs no environment,
    // and inventing one would imply measurements that were never taken.
    expect(run.environment).toBeNull();
    expect(run.benchmark).toEqual([]);
  });

  it('exports the constraints and pins that produced the shortlist', () => {
    expect(run.constraints).toEqual(DEFAULT_CONSTRAINTS);
    expect(run.pinned).toEqual(['ml_kem768']);
  });
});

describe('nothing secret leaves the page', () => {
  it('contains no key material, and no long hex run at all', () => {
    // The worker never hands the main thread a key -- it returns lengths and
    // timings -- so there is nothing here to leak. This asserts that, in case
    // it ever stops being true.
    const text = JSON.stringify(run);
    expect(text).not.toMatch(/[0-9a-f]{32,}/i);
    expect(text).not.toMatch(/secretKeyHex|privateKey|seed"\s*:\s*"/i);
  });
});

describe('CSV', () => {
  const csv = toCSV(run);

  it('has a header for every block it writes', () => {
    expect(csv).toContain('# derived sizes');
    expect(csv).toContain('# benchmark');
    expect(csv.split('\n')[0]).toContain('crypto-lab-pq-chooser');
  });

  it('says the environment was not collected rather than leaving it blank', () => {
    expect(csv).toMatch(/# environment,not collected/);
  });

  it('writes one row per parameter set', () => {
    const block = csv.split('# derived sizes')[1].split('\n# benchmark')[0].trim().split('\n');
    // One header line plus one line per set.
    expect(block).toHaveLength(SCHEMES.length + 1);
  });

  it('quotes cells containing commas', () => {
    const withComma = toCSV({
      ...run,
      schemes: [{ ...run.schemes[0], label: 'a, b', cause: 'x, y' }],
    });
    expect(withComma).toContain('"a, b"');
  });

  it('agrees with the JSON on every derived size', () => {
    // Cross-check: two serialisations of one run must not disagree.
    for (const scheme of run.schemes.filter((s) => s.state === 'derived' && s.payloadKind === 'fixed')) {
      const line = csv.split('\n').find((l) => l.startsWith(`${scheme.id},`))!;
      expect(line.split(',')).toContain(String(scheme.publicKeyBytes));
      expect(line.split(',')).toContain(String(scheme.payloadBytes));
    }
  });
});

describe('filenames', () => {
  it('are timestamped and safe for a filesystem', () => {
    const name = exportFilename(run, 'json');
    expect(name).toMatch(/^pq-chooser-[\dTZ-]+\.json$/);
    expect(name).not.toContain(':');
  });
});
