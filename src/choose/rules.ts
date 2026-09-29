/**
 * The chooser.
 *
 * The page's name promises a decision, and for a while the page did not make
 * one: it proved and compared, and left a visitor to join the size matrix, the
 * benchmark, the handshake calculator and the risk table in their head. This
 * module is the join, done explicitly.
 *
 * FOUR RULES GOVERN IT, and each one is a thing a chooser usually gets wrong.
 *
 *  1. IT IS PURE. No DOM, no clock, no randomness, no fetch. It takes the
 *     derived rows the page is already showing, an optional benchmark run, and
 *     a set of constraints; it returns a shortlist. Everything it says can be
 *     recomputed from what is on screen, which is what makes the reasons
 *     checkable rather than persuasive.
 *
 *  2. IT READS NO SIZE CONSTANT. Every byte comparison comes from a derived
 *     row. A set that has not been derived cannot be ranked, and says so rather
 *     than being ranked from its published figure — the same rule the rest of
 *     the page is built on, applied where it would be most tempting to bend.
 *
 *  3. THERE IS NO SCORE. Constraints are FILTERS, which either exclude a scheme
 *     or do not, and the ordering within what survives is by ONE stated
 *     criterion at a time, in a stated priority order. A weighted score would
 *     collapse the tradeoff into a number, and the tradeoff is the lesson.
 *
 *  4. IT RETURNS A SHORTLIST, NOT A WINNER, and it says what it cannot decide.
 *     Ecosystem support, certification status, library maturity, hardware
 *     acceleration and deployment policy all outrank everything below, and none
 *     of them is visible from here.
 */

import { SCHEMES, SCHEMES_BY_ID, type Scheme, type SchemeKind } from '../derive/schemes';
import type { DerivedRow } from '../derive/types';
import type { BenchmarkRow, BenchmarkRun, OperationSlot } from '../bench/runner';

export type Role = SchemeKind;

/** How much room there is on the wire. Bands, because bytes are not a slider. */
export type WireBudget = 'tight' | 'moderate' | 'any';
/** How often the private operation runs. Signatures only. */
export type Frequency = 'rare' | 'frequent';

export interface Constraints {
  role: Role;
  /**
   * The lowest NIST category acceptable, as each scheme's own specification
   * claims it. The categories do not line up across schemes, which is why this
   * filters on the scheme's own claim and the shortlist repeats the caveat.
   */
  minCategory: 1 | 2 | 3 | 5;
  /** The deployment requires a classical component alongside the PQ one. */
  hybridRequired: boolean;
  wireBudget: WireBudget;
  /** Signatures only; ignored for key agreement. */
  signingFrequency: Frequency;
  verificationFrequency: Frequency;
  /**
   * The signing key lives somewhere an attacker can measure — a smartcard, an
   * HSM under power analysis, a shared host. Excludes the schemes whose known
   * implementation difficulty is exactly that.
   */
  sideChannelSensitive: boolean;
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  role: 'kem',
  minCategory: 3,
  hybridRequired: false,
  wireBudget: 'moderate',
  signingFrequency: 'frequent',
  verificationFrequency: 'frequent',
  sideChannelSensitive: false,
};

export interface Candidate {
  schemeId: string;
  label: string;
  family: Scheme['family'];
  nistCategory: string;
  /** Why it survived the constraints that were set. One line each. */
  reasons: string[];
  /** The one thing that would take it off the list. Every candidate has one. */
  caveat: string;
  /** Where to go and check that caveat. */
  evidence?: { label: string; href: string };
  /**
   * The bytes that matter for THIS role, from derived rows. Null when the
   * parameter set has not been derived on this device.
   */
  bytes: { label: string; bytes: number }[] | null;
  /** Total of the above, for the ordering. Null when not derived. */
  wireBytes: number | null;
  /** Measured timings, only when the benchmark has covered this set. */
  timings: { slot: OperationSlot; operation: string; medianMs: number }[] | null;
}

export interface Exclusion {
  schemeId: string;
  label: string;
  because: string;
}

export interface Shortlist {
  role: Role;
  candidates: Candidate[];
  excluded: Exclusion[];
  /** The ordering criteria that were applied, in the order they were applied. */
  orderedBy: string[];
  /**
   * False until a benchmark run covers at least one candidate. The panel says
   * so rather than substituting a canned timing, because a device speed nobody
   * measured is exactly the kind of inherited figure this page exists against.
   */
  performanceIncluded: boolean;
  /** Parameter sets that could not be ranked because nothing derived them. */
  notDerived: string[];
  cannotDecide: string[];
}

/**
 * What a table of derived bytes and measured milliseconds is structurally
 * unable to see. Shown beside every shortlist, not in a footnote.
 */
export const CANNOT_DECIDE: readonly string[] = [
  'Ecosystem support — whether your TLS stack, HSM, CA or language runtime implements the set at all.',
  'Certification and policy — FIPS validation, CNSA 2.0 timelines, and whatever your auditor requires.',
  'Implementation quality — whether the library you would actually ship is constant-time, reviewed and maintained.',
  'Hardware acceleration — a scheme that is slow here may be the fast one on a chip with the right instructions.',
  'Interoperability — a shortlist of one is useless if the other end does not speak it.',
];

/** The wire bytes that matter for a role, read off a derived row. */
function bytesFor(scheme: Scheme, row: DerivedRow | undefined): Candidate['bytes'] {
  if (!row || row.state.status !== 'derived') return null;
  const { publicKeyBytes, payload } = row.state.sizes;
  // A variable-length signature is charged at the top of its measured range.
  // Budgeting from the bottom of a range would be budgeting for the best case.
  const payloadBytes = payload.kind === 'fixed' ? payload.bytes : payload.max;
  const payloadLabel =
    scheme.kind === 'kem'
      ? 'ciphertext'
      : payload.kind === 'fixed'
        ? 'signature'
        : 'signature (largest of the measured samples)';
  return [
    { label: scheme.kind === 'kem' ? 'public key (the key share)' : 'public key (in the certificate)', bytes: publicKeyBytes },
    { label: payloadLabel, bytes: payloadBytes },
  ];
}

/**
 * Wire-budget bands, as multiples of the classical thing being replaced.
 *
 * Not typed-in byte thresholds: X25519 puts 32 + 32 bytes on the wire and
 * ECDSA P-256 about 64 + 64, so the bands are stated as "within Nx of the
 * classical pair" and the classical figure is the one constant here that is
 * not a post-quantum size. It is a property of the curve, not of any set in
 * this table, and it is named rather than hidden.
 */
export const CLASSICAL_WIRE_BYTES: Record<Role, number> = { kem: 64, signature: 128 };

const BUDGET_MULTIPLE: Record<WireBudget, number> = {
  tight: 20,
  moderate: 60,
  any: Number.POSITIVE_INFINITY,
};

/** The one caveat each family carries, and where to go and see it. */
const FAMILY_CAVEAT: Record<
  Scheme['family'],
  { caveat: string; evidence?: { label: string; href: string } }
> = {
  'ML-KEM': {
    caveat:
      'Decapsulation never reports a failure: a corrupted ciphertext returns a pseudorandom key, so the caller has to detect corruption somewhere else.',
    evidence: { label: 'KEM Trap', href: 'https://systemslibrarian.github.io/crypto-lab-kem-trap/' },
  },
  'ML-DSA': {
    caveat:
      'Signing is a rejection loop, so its cost has a long right tail — read the p95 column, not just the median.',
    evidence: { label: 'Dilithium Seal', href: 'https://systemslibrarian.github.io/crypto-lab-dilithium-seal/' },
  },
  'SLH-DSA': {
    caveat:
      'Signatures are an order of magnitude larger than the lattice schemes, and the small-signature sets pay for it in signing time measured in seconds.',
    evidence: { label: 'SPHINCS+ Ledger', href: 'https://systemslibrarian.github.io/crypto-lab-sphincs-ledger/' },
  },
  'Falcon / FN-DSA': {
    caveat:
      'Signing runs a floating-point Gaussian sampler, which is materially harder to make constant-time; FIPS 206 is still in development.',
    evidence: { label: 'Falcon Seal', href: 'https://systemslibrarian.github.io/crypto-lab-falcon-seal/' },
  },
  Hybrid: {
    caveat:
      'You are shipping and maintaining two key exchanges, and the combiner is a third thing to get right.',
    evidence: { label: 'Hybrid Guide', href: 'https://systemslibrarian.github.io/crypto-lab-hybrid-guide/' },
  },
};

const timingsFor = (
  schemeId: string,
  run: BenchmarkRun | null
): Candidate['timings'] => {
  const row: BenchmarkRow | undefined = run?.rows.find((r) => r.id === schemeId);
  if (!row || row.operations.length === 0) return null;
  return row.operations.map((o) => ({
    slot: o.slot,
    operation: o.operation,
    medianMs: o.summary.median,
  }));
};

const categoryOf = (scheme: Scheme): number => {
  const match = scheme.nistCategory.match(/\d/);
  return match ? Number(match[0]) : 0;
};

/**
 * Apply the constraints and return the shortlist.
 *
 * The order below IS the algorithm, and it is meant to be read: exclusions
 * first, each with the reason it applied, then an ordering by one criterion at
 * a time. Nothing is weighted against anything else.
 */
export function chooseSchemes(
  constraints: Constraints,
  rows: ReadonlyMap<string, DerivedRow>,
  benchmark: BenchmarkRun | null = null
): Shortlist {
  const excluded: Exclusion[] = [];
  const exclude = (scheme: Scheme, because: string): void => {
    excluded.push({ schemeId: scheme.id, label: scheme.label, because });
  };

  const inRole = SCHEMES.filter((s) => s.kind === constraints.role);
  const survivors: Scheme[] = [];

  for (const scheme of inRole) {
    // The two raw Falcon rows and their padded twins are the same scheme in two
    // encodings. A shortlist that offered both would be offering one choice
    // twice, so the padded encoding is the one that appears (it is the one a
    // protocol with a fixed-width field would use) and the raw row is named as
    // the alternative in the reasons.
    if (scheme.variableLength) {
      exclude(scheme, 'the same scheme appears as its fixed-length padded encoding, which is what a protocol with a fixed-width signature field would carry');
      continue;
    }
    if (categoryOf(scheme) < constraints.minCategory) {
      exclude(scheme, `its specification claims NIST category ${scheme.nistCategory}, below the floor you set`);
      continue;
    }
    if (constraints.hybridRequired && scheme.family !== 'Hybrid') {
      exclude(scheme, 'it carries no classical component, and you required a hybrid');
      continue;
    }
    if (constraints.sideChannelSensitive && scheme.family === 'Falcon / FN-DSA') {
      exclude(scheme, 'its signing uses a floating-point Gaussian sampler, and you said the signing key is somewhere an attacker can measure');
      continue;
    }
    if (constraints.role === 'signature' && constraints.signingFrequency === 'frequent' && scheme.costClass === 'slow') {
      exclude(scheme, 'this parameter set signs in hundreds of milliseconds to seconds, and you said signing is frequent');
      continue;
    }
    survivors.push(scheme);
  }

  // Wire budget is applied against DERIVED bytes, so a set nobody has derived
  // is not silently dropped and not silently kept: it is reported.
  const notDerived: string[] = [];
  const withBytes = survivors.map((scheme) => {
    const bytes = bytesFor(scheme, rows.get(scheme.id));
    const wireBytes = bytes ? bytes.reduce((a, b) => a + b.bytes, 0) : null;
    return { scheme, bytes, wireBytes };
  });

  const budgetCeiling = CLASSICAL_WIRE_BYTES[constraints.role] * BUDGET_MULTIPLE[constraints.wireBudget];
  const affordable = withBytes.filter((entry) => {
    if (entry.wireBytes === null) {
      notDerived.push(entry.scheme.label);
      return false;
    }
    if (entry.wireBytes > budgetCeiling) {
      exclude(
        entry.scheme,
        `it puts ${entry.wireBytes.toLocaleString('en-US')} bytes on the wire, over the ${budgetCeiling.toLocaleString('en-US')}-byte ceiling your budget implies`
      );
      return false;
    }
    return true;
  });

  // ── Ordering. One criterion at a time, stated. ─────────────────────────────
  const orderedBy: string[] = [];
  const ordered = [...affordable];

  if (constraints.role === 'signature' && constraints.verificationFrequency === 'frequent') {
    // Verification cost first, where it has been measured; otherwise this
    // criterion does not apply and does not silently reorder anything.
    const verifyMs = (id: string): number | null =>
      timingsFor(id, benchmark)?.find((t) => t.slot === 'consume')?.medianMs ?? null;
    if (ordered.some((e) => verifyMs(e.scheme.id) !== null)) {
      orderedBy.push('measured verification time, for the sets the benchmark covered');
      ordered.sort((a, b) => (verifyMs(a.scheme.id) ?? Infinity) - (verifyMs(b.scheme.id) ?? Infinity));
    }
  }
  orderedBy.push('derived bytes on the wire, smallest first');
  ordered.sort((a, b) => (a.wireBytes ?? Infinity) - (b.wireBytes ?? Infinity));

  // ── Diversity. A shortlist of three sets from one family is one option. ────
  const seenFamilies = new Set<string>();
  const shortlisted: typeof ordered = [];
  for (const entry of ordered) {
    if (seenFamilies.has(entry.scheme.family)) continue;
    seenFamilies.add(entry.scheme.family);
    shortlisted.push(entry);
    if (shortlisted.length === 3) break;
  }
  // If one family is all that survives, show up to three of it rather than one.
  if (shortlisted.length < 2) {
    for (const entry of ordered) {
      if (shortlisted.includes(entry)) continue;
      shortlisted.push(entry);
      if (shortlisted.length === 3) break;
    }
  }
  if (shortlisted.length > 1) {
    orderedBy.push('one parameter set per family, so the shortlist is a real choice rather than the same tradeoff three times');
  }

  const candidates: Candidate[] = shortlisted.map(({ scheme, bytes, wireBytes }) => {
    const reasons: string[] = [];
    reasons.push(`Its specification claims NIST category ${scheme.nistCategory}, at or above your floor of ${constraints.minCategory}.`);
    if (wireBytes !== null) {
      reasons.push(
        `${wireBytes.toLocaleString('en-US')} bytes on the wire, derived here — ${(wireBytes / CLASSICAL_WIRE_BYTES[constraints.role]).toFixed(0)}× the classical pair it would replace.`
      );
    }
    if (constraints.hybridRequired) {
      reasons.push('It carries a classical key exchange alongside the post-quantum one, which is what you required.');
    }
    if (constraints.role === 'signature' && constraints.signingFrequency === 'frequent') {
      reasons.push('It signs fast enough to be used per-request rather than per-release.');
    }
    if (constraints.role === 'signature' && scheme.family === 'SLH-DSA') {
      reasons.push('Its security rests on the hash function alone — no lattice assumption, no structured algebra.');
    }
    if (scheme.family === 'Falcon / FN-DSA') {
      reasons.push('The raw compressed encoding of the same scheme is smaller still, at the cost of a variable-length signature — see the matrix.');
    }
    const familyCaveat = FAMILY_CAVEAT[scheme.family];
    return {
      schemeId: scheme.id,
      label: scheme.label,
      family: scheme.family,
      nistCategory: scheme.nistCategory,
      reasons,
      caveat: familyCaveat.caveat,
      evidence: familyCaveat.evidence,
      bytes,
      wireBytes,
      timings: timingsFor(scheme.id, benchmark),
    };
  });

  return {
    role: constraints.role,
    candidates,
    excluded,
    orderedBy,
    performanceIncluded: candidates.some((c) => c.timings !== null),
    notDerived: [...new Set(notDerived)],
    cannotDecide: [...CANNOT_DECIDE],
  };
}

/**
 * The sentence that keeps the two tracks from being read as interchangeable.
 *
 * Asserted by the claims suite, because it is the one thing a visitor who uses
 * only the chooser has to walk away with.
 */
export const ROLE_NOTE: Record<Role, string> = {
  kem: 'A KEM agrees a shared secret; it proves nothing about who you agreed it with. That is the signature’s job — a deployment needs both.',
  signature:
    'A signature proves who produced something, to anyone, later; it agrees no shared secret. That is the KEM’s job — a deployment needs both.',
};

export const ROLE_LABEL: Record<Role, string> = {
  kem: 'Key exchange',
  signature: 'Signatures',
};

/** Exported for the panel's scheme links; keeps the label lookup in one place. */
export const labelOf = (schemeId: string): string => SCHEMES_BY_ID.get(schemeId)?.label ?? schemeId;
