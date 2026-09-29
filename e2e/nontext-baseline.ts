/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY, AND THAT IS THE POINT — this is the terminal state of the
 * ratchet, not an unrun check. `src/style.css` separates `--border` (a
 * decorative divider at about 1.5:1, used only for table rules and card edges)
 * from `--control-border` (#6b7a94, measured at 3.66:1 against the lightest
 * surface a control sits on), and every `button`, `select` and `input` draws
 * its edge from the second. `button.primary` has no edge of its own — it paints
 * its border the same violet as its fill — and clears 1.4.11 on fill-vs-surround
 * at 5.63:1 instead. The shared top bar's `.cl-btn`, baselined in older labs at
 * about 1.49:1 because it drew its border from a low-percentage `color-mix()`
 * toward the accent, draws it from `--cl-ink` here and clears 3:1 — which is
 * why the two entries most of this fleet carries are absent.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this same
 * path and asserts nothing, which is how this file is regenerated.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
