/**
 * The derivation worker.
 *
 * Everything cryptographic on this page happens in here. The main thread never
 * calls `@noble/post-quantum` at all — not for the table, not for the
 * handshake calculator, not for the benchmark, not for the implicit-rejection
 * fixture.
 *
 * That is not tidiness. Deriving the full matrix eagerly measured about nine
 * seconds on the machine this was written on (Apple M5 / Node 26), and over
 * seven of those seconds are the three SLH-DSA `s`-variant signatures. On the
 * main thread that is nine seconds of a page that does not scroll, does not
 * respond to a click, and cannot paint the very rows it is computing.
 *
 * ── Two passes, because 85% of the wait buys 16% of the table ─────────────
 * `derive-matrix` runs the sixteen CORE sets and then posts `core-ready`. The
 * three SLH-DSA `s` sets are left at `DERIVE_DEFERRED` until a `derive-slow`
 * request arrives. Measured here: core 2.0 s, the slow tail a further 11-12 s;
 * a reviewer's browser measured 24.0 s for the lot. Making a visitor wait
 * through that before the page is usable is the whole reason the chooser was
 * unreachable in the first viewport.
 *
 * ── How "stop" reaches a worker that is busy ──────────────────────────────
 * A worker running a synchronous `sign()` processes no messages, so a stop
 * request cannot interrupt one in flight. The slow loop therefore yields to the
 * macrotask queue between parameter sets, which is where a queued `skip-slow`
 * gets delivered, and the flag is checked BEFORE each set starts. A press that
 * lands while a set is already signing cannot stop that one: it finishes, its
 * figure is real, and it is shown. The rows say which happened.
 */

import { SCHEMES, SLOW_SCHEME_IDS } from './schemes';
import { deriveScheme } from './adapters';
import { FAILURE_CODES, FAILURE_CAUSES } from './codes';
import { runKemFixture } from './kem-fixture';
import { computeHandshake, computeHybridOverhead } from '../wire/handshake';
import { runBenchmark } from '../bench/runner';
import type { DerivedRow, WorkerRequest, WorkerResponse } from './types';

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

/** Hand the worker's own event loop back so queued messages get delivered. */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

let skipSlow = false;
let matrixStarted = false;
let slowStarted = false;
/** Wall-clock zero for the whole derivation, so the log's `atMs` is one scale. */
let t0 = 0;

const unavailableRow = (schemeId: string, code: (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES]): DerivedRow => ({
  schemeId,
  state: { status: 'unavailable', code, cause: FAILURE_CAUSES[code] },
});

/** Derive one set and post its row and log entry. Never throws. */
async function deriveOne(schemeId: string, label: string): Promise<void> {
  post({ kind: 'row', row: { schemeId, state: { status: 'deriving' } }, event: null });
  // Deliver that message, and pick up any queued stop, before blocking.
  await yieldToEventLoop();
  try {
    const sizes = deriveScheme(schemeId);
    post({
      kind: 'row',
      row: { schemeId, state: { status: 'derived', sizes } },
      event: { schemeId, label, atMs: performance.now() - t0, elapsedMs: sizes.elapsedMs, outcome: 'derived' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      kind: 'row',
      row: {
        schemeId,
        state: {
          status: 'unavailable',
          code: FAILURE_CODES.DERIVE_FAILED,
          cause: `${FAILURE_CAUSES[FAILURE_CODES.DERIVE_FAILED]}: ${message}`,
        },
      },
      event: { schemeId, label, atMs: performance.now() - t0, elapsedMs: 0, outcome: 'failed' },
    });
  }
  await yieldToEventLoop();
}

async function deriveMatrix(): Promise<void> {
  if (matrixStarted) return;
  matrixStarted = true;
  t0 = performance.now();

  for (const scheme of SCHEMES) {
    if (SLOW_SCHEME_IDS.includes(scheme.id)) {
      // Deferred, not skipped, and not blank: the row says it is measured on
      // request and why.
      post({ kind: 'row', row: unavailableRow(scheme.id, FAILURE_CODES.DERIVE_DEFERRED), event: null });
      continue;
    }
    await deriveOne(scheme.id, scheme.label);
  }

  post({ kind: 'core-ready', coreMs: performance.now() - t0 });
}

async function deriveSlow(): Promise<void> {
  if (slowStarted) return;
  slowStarted = true;
  skipSlow = false;

  for (const id of SLOW_SCHEME_IDS) {
    const scheme = SCHEMES.find((s) => s.id === id);
    if (!scheme) continue;
    if (skipSlow) {
      post({
        kind: 'row',
        row: unavailableRow(id, FAILURE_CODES.DERIVE_SKIPPED),
        event: { schemeId: id, label: scheme.label, atMs: performance.now() - t0, elapsedMs: 0, outcome: 'skipped' },
      });
      continue;
    }
    await deriveOne(id, scheme.label);
  }

  post({ kind: 'matrix-done', totalMs: performance.now() - t0 });
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  switch (request.kind) {
    case 'derive-matrix':
      void deriveMatrix();
      return;

    case 'derive-slow':
      void deriveSlow();
      return;

    case 'skip-slow':
      skipSlow = true;
      return;

    case 'wire': {
      try {
        post({
          kind: 'wire-result',
          requestId: request.requestId,
          result: computeHandshake(request.kemId, request.sigId),
        });
      } catch (err) {
        post({
          kind: 'wire-error',
          requestId: request.requestId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    case 'hybrid': {
      try {
        post({
          kind: 'hybrid-result',
          requestId: request.requestId,
          result: computeHybridOverhead(request.hybridId, request.baseId),
        });
      } catch (err) {
        post({
          kind: 'hybrid-error',
          requestId: request.requestId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    case 'kem-fixture':
      post({
        kind: 'kem-fixture-result',
        requestId: request.requestId,
        result: runKemFixture(request.flipByteIndex),
      });
      return;

    case 'benchmark': {
      const { requestId, schemeIds } = request;
      runBenchmark(schemeIds, {
        onProgress: (done, total, label) =>
          post({ kind: 'benchmark-progress', requestId, done, total, label }),
      })
        .then((run) => post({ kind: 'benchmark-result', requestId, run }))
        .catch((err: unknown) =>
          post({
            kind: 'benchmark-error',
            requestId,
            message: err instanceof Error ? err.message : String(err),
          })
        );
      return;
    }
  }
};
