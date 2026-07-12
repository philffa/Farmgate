# Farmgate — Design Spec

This document captures every decision made during planning and *why*, so a
future build session (or future you) doesn't need the original chat history.

## What this tool is

A personal crop-economics research tool. You type a crop name — anything from
"kale" to "sugar apple" to "black sapote" — and get:

1. A price benchmark (wholesale + direct-to-consumer ranges) for that crop,
   sourced by Gemini and focused on QLD/east-coast Australia where possible.
2. A place to log real conversations with buyers (price they'd pay, volume
   they'd take, how firm that commitment is) — building a real demand curve
   over time.
3. A price-testing calculator — pick a price, see how much of your logged
   demand it captures and what revenue that implies.
4. A planting-size and margin calculator — turn a target supply volume into
   acres required, costs, and net margin.
5. A one-page PDF export of all of the above, for printing/filing/sharing.

Everything you look up or log **persists in the cloud** (Supabase), so the
same data shows up whether you open the tool on your phone, laptop, or any
other device — not just saved to one browser.

## What this tool is explicitly NOT

- **Not a source of truth for prices.** Gemini's answers are a researched
  starting point, not verified market data. They are always shown with a
  confidence label and a date, and are expected to need manual correction.
- **Not a margin-tracking / alerting system.** That's the job of the
  separate ERP system being built elsewhere. This tool only produces a
  dated benchmark price the ERP can later read and compare against — it
  does not track actual sales, actual costs, or alert on margin drift.
  Keep these systems decoupled: separate concerns, separate codebases,
  connected only by one system reading the other's published data later.

## Why these specific technology choices

### Why GitHub Pages for hosting
User already uses GitHub and is comfortable with it. GitHub Pages is free,
serves static files, no server to maintain.

### Why no backend / serverless function for the Gemini key
Originally considered a serverless function (Cloudflare Workers etc.) to
keep the Gemini API key hidden from anyone viewing page source. User
explicitly decided this is unnecessary: this is a personal tool nobody
else will realistically use or view, so the key is embedded directly in
the frontend JS. **This is a conscious, accepted trade-off, not an
oversight** — do not "fix" this later by adding a backend unless the user
asks, since it would add real complexity for a risk they've already
weighed and dismissed.

### Why Supabase over Firebase / localStorage / GitHub-API-commits
- **localStorage** was rejected: data would be trapped on one device/browser,
  defeating the multi-device requirement.
- **GitHub-via-API** (page commits JSON back to the repo) was considered:
  keeps everything inside GitHub, but is more complex to set up (repo
  tokens, commit API) than a purpose-built database.
- **Supabase** was chosen over Firebase specifically because it's a real
  Postgres table underneath — easy to browse, query, or hand-edit later,
  and maps cleanly to the two-table relational structure this tool needs
  (one crop → many demand curve entries). Also has a generous permanent
  free tier.

### Why two separate Supabase tables, not one
`crop_benchmarks` (one row per crop) and `demand_curve_entries` (many rows
per crop, foreign-keyed to it) are kept separate because they're
conceptually different things updated at different rates: a benchmark
price might be refreshed every few months, while demand curve entries get
added/edited constantly as you talk to buyers. Keeping them separate also
means the future ERP integration can read just `crop_benchmarks` (the only
table it actually needs) without needing to understand or touch the demand
curve data at all.

### Why Gemini, not another model, for price lookups
User's explicit request — cost (free tier) was the deciding factor. The
lookup module should be written so the actual API call is reasonably
isolated (see `js/gemini-lookup.js`) in case this ever needs to change.

### Why QLD/east-coast-first prompting
User is a QLD-based grower; national or global benchmarks are less useful
than local ones. But thinner geographic scope means thinner real data for
Gemini to draw on — the prompt design **requires Gemini to self-report a
confidence level** (`qld_specific` / `east_coast` / `australia_general` /
`global_estimate`) rather than presenting a guess as verified local fact.
This is a hard requirement, not a nice-to-have: never let the UI show a
price without also showing its confidence level and date.

### Why PDF export is client-side only (no backend)
Keeps the "no backend" architecture consistent. Achieved via print-specific
CSS (`css/print.css`) triggered by `window.print()` — the browser's own
"Save as PDF" in the print dialog produces the actual PDF. This avoids
pulling in a heavy client-side PDF-generation library for what is
fundamentally a print-layout problem.

## Data model

### Table: `crop_benchmarks`
```sql
crop_name        text primary key   -- lowercase, normalized (e.g. "sugar apple")
display_name     text               -- proper casing (e.g. "Sugar Apple")
wholesale_low    numeric
wholesale_high   numeric
dtc_low          numeric
dtc_high         numeric
confidence       text               -- qld_specific | east_coast | australia_general | global_estimate
reasoning        text               -- short Gemini explanation of its anchor/reasoning
last_updated     timestamptz
source           text               -- 'gemini' | 'manual'
```

### Table: `demand_curve_entries`
```sql
id               uuid primary key default gen_random_uuid()
crop_name        text references crop_benchmarks(crop_name)
buyer_name       text
price            numeric
volume_kg_wk     numeric
buyer_type       text
evidence_level   text               -- stated | anchored | trial | repeat
notes            text
created_at       timestamptz default now()
updated_at       timestamptz default now()
```

`evidence_level` exists because stated willingness-to-pay is weaker
evidence than a confirmed trial or repeat order — the demand curve chart
visually weights points by this field (larger/solid dot = stronger
evidence), a design carried over from the single-crop prototype tool.

## Visual design language (carry over from prototype)

The prototype (`collard_greens` single-file tool, built earlier) uses a
"ledger / almanac" aesthetic:
- Palette: paper cream (#F7F3EA), dark soil ink (#3D3226), leaf green
  (#5C6E3E / #42502C), harvest orange (#C17A3D), rust red (#93412F) for
  negative numbers.
- Type: Source Serif 4 (headings/display), Inter (body), IBM Plex Mono
  (all numbers/data — this is a numbers tool, mono reinforces that).
- Layout: numbered ledger sections (I, II, III...), ruled paper background,
  stat-grid cards, dashed demand-curve chart with evidence-weighted dots.

This new tool should reuse this exact visual language, extended with a
"Part 0" search box that sits above the numbered sections and pre-fills
Part I (now called the price benchmark, previously "starting price
window") instead of requiring manual anchor entry.

## Known constraints / non-goals (do not silently expand scope)

- No user authentication. Single implicit user, personal use only.
- No attempt to make the crop list "exhaustive" upfront — it starts empty
  and grows only through genuine lookups. Never fabricate placeholder data
  for crops that haven't been searched.
- No live market data feeds, no scraping, no price APIs beyond the Gemini
  text-generation call.
- No integration code for the separate ERP system in this build — only
  make sure the `crop_benchmarks` schema is clean enough to be read by
  something else later.
