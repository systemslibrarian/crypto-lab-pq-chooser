import { expect, test, type Page } from '@playwright/test';
import { boot, startDerivation, waitForCoreReady } from './gate';

/**
 * The composition gate — the class of defect the WCAG and claims suites cannot
 * see.
 *
 * Both of those pass on a page that is perfectly accessible, perfectly truthful
 * and unusable: a hero with 200px of dead space above the fold, a first
 * actionable control below it, a seven-column table compressed into a quarter
 * of a phone screen, an anchor that scrolls its heading under the sticky bar.
 * Every one of those was real here, and none of them was red anywhere.
 *
 * ── Why this measures geometry rather than comparing screenshots ──────────
 * Pixel baselines were the obvious answer and are the wrong one for this repo.
 * Baselines captured on macOS do not match Linux CI — different font
 * rasterisation, different scrollbar metrics — so the first CI run after
 * committing them fails for a reason that is not a defect, and the only ways
 * out are to regenerate in CI (which means committing an unreviewed baseline)
 * or to loosen the threshold until it stops catching anything.
 *
 * What the defects above have in common is that each is a NUMBER: a gap in
 * pixels, a scroll ratio, an offset under a bar. Measuring the number is
 * deterministic, cross-platform, and says what is wrong in the failure message
 * instead of handing over two images to diff. The screenshots are still taken,
 * as run artifacts for a human to look at; they are not the oracle.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

type Box = { top: number; bottom: number; left: number; right: number; width: number; height: number };

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  return { ...box, top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width };
}

async function ready(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await boot(page, 'hold-derivation');
  await startDerivation(page);
  await waitForCoreReady(page);
}

test.describe('the first viewport', () => {
  for (const [name, viewport] of [
    ['phone 390x844', PHONE],
    ['desktop 1440x900', DESKTOP],
  ] as const) {
    test(`an actionable chooser control is above the fold at ${name}`, async ({ page }) => {
      test.setTimeout(300_000);
      await ready(page, viewport);

      // THE HARD BAR, and the review's acceptance test verbatim: the first
      // action is visible without scrolling.
      const tab = await boxOf(page, '#role-kem');
      expect(
        tab.bottom,
        `the role selector must be reachable without scrolling at ${name} (it ends at ${Math.round(tab.bottom)}px in a ${viewport.height}px viewport)`
      ).toBeLessThan(viewport.height);

      // ...and the question it answers has to be visible with it, or the
      // control is a pair of unexplained buttons.
      const heading = await boxOf(page, '#chooser-h');
      expect(heading.bottom, `the chooser's own heading at ${name}`).toBeLessThan(viewport.height);

      // A SOFTER, STATED BAR for the rest of the decision surface. Requiring
      // every constraint above the fold too is not reachable on a 390x844
      // phone alongside the fleet-standard hero and the plain-language on-ramp
      // the master template requires before any control -- measured, the
      // constraints land at about 1.2 viewports. What this catches is a
      // regression that pushes them into a scavenger hunt, which is the defect
      // that mattered; it is deliberately not tightened to the point where the
      // only way to pass would be to delete the on-ramp.
      const lastConstraint = await boxOf(page, '#c-wire');
      expect(
        lastConstraint.bottom,
        `the whole decision surface should be one short scroll at ${name} (it ends at ${Math.round(lastConstraint.bottom)}px, ${(lastConstraint.bottom / viewport.height).toFixed(2)} viewports down)`
      ).toBeLessThan(viewport.height * 1.5);
    });
  }

  test('the hero has no dead space between its text and the next section', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, PHONE);
    // The defect this catches: `flex: 1 1 22rem` is a MAIN-axis basis, and once
    // the hero stacks the main axis is vertical, so the title block reserved
    // 22rem of height and left roughly 200px of nothing under it.
    const why = await boxOf(page, '.cl-hero-why');
    const hero = await boxOf(page, '.cl-hero');
    const gapBelowContent = hero.bottom - why.bottom;
    expect(
      gapBelowContent,
      `the hero reserves ${Math.round(gapBelowContent)}px below its own content`
    ).toBeLessThan(24);
  });

  test('the whole hero is a sensible share of a phone screen', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, PHONE);
    const hero = await boxOf(page, '.cl-hero');
    expect(hero.height, 'the hero should not own half the first screen').toBeLessThan(
      PHONE.height * 0.5
    );
  });
});

test.describe('the matrix on a phone is not a horizontal scroll', () => {
  test('it stacks into one card per scheme, with its column names in the cells', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, PHONE);
    const wrap = await page.locator('#matrix .table-wrap').first();
    const metrics = await wrap.evaluate((el) => ({
      visible: el.clientWidth,
      scroll: el.scrollWidth,
    }));
    // The review measured 310px visible over 1,125px of scroll -- 3.6x.
    expect(
      metrics.scroll / metrics.visible,
      `the matrix still needs ${(metrics.scroll / metrics.visible).toFixed(1)}x horizontal travel on a phone`
    ).toBeLessThan(1.05);

    // The column names have to come WITH the values once the header row is gone.
    await expect(page.locator('#matrix tbody .cell-label').first()).toBeVisible();

    // And a whole row has to be readable at once.
    const row = await boxOf(page, '#matrix tr[data-row="ml_kem768"]');
    expect(row.width).toBeLessThanOrEqual(PHONE.width);
    expect(row.height, 'a stacked row should still fit on one screen').toBeLessThan(PHONE.height);
  });

  test('the table semantics survive the stacking', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, PHONE);
    // `display: block` strips a table's implicit roles in every engine, so the
    // explicit ones are what a screen reader has left. Asserted from the
    // rendered DOM rather than from the stylesheet.
    const roles = await page.evaluate(() => {
      const table = document.querySelector('#matrix table')!;
      return {
        table: table.getAttribute('role'),
        row: table.querySelector('tbody tr')?.getAttribute('role'),
        rowheader: table.querySelector('tbody th')?.getAttribute('role'),
        cell: table.querySelector('tbody td')?.getAttribute('role'),
        display: getComputedStyle(table.querySelector('tbody tr')!).display,
      };
    });
    expect(roles.display, 'this test is meaningless if the rows are not blocks here').toBe('block');
    expect(roles).toMatchObject({ table: 'table', row: 'row', rowheader: 'rowheader', cell: 'cell' });
  });

  test('at desktop it is still a table, with the row label pinned in view', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, DESKTOP);
    const sticky = await page.locator('#matrix tbody th[scope="row"]').first().evaluate((el) => ({
      position: getComputedStyle(el).position,
      display: getComputedStyle(el).display,
    }));
    expect(sticky.display).not.toBe('block');
    expect(sticky.position, 'the scheme name must stay put when the table scrolls sideways').toBe('sticky');
  });
});

test.describe('fragment links land where they point', () => {
  test('a section anchor is not scrolled under the sticky top bar', async ({ page }) => {
    test.setTimeout(300_000);
    await ready(page, DESKTOP);
    const bar = await boxOf(page, '.cl-topbar');

    for (const id of ['#matrix', '#bench', '#risk', '#negative', '#scope']) {
      await page.locator(`.section-nav a[href="${id}"]`).click();
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel)!;
          return Math.abs(el.getBoundingClientRect().top) < 2000;
        },
        id,
        { timeout: 10_000 }
      );
      const heading = await boxOf(page, `${id} h2`);
      expect(
        heading.top,
        `${id} scrolls its heading to ${Math.round(heading.top)}px, under a ${Math.round(bar.height)}px sticky bar`
      ).toBeGreaterThanOrEqual(bar.height - 1);
    }
  });
});

test.describe('screenshots, as artifacts rather than as an oracle', () => {
  for (const [name, viewport] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test(`capture first paint and core-ready at ${name}`, async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      await page.setViewportSize(viewport);
      await boot(page, 'hold-derivation');
      await testInfo.attach(`${name}-first-paint.png`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
      await startDerivation(page);
      await waitForCoreReady(page);
      await testInfo.attach(`${name}-core-ready.png`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
      // Nothing is asserted about the pixels. The assertions live in the tests
      // above, where a failure names the number that is wrong.
      expect(await page.locator('.candidate').count()).toBeGreaterThan(0);
    });
  }
});
