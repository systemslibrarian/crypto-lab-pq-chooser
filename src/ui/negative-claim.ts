/**
 * What this table cannot see — the negative-claim fixture.
 *
 * Every other panel on this page reports a success. This one reaches a state in
 * which every check the page performs reports success AND the property a reader
 * would assume is being violated, and then says so.
 *
 * The verdict deliberately reads as both at once: DECAPSULATED, AND WRONG. That
 * is the shape to aim for, because a state where everything is green and the
 * answer is still wrong is the only way to show the limit of a page made of
 * measurements. If any check here ever fails, the fixture has stopped
 * demonstrating a limit and started demonstrating the mechanism working — and
 * the claims suite fails on exactly that.
 */

import type { KemFixtureResult } from '../derive/kem-fixture';
import { NEGATIVE_CLAIM } from '../derive/kem-fixture';
import { FAILURE_CODES } from '../derive/codes';
import { bytes, escapeHTML } from './helpers';

export function renderNegativeClaimPanel(): string {
  return `
    <section class="card" id="negative" aria-labelledby="negative-h">
      <span class="eyebrow">The limit</span>
      <h2 id="negative-h">What this table cannot see</h2>
      <p class="card-lead">
        Sizes are derived. Timings are measured. Round trips are checked. None of those three can
        tell you whether an implementation leaks its key through power draw, or whether a
        decapsulation that returned cleanly returned the right thing. Press the button and watch
        every check on this page pass while the answer is wrong.
      </p>
      <div class="controls">
        <button type="button" class="primary" id="fixture-run">Corrupt one ciphertext byte and decapsulate</button>
        <button type="button" id="fixture-again" disabled>Try a different byte</button>
      </div>
      <div id="fixture-output" role="status" aria-live="polite" aria-atomic="true"></div>
    </section>`;
}

export function renderFixture(result: KemFixtureResult): string {
  const checks = result.checks
    .map(
      (c) =>
        `<li role="listitem" class="${c.passed ? 'check-pass' : 'check-fail'}" data-check="${c.passed ? 'pass' : 'fail'}">
          <span class="check-mark" aria-hidden="true">${c.passed ? '✓' : '✗'}</span>
          <span><strong>${escapeHTML(c.label)}</strong><span class="sr-only">: ${c.passed ? 'passed' : 'failed'}</span>
          <span class="check-observed">${escapeHTML(c.observed)}</span></span>
        </li>`
    )
    .join('');

  const verdictTone = result.secretsMatch ? 'verdict-ok' : 'verdict-alarm';
  const verdictTitle = result.secretsMatch
    ? 'DECAPSULATED — AND CORRECT'
    : 'DECAPSULATED — AND WRONG';
  const verdictText = result.secretsMatch
    ? 'The corrupted ciphertext produced the sender’s shared secret, which ML-KEM should not do. Something about this fixture is broken, and the panel is saying so rather than asserting the lesson it was built for.'
    : `Byte ${result.flippedByteIndex} of a ${result.cipherTextBytes}-byte ciphertext was changed from 0x${result.flippedFrom.toString(16).padStart(2, '0')} to 0x${result.flippedTo.toString(16).padStart(2, '0')} — one bit. ${result.kemLabel} returned a full-length shared secret and raised nothing. It is not the sender’s secret.`;

  return `
    <ul class="checklist" role="list" data-fixture-checks>${checks}</ul>

    <div class="pair">
      <div><span class="pair-label">Ciphertext</span><span class="num">${bytes(result.cipherTextBytes)}, one byte changed</span></div>
      <div><span class="pair-label">Sender’s shared secret</span><span class="num" data-honest-secret>${escapeHTML(result.honestSecretPrefix)} …</span></div>
      <div><span class="pair-label">What decapsulation returned</span><span class="num" data-recovered-secret>${escapeHTML(result.recoveredSecretPrefix)} …</span></div>
      <div><span class="pair-label">Error raised</span><span class="num" data-error-code="${result.raisedNoError ? FAILURE_CODES.KEM_NO_FAILURE_CODE : 'threw'}">${result.raisedNoError ? 'none' : 'an exception'}</span></div>
    </div>

    <div class="verdict ${verdictTone}" data-fixture-verdict="${result.secretsMatch ? 'match' : 'mismatch'}">
      <span class="verdict-icon" aria-hidden="true">⚠</span>
      <div class="verdict-body">
        <div class="verdict-title">${verdictTitle}</div>
        <p class="verdict-text">${escapeHTML(verdictText)}</p>
      </div>
    </div>

    <p class="negative-claim" data-negative-claim>${escapeHTML(NEGATIVE_CLAIM)}</p>

    <p class="card-lead">
      There is no failure code to show you here, and inventing one to look thorough would teach
      the opposite of the lesson. ML-KEM’s implicit rejection is deliberate and correct — FIPS 203
      specifies it, and a protocol built on ML-KEM notices the corruption the moment it tries to
      use the derived key in an AEAD. What it means is that the KEM is not where the detection
      lives, and a table of sizes and timings is the last place that would tell you.
    </p>`;
}
