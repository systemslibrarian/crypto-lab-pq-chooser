/**
 * The matrix — this page's headline exhibit.
 *
 * The mechanism it shows is not a size. It is that the sizes APPEAR AS THEY ARE
 * COMPUTED: nineteen rows render immediately in a pending state and fill in
 * cost order, so a reader watches ML-KEM land instantly, Falcon a moment later,
 * and SLH-DSA-192s still measuring while everything else is finished. That
 * ordering teaches the s/f tradeoff before a single number is on screen, which
 * is why the slow sets are derived last rather than in parallel.
 *
 * Three states are visually distinct by ICON, WORD and COLOUR — never colour
 * alone — and a fourth, `unavailable`, carries the failure code and the cause
 * on the row itself.
 *
 * A row that has not derived shows NO NUMBER. Not the published figure "just
 * until it resolves", not a zero, not a blank cell with no explanation. The
 * whole argument of this page is that a typed-in number is indistinguishable
 * from a derived one; a placeholder in a pending row would reintroduce that
 * defect at the one moment a reader has been told the measurement is missing.
 */

import { SCHEMES, CATEGORY_UNALIGNED_NOTE, type Scheme } from '../derive/schemes';
import type { DerivedRow, RowState } from '../derive/types';
import { bytes, duration, escapeHTML, noFigure } from './helpers';

/**
 * The widest wire total any row can reach, used only to scale the row bars.
 *
 * It is recomputed from the DERIVED rows on every update rather than fixed, so
 * the bars encode a real ratio between things on screen and never a ratio
 * against a number nobody measured. Until at least one row is derived there is
 * no scale and no bar is drawn.
 */
let wireScaleBytes = 0;

export function setWireScale(rows: Iterable<DerivedRow>): void {
  let max = 0;
  for (const row of rows) {
    if (row.state.status !== 'derived') continue;
    const p = row.state.sizes.payload;
    max = Math.max(max, row.state.sizes.publicKeyBytes + (p.kind === 'fixed' ? p.bytes : p.max));
  }
  wireScaleBytes = max;
}

/**
 * A bar whose length is the row's wire total as a fraction of the largest one
 * derived. Purposeful, not decorative: it encodes the two numbers printed in
 * the same row and nothing else, and it is `aria-hidden` because those numbers
 * are already there for a reader who is listening rather than looking.
 */
function wireBar(publicKeyBytes: number, payloadBytes: number): string {
  if (wireScaleBytes <= 0) return '';
  const total = publicKeyBytes + payloadBytes;
  const percent = Math.max(2, Math.round((total / wireScaleBytes) * 100));
  return `<span class="wire-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>`;
}

const STATE_TEXT: Record<RowState['status'], { icon: string; word: string; cls: string }> = {
  pending: { icon: '○', word: 'queued', cls: 'state-pending' },
  deriving: { icon: '◔', word: 'measuring…', cls: 'state-deriving' },
  derived: { icon: '✓', word: 'derived', cls: 'state-derived' },
  unavailable: { icon: '⊘', word: 'no figure', cls: 'state-unavailable' },
};

function stateCell(state: RowState): string {
  const s = STATE_TEXT[state.status];
  if (state.status === 'derived') {
    return `<span class="state ${s.cls}"><span class="state-icon" aria-hidden="true">${s.icon}</span><span>${s.word} in ${escapeHTML(duration(state.sizes.elapsedMs))}</span></span>`;
  }
  if (state.status === 'unavailable') {
    return (
      `<span class="state ${s.cls}"><span class="state-icon" aria-hidden="true">${s.icon}</span><span>${escapeHTML(state.code)}</span></span>` +
      `<span class="row-note">${escapeHTML(state.cause)}</span>`
    );
  }
  return `<span class="state ${s.cls}"><span class="state-icon" aria-hidden="true">${s.icon}</span><span>${s.word}</span></span>`;
}

/** Why this cell is empty, in the words the row is already using. */
function reasonFor(state: RowState): string {
  if (state.status === 'pending') return 'not derived yet';
  if (state.status === 'deriving') return 'being measured now';
  if (state.status === 'unavailable') return state.cause;
  return 'not derived';
}

function sizeCells(state: RowState): string {
  if (state.status !== 'derived') {
    const reason = reasonFor(state);
    // `data-cell` names each figure so a test can ask for one by meaning
    // rather than by column index -- the gate's first run read the public-key
    // cell believing it was the signature, and a positional selector will do
    // that again the first time a column is added.
    return (
      `<td class="numeric" role="cell" data-cell="public-key">${cellLabel('Public key')}${noFigure(reason)}</td>` +
      `<td class="numeric" role="cell" data-cell="payload">${cellLabel('Ciphertext / signature')}${noFigure(reason)}</td>` +
      `<td class="numeric" role="cell" data-cell="secret-key">${cellLabel('Secret key')}${noFigure(reason)}</td>`
    );
  }
  const { publicKeyBytes, secretKeyBytes, payload, roundTripOk } = state.sizes;
  const payloadCell =
    payload.kind === 'fixed'
      ? bytes(payload.bytes)
      : `${payload.min.toLocaleString('en-US')}–${bytes(payload.max)}` +
        `<span class="row-note">${payload.distinct} distinct lengths in a sample of ${payload.samples} signatures measured here \u2014 not the scheme\u2019s bounds</span>`;
  const integrity = roundTripOk
    ? ''
    : `<span class="row-note">round trip did NOT verify — treat this row as unsound</span>`;
  const barBytes = payload.kind === 'fixed' ? payload.bytes : payload.max;
  return (
    `<td class="numeric" role="cell" data-cell="public-key">${cellLabel('Public key')}${bytes(publicKeyBytes)}${wireBar(publicKeyBytes, barBytes)}</td>` +
    `<td class="numeric" role="cell" data-cell="payload" data-payload-kind="${payload.kind}">${cellLabel('Ciphertext / signature')}${payloadCell}${integrity}</td>` +
    `<td class="numeric" role="cell" data-cell="secret-key">${cellLabel('Secret key')}${bytes(secretKeyBytes)}</td>`
  );
}

/**
 * One row's cells, as a string.
 *
 * Exported and DOM-free so `table.test.ts` can assert what a `DERIVE_FAILED`
 * row actually renders. That state is not reachable from the browser — the
 * library derives all nineteen sets — so a claims-suite fixture cannot cover
 * it, and a renderer nothing exercises is a renderer nobody has read.
 */
export function renderRow(scheme: Scheme, state: RowState, pinned = false): string {
  const note = scheme.note ? `<span class="row-note">${escapeHTML(scheme.note)}</span>` : '';
  // The family marker is a colour AND the family word beside it, never colour
  // alone: it exists to group nineteen rows at a glance, not to encode a value.
  const family =
    `<span class="family-dot" data-family="${escapeHTML(scheme.family)}" aria-hidden="true"></span>` +
    escapeHTML(scheme.family);
  return (
    `<th scope="row" role="rowheader">${escapeHTML(scheme.label)}${note}` +
    `<button type="button" class="pin-btn pin-row" data-pin="${escapeHTML(scheme.id)}" aria-pressed="${pinned}">` +
    `${pinned ? 'Pinned' : 'Pin'}<span class="sr-only"> ${escapeHTML(scheme.label)} to the comparison</span></button></th>` +
    `<td role="cell">${cellLabel('Family')}${family}</td>` +
    `<td class="numeric" role="cell" data-cell="category">${cellLabel('NIST category')}${escapeHTML(scheme.nistCategory)}</td>` +
    sizeCells(state) +
    `<td role="cell" data-cell="state">${cellLabel('State')}${stateCell(state)}</td>`
  );
}

/**
 * The column name, repeated inside the cell.
 *
 * Hidden at table widths and shown when the matrix stacks into cards on a
 * phone, where there is no visible column header above the value. It is
 * `aria-hidden` because the table's own header association already supplies it
 * to a screen reader, and hearing every column name twice per row on nineteen
 * rows is worse than not having it.
 */
function cellLabel(text: string): string {
  return `<span class="cell-label" aria-hidden="true">${escapeHTML(text)}</span>`;
}

export function renderMatrix(): string {
  const rows = SCHEMES.map((scheme, i) => {
    const first = i > 0 && SCHEMES[i - 1].family !== scheme.family;
    return `<tr role="row" data-row="${escapeHTML(scheme.id)}" data-state="pending"${first ? ' class="row-group-start"' : ''}>${renderRow(
      scheme,
      { status: 'pending' }
    )}</tr>`;
  }).join('');

  return `
    <section class="card" id="matrix" aria-labelledby="matrix-h">
      <span class="eyebrow">The table</span>
      <h2 id="matrix-h">Every figure, derived in your browser</h2>
      <p class="card-lead">
        Nineteen parameter sets. Each row below is produced by calling
        <span class="mono">keygen()</span>, <span class="mono">encapsulate()</span> or
        <span class="mono">sign()</span> and reading <span class="mono">.length</span> off what came
        back. Nothing here is typed in. Sixteen derive on load in about two seconds; the three
        SLH-DSA <span class="mono">s</span> sets sign in hundreds of milliseconds to seconds each,
        so they wait until you ask — and say so on the row rather than showing a published
        figure meanwhile.
      </p>
      <div class="controls">
        <button type="button" id="derive-slow">Measure the 3 slow SLH-DSA sets</button>
        <button type="button" id="stop-slow" hidden>Stop</button>
        <p class="status-line" id="matrix-status" role="status" aria-live="polite" aria-atomic="true">
          Starting the derivation worker…
        </p>
      </div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Derived post-quantum parameter sizes, scrollable">
        <table role="table">
          <caption id="matrix-caption">${escapeHTML(CATEGORY_UNALIGNED_NOTE)}
            Secret-key sizes are the representation THIS LIBRARY returns, not a property of the
            scheme: the hybrid rows hand back a 32-byte seed the combiner expands, which is not
            comparable with an expanded key. A Falcon range is a sample over N signatures measured
            here, never the scheme’s formal bounds.</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Parameter set</th>
              <th scope="col" role="columnheader">Family</th>
              <th scope="col" role="columnheader">NIST cat.</th>
              <th scope="col" role="columnheader">Public key</th>
              <th scope="col" role="columnheader">Ciphertext / signature</th>
              <th scope="col" role="columnheader">Secret key</th>
              <th scope="col" role="columnheader">State</th>
            </tr>
          </thead>
          <tbody id="matrix-body" role="rowgroup">${rows}</tbody>
        </table>
      </div>
    </section>`;
}

export function updateMatrixRow(root: ParentNode, row: DerivedRow, pinned = false): void {
  const scheme = SCHEMES.find((s) => s.id === row.schemeId);
  // Matched by walking rather than by an escaped attribute selector: scheme ids
  // are the library's own export names, and a selector built from data is a
  // habit worth not having even where today's data is safe.
  const tr = [...root.querySelectorAll<HTMLTableRowElement>('tr[data-row]')].find(
    (candidate) => candidate.dataset.row === row.schemeId
  );
  if (!scheme || !tr) return;
  tr.innerHTML = renderRow(scheme, row.state, pinned);
  tr.dataset.state = row.state.status;
  if (row.state.status === 'unavailable') tr.dataset.code = row.state.code;
  else delete tr.dataset.code;
}

/**
 * The one sentence a screen reader is given while nineteen rows change.
 *
 * A live region per row would announce nineteen times and drown the page. One
 * atomic status line that says how far along the derivation is, and what is
 * being measured right now, carries the same information at a rate a listener
 * can use.
 */
export function matrixStatusText(rows: ReadonlyMap<string, DerivedRow>): string {
  const all = [...rows.values()];
  const derived = all.filter((r) => r.state.status === 'derived').length;
  const unavailable = all.filter((r) => r.state.status === 'unavailable');
  const active = all.find((r) => r.state.status === 'deriving');
  const label = (id: string): string => SCHEMES.find((s) => s.id === id)?.label ?? id;

  const parts = [`${derived} of ${all.length} parameter sets derived.`];
  if (unavailable.length > 0) {
    parts.push(
      `${unavailable.length} showing no figure (${unavailable.map((r) => label(r.schemeId)).join(', ')}).`
    );
  }
  if (active) parts.push(`Now measuring ${label(active.schemeId)}.`);
  else if (derived + unavailable.length === all.length) parts.push('Derivation complete.');
  return parts.join(' ');
}
