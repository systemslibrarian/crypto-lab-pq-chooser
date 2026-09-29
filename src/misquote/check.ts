/**
 * Resolving a misquote against what the library actually produced, and the
 * break-it-yourself claim checker built on the same rule.
 *
 * A panel that lists wrong numbers is prose. One that contradicts them with its
 * own output is this lab's thesis applied to itself — so every verdict below is
 * a function of the derived rows and nothing else. When a figure has not been
 * derived yet, or the reader skipped it, the verdict is `pending`: the page
 * refuses to settle the argument using the published constant, because reaching
 * for the constant at the one moment the measurement is missing is exactly the
 * substitution the whole page is against.
 */

import type { DerivedRow, PayloadSize } from '../derive/types';
import { FAILURE_CODES, FAILURE_CAUSES, type FailureCode } from '../derive/codes';
import { SCHEMES_BY_ID } from '../derive/schemes';
import type { MisquoteRow } from './rows';

export type MisquoteStatus =
  /** The page's own output disagrees with the claim. The expected outcome. */
  | 'contradicted'
  /**
   * The page's own output AGREES with the claim. For rows 1-4 that would mean
   * the correction this panel exists to make is itself wrong, so it renders as
   * an alarm rather than quietly as a pass.
   */
  | 'confirms-misquote'
  /** Nothing to check against yet — not derived, or skipped. */
  | 'pending'
  /** Out of scope for this page's derivations, and the row says so. */
  | 'not-derivable';

export interface MisquoteVerdict {
  status: MisquoteStatus;
  /** What the library did, in the reader's browser. Empty when pending. */
  observed: string;
}

const payloadOf = (row: DerivedRow | undefined): PayloadSize | null =>
  row && row.state.status === 'derived' ? row.state.sizes.payload : null;

const publicKeyOf = (row: DerivedRow | undefined): number | null =>
  row && row.state.status === 'derived' ? row.state.sizes.publicKeyBytes : null;

/** A fixed length, or null when the row is a range or not derived. */
const fixedBytes = (payload: PayloadSize | null): number | null =>
  payload && payload.kind === 'fixed' ? payload.bytes : null;

export function resolveMisquote(
  row: MisquoteRow,
  rows: ReadonlyMap<string, DerivedRow>
): MisquoteVerdict {
  const check = row.check;

  if (check.kind === 'cited') {
    return {
      status: 'not-derivable',
      observed: `not derived here — cited from ${check.source}`,
    };
  }

  if (check.kind === 'value') {
    const derived = rows.get(check.schemeId);
    const actual =
      check.field === 'payload' ? fixedBytes(payloadOf(derived)) : publicKeyOf(derived);
    if (actual === null) return { status: 'pending', observed: '' };
    const label = SCHEMES_BY_ID.get(check.schemeId)?.label ?? check.schemeId;
    return actual === check.claimed
      ? {
          status: 'confirms-misquote',
          observed: `${label} produced ${actual} B — the claimed figure. This panel’s correction is the thing that is wrong.`,
        }
      : {
          status: 'contradicted',
          observed: `${label} produced ${actual} B here, not ${check.claimed} B.`,
        };
  }

  if (check.kind === 'variable') {
    const raw = payloadOf(rows.get(check.rawSchemeId));
    const padded = payloadOf(rows.get(check.paddedSchemeId));
    if (!raw || !padded) return { status: 'pending', observed: '' };
    const rawLabel = SCHEMES_BY_ID.get(check.rawSchemeId)?.label ?? check.rawSchemeId;
    const paddedLabel = SCHEMES_BY_ID.get(check.paddedSchemeId)?.label ?? check.paddedSchemeId;
    if (raw.kind === 'range') {
      const paddedText =
        padded.kind === 'fixed'
          ? `${padded.bytes} B every time`
          : `${padded.min}–${padded.max} B, which it should not be`;
      return {
        status: 'contradicted',
        observed: `${raw.samples} signatures from ${rawLabel} took ${raw.distinct} different lengths, ${raw.min}–${raw.max} B. ${paddedLabel} was ${paddedText}.`,
      };
    }
    return {
      status: 'confirms-misquote',
      observed: `${rawLabel} produced one length across every sample here (${raw.bytes} B), which is not what a compressed Falcon signature should do.`,
    };
  }

  // relation
  const derived = rows.get(check.schemeId);
  const payload = fixedBytes(payloadOf(derived));
  const publicKey = publicKeyOf(derived);
  if (payload === null || publicKey === null) return { status: 'pending', observed: '' };
  const label = SCHEMES_BY_ID.get(check.schemeId)?.label ?? check.schemeId;
  return payload > publicKey
    ? {
        status: 'confirms-misquote',
        observed: `${label}: ciphertext ${payload} B, public key ${publicKey} B — the ciphertext IS larger here.`,
      }
    : {
        status: 'contradicted',
        observed: `${label}: ciphertext ${payload} B, public key ${publicKey} B — ${
          payload === publicKey ? 'the same size.' : 'the ciphertext is smaller.'
        }`,
      };
}

// ── The break-it-yourself claim checker ─────────────────────────────────────

export type ClaimField = 'publicKey' | 'payload';

export interface ClaimResult {
  outcome: 'confirmed' | 'failed';
  /** Present when `outcome` is 'failed'. Named on the page, never swallowed. */
  code?: FailureCode;
  cause?: string;
  /** The sentence shown to the reader. Always says what the library produced. */
  message: string;
}

/**
 * Take a byte count a reader typed and let the real library answer it.
 *
 * This is the page's break-it-yourself interaction, and it is deliberately
 * unsympathetic: it will not confirm a number, it will only report what
 * `keygen()` / `encapsulate()` / `sign()` produced next to what was claimed.
 *
 * The `CLAIM_NOT_DERIVED` branch is the one worth reading twice. A reader can
 * point this at a set they skipped, and the temptation is to answer from the
 * published figure — which every spec table would give correctly. It refuses.
 * The claim "this page never shows you a number it did not compute" is worth
 * nothing if it lapses at the one moment the computation is missing.
 */
export function checkClaim(
  schemeId: string,
  field: ClaimField,
  claimedText: string,
  rows: ReadonlyMap<string, DerivedRow>
): ClaimResult {
  const scheme = SCHEMES_BY_ID.get(schemeId);
  const label = scheme?.label ?? schemeId;
  const what =
    field === 'publicKey' ? 'public key' : scheme?.kind === 'kem' ? 'ciphertext' : 'signature';

  const trimmed = claimedText.trim();
  // Decimal digits only. `Number('1e3')` is 1000 and `Number('0x40')` is 64 --
  // both are numbers JavaScript will happily parse and neither is what someone
  // typing a byte count meant, so accepting them would answer a question the
  // reader did not ask.
  const claimed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  if (!Number.isInteger(claimed) || claimed <= 0) {
    return {
      outcome: 'failed',
      code: FAILURE_CODES.CLAIM_MALFORMED,
      cause: FAILURE_CAUSES[FAILURE_CODES.CLAIM_MALFORMED],
      message: `“${trimmed || '(nothing)'}” is not a whole number of bytes, so there is nothing to check.`,
    };
  }

  const row = rows.get(schemeId);
  if (!row || row.state.status !== 'derived') {
    const skipped = row?.state.status === 'unavailable' ? row.state.cause : 'it has not been derived yet';
    return {
      outcome: 'failed',
      code: FAILURE_CODES.CLAIM_NOT_DERIVED,
      cause: FAILURE_CAUSES[FAILURE_CODES.CLAIM_NOT_DERIVED],
      message: `${label} has no derived ${what} on this device — ${skipped}. The published figure would answer this instantly, and using it here would undo the only thing this page claims.`,
    };
  }

  const sizes = row.state.sizes;
  if (field === 'publicKey') {
    const actual = sizes.publicKeyBytes;
    return actual === claimed
      ? { outcome: 'confirmed', message: `${label} produced a ${actual} B public key here. Your number matches what ran.` }
      : {
          outcome: 'failed',
          code: FAILURE_CODES.CLAIM_CONTRADICTED,
          cause: FAILURE_CAUSES[FAILURE_CODES.CLAIM_CONTRADICTED],
          message: `${label} produced a ${actual} B public key here, not ${claimed} B.`,
        };
  }

  const payload = sizes.payload;
  if (payload.kind === 'range') {
    const inside = claimed >= payload.min && claimed <= payload.max;
    return inside
      ? {
          outcome: 'confirmed',
          message: `${label} signatures measured ${payload.min}–${payload.max} B over ${payload.samples} samples, so ${claimed} B falls inside what was seen — but this scheme has no single signature size to be right about.`,
        }
      : {
          outcome: 'failed',
          code: FAILURE_CODES.CLAIM_CONTRADICTED,
          cause: FAILURE_CAUSES[FAILURE_CODES.CLAIM_CONTRADICTED],
          message: `${label} signatures measured ${payload.min}–${payload.max} B over ${payload.samples} samples. ${claimed} B was not among them — and no single number is this scheme's signature size.`,
        };
  }

  return payload.bytes === claimed
    ? { outcome: 'confirmed', message: `${label} produced a ${payload.bytes} B ${what} here. Your number matches what ran.` }
    : {
        outcome: 'failed',
        code: FAILURE_CODES.CLAIM_CONTRADICTED,
        cause: FAILURE_CAUSES[FAILURE_CODES.CLAIM_CONTRADICTED],
        message: `${label} produced a ${payload.bytes} B ${what} here, not ${claimed} B.`,
      };
}
