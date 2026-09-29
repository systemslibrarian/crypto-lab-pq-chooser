import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate. Ported from `crypto-lab-schnorr-forge`,
 * the one gate in this fleet verified clean on every known oracle defect, with
 * the drive rewritten for what this page does.
 *
 * Five rules govern everything here:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. No `addStyleTag`
 *     motion kill — that bypasses a lab's own reduced-motion block instead of
 *     exercising it, and where a page parks content at `opacity: 0` and reveals
 *     it through an animation's `forwards` fill, the injection kills the reveal
 *     and the content is scanned invisible. This gate sets the preference
 *     through `emulateMedia` BEFORE navigation and asserts from inside the page
 *     that it took effect, because both `test.use({ reducedMotion })` and the
 *     config key are measured no-ops on Playwright 1.6x.
 *
 *  2. NOTHING IS REVEALED FROM SCRIPT. The two `<details>` here are opened by
 *     clicking their `<summary>`, which is the route a reader has, and both the
 *     shut and open states are scanned.
 *
 *  3. EVERY STEP WAITS ON A REAL COMPLETION SIGNAL. No fixed timeouts. This
 *     page derives nineteen parameter sets in a worker and streams them in, so
 *     the waits are on row states, verdict text and counts — never on a clock.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Every surface carrying
 *     this page's meaning is a `color-mix()` fill axe files under `incomplete`
 *     rather than judging: the four verdict tones, the four misquote verdict
 *     tints, the negative-claim wash, the hero aside, every `:hover` fill and
 *     the shared bar's ink.
 *
 *  5. THERE IS A REFLOW, NON-TEXT-CONTRAST AND GENERATED-CONTENT ORACLE.
 *     `nontext.ts` measures control boundaries at every driven state, and
 *     `expectNoHorizontalOverflow` adds the 1.4.10 check axe has no rule for —
 *     which matters more here than in most labs, because this page ships four
 *     wide tables and their scroll containers are the thing standing between a
 *     phone and a sideways-scrolling document.
 *
 * ── Scanning a page that is still computing ───────────────────────────────
 * The matrix fills over several seconds as the worker finishes each parameter
 * set. A scan of a DOM that is mutating is not reproducible, so every scan here
 * is taken at a point where the page is QUIESCENT — or where exactly one
 * element can still change and its change is itself the state being scanned:
 *
 *   all nineteen derived          quiescent
 *   sixteen derived, three skipped quiescent
 *   nineteen unavailable (no Worker) quiescent
 *   all nineteen pending (derivation held) quiescent
 *   the last slow set measuring    one row can change, over a window of seconds
 *
 * The held and Worker-less states are reached by intercepting what the page
 * sends or what the browser provides — never by editing the DOM. What is
 * scanned in each case is a rendering the page produced for itself.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough: a transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it. Transitions
 * also drain in waves, so a poll for "nothing running right now" can exit
 * through a gap between waves — hence six consecutive quiet frames.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * infinite animations are excluded rather than waited on, a wall-clock budget
 * inside the page gives up and proceeds, and Playwright's timeout is the
 * backstop.
 *
 * This page declares no animation of its own, so `getAnimations()` is normally
 * empty and this returns on the sixth frame. It stays because the shared top
 * bar's `.cl-btn` declares `transition` OUTSIDE this lab's stylesheet.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure this guards is an element whose only route to its visible state
 * is an animation, in a stylesheet whose reduced-motion block cancels that
 * animation without restoring its end state — the element then renders at
 * `opacity: 0` for every reader with the preference set. This page declares no
 * animation and nothing starts from `opacity: 0`, which is what makes its
 * blanket `animation: none !important` safe. This assertion is what makes that
 * a measurement rather than a reading of the stylesheet.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from page creation.
 *
 * This page renders every panel from a template string and then fills it from a
 * worker. A renderer that throws leaves a panel EMPTY, and an empty region is
 * exactly what a scan reports as perfectly accessible. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * The shared `.cl-topbar` carries an explicit `role="banner"`. This lab's hero
 * is a `<header class="cl-hero">` nested inside `<main>`, which implies no
 * banner at all — but the shared bar ships a `dedupeBanner()` because other
 * labs DID ship a second one, and the hero is the part of this page most likely
 * to be re-templated from one of them. Asserting the OUTCOME rather than the
 * markup is what catches that edit.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false;
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * List semantics survive their styling.
 *
 * Three lists here are styled `list-style: none` — the derivation log, the
 * negative-claim checklist and the related-demos list — which is exactly the
 * declaration that makes Safari and VoiceOver DROP the list's implicit role.
 * Each compensates the documented way, with an explicit `role="list"` and
 * `role="listitem"` on its children. What is asserted is the SHAPE of that fix:
 * any explicit role on a `ul`/`ol` must be `list` (any other value orphans
 * every `<li>` under it), and a `role="list"` must never sit on an EMPTY
 * element, because axe applies `aria-required-children` to the explicit role.
 *
 * The log is the live case: it ships holding one placeholder item, which is
 * why it carries a `role="listitem"` on that placeholder rather than rendering
 * an empty `<ol role="list">` until the first parameter set finishes.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els
      .filter((e) => e.getAttribute('role') !== 'list' || e.children.length === 0)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
      )
  );
  expect(
    broken,
    'an explicit non-list role on a list deletes its semantics; an empty role="list" fails aria-required-children'
  ).toEqual([]);
}

export type BootMode = 'normal' | 'hold-derivation' | 'no-worker';

/**
 * Load the page with reduced motion actually in effect, and assert the content
 * every scan relies on is really there — including the SHIPPED DEFAULTS, which
 * are never assumed.
 *
 * A navigation that resolves proves nothing here: `main.ts` renders the whole
 * document from template strings and a renderer that threw would leave a panel
 * empty, which a scan would report as perfectly accessible.
 *
 * `mode` selects one of the three real environments this page has to work in.
 * Neither of the two non-default modes touches the DOM:
 *
 *   'hold-derivation' drops the one `derive-matrix` message the page sends its
 *   worker. Nothing else is intercepted, so what renders is precisely the
 *   page's own first paint — every row queued — held still long enough to scan.
 *
 *   'no-worker' removes `Worker` from the page's global, which is the
 *   environment a browser without worker support actually provides. The page's
 *   fail-closed branch then renders all nineteen rows as WORKER_UNAVAILABLE.
 */
export async function boot(page: Page, mode: BootMode = 'normal'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful.
  page.setDefaultTimeout(30_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  if (mode === 'no-worker') {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'Worker');
    });
  }
  if (mode === 'hold-derivation') {
    await page.addInitScript(() => {
      type Held = { __held?: () => void; __released?: boolean; __start?: () => void };
      const w = window as unknown as Held;
      const realPost = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: never[]) {
        if (message && (message as { kind?: string }).kind === 'derive-matrix' && !w.__released) {
          // Held, not dropped: the gate releases it when it is ready, so the
          // derivation starts from a known moment instead of racing the
          // assertions in `boot`.
          w.__held = (): void => {
            realPost.call(this, message as never, ...rest);
          };
          return;
        }
        return realPost.call(this, message as never, ...rest);
      };
      w.__start = (): void => {
        w.__released = true;
        w.__held?.();
      };
    });
  }

  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertSingleBanner(page);
  await assertListSemantics(page);

  // ── The page really rendered ────────────────────────────────────────────
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('tr[data-row]')).toHaveCount(19);

  // The shared skip link points at an id that exists. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly what a green axe run says nothing
  // about.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('#app')).toHaveCount(1);

  // Dark is the only theme, so the page must carry no theme control at all.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, .theme-toggle-btn, [data-theme-toggle]')
  ).toHaveCount(0);

  // ── Every shipped default ───────────────────────────────────────────────
  // Nothing has been computed, so nothing that reports a computation may be on
  // screen. Asserted rather than assumed: a panel that arrived pre-filled would
  // mean the page had a result before it ran anything.
  await expect(page.locator('#bench-output')).toBeEmpty();
  await expect(page.locator('#fixture-output')).toBeEmpty();
  await expect(page.locator('#claim-output')).toBeEmpty();
  await expect(page.locator('#wire-output')).toBeEmpty();
  await expect(page.locator('#claim-scheme')).toHaveValue('ml_dsa65');
  await expect(page.locator('#claim-bytes')).toHaveValue('3293');
  await expect(page.locator('#claim-field')).toHaveValue('payload');
  await expect(page.locator('#wire-kem')).toHaveValue('ml_kem768');
  await expect(page.locator('#wire-sig')).toHaveValue('ml_dsa65');
  await expect(page.locator('#bench-slow')).not.toBeChecked();

  // Both disclosures ship SHUT. The gate this pattern replaces opened every
  // one from script before its only scan.
  await expect(page.locator('details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `first paint (${mode})`);
}

/**
 * Assert the page does not require horizontal scrolling. WCAG 1.4.10 (Reflow,
 * AA), for which axe has no rule at all.
 *
 * This page ships four tables wider than a phone, each inside its own
 * `overflow-x: auto` region, so this check is the thing standing between the
 * design and a sideways-scrolling document. The shapes at risk are a table that
 * escapes its wrapper, a `.row-note` whose `max-width` is in `ch` on a long
 * unbroken token, and the controls row when a `<select>` refuses to shrink.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide table inside an `overflow: auto` wrapper has a huge bounding rect
    // but is clipped by its scroller and contributes nothing — naming it sends
    // you off fixing the wrong element.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * Unlike most labs in this fleet, this one has real scrollers at every width:
 * four `.table-wrap` regions and the derivation log. Each carries
 * `tabindex="0"` plus `role="region"` and an `aria-label`. A scroller born
 * without a keyboard route is invisible to axe, which is why this is measured
 * from the live layout rather than read off the stylesheet.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * `tabIndex: 0`, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden` DO
 * remove an element from the tab order, so those are skipped rather than
 * flagged.
 *
 * Off-screen-but-focusable is the WCAG-sanctioned skip-link idiom and is
 * deliberately not flagged: the shared skip link parks at `top: -3rem` at full
 * opacity and slides in on focus. The drive scans it focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. This turns that into one run. It is a debugging aid
 * only: `A11Y_COLLECT` is never set in CI, and a run with it set prints every
 * finding and then FAILS at the end, so a green collection run cannot be
 * mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens: a hard assertion later in the drive would otherwise
  // abort the test before anything collected so far was ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide this
 * oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI, the guard returned first and `nontext.ts` never executed at all. Thirteen
 * repos certified themselves clean on an oracle that had never looked.
 *
 * It ratchets: anything NOT in the baseline fails, anything in the baseline
 * that got WORSE fails, and anything in the baseline that has been FIXED fails
 * until its entry is deleted. That last rule is what stops an allowlist
 * becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that showed it, which is a coverage
 * regression worth knowing about.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Nine assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically. Everything else in that bucket is a real result
 *    axe simply could not finish — including `aria-prohibited-attr`, which is
 *    where an `aria-label` on a role-less element hides. This page leans on
 *    getting that right: every `aria-label` here is on a `role="region"`
 *    scroller, an `<aside>`, a `<nav>` or the `<header>` bar.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - the same walk over `aria-hidden` content with the exemption lifted.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);

  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first.
  // Chained, axe runs those four best-practice rules and NOT ONE WCAG RULE,
  // while a green result reads exactly like a full A/AA pass.
  //
  // The landmark four are wanted because they are best-practice rather than
  // WCAG-tagged, and this page has the shape they catch: a sticky
  // `<header role="banner">` above a `<div id="app">` holding a `<main>`, an
  // `<aside class="cl-hero-why">`, one `<nav>` in the shared bar, and a
  // `<footer>`.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  // The aria-hidden walk, exemption lifted — axe skips this text entirely and
  // the default walk honours the same boundary, so this second call is the ONLY
  // thing that ever measures it.
  const hiddenContrast = Array.from(
    new Set(
      formatContrastFailures(
        await auditContrast(page, '[aria-hidden="true"], [aria-hidden="true"] *', true)
      )
    )
  );
  softExpect(hiddenContrast, `measured aria-hidden contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

/**
 * Release the held `derive-matrix` message.
 *
 * Every scan after this point is taken relative to a derivation that started
 * HERE, which is what turns "wait for the last slow set to be measuring" from a
 * race against the gate's own start-up into an ordinary wait. Nothing about the
 * page's behaviour changes: the same message it composed for itself is
 * delivered, unmodified, to the same worker.
 */
export async function startDerivation(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __start?: () => void }).__start?.());
  await expect(page.locator('tr[data-state="deriving"], tr[data-state="derived"]')).not.toHaveCount(
    0,
    { timeout: 60_000 }
  );
}

// ── Waiting on the derivation ───────────────────────────────────────────────

/** Every row has reached a terminal state, so the DOM has stopped moving. */
export async function waitForMatrixSettled(page: Page): Promise<void> {
  await expect(page.locator('tr[data-state="pending"], tr[data-state="deriving"]')).toHaveCount(0, {
    timeout: 300_000,
  });
}

export async function waitForRowState(page: Page, schemeId: string, state: string): Promise<void> {
  await expect(page.locator(`tr[data-row="${schemeId}"]`)).toHaveAttribute('data-state', state, {
    timeout: 300_000,
  });
}

// ── The drive ───────────────────────────────────────────────────────────────

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * What shapes this drive:
 *
 *  - THE NUMBERS ARRIVE OVER TIME, so every scan is taken where the page is
 *    quiescent, or where exactly one row can still change and that row's
 *    changing is the state being scanned. See the note at the top of this file.
 *
 *  - EVERY FAILURE STATE IS SCANNED. A contradicted claim, a malformed claim,
 *    a claim aimed at a set that was never derived, RSA-2048's deliberately
 *    unmeasured keygen cell, and the fixture's all-green-and-wrong verdict.
 *    None of these is reachable without doing something on purpose, and none
 *    would be scanned by a drive that only pressed the happy path.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `page.click()` resolves, so it is the
 *    state a reader occupies the instant after pressing a button — and both
 *    `#app button:hover` and `.cl-btn:hover` repaint their fill AND their
 *    border. Scanned explicitly.
 *
 *  - NO FIXED TIMEOUTS. Every wait is on a real DOM signal: a row's
 *    `data-state`, a verdict's `data-claim-outcome`, a count.
 */
export async function driveAllStates(page: Page, label: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${label} / ${s}`);

  // ── First paint, held: nineteen rows queued and not one figure ──────────
  await expect(page.locator('tr[data-state="pending"]')).toHaveCount(19);
  await expect(page.locator('#matrix-body')).toContainText('queued');
  await scanAt('first paint — nineteen rows queued, no figure anywhere');

  // ── The shared skip link, focused ───────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('the shared skip link focused, slid in from top:-3rem');

  // ── The last slow set measuring, everything before it settled ───────────
  // The three SLH-DSA `s` sets derive last and SLH-DSA-256s signs in seconds,
  // so this is a window of seconds in which exactly one row can change. It is
  // the only place `.state-deriving` — the per-row "measuring..." the brief
  // asks for — is on screen. The derivation is released HERE rather than at
  // load, so reaching that window is a wait rather than a race.
  await startDerivation(page);
  await waitForRowState(page, 'slh_dsa_sha2_256s', 'deriving');
  await expect(page.locator('tr[data-state="pending"]')).toHaveCount(0);
  await scanAt('the last slow set measuring, the other eighteen rows settled');

  // ── Everything derived ──────────────────────────────────────────────────
  await waitForMatrixSettled(page);
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(19);
  await expect(page.locator('#skip-slow')).toBeDisabled();
  // The misquote panel settles with the evidence, not before it.
  await expect(page.locator('[data-verdict="pending"]')).toHaveCount(0);
  await expect(page.locator('[data-verdict="contradicted"]')).toHaveCount(4);
  await expect(page.locator('[data-verdict="not-derivable"]')).toHaveCount(1);
  await scanAt('all nineteen parameter sets derived, four misquotes contradicted');

  // ── The two disclosures, opened the way a reader opens them ─────────────
  await page.locator('#intro details > summary').click();
  await expect(page.locator('#intro details[open]')).toHaveCount(1);
  await scanAt('the "why derive them" disclosure open');

  await page.locator('#log-panel > summary').click();
  await expect(page.locator('#log-panel[open]')).toHaveCount(1);
  await expect(page.locator('#log-list li')).toHaveCount(19);
  await scanAt('the derivation log open — nineteen entries with their cost bars');

  // ── The claim checker, on every branch ──────────────────────────────────
  await page.locator('#claim-run').click();
  await expect(page.locator('[data-claim-code="CLAIM_CONTRADICTED"]')).toBeVisible();
  await scanAt('a claimed size the library contradicts');

  await page.fill('#claim-bytes', 'not a number');
  await page.locator('#claim-run').click();
  await expect(page.locator('[data-claim-code="CLAIM_MALFORMED"]')).toBeVisible();
  await scanAt('a malformed claim');

  // The confirmed branch, using a value read OFF THE PAGE rather than typed in
  // here — a gate that hardcoded the answer would drift the day the library
  // changed, which is the defect this whole lab is about.
  await page.selectOption('#claim-scheme', 'ml_dsa65');
  const derivedSignature = await page
    .locator('tr[data-row="ml_dsa65"] td[data-cell="payload"]')
    .innerText();
  await page.fill('#claim-bytes', derivedSignature.replace(/[^\d]/g, ''));
  await page.locator('#claim-run').click();
  await expect(page.locator('[data-claim-outcome="confirmed"]')).toBeVisible();
  await scanAt('a claimed size that matches what ran');

  // ── The handshake calculator ────────────────────────────────────────────
  await page.locator('#wire-run').click();
  await expect(page.locator('[data-wire-total]')).toBeVisible();
  await scanAt('a computed TLS handshake, with the hybrid overhead beside it');

  await page.selectOption('#wire-sig', 'falcon512');
  await page.locator('#wire-run').click();
  await expect(page.locator('#wire-output')).toContainText('variable-length');
  await scanAt('a handshake priced with a variable-length signature');

  // ── The benchmark, including its deliberately unmeasured cell ───────────
  await page.locator('#bench-run').click();
  await expect(page.locator('#bench-table')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('[data-bench-code="BENCH_NOT_MEASURED"]')).toBeVisible();
  await expect(page.locator('#bench-environment')).toBeVisible();
  await scanAt('benchmark results, with RSA-2048 keygen stated as not measured');

  // ── The negative-claim fixture ──────────────────────────────────────────
  await page.locator('#fixture-run').click();
  await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();
  await expect(page.locator('[data-negative-claim]')).toBeVisible();
  await scanAt('the fixture: every check green and the answer wrong');

  await page.locator('#fixture-again').click();
  await expect(page.locator('[data-fixture-verdict="mismatch"]')).toBeVisible();
  await scanAt('the fixture again, on a different byte');

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.locator('#bench-run').hover();
  await scanAt('a primary button hovered — fill and border both repainted');

  await page.locator('#fixture-again').hover();
  await scanAt('a secondary button hovered');

  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── Focus rings, and the scrollers as focus targets ─────────────────────
  await page.locator('#claim-bytes').focus();
  await expect(page.locator('#claim-bytes')).toBeFocused();
  await scanAt('a text input focused, showing its focus-visible outline');

  await page.locator('#wire-kem').focus();
  await scanAt('a styled select focused, with its custom chevron');

  await page.locator('.table-wrap').first().focus();
  await scanAt('the matrix scroll region focused — its keyboard route into the table');
}

/**
 * The three rows a reader abandoned.
 *
 * Pressed while the cheap sets are still landing, so the flag is set long
 * before the worker reaches the slow ones: all three are skipped, and the state
 * is stable. Never a spec-filled number and never a blank — the cost of
 * skipping has to stay visible on the row that was skipped.
 */
export async function driveSkippedState(page: Page, label: string): Promise<void> {
  // Pressed BEFORE the derivation is released, so the worker sees the flag
  // before it reaches the first slow set and all three are skipped. Pressing
  // mid-run is also honest — a set already signing cannot be interrupted — but
  // it is not deterministic, and a gate whose expected count depends on how
  // fast the machine is teaches nothing when it goes red.
  await page.locator('#skip-slow').click();
  await expect(page.locator('#skip-slow')).toBeDisabled();
  await startDerivation(page);
  await waitForMatrixSettled(page);
  await expect(page.locator('tr[data-code="DERIVE_SKIPPED"]')).toHaveCount(3);
  await expect(page.locator('tr[data-state="derived"]')).toHaveCount(16);
  await scan(page, `${label} / three slow sets skipped by the reader`);

  // And the claim checker refuses to answer for one of them from the published
  // figure, which is the whole argument of the page with the comfort removed.
  await page.selectOption('#claim-scheme', 'slh_dsa_sha2_192s');
  await page.locator('#claim-run').click();
  await expect(page.locator('[data-claim-code="CLAIM_NOT_DERIVED"]')).toBeVisible();
  await scan(page, `${label} / the claim checker refusing to answer from a published figure`);
}

/** Every row unavailable, because this browser has no Worker. */
export async function driveWorkerlessState(page: Page, label: string): Promise<void> {
  await expect(page.locator('tr[data-code="WORKER_UNAVAILABLE"]')).toHaveCount(19);
  await expect(page.locator('#skip-slow')).toBeDisabled();
  await expect(page.locator('#matrix-status')).toContainText('WORKER_UNAVAILABLE');
  await scan(page, `${label} / no Web Worker — nineteen rows showing no figure, and why`);
}
