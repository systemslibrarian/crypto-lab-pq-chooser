/**
 * The derivation log.
 *
 * The table shows WHAT was derived; this shows WHEN, and that is the second
 * half of the headline mechanism. Entries arrive in completion order with the
 * elapsed cost beside them and a bar whose length encodes that cost — so the
 * nine cheap sets land in a cluster at the top, Falcon's key generation shows
 * as a visible step, and the three SLH-DSA `s` rows sit at the bottom with bars
 * an order of magnitude longer than anything above them.
 *
 * That bar is the one graphic on this page, and it draws exactly the number
 * printed next to it. It is not an indicator of progress and it does not move
 * on its own.
 *
 * The list is wrapped in its own scroll region rather than scrolling itself.
 * Nineteen entries overflow sixteen rems, and a scrolling container holding no
 * focusable content is unreachable from the keyboard (WCAG 2.1.1) unless it is
 * a focus target in its own right — which axe has no rule for and the gate
 * caught on the first full drive. Putting `tabindex` on the `<ol>` would have
 * worked too and would have meant an element that is both a list and a focus
 * target; a wrapper keeps the list's semantics untouched.
 */

import type { DerivationEvent } from '../derive/types';
import { duration, escapeHTML } from './helpers';

export function renderLogPanel(): string {
  return `
    <details id="log-panel">
      <summary>Derivation log — what finished, when, and how long it took</summary>
      <p class="card-lead">
        Completion order, not table order. The bar is drawn from the millisecond figure beside
        it, scaled against the slowest entry so far. An SLH-DSA <span class="mono">s</span> row
        next to its <span class="mono">f</span> row is the whole s/f tradeoff in one picture,
        measured on this device.
      </p>
      <div class="log-wrap" tabindex="0" role="region" aria-label="Derivation log, scrollable">
        <ol class="log" id="log-list" role="list">
          <li role="listitem" class="log-empty" id="log-empty">Nothing has finished deriving yet.</li>
        </ol>
      </div>
    </details>`;
}

export function renderLog(list: HTMLElement, events: readonly DerivationEvent[]): void {
  if (events.length === 0) return;
  const slowest = Math.max(...events.map((e) => e.elapsedMs), 1);
  list.innerHTML = events
    .map((e) => {
      const widthPercent = Math.max(2, Math.round((e.elapsedMs / slowest) * 100));
      const outcome =
        e.outcome === 'derived'
          ? escapeHTML(duration(e.elapsedMs))
          : e.outcome === 'skipped'
            ? 'skipped by you'
            : 'failed to derive';
      const bar =
        e.outcome === 'derived'
          ? `<span class="cost-bar" style="width:${widthPercent}%" aria-hidden="true"></span>`
          : '';
      return `<li role="listitem" data-log-scheme="${escapeHTML(e.schemeId)}" data-outcome="${escapeHTML(e.outcome)}">
        <span>${escapeHTML(e.label)}${bar}</span>
        <span class="log-when">${outcome} · at ${escapeHTML(duration(e.atMs))}</span>
      </li>`;
    })
    .join('');
}
