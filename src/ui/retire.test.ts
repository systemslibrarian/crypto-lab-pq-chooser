import { describe, expect, it } from 'vitest';
import { newRetireState, onInputsChanged, recordVerdict, retiredNotice } from './retire';

describe('retirement', () => {
  it('does nothing when there is no verdict to retire', () => {
    expect(onInputsChanged(newRetireState(), 'a|b|c')).toBe('no-op');
  });

  it('retires a verdict when its inputs really change', () => {
    const state = newRetireState();
    recordVerdict(state, 'ml_dsa65|payload|3293');
    expect(onInputsChanged(state, 'ml_dsa87|payload|3293')).toBe('retire');
  });

  it('does NOT retire when the same value is re-selected', () => {
    // The no-op guard. A panel that retires on every `change` event regardless
    // of whether anything changed teaches the reader that the notice means
    // nothing, which is worse than not having one.
    const state = newRetireState();
    recordVerdict(state, 'ml_dsa65|payload|3293');
    expect(onInputsChanged(state, 'ml_dsa65|payload|3293')).toBe('no-op');
    expect(onInputsChanged(state, 'ml_dsa65|payload|3293')).toBe('no-op');
  });

  it('retires only once per verdict', () => {
    const state = newRetireState();
    recordVerdict(state, 'a');
    expect(onInputsChanged(state, 'b')).toBe('retire');
    // The verdict is already gone; a second change has nothing to retire.
    expect(onInputsChanged(state, 'c')).toBe('no-op');
  });

  it('the notice says a verdict was retired, not that one is missing', () => {
    const html = retiredNotice('what you were claiming');
    expect(html).toContain('RETIRED');
    expect(html).toContain('no longer describes what is on screen');
    expect(html).toContain('data-retired="true"');
  });
});
