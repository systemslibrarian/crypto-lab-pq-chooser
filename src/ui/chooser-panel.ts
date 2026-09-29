/**
 * The chooser — the first thing on the page, and the one that has to work in
 * the first viewport.
 *
 * Everything below it is evidence. This is the join: pick a role, set the
 * constraints that actually exclude things, and get a two- or three-item
 * shortlist with the reason each one survived, the derived bytes behind it, one
 * caveat with somewhere to go and check it, and a statement of what this page
 * cannot decide at all.
 *
 * It renders a shortlist as soon as the sixteen core parameter sets are
 * derived, which is about two seconds. Before that it says it is waiting, and
 * before the benchmark has run it says device speed is not part of the ordering
 * — rather than filling either gap with a figure nobody measured.
 */

import {
  ROLE_LABEL,
  ROLE_NOTE,
  chooseSchemes,
  type Constraints,
  type Role,
  type Shortlist,
} from '../choose/rules';
import type { DerivedRow } from '../derive/types';
import type { BenchmarkRun } from '../bench/runner';
import { bytes, duration, escapeHTML } from './helpers';

const CATEGORIES = [1, 2, 3, 5] as const;

export function renderChooserPanel(c: Constraints): string {
  const roleTab = (role: Role): string =>
    `<button type="button" class="role-tab" role="tab" id="role-${role}" aria-selected="${c.role === role}"
      aria-controls="shortlist" data-role="${role}">${escapeHTML(ROLE_LABEL[role])}</button>`;

  return `
    <section class="card card-primary" id="chooser" aria-labelledby="chooser-h">
      <span class="eyebrow">Start here</span>
      <h2 id="chooser-h">Which two should you investigate?</h2>
      <p class="card-lead">
        NIST standardised several post-quantum replacements, and they trade against each other
        — small keys against large signatures, fast verification against slow signing. Tell it
        what constrains you and it shortlists two, from sizes it derives by
        <strong>running the real algorithms here</strong>.
      </p>

      <div class="role-tabs" role="tablist" aria-label="What are you choosing?">
        ${roleTab('kem')}${roleTab('signature')}
      </div>
      <p class="role-note" id="role-note">${escapeHTML(ROLE_NOTE[c.role])}</p>

      <div class="controls" id="chooser-controls">
        <div class="field">
          <label for="c-category">Minimum NIST category</label>
          <select id="c-category">
            ${CATEGORIES.map(
              (n) => `<option value="${n}"${c.minCategory === n ? ' selected' : ''}>category ${n} or better</option>`
            ).join('')}
          </select>
        </div>
        <div class="field">
          <label for="c-wire">Wire budget</label>
          <select id="c-wire">
            <option value="tight"${c.wireBudget === 'tight' ? ' selected' : ''}>tight — embedded</option>
            <option value="moderate"${c.wireBudget === 'moderate' ? ' selected' : ''}>moderate — ordinary TLS</option>
            <option value="any"${c.wireBudget === 'any' ? ' selected' : ''}>no real limit</option>
          </select>
        </div>
        <div class="field" data-role-only="signature">
          <label for="c-signing">How often you sign</label>
          <select id="c-signing">
            <option value="frequent"${c.signingFrequency === 'frequent' ? ' selected' : ''}>frequently — per request</option>
            <option value="rare"${c.signingFrequency === 'rare' ? ' selected' : ''}>rarely — per release</option>
          </select>
        </div>
        <div class="field" data-role-only="signature">
          <label for="c-verify">How often you verify</label>
          <select id="c-verify">
            <option value="frequent"${c.verificationFrequency === 'frequent' ? ' selected' : ''}>frequently</option>
            <option value="rare"${c.verificationFrequency === 'rare' ? ' selected' : ''}>rarely</option>
          </select>
        </div>
        <div class="field">
          <span class="field-legend" id="c-flags-legend">Environment</span>
          <div class="check-stack" role="group" aria-labelledby="c-flags-legend">
            <div class="check-row" data-role-only="kem">
              <input type="checkbox" id="c-hybrid"${c.hybridRequired ? ' checked' : ''} />
              <label for="c-hybrid">Must stay hybrid (a classical key exchange alongside)</label>
            </div>
            <div class="check-row" data-role-only="signature">
              <input type="checkbox" id="c-sidechannel"${c.sideChannelSensitive ? ' checked' : ''} />
              <label for="c-sidechannel">The signing key is somewhere an attacker can measure</label>
            </div>
          </div>
        </div>
      </div>

      <div id="shortlist" role="tabpanel" aria-labelledby="role-${c.role}" aria-live="polite"></div>

      <details class="chooser-scope">
        <summary>What this shortlist cannot decide</summary>
        <ul class="scope-list" id="cannot-decide"></ul>
      </details>
    </section>`;
}

function candidateCard(shortlist: Shortlist, index: number, pinned: ReadonlySet<string>): string {
  const c = shortlist.candidates[index];
  const isPinned = pinned.has(c.schemeId);
  const byteRows = c.bytes
    ? c.bytes
        .map((b) => `<div><span class="pair-label">${escapeHTML(b.label)}</span><span class="num">${bytes(b.bytes)}</span></div>`)
        .join('')
    : `<div><span class="pair-label">bytes</span><span class="num">not derived on this device</span></div>`;
  const timingRows = c.timings
    ? `<div class="pair">${c.timings
        .map(
          (t) =>
            `<div><span class="pair-label">${escapeHTML(t.operation)} (median)</span><span class="num">${escapeHTML(duration(t.medianMs))}</span></div>`
        )
        .join('')}</div>`
    : `<p class="card-lead"><em>Device speed is not part of this shortlist yet — run the benchmark below and it will be.</em></p>`;

  return `
    <article class="candidate" data-candidate="${escapeHTML(c.schemeId)}" data-rank="${index + 1}">
      <header class="candidate-head">
        <h3>${escapeHTML(c.label)}</h3>
        <span class="candidate-meta">${escapeHTML(c.family)} · category ${escapeHTML(c.nistCategory)}</span>
        <button type="button" class="pin-btn" data-pin="${escapeHTML(c.schemeId)}" aria-pressed="${isPinned}">
          ${isPinned ? 'Pinned' : 'Pin to compare'}
        </button>
      </header>
      <ul class="reasons" role="list">
        ${c.reasons.map((r) => `<li role="listitem">${escapeHTML(r)}</li>`).join('')}
      </ul>
      <div class="pair">${byteRows}</div>
      ${timingRows}
      <p class="candidate-caveat" data-caveat>
        <strong>Against it:</strong> ${escapeHTML(c.caveat)}
        ${c.evidence ? ` <a href="${escapeHTML(c.evidence.href)}" target="_blank" rel="noopener">${escapeHTML(c.evidence.label)}</a>` : ''}
      </p>
    </article>`;
}

export function renderShortlist(
  constraints: Constraints,
  rows: ReadonlyMap<string, DerivedRow>,
  benchmark: BenchmarkRun | null,
  pinned: ReadonlySet<string>,
  coreReady: boolean
): string {
  if (!coreReady) {
    return `<p class="status-line" data-shortlist-state="waiting">Deriving the core parameter sets — the shortlist appears as soon as they are in. Nothing is ranked from a published figure in the meantime.</p>`;
  }

  const list = chooseSchemes(constraints, rows, benchmark);

  if (list.candidates.length === 0) {
    return `<div class="verdict verdict-warn" data-shortlist-state="empty">
      <span class="verdict-icon" aria-hidden="true">⊘</span>
      <div class="verdict-body">
        <div class="verdict-title">NOTHING SURVIVES THESE CONSTRAINTS</div>
        <p class="verdict-text">${
          list.excluded.length
            ? `Every ${escapeHTML(ROLE_LABEL[list.role].toLowerCase())} set was excluded. The closest miss: ${escapeHTML(list.excluded[0].label)} — ${escapeHTML(list.excluded[0].because)}.`
            : 'No parameter set has been derived on this device yet.'
        }</p>
      </div>
    </div>`;
  }

  const cards = list.candidates.map((_, i) => candidateCard(list, i, pinned)).join('');
  const excluded = list.excluded.length
    ? `<details class="excluded-panel">
        <summary>${list.excluded.length} excluded, and why</summary>
        <ul class="scope-list" role="list">
          ${list.excluded
            .map((e) => `<li role="listitem"><strong>${escapeHTML(e.label)}</strong> — ${escapeHTML(e.because)}</li>`)
            .join('')}
        </ul>
      </details>`
    : '';
  const deferred = list.notDerived.length
    ? `<p class="status-line" data-not-derived>${list.notDerived.length} set${list.notDerived.length === 1 ? ' was' : 's were'} left out because nothing has derived ${list.notDerived.length === 1 ? 'it' : 'them'} on this device: ${escapeHTML(list.notDerived.join(', '))}. They are not ranked from their published figures.</p>`
    : '';

  return `
    <p class="shortlist-lead" data-shortlist-state="ready">
      ${list.candidates.length} to investigate, ordered by ${escapeHTML(list.orderedBy.join('; then '))}.
      ${list.performanceIncluded ? 'Measured device speed is part of that ordering.' : 'Device speed is <strong>not</strong> part of it — the benchmark has not run.'}
    </p>
    <div class="candidates">${cards}</div>
    ${deferred}
    ${excluded}`;
}

export function renderCannotDecide(): string {
  return chooseSchemes(
    { ...({} as Constraints), role: 'kem', minCategory: 1, hybridRequired: false, wireBudget: 'any', signingFrequency: 'rare', verificationFrequency: 'rare', sideChannelSensitive: false },
    new Map()
  )
    .cannotDecide.map((line) => `<li role="listitem">${escapeHTML(line)}</li>`)
    .join('');
}
