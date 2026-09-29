/**
 * Wiring, and the golden path.
 *
 * THE ORDER OF THIS PAGE IS AN ARGUMENT. It used to open with a long
 * explanation and a nineteen-row table, which meant a visitor's first question
 * was "can I trust these numbers?" — a good question, answered at length,
 * before they had any reason to care. The order now is:
 *
 *   1. what this is, in three sentences
 *   2. choose a role, set constraints, get a shortlist   <- first viewport
 *   3. compare what you pinned
 *   4. measure: handshake bytes, and a real benchmark
 *   5. the full matrix, and every exhibit behind the shortlist
 *
 * so the first question becomes "given my constraints, which two should I
 * investigate, and what is the evidence?" — and all the evidence is still
 * there, at the same rigour, further down.
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
import type { BenchmarkRun } from './bench/runner';
import type { ClaimField } from './misquote/check';
import { chooseSchemes, ROLE_NOTE, type Constraints, type Role } from './choose/rules';
import { decodeShareState, shareUrl } from './share/url-state';
import { buildRunExport, exportFilename, toCSV } from './export/run-export';

import { matrixStatusText, renderMatrix, setWireScale, updateMatrixRow } from './ui/table';
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
import { renderCannotDecide, renderChooserPanel, renderShortlist } from './ui/chooser-panel';
import { MAX_PINNED, renderComparePanel, renderCompareTray } from './ui/compare-tray';
import {
  renderFooter,
  renderHero,
  renderIntroLong,
  renderRelated,
  renderRiskPanel,
  renderScope,
  renderSectionNav,
} from './ui/static-sections';
import { qs } from './ui/helpers';
import { newRetireState, onInputsChanged, recordVerdict, retiredNotice } from './ui/retire';

function requireElement(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing #${id}`);
  return found;
}

const app = requireElement('app');

// ── State the page owns ─────────────────────────────────────────────────────

const shared = decodeShareState(location.hash);
let constraints: Constraints = shared.constraints;
const pinned: string[] = [...shared.pinned];
let benchmark: BenchmarkRun | null = null;
let coreReady = false;

app.innerHTML = `
  <div class="wrap">
    <main>
      ${renderHero()}
      ${renderChooserPanel(constraints)}
      ${renderSectionNav()}
      ${renderComparePanel()}
      ${renderWirePanel()}
      ${renderBenchPanel()}
      ${renderMatrix()}
      ${renderLogPanel()}
      ${renderIntroLong()}
      ${renderMisquotePanel()}
      ${renderClaimPanel()}
      ${renderRiskPanel()}
      ${renderNegativeClaimPanel()}
      ${renderScope()}
      ${renderRelated()}
    </main>
    ${renderFooter()}
  </div>`;

const matrixStatus = qs(app, '#matrix-status');
const logList = qs(app, '#log-list');
const deriveSlowButton = qs<HTMLButtonElement>(app, '#derive-slow');
const stopSlowButton = qs<HTMLButtonElement>(app, '#stop-slow');
const shortlistHost = qs(app, '#shortlist');
const roleNote = qs(app, '#role-note');
const trayHost = qs(app, '#compare-tray');
const claimOutput = qs(app, '#claim-output');
const wireOutput = qs(app, '#wire-output');
const wireHybrid = qs(app, '#wire-hybrid');
const benchProgress = qs(app, '#bench-progress');
const benchOutput = qs(app, '#bench-output');
const fixtureOutput = qs(app, '#fixture-output');
const fixtureAgain = qs<HTMLButtonElement>(app, '#fixture-again');

qs(app, '#cannot-decide').innerHTML = renderCannotDecide();

/**
 * Every scheme's caveat, so the comparison tray shows the same sentence the
 * shortlist did.
 *
 * Computed with the constraints widened to admit everything, because a pinned
 * scheme may be one the current constraints exclude — a reader is allowed to
 * pin the thing they were told not to use and look at why.
 */
function caveatMap(): Map<string, string> {
  const out = new Map<string, string>();
  const wide = {
    minCategory: 1 as const,
    wireBudget: 'any' as const,
    signingFrequency: 'rare' as const,
    verificationFrequency: 'rare' as const,
    sideChannelSensitive: false,
    hybridRequired: false,
  };
  for (const role of ['kem', 'signature'] as Role[]) {
    for (const c of chooseSchemes({ ...wide, role }, client.rows, benchmark).candidates) {
      out.set(c.schemeId, c.caveat);
    }
  }
  return out;
}

function renderPins(): void {
  trayHost.innerHTML = renderCompareTray(pinned, client.rows, benchmark, caveatMap());
  // Keep every pin control on the page agreeing with the state.
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-pin]')) {
    const isPinned = pinned.includes(button.dataset.pin ?? '');
    button.setAttribute('aria-pressed', String(isPinned));
    const first = button.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) {
      first.textContent = isPinned ? 'Pinned' : button.classList.contains('pin-row') ? 'Pin' : 'Pin to compare';
    }
  }
}

function refreshShortlist(): void {
  shortlistHost.innerHTML = renderShortlist(constraints, client.rows, benchmark, new Set(pinned), coreReady);
  roleNote.textContent = ROLE_NOTE[constraints.role];
  renderPins();
}

function syncUrl(): void {
  history.replaceState(null, '', shareUrl(location.href, { constraints, pinned }));
}

function refreshDerivedPanels(): void {
  updateMisquotePanel(app, client.rows);
}

const derivedCount = (): number =>
  [...client.rows.values()].filter((r) => r.state.status === 'derived').length;

function repaintMatrix(): void {
  setWireScale(client.rows.values());
  for (const row of client.rows.values()) updateMatrixRow(app, row, pinned.includes(row.schemeId));
}

const client = new DeriveClient({
  onRow: (row: DerivedRow) => {
    setWireScale(client.rows.values());
    updateMatrixRow(app, row, pinned.includes(row.schemeId));
    matrixStatus.textContent = matrixStatusText(client.rows);
    refreshDerivedPanels();
  },
  onEvent: (_event: DerivationEvent) => {
    renderLog(logList, client.events);
  },
  onCoreReady: (coreMs: number) => {
    coreReady = true;
    // Reported SEPARATELY from "complete", because they are different claims
    // and the gap between them is eleven seconds of hash-based signing.
    matrixStatus.textContent =
      `Core comparison ready: ${derivedCount()} sets derived in ${(coreMs / 1000).toFixed(1)} s. ` +
      `${SLOW_SCHEME_IDS.length} slow SLH-DSA sets are not measured yet.`;
    repaintMatrix();
    refreshShortlist();
  },
  onMatrixDone: (totalMs: number) => {
    stopSlowButton.hidden = true;
    deriveSlowButton.hidden = true;
    matrixStatus.textContent = `${matrixStatusText(client.rows)} All sets complete after ${(totalMs / 1000).toFixed(1)} s in this browser.`;
    repaintMatrix();
    refreshShortlist();
  },
  onBenchmarkProgress: (done, total, label) => {
    benchProgress.textContent = `Measuring ${label} — ${done} of ${total} operations done.`;
  },
});

if (client.workerUnavailable) {
  // Fail closed and say why, on every row and in the status line. The
  // alternative -- showing published figures until real ones arrive -- is the
  // substitution this page exists to argue against.
  repaintMatrix();
  deriveSlowButton.disabled = true;
  matrixStatus.textContent = `${FAILURE_CODES.WORKER_UNAVAILABLE}: ${
    FAILURE_CAUSES[FAILURE_CODES.WORKER_UNAVAILABLE]
  } Nothing on this page can be derived here, so nothing is shown.`;
  refreshDerivedPanels();
  refreshShortlist();
} else {
  refreshShortlist();
  refreshDerivedPanels();
  client.start();
}

// ── The chooser ─────────────────────────────────────────────────────────────

function applyRoleVisibility(): void {
  for (const el of app.querySelectorAll<HTMLElement>('[data-role-only]')) {
    el.hidden = el.dataset.roleOnly !== constraints.role;
  }
  for (const tab of app.querySelectorAll<HTMLButtonElement>('.role-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.role === constraints.role));
  }
  shortlistHost.setAttribute('aria-labelledby', `role-${constraints.role}`);
}

for (const tab of app.querySelectorAll<HTMLButtonElement>('.role-tab')) {
  tab.addEventListener('click', () => {
    constraints = { ...constraints, role: (tab.dataset.role as Role) ?? 'kem' };
    applyRoleVisibility();
    refreshShortlist();
    syncUrl();
  });
}

const constraintSelects: Array<[string, (value: string) => Partial<Constraints>]> = [
  ['#c-category', (v) => ({ minCategory: Number(v) as Constraints['minCategory'] })],
  ['#c-wire', (v) => ({ wireBudget: v as Constraints['wireBudget'] })],
  ['#c-signing', (v) => ({ signingFrequency: v as Constraints['signingFrequency'] })],
  ['#c-verify', (v) => ({ verificationFrequency: v as Constraints['verificationFrequency'] })],
];
for (const [selector, toPatch] of constraintSelects) {
  const el = qs<HTMLSelectElement>(app, selector);
  el.addEventListener('change', () => {
    constraints = { ...constraints, ...toPatch(el.value) };
    refreshShortlist();
    syncUrl();
  });
}
for (const [selector, key] of [
  ['#c-hybrid', 'hybridRequired'],
  ['#c-sidechannel', 'sideChannelSensitive'],
] as const) {
  const el = qs<HTMLInputElement>(app, selector);
  el.addEventListener('change', () => {
    constraints = { ...constraints, [key]: el.checked };
    refreshShortlist();
    syncUrl();
  });
}

// A shared link and the form have to agree, so the controls are set from the
// decoded state rather than from the markup's defaults.
qs<HTMLSelectElement>(app, '#c-category').value = String(constraints.minCategory);
qs<HTMLSelectElement>(app, '#c-wire').value = constraints.wireBudget;
qs<HTMLSelectElement>(app, '#c-signing').value = constraints.signingFrequency;
qs<HTMLSelectElement>(app, '#c-verify').value = constraints.verificationFrequency;
qs<HTMLInputElement>(app, '#c-hybrid').checked = constraints.hybridRequired;
qs<HTMLInputElement>(app, '#c-sidechannel').checked = constraints.sideChannelSensitive;
applyRoleVisibility();

// ── Pinning, from the shortlist or from the matrix ──────────────────────────

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const pin = target?.closest<HTMLElement>('[data-pin]');
  if (pin?.dataset.pin) {
    const id = pin.dataset.pin;
    const at = pinned.indexOf(id);
    if (at >= 0) pinned.splice(at, 1);
    else {
      // Oldest out at the cap, so a third pin is never silently ignored.
      if (pinned.length >= MAX_PINNED) pinned.shift();
      pinned.push(id);
    }
    repaintMatrix();
    refreshShortlist();
    syncUrl();
    return;
  }
  const unpin = target?.closest<HTMLElement>('[data-unpin]');
  if (unpin?.dataset.unpin) {
    const at = pinned.indexOf(unpin.dataset.unpin);
    if (at >= 0) pinned.splice(at, 1);
    repaintMatrix();
    refreshShortlist();
    syncUrl();
  }
});

// ── The deferred sets, measured on request ──────────────────────────────────

deriveSlowButton.addEventListener('click', () => {
  client.deriveSlowSets();
  deriveSlowButton.disabled = true;
  deriveSlowButton.textContent = 'Measuring the slow sets…';
  stopSlowButton.hidden = false;
});

stopSlowButton.addEventListener('click', () => {
  client.stopSlowSets();
  stopSlowButton.disabled = true;
  stopSlowButton.textContent = 'Stopping…';
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
 * headline claim rather than something to go looking for.
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
      benchmark = run;
      benchOutput.innerHTML = renderBenchResult(run);
      benchProgress.textContent = `Done. ${run.rows.length} rows measured on this device — the shortlist above now orders on measured speed.`;
      refreshShortlist();
    })
    .catch((err: Error) => {
      benchProgress.textContent = `The benchmark did not run: ${err.message}`;
    })
    .finally(() => {
      benchButton.disabled = false;
    });
});

// ── Taking the run away ─────────────────────────────────────────────────────

function download(name: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

qs(app, '#export-json').addEventListener('click', () => {
  const run = buildRunExport(client.rows, benchmark, constraints, pinned);
  download(exportFilename(run, 'json'), 'application/json', JSON.stringify(run, null, 2));
});

qs(app, '#export-csv').addEventListener('click', () => {
  const run = buildRunExport(client.rows, benchmark, constraints, pinned);
  download(exportFilename(run, 'csv'), 'text/csv', toCSV(run));
});

const copyLink = qs<HTMLButtonElement>(app, '#copy-link');
copyLink.addEventListener('click', () => {
  syncUrl();
  navigator.clipboard
    ?.writeText(shareUrl(location.href, { constraints, pinned }))
    .then(() => {
      copyLink.textContent = 'Link copied';
    })
    .catch(() => {
      // Headless browsers and locked-down profiles deny the clipboard. Say so
      // rather than reporting a copy that did not happen.
      copyLink.textContent = 'Copy blocked — the link is in the address bar';
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
