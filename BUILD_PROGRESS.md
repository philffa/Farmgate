# Farmgate Build Progress

**Read this file first if resuming a new session.** It tells you exactly what's
done, what's next, and where everything lives.

## Project summary

A personal crop-economics tool: search any crop → get an AI-researched (Gemini)
wholesale/DTC price benchmark for QLD/east-coast Australia, cached in Supabase
so every device sees the same data → build a demand curve from real buyer
conversations (also saved to Supabase) → test prices → size a planting →
export a 1-page PDF. Hosted free on GitHub Pages.

Full spec/rationale lives in `docs/SPEC.md` — read that for the "why" behind
any decision. This file only tracks "what stage are we at."

## Stage checklist

- [x] **Stage 0** — Project scaffold + this progress file + full spec doc
- [x] **Stage 1** — Supabase schema (SQL file) + setup instructions
- [x] **Stage 2** — Core HTML shell + CSS (visual design, reused/adapted from
      the single-file prototype) — no logic yet, static layout only
- [x] **Stage 3** — Supabase client wiring (`js/supabase-client.js`) — connect,
      read/write `crop_benchmarks` and `demand_curve_entries`
- [x] **Stage 4** — Gemini lookup module (`js/gemini-lookup.js`) — prompt
      design, call, parse, confidence handling
- [x] **Stage 5** — Search flow glue (`js/app.js` search logic) — ties search
      box → Supabase check → Gemini fallback → populate UI
- [x] **Stage 6** — Demand curve builder logic (ported from prototype, wired
      to Supabase persistence instead of in-memory array)
- [x] **Stage 7** — Price test + planting/margin calculators (ported from
      prototype, minor generalization from "collards" to any crop)
- [x] **Stage 8** — PDF export (`js/pdf-export.js`)
- [x] **Stage 9** — Config file for API keys (`js/config.js`, gitignored
      template provided) + README with setup walkthrough
- [x] **Stage 10** — End-to-end test pass, polish, final delivery

## Current state (update this each session)

**Last completed:** Stage 9 — top-level `README.md` written (project
summary, quick-start pointers to `docs/SETUP.md`/`docs/SPEC.md`/this file,
explicit "what this is not" section, project layout diagram). Reviewed
`docs/SETUP.md` against everything actually built: fixed one stale
cross-reference ("Step 3" → "Step 6, Add your keys to the project"), and
expanded the "Test it" section to actually exercise the demand-curve
add/edit flow and PDF export button (both didn't exist when SETUP.md was
first written in Stage 1, only benchmark lookup did) plus added a short
troubleshooting list for the most likely first-time error messages.
Confirmed `.gitignore` is still complete — nothing new needs ignoring.
Final repo structure verified clean (`view` on the whole directory) — 8 JS
files, 2 CSS files, 3 docs, README, progress tracker, index.html, no stray
test artifacts or leftover files from any earlier stage.

**Last completed:** Stage 10 (final stage) — full end-to-end verification pass.

1. **Codebase audit**: grepped all 8 JS files for `window.Farmgate` (the
   exact bug pattern found in Stage 6) — none found elsewhere. Confirmed
   the only remaining `window.` usage is `window.print()` in
   `pdf-export.js`, a legitimate browser API call, not a module lookup.

2. **True full-stack integration test** — this time only the two *external
   services* (Supabase, Gemini) were mocked; all 8 real, unmodified app
   modules ran together for one continuous session covering the entire
   user journey: search a brand-new crop → benchmark saved correctly →
   add 3 buyers with distinct prices/volumes/evidence levels → verify
   demand stats → test three different prices (20/12/8) and hand-check
   the qualifying-buyer logic at each → verify margin calculation
   ($32,640 revenue, $17,240 costs, **+$15,400 net margin** at the
   profitable price point) → delete a row and confirm price-test
   recalculates correctly (85kg→80kg, right buyer removed) → export PDF
   and confirm it reflects the post-delete state, not stale data →
   refresh the benchmark and confirm the date updates. **Zero errors** the
   entire session, every number checked out by hand.

3. **Mobile viewport test**: confirmed the `::before`-pseudo-element
   mobile table labels (e.g. "Price $/kg") render correctly on a 390px
   viewport, zero JS errors.

4. **Non-goals check** against `docs/SPEC.md`'s "Known constraints"
   section — all four held: no auth was added, the crop database starts
   genuinely empty (no fabricated pre-population), no scraping/market
   feeds beyond the single Gemini call, no ERP integration code (schema
   stayed clean/generic for future external reading).

All test sandboxes were created under separate `/home/claude/farmgate_*`
directories, never touched the real repo, and were fully deleted after
each passed.

## Project status: BUILD COMPLETE

All 10 stages done and tested. The real repo at `/home/claude/farmgate/`
is ready to hand to the user. **What the user still needs to do themselves**
(cannot be done in this environment, requires their own accounts):
1. Create a free Supabase project, run `docs/schema.sql` in its SQL editor.
2. Get a free Gemini API key from Google AI Studio.
3. Copy `js/config.example.js` to `js/config.js` and fill in the three real
   values.
4. Push the repo to GitHub, enable GitHub Pages in repo settings.
5. Follow `docs/SETUP.md` Step 5 ("Test it") to confirm everything works
   with real credentials — this build has been thoroughly tested against
   *mocked* Supabase/Gemini responses matching their documented shapes,
   but has never called the real APIs, since no real keys exist in this
   build environment. First real-key session should specifically watch
   for: (a) whether Gemini's JSON-mode output ever still wraps in markdown
   fences despite `responseMimeType: "application/json"` (the stripping
   logic in `gemini-lookup.js` should handle it either way, but worth
   confirming), (b) whether Gemini's confidence self-reporting behaves as
   prompted in practice or tends to overclaim `qld_specific` regardless
   (may need prompt tuning in `gemini-lookup.js`'s `buildPrompt()` after
   seeing a handful of real responses).

**Known gaps / things not yet done:** everything except Stage 0. This section
will be rewritten honestly after each stage — trust this section over the
checkboxes above if they ever disagree.

## File map (once scaffolded)

```
farmgate/
  index.html              -- main page shell
  css/
    style.css             -- main visual design (ledger/almanac theme)
    print.css              -- print-only rules for PDF export
  js/
    config.js              -- YOUR API keys go here (gitignored, template committed)
    supabase-client.js     -- Supabase read/write functions
    gemini-lookup.js       -- Gemini prompt + call + parse
    chart.js                -- demand curve SVG rendering (ported from prototype)
    app.js                  -- main glue: search flow, event wiring, state
    pdf-export.js           -- PDF/print export
  docs/
    SPEC.md                 -- full design rationale (why every decision was made)
    SETUP.md                -- step-by-step Supabase + Gemini + GitHub Pages setup
  BUILD_PROGRESS.md          -- this file
```
