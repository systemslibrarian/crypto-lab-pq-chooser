/**
 * The environment a benchmark ran in.
 *
 * Ported from `crypto-lab-dilithium-seal/src/bench/environment.ts`. A timing
 * without this block is not a measurement, it is a number: "ML-DSA-65 signs in
 * 4 ms" is meaningless without which browser, which machine, how many samples
 * and what clock — and it is actively misleading once a reader carries it to a
 * different device. Every result this page shows carries the whole block, and
 * there is no code path that produces one without it.
 *
 * Everything here is read from the runtime rather than asserted. Where the
 * browser will not say, the field says "unknown" rather than guessing.
 *
 * This runs inside the derivation worker, where `navigator` is a
 * `WorkerNavigator`. It carries `userAgent` and `hardwareConcurrency`, which is
 * everything used below.
 */

import { RUNTIME_FACTS } from '../data/runtime';

export interface BenchmarkEnvironment {
  browser: string;
  browserVersion: string;
  operatingSystem: string;
  /** navigator.hardwareConcurrency, or 0 when the runtime withholds it. */
  logicalProcessors: number;
  /** Which clock produced the samples, and what it is capable of here. */
  timerSource: string;
  /**
   * Measured granularity of that clock, in milliseconds.
   *
   * Browsers deliberately coarsen `performance.now()` when the page is not
   * cross-origin isolated — 0.1 ms in current Chromium. This page is served
   * from GitHub Pages without COOP/COEP, so it gets the coarsened clock, and
   * X25519 derives in well under that. A harness that does not know this
   * reports sub-millisecond operations as free: the samples quantise to 0.0 and
   * 0.1, and the MEDIAN lands on exactly zero.
   */
  timerResolutionMs: number;
  /** True when SharedArrayBuffer-grade timer precision is available. */
  crossOriginIsolated: boolean;
  library: string;
  libraryVersion: string;
  /** ISO 8601, UTC. */
  timestamp: string;
  userAgent: string;
}

/**
 * Browser family and version from the UA string.
 *
 * Order matters: every Chromium browser also says "Chrome", and Chrome says
 * "Safari", so the more specific brands have to be tested first.
 */
function parseBrowser(ua: string): { browser: string; browserVersion: string } {
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [browser, re] of patterns) {
    const match = ua.match(re);
    if (match) return { browser, browserVersion: match[1] };
  }
  return { browser: 'unknown', browserVersion: 'unknown' };
}

function parseOperatingSystem(ua: string): string {
  const patterns: Array<[string, RegExp]> = [
    ['Windows', /Windows NT ([\d.]+)/],
    ['Android', /Android ([\d.]+)/],
    ['iOS', /(?:iPhone|iPad).*OS ([\d_]+)/],
    ['macOS', /Mac OS X ([\d_]+)/],
    ['Linux', /(Linux)/],
  ];
  for (const [os, re] of patterns) {
    const match = ua.match(re);
    if (match) {
      const version = match[1].replace(/_/g, '.');
      return os === 'Linux' ? 'Linux' : `${os} ${version}`;
    }
  }
  return 'unknown';
}

/**
 * The smallest non-zero gap `performance.now()` will report here.
 *
 * Measured rather than assumed: the value is a browser policy that changes with
 * cross-origin isolation and with anti-fingerprinting settings. The loop is
 * bounded so it cannot hang if the clock never advances.
 */
export function measureTimerResolution(now: () => number = () => performance.now()): number {
  let smallest = Infinity;
  for (let attempt = 0; attempt < 10; attempt++) {
    const start = now();
    let next = start;
    let spins = 0;
    while (next === start && spins < 1_000_000) {
      next = now();
      spins++;
    }
    if (next > start) smallest = Math.min(smallest, next - start);
  }
  return Number.isFinite(smallest) ? smallest : 0;
}

export function collectEnvironment(): BenchmarkEnvironment {
  const ua = navigator.userAgent;
  const isolated = Boolean((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated);
  return {
    ...parseBrowser(ua),
    operatingSystem: parseOperatingSystem(ua),
    // 0, not a guess: some browsers withhold this to reduce fingerprinting.
    logicalProcessors: navigator.hardwareConcurrency ?? 0,
    timerSource: 'performance.now() — DOMHighResTimeStamp, monotonic',
    timerResolutionMs: measureTimerResolution(),
    crossOriginIsolated: isolated,
    library: RUNTIME_FACTS.library.name,
    libraryVersion: RUNTIME_FACTS.library.version,
    timestamp: new Date().toISOString(),
    userAgent: ua,
  };
}

/** Exported for the test that checks the parsers against real UA strings. */
export const __parsers = { parseBrowser, parseOperatingSystem };
