/**
 * The parts of the page that do not change: the hero, the plain-language
 * on-ramp, the implementation-risk column, the honest-scope block, the
 * cross-links, and the scripture footer.
 */

import { RELATED_DEMOS, RISK_ROWS } from '../data/risk';
import { RUNTIME_FACTS } from '../data/runtime';
import { escapeHTML } from './helpers';

export function renderHero(): string {
  return `
    <header class="cl-hero">
      <div class="cl-hero-main">
        <h1 class="cl-hero-title">PQ Chooser</h1>
        <p class="cl-hero-sub">ML-KEM · ML-DSA · FN-DSA · SLH-DSA · FIPS 203/204/205</p>
        <p class="cl-hero-desc">
          Derives all nineteen post-quantum parameter sets by running the real algorithms in
          your browser, then shortlists two to investigate.
        </p>
      </div>
      <aside class="cl-hero-why" aria-label="Why it matters">
        <span class="cl-hero-why-label">WHY IT MATTERS</span>
        <p class="cl-hero-why-text">
          Migration decisions get made from tables somebody typed in years ago, and a typed-in
          number cannot tell you which of its digits is a range. A derived one shows the
          difference instead of asserting it.
        </p>
      </aside>
    </header>`;
}

/**
 * The argument for deriving figures that are already correct.
 *
 * Below the chooser, because it answers "can I trust these numbers?" and that
 * is the second question a visitor has, not the first.
 */
export function renderIntroLong(): string {
  return `
    <section class="card" id="why-derive" aria-labelledby="why-derive-h">
      <span class="eyebrow">The argument</span>
      <h2 id="why-derive-h">Why derive them, when the published numbers are correct?</h2>
      <p>
        They are correct. A fleet-wide audit checked every hardcoded ML-KEM, ML-DSA, Falcon and
        SLH-DSA size across 212 repositories against FIPS 203, 204, 205 and Falcon v1.2 and found
        zero mismatches. Being right is not the problem.
      </p>
      <p>
        The problem is that being right is not the same as being <em>derived</em>. Three labs
        printed Falcon-512’s signature size as a bare integer beside ML-DSA-44’s and
        SLH-DSA-128s’s. All three numbers were accurate. But the Falcon figure is the
        <em>padded</em> encoding, and raw compressed Falcon-512 signatures vary from one signature
        to the next — and nothing in a row of integers could say which of the three was a
        range. (This page does not print those three numbers here either. They are in the matrix
        above, derived, where the Falcon row renders as a range because it measured one.)
      </p>
      <p>
        A derived figure gets that distinction for free. The padded and unpadded Falcon variants
        are separate exports of the library, so a table that calls both of them shows the
        difference rather than asserting it. That is the whole argument for this page, and the
        matrix is it.
      </p>
    </section>`;
}

/**
 * A rail to the sections, because there are now fifteen of them.
 *
 * Every entry is a real fragment link, and `scroll-margin-top` on the targets
 * keeps the sticky top bar from covering the heading it just scrolled to —
 * which `e2e/layout.spec.ts` measures rather than assumes.
 */
export function renderSectionNav(): string {
  const links: Array<[string, string]> = [
    ['#chooser', 'Choose'],
    ['#compare', 'Compare'],
    ['#wire', 'Handshake bytes'],
    ['#bench', 'Benchmark'],
    ['#matrix', 'The matrix'],
    ['#why-derive', 'Why derive'],
    ['#misquote', 'Misquoted numbers'],
    ['#claim', 'Break it yourself'],
    ['#risk', 'Implementation risk'],
    ['#negative', 'What it cannot see'],
    ['#scope', 'Honest scope'],
  ];
  return `
    <nav class="section-nav" aria-label="Sections of this page">
      <ul role="list">
        ${links.map(([href, label]) => `<li role="listitem"><a href="${href}">${escapeHTML(label)}</a></li>`).join('')}
      </ul>
    </nav>`;
}

export function renderRiskPanel(): string {
  const rows = RISK_ROWS.map(
    (r) => `
      <tr>
        <th scope="row">${escapeHTML(r.subject)}</th>
        <td><strong>${escapeHTML(r.risk)}</strong><span class="row-note">${escapeHTML(r.detail)}</span></td>
        <td>
          ${r.evidence.map((e) => `<a href="${escapeHTML(e.href)}" target="_blank" rel="noopener">${escapeHTML(e.label)}</a>`).join('<br />')}
          ${r.measuredHere ? `<span class="row-note">${escapeHTML(r.measuredHere)}</span>` : ''}
        </td>
      </tr>`
  ).join('');

  return `
    <section class="card" id="risk" aria-labelledby="risk-h">
      <span class="eyebrow">What the sizes do not say</span>
      <h2 id="risk-h">Implementation risk</h2>
      <p class="card-lead">
        Each row names something an implementation of that scheme has actually had to deal with,
        and points at the demo that shows it. Two of the rows are evidenced by this page’s own
        output. It is <strong>evidence-linked but not exhaustive</strong>: choosing which risks to
        list is still an editorial act even when every row has a source, and a scheme’s absence
        from a row is not a clean bill of health.
      </p>
      <div class="table-wrap" tabindex="0" role="region" aria-label="Implementation risk by scheme, scrollable">
        <table>
          <caption>
            A smaller key is not a safer one, and nothing above this row measures the property
            this table reports. That gap is the point of the panel below it.
          </caption>
          <thead><tr><th scope="col">Scheme</th><th scope="col">Risk</th><th scope="col">Go and see it</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

export function renderScope(): string {
  return `
    <section class="card" id="scope" aria-labelledby="scope-h">
      <span class="eyebrow">Honest scope</span>
      <h2 id="scope-h">What is real here, and what this does not prove</h2>
      <p class="card-lead">${escapeHTML(RUNTIME_FACTS.realness)}</p>
      <h3>Real</h3>
      <ul class="scope-list">
        <li>
          Every public-key, ciphertext and signature size: produced by
          <span class="mono">${escapeHTML(RUNTIME_FACTS.library.name)}</span>
          ${escapeHTML(RUNTIME_FACTS.library.version)} in a Web Worker in this tab, read off
          <span class="mono">.length</span>. Every one also round-trips — decapsulated or
          verified — before its size is shown.
        </li>
        <li>
          Every benchmark figure: measured here, by one harness, in one run, with the sample
          count, the clock resolution and the environment printed beside it.
        </li>
        <li>
          Every handshake total: the length of four real buffers concatenated, not a sum of
          published constants.
        </li>
      </ul>
      <h3>Not measured here</h3>
      <ul class="scope-list">
        <li>
          Row 5 of the misquoted-numbers panel (UOV). UOV is not among the nineteen sets this page
          derives, so that row is cited to the lab that corrected it and labelled as cited.
        </li>
        <li>
          RSA-2048 key generation. It is a randomised prime search; timing it measures luck. The
          cell says so rather than being dropped.
        </li>
        <li>
          The NIST security categories, and the implementation-risk column. Those are each
          scheme’s own claim and the published record respectively, not something a byte count can
          produce.
        </li>
      </ul>
      <h3>What this does NOT prove</h3>
      <ul class="scope-list">
        <li>
          <strong>A device benchmark is not a security ranking.</strong> The fastest row here is
          not the safest, and the ratios say what an operation costs on your hardware in this
          browser on this run — not what it costs on a server, a phone, or a smartcard.
        </li>
        <li>
          <strong>Smaller is not safer.</strong> The size columns are a deployment constraint, not
          a strength ordering, and the NIST categories do not line up across schemes anyway.
        </li>
        <li>
          <strong>A derivation that succeeds says nothing about constant-time behaviour.</strong>
          Nothing on this page could fail if the implementation leaked its key through timing or
          power. That is why the implementation-risk column exists, and the panel above it reaches
          a state where every check passes and the answer is still wrong.
        </li>
      </ul>
      <p>
        <strong>Not production cryptography.</strong> This is a teaching demo. It runs a real
        library correctly, and it is not a substitute for reading FIPS 203, 204 and 205, or for a
        vetted implementation in the environment you are actually deploying to.
      </p>
    </section>`;
}

export function renderRelated(): string {
  const items = RELATED_DEMOS.map(
    (d) => `<li role="listitem">
      <a href="${escapeHTML(d.href)}" target="_blank" rel="noopener">${escapeHTML(d.label)}</a>
      <span class="why">${escapeHTML(d.why)}</span>
    </li>`
  ).join('');
  return `
    <section class="card" id="related" aria-labelledby="related-h">
      <span class="eyebrow">Where to go next</span>
      <h2 id="related-h">Related demos</h2>
      <p class="card-lead">
        This page answers <em>which one</em>. Every <em>why</em> lives in a lab of its own.
      </p>
      <ul class="related" role="list">${items}</ul>
    </section>`;
}

export function renderFooter(): string {
  return `
    <footer class="scripture-footer">
      <p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p>
    </footer>`;
}
