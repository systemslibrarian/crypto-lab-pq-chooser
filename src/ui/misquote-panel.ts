/**
 * The "commonly misquoted numbers" panel.
 *
 * Five rows, and the panel does not grow by invention. Rows 1 to 4 are settled
 * by the derived output above — each renders what the library actually produced
 * beside the number that circulates — and row 5 is cited rather than measured,
 * because UOV is not one of the sets this page derives and a row that borrowed
 * the authority of the measured rows would be the exact defect this panel is
 * about.
 *
 * Until a row's evidence has been derived, its verdict reads "waiting on the
 * derivation". It does not fall back to the published figure. The published
 * figure is correct and would settle the argument instantly, and reaching for
 * it here would undo the only claim this page makes.
 */

import { MISQUOTE_ROWS } from '../misquote/rows';
import { resolveMisquote, type MisquoteVerdict } from '../misquote/check';
import type { DerivedRow } from '../derive/types';
import { escapeHTML } from './helpers';

const VERDICT_CLASS: Record<MisquoteVerdict['status'], string> = {
  contradicted: 'observed-contradicted',
  'confirms-misquote': 'observed-alarm',
  pending: 'observed-pending',
  'not-derivable': 'observed-cited',
};

const VERDICT_LABEL: Record<MisquoteVerdict['status'], string> = {
  contradicted: '✓ Contradicted by this page’s own output',
  'confirms-misquote': '⚠ This page’s output AGREES with the misquote — the correction above is wrong',
  pending: '○ Waiting on the derivation',
  'not-derivable': '⚠ Not derived here',
};

function verdictHtml(verdict: MisquoteVerdict): string {
  const text = verdict.observed
    ? `${VERDICT_LABEL[verdict.status]} — ${escapeHTML(verdict.observed)}`
    : `${VERDICT_LABEL[verdict.status]} — this row is settled by a parameter set that has not been derived on this device.`;
  return `<span class="observed ${VERDICT_CLASS[verdict.status]}" data-verdict="${verdict.status}">${text}</span>`;
}

export function renderMisquotePanel(): string {
  const rows = MISQUOTE_ROWS.map(
    (row) => `
      <div class="misquote" data-misquote="${row.n}">
        <p class="misquote-claim"><span class="misquote-n">${row.n}</span>“${escapeHTML(row.misquote)}”</p>
        <p>${escapeHTML(row.correction)}</p>
        <div data-verdict-slot="${row.n}">${verdictHtml({ status: 'pending', observed: '' })}</div>
        <p class="misquote-evidence">${escapeHTML(row.evidence)}</p>
      </div>`
  ).join('');

  return `
    <section class="card" id="misquote" aria-labelledby="misquote-h">
      <span class="eyebrow">Five rows, no more</span>
      <h2 id="misquote-h">Commonly misquoted numbers</h2>
      <p class="card-lead">
        Every one of these is a number that circulates and is wrong, or a shape a reader assumes
        and the data does not have. Four of the five are settled here by what the library produced
        a moment ago rather than by another table. The fifth says plainly that it was not.
      </p>
      ${rows}
    </section>`;
}

export function updateMisquotePanel(root: ParentNode, rows: ReadonlyMap<string, DerivedRow>): void {
  for (const row of MISQUOTE_ROWS) {
    const slot = [...root.querySelectorAll<HTMLElement>('[data-verdict-slot]')].find(
      (el) => el.dataset.verdictSlot === String(row.n)
    );
    if (!slot) continue;
    slot.innerHTML = verdictHtml(resolveMisquote(row, rows));
  }
}
