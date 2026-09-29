/**
 * Retiring a verdict when its inputs change.
 *
 * A verdict is a statement about the inputs that produced it. Leave one on
 * screen after the reader changes the parameter set and it silently becomes a
 * statement about something else — the page is then wrong in the one way it
 * cannot notice, because nothing recomputed and nothing failed.
 *
 * So each panel records the inputs behind its current verdict, and any change
 * to those inputs replaces the verdict with an explicit RETIRED notice rather
 * than leaving it, blanking it, or silently recomputing. Blanking would lose
 * the fact that an answer existed; recomputing would run real cryptography on
 * every keystroke.
 *
 * The other half matters as much: re-selecting the SAME value must NOT retire a
 * fresh verdict. A panel that retires on every `change` event regardless of
 * whether anything changed teaches the reader that the notice means nothing.
 */

export interface RetireState {
  /** The inputs that produced whatever is currently rendered, or null. */
  signature: string | null;
}

export function newRetireState(): RetireState {
  return { signature: null };
}

/** The markup a retired verdict leaves behind. */
export function retiredNotice(what: string): string {
  return `<div class="verdict verdict-warn" data-retired="true">
    <span class="verdict-icon" aria-hidden="true">↺</span>
    <div class="verdict-body">
      <div class="verdict-title">RETIRED</div>
      <p class="verdict-text">You changed ${what}, so the answer that was here no longer describes what is on screen. Ask again to get one that does.</p>
    </div>
  </div>`;
}

/**
 * Decide what a change to the inputs should do.
 *
 * Returns `'retire'` only when there IS a rendered verdict and the inputs
 * really differ from the ones that produced it.
 */
export function onInputsChanged(state: RetireState, signature: string): 'retire' | 'no-op' {
  if (state.signature === null) return 'no-op';
  if (state.signature === signature) return 'no-op';
  state.signature = null;
  return 'retire';
}

export function recordVerdict(state: RetireState, signature: string): void {
  state.signature = signature;
}
