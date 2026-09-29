/**
 * The benchmark panel.
 *
 * Median and p95 for key generation, the producing operation and the consuming
 * one, for a selection of post-quantum sets and for X25519, ECDSA P-256 and
 * RSA-2048 — all measured by one harness, in one run, on the reader's own
 * device.
 *
 * RATIOS DO NOT CROSS ROLES. A KEM row is compared with X25519 and a signature
 * row with ECDSA P-256, and each ratio names its own baseline where it is
 * printed. Taking every ratio against X25519, as this panel first did, produced
 * arithmetic that was correct and useless: "ML-DSA-65 signs 40x slower than
 * X25519 derives" compares two operations nobody chooses between, and reads as
 * a verdict on ML-DSA.
 *
 * Three things are printed beside every figure because without them a timing is
 * not a measurement: the sample count, the clock's measured resolution, and the
 * environment block. A figure under the resolution prints as `< 0.100 ms`
 * rather than as a number — the clock is coarsened outside cross-origin
 * isolation, and a median that lands on 0.0 is an absent measurement wearing a
 * fast one's clothes.
 */

import {
  ITERATIONS,
  OPERATION_SLOTS,
  type BenchmarkRow,
  type BenchmarkRun,
  type OperationSlot,
} from '../bench/runner';
import { SCHEMES_BY_ID } from '../derive/schemes';
import { belowResolution, duration, escapeHTML } from './helpers';

/**
 * The default selection: one set from each family plus the fast SLH-DSA
 * variant, chosen so a first run finishes in a few seconds. The three `s` sets
 * are opt-in with their cost stated, because an unasked-for forty-second wait
 * is how a benchmark panel goes unread.
 */
export const DEFAULT_BENCH_SCHEMES = [
  'ml_kem768',
  'ml_kem768_x25519',
  'ml_dsa65',
  'falcon512',
  'slh_dsa_sha2_128f',
] as const;

export const SLOW_BENCH_SCHEMES = [
  'slh_dsa_sha2_128s',
  'slh_dsa_sha2_192s',
  'slh_dsa_sha2_256s',
] as const;

const SLOT_HEADING: Record<OperationSlot, string> = {
  keygen: 'keygen',
  produce: 'encapsulate / sign',
  consume: 'decapsulate / verify',
};

export function renderBenchPanel(): string {
  const listed = DEFAULT_BENCH_SCHEMES.map((id) => SCHEMES_BY_ID.get(id)?.label ?? id).join(', ');
  return `
    <section class="card" id="bench" aria-labelledby="bench-h">
      <span class="eyebrow">Your device, this run</span>
      <h2 id="bench-h">Benchmarks, beside the classical baselines</h2>
      <p class="card-lead">
        ${escapeHTML(listed)}, plus X25519, ECDSA P-256 and RSA-2048, measured by one harness in
        one run. Warm-up iterations are discarded and every remaining sample is timed
        individually, so what you get is a distribution rather than a total divided by a count.
      </p>
      <p class="card-lead">
        Sample counts differ by cost class and are printed on every row:
        ${ITERATIONS.cheap.measured} measured samples for cheap operations,
        ${ITERATIONS.moderate.measured} for moderate, ${ITERATIONS.slow.measured} for the slow
        SLH-DSA sets. A median over three samples and a median over thirty are different claims,
        and a table that hides which is which has made them look the same.
      </p>
      <div class="controls">
        <div class="check-row">
          <input type="checkbox" id="bench-slow" />
          <label for="bench-slow">Include the slow SLH-DSA sets (adds roughly 20–40 seconds)</label>
        </div>
        <button type="button" class="primary" id="bench-run">Run the benchmark</button>
      </div>
      <p class="status-line" id="bench-progress" role="status" aria-live="polite" aria-atomic="true"></p>
      <div id="bench-output"></div>
      <h3>Take this run with you</h3>
      <p class="card-lead">
        A figure from this page cannot be quoted without the run that produced it, so the run is
        exportable: library version, environment, clock resolution, sample counts, which sets were
        derived and which were not and why. The link carries your constraints and pins — never a
        derived figure, so the other browser derives its own.
      </p>
      <div class="controls">
        <button type="button" id="export-json">Download run (JSON)</button>
        <button type="button" id="export-csv">Download run (CSV)</button>
        <button type="button" id="copy-link">Copy a link to this shortlist</button>
      </div>
    </section>`;
}

function environmentBlock(run: BenchmarkRun): string {
  const e = run.environment;
  const rows: Array<[string, string]> = [
    ['Browser', `${e.browser} ${e.browserVersion}`],
    ['Operating system', e.operatingSystem],
    ['Logical processors', e.logicalProcessors > 0 ? String(e.logicalProcessors) : 'not reported'],
    ['Timer source', e.timerSource],
    ['Timer resolution', `${e.timerResolutionMs.toFixed(4)} ms`],
    ['Cross-origin isolated', e.crossOriginIsolated ? 'yes' : 'no'],
    ['Library', `${e.library} ${e.libraryVersion}`],
    ['Run took', duration(run.totalMs)],
    ['Timestamp (UTC)', e.timestamp],
  ];
  return `
    <h3>Environment</h3>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Benchmark environment, scrollable">
      <table id="bench-environment">
        <caption>The browser, machine, clock and library version these measurements were taken with. A timing without this block is a number, not a measurement.</caption>
        <thead><tr><th scope="col">Property</th><th scope="col">Value</th></tr></thead>
        <tbody>
          ${rows
            .map(([label, value]) => `<tr><th scope="row">${escapeHTML(label)}</th><td>${escapeHTML(value)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </div>`;
}

interface Baseline {
  /** The row this ratio is taken against, or null when this row IS that row. */
  median: number | null;
  label: string;
}

function cell(row: BenchmarkRow, slot: OperationSlot, resolution: number, baseline: Baseline): string {
  const op = row.operations.find((o) => o.slot === slot);
  if (!op) {
    const missing = row.unmeasured.find((u) => u.slot === slot);
    if (missing) {
      return `<td class="numeric" data-bench-code="${escapeHTML(missing.code)}"><span class="state state-unavailable"><span class="state-icon" aria-hidden="true">⊘</span><span>not measured</span></span><span class="row-note">${escapeHTML(missing.cause)}</span></td>`;
    }
    return `<td class="numeric"><span class="sr-only">not measured</span><span aria-hidden="true">—</span></td>`;
  }
  const s = op.summary;
  // The baseline is NAMED on every cell. A bare "3.1x" in a table with two
  // baselines is a number whose meaning depends on which row you are reading.
  const ratio =
    baseline.median === null
      ? `<span class="row-note">the baseline for ${row.role === 'kem' ? 'key agreement' : 'signatures'}</span>`
      : baseline.median > 0 && !belowResolution(s.median, resolution)
        ? `<span class="row-note" data-ratio-baseline="${escapeHTML(baseline.label)}">${(s.median / baseline.median).toFixed(1)}× ${escapeHTML(baseline.label)}</span>`
        : '';
  return `<td class="numeric" data-op="${escapeHTML(op.operation)}">
    ${escapeHTML(duration(s.median, resolution))}
    <span class="row-note">p95 ${escapeHTML(duration(s.p95, resolution))} · n=${s.n} · ${escapeHTML(op.operation)}</span>
    ${ratio}
  </td>`;
}

export function renderBenchResult(run: BenchmarkRun): string {
  const resolution = run.environment.timerResolutionMs;
  const baselineRow = (row: BenchmarkRow): BenchmarkRow | undefined =>
    run.rows.find((r) => r.id === run.baselineByRole[row.role]);

  const baselineFor = (row: BenchmarkRow, slot: OperationSlot): Baseline => {
    const against = baselineRow(row);
    const label = against?.label ?? run.baselineByRole[row.role];
    // A row is not compared with itself.
    if (!against || against.id === row.id) return { median: null, label };
    return { median: against.operations.find((o) => o.slot === slot)?.summary.median ?? null, label };
  };

  const body = run.rows
    .map((row) => {
      if (row.unsupportedReason && row.operations.length === 0) {
        return `<tr data-bench-row="${escapeHTML(row.id)}"><th scope="row">${escapeHTML(row.label)}</th><td colspan="3"><span class="state state-unavailable"><span class="state-icon" aria-hidden="true">⊘</span><span>unavailable</span></span><span class="row-note">${escapeHTML(row.unsupportedReason)}</span></td></tr>`;
      }
      const cells = OPERATION_SLOTS.map((slot) => cell(row, slot, resolution, baselineFor(row, slot))).join('');
      const roleWord = row.role === 'kem' ? 'key agreement' : 'signature';
      const kind =
        row.group === 'classical'
          ? run.baselineByRole[row.role] === row.id
            ? `classical baseline for ${roleWord}`
            : `classical ${roleWord} reference`
          : `post-quantum ${roleWord}`;
      return `<tr data-bench-row="${escapeHTML(row.id)}" data-group="${row.group}" data-role="${row.role}"><th scope="row">${escapeHTML(row.label)}<span class="row-note">${kind} · ${row.warmupIterations} warm-up</span></th>${cells}</tr>`;
    })
    .join('');

  return `
    <div class="table-wrap" tabindex="0" role="region" aria-label="Benchmark results, scrollable">
      <table id="bench-table">
        <caption>
          Median per operation, with p95 and the sample count beside it. Every ratio is against
          the classical primitive that fills the SAME role, measured in this same run: key
          agreement against X25519, signatures against ECDSA P-256, with RSA-2048 present as a
          second signature reference rather than as a baseline. Each ratio names the row it is
          taken against. This is a measurement of your device in this browser on this run —
          not a hardware ranking, and not a security ranking.
        </caption>
        <thead>
          <tr>
            <th scope="col">Scheme</th>
            ${OPERATION_SLOTS.map((s) => `<th scope="col">${escapeHTML(SLOT_HEADING[s])}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${environmentBlock(run)}`;
}
