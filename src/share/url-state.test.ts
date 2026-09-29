import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSTRAINTS, type Constraints } from '../choose/rules';
import { decodeShareState, encodeShareState, shareUrl } from './url-state';

const roundTrip = (state: { constraints: Constraints; pinned: string[] }) =>
  decodeShareState(`#${encodeShareState(state)}`);

describe('a link reproduces the shortlist', () => {
  it('round-trips key-exchange constraints', () => {
    const state = {
      constraints: { ...DEFAULT_CONSTRAINTS, role: 'kem' as const, minCategory: 5 as const, wireBudget: 'tight' as const, hybridRequired: true },
      pinned: ['ml_kem768', 'ml_kem768_x25519'],
    };
    const back = roundTrip(state);
    expect(back.constraints.role).toBe('kem');
    expect(back.constraints.minCategory).toBe(5);
    expect(back.constraints.wireBudget).toBe('tight');
    expect(back.constraints.hybridRequired).toBe(true);
    expect(back.pinned).toEqual(state.pinned);
  });

  it('round-trips signature constraints', () => {
    const state = {
      constraints: {
        ...DEFAULT_CONSTRAINTS,
        role: 'signature' as const,
        signingFrequency: 'rare' as const,
        verificationFrequency: 'frequent' as const,
        sideChannelSensitive: true,
      },
      pinned: [],
    };
    const back = roundTrip(state);
    expect(back.constraints.role).toBe('signature');
    expect(back.constraints.signingFrequency).toBe('rare');
    expect(back.constraints.sideChannelSensitive).toBe(true);
  });

  it('is stable: encoding what was decoded gives the same string', () => {
    const encoded = encodeShareState({ constraints: DEFAULT_CONSTRAINTS, pinned: ['ml_dsa65'] });
    expect(encodeShareState(decodeShareState(`#${encoded}`))).toBe(encoded);
  });
});

describe('a hand-edited link loads the page rather than breaking it', () => {
  it('falls back to the defaults for junk', () => {
    const back = decodeShareState('#role=banana&cat=99&wire=enormous&sign=sometimes');
    expect(back.constraints.role).toBe(DEFAULT_CONSTRAINTS.role);
    expect(back.constraints.minCategory).toBe(DEFAULT_CONSTRAINTS.minCategory);
    expect(back.constraints.wireBudget).toBe(DEFAULT_CONSTRAINTS.wireBudget);
    expect(back.constraints.signingFrequency).toBe(DEFAULT_CONSTRAINTS.signingFrequency);
  });

  it('is the defaults for an empty hash', () => {
    expect(decodeShareState('')).toEqual({ constraints: DEFAULT_CONSTRAINTS, pinned: [] });
  });

  it('drops pins that are not parameter sets on this page', () => {
    const back = decodeShareState('#pin=ml_kem768,not_a_scheme,<script>');
    expect(back.pinned).toEqual(['ml_kem768']);
  });

  it('caps the pins at three, because the tray shows three', () => {
    const back = decodeShareState('#pin=ml_kem512,ml_kem768,ml_kem1024,ml_dsa44');
    expect(back.pinned).toHaveLength(3);
  });

  it('rejects a category that is not one the specs use', () => {
    // There is no NIST category 4. A link claiming one falls back rather than
    // filtering against a level that does not exist.
    expect(decodeShareState('#cat=4').constraints.minCategory).toBe(DEFAULT_CONSTRAINTS.minCategory);
  });
});

describe('what the link never carries', () => {
  it('encodes no derived figure', () => {
    // A URL that carried sizes would assert numbers instead of asking the
    // receiving browser to derive them, which is the distinction this whole
    // page is about.
    const encoded = encodeShareState({
      constraints: { ...DEFAULT_CONSTRAINTS, role: 'signature' },
      pinned: ['ml_dsa65', 'falcon512padded'],
    });
    expect(encoded).not.toMatch(/bytes|size|=\d{3,}/);
  });

  it('replaces any existing hash rather than stacking them', () => {
    const url = shareUrl('https://example.test/page#old=1', {
      constraints: DEFAULT_CONSTRAINTS,
      pinned: [],
    });
    expect(url.match(/#/g)).toHaveLength(1);
    expect(url).not.toContain('old=1');
  });
});
