/**
 * THE PUBLISHED SIZES. THIS MODULE IS FOR TESTS ONLY.
 *
 * Nothing that renders may import it, and `schemes.test.ts` fails the build if
 * anything outside a `*.test.ts` does. That rule is the whole architecture of
 * this lab in one sentence: the page derives every figure it shows, and these
 * constants exist so a test can confirm the derivation agrees with the
 * standards — never so a renderer can reach for one when a measurement is slow
 * to arrive.
 *
 * ── Which way this assertion points ──────────────────────────────────────
 * `crypto-lab-hybrid-pqc/src/crypto/kem.test.ts` declares a size and checks the
 * library against it. That is the right assertion for a lab whose display code
 * legitimately holds the constant. Here the registry drives the test instead:
 * `kat.test.ts` asserts every parameter set in `schemes.ts` HAS an entry below,
 * so a new row cannot ship without a published figure to check it against —
 * and the page still never reads one.
 *
 * Sources, all checked against the published tables:
 *   FIPS 203, Table 3        ML-KEM     encapsulation/decapsulation key, ciphertext
 *   FIPS 204, Table 2        ML-DSA     public key, private key, signature
 *   FIPS 205, Table 2        SLH-DSA    public key, private key, signature
 *   Falcon specification 1.2 Falcon     public key, padded signature
 *
 * Two kinds of figure are NOT from a standard and say so on the entry: the
 * secret-key lengths for Falcon, which are an encoding choice of the
 * implementation rather than a spec constant, and the hybrid sizes, which are
 * compositions rather than published numbers and are written as the sum they
 * are.
 */

/** X25519 public keys are 32 bytes (RFC 7748). */
export const X25519_PUBLIC_KEY = 32;
/** A compressed P-256 point: 1 format byte + 32 (SEC 1). */
export const P256_COMPRESSED_POINT = 33;
/** A compressed P-384 point: 1 format byte + 48 (SEC 1). */
export const P384_COMPRESSED_POINT = 49;

export interface SpecSizes {
  publicKey: number;
  secretKey: number;
  /** Ciphertext for a KEM, signature for a signature scheme. */
  payload: number;
  /** For Falcon's raw rows: the payload above is the PADDED length, and the
   *  raw compressed signature is variable and strictly shorter. */
  payloadIsPaddedUpperBound?: true;
  source: string;
}

const MLKEM_512_PK = 800;
const MLKEM_768_PK = 1184;
const MLKEM_1024_PK = 1568;
const MLKEM_512_CT = 768;
const MLKEM_768_CT = 1088;
const MLKEM_1024_CT = 1568;

export const SPEC_SIZES: Readonly<Record<string, SpecSizes>> = {
  // FIPS 203, Table 3.
  ml_kem512: { publicKey: MLKEM_512_PK, secretKey: 1632, payload: MLKEM_512_CT, source: 'FIPS 203 Table 3' },
  ml_kem768: { publicKey: MLKEM_768_PK, secretKey: 2400, payload: MLKEM_768_CT, source: 'FIPS 203 Table 3' },
  ml_kem1024: { publicKey: MLKEM_1024_PK, secretKey: 3168, payload: MLKEM_1024_CT, source: 'FIPS 203 Table 3' },

  // FIPS 204, Table 2.
  ml_dsa44: { publicKey: 1312, secretKey: 2560, payload: 2420, source: 'FIPS 204 Table 2' },
  ml_dsa65: { publicKey: 1952, secretKey: 4032, payload: 3309, source: 'FIPS 204 Table 2' },
  ml_dsa87: { publicKey: 2592, secretKey: 4896, payload: 4627, source: 'FIPS 204 Table 2' },

  // FIPS 205, Table 2 (SHA2 parameter sets).
  slh_dsa_sha2_128s: { publicKey: 32, secretKey: 64, payload: 7856, source: 'FIPS 205 Table 2' },
  slh_dsa_sha2_128f: { publicKey: 32, secretKey: 64, payload: 17088, source: 'FIPS 205 Table 2' },
  slh_dsa_sha2_192s: { publicKey: 48, secretKey: 96, payload: 16224, source: 'FIPS 205 Table 2' },
  slh_dsa_sha2_192f: { publicKey: 48, secretKey: 96, payload: 35664, source: 'FIPS 205 Table 2' },
  slh_dsa_sha2_256s: { publicKey: 64, secretKey: 128, payload: 29792, source: 'FIPS 205 Table 2' },
  slh_dsa_sha2_256f: { publicKey: 64, secretKey: 128, payload: 49856, source: 'FIPS 205 Table 2' },

  // Falcon v1.2. The padded signature sizes are the ones the published tables
  // quote; the raw compressed ones are variable and have no single value.
  falcon512padded: { publicKey: 897, secretKey: 1281, payload: 666, source: 'Falcon v1.2 (secret-key encoding is the implementation’s)' },
  falcon1024padded: { publicKey: 1793, secretKey: 2305, payload: 1280, source: 'Falcon v1.2 (secret-key encoding is the implementation’s)' },
  falcon512: {
    publicKey: 897,
    secretKey: 1281,
    payload: 666,
    payloadIsPaddedUpperBound: true,
    source: 'Falcon v1.2 — raw compressed signatures are variable and shorter than the padded figure',
  },
  falcon1024: {
    publicKey: 1793,
    secretKey: 2305,
    payload: 1280,
    payloadIsPaddedUpperBound: true,
    source: 'Falcon v1.2 — raw compressed signatures are variable and shorter than the padded figure',
  },

  // Hybrids: compositions, written as the sums they are rather than as three
  // more numbers to believe. The secret key is a 32-byte seed the combiner
  // expands, which is an implementation choice and not a published figure.
  ml_kem768_x25519: {
    publicKey: MLKEM_768_PK + X25519_PUBLIC_KEY,
    secretKey: 32,
    payload: MLKEM_768_CT + X25519_PUBLIC_KEY,
    source: 'ML-KEM-768 concatenated with X25519 (X-Wing-style combiner)',
  },
  QSF_ml_kem768_p256: {
    publicKey: MLKEM_768_PK + P256_COMPRESSED_POINT,
    secretKey: 32,
    payload: MLKEM_768_CT + P256_COMPRESSED_POINT,
    source: 'ML-KEM-768 concatenated with an ECDH KEM on P-256',
  },
  QSF_ml_kem1024_p384: {
    publicKey: MLKEM_1024_PK + P384_COMPRESSED_POINT,
    secretKey: 32,
    payload: MLKEM_1024_CT + P384_COMPRESSED_POINT,
    source: 'ML-KEM-1024 concatenated with an ECDH KEM on P-384',
  },
};

/**
 * The stale Round-3 signature sizes that must NOT appear in derived output.
 *
 * Asserting a wrong value is absent is a different test from asserting the
 * right one is present, and it is the one that catches a regression to an
 * older library. Borrowed from `crypto-lab-dilithium-seal`, which introduced
 * this guard for exactly these two numbers.
 */
export const ROUND3_STALE_SIGNATURE_SIZES: Readonly<Record<string, number>> = {
  ml_dsa65: 3293,
  ml_dsa87: 4595,
};

/**
 * Every spec figure large enough to be unmistakable, for the invariant test
 * that no display path prints one.
 *
 * Bounded below at 256 deliberately. The SLH-DSA key lengths are 32, 48, 64 and
 * 128 bytes, and a grep for those in source would match array sizes, hex
 * widths and loop bounds everywhere without saying anything about whether a
 * size was typed in. A check that fires constantly is a check nobody reads.
 * The structural half of the invariant — that nothing importable by the page
 * imports this module at all — is what covers the small ones.
 */
export const DISTINCTIVE_SPEC_INTEGERS: readonly number[] = [
  ...new Set(
    Object.values(SPEC_SIZES)
      .flatMap((s) => [s.publicKey, s.secretKey, s.payload])
      .filter((n) => n >= 256)
  ),
].sort((a, b) => a - b);
