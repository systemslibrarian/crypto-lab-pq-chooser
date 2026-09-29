/**
 * TLS 1.3 wire cost, computed from the bytes the run is actually holding.
 *
 * Pick a KEM and a signature scheme. The worker generates both key pairs,
 * encapsulates, signs, concatenates the four buffers that cross the wire and
 * reads `.length` off the concatenation. This is, as far as the audit behind
 * this lab could tell, the first place in the fleet that figure is derived
 * rather than summed from published constants.
 *
 * The hybrid line is the same idea applied to the claim people quote most: a
 * hybrid key exchange costs "about three percent" more than ML-KEM alone. Here
 * that is two encapsulations and a division.
 */

import { SCHEMES } from '../derive/schemes';
import type { HandshakeCost, HybridOverhead } from '../wire/handshake';
import { FAILURE_CODES, FAILURE_CAUSES } from '../derive/codes';
import { bytes, escapeHTML } from './helpers';

const KEM_IDS = SCHEMES.filter((s) => s.kind === 'kem');
const SIG_IDS = SCHEMES.filter((s) => s.kind === 'signature');

export function renderWirePanel(): string {
  const kemOptions = KEM_IDS.map(
    (s) => `<option value="${escapeHTML(s.id)}"${s.id === 'ml_kem768' ? ' selected' : ''}>${escapeHTML(s.label)}</option>`
  ).join('');
  const sigOptions = SIG_IDS.map(
    (s) => `<option value="${escapeHTML(s.id)}"${s.id === 'ml_dsa65' ? ' selected' : ''}>${escapeHTML(s.label)}</option>`
  ).join('');

  return `
    <section class="card" id="wire" aria-labelledby="wire-h">
      <span class="eyebrow">On the wire</span>
      <h2 id="wire-h">PQ-dependent bytes in a TLS 1.3 handshake</h2>
      <p class="card-lead">
        <strong>Not a whole handshake — the part your choice of scheme changes.</strong> One key
        exchange plus one server authentication, taken from the real key share, ciphertext, public
        key and signature this page just produced. Framing, extension and cipher-suite lists, the
        certificate chain above the leaf, the X.509 wrapper, session tickets and the Finished MACs
        are all excluded; a real ClientHello is several hundred bytes before a key share is added.
        What is here is the part that moves by kilobytes when you leave X25519 and ECDSA behind.
      </p>
      <div class="controls">
        <div class="field">
          <label for="wire-kem">Key exchange</label>
          <select id="wire-kem">${kemOptions}</select>
        </div>
        <div class="field">
          <label for="wire-sig">Authentication</label>
          <select id="wire-sig">${sigOptions}</select>
        </div>
        <button type="button" class="primary" id="wire-run">Compute the handshake</button>
      </div>
      <div id="wire-output" role="status" aria-live="polite" aria-atomic="true"></div>
      <div id="wire-hybrid"></div>
    </section>`;
}

export function renderWireResult(cost: HandshakeCost): string {
  const rows = cost.parts
    .map(
      (p) =>
        `<tr><th scope="row">${escapeHTML(p.message)}</th><td>${escapeHTML(p.what)}</td><td class="numeric" data-part-bytes="${p.bytes}">${bytes(p.bytes)}</td></tr>`
    )
    .join('');
  const variable = cost.signatureVariable
    ? `<p class="card-lead">${escapeHTML(cost.sigLabel)} signatures are variable-length, so this total is one draw rather than the handshake’s size. Compute it again and the last row will move.</p>`
    : '';
  return `
    <div class="table-wrap" tabindex="0" role="region" aria-label="Handshake byte breakdown, scrollable">
      <table>
        <caption>${escapeHTML(cost.kemLabel)} for key exchange, ${escapeHTML(cost.sigLabel)} for authentication. Every figure read off a buffer this page is holding.</caption>
        <thead><tr><th scope="col">TLS message</th><th scope="col">Object</th><th scope="col">Bytes</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>length of the four buffers concatenated</td>
            <td class="numeric" data-wire-total="${cost.totalBytes}"><strong>${bytes(cost.totalBytes)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${variable}`;
}

export function renderWireError(message: string): string {
  return `<div class="verdict verdict-bad" data-wire-code="${FAILURE_CODES.WIRE_NOT_DERIVED}">
    <span class="verdict-icon" aria-hidden="true">✗</span>
    <div class="verdict-body">
      <div class="verdict-title">${FAILURE_CODES.WIRE_NOT_DERIVED}</div>
      <p class="verdict-text">${escapeHTML(FAILURE_CAUSES[FAILURE_CODES.WIRE_NOT_DERIVED])}</p>
      <p class="verdict-text"><span class="mono">${escapeHTML(message)}</span></p>
    </div>
  </div>`;
}

export function renderHybridOverhead(overhead: HybridOverhead): string {
  return `
    <h3>The hybrid question, measured</h3>
    <p class="card-lead">
      Public key plus ciphertext, for the hybrid and for its post-quantum component alone.
    </p>
    <div class="pair" data-hybrid-overhead>
      <div><span class="pair-label">${escapeHTML(overhead.hybridLabel)}</span><span class="num" data-hybrid-bytes>${bytes(overhead.hybridBytes)}</span></div>
      <div><span class="pair-label">${escapeHTML(overhead.baseLabel)}</span><span class="num" data-base-bytes>${bytes(overhead.baseBytes)}</span></div>
      <div><span class="pair-label">Difference</span><span class="num" data-overhead-bytes>${bytes(overhead.overheadBytes)}</span><span class="num" data-overhead-percent="${overhead.overheadPercent.toFixed(2)}">${overhead.overheadPercent.toFixed(2)}%</span></div>
    </div>
    <p class="card-lead">
      The classical half rides along as a concatenated share: a whole second key exchange, for a
      percentage the rest of the handshake will not notice. That is the argument for hybrid
      deployment stated as a measurement rather than as a rule of thumb.
    </p>`;
}
