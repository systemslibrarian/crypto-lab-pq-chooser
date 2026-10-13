/**
 * The implementation-risk column.
 *
 * Not editorial judgement. Every row names something an implementation of that
 * scheme has actually had to deal with, and points at the lab that demonstrates
 * it — because "high complexity" as a bare adjective is the kind of claim a
 * table can carry for years without anyone noticing it stopped being true.
 *
 * This column exists precisely because the rest of the page cannot see it. A
 * size is derived, a timing is measured, a round trip is checked — and not one
 * of those three can tell you that a sampler leaks the key through power draw.
 * That gap is this lab's negative claim, and the column is where the gap is
 * made visible rather than left as an absence.
 */

export interface RiskRow {
  /** Which family or scheme the risk belongs to. */
  subject: string;
  /** One line naming the risk. */
  risk: string;
  /** The detail a reader needs to take it seriously. */
  detail: string;
  /** Where to go and see it: fleet labs and primary research. */
  evidence: readonly { label: string; href: string }[];
  /**
   * Set where this page's own output is part of the evidence. The SLH-DSA row
   * is the shape every row should aspire to: the derivation log above supplies
   * the measurement that makes the claim checkable here and now.
   */
  measuredHere?: string;
}

const lab = (slug: string, label: string): { label: string; href: string } => ({
  label,
  href: `https://systemslibrarian.github.io/crypto-lab-${slug}/`,
});

export const RISK_ROWS: readonly RiskRow[] = [
  {
    subject: 'Falcon / FN-DSA',
    risk: 'Precision-sensitive Gaussian sampler; side-channel assurance is implementation-specific.',
    detail:
      'The implementation measured here uses floating-point Gaussian sampling. A 12 October 2026 preprint reports fixed-point Falcon-512/1024 signing on Cortex-M4 (ePrint 2026/2431), with precision and memory tradeoffs. That signer is not evaluated here, and fixed point alone does not certify side-channel resistance. The chooser therefore retains its conservative exclusion. A separate preprint reports power-trace key recovery against PQClean Falcon signing on Cortex-M4 (ePrint 2026/2124).',
    evidence: [lab('falcon-seal', 'Falcon Seal — the sampler exhibit'), lab('pq-families', 'PQ Families'), { label: 'Flying, Not Floating — preprint, 12 October 2026', href: 'https://eprint.iacr.org/2026/2431' }],
  },
  {
    subject: 'SLH-DSA',
    risk: 'Signing cost. The stateless guarantee is paid for in signing time.',
    detail:
      'SLH-DSA needs no state and makes no lattice assumption — its security rests on the hash function alone. The `s` parameter sets buy their smaller signatures with signing time measured in hundreds of milliseconds to seconds, which is a deployment constraint long before it is a cryptographic one.',
    evidence: [lab('pq-families', 'PQ Families'), lab('sphincs-ledger', 'SPHINCS+ Ledger')],
    measuredHere:
      'The derivation log on this page timed every one of those signatures in your browser. Compare an SLH-DSA `s` row with the `f` row beside it.',
  },
  {
    subject: 'ML-KEM',
    risk: 'Implicit rejection — decapsulation never fails.',
    detail:
      'FIPS 203 specifies that a bad ciphertext returns a pseudorandom key rather than an error. The caller gets no signal at all, so an integration that expects an exception on corruption will silently proceed with the wrong key. The fixture further down this page does exactly that, and every check passes.',
    evidence: [lab('kem-trap', 'KEM Trap — its whole subject')],
    measuredHere:
      'Demonstrated on this page: "What this table cannot see" corrupts one ciphertext byte and decapsulates it.',
  },
  {
    subject: 'ML-KEM',
    risk: 'KyberSlash — division by q leaks through timing.',
    detail:
      'Reference implementations divided by the modulus q = 3329 in `poly_tomsg` and `poly_compress`. Where the division is not constant-time, the timing depends on secret data and the secret key can be recovered. Patched widely in 2024; the shape of the bug — an innocuous-looking division on a secret — is the transferable lesson.',
    evidence: [lab('kyberslash', 'KyberSlash'), lab('pq-families', 'PQ Families')],
  },
];

/** The cross-links out. The chooser answers *which one* and hands off every *why*. */
export const RELATED_DEMOS: readonly { label: string; href: string; why: string }[] = [
  { ...lab('pq-families', 'PQ Families'), why: 'Why lattices won, and the five-family landscape these rows sit inside.' },
  { ...lab('falcon-seal', 'Falcon Seal'), why: 'Falcon’s sampler, and why its signatures are variable-length.' },
  { ...lab('dilithium-seal', 'Dilithium Seal'), why: 'ML-DSA in depth, and the Round-3-versus-FIPS-204 distinction behind rows 1 and 2 of the misquote panel.' },
  { ...lab('hybrid-guide', 'Hybrid Guide'), why: 'Whether to go hybrid at all, and the migration timeline.' },
  { ...lab('kem-trap', 'KEM Trap'), why: 'ML-KEM implicit rejection — what integrations do with the silence.' },
  { ...lab('kyberslash', 'KyberSlash'), why: 'The timing leak, in the code that had it.' },
];
