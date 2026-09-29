/**
 * Chooser constraints and pins, in the URL.
 *
 * A shortlist is an argument, and an argument you cannot send to a colleague
 * has to be re-made by hand or screenshotted. The location hash carries the
 * constraints and the pinned scheme ids so a link reproduces the same
 * shortlist — from the reader's own derivation, on their own device.
 *
 * WHAT NEVER GOES IN THE URL: key material, and derived figures. Not because
 * they would be secret — the worker never hands the main thread a key — but
 * because a URL that carried sizes would be a link that asserts numbers instead
 * of a link that asks the receiving browser to derive them. That is the whole
 * distinction this page is about, and it would be an odd place to abandon it.
 *
 * Unknown or malformed values fall back to the default rather than throwing: a
 * hand-edited link should load the page, not break it.
 */

import { DEFAULT_CONSTRAINTS, type Constraints, type Frequency, type Role, type WireBudget } from '../choose/rules';
import { SCHEMES_BY_ID } from '../derive/schemes';

export interface ShareState {
  constraints: Constraints;
  pinned: string[];
}

const ROLES: readonly Role[] = ['kem', 'signature'];
const BUDGETS: readonly WireBudget[] = ['tight', 'moderate', 'any'];
const FREQUENCIES: readonly Frequency[] = ['rare', 'frequent'];
const CATEGORIES = [1, 2, 3, 5] as const;

const oneOf = <T,>(allowed: readonly T[], value: string | null, fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;

export function encodeShareState(state: ShareState): string {
  const c = state.constraints;
  const params = new URLSearchParams();
  params.set('role', c.role);
  params.set('cat', String(c.minCategory));
  params.set('wire', c.wireBudget);
  if (c.role === 'signature') {
    params.set('sign', c.signingFrequency);
    params.set('verify', c.verificationFrequency);
    if (c.sideChannelSensitive) params.set('sidechannel', '1');
  } else if (c.hybridRequired) {
    params.set('hybrid', '1');
  }
  if (state.pinned.length) params.set('pin', state.pinned.join(','));
  return params.toString();
}

export function decodeShareState(hash: string): ShareState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const role = oneOf(ROLES, params.get('role'), DEFAULT_CONSTRAINTS.role);
  const rawCategory = Number(params.get('cat'));
  const minCategory = (CATEGORIES as readonly number[]).includes(rawCategory)
    ? (rawCategory as Constraints['minCategory'])
    : DEFAULT_CONSTRAINTS.minCategory;

  const pinned = (params.get('pin') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => SCHEMES_BY_ID.has(id))
    .slice(0, 3);

  return {
    constraints: {
      role,
      minCategory,
      wireBudget: oneOf(BUDGETS, params.get('wire'), DEFAULT_CONSTRAINTS.wireBudget),
      hybridRequired: params.get('hybrid') === '1',
      signingFrequency: oneOf(FREQUENCIES, params.get('sign'), DEFAULT_CONSTRAINTS.signingFrequency),
      verificationFrequency: oneOf(FREQUENCIES, params.get('verify'), DEFAULT_CONSTRAINTS.verificationFrequency),
      sideChannelSensitive: params.get('sidechannel') === '1',
    },
    pinned,
  };
}

/** The link to hand someone, built from the page's current location. */
export function shareUrl(base: string, state: ShareState): string {
  const withoutHash = base.split('#')[0];
  return `${withoutHash}#${encodeShareState(state)}`;
}
