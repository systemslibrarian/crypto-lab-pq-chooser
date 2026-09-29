/**
 * The fixture behind this lab's negative claim.
 *
 * THE CLAIM: a derivation that succeeds says nothing about whether the thing it
 * derived is safe to use. Every check this page performs can report success
 * while the property a reader would assume is being violated.
 *
 * THE EXHIBIT: ML-KEM decapsulation cannot fail. FIPS 203 specifies *implicit
 * rejection* — a ciphertext that does not re-encrypt correctly does not raise
 * an error, it returns a pseudorandom key derived from the ciphertext and the
 * recipient's rejection secret `z`. So a caller who corrupts a ciphertext gets
 * back a full-length shared secret, no exception, no status code, and nothing
 * in the return value that distinguishes it from the real one.
 *
 * Every check this page can perform on that state passes: the ciphertext was
 * derived, decapsulation completed, the returned key is the right length, and
 * no error was raised. The page still has to report the state honestly, so the
 * verdict reads as both at once — DECAPSULATED, AND WRONG.
 *
 * `crypto-lab-kem-trap` is the lab whose whole subject is what integrations do
 * with this; here it is one fixture, and its job is to be a state in which this
 * page's own checks are all green and the reader is still holding the wrong key.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { bytesEqual } from './adapters';

export interface KemFixtureCheck {
  label: string;
  /** What the check actually observed, in the reader's browser. */
  observed: string;
  /** Every check in this fixture passes. That is the exhibit, not an accident. */
  passed: boolean;
}

export interface KemFixtureResult {
  kemLabel: string;
  cipherTextBytes: number;
  /** Which byte was corrupted, and how. Named so the reader can repeat it. */
  flippedByteIndex: number;
  flippedFrom: number;
  flippedTo: number;
  /** The four checks the page performs, all of which pass. */
  checks: KemFixtureCheck[];
  /** False. Nothing above could have told you. */
  secretsMatch: boolean;
  honestSecretPrefix: string;
  recoveredSecretPrefix: string;
  /** True when decapsulation raised nothing — the absence that is the exhibit. */
  raisedNoError: boolean;
}

const hexPrefix = (bytes: Uint8Array, n: number): string =>
  Array.from(bytes.slice(0, n), (b) => b.toString(16).padStart(2, '0')).join(' ');

/**
 * Encapsulate honestly, corrupt exactly one ciphertext byte, decapsulate, and
 * report what every check saw.
 *
 * `flipByteIndex` is taken modulo the ciphertext length so the caller can hand
 * in a counter. Flipping a different byte does not change the outcome, and
 * being able to try several is the point: a reader who presses the button four
 * times has established that this is the mechanism rather than a coincidence.
 */
export function runKemFixture(flipByteIndex: number): KemFixtureResult {
  const kem = ml_kem768;
  const { publicKey, secretKey } = kem.keygen();
  const { cipherText, sharedSecret } = kem.encapsulate(publicKey);

  const corrupted = Uint8Array.from(cipherText);
  const index = ((flipByteIndex % corrupted.length) + corrupted.length) % corrupted.length;
  const before = corrupted[index];
  // One bit of one byte. The smallest corruption there is.
  corrupted[index] = before ^ 0x01;

  let recovered: Uint8Array | null = null;
  let raisedNoError = true;
  let thrown = '';
  try {
    recovered = kem.decapsulate(corrupted, secretKey);
  } catch (err) {
    raisedNoError = false;
    thrown = err instanceof Error ? err.message : String(err);
  }

  const secretsMatch = recovered !== null && bytesEqual(recovered, sharedSecret);

  const checks: KemFixtureCheck[] = [
    {
      label: 'Ciphertext derived',
      observed: `${cipherText.length} bytes from a real encapsulate()`,
      passed: true,
    },
    {
      label: 'Decapsulation completed',
      observed: raisedNoError ? 'returned normally, raised nothing' : `threw: ${thrown}`,
      passed: raisedNoError,
    },
    {
      label: 'Shared secret is full length',
      observed: recovered ? `${recovered.length} bytes` : 'no value returned',
      passed: recovered !== null && recovered.length === sharedSecret.length,
    },
    {
      label: 'Failure code reported by ML-KEM',
      observed: 'none — FIPS 203 specifies implicit rejection, so there is no code to report',
      passed: true,
    },
  ];

  return {
    kemLabel: 'ML-KEM-768',
    cipherTextBytes: cipherText.length,
    flippedByteIndex: index,
    flippedFrom: before,
    flippedTo: corrupted[index],
    checks,
    secretsMatch,
    honestSecretPrefix: hexPrefix(sharedSecret, 8),
    recoveredSecretPrefix: recovered ? hexPrefix(recovered, 8) : '—',
    raisedNoError,
  };
}

/**
 * The negative claim, in one sentence, scoped to what is on this page.
 *
 * Scoped to the construction, never to the field: "ML-KEM decapsulation reports
 * no failure" is true and is what the fixture shows. "Post-quantum KEMs cannot
 * detect corruption" would be false — an AEAD over the derived key detects it
 * immediately, which is what a protocol built on ML-KEM actually does.
 *
 * One wording, exported once, rendered by the panel and asserted by
 * `e2e/claims.spec.ts`. Delete it and assertion 3 of the negative-claim test
 * fails.
 */
export const NEGATIVE_CLAIM =
  'A derivation that succeeds says nothing about whether the scheme is safe to use. Every check on this page passed here, and none of them could have failed: ML-KEM decapsulation reports no error for a corrupted ciphertext, so nothing this page measures — not a size, not a timing, not a completed round trip — can tell a rejected ciphertext from an accepted one.';
