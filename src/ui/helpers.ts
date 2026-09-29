/**
 * Rendering helpers.
 *
 * Everything that reaches `innerHTML` goes through `escapeHTML` first. Nothing
 * on this page is user-authored except the byte count typed into the claim
 * checker, and that is exactly the kind of "nothing can go wrong here" that
 * stops being true the first time a panel gains a text field.
 */

export function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Byte counts with thin separators, so 278432 does not read as kilobytes. */
export function bytes(n: number): string {
  return `${n.toLocaleString('en-US')} B`;
}

/**
 * A duration, at a precision the clock can actually support.
 *
 * Below the measured timer resolution this prints `< 0.100 ms` rather than a
 * number: `performance.now()` is coarsened in a page that is not cross-origin
 * isolated, so a sub-resolution median is not a fast measurement, it is an
 * absent one. Printing "0.000 ms" would be inventing a figure the measurement
 * never contained — and a ratio computed by dividing by it would be worse.
 */
export function duration(ms: number, resolutionMs = 0): string {
  if (resolutionMs > 0 && ms < resolutionMs) return `< ${resolutionMs.toFixed(3)} ms`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 10) return `${ms.toFixed(0)} ms`;
  return `${ms.toFixed(2)} ms`;
}

/** True when a figure is below what the clock can resolve. */
export function belowResolution(ms: number, resolutionMs: number): boolean {
  return resolutionMs > 0 && ms < resolutionMs;
}

/**
 * A cell that holds no figure.
 *
 * The em-dash is `aria-hidden` and the reason is the text a screen reader gets,
 * because "dash" is not an answer to "how big is an ML-DSA-87 signature". The
 * standing rule this page is built on — never show a number you did not compute
 * — has to survive contact with the moment the number is missing, and that
 * moment is this function.
 */
export function noFigure(reason: string): string {
  return `<span class="sr-only">${escapeHTML(reason)}</span><span aria-hidden="true" class="no-figure">—</span>`;
}

export function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}
