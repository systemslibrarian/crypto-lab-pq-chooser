/**
 * The bridge from a scheme id to real `@noble/post-quantum` output.
 *
 * Every figure the page shows is produced here, by running the primitive and
 * reading `.length` off what came back. Nothing in this file states a size.
 *
 * The round trip is not optional. Each adapter decapsulates or verifies what it
 * just produced and refuses to return sizes unless that agreed, because a
 * length read off the output of a function nobody checked is a measurement of
 * an unknown function. A failed round trip becomes `DERIVE_FAILED`; it can
 * never enter the printable `DerivedSizes` state.
 */

import { ml_kem512, ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import {
  slh_dsa_sha2_128f,
  slh_dsa_sha2_128s,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_192s,
  slh_dsa_sha2_256f,
  slh_dsa_sha2_256s,
} from '@noble/post-quantum/slh-dsa.js';
import {
  falcon512,
  falcon512padded,
  falcon1024,
  falcon1024padded,
} from '@noble/post-quantum/falcon.js';
import {
  ml_kem768_x25519,
  QSF_ml_kem768_p256,
  QSF_ml_kem1024_p384,
} from '@noble/post-quantum/hybrid.js';

import { FALCON_SAMPLES, SCHEMES_BY_ID } from './schemes';
import type { DerivedSizes, PayloadSize } from './types';

/** The minimum a KEM has to provide for this page to measure it. */
export interface KemLike {
  keygen: (seed?: Uint8Array) => { publicKey: Uint8Array; secretKey: Uint8Array };
  encapsulate: (publicKey: Uint8Array) => { cipherText: Uint8Array; sharedSecret: Uint8Array };
  decapsulate: (cipherText: Uint8Array, secretKey: Uint8Array) => Uint8Array;
}

/** The minimum a signature scheme has to provide. */
export interface SignerLike {
  keygen: (seed?: Uint8Array) => { publicKey: Uint8Array; secretKey: Uint8Array };
  sign: (msg: Uint8Array, secretKey: Uint8Array) => Uint8Array;
  verify: (sig: Uint8Array, msg: Uint8Array, publicKey: Uint8Array) => boolean;
}

/**
 * The library objects, keyed by the id the registry uses.
 *
 * The keys are the library's own export names. That is not decoration: it means
 * a reader can take any row of this table straight to `@noble/post-quantum` and
 * call the thing that produced it.
 */
export const KEMS: Readonly<Record<string, KemLike>> = {
  ml_kem512,
  ml_kem768,
  ml_kem1024,
  ml_kem768_x25519,
  QSF_ml_kem768_p256,
  QSF_ml_kem1024_p384,
} as unknown as Record<string, KemLike>;

export const SIGNERS: Readonly<Record<string, SignerLike>> = {
  ml_dsa44,
  ml_dsa65,
  ml_dsa87,
  falcon512,
  falcon512padded,
  falcon1024,
  falcon1024padded,
  slh_dsa_sha2_128f,
  slh_dsa_sha2_128s,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_192s,
  slh_dsa_sha2_256f,
  slh_dsa_sha2_256s,
} as unknown as Record<string, SignerLike>;

/**
 * The message every signature on this page signs.
 *
 * Fixed, because a signature's length must not depend on what was signed for
 * the comparison to mean anything — and where it DOES vary (Falcon), the
 * variation has to come from the sampler rather than from the input. The Falcon
 * range sampler therefore varies the message deliberately and says so.
 */
export const DERIVATION_MESSAGE = new TextEncoder().encode(
  'crypto-lab-pq-chooser: every figure on this page came from output like this one.'
);

function encodeSample(index: number): Uint8Array {
  return new TextEncoder().encode(`crypto-lab-pq-chooser sample ${index}`);
}

/**
 * Measure one signature scheme's signature length over N signatures.
 *
 * Returns `fixed` when every sample agreed and `range` when they did not, which
 * is how the padded and raw Falcon encodings end up rendering differently
 * without either being told which it is. The registry's `variableLength` flag
 * says what the scheme's spec claims; this says what the library did. A row
 * where those two disagree is worth knowing about, and `schemes.test.ts`
 * asserts they agree for all nineteen sets.
 */
export function measureSignatureLength(
  signer: SignerLike,
  publicKey: Uint8Array,
  secretKey: Uint8Array,
  samples: number
): PayloadSize {
  const lengths: number[] = [];
  for (let i = 0; i < samples; i++) {
    const message = encodeSample(i);
    const signature = signer.sign(message, secretKey);
    if (!signer.verify(signature, message, publicKey)) {
      throw new Error(`signature sample ${i + 1} failed to verify`);
    }
    lengths.push(signature.length);
  }
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const distinct = new Set(lengths).size;
  return distinct === 1
    ? { kind: 'fixed', bytes: min }
    : { kind: 'range', min, max, samples, distinct };
}

/** Derive a KEM row, but return no printable sizes unless it round-trips. */
export function deriveKemSizes(kem: KemLike, schemeId: string, started = performance.now()): DerivedSizes {
  const { publicKey, secretKey } = kem.keygen();
  const { cipherText, sharedSecret } = kem.encapsulate(publicKey);
  const recovered = kem.decapsulate(cipherText, secretKey);
  if (!bytesEqual(recovered, sharedSecret)) {
    throw new Error(`${schemeId} decapsulation did not recover the encapsulated shared secret`);
  }
  return {
    publicKeyBytes: publicKey.length,
    secretKeyBytes: secretKey.length,
    payload: { kind: 'fixed', bytes: cipherText.length },
    sharedSecretBytes: sharedSecret.length,
    roundTripOk: true,
    elapsedMs: performance.now() - started,
  };
}

/** Derive a signature row, but return no printable sizes unless every sample verifies. */
export function deriveSignatureSizes(
  signer: SignerLike,
  schemeId: string,
  variableLength: boolean,
  started = performance.now()
): DerivedSizes {
  const { publicKey, secretKey } = signer.keygen();
  const signature = signer.sign(DERIVATION_MESSAGE, secretKey);
  if (!signer.verify(signature, DERIVATION_MESSAGE, publicKey)) {
    throw new Error(`${schemeId} signature failed to verify`);
  }

  // Only the schemes whose signatures can vary pay for the extra samples. For
  // everything else one signature settles the length, and sixteen SLH-DSA-256s
  // signatures would cost over a minute to learn nothing.
  const payload = variableLength
    ? measureSignatureLength(signer, publicKey, secretKey, FALCON_SAMPLES)
    : ({ kind: 'fixed', bytes: signature.length } as const);

  return {
    publicKeyBytes: publicKey.length,
    secretKeyBytes: secretKey.length,
    payload,
    roundTripOk: true,
    elapsedMs: performance.now() - started,
  };
}

/**
 * Derive one parameter set.
 *
 * Throws with the library's own message on failure; the worker turns that into
 * a `DERIVE_FAILED` row carrying the message verbatim. It does not catch here,
 * because a swallowed cause is what makes a failed row indistinguishable from
 * an empty one.
 */
export function deriveScheme(schemeId: string): DerivedSizes {
  const scheme = SCHEMES_BY_ID.get(schemeId);
  if (!scheme) throw new Error(`no such parameter set: ${schemeId}`);

  const started = performance.now();

  if (scheme.kind === 'kem') {
    const kem = KEMS[schemeId];
    if (!kem) throw new Error(`@noble/post-quantum exports no KEM named ${schemeId}`);
    return deriveKemSizes(kem, schemeId, started);
  }

  const signer = SIGNERS[schemeId];
  if (!signer) throw new Error(`@noble/post-quantum exports no signer named ${schemeId}`);
  return deriveSignatureSizes(signer, schemeId, scheme.variableLength === true, started);
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
