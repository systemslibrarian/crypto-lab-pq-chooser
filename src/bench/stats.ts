/**
 * Summary statistics for the benchmark panel.
 *
 * Ported from `crypto-lab-dilithium-seal/src/bench/stats.ts` rather than
 * rewritten, because the part that is easy to get wrong is already right there.
 * Pure functions over an array of samples, kept away from anything that
 * measures or renders so they can be tested against known values instead of
 * against whatever the machine happened to do.
 *
 * ── Why the percentile method is spelled out ──────────────────────────────
 * "p95" is not one number; it is at least nine, depending on the estimator.
 * Reporting a percentile without saying how it was computed makes two runs
 * incomparable for a reason the reader cannot see. This module uses linear
 * interpolation between closest ranks — the R type-7 estimator, also NumPy's
 * and Excel's PERCENTILE default — for every percentile including the median,
 * so median and p95 are the same function at different p and there is one rule
 * to state rather than two.
 *
 * ── Why the median and p95 rather than the mean ───────────────────────────
 * ML-DSA signing is a rejection loop and Falcon signing runs a Gaussian
 * sampler: both have long right tails, and a mean sits somewhere no individual
 * operation actually lands. The median says what a typical operation costs; p95
 * says what the slow ones cost.
 */

export interface Summary {
  /** Number of measured samples (warm-up excluded). */
  n: number;
  min: number;
  median: number;
  mean: number;
  p95: number;
  max: number;
  /** Sample standard deviation (Bessel-corrected). 0 when n < 2. */
  stdDev: number;
  /** Operations per second implied by the MEDIAN, not the mean. */
  medianOpsPerSecond: number;
}

/**
 * The p-th percentile, 0 <= p <= 1, by linear interpolation between closest
 * ranks (R type-7).
 *
 * `samples` need not be sorted; it is copied before sorting so the caller's raw
 * measurements keep their original order — those are evidence and must not be
 * reordered in place.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new RangeError('percentile of an empty sample');
  if (!(p >= 0 && p <= 1)) throw new RangeError(`percentile p must be in [0, 1], got ${p}`);
  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}

export function mean(samples: readonly number[]): number {
  if (samples.length === 0) throw new RangeError('mean of an empty sample');
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

/** Sample standard deviation, Bessel-corrected. 0 for a single sample. */
export function stdDev(samples: readonly number[]): number {
  if (samples.length < 2) return 0;
  const m = mean(samples);
  const variance = samples.reduce((acc, x) => acc + (x - m) ** 2, 0) / (samples.length - 1);
  return Math.sqrt(variance);
}

export function summarize(samples: readonly number[]): Summary {
  if (samples.length === 0) throw new RangeError('cannot summarize an empty sample');
  const median = percentile(samples, 0.5);
  return {
    n: samples.length,
    min: Math.min(...samples),
    median,
    mean: mean(samples),
    p95: percentile(samples, 0.95),
    max: Math.max(...samples),
    stdDev: stdDev(samples),
    // Derived from the median for the same reason the median is reported.
    medianOpsPerSecond: median > 0 ? 1000 / median : 0,
  };
}
