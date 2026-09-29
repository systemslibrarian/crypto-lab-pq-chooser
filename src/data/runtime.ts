/**
 * Facts about what is actually running, stated once.
 *
 * The version is pinned here rather than imported from `package.json` so the
 * bundle does not carry the whole manifest, and `runtime.test.ts` asserts it
 * matches the dependency range in `package.json`. A version string that drifts
 * from the code it describes is the same defect as a size that drifts from the
 * scheme it describes — which is the defect this whole lab is about.
 */
export const RUNTIME_FACTS = {
  library: {
    name: '@noble/post-quantum',
    version: '0.7.x',
  },
  /**
   * What "real" means on this page, in one sentence, for the honesty banner.
   */
  realness:
    'Every size, handshake total and timing on this page was produced by @noble/post-quantum and the Web Crypto API in this browser, in this tab, just now.',
} as const;
