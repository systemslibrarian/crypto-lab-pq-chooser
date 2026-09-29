# PQ Chooser

**ML-KEM · ML-DSA · FN-DSA/Falcon · SLH-DSA — the post-quantum selection table, with every figure derived in your browser.**

## What It Is

An interactive comparison of **nineteen post-quantum parameter sets** across five families, in which no size is typed in. Every public-key, ciphertext and signature figure on the page is produced by calling `keygen()`, `encapsulate()` or `sign()` from [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum) 0.7.x in a Web Worker and reading `.length` off what came back — and every one of them round-trips (decapsulated, or verified) before its size is shown.

The primitives covered:

- **KEMs** — ML-KEM-512/768/1024 (FIPS 203)
- **Lattice signatures** — ML-DSA-44/65/87 (FIPS 204)
- **Hash-based signatures** — SLH-DSA-SHA2-128/192/256, both `s` and `f` (FIPS 205)
- **NTRU lattice signatures** — Falcon-512 and Falcon-1024, each in **both** its raw compressed and padded encodings (Falcon specification v1.2; FIPS 206 / FN-DSA is still in development)
- **Hybrids** — ML-KEM-768 + X25519, and QSF combiners over ML-KEM-768 + P-256 and ML-KEM-1024 + P-384

Alongside the table: a live benchmark measured against **X25519, ECDSA P-256 and RSA-2048** by the same harness in the same run; a TLS 1.3 handshake priced from the actual concatenated key-share and signature bytes the run produced; a panel of five commonly misquoted figures that the page's own output contradicts; and an implementation-risk column that points at the demo which shows each risk.

**The teaching subject here is comparison and derivation, not a primitive.** Nothing cryptographic is hand-rolled: the point is precisely that every number comes from a real library rather than from a table, so hand-rolling the primitives would undermine the claim rather than support it. What *is* written here is the derivation harness, the scheduling, the wire accounting and the honesty rules.

**Security model:** none. There is no adversary, no secret to protect and no protocol being run. Every key this page generates lives for milliseconds inside a worker and is never persisted, transmitted or shown. **Not production cryptography — a teaching demo.**

### Why derive figures that are already correct?

A fleet-wide audit checked every hardcoded ML-KEM, ML-DSA, Falcon and SLH-DSA size across 212 repositories against FIPS 203, 204, 205 and Falcon v1.2, and found **zero mismatches**. The numbers in this suite were right.

Being right is not the same as being *derived*. Three labs printed Falcon-512's signature size as a bare integer beside ML-DSA-44's and SLH-DSA-128s's. All three numbers were accurate — but the Falcon figure is the **padded** encoding, and raw compressed Falcon-512 signatures vary from one signature to the next. Nothing in a row of integers could say which of the three was a range.

A derived figure gets that distinction for free. The padded and unpadded Falcon variants are separate library exports, so a table that calls both **shows** the difference instead of asserting it. That is the argument for this lab, and the table is it.

## Exhibits

1. **The matrix** — nineteen rows, filled progressively as the worker finishes each set. Three states, distinct by icon, word and colour: `queued`, `measuring…`, `derived in N ms`. A row that has not derived shows **no number** — never the published figure "just until it resolves".
2. **Derivation order as content** — the sets derive cheapest-first, so the three SLH-DSA `s` variants stream in behind everything else. Watching SLH-DSA-192s still signing while eighteen rows are done teaches the s/f tradeoff before a number appears.
3. **Skip slow sets** — one click abandons the three `s` variants. They are marked *not measured, skipped by you*: an explicit third state, never a spec-filled number and never a blank.
4. **The derivation log** — completion order with the elapsed cost beside each entry and a bar drawn from that figure. An `s` row next to its `f` row is the whole tradeoff in one picture, measured on your device.
5. **Commonly misquoted numbers** — exactly five rows, each with its evidence anchor. Four are settled by this page's own output; the fifth says plainly that it was cited rather than measured.
6. **Claim a size** (break-it-yourself) — type the byte count you believe and let the real library answer. Point it at a set you skipped and the page **refuses** to answer, because the only thing it could answer with is the published constant.
7. **TLS wire cost** — pick a KEM and a signature; the page encapsulates, signs, concatenates the four buffers and reads `.length` off the concatenation. The hybrid overhead is shown as a measurement of two byte counts rather than a quoted percentage.
8. **Benchmarks** — median and p95 for keygen, encapsulate/sign and decapsulate/verify, with the sample count, the measured clock resolution and the full environment printed beside every figure, and a ratio column against X25519 measured in the same run.
9. **Implementation risk** — four rows naming something an implementation of that scheme has actually had to deal with, each linking to the lab that demonstrates it. Two are evidenced by this page's own output.
10. **What this table cannot see** — the negative-claim fixture. One corrupted ciphertext byte, every check green, and the wrong key in your hand.

## When to Use It

- **Use it** to get a feel for the byte and millisecond trade-offs between post-quantum families before reading the standards, or to check a figure you have been quoted against what a real library produces on your own machine.
- **Use it** to see why "the signature is N bytes" is the wrong shape of sentence for Falcon.
- **Do NOT use it** to choose a scheme for a real deployment. The table cannot see implementation quality, side-channel resistance, library maturity, certification status, hardware support, or anything else that decides a real migration. Its own "Implementation risk" column exists to say so.
- **Do NOT use it** as a hardware benchmark. Every timing is your device, this browser, this run.

## Live Demo

**<https://systemslibrarian.github.io/crypto-lab-pq-chooser/>**

Open it and the table starts filling immediately. Then:

- Watch the fill order, and press **Skip slow sets** while the SLH-DSA `s` variants are still measuring.
- Open the **derivation log** and compare an `s` row with the `f` row beside it.
- In **Claim a size**, leave the default (ML-DSA-65, 3293 bytes) and press **Check it** — then try a set you skipped.
- Price a handshake with **Falcon-512** and compute it twice; the total moves.
- Run the **benchmark**, and read the environment block under it.
- Press **Corrupt one ciphertext byte and decapsulate**, then press it again on a different byte.

## What Can Go Wrong

Failure paths are named on screen with the actual cause, never swallowed:

| Code | When | What the page does |
|---|---|---|
| `DERIVE_SKIPPED` | You pressed **Skip slow sets** | Marks those rows *not measured, skipped by you*. Never a spec value, never a blank. |
| `DERIVE_FAILED` | A parameter set threw | Renders the library's own message on the row. |
| `WORKER_UNAVAILABLE` | The browser provides no Web Worker | Derives **nothing** and says why on all nineteen rows. Fail-closed: deriving on the main thread would freeze the tab for about nine seconds. |
| `CLAIM_MALFORMED` | The claim checker got something that is not a whole number of bytes | Says so, and checks nothing. |
| `CLAIM_NOT_DERIVED` | You aimed the claim checker at a set that was skipped or has not derived | **Refuses to answer.** The published figure would settle it instantly, and using it there would undo the only thing this page claims. |
| `CLAIM_CONTRADICTED` | The library does not produce the claimed length | Names what it did produce. |
| `WIRE_NOT_DERIVED` | A handshake component cannot be produced | No total, and the reason. |
| `BENCH_NOT_MEASURED` | RSA-2048 key generation | Deliberately not timed — it is a randomised prime search, so timing it measures luck. The cell says so rather than being dropped. |
| `KEM_NO_FAILURE_CODE` | ML-KEM decapsulation of a corrupted ciphertext | Reports that there is **no code to report**. The absence is the exhibit. |

Three further traps this page is built around:

- **A figure that is not yet derived is not displayed.** The temptation to show the spec value "just until it resolves" is strongest exactly where it would do most damage, so the loading state, the skipped state and the no-worker state all hold a reason instead of a number.
- **A stale verdict is retired, not left.** Change the parameter set in the claim checker or the schemes in the handshake panel and the previous answer is replaced by an explicit *RETIRED* notice. Re-selecting the *same* value does not retire a fresh verdict.
- **A range over N samples is not the scheme's bounds.** The Falcon rows say how many signatures they measured and how many distinct lengths those took. Sixteen samples showed nine distinct lengths while this was being written, and wider samples find wider ranges — which is why the page reports what it measured rather than a quoted range.

### What this does NOT prove

Stated on the page as well as here:

- **A device benchmark is not a security ranking.** The fastest row is not the safest.
- **Smaller is not safer.** The size columns are a deployment constraint, not a strength ordering — and the NIST categories do not line up across schemes anyway (ML-DSA-44 is category 2 while Falcon-512 and SLH-DSA-128s are category 1).
- **A derivation that succeeds says nothing about constant-time behaviour.** Nothing on this page could fail if the implementation leaked its key through timing or power draw.

That last one is the lab's **negative claim**, and it has a fixture rather than a disclaimer: corrupt one bit of one ML-KEM ciphertext byte and decapsulate it. The ciphertext derived, decapsulation completed, the shared secret is full length, and ML-KEM reported no error — because FIPS 203 specifies *implicit rejection* and there is no error to report. Every check the page performs passes. The key is wrong. The verdict reads **DECAPSULATED — AND WRONG**, and `e2e/claims.spec.ts` asserts all three of: the fixture is reachable through the UI, every rendered check reports success in that state, and the limitation is visible on screen and not behind a disclosure.

## Real-World Usage

- **TLS 1.3** is where these byte counts land first. Chrome and Firefox ship ML-KEM-768 + X25519 hybrid key exchange by default; the handshake panel prices exactly that pairing.
- **Certificates** are the harder half. A post-quantum signature in a certificate chain multiplies: every intermediate, every OCSP staple, every SCT. The Certificate and CertificateVerify rows in the wire panel are the ones that make migration expensive.
- **Firmware and code signing** is where SLH-DSA's trade is worth it: signing happens rarely and offline, verification is comparatively cheap, and the security rests on the hash function alone rather than on a lattice assumption.
- **Falcon / FN-DSA** is chosen where bytes on the wire dominate — and avoided where a floating-point sampler in a side-channel-exposed environment is unacceptable.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-pq-chooser.git
cd crypto-lab-pq-chooser
npm install
npm run dev        # http://localhost:5173/crypto-lab-pq-chooser/
```

```bash
npm test           # Vitest: KATs, invariants, the misquote data, the harness
npm run build      # tsc --noEmit && vite build
npx playwright install chromium
npm run test:a11y  # axe WCAG 2.1 A/AA gate against the production build
npm run test:claims
```

## Related Demos

| Lab | What it adds |
|---|---|
| [PQ Families](https://systemslibrarian.github.io/crypto-lab-pq-families/) | Why lattices won, and the five-family landscape these rows sit inside |
| [Falcon Seal](https://systemslibrarian.github.io/crypto-lab-falcon-seal/) | Falcon's Gaussian sampler, and why its signatures are variable-length |
| [Dilithium Seal](https://systemslibrarian.github.io/crypto-lab-dilithium-seal/) | ML-DSA in depth, and the Round-3-versus-FIPS-204 distinction behind misquote rows 1 and 2 |
| [Hybrid Guide](https://systemslibrarian.github.io/crypto-lab-hybrid-guide/) | Whether to go hybrid at all, and the migration timeline |
| [KEM Trap](https://systemslibrarian.github.io/crypto-lab-kem-trap/) | ML-KEM implicit rejection — what integrations do with the silence |
| [KyberSlash](https://systemslibrarian.github.io/crypto-lab-kyberslash/) | The division-by-q timing leak, in the code that had it |
| [Multivariate UOV](https://systemslibrarian.github.io/crypto-lab-multivariate/) | The lab that recorded misquote row 5, and the UOV public-key arithmetic behind it |

This page answers *which one*. Every *why* lives in a lab of its own.

## Build & Verify

**Vitest: 270 tests across 12 files, all passing** — plus **29 Playwright claims tests** and **6 accessibility-gate tests**, for **305** in all. They cover:

- **`src/derive/kat.test.ts` — the spec KATs.** All nineteen parameter sets derived and checked against FIPS 203 Table 3, FIPS 204 Table 2, FIPS 205 Table 2 and Falcon v1.2, plus round-trip agreement, tamper rejection on every signature scheme, the hybrid compositions, and the Round-3 guard (asserting the stale 3293 and 4595 are *absent*, not merely that the right values are present).
- **`src/derive/spec-sizes.ts` — the only place a published figure exists.** `schemes.test.ts` fails the build if any module the page can reach imports it.
- **`src/derive/schemes.test.ts` — the four invariants, enforced three ways.** Structurally (nothing importable by the page imports the oracle); textually (no distinctive spec integer appears as a numeric literal in a rendering module, with strings and comments removed by a scanner rather than a regex, because `ml_kem768` and `'ML-KEM-768'` both contain 768 and neither is a size); and by output (the page's own initial HTML, before anything is derived, contains no published figure at all — with the five quoted misquote claims removed first, since a panel about misquoted numbers has to be able to print one).
- **`src/misquote/rows.test.ts`** — every claimed figure is checked against real output and required to **disagree**. A "misquote" the library agrees with is not a misquote.
- **`src/wire/handshake.test.ts`** — the total is a concatenation's length, the parts sum to it, and a Falcon-priced handshake really does move between runs.
- **`src/derive/kem-fixture.test.ts`** — implicit rejection across six different corrupted bytes, and the negative claim scoped to the construction rather than to the field.
- **`src/bench/stats.test.ts`** — the percentile estimator pinned to R type-7 against hand-worked values, and ops/sec derived from the median.
- Plus the UA parsers, the timer-resolution probe, the formatting rules (including the refusal to print a figure below the clock's resolution), the retirement/no-op logic and the failure-code table.

**Accessibility gate:** `@axe-core/playwright` scans the **production build** for zero WCAG 2.1 A/AA violations, at desktop and 380px width, across every state the page can be in — first paint with all nineteen rows queued, the last slow set measuring, the whole matrix derived, both disclosures open, every claim-checker branch, a computed handshake, a real benchmark run, the negative-claim fixture, three hover states, focus rings, the three slow sets skipped, and a browser with no Web Worker. The gate goes beyond axe's `violations` array: it asserts the `incomplete` bucket, computes contrast arithmetically over composited colour (every meaningful surface here is a `color-mix()` axe declines to resolve), measures WCAG 1.4.11 control boundaries against a ratchet baseline, and checks reflow, scroller keyboard reachability and invisible focus targets — none of which axe has a rule for.

Three real defects were found by that gate and fixed rather than baselined: the derivation log scrolled with no keyboard route (2.1.1); the hero's `align-items: flex-start` made its children size to fit-content once stacked, overflowing a phone (1.4.10); and the `.sr-only` spans that explain each empty cell were absolutely positioned with no positioned ancestor, so fifty-seven of them escaped the matrix's scroll container and pushed the document to 702px inside a 380px viewport. `e2e/nontext-baseline.ts` is empty, and that is the terminal state of the ratchet, not an unrun check.

**Claims suite:** `e2e/claims.spec.ts` checks the page tells the truth — the status counter against the rows it counts, every misquote verdict against the matrix cell that settles it, the handshake parts against the matrix rows for the same schemes and against the printed total, the hybrid overhead percentage recomputed from two printed byte counts, the category column's unalignment re-derived from the rendered categories, every failure path with its cause, verdict retirement and its no-op guard, the `[hidden]` cascade probe, and the three §4.1d negative-claim assertions. Not one expected byte count is written into that file.

### Measured derivation cost

On the machine this was written on (Apple M5, Node 26, median of 5). These drive a scheduling decision, so they are measured rather than assumed:

| Scheme | keygen | sign / encapsulate |
|---|---|---|
| ML-KEM (any set) | ~0.5 ms | ~0.5 ms |
| ML-DSA (any set) | ~2 ms | 3–5 ms |
| Falcon-512 / Falcon-1024 | 69 ms / 223 ms | ~5 ms |
| SLH-DSA-128f / 192f / 256f | 5–15 ms | 43 / 76 / 274 ms |
| **SLH-DSA-128s** | 107 ms | **851 ms** |
| **SLH-DSA-192s** | 166 ms | **2 006 ms** |
| **SLH-DSA-256s** | 240 ms | **4 425 ms** |

The full matrix costs roughly **nine seconds**, over seven of which are three SLH-DSA `s` signatures — which is why derivation runs in a worker, why the slow sets run last, and why there is a skip control at all.

**Known gap, stated rather than papered over:** `DERIVE_FAILED` is not reachable from the browser — `@noble/post-quantum` 0.7.x derives all nineteen sets in every browser the gate runs — so the claims suite cannot drive a fixture for it. It is covered by unit tests that drive the adapter and the renderer directly, and there is no debug mode added to fake it, because a mode only this lab has would be a worse answer than an honest gap. Two more: the measured costs above are an Apple M5 and have **not** been re-measured on a mid-range phone, which is the number that decides whether the slow sets should become derive-on-click rather than eager-behind-the-others; and misquote row 5 (UOV) is cited rather than derived, because UOV is not among the sets this page runs.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
