/**
 * The scheme registry.
 *
 * READ THIS BEFORE ADDING A FIELD: there is not one byte count in this file,
 * and `src/derive/schemes.test.ts` fails the build if one appears. Every public
 * key, ciphertext and signature figure on the page is read off the `.length` of
 * something `@noble/post-quantum` produced in the reader's own browser. What
 * lives here is only what the library cannot tell us — the human label, the
 * family, and the security category each scheme's own specification claims.
 *
 * The reason is not purity. Three labs in this fleet printed Falcon's 666 B as
 * a bare integer beside ML-DSA-44's 2420 and SLH-DSA-128s's 7856. All three
 * numbers were right. But 666 is the PADDED size and raw compressed Falcon-512
 * signatures are variable, and nothing in a row of integers could say which of
 * the three was a range. A derived figure gets that distinction for free: the
 * padded and unpadded Falcon variants are separate library exports, so a table
 * that calls both SHOWS the difference instead of asserting it.
 */

/** Which of the two operations a row's second size column reports. */
export type SchemeKind = 'kem' | 'signature';

/**
 * How expensive this set is to derive, which decides when it runs.
 *
 * Measured on an Apple M5 / Node 26, median of five, before this scheduling was
 * chosen — the numbers are in the README. `slow` is the class whose signing
 * costs hundreds of milliseconds to seconds, and it is the class the "skip slow
 * sets" control abandons.
 */
export type CostClass = 'cheap' | 'moderate' | 'slow';

export interface Scheme {
  /** Stable id; also the `@noble/post-quantum` export name. */
  id: string;
  /** How the row is labelled on screen. */
  label: string;
  family: 'ML-KEM' | 'ML-DSA' | 'SLH-DSA' | 'Falcon / FN-DSA' | 'Hybrid';
  kind: SchemeKind;
  /**
   * The NIST security-strength category THIS SCHEME'S OWN SPECIFICATION claims
   * for this parameter set.
   *
   * These do not line up across schemes, and the table must never present them
   * as if they did: the smallest ML-DSA set is category 2 (FIPS 204), while
   * Falcon-512 and SLH-DSA-128s are both category 1. Sorting the three smallest
   * sets into one "level 1" row would be a comparison nobody's specification
   * makes. (The reasoning is `crypto-lab-falcon-seal/src/compare.ts`'s; the
   * wording here is this lab's own.)
   */
  nistCategory: string;
  costClass: CostClass;
  /**
   * Set ONLY where the second size column is not a fixed length. Falcon's raw
   * compressed signatures are variable; every other scheme here is exact. The
   * asymmetry is the point, so the other rows leave this undefined and render
   * bare rather than carrying an empty note.
   */
  variableLength?: true;
  /** One line a reader needs to read the row correctly. Optional by design. */
  note?: string;
}

/**
 * Nineteen parameter sets across five families.
 *
 * Order is derivation order, which is also cost order: everything cheap lands
 * first, and the three SLH-DSA `s` sets stream in behind the rest. That
 * ordering is not a loading trick — signing cost IS one of the things this
 * table is about, so the wait is content. A reader who watches SLH-DSA-192s
 * still signing while eighteen other rows are already done has learned the s/f
 * tradeoff before a single number appeared.
 */
export const SCHEMES: readonly Scheme[] = [
  // ── Cheap: everything here derives in single-digit milliseconds ──────────
  { id: 'ml_kem512', label: 'ML-KEM-512', family: 'ML-KEM', kind: 'kem', nistCategory: '1', costClass: 'cheap' },
  { id: 'ml_kem768', label: 'ML-KEM-768', family: 'ML-KEM', kind: 'kem', nistCategory: '3', costClass: 'cheap' },
  { id: 'ml_kem1024', label: 'ML-KEM-1024', family: 'ML-KEM', kind: 'kem', nistCategory: '5', costClass: 'cheap' },
  { id: 'ml_dsa44', label: 'ML-DSA-44', family: 'ML-DSA', kind: 'signature', nistCategory: '2', costClass: 'cheap' },
  { id: 'ml_dsa65', label: 'ML-DSA-65', family: 'ML-DSA', kind: 'signature', nistCategory: '3', costClass: 'cheap' },
  { id: 'ml_dsa87', label: 'ML-DSA-87', family: 'ML-DSA', kind: 'signature', nistCategory: '5', costClass: 'cheap' },
  {
    id: 'ml_kem768_x25519',
    label: 'ML-KEM-768 + X25519',
    family: 'Hybrid',
    kind: 'kem',
    nistCategory: '3 (PQ component)',
    costClass: 'cheap',
    note: 'Concatenated key share: the ML-KEM-768 public key with an X25519 public key appended.',
  },
  {
    id: 'QSF_ml_kem768_p256',
    label: 'ML-KEM-768 + P-256 (QSF)',
    family: 'Hybrid',
    kind: 'kem',
    nistCategory: '3 (PQ component)',
    costClass: 'cheap',
    note: 'Generic X-Wing-style combiner over ML-KEM-768 and an ECDH KEM on P-256.',
  },
  {
    id: 'QSF_ml_kem1024_p384',
    label: 'ML-KEM-1024 + P-384 (QSF)',
    family: 'Hybrid',
    kind: 'kem',
    nistCategory: '5 (PQ component)',
    costClass: 'cheap',
    note: 'Generic X-Wing-style combiner over ML-KEM-1024 and an ECDH KEM on P-384.',
  },

  // ── Moderate: Falcon key generation and the SLH-DSA `f` sets ─────────────
  {
    id: 'falcon512',
    label: 'Falcon-512 (raw)',
    family: 'Falcon / FN-DSA',
    kind: 'signature',
    nistCategory: '1',
    costClass: 'moderate',
    variableLength: true,
    note: 'Raw compressed signatures. Their length varies signature to signature, so this row reports a measured range rather than a value.',
  },
  {
    id: 'falcon512padded',
    label: 'Falcon-512 (padded)',
    family: 'Falcon / FN-DSA',
    kind: 'signature',
    nistCategory: '1',
    costClass: 'moderate',
    note: 'The padded encoding of the same scheme: a fixed length, which is why the published tables can quote one number for it.',
  },
  {
    id: 'falcon1024',
    label: 'Falcon-1024 (raw)',
    family: 'Falcon / FN-DSA',
    kind: 'signature',
    nistCategory: '5',
    costClass: 'moderate',
    variableLength: true,
    note: 'Raw compressed signatures, variable length.',
  },
  {
    id: 'falcon1024padded',
    label: 'Falcon-1024 (padded)',
    family: 'Falcon / FN-DSA',
    kind: 'signature',
    nistCategory: '5',
    costClass: 'moderate',
    note: 'The padded encoding: fixed length.',
  },
  { id: 'slh_dsa_sha2_128f', label: 'SLH-DSA-SHA2-128f', family: 'SLH-DSA', kind: 'signature', nistCategory: '1', costClass: 'moderate' },
  { id: 'slh_dsa_sha2_192f', label: 'SLH-DSA-SHA2-192f', family: 'SLH-DSA', kind: 'signature', nistCategory: '3', costClass: 'moderate' },
  { id: 'slh_dsa_sha2_256f', label: 'SLH-DSA-SHA2-256f', family: 'SLH-DSA', kind: 'signature', nistCategory: '5', costClass: 'moderate' },

  // ── Slow: the three `s` sets. Last on purpose; the wait is the lesson. ───
  {
    id: 'slh_dsa_sha2_128s',
    label: 'SLH-DSA-SHA2-128s',
    family: 'SLH-DSA',
    kind: 'signature',
    nistCategory: '1',
    costClass: 'slow',
    note: 'The small-signature variant. It buys its smaller signature with signing time.',
  },
  {
    id: 'slh_dsa_sha2_192s',
    label: 'SLH-DSA-SHA2-192s',
    family: 'SLH-DSA',
    kind: 'signature',
    nistCategory: '3',
    costClass: 'slow',
    note: 'The small-signature variant. It buys its smaller signature with signing time.',
  },
  {
    id: 'slh_dsa_sha2_256s',
    label: 'SLH-DSA-SHA2-256s',
    family: 'SLH-DSA',
    kind: 'signature',
    nistCategory: '5',
    costClass: 'slow',
    note: 'The small-signature variant. It buys its smaller signature with signing time.',
  },
];

export const SCHEMES_BY_ID: ReadonlyMap<string, Scheme> = new Map(SCHEMES.map((s) => [s.id, s]));

/** The sets "Skip slow sets" abandons. Derived from the registry, never listed twice. */
export const SLOW_SCHEME_IDS: readonly string[] = SCHEMES.filter((s) => s.costClass === 'slow').map(
  (s) => s.id
);

/**
 * How many signatures the Falcon rows sample to report their range.
 *
 * A range over a sample is not the distribution's support, and the page says so
 * rather than printing it as if it were the scheme's bounds. Sixteen is enough
 * to make variability unmissable (nine distinct lengths appeared in twenty-four
 * samples while writing this) and cheap enough — Falcon signs in about 5 ms —
 * that it does not change the row's cost class.
 */
export const FALCON_SAMPLES = 16;

/**
 * The reason the NIST category column cannot be sorted.
 *
 * One wording, used by the table caption and asserted by the claims suite, so
 * the caption and the data cannot drift apart.
 */
export const CATEGORY_UNALIGNED_NOTE =
  'Each row reports the NIST security-strength category that scheme’s own specification claims. They do not line up: the smallest ML-DSA set is category 2, while Falcon-512 and SLH-DSA-128s are category 1. The smallest set of each scheme is therefore not a like-for-like comparison.';
