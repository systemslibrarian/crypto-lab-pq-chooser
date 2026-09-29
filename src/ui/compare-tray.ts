/**
 * The comparison tray: two or three schemes, side by side, with provenance.
 *
 * NO COMPOSITE SCORE, deliberately. A single number per column would answer the
 * question the page exists to complicate — the tradeoff between bytes, speed
 * and assumption IS the lesson, and collapsing it produces a ranking whose
 * weights nobody stated and nobody can check.
 *
 * Every cell carries where its value came from: derived here, measured here,
 * deferred, skipped, or unavailable. A tray that showed a byte count without
 * saying which of those it was would be the inherited-figure problem in a
 * smaller box.
 */

import { SCHEMES_BY_ID } from '../derive/schemes';
import type { DerivedRow } from '../derive/types';
import type { BenchmarkRun, OperationSlot } from '../bench/runner';
import { bytes, duration, escapeHTML } from './helpers';

export const MAX_PINNED = 3;

const PROVENANCE_LABEL: Record<string, string> = {
  derived: 'derived here',
  measured: 'measured here',
  pending: 'not derived yet',
  unavailable: 'no figure',
};

function provenanceChip(kind: keyof typeof PROVENANCE_LABEL): string {
  return `<span class="provenance provenance-${kind}">${escapeHTML(PROVENANCE_LABEL[kind])}</span>`;
}

interface Column {
  schemeId: string;
  label: string;
  cells: Record<string, string>;
}

const SLOT_LABEL: Record<OperationSlot, string> = {
  keygen: 'keygen (median)',
  produce: 'encapsulate / sign (median)',
  consume: 'decapsulate / verify (median)',
};

const ROW_ORDER = [
  'Role',
  'Family',
  'NIST category (its own claim)',
  'Public key',
  'Ciphertext / signature',
  'Secret key (as this library returns it)',
  'Bytes on the wire',
  SLOT_LABEL.keygen,
  SLOT_LABEL.produce,
  SLOT_LABEL.consume,
  'Against it',
] as const;

function buildColumn(
  schemeId: string,
  rows: ReadonlyMap<string, DerivedRow>,
  benchmark: BenchmarkRun | null,
  caveat: string
): Column | null {
  const scheme = SCHEMES_BY_ID.get(schemeId);
  if (!scheme) return null;
  const cells: Record<string, string> = {};
  cells.Role = scheme.kind === 'kem' ? 'key exchange' : 'signature';
  cells.Family = scheme.family;
  cells['NIST category (its own claim)'] = scheme.nistCategory;

  const row = rows.get(schemeId);
  if (row && row.state.status === 'derived') {
    const s = row.state.sizes;
    const payload =
      s.payload.kind === 'fixed'
        ? bytes(s.payload.bytes)
        : `${s.payload.min.toLocaleString('en-US')}–${bytes(s.payload.max)} <span class="row-note">${s.payload.distinct} lengths in ${s.payload.samples} signatures</span>`;
    const wire = s.publicKeyBytes + (s.payload.kind === 'fixed' ? s.payload.bytes : s.payload.max);
    cells['Public key'] = `${bytes(s.publicKeyBytes)} ${provenanceChip('derived')}`;
    cells['Ciphertext / signature'] = `${payload} ${provenanceChip('derived')}`;
    cells['Secret key (as this library returns it)'] = `${bytes(s.secretKeyBytes)} ${provenanceChip('derived')}`;
    cells['Bytes on the wire'] = `${bytes(wire)} ${provenanceChip('derived')}`;
  } else {
    const why = row && row.state.status === 'unavailable' ? row.state.cause : 'not derived yet';
    const cell = `<span class="sr-only">${escapeHTML(why)}</span><span aria-hidden="true">—</span> ${provenanceChip(
      row && row.state.status === 'unavailable' ? 'unavailable' : 'pending'
    )}`;
    for (const key of ['Public key', 'Ciphertext / signature', 'Secret key (as this library returns it)', 'Bytes on the wire']) {
      cells[key] = cell;
    }
  }

  const benchRow = benchmark?.rows.find((r) => r.id === schemeId);
  for (const slot of ['keygen', 'produce', 'consume'] as OperationSlot[]) {
    const op = benchRow?.operations.find((o) => o.slot === slot);
    cells[SLOT_LABEL[slot]] = op
      ? `${escapeHTML(duration(op.summary.median, benchmark?.environment.timerResolutionMs ?? 0))} <span class="row-note">n=${op.summary.n} · ${escapeHTML(op.operation)}</span> ${provenanceChip('measured')}`
      : `<span class="sr-only">not measured on this device</span><span aria-hidden="true">—</span> ${provenanceChip('pending')}`;
  }

  cells['Against it'] = escapeHTML(caveat);
  return { schemeId, label: scheme.label, cells };
}

export function renderCompareTray(
  pinned: readonly string[],
  rows: ReadonlyMap<string, DerivedRow>,
  benchmark: BenchmarkRun | null,
  caveats: ReadonlyMap<string, string>
): string {
  if (pinned.length === 0) {
    return `<p class="status-line" data-tray-state="empty">
      Nothing pinned. Pin up to ${MAX_PINNED} from the shortlist above or the matrix below, and they appear here side by side.
    </p>`;
  }

  const columns = pinned
    .map((id) => buildColumn(id, rows, benchmark, caveats.get(id) ?? 'See the implementation-risk table below.'))
    .filter((c): c is Column => c !== null);

  const head = columns
    .map(
      (col) =>
        `<th scope="col">${escapeHTML(col.label)}<button type="button" class="unpin-btn" data-unpin="${escapeHTML(col.schemeId)}" aria-label="Remove ${escapeHTML(col.label)} from the comparison">Remove</button></th>`
    )
    .join('');

  const body = ROW_ORDER.map(
    (key) =>
      `<tr><th scope="row">${escapeHTML(key)}</th>${columns
        .map((col) => `<td data-compare-cell="${escapeHTML(key)}">${col.cells[key] ?? '—'}</td>`)
        .join('')}</tr>`
  ).join('');

  return `
    <div class="table-wrap" tabindex="0" role="region" aria-label="Pinned comparison, scrollable" data-tray-state="filled">
      <table>
        <caption>
          Side by side, with where each value came from. There is deliberately no overall score:
          the tradeoff between bytes, speed and assumption is the thing being compared, and one
          number would hide it behind weights nobody stated.
        </caption>
        <thead><tr><th scope="col">Property</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export function renderComparePanel(): string {
  return `
    <section class="card" id="compare" aria-labelledby="compare-h">
      <span class="eyebrow">Step two</span>
      <h2 id="compare-h">Compare what you pinned</h2>
      <div id="compare-tray" aria-live="polite"></div>
    </section>`;
}
