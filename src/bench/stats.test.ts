/**
 * Summary statistics, against values worked out by hand rather than against
 * whatever the machine happened to do.
 *
 * The percentile estimator is the part worth pinning. "p95" is at least nine
 * different numbers depending on the method, so a test that only checked "p95
 * is somewhere near the top" would agree with every one of them.
 */

import { describe, expect, it } from 'vitest';
import { mean, percentile, stdDev, summarize } from './stats';

describe('percentile (R type-7, linear interpolation between closest ranks)', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('interpolates rather than picking a neighbour', () => {
    // rank = (n-1) * p = 9 * 0.95 = 8.55, between 9 and 10 -> 9.55.
    expect(percentile(ten, 0.95)).toBeCloseTo(9.55, 10);
  });

  it('is the median at p = 0.5', () => {
    expect(percentile(ten, 0.5)).toBeCloseTo(5.5, 10);
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
  });

  it('returns the extremes at 0 and 1', () => {
    expect(percentile(ten, 0)).toBe(1);
    expect(percentile(ten, 1)).toBe(10);
  });

  it('does not reorder the caller’s samples', () => {
    const raw = [5, 1, 4];
    percentile(raw, 0.5);
    expect(raw, 'raw samples are evidence and must keep their order').toEqual([5, 1, 4]);
  });

  it('handles a single sample', () => {
    expect(percentile([7], 0.95)).toBe(7);
  });

  it('refuses an empty sample and an out-of-range p', () => {
    expect(() => percentile([], 0.5)).toThrow(RangeError);
    expect(() => percentile([1], 1.5)).toThrow(RangeError);
    expect(() => percentile([1], -0.1)).toThrow(RangeError);
  });
});

describe('mean and standard deviation', () => {
  it('computes the mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(() => mean([])).toThrow(RangeError);
  });

  it('is Bessel-corrected, and zero for a single sample', () => {
    // variance = ((2-4)^2 + (4-4)^2 + (6-4)^2) / 2 = 4, sd = 2.
    expect(stdDev([2, 4, 6])).toBeCloseTo(2, 10);
    expect(stdDev([5])).toBe(0);
    expect(stdDev([])).toBe(0);
  });
});

describe('summarize', () => {
  it('reports the whole distribution, not a single number', () => {
    const s = summarize([1, 2, 3, 4, 100]);
    expect(s.n).toBe(5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(100);
    expect(s.median).toBe(3);
    expect(s.mean).toBe(22);
  });

  it('derives ops/sec from the MEDIAN, not the mean', () => {
    // The long right tail is exactly why: the mean here is 22 ms and the median
    // is 3 ms, and 333 ops/sec is the honest one.
    const s = summarize([1, 2, 3, 4, 100]);
    expect(s.medianOpsPerSecond).toBeCloseTo(1000 / 3, 6);
  });

  it('reports zero ops/sec rather than Infinity when the median is zero', () => {
    // A coarsened clock can produce all-zero samples. Dividing by that would
    // print Infinity operations per second, which is a measurement nobody took.
    expect(summarize([0, 0, 0]).medianOpsPerSecond).toBe(0);
  });

  it('refuses to summarize nothing', () => {
    expect(() => summarize([])).toThrow(RangeError);
  });
});
