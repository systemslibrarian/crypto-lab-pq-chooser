/**
 * Break it yourself: claim a number and let the library answer.
 *
 * Pick a parameter set, pick public key or ciphertext/signature, type the byte
 * count you believe, and press the button. The verdict is a comparison against
 * what `keygen()` or `sign()` produced in this browser — not against a table.
 *
 * The interesting failure is the one a reader has to go looking for. Skip the
 * slow sets, then point this at SLH-DSA-192s: the page refuses to answer,
 * naming `CLAIM_NOT_DERIVED`, because the only thing it could answer with is
 * the published constant. That refusal is the page's thesis with the comfort
 * removed.
 */

import { SCHEMES } from '../derive/schemes';
import { checkClaim, type ClaimField } from '../misquote/check';
import type { DerivedRow } from '../derive/types';
import { escapeHTML } from './helpers';

export function renderClaimPanel(): string {
  // The panel opens on the claim the misquote panel's first row is about, so
  // the shipped default is a real argument rather than an empty form: ML-DSA-65
  // and the Round-3 signature size that is still quoted for it.
  const options = SCHEMES.map(
    (s) =>
      `<option value="${escapeHTML(s.id)}"${s.id === 'ml_dsa65' ? ' selected' : ''}>${escapeHTML(s.label)}</option>`
  ).join('');

  return `
    <section class="card" id="claim" aria-labelledby="claim-h">
      <span class="eyebrow">Break it yourself</span>
      <h2 id="claim-h">Claim a size, and let the real library answer</h2>
      <p class="card-lead">
        Type the byte count you think is right. The answer comes from the same
        <span class="mono">@noble/post-quantum</span> call that filled the table above, so a claim
        that disagrees with it disagrees with running code rather than with a footnote.
      </p>
      <div class="controls">
        <div class="field">
          <label for="claim-scheme">Parameter set</label>
          <select id="claim-scheme">${options}</select>
        </div>
        <div class="field">
          <label for="claim-field">Figure</label>
          <select id="claim-field">
            <option value="payload">ciphertext / signature</option>
            <option value="publicKey">public key</option>
          </select>
        </div>
        <div class="field">
          <label for="claim-bytes">Claimed size in bytes</label>
          <input id="claim-bytes" type="text" inputmode="numeric" value="3293" size="10" />
        </div>
        <button type="button" class="primary" id="claim-run">Check it</button>
      </div>
      <div id="claim-output" role="status" aria-live="polite" aria-atomic="true"></div>
    </section>`;
}

export function renderClaimResult(
  schemeId: string,
  field: ClaimField,
  claimedText: string,
  rows: ReadonlyMap<string, DerivedRow>
): string {
  const result = checkClaim(schemeId, field, claimedText, rows);
  if (result.outcome === 'confirmed') {
    return `<div class="verdict verdict-ok" data-claim-outcome="confirmed">
      <span class="verdict-icon" aria-hidden="true">✓</span>
      <div class="verdict-body">
        <div class="verdict-title">MATCHES WHAT RAN</div>
        <p class="verdict-text">${escapeHTML(result.message)}</p>
      </div>
    </div>`;
  }
  return `<div class="verdict verdict-bad" data-claim-outcome="failed" data-claim-code="${escapeHTML(result.code ?? '')}">
    <span class="verdict-icon" aria-hidden="true">✗</span>
    <div class="verdict-body">
      <div class="verdict-title">${escapeHTML(result.code ?? 'FAILED')}</div>
      <p class="verdict-text">${escapeHTML(result.message)}</p>
      <p class="verdict-text"><span class="mono">${escapeHTML(result.cause ?? '')}</span></p>
    </div>
  </div>`;
}
