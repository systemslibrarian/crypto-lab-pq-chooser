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
 * ── How "skip slow sets" reaches a worker that is busy ────────────────────
 * A worker running a synchronous `sign()` processes no messages, so a skip
 * request cannot interrupt one in flight. The derivation loop therefore yields
 * to the macrotask queue between parameter sets, which is where a queued
 * `skip-slow` gets delivered, and the flag is checked BEFORE each slow set
 * starts. The three slow sets run last, so a reader who presses skip at any
 * point during the first sixteen rows skips all three. A press that lands while
 * a slow set is already signing cannot stop that one: it finishes, its figure is
 * real, and it is shown. The rows say which happened.
 */

import { SCHEMES, SLOW_SCHEME_IDS } from './schemes';
import { deriveScheme } from './adapters';
import { FAILURE_CODES, FAILURE_CAUSES } from './codes';
import { runKemFixture } from './kem-fixture';
import { computeHandshake, computeHybridOverhead } from '../wire/handshake';
import { runBenchmark } from '../bench/runner';
import type { DerivationEvent, DerivedRow, WorkerRequest, WorkerResponse } from './types';

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

async function deriveMatrix(): Promise<void> {
  if (matrixStarted) return;
  matrixStarted = true;
  const t0 = performance.now();

  for (const scheme of SCHEMES) {
    const isSlow = SLOW_SCHEME_IDS.includes(scheme.id);
    if (isSlow && skipSlow) {
      const row: DerivedRow = {
        schemeId: scheme.id,
        state: {
          status: 'unavailable',
          code: FAILURE_CODES.DERIVE_SKIPPED,
          cause: FAILURE_CAUSES[FAILURE_CODES.DERIVE_SKIPPED],
        },
      };
      const event: DerivationEvent = {
        schemeId: scheme.id,
        label: scheme.label,
        atMs: performance.now() - t0,
        elapsedMs: 0,
        outcome: 'skipped',
      };
      post({ kind: 'row', row, event });
      continue;
    }

    post({ kind: 'row', row: { schemeId: scheme.id, state: { status: 'deriving' } }, event: null });
    // Deliver that message and pick up any queued skip before blocking.
    await yieldToEventLoop();

    try {
      const sizes = deriveScheme(scheme.id);
      post({
        kind: 'row',
        row: { schemeId: scheme.id, state: { status: 'derived', sizes } },
        event: {
          schemeId: scheme.id,
          label: scheme.label,
          atMs: performance.now() - t0,
          elapsedMs: sizes.elapsedMs,
          outcome: 'derived',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({
        kind: 'row',
        row: {
          schemeId: scheme.id,
          state: {
            status: 'unavailable',
            code: FAILURE_CODES.DERIVE_FAILED,
            cause: `${FAILURE_CAUSES[FAILURE_CODES.DERIVE_FAILED]}: ${message}`,
          },
        },
        event: {
          schemeId: scheme.id,
          label: scheme.label,
          atMs: performance.now() - t0,
          elapsedMs: 0,
          outcome: 'failed',
        },
      });
    }
    await yieldToEventLoop();
  }

  post({ kind: 'matrix-done', totalMs: performance.now() - t0 });
}

self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;
  switch (request.kind) {
    case 'derive-matrix':
      void deriveMatrix();
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
