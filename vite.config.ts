import { defineConfig, configDefaults } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-pq-chooser/
export default defineConfig({
  base: '/crypto-lab-pq-chooser/',
  worker: {
    // The derivation worker imports @noble/post-quantum as ES modules. An IIFE
    // worker bundle cannot carry those imports, so the format is pinned here
    // rather than left to the default.
    format: 'es',
  },
  test: {
    // Colocated unit tests only; keep the Playwright specs in e2e/ out of the
    // Vitest run (master template, section 1).
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // SLH-DSA-256s signs in ~4.4 s on the machine this was written on, and the
    // KAT suite signs with every one of the nineteen parameter sets. The
    // default 5 s budget is a measurement of that scheme, not of the test.
    testTimeout: 180_000,
  },
});
