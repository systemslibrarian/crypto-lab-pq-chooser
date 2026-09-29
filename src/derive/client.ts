/**
 * The main thread's half of the derivation.
 *
 * Holds the row map, forwards the worker's stream to the UI, and turns the
 * worker's one-shot replies into promises. It calls no cryptography itself.
 *
 * When the runtime provides no `Worker`, it does not quietly fall back to the
 * main thread: it marks every row `WORKER_UNAVAILABLE` and lets the page say
 * so. Fail-closed is the honest answer here, because the fallback would be nine
 * seconds of frozen tab and the alternative — showing published figures until
 * the real ones arrive — is the exact substitution this page argues against.
 */

import { SCHEMES } from './schemes';
import { FAILURE_CODES, FAILURE_CAUSES } from './codes';
import type { DerivationEvent, DerivedRow, WorkerRequest, WorkerResponse } from './types';
import type { HandshakeCost, HybridOverhead } from '../wire/handshake';
import type { KemFixtureResult } from './kem-fixture';
import type { BenchmarkRun } from '../bench/runner';

export interface DeriveListener {
  onRow: (row: DerivedRow) => void;
  onEvent: (event: DerivationEvent) => void;
  onMatrixDone: (totalMs: number) => void;
  onBenchmarkProgress: (done: number, total: number, label: string) => void;
}

interface Pending<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

export class DeriveClient {
  readonly rows = new Map<string, DerivedRow>();
  readonly events: DerivationEvent[] = [];
  /** True when nothing can be derived at all. The page renders the reason. */
  readonly workerUnavailable: boolean;

  private readonly worker: Worker | null;
  private readonly listener: DeriveListener;
  private nextRequestId = 1;
  private readonly wirePending = new Map<number, Pending<HandshakeCost>>();
  private readonly hybridPending = new Map<number, Pending<HybridOverhead>>();
  private readonly fixturePending = new Map<number, Pending<KemFixtureResult>>();
  private readonly benchPending = new Map<number, Pending<BenchmarkRun>>();
  private skipRequested = false;

  constructor(listener: DeriveListener) {
    this.listener = listener;
    for (const scheme of SCHEMES) {
      this.rows.set(scheme.id, { schemeId: scheme.id, state: { status: 'pending' } });
    }

    let worker: Worker | null = null;
    if (typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch {
        worker = null;
      }
    }
    this.worker = worker;
    this.workerUnavailable = worker === null;

    if (!worker) {
      for (const scheme of SCHEMES) {
        const row: DerivedRow = {
          schemeId: scheme.id,
          state: {
            status: 'unavailable',
            code: FAILURE_CODES.WORKER_UNAVAILABLE,
            cause: FAILURE_CAUSES[FAILURE_CODES.WORKER_UNAVAILABLE],
          },
        };
        this.rows.set(scheme.id, row);
      }
      return;
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>): void => this.receive(event.data);
  }

  /** True once the reader has asked for the slow sets to be abandoned. */
  get skipped(): boolean {
    return this.skipRequested;
  }

  start(): void {
    this.send({ kind: 'derive-matrix' });
  }

  skipSlowSets(): void {
    this.skipRequested = true;
    this.send({ kind: 'skip-slow' });
  }

  requestWire(kemId: string, sigId: string): Promise<HandshakeCost> {
    return this.request(this.wirePending, (requestId) => ({ kind: 'wire', requestId, kemId, sigId }));
  }

  requestHybridOverhead(hybridId: string, baseId: string): Promise<HybridOverhead> {
    return this.request(this.hybridPending, (requestId) => ({
      kind: 'hybrid',
      requestId,
      hybridId,
      baseId,
    }));
  }

  requestKemFixture(flipByteIndex: number): Promise<KemFixtureResult> {
    return this.request(this.fixturePending, (requestId) => ({
      kind: 'kem-fixture',
      requestId,
      flipByteIndex,
    }));
  }

  requestBenchmark(schemeIds: readonly string[]): Promise<BenchmarkRun> {
    return this.request(this.benchPending, (requestId) => ({
      kind: 'benchmark',
      requestId,
      schemeIds,
    }));
  }

  private request<T>(
    table: Map<number, Pending<T>>,
    build: (requestId: number) => WorkerRequest
  ): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error(FAILURE_CAUSES[FAILURE_CODES.WORKER_UNAVAILABLE]));
    }
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      table.set(requestId, { resolve, reject });
      this.send(build(requestId));
    });
  }

  private send(request: WorkerRequest): void {
    this.worker?.postMessage(request);
  }

  private settle<T>(table: Map<number, Pending<T>>, requestId: number, value: T): void {
    const pending = table.get(requestId);
    table.delete(requestId);
    pending?.resolve(value);
  }

  private fail<T>(table: Map<number, Pending<T>>, requestId: number, message: string): void {
    const pending = table.get(requestId);
    table.delete(requestId);
    pending?.reject(new Error(message));
  }

  private receive(message: WorkerResponse): void {
    switch (message.kind) {
      case 'row':
        this.rows.set(message.row.schemeId, message.row);
        this.listener.onRow(message.row);
        if (message.event) {
          this.events.push(message.event);
          this.listener.onEvent(message.event);
        }
        return;
      case 'matrix-done':
        this.listener.onMatrixDone(message.totalMs);
        return;
      case 'wire-result':
        this.settle(this.wirePending, message.requestId, message.result);
        return;
      case 'wire-error':
        this.fail(this.wirePending, message.requestId, message.message);
        return;
      case 'hybrid-result':
        this.settle(this.hybridPending, message.requestId, message.result);
        return;
      case 'hybrid-error':
        this.fail(this.hybridPending, message.requestId, message.message);
        return;
      case 'kem-fixture-result':
        this.settle(this.fixturePending, message.requestId, message.result);
        return;
      case 'benchmark-progress':
        this.listener.onBenchmarkProgress(message.done, message.total, message.label);
        return;
      case 'benchmark-result':
        this.settle(this.benchPending, message.requestId, message.run);
        return;
      case 'benchmark-error':
        this.fail(this.benchPending, message.requestId, message.message);
        return;
    }
  }
}
