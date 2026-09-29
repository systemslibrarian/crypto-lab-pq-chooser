/**
 * Wiring. Renders the page, starts the derivation worker, and routes the
 * worker's stream into the panels that consume it.
 *
 * No cryptography happens on this thread. Every byte count, handshake total and
 * benchmark sample below arrived over a `postMessage` boundary from
 * `src/derive/worker.ts`.
 */

import './style.css';

import { DeriveClient } from './derive/client';
import { SLOW_SCHEME_IDS } from './derive/schemes';
import { FAILURE_CAUSES, FAILURE_CODES } from './derive/codes';
import type { DerivationEvent, DerivedRow } from './derive/types';
import type { ClaimField } from './misquote/check';

import { matrixStatusText, renderMatrix, updateMatrixRow } from './ui/table';
import { renderLog, renderLogPanel } from './ui/log';
import { renderMisquotePanel, updateMisquotePanel } from './ui/misquote-panel';
import { renderClaimPanel, renderClaimResult } from './ui/claim-panel';
import { renderHybridOverhead, renderWireError, renderWirePanel, renderWireResult } from './ui/wire-panel';
import {
  DEFAULT_BENCH_SCHEMES,
  SLOW_BENCH_SCHEMES,
  renderBenchPanel,
  renderBenchResult,
} from './ui/bench-panel';
import { renderFixture, renderNegativeClaimPanel } from './ui/negative-claim';
import {
  renderFooter,
  renderHero,
  renderIntro,
  renderRelated,
  renderRiskPanel,
  renderScope,
} from './ui/static-sections';
import { qs } from './ui/helpers';
import { newRetireState, onInputsChanged, recordVerdict, retiredNotice } from './ui/retire';

function requireElement(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found;
}

const app = requireElement('app');

app.innerHTML = `
  <div class="wrap">
    <main>
      ${renderHero()}
      ${renderIntro()}
      ${renderMatrix()}
      ${renderLogPanel()}
      ${renderMisquotePanel()}
      ${renderClaimPanel()}
      ${renderWirePanel()}
      ${renderBenchPanel()}
      ${renderRiskPanel()}
      ${renderNegativeClaimPanel()}
      ${renderScope()}
      ${renderRelated()}
    </main>
    ${renderFooter()}
  </div>`;

const matrixStatus = qs(app, '#matrix-status');
const logList = qs(app, '#log-list');
const skipButton = qs<HTMLButtonElement>(app, '#skip-slow');
const claimOutput = qs(app, '#claim-output');
const wireOutput = qs(app, '#wire-output');
const wireHybrid = qs(app, '#wire-hybrid');
const benchProgress = qs(app, '#bench-progress');
const benchOutput = qs(app, '#bench-output');
const fixtureOutput = qs(app, '#fixture-output');
const fixtureAgain = qs<HTMLButtonElement>(app, '#fixture-again');

/**
 * Panels that depend on derived rows are refreshed together.
 *
 * Nineteen rows arrive over several seconds and three panels read them, so
 * refreshing on every row keeps the misquote verdicts honest as the evidence
 * lands rather than settling them once at the end.
 */
function refreshDerivedPanels(): void {
  matrixStatus.textContent = matrixStatusText(client.rows);
  updateMisquotePanel(app, client.rows);
}

const client = new DeriveClient({
  onRow: (row: DerivedRow) => {
    updateMatrixRow(app, row);
    refreshDerivedPanels();
  },
  onEvent: (_event: DerivationEvent) => {
    renderLog(logList, client.events);
  },
  onMatrixDone: (totalMs: number) => {
    skipButton.disabled = true;
    matrixStatus.textContent = `${matrixStatusText(client.rows)} The whole matrix took ${
      totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)} s` : `${Math.round(totalMs)} ms`
    } in this browser.`;
  },
  onBenchmarkProgress: (done, total, label) => {
    benchProgress.textContent = `Measuring ${label} — ${done} of ${total} operations done.`;
  },
});

if (client.workerUnavailable) {
  // Fail closed and say why, on every row and in the status line. The
  // alternative -- showing published figures until real ones arrive -- is the
  // substitution this page exists to argue against.
  for (const row of client.rows.values()) updateMatrixRow(app, row);
  skipButton.disabled = true;
  matrixStatus.textContent = `${FAILURE_CODES.WORKER_UNAVAILABLE}: ${
    FAILURE_CAUSES[FAILURE_CODES.WORKER_UNAVAILABLE]
  } Nothing on this page can be derived here, so nothing is shown.`;
  updateMisquotePanel(app, client.rows);
} else {
  refreshDerivedPanels();
  client.start();
}

// ── Skip slow sets ──────────────────────────────────────────────────────────

skipButton.addEventListener('click', () => {
  client.skipSlowSets();
  skipButton.disabled = true;
  skipButton.textContent = 'Slow sets skipped';
  matrixStatus.textContent = `Skipping ${SLOW_SCHEME_IDS.length} slow parameter sets. ${matrixStatusText(
    client.rows
  )}`;
});

// ── Claim checker ───────────────────────────────────────────────────────────

const claimScheme = qs<HTMLSelectElement>(app, '#claim-scheme');
const claimField = qs<HTMLSelectElement>(app, '#claim-field');
const claimBytes = qs<HTMLInputElement>(app, '#claim-bytes');
const claimState = newRetireState();
const claimSignature = (): string => `${claimScheme.value}|${claimField.value}|${claimBytes.value.trim()}`;

qs(app, '#claim-run').addEventListener('click', () => {
  claimOutput.innerHTML = renderClaimResult(
    claimScheme.value,
    claimField.value as ClaimField,
    claimBytes.value,
    client.rows
  );
  recordVerdict(claimState, claimSignature());
});

for (const control of [claimScheme, claimField, claimBytes]) {
  const retire = (): void => {
    if (onInputsChanged(claimState, claimSignature()) === 'retire') {
      claimOutput.innerHTML = retiredNotice('what you were claiming');
    }
  };
  control.addEventListener('change', retire);
  control.addEventListener('input', retire);
}

// ── Handshake calculator ────────────────────────────────────────────────────

const wireButton = qs<HTMLButtonElement>(app, '#wire-run');
const wireKem = qs<HTMLSelectElement>(app, '#wire-kem');
const wireSig = qs<HTMLSelectElement>(app, '#wire-sig');
const wireState = newRetireState();
const wireSignature = (): string => `${wireKem.value}|${wireSig.value}`;

for (const control of [wireKem, wireSig]) {
  control.addEventListener('change', () => {
    if (onInputsChanged(wireState, wireSignature()) === 'retire') {
      wireOutput.innerHTML = retiredNotice('the schemes being priced');
    }
  });
}

wireButton.addEventListener('click', () => {
  const kemId = wireKem.value;
  const sigId = wireSig.value;
  wireButton.disabled = true;
  wireOutput.textContent = 'Generating keys, encapsulating and signing…';
  client
    .requestWire(kemId, sigId)
    .then((cost) => {
      wireOutput.innerHTML = renderWireResult(cost);
      recordVerdict(wireState, wireSignature());
    })
    .catch((err: Error) => {
      wireOutput.innerHTML = renderWireError(err.message);
    })
    .finally(() => {
      wireButton.disabled = false;
    });
});

/**
 * The hybrid overhead is computed once, unprompted, because it is the panel's
 * headline claim rather than something to go looking for. It reuses the same
 * worker route as everything else.
 */
if (!client.workerUnavailable) {
  client
    .requestHybridOverhead('ml_kem768_x25519', 'ml_kem768')
    .then((overhead) => {
      wireHybrid.innerHTML = renderHybridOverhead(overhead);
    })
    .catch(() => {
      /* The panel simply loses the hybrid block; the calculator still works. */
    });
}

// ── Benchmark ───────────────────────────────────────────────────────────────

const benchButton = qs<HTMLButtonElement>(app, '#bench-run');
benchButton.addEventListener('click', () => {
  const includeSlow = qs<HTMLInputElement>(app, '#bench-slow').checked;
  const ids = includeSlow
    ? [...DEFAULT_BENCH_SCHEMES, ...SLOW_BENCH_SCHEMES]
    : [...DEFAULT_BENCH_SCHEMES];
  benchButton.disabled = true;
  benchOutput.innerHTML = '';
  benchProgress.textContent = 'Warming up…';
  client
    .requestBenchmark(ids)
    .then((run) => {
      benchOutput.innerHTML = renderBenchResult(run);
      benchProgress.textContent = `Done. ${run.rows.length} rows measured on this device.`;
    })
    .catch((err: Error) => {
      benchProgress.textContent = `The benchmark did not run: ${err.message}`;
    })
    .finally(() => {
      benchButton.disabled = false;
    });
});

// ── The negative-claim fixture ──────────────────────────────────────────────

let flipIndex = 17;
const fixtureButton = qs<HTMLButtonElement>(app, '#fixture-run');

function runFixture(): void {
  fixtureButton.disabled = true;
  fixtureAgain.disabled = true;
  client
    .requestKemFixture(flipIndex)
    .then((result) => {
      fixtureOutput.innerHTML = renderFixture(result);
      fixtureAgain.disabled = false;
    })
    .catch((err: Error) => {
      fixtureOutput.textContent = `The fixture did not run: ${err.message}`;
    })
    .finally(() => {
      fixtureButton.disabled = false;
    });
}

fixtureButton.addEventListener('click', runFixture);
fixtureAgain.addEventListener('click', () => {
  // A different byte, every time. Four presses establish this is the mechanism
  // rather than a coincidence of where the first one landed.
  flipIndex = (flipIndex * 7 + 13) % 1021;
  runFixture();
});
