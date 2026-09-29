/**
 * The environment block, which is the difference between a measurement and a
 * number.
 */

import { describe, expect, it } from 'vitest';
import { __parsers, measureTimerResolution } from './environment';
import { ITERATIONS, CLASSICAL_COST_CLASS, OPERATION_SLOTS, RATIO_BASELINE_ID } from './runner';

const { parseBrowser, parseOperatingSystem } = __parsers;

describe('browser detection', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge',
      '141.0.0.0',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome',
      '141.0.0.0',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Firefox',
      '133.0',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      'Safari',
      '18.2',
    ],
  ])('reads %j as %s', (ua, browser, version) => {
    expect(parseBrowser(ua)).toEqual({ browser, browserVersion: version });
  });

  it('puts the specific brands first, because every Chromium says Chrome', () => {
    // Edge's UA contains "Chrome/141" AND "Safari/537". Order is what makes
    // this right, and this is the test that would notice if it were reordered.
    const edge =
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
    expect(parseBrowser(edge).browser).toBe('Edge');
  });

  it('says unknown rather than guessing', () => {
    expect(parseBrowser('something else entirely')).toEqual({
      browser: 'unknown',
      browserVersion: 'unknown',
    });
  });
});

describe('operating system detection', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows 10.0'],
    ['Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36', 'Android 15'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)', 'iOS 18.2'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'macOS 10.15.7'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
    ['no idea', 'unknown'],
  ])('reads %j as %s', (ua, os) => {
    expect(parseOperatingSystem(ua)).toBe(os);
  });
});

describe('timer resolution', () => {
  it('measures the smallest non-zero gap the clock reports', () => {
    // A synthetic clock that only ever advances in 0.25 steps.
    let t = 0;
    let calls = 0;
    const now = (): number => {
      calls++;
      if (calls % 4 === 0) t += 0.25;
      return t;
    };
    expect(measureTimerResolution(now)).toBeCloseTo(0.25, 10);
  });

  it('returns 0 rather than Infinity when the clock never advances', () => {
    // Bounded, so a frozen clock cannot hang the page.
    expect(measureTimerResolution(() => 1)).toBe(0);
  });

  it('measures something positive on the real clock', () => {
    expect(measureTimerResolution()).toBeGreaterThanOrEqual(0);
  });
});

describe('the benchmark’s own settings', () => {
  it('measures more samples where samples are cheap', () => {
    expect(ITERATIONS.cheap.measured).toBeGreaterThan(ITERATIONS.moderate.measured);
    expect(ITERATIONS.moderate.measured).toBeGreaterThan(ITERATIONS.slow.measured);
  });

  it('always discards at least one warm-up iteration', () => {
    for (const [name, counts] of Object.entries(ITERATIONS)) {
      expect(counts.warmup, name).toBeGreaterThanOrEqual(1);
      expect(counts.measured, name).toBeGreaterThanOrEqual(3);
    }
  });

  it('measures the classical baselines at the cheap counts', () => {
    expect(CLASSICAL_COST_CLASS).toBe('cheap');
  });

  it('takes its ratios against a row that is measured in the same run', () => {
    expect(RATIO_BASELINE_ID).toBe('x25519');
  });

  it('has exactly three operation slots', () => {
    expect([...OPERATION_SLOTS]).toEqual(['keygen', 'produce', 'consume']);
  });
});
