/**
 * The invariants, enforced rather than described.
 *
 *   1. No display path reads a size constant.
 *   2. A row that has not derived shows no number.
 *   3. Falcon renders a range, never a point.
 *   4. Spec constants exist only in test oracles.
 *
 * Invariant 1 is enforced three ways, because each alone has a hole:
 *
 *   STRUCTURALLY — nothing the page can reach imports `spec-sizes.ts`. This is
 *   the airtight half, and it is what covers the small figures (SLH-DSA's 32,
 *   48, 64 and 128-byte keys) that a text search could never distinguish from
 *   an array length.
 *
 *   TEXTUALLY — no distinctive spec integer appears as a NUMERIC LITERAL in a
 *   module that renders. String contents and comments are stripped first, by a
 *   scanner rather than a regex, because `ml_kem768` and `'ML-KEM-768'` both
 *   contain 768 and neither is a size.
 *
 *   BY OUTPUT — the page's own initial HTML, before anything has been derived,
 *   contains no spec figure at all. That closes the hole the textual check
 *   leaves open, where a renderer hardcodes `'1184 B'` as a string.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SCHEMES, SLOW_SCHEME_IDS, CATEGORY_UNALIGNED_NOTE, FALCON_SAMPLES } from './schemes';
import { DISTINCTIVE_SPEC_INTEGERS, SPEC_SIZES } from './spec-sizes';
import { MISQUOTE_ROWS } from '../misquote/rows';
import { renderMatrix, renderRow } from '../ui/table';
import { renderMisquotePanel } from '../ui/misquote-panel';
import { renderClaimPanel } from '../ui/claim-panel';
import { renderWirePanel } from '../ui/wire-panel';
import { renderBenchPanel } from '../ui/bench-panel';
import { renderNegativeClaimPanel } from '../ui/negative-claim';
import { renderLogPanel } from '../ui/log';
import {
  renderHero,
  renderIntroLong,
  renderRelated,
  renderRiskPanel,
  renderScope,
  renderSectionNav,
} from '../ui/static-sections';
import { renderChooserPanel } from '../ui/chooser-panel';
import { renderComparePanel } from '../ui/compare-tray';
import { DEFAULT_CONSTRAINTS } from '../choose/rules';
import { FAILURE_CODES } from './codes';

const SRC = new URL('..', import.meta.url).pathname;

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

/**
 * Remove comments and the TEXT of every string, including the static chunks of
 * a template literal, while KEEPING the code inside `${ ... }`.
 *
 * A regex cannot do this: a template literal's interpolations are code and have
 * to survive, while its literal chunks must not. Written as a state machine so
 * the distinction is visible rather than implied.
 */
export function stripStringsAndComments(source: string): string {
  let out = '';
  let i = 0;
  // Depth of nested `${ }` inside template literals, so a `}` knows whether it
  // closes an interpolation or is just a brace in code.
  const templateStack: number[] = [];

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      out += ' ';
      continue;
    }
    if (c === '`') {
      i++;
      // Walk the template, emitting only the interpolated code.
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === '`') {
          i++;
          break;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          i += 2;
          templateStack.push(1);
          let depth = 1;
          let expr = '';
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            if (depth > 0) expr += source[i];
            i++;
          }
          templateStack.pop();
          // Recurse: an interpolation may itself hold strings and templates.
          out += ` ${stripStringsAndComments(expr)} `;
          continue;
        }
        i++;
      }
      out += ' ';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

describe('invariant 4 — spec constants exist only in test oracles', () => {
  it('nothing the page can reach imports spec-sizes', () => {
    const offenders = sourceFiles()
      .filter((file) => !file.endsWith('spec-sizes.ts'))
      .filter((file) => /from\s+['"][^'"]*spec-sizes(\.[jt]s)?['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(
      offenders,
      'spec-sizes.ts is the test oracle; a module the page bundles must never import it'
    ).toEqual([]);
  });
});

describe('invariant 1 — no display path reads a size constant', () => {
  const DISPLAY_DIRS = ['ui/', 'derive/schemes.ts', 'derive/codes.ts', 'wire/', 'misquote/', 'data/', 'bench/'];
  const displayFiles = sourceFiles()
    .map((file) => relative(SRC, file))
    .filter((rel) => DISPLAY_DIRS.some((d) => rel.startsWith(d)));

  it('has display modules to check', () => {
    expect(displayFiles.length).toBeGreaterThan(8);
  });

  it.each(displayFiles)('%s contains no spec figure as a numeric literal', (rel) => {
    const code = stripStringsAndComments(readFileSync(join(SRC, rel), 'utf8'));
    const found = DISTINCTIVE_SPEC_INTEGERS.filter((n) =>
      new RegExp(`(?<![\\w.])${n}(?![\\w.])`).test(code)
    );
    expect(found, `${rel} names a published size in code`).toEqual([]);
  });

  it('the stripper keeps interpolated code and drops literal text', () => {
    // Guarding the guard: a stripper that swallowed `${...}` would make the
    // check above pass on everything while measuring nothing.
    const stripped = stripStringsAndComments('const a = `ML-KEM-768 ${1184} B`; // 2420\n');
    expect(stripped).toContain('1184');
    expect(stripped).not.toContain('768');
    expect(stripped).not.toContain('2420');
  });
});

describe('invariant 1, by output — the page shows no figure before it derives one', () => {
  /**
   * The five misquote CLAIMS are removed before the scan, and that is the one
   * exception in this file.
   *
   * Row 3 quotes "A Falcon-512 signature is 666 bytes", and 666 is a published
   * size. The row exists to put that claim on screen and have the derived
   * output contradict it; a panel about misquoted numbers that could not print
   * the misquoted number would have nothing to say. The removal is driven from
   * the data, so a new row can only ever exempt its own quoted claim — never
   * anything else on the page.
   */
  it('the initial render contains no published size anywhere', () => {
    let html = [
      renderHero(),
      renderIntroLong(),
      renderSectionNav(),
      renderChooserPanel(DEFAULT_CONSTRAINTS),
      renderComparePanel(),
      renderMatrix(),
      renderLogPanel(),
      renderMisquotePanel(),
      renderClaimPanel(),
      renderWirePanel(),
      renderBenchPanel(),
      renderRiskPanel(),
      renderNegativeClaimPanel(),
      renderScope(),
      renderRelated(),
    ].join('\n');

    for (const row of MISQUOTE_ROWS) html = html.split(row.misquote).join(' [quoted claim] ');

    const found = DISTINCTIVE_SPEC_INTEGERS.filter((n) =>
      new RegExp(`(?<![\\w.-])${n}(?![\\w.])`).test(html)
    );
    expect(found, 'a figure appeared on the page that nothing had derived').toEqual([]);
  });
});

describe('invariant 2 — a row that has not derived shows no number', () => {
  it.each(SCHEMES.map((s) => [s.id, s.label] as const))(
    '%s renders no figure while pending, deriving, or unavailable (%s)',
    (id) => {
      const scheme = SCHEMES.find((s) => s.id === id)!;
      const spec = SPEC_SIZES[id];
      const states = [
        { status: 'pending' } as const,
        { status: 'deriving' } as const,
        {
          status: 'unavailable',
          code: FAILURE_CODES.DERIVE_SKIPPED,
          cause: 'not measured, skipped by you',
        } as const,
        {
          status: 'unavailable',
          code: FAILURE_CODES.DERIVE_FAILED,
          cause: 'the derivation threw: synthetic failure for this test',
        } as const,
      ];
      for (const state of states) {
        const html = renderRow(scheme, state);
        for (const figure of [spec.publicKey, spec.secretKey, spec.payload]) {
          expect(
            html.includes(String(figure)),
            `${id} leaked ${figure} while ${state.status}`
          ).toBe(false);
        }
        // ...and it says why rather than rendering an unexplained blank.
        expect(html).toMatch(/not derived|being measured|skipped|threw/);
      }
    }
  );

  it('a DERIVE_FAILED row names the thrown cause', () => {
    // This state is not reachable from the browser, so the claims suite cannot
    // cover it. The renderer is driven here directly instead.
    const html = renderRow(SCHEMES[0], {
      status: 'unavailable',
      code: FAILURE_CODES.DERIVE_FAILED,
      cause: 'the derivation threw: RangeError from the library',
    });
    expect(html).toContain(FAILURE_CODES.DERIVE_FAILED);
    expect(html).toContain('RangeError from the library');
  });
});

describe('the registry says what it means', () => {
  it('flags exactly the two raw Falcon rows as variable-length', () => {
    const variable = SCHEMES.filter((s) => s.variableLength).map((s) => s.id);
    expect(variable).toEqual(['falcon512', 'falcon1024']);
  });

  it('marks exactly the three SLH-DSA s sets as slow, and puts them last', () => {
    expect(SLOW_SCHEME_IDS).toEqual([
      'slh_dsa_sha2_128s',
      'slh_dsa_sha2_192s',
      'slh_dsa_sha2_256s',
    ]);
    const lastThree = SCHEMES.slice(-3).map((s) => s.id);
    expect(lastThree, 'the wait is content, so the slow sets must derive last').toEqual([
      ...SLOW_SCHEME_IDS,
    ]);
  });

  it('gives every parameter set a unique id and label', () => {
    expect(new Set(SCHEMES.map((s) => s.id)).size).toBe(SCHEMES.length);
    expect(new Set(SCHEMES.map((s) => s.label)).size).toBe(SCHEMES.length);
  });

  it('samples Falcon enough times for a range to mean something', () => {
    expect(FALCON_SAMPLES).toBeGreaterThanOrEqual(8);
  });

  it('states the unaligned-category caveat with the example that makes it concrete', () => {
    // The caption is prose and prose drifts. Tying it to the data means the day
    // ML-DSA-44's category changes, the caption fails rather than lying.
    expect(CATEGORY_UNALIGNED_NOTE).toContain('category 2');
    expect(SCHEMES.find((s) => s.id === 'ml_dsa44')!.nistCategory).toBe('2');
    expect(SCHEMES.find((s) => s.id === 'falcon512')!.nistCategory).toBe('1');
    expect(SCHEMES.find((s) => s.id === 'slh_dsa_sha2_128s')!.nistCategory).toBe('1');
  });
});
