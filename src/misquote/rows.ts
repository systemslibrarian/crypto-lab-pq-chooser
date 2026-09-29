/**
 * Commonly misquoted post-quantum numbers — exactly five rows.
 *
 * These are the five a fleet-wide audit earned. The panel does not grow by
 * invention: three of them are other labs' recorded corrections, cited to the
 * lab that made them, one is this fleet's most recent, and one is a trap in the
 * shape of the data with no incident behind it, included because it is the one
 * a reader is most likely to walk into unaided.
 *
 * THE PANEL LIVES HERE AND NOWHERE ELSE. A second copy in a lab that derives
 * nothing would be one wording in two places with nothing binding them — and
 * the copy would be the one unable to check itself, since checking requires the
 * derived output.
 *
 * WHAT IS TYPED IN AND WHAT IS NOT. A `claimed` field holds a number that is
 * WRONG; that is what a misquote is, and it has to be written down to be
 * refuted. Not one row states a correct size. The correct value is whatever the
 * library produced in the reader's browser a moment ago, and
 * `src/misquote/rows.test.ts` fails if any spec figure for a scheme this page
 * derives appears in this file.
 */

export type MisquoteCheck =
  /** The claimed byte count is simply not what the library emits. */
  | { kind: 'value'; schemeId: string; field: 'payload' | 'publicKey'; claimed: number }
  /** The claim is that a length is fixed. Two library exports settle it. */
  | { kind: 'variable'; rawSchemeId: string; paddedSchemeId: string }
  /** The claim is about a relation between two derived figures. */
  | { kind: 'relation'; schemeId: string; relation: 'ciphertext-larger-than-public-key' }
  /** Not derivable here, and the row says so rather than implying it was checked. */
  | { kind: 'cited'; source: string };

export interface MisquoteRow {
  /** 1..5, as the audit numbered them. */
  n: number;
  /** The claim as it circulates. */
  misquote: string;
  /** What is true, phrased so the derived output can finish the sentence. */
  correction: string;
  /** Where this correction comes from. Every row has one. */
  evidence: string;
  check: MisquoteCheck;
}

export const MISQUOTE_ROWS: readonly MisquoteRow[] = [
  {
    n: 1,
    misquote: 'An ML-DSA-65 signature is 3293 bytes.',
    correction:
      'That is the Round-3 Dilithium3 size. FIPS 204 widened the commitment hash, and ML-DSA-65 signatures grew by 16 bytes.',
    evidence:
      'crypto-lab-dilithium-seal asserts the stale number must not appear — src/__tests__/sources.test.ts and e2e/provenance.spec.ts.',
    check: { kind: 'value', schemeId: 'ml_dsa65', field: 'payload', claimed: 3293 },
  },
  {
    n: 2,
    misquote: 'An ML-DSA-87 signature is 4595 bytes.',
    correction:
      'Also a Round-3 number (Dilithium5). The same commitment-hash change added 32 bytes at this parameter set.',
    evidence: 'Same guard, same lab: crypto-lab-dilithium-seal.',
    check: { kind: 'value', schemeId: 'ml_dsa87', field: 'payload', claimed: 4595 },
  },
  {
    n: 3,
    misquote: 'A Falcon-512 signature is 666 bytes.',
    correction:
      'That is the PADDED encoding, which is fixed. Raw compressed Falcon-512 signatures are variable-length, and the table above measures the spread over real signatures rather than quoting a range.',
    evidence:
      'Corrected across crypto-lab-falcon-seal, crypto-lab-pq-families and crypto-lab-multivariate on 2026-09-29; falcon-seal holds the shared footnote wording.',
    check: { kind: 'variable', rawSchemeId: 'falcon512', paddedSchemeId: 'falcon512padded' },
  },
  {
    n: 4,
    misquote: 'An ML-KEM ciphertext is always larger than its public key.',
    correction:
      'It holds at ML-KEM-512 and ML-KEM-768 and then stops holding. At ML-KEM-1024 the two are the same size — the pattern is an accident of the compression parameters, not a property of the scheme.',
    evidence:
      'No incident behind this one. It is a trap in the shape of the data, and the derived row settles it in one comparison.',
    check: { kind: 'relation', schemeId: 'ml_kem1024', relation: 'ciphertext-larger-than-public-key' },
  },
  {
    n: 5,
    misquote: 'A UOV public key is "278 KB".',
    correction:
      'The byte count’s leading digits read as kilobytes. ov-Ip has (n, m, q) = (112, 44, 256), so the public key is m·n(n+1)/2 = 44 × 6328 bytes — which is 272 KiB, not 278.',
    evidence:
      'crypto-lab-multivariate/src/data.ts documents this exact error and its correction. UOV is not one of the nineteen sets this page derives, so this row is cited, not measured — and it says so rather than borrowing the authority of the rows that were.',
    check: { kind: 'cited', source: 'crypto-lab-multivariate' },
  },
];
