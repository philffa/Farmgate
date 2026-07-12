-- Farmgate database schema for Supabase
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor → New query)
-- Safe to re-run: uses IF NOT EXISTS guards.

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Table 1: crop_benchmarks
-- One row per crop. Holds the researched/AI-looked-up price window.
-- ---------------------------------------------------------------
create table if not exists crop_benchmarks (
  crop_name       text primary key,       -- lowercase, normalized, e.g. "sugar apple"
  display_name    text not null,          -- proper casing, e.g. "Sugar Apple"
  wholesale_low   numeric,
  wholesale_high  numeric,
  dtc_low         numeric,
  dtc_high        numeric,
  confidence      text,                   -- qld_specific | east_coast | australia_general | global_estimate
  reasoning       text,                   -- short explanation of the anchor/reasoning used
  last_updated    timestamptz not null default now(),
  source          text not null default 'gemini'  -- 'gemini' | 'manual'
);

comment on table crop_benchmarks is
  'One researched price benchmark per crop. Refreshed periodically, not live market data.';

-- ---------------------------------------------------------------
-- Table 2: demand_curve_entries
-- Many rows per crop. Your logged buyer conversations.
-- ---------------------------------------------------------------
create table if not exists demand_curve_entries (
  id              uuid primary key default gen_random_uuid(),
  crop_name       text not null references crop_benchmarks(crop_name) on delete cascade,
  buyer_name      text,
  price           numeric,
  volume_kg_wk    numeric,
  buyer_type      text,
  evidence_level  text,                   -- stated | anchored | trial | repeat
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table demand_curve_entries is
  'Individual buyer data points making up a demand curve for one crop.';

create index if not exists idx_demand_curve_crop
  on demand_curve_entries (crop_name);

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------
-- This is a personal single-user tool with no login screen, using the
-- public "anon" API key directly from the browser. To keep this simple
-- (per the accepted low-security trade-off — see docs/SPEC.md), RLS is
-- left OFF so the anon key can read and write freely. If you ever add
-- login/auth later, turn RLS on and add policies scoped to auth.uid().

alter table crop_benchmarks disable row level security;
alter table demand_curve_entries disable row level security;
