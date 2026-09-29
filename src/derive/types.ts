import type { FailureCode } from './codes';

/**
 * A size this page is willing to print.
 *
 * It is a union rather than a number with an optional note, and that is
 * deliberate: it makes invariant 3 — *Falcon renders a range, never a point* —
 * a property of the type rather than a rule a renderer is trusted to remember.
 * A variable-length scheme produces `{ kind: 'range' }`, a renderer must switch
 * on `kind` to read it, and there is no field on that branch holding a single
 * number for someone to print by accident.
 */
export type PayloadSize =
  | { kind: 'fixed'; bytes: number }
  | {
      kind: 'range';
      min: number;
      max: number;
      /** How many signatures were measured. A sample range, not the scheme's bounds. */
      samples: number;
      /** How many distinct lengths those samples took. 1 would mean "looks fixed here". */
      distinct: number;
    };

/** Everything one parameter set contributed, all of it read off real output. */
export interface DerivedSizes {
  publicKeyBytes: number;
  secretKeyBytes: number;
  /** Ciphertext for a KEM; signature for a signature scheme. */
  payload: PayloadSize;
  /** KEM only: the shared secret the encapsulation produced. */
  sharedSecretBytes?: number;
  /**
   * The round trip actually ran and agreed — decapsulate matched, or verify
   * returned true. A size derived from output nobody checked is a number from a
   * function that might not be the function it claims to be.
   */
  roundTripOk: boolean;
  /** Wall-clock milliseconds this derivation cost, in the reader's own browser. */
  elapsedMs: number;
}

/**
 * The three states a row can be in, plus the ways it can end without a number.
 *
 * `pending` and `deriving` are distinct on purpose: the brief asks for a
 * per-row "measuring…" that a reader can see, so that someone who never scrolls
 * back still learns which schemes were slow.
 */
export type RowState =
  | { status: 'pending' }
  | { status: 'deriving' }
  | { status: 'derived'; sizes: DerivedSizes }
  | { status: 'unavailable'; code: FailureCode; cause: string };

export interface DerivedRow {
  schemeId: string;
  state: RowState;
}

/** One line in the derivation log — the mechanism this page exists to show. */
export interface DerivationEvent {
  schemeId: string;
  label: string;
  /** Milliseconds since derivation started, so the ORDER is legible as timing. */
  atMs: number;
  elapsedMs: number;
  outcome: 'derived' | 'skipped' | 'failed';
}

// ── Worker protocol ─────────────────────────────────────────────────────────
//
// The main thread never calls the crypto library. Every byte count, handshake
// total and benchmark sample on this page crossed this boundary, which is what
// keeps the nine-second derivation off the thread that paints.

export type WorkerRequest =
  | { kind: 'derive-matrix' }
  | { kind: 'skip-slow' }
  | { kind: 'wire'; requestId: number; kemId: string; sigId: string }
  | { kind: 'hybrid'; requestId: number; hybridId: string; baseId: string }
  | { kind: 'kem-fixture'; requestId: number; flipByteIndex: number }
  | { kind: 'benchmark'; requestId: number; schemeIds: readonly string[] };

export type WorkerResponse =
  | { kind: 'row'; row: DerivedRow; event: DerivationEvent | null }
  | { kind: 'matrix-done'; totalMs: number }
  | { kind: 'wire-result'; requestId: number; result: import('../wire/handshake').HandshakeCost }
  | { kind: 'wire-error'; requestId: number; message: string }
  | { kind: 'hybrid-result'; requestId: number; result: import('../wire/handshake').HybridOverhead }
  | { kind: 'hybrid-error'; requestId: number; message: string }
  | { kind: 'kem-fixture-result'; requestId: number; result: import('./kem-fixture').KemFixtureResult }
  | { kind: 'benchmark-progress'; requestId: number; done: number; total: number; label: string }
  | { kind: 'benchmark-result'; requestId: number; run: import('../bench/runner').BenchmarkRun }
  | { kind: 'benchmark-error'; requestId: number; message: string };
