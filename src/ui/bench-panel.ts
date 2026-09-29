/**
 * The benchmark panel.
 *
 * Median and p95 for key generation, the producing operation and the consuming
 * one, for a selection of post-quantum sets and for X25519, ECDSA P-256 and
 * RSA-2048 — all measured by one harness, in one run, on the reader's own
 * device. The ratio column is against X25519, which is the one operation both a
 * classical and a post-quantum handshake must perform.
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
  RATIO_BASELINE_ID,
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

function cell(row: BenchmarkRow, slot: OperationSlot, resolution: number, baselineMedian: number | null): string {
  const op = row.operations.find((o) => o.slot === slot);
  if (!op) {
    const missing = row.unmeasured.find((u) => u.slot === slot);
    if (missing) {
      return `<td class="numeric" data-bench-code="${escapeHTML(missing.code)}"><span class="state state-unavailable"><span class="state-icon" aria-hidden="true">⊘</span><span>not measured</span></span><span class="row-note">${escapeHTML(missing.cause)}</span></td>`;
    }
    return `<td class="numeric"><span class="sr-only">not measured</span><span aria-hidden="true">—</span></td>`;
  }
  const s = op.summary;
  const ratio =
    baselineMedian !== null && baselineMedian > 0 && !belowResolution(s.median, resolution)
      ? `<span class="row-note">${(s.median / baselineMedian).toFixed(1)}× X25519</span>`
      : '';
  return `<td class="numeric" data-op="${escapeHTML(op.operation)}">
    ${escapeHTML(duration(s.median, resolution))}
    <span class="row-note">p95 ${escapeHTML(duration(s.p95, resolution))} · n=${s.n} · ${escapeHTML(op.operation)}</span>
    ${ratio}
  </td>`;
}

export function renderBenchResult(run: BenchmarkRun): string {
  const resolution = run.environment.timerResolutionMs;
  const baseline = run.rows.find((r) => r.id === RATIO_BASELINE_ID);
  const baselineMedian = (slot: OperationSlot): number | null =>
    baseline?.operations.find((o) => o.slot === slot)?.summary.median ?? null;

  const body = run.rows
    .map((row) => {
      if (row.unsupportedReason && row.operations.length === 0) {
        return `<tr data-bench-row="${escapeHTML(row.id)}"><th scope="row">${escapeHTML(row.label)}</th><td colspan="3"><span class="state state-unavailable"><span class="state-icon" aria-hidden="true">⊘</span><span>unavailable</span></span><span class="row-note">${escapeHTML(row.unsupportedReason)}</span></td></tr>`;
      }
      const cells = OPERATION_SLOTS.map((slot) => cell(row, slot, resolution, baselineMedian(slot))).join('');
      return `<tr data-bench-row="${escapeHTML(row.id)}" data-group="${row.group}"><th scope="row">${escapeHTML(row.label)}<span class="row-note">${row.group === 'classical' ? 'classical baseline' : 'post-quantum'} · ${row.warmupIterations} warm-up</span></th>${cells}</tr>`;
    })
    .join('');

  return `
    <div class="table-wrap" tabindex="0" role="region" aria-label="Benchmark results, scrollable">
      <table id="bench-table">
        <caption>
          Median per operation, with p95 and the sample count beside it. Ratios are against
          X25519 measured in this same run. This is a measurement of your device in this browser
          on this run — not a hardware ranking, and not a security ranking.
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
