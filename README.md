# Farmgate

A personal crop-economics research tool. Search any vegetable, fruit, or
nut crop — from kale to sugar apple to black sapote — and get:

- An AI-researched wholesale/direct-to-consumer price benchmark, focused on
  Queensland/east-coast Australia where possible, always shown with a date
  and an honest confidence label (never presented as more certain than it
  is).
- A place to log real buyer conversations (price, volume, how firm the
  commitment is) into a demand curve, visualized on a chart.
- A price-testing calculator — pick a price, see how much demand you'd
  actually capture and what it's worth.
- A planting-size and margin calculator — turn a target supply volume into
  acres required, costs, and net margin.
- A one-page PDF export of the whole picture, ready to print or file.

Everything is saved to the cloud (Supabase), so the same data shows up
whether you open this on your phone, laptop, or any other device.

## Quick start

**First time setting this up?** Follow **[docs/SETUP.md](docs/SETUP.md)**
— a step-by-step walkthrough for creating a free Supabase project, getting
a free Gemini API key, and publishing to GitHub Pages. Takes about
10–15 minutes.

**Want to understand a design decision, or resume building/extending
this?** Read **[docs/SPEC.md](docs/SPEC.md)** — it captures every choice
made while building this (why Supabase over alternatives, why no backend,
why the confidence-labeling requirement, the data model, and so on) so you
don't need to reconstruct the reasoning from scratch.

**Resuming a build that isn't finished yet?** Read
**[BUILD_PROGRESS.md](BUILD_PROGRESS.md)** first — it tracks exactly what's
built, tested, and what's left, stage by stage.

## What this is not

This is a research/planning tool, not a live market-data feed or a
margin-tracking system. Prices come from a single AI-assisted lookup,
refreshed only when you ask — they are a starting point for your own
judgement, not verified fact. If you're also building an ERP or
sales-tracking system, this tool is designed to be read *by* that system
later (via Supabase's API) rather than merged into it — see the "Why two
separate Supabase tables" section of `docs/SPEC.md` for the reasoning.

## Project layout

```
index.html              -- main page
css/style.css            -- visual design (screen)
css/print.css             -- visual design (PDF export / printing)
js/                       -- all application logic, see BUILD_PROGRESS.md
                             for what each file does
docs/SPEC.md               -- full design rationale
docs/SETUP.md               -- setup walkthrough
docs/schema.sql               -- Supabase database schema
BUILD_PROGRESS.md               -- build stage tracker
```
