-- Cache tables for the market-quotes Edge Function (supabase/functions/market-quotes).
-- Idempotent: safe to re-run. Run once in the Supabase SQL editor before deploying the function.

create table if not exists public.market_quotes (
  ticker text primary key,
  price double precision not null check (price > 0),
  previous_close double precision not null check (previous_close > 0),
  currency text not null,
  as_of timestamptz not null,
  source text not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.market_quote_providers (
  provider text primary key,
  blocked_until timestamptz not null,
  last_status integer,
  updated_at timestamptz not null default now()
);

-- Only the Edge Function (service role, which bypasses RLS) reads or writes these tables.
-- RLS without policies plus revoked grants keeps them invisible to app clients.
alter table public.market_quotes enable row level security;
alter table public.market_quote_providers enable row level security;
revoke all on public.market_quotes from anon, authenticated;
revoke all on public.market_quote_providers from anon, authenticated;
