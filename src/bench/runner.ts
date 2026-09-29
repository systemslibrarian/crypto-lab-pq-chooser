/**
 * The benchmark runner.
 *
 * The measuring machinery — warm-up, per-sample timing rather than a batch
 * mean, median + p95 + min + max, and the timer-resolution problem — is ported
 * from `crypto-lab-dilithium-seal/src/bench/runner.ts` rather than written
 * again. What is new here is the shape of the comparison: post-quantum KEMs and
 * signature schemes and the three classical primitives they would replace, all
 * measured by this harness, in this run, on the reader's own device.
 *
 * ── Why the iteration count varies, and why it is printed everywhere ──────
 * The other lab measures three parameter sets whose costs are within a factor
 * of three of each other, so one pair of counts (10 warm-up, 50 measured) fits
 * all of them. This lab measures SLH-DSA-256s, which signs in about 4.4 seconds
 * here: fifty samples would be nearly four minutes of one cell. So the counts
 * come from the scheme's cost class, and `n` is printed beside every figure —
 * because a median over three samples and a median over thirty are different
 * claims, and a table that hides which is which has made them look the same.
 *
 * ── Why RSA-2048 key generation is not measured ───────────────────────────
 * It is a randomised prime search. Timing it measures how lucky the search got,
 * not how fast RSA is, and it would dominate the run. The cell says NOT
 * MEASURED with the reason on the row rather than being quietly dropped: an
 * omitted cell reads as an oversight, while a stated refusal is a claim a
 * reader can check.
 */

import { KEMS, SIGNERS, DERIVATION_MESSAGE } from '../derive/adapters';
import { SCHEMES_BY_ID, type CostClass } from '../derive/schemes';
import { collectEnvironment, type BenchmarkEnvironment } from './environment';
import { summarize, type Summary } from './stats';
import { FAILURE_CODES, FAILURE_CAUSES, type FailureCode } from '../derive/codes';

/**
 * Warm-up and measured sample counts per cost class.
 *
 * Chosen from the measured per-operation costs, so that no single row costs
 * more than roughly fifteen seconds: `cheap` operations run in single-digit
 * milliseconds, `moderate` in tens to hundreds, and `slow` signing runs to
 * seconds. Exported because the panel prints them and the claims suite checks
 * that what the panel prints is what the runner used.
 */
export const ITERATIONS: Record<CostClass, { warmup: number; measured: number }> = {
  cheap: { warmup: 5, measured: 30 },
  moderate: { warmup: 2, measured: 10 },
  slow: { warmup: 1, measured: 3 },
};

/** The classical primitives are cheap; they use the cheap counts. */
export const CLASSICAL_COST_CLASS: CostClass = 'cheap';

export type OperationSlot = 'keygen' | 'produce' | 'consume';

/**
 * Three slots, one pair of names.
 *
 * A KEM's `produce` is encapsulation and a signature scheme's is signing; the
 * consuming halves are decapsulation and verification. Keeping them in the same
 * three columns is what lets a reader compare a KEM row with a signature row
 * without the table pretending the operations are the same thing — the column
 * headers say both names.
 */
export const OPERATION_SLOTS: readonly OperationSlot[] = ['keygen', 'produce', 'consume'];

export interface OperationResult {
  slot: OperationSlot;
  /** What this slot actually was for this row: 'encapsulate', 'sign', ... */
  operation: string;
  /** Every measured sample, in the order taken. Never reordered. */
  samples: number[];
  summary: Summary;
}

/** A slot that was deliberately or unavoidably not measured, with its reason. */
export interface UnmeasuredSlot {
  slot: OperationSlot;
  operation: string;
  code: FailureCode;
  cause: string;
}

export interface BenchmarkRow {
  id: string;
  label: string;
  /** 'post-quantum' rows are the subject; 'classical' rows are the baseline. */
  group: 'post-quantum' | 'classical';
  costClass: CostClass;
  warmupIterations: number;
  measuredIterations: number;
  operations: OperationResult[];
  unmeasured: UnmeasuredSlot[];
  /** Set when the runtime could not provide the primitive at all. */
  unsupportedReason?: string;
}

export interface BenchmarkRun {
  environment: BenchmarkEnvironment;
  rows: BenchmarkRow[];
  /** Which classical row the ratio column is taken against, and why. */
  baselineId: string;
  totalMs: number;
}

export interface RunOptions {
  onProgress?: (done: number, total: number, label: string) => void;
  /** Injected by tests so they do not have to wait on real timers. */
  yieldToEventLoop?: () => Promise<void>;
}

const defaultYield = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Time one operation `count` times, yielding between iterations.
 *
 * The call is AWAITED inside the bracket even where the operation is
 * synchronous. The noble primitives are synchronous today, so a fire-and-forget
 * call would happen to measure the right thing — until someone put a real
 * `await` inside, at which point the timings would silently become the cost of
 * creating a promise. The extra microtask turn costs far less than this clock
 * can resolve.
 */
async function timeOperation(
  count: number,
  run: () => unknown | Promise<unknown>,
  yieldFn: () => Promise<void>
): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
    await yieldFn();
  }
  return samples;
}

async function measureSlots(
  counts: { warmup: number; measured: number },
  slots: Array<{ slot: OperationSlot; operation: string; once: () => unknown | Promise<unknown> }>,
  yieldFn: () => Promise<void>,
  onSlotDone: (operation: string) => void
): Promise<OperationResult[]> {
  const out: OperationResult[] = [];
  for (const { slot, operation, once } of slots) {
    // Warm-up: the same work, samples discarded. A cold JIT measures the
    // compiler rather than the algorithm.
    for (let i = 0; i < counts.warmup; i++) await once();
    await yieldFn();
    const samples = await timeOperation(counts.measured, once, yieldFn);
    out.push({ slot, operation, samples, summary: summarize(samples) });
    onSlotDone(operation);
  }
  return out;
}

async function benchmarkScheme(
  schemeId: string,
  yieldFn: () => Promise<void>,
  onSlotDone: (operation: string) => void
): Promise<BenchmarkRow> {
  const scheme = SCHEMES_BY_ID.get(schemeId);
  if (!scheme) throw new Error(`no such parameter set: ${schemeId}`);
  const counts = ITERATIONS[scheme.costClass];

  if (scheme.kind === 'kem') {
    const kem = KEMS[schemeId];
    const keys = kem.keygen();
    const { cipherText } = kem.encapsulate(keys.publicKey);
    const operations = await measureSlots(
      counts,
      [
        { slot: 'keygen', operation: 'keygen', once: () => kem.keygen() },
        { slot: 'produce', operation: 'encapsulate', once: () => kem.encapsulate(keys.publicKey) },
        { slot: 'consume', operation: 'decapsulate', once: () => kem.decapsulate(cipherText, keys.secretKey) },
      ],
      yieldFn,
      onSlotDone
    );
    return {
      id: schemeId,
      label: scheme.label,
      group: 'post-quantum',
      costClass: scheme.costClass,
      warmupIterations: counts.warmup,
      measuredIterations: counts.measured,
      operations,
      unmeasured: [],
    };
  }

  const signer = SIGNERS[schemeId];
  const keys = signer.keygen();
  const signature = signer.sign(DERIVATION_MESSAGE, keys.secretKey);
  const operations = await measureSlots(
    counts,
    [
      { slot: 'keygen', operation: 'keygen', once: () => signer.keygen() },
      { slot: 'produce', operation: 'sign', once: () => signer.sign(DERIVATION_MESSAGE, keys.secretKey) },
      {
        slot: 'consume',
        operation: 'verify',
        once: () => signer.verify(signature, DERIVATION_MESSAGE, keys.publicKey),
      },
    ],
    yieldFn,
    onSlotDone
  );
  return {
    id: schemeId,
    label: scheme.label,
    group: 'post-quantum',
    costClass: scheme.costClass,
    warmupIterations: counts.warmup,
    measuredIterations: counts.measured,
    operations,
    unmeasured: [],
  };
}

/**
 * The three classical primitives, measured by this harness in this run.
 *
 * X25519 and ECDSA P-256 are what a TLS 1.3 handshake uses today; RSA-2048 is
 * what a large share of the certificate estate still authenticates with. Each
 * is measured, never quoted — and where the runtime does not provide one, the
 * row says so instead of printing a number from somewhere else.
 */
const CLASSICAL_MESSAGE = DERIVATION_MESSAGE;

async function benchmarkX25519(
  yieldFn: () => Promise<void>,
  onSlotDone: (operation: string) => void
): Promise<BenchmarkRow> {
  const counts = ITERATIONS[CLASSICAL_COST_CLASS];
  const base: Omit<BenchmarkRow, 'operations' | 'unmeasured'> = {
    id: 'x25519',
    label: 'X25519 (ECDH)',
    group: 'classical',
    costClass: CLASSICAL_COST_CLASS,
    warmupIterations: counts.warmup,
    measuredIterations: counts.measured,
  };
  try {
    const receiver = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const ephemeral = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    // The KEM analogue: "encapsulate" is a fresh ephemeral key plus one
    // derivation; "decapsulate" is the receiver's single derivation. Modelling
    // it any other way would flatter X25519 by charging it less work than the
    // KEM it is being compared with.
    const operations = await measureSlots(
      counts,
      [
        {
          slot: 'keygen',
          operation: 'generateKey',
          once: () => crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']),
        },
        {
          slot: 'produce',
          operation: 'ephemeral keygen + deriveBits',
          once: async () => {
            const e = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
              'deriveBits',
            ])) as CryptoKeyPair;
            return crypto.subtle.deriveBits(
              { name: 'X25519', public: receiver.publicKey },
              e.privateKey,
              256
            );
          },
        },
        {
          slot: 'consume',
          operation: 'deriveBits',
          once: () =>
            crypto.subtle.deriveBits(
              { name: 'X25519', public: ephemeral.publicKey },
              receiver.privateKey,
              256
            ),
        },
      ],
      yieldFn,
      onSlotDone
    );
    return { ...base, operations, unmeasured: [] };
  } catch (err) {
    return {
      ...base,
      operations: [],
      unmeasured: [],
      unsupportedReason: `this browser did not provide X25519 through the Web Crypto API (${
        err instanceof Error ? err.message : String(err)
      })`,
    };
  }
}

async function benchmarkEcdsaP256(
  yieldFn: () => Promise<void>,
  onSlotDone: (operation: string) => void
): Promise<BenchmarkRow> {
  const counts = ITERATIONS[CLASSICAL_COST_CLASS];
  const alg = { name: 'ECDSA', namedCurve: 'P-256' } as const;
  const signAlg = { name: 'ECDSA', hash: 'SHA-256' } as const;
  const base: Omit<BenchmarkRow, 'operations' | 'unmeasured'> = {
    id: 'ecdsa-p256',
    label: 'ECDSA P-256',
    group: 'classical',
    costClass: CLASSICAL_COST_CLASS,
    warmupIterations: counts.warmup,
    measuredIterations: counts.measured,
  };
  try {
    const keys = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
    const sig = await crypto.subtle.sign(signAlg, keys.privateKey, CLASSICAL_MESSAGE);
    const operations = await measureSlots(
      counts,
      [
        {
          slot: 'keygen',
          operation: 'generateKey',
          once: () => crypto.subtle.generateKey(alg, true, ['sign', 'verify']),
        },
        { slot: 'produce', operation: 'sign', once: () => crypto.subtle.sign(signAlg, keys.privateKey, CLASSICAL_MESSAGE) },
        {
          slot: 'consume',
          operation: 'verify',
          once: () => crypto.subtle.verify(signAlg, keys.publicKey, sig, CLASSICAL_MESSAGE),
        },
      ],
      yieldFn,
      onSlotDone
    );
    return { ...base, operations, unmeasured: [] };
  } catch (err) {
    return {
      ...base,
      operations: [],
      unmeasured: [],
      unsupportedReason: `this browser did not provide ECDSA P-256 through the Web Crypto API (${
        err instanceof Error ? err.message : String(err)
      })`,
    };
  }
}

async function benchmarkRsa2048(
  yieldFn: () => Promise<void>,
  onSlotDone: (operation: string) => void
): Promise<BenchmarkRow> {
  const counts = ITERATIONS[CLASSICAL_COST_CLASS];
  const alg = {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
    hash: 'SHA-256',
  } as const;
  const base: Omit<BenchmarkRow, 'operations' | 'unmeasured'> = {
    id: 'rsa-2048',
    label: 'RSA-2048',
    group: 'classical',
    costClass: CLASSICAL_COST_CLASS,
    warmupIterations: counts.warmup,
    measuredIterations: counts.measured,
  };
  const notMeasured: UnmeasuredSlot = {
    slot: 'keygen',
    operation: 'generateKey',
    code: FAILURE_CODES.BENCH_NOT_MEASURED,
    cause: FAILURE_CAUSES[FAILURE_CODES.BENCH_NOT_MEASURED],
  };
  try {
    // One key pair, generated OUTSIDE any timed region. It is setup, which a
    // real server does once; charging it to a per-operation median would be
    // measuring the prime search.
    const keys = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
    const sig = await crypto.subtle.sign(alg.name, keys.privateKey, CLASSICAL_MESSAGE);
    const operations = await measureSlots(
      counts,
      [
        { slot: 'produce', operation: 'sign', once: () => crypto.subtle.sign(alg.name, keys.privateKey, CLASSICAL_MESSAGE) },
        {
          slot: 'consume',
          operation: 'verify',
          once: () => crypto.subtle.verify(alg.name, keys.publicKey, sig, CLASSICAL_MESSAGE),
        },
      ],
      yieldFn,
      onSlotDone
    );
    return { ...base, operations, unmeasured: [notMeasured] };
  } catch (err) {
    return {
      ...base,
      operations: [],
      unmeasured: [notMeasured],
      unsupportedReason: `this browser did not provide RSASSA-PKCS1-v1_5 through the Web Crypto API (${
        err instanceof Error ? err.message : String(err)
      })`,
    };
  }
}

/** The classical rows, in the order they appear. */
export const CLASSICAL_ROW_IDS = ['x25519', 'ecdsa-p256', 'rsa-2048'] as const;

/**
 * The row every ratio is taken against.
 *
 * X25519, because it is the one operation in this table that both a classical
 * and a post-quantum handshake must perform, and because it is the fastest
 * thing here — which makes every ratio a cost rather than a saving, and stops
 * the column from ever reading as a security ranking.
 */
export const RATIO_BASELINE_ID = 'x25519';

export async function runBenchmark(
  schemeIds: readonly string[],
  options: RunOptions = {}
): Promise<BenchmarkRun> {
  const yieldFn = options.yieldToEventLoop ?? defaultYield;
  // Collected BEFORE the run, so the timestamp is when measurement started.
  const environment = collectEnvironment();
  const started = performance.now();

  // Three slots for every post-quantum row and for X25519/ECDSA; two for RSA.
  const total = schemeIds.length * 3 + 3 + 3 + 2;
  let done = 0;
  const step = (label: string): void => {
    done++;
    options.onProgress?.(done, total, label);
  };

  const rows: BenchmarkRow[] = [];
  for (const id of schemeIds) {
    const scheme = SCHEMES_BY_ID.get(id);
    rows.push(await benchmarkScheme(id, yieldFn, (op) => step(`${scheme?.label ?? id} ${op}`)));
  }
  rows.push(await benchmarkX25519(yieldFn, (op) => step(`X25519 ${op}`)));
  rows.push(await benchmarkEcdsaP256(yieldFn, (op) => step(`ECDSA P-256 ${op}`)));
  rows.push(await benchmarkRsa2048(yieldFn, (op) => step(`RSA-2048 ${op}`)));

  return {
    environment,
    rows,
    baselineId: RATIO_BASELINE_ID,
    totalMs: performance.now() - started,
  };
}
