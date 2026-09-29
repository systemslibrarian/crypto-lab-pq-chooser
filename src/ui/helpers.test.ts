/**
 * The formatting rules, which is where a number stops being a measurement.
 */

import { describe, expect, it } from 'vitest';
import { belowResolution, bytes, duration, escapeHTML, noFigure } from './helpers';

describe('escapeHTML', () => {
  it('escapes every character that could close a tag or an attribute', () => {
    expect(escapeHTML('<img src="x" onerror=\'y\'>&')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;'
    );
  });

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    expect(escapeHTML('&lt;')).toBe('&amp;lt;');
  });
});

describe('bytes', () => {
  it('separates thousands, because 278432 reads as kilobytes without it', () => {
    expect(bytes(278432)).toBe('278,432 B');
  });

  it('uses a non-breaking space so a figure never wraps away from its unit', () => {
    expect(bytes(32)).toBe('32 B');
  });
});

describe('duration', () => {
  it('scales the unit to the magnitude', () => {
    expect(duration(0.42)).toBe('0.42 ms');
    expect(duration(42)).toBe('42 ms');
    expect(duration(4200)).toBe('4.20 s');
  });

  it('refuses to print a figure the clock could not resolve', () => {
    // The whole point: a median under the timer's granularity is not a fast
    // measurement, it is an absent one. Printing 0.000 ms would invent it.
    expect(duration(0.04, 0.1)).toBe('< 0.100 ms');
    expect(duration(0.4, 0.1)).toBe('0.40 ms');
  });

  it('prints normally when no resolution is known', () => {
    expect(duration(0.04)).toBe('0.04 ms');
  });
});

describe('belowResolution', () => {
  it('is false when the resolution is unknown', () => {
    expect(belowResolution(0, 0)).toBe(false);
  });

  it('is true only strictly below', () => {
    expect(belowResolution(0.09, 0.1)).toBe(true);
    expect(belowResolution(0.1, 0.1)).toBe(false);
  });
});

describe('noFigure', () => {
  it('gives a screen reader the reason and a sighted reader the dash', () => {
    const html = noFigure('not derived yet');
    expect(html).toContain('not derived yet');
    expect(html).toContain('aria-hidden="true"');
    // The dash itself must never be the only thing announced.
    expect(html.indexOf('not derived yet')).toBeLessThan(html.indexOf('aria-hidden'));
  });

  it('escapes the reason', () => {
    expect(noFigure('<x>')).toContain('&lt;x&gt;');
  });
});
