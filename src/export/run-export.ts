/**
 * Taking a run away with you.
 *
 * A page whose whole claim is that its numbers were derived here, just now, is
 * a page whose numbers cannot be cited without also citing the run. So a run is
 * exportable: library version, timestamp, environment, clock resolution, sample
 * counts, which sets were derived and which were not and why, the Falcon sample
 * metadata, and the benchmark summaries.
 *
 * WHAT IS NEVER EXPORTED: key material. Every key this page generates lives for
 * milliseconds inside a worker and never crosses back — the worker returns
 * lengths and timings, not bytes — so there is nothing secret to leak here, and
 * `run-export.test.ts` asserts the export carries no hex blob in case that ever
 * stops being true.
 */

import { SCHEMES, FALCON_SAMPLES } from '../derive/schemes';
import { RUNTIME_FACTS } from '../data/runtime';
import type { DerivedRow } from '../derive/types';
import type { BenchmarkRun } from '../bench/runner';
import type { Constraints } from '../choose/rules';

export interface RunExport {
  generatedAt: string;
  page: string;
  library: { name: string; version: string };
  /** Present only when a benchmark has run; a timing has no meaning without it. */
  environment: BenchmarkRun['environment'] | null;
  constraints: Constraints;
  pinned: string[];
  falconSamplesPerRow: number;
  schemes: Array<{
    id: string;
    label: string;
    family: string;
    kind: string;
    nistCategory: string;
    state: 'derived' | 'deferred-or-unavailable' | 'pending';
    code?: string;
    cause?: string;
    publicKeyBytes?: number;
    secretKeyBytes?: number;
    payloadKind?: 'fixed' | 'range';
    payloadBytes?: number;
    payloadMin?: number;
    payloadMax?: number;
    payloadSamples?: number;
    payloadDistinctLengths?: number;
    roundTripOk?: boolean;
    derivationMs?: number;
  }>;
  benchmark: Array<{
    id: string;
    label: string;
    group: string;
    role: string;
    operation: string;
    slot: string;
    samples: number;
    medianMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
    baseline: string;
  }>;
  notMeasured: Array<{ id: string; operation: string; code: string; reason: string }>;
}

export function buildRunExport(
  rows: ReadonlyMap<string, DerivedRow>,
  benchmark: BenchmarkRun | null,
  constraints: Constraints,
  pinned: readonly string[]
): RunExport {
  return {
    generatedAt: new Date().toISOString(),
    page: 'crypto-lab-pq-chooser',
    library: { name: RUNTIME_FACTS.library.name, version: RUNTIME_FACTS.library.version },
    environment: benchmark?.environment ?? null,
    constraints,
    pinned: [...pinned],
    falconSamplesPerRow: FALCON_SAMPLES,
    schemes: SCHEMES.map((scheme) => {
      const row = rows.get(scheme.id);
      const base = {
        id: scheme.id,
        label: scheme.label,
        family: scheme.family,
        kind: scheme.kind,
        nistCategory: scheme.nistCategory,
      };
      if (!row || row.state.status === 'pending' || row.state.status === 'deriving') {
        return { ...base, state: 'pending' as const };
      }
      if (row.state.status === 'unavailable') {
        return {
          ...base,
          state: 'deferred-or-unavailable' as const,
          code: row.state.code,
          cause: row.state.cause,
        };
      }
      const s = row.state.sizes;
      return {
        ...base,
        state: 'derived' as const,
        publicKeyBytes: s.publicKeyBytes,
        secretKeyBytes: s.secretKeyBytes,
        roundTripOk: s.roundTripOk,
        derivationMs: Number(s.elapsedMs.toFixed(3)),
        ...(s.payload.kind === 'fixed'
          ? { payloadKind: 'fixed' as const, payloadBytes: s.payload.bytes }
          : {
              payloadKind: 'range' as const,
              payloadMin: s.payload.min,
              payloadMax: s.payload.max,
              payloadSamples: s.payload.samples,
              payloadDistinctLengths: s.payload.distinct,
            }),
      };
    }),
    benchmark: (benchmark?.rows ?? []).flatMap((row) =>
      row.operations.map((op) => ({
        id: row.id,
        label: row.label,
        group: row.group,
        role: row.role,
        operation: op.operation,
        slot: op.slot,
        samples: op.summary.n,
        medianMs: Number(op.summary.median.toFixed(4)),
        p95Ms: Number(op.summary.p95.toFixed(4)),
        minMs: Number(op.summary.min.toFixed(4)),
        maxMs: Number(op.summary.max.toFixed(4)),
        baseline: benchmark!.baselineByRole[row.role],
      }))
    ),
    notMeasured: (benchmark?.rows ?? []).flatMap((row) =>
      row.unmeasured.map((u) => ({ id: row.id, operation: u.operation, code: u.code, reason: u.cause }))
    ),
  };
}

const csvCell = (value: unknown): string => {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Two tables in one file, separated by a blank line and a section header.
 *
 * Sizes and timings have different shapes, and forcing them into one wide row
 * would produce a file full of empty cells. A spreadsheet opens this and shows
 * two blocks, which is what they are.
 */
export function toCSV(run: RunExport): string {
  const lines: string[] = [];
  lines.push(`# crypto-lab-pq-chooser,${run.generatedAt},${run.library.name} ${run.library.version}`);
  if (run.environment) {
    lines.push(
      `# environment,${csvCell(`${run.environment.browser} ${run.environment.browserVersion}`)},${csvCell(run.environment.operatingSystem)},timer resolution ${run.environment.timerResolutionMs} ms,cross-origin isolated ${run.environment.crossOriginIsolated}`
    );
  } else {
    lines.push('# environment,not collected - no benchmark was run, so there are no timings to qualify');
  }

  lines.push('');
  lines.push('# derived sizes');
  lines.push(
    ['id', 'label', 'family', 'kind', 'nist_category', 'state', 'code', 'public_key_bytes', 'payload_kind', 'payload_bytes', 'payload_min', 'payload_max', 'payload_samples', 'payload_distinct_lengths', 'secret_key_bytes', 'round_trip_ok', 'derivation_ms'].join(',')
  );
  for (const s of run.schemes) {
    lines.push(
      [s.id, s.label, s.family, s.kind, s.nistCategory, s.state, s.code, s.publicKeyBytes, s.payloadKind, s.payloadBytes, s.payloadMin, s.payloadMax, s.payloadSamples, s.payloadDistinctLengths, s.secretKeyBytes, s.roundTripOk, s.derivationMs]
        .map(csvCell)
        .join(',')
    );
  }

  lines.push('');
  lines.push('# benchmark');
  lines.push(['id', 'label', 'group', 'role', 'slot', 'operation', 'samples', 'median_ms', 'p95_ms', 'min_ms', 'max_ms', 'ratio_baseline'].join(','));
  for (const b of run.benchmark) {
    lines.push([b.id, b.label, b.group, b.role, b.slot, b.operation, b.samples, b.medianMs, b.p95Ms, b.minMs, b.maxMs, b.baseline].map(csvCell).join(','));
  }

  if (run.notMeasured.length) {
    lines.push('');
    lines.push('# deliberately not measured');
    lines.push(['id', 'operation', 'code', 'reason'].join(','));
    for (const n of run.notMeasured) lines.push([n.id, n.operation, n.code, n.reason].map(csvCell).join(','));
  }

  return `${lines.join('\n')}\n`;
}

export const exportFilename = (run: RunExport, extension: 'json' | 'csv'): string =>
  `pq-chooser-${run.generatedAt.replace(/[:.]/g, '-')}.${extension}`;
