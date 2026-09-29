/**
 * Every named way this page can decline to show a number.
 *
 * These are exported constants rather than strings scattered through the
 * renderers for one reason: the page's whole claim is that a figure it shows
 * was derived, so the states in which it shows NO figure are load-bearing. A
 * reader has to be able to tell "not yet" from "you skipped this" from "this
 * browser cannot" — and each has to say WHY on the row itself, not in a
 * footnote.
 *
 * Each code is surfaced in the UI and asserted in `e2e/claims.spec.ts`. The one
 * exception is documented on the constant itself.
 */
export const FAILURE_CODES = {
  /**
   * The reader pressed "Skip slow sets". The three SLH-DSA `s` parameter sets
   * are abandoned and the rows say so. NEVER replaced with a spec number and
   * never left blank — the cost of skipping has to stay visible on the row that
   * was skipped, or skipping quietly re-creates the typed-in-number problem
   * this whole page exists to remove.
   */
  DERIVE_SKIPPED: 'DERIVE_SKIPPED',

  /**
   * A parameter set threw while being derived. The row carries the thrown
   * message verbatim, because "it failed" without the cause is the same
   * non-information as a blank.
   *
   * NOT reachable from the browser UI: `@noble/post-quantum` 0.7.x derives all
   * nineteen sets in every browser the gate runs. It is covered by a unit test
   * that drives the adapter and the renderer directly (`derive/adapters.test.ts`,
   * `ui/table.test.ts`) rather than by a claims-suite fixture, and that gap is
   * stated in the README rather than papered over with a debug mode that only
   * this lab would have.
   */
  DERIVE_FAILED: 'DERIVE_FAILED',

  /**
   * This browser has no Web Worker. Deriving the matrix on the main thread
   * costs roughly nine seconds of frozen page (measured — see the README), so
   * nothing is derived at all and every row says why. Fail-closed: the page
   * would rather show no numbers than show numbers it did not compute.
   */
  WORKER_UNAVAILABLE: 'WORKER_UNAVAILABLE',

  /** The byte count typed into the claim checker was not a whole number of bytes. */
  CLAIM_MALFORMED: 'CLAIM_MALFORMED',

  /**
   * The claim checker was pointed at a parameter set whose figure has not been
   * derived yet, or was skipped. The page refuses to answer rather than falling
   * back to the published constant — which is exactly the substitution it
   * exists to argue against.
   */
  CLAIM_NOT_DERIVED: 'CLAIM_NOT_DERIVED',

  /** The library does not produce the claimed length. The row names what it did produce. */
  CLAIM_CONTRADICTED: 'CLAIM_CONTRADICTED',

  /** A handshake total cannot be added up because a chosen component is not derived. */
  WIRE_NOT_DERIVED: 'WIRE_NOT_DERIVED',

  /**
   * Deliberately not measured, with the reason on the row. RSA-2048 key
   * generation is a randomised prime search: timing it measures the search
   * rather than the algorithm, and it would dominate the wait. An omitted cell
   * reads as an oversight; a stated "not measured" is a claim a reader can
   * check.
   */
  BENCH_NOT_MEASURED: 'BENCH_NOT_MEASURED',

  /**
   * ML-KEM decapsulation raised nothing, because ML-KEM has nothing to raise.
   * This is not a defect in the page; the ABSENCE of a failure code is the
   * exhibit. See `src/ui/negative-claim.ts`.
   */
  KEM_NO_FAILURE_CODE: 'KEM_NO_FAILURE_CODE',
} as const;

export type FailureCode = (typeof FAILURE_CODES)[keyof typeof FAILURE_CODES];

/**
 * The plain-language cause shown beside each code.
 *
 * Kept next to the codes so a new code cannot ship without one: the renderer
 * reads this map, so a missing entry is a type error rather than an empty cell.
 */
export const FAILURE_CAUSES: Record<FailureCode, string> = {
  [FAILURE_CODES.DERIVE_SKIPPED]:
    'not measured, skipped by you — this set was abandoned before it was derived',
  [FAILURE_CODES.DERIVE_FAILED]:
    'the derivation threw, and the library\u2019s own message follows on this row',
  [FAILURE_CODES.WORKER_UNAVAILABLE]:
    'this browser provides no Web Worker, and deriving the matrix on the main thread would freeze the page for about nine seconds',
  [FAILURE_CODES.CLAIM_MALFORMED]: 'that is not a whole number of bytes',
  [FAILURE_CODES.CLAIM_NOT_DERIVED]:
    'that figure has not been derived on this device yet, so there is nothing to check the claim against',
  [FAILURE_CODES.CLAIM_CONTRADICTED]: 'the library does not produce that length',
  [FAILURE_CODES.WIRE_NOT_DERIVED]:
    'one of the chosen components has not been derived, so there is nothing to add up',
  [FAILURE_CODES.BENCH_NOT_MEASURED]:
    'RSA key generation is a randomised prime search; its time says more about luck than about RSA',
  [FAILURE_CODES.KEM_NO_FAILURE_CODE]:
    'ML-KEM decapsulation has no failure to report — a bad ciphertext returns a pseudorandom key and no error',
};
