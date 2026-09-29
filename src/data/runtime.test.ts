/**
 * The version string the page prints, against the dependency it actually has.
 *
 * A version that drifts from the code it describes is the same defect as a size
 * that drifts from the scheme it describes, which is the defect this whole lab
 * is about. It would be a strange page to leave that one unchecked on.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RUNTIME_FACTS } from './runtime';
import { FAILURE_CAUSES, FAILURE_CODES } from '../derive/codes';

const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { dependencies: Record<string, string> };

describe('RUNTIME_FACTS', () => {
  it('names a dependency this lab actually has', () => {
    expect(manifest.dependencies[RUNTIME_FACTS.library.name]).toBeDefined();
  });

  it('states a version compatible with the declared range', () => {
    // "0.7.x" against a "^0.7.1" range: the major.minor must agree, which is
    // the part a reader of the page would be misled by if it drifted.
    const declared = manifest.dependencies[RUNTIME_FACTS.library.name].replace(/^[\^~]/, '');
    const [major, minor] = declared.split('.');
    expect(RUNTIME_FACTS.library.version).toBe(`${major}.${minor}.x`);
  });

  it('says what "real" means without reaching for marketing', () => {
    expect(RUNTIME_FACTS.realness).toMatch(/in this browser/);
    expect(RUNTIME_FACTS.realness).not.toMatch(/secure|unbreakable|military|enterprise/i);
  });
});

describe('failure codes', () => {
  it('gives every code a plain-language cause', () => {
    for (const code of Object.values(FAILURE_CODES)) {
      expect(FAILURE_CAUSES[code], code).toBeTruthy();
      expect(FAILURE_CAUSES[code].length, code).toBeGreaterThan(20);
    }
  });

  it('has no cause for a code that does not exist', () => {
    const codes = new Set<string>(Object.values(FAILURE_CODES));
    expect(Object.keys(FAILURE_CAUSES).filter((k) => !codes.has(k))).toEqual([]);
  });

  it('names each code after itself, so a UI string and a constant cannot diverge', () => {
    for (const [key, value] of Object.entries(FAILURE_CODES)) {
      expect(value).toBe(key);
    }
  });

  it('states a cause rather than restating the code', () => {
    for (const [code, cause] of Object.entries(FAILURE_CAUSES)) {
      expect(cause, code).not.toContain(code);
    }
  });
});
