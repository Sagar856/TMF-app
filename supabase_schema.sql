-- =======================================================
-- SUPABASE MULTI-USER SECURE SCHEMA FOR TRACK MONEY FLOW (TMF)
-- Paste and Run this in your Supabase SQL Editor
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)
--
-- MULTI-USER COMPOSITE PRIMARY KEY (user_id, id):
-- Each table uses a composite primary key PRIMARY KEY (user_id, id).
-- This ensures multiple users sharing one Supabase project can both have
-- identical seed/default record IDs (e.g. cat_food, tx_101, acc_kotak_4666)
-- without key collisions or upsert conflicts.
--
-- COMPATIBILITY NOTE:
-- Rows synced before the addition of the `details` JSONB column on investments
-- and loans will have empty details ('{}'::jsonb). The next sync from a device
-- that still has full local data will automatically backfill the complete
-- record details (schedules, lots, NAVs, units, redemptions, etc.) into `details`.
-- =======================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Transactions Table (User isolated with composite PK)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT,
  location JSONB,
  source TEXT DEFAULT 'Manual',
  raw_text TEXT,
  payee_or_payer TEXT,
  payment_method TEXT,
  note TEXT,
  ref_number TEXT,
  kind TEXT,
  account_id TEXT,
  to_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'investment')),
  icon_name TEXT DEFAULT 'Folder',
  subcategories JSONB DEFAULT '[]'::jsonb,
  budget_limit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- 3. Financial Accounts Table
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  type TEXT NOT NULL,
  account_number_last4 TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  credit_limit NUMERIC DEFAULT 0,
  approx_monthly_bill NUMERIC DEFAULT 0,
  due_date TEXT,
  card_holder_name TEXT,
  card_network TEXT,
  card_color_theme TEXT DEFAULT 'dark',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- 4. Investments Table (With details JSONB preserving all domain fields)
CREATE TABLE IF NOT EXISTS public.investments (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_invested NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  returns_percent NUMERIC DEFAULT 0,
  date DATE NOT NULL,
  monthly_contributions JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- 5. Loans Table (With details JSONB preserving all domain fields & schedule)
CREATE TABLE IF NOT EXISTS public.loans (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  person_or_bank TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('loan', 'lend')),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC DEFAULT 0,
  due_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'repaid', 'overdue')),
  repayments JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- 6. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  user_name TEXT DEFAULT 'New User',
  user_email TEXT,
  currency_symbol TEXT DEFAULT '₹',
  theme TEXT DEFAULT 'dark',
  passcode_enabled BOOLEAN DEFAULT FALSE,
  default_net_worth_masked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- =======================================================
-- IDEMPOTENT MIGRATION FOR EXISTING PROJECTS:
-- Replace single-column PK with composite PRIMARY KEY (user_id, id)
-- And add details JSONB column to investments and loans.
-- Safe to re-run: constraints are only (re)created when they are not
-- already the composite (user_id, id) key.
-- =======================================================
DO $$
DECLARE
  t TEXT;
  pk_cols TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'categories', 'financial_accounts', 'investments', 'loans', 'user_settings'] LOOP
    SELECT string_agg(a.attname, ',' ORDER BY k.ord)
      INTO pk_cols
      FROM pg_constraint c
      JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conrelid = ('public.' || t)::regclass
       AND c.contype = 'p';

    IF pk_cols IS DISTINCT FROM 'user_id,id' THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_pkey');
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (user_id, id)', t, t || '_pkey');
    END IF;
  END LOOP;
END $$;

-- Add details JSONB column to preserve all rich fields on investments and loans
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS ref_number TEXT;
-- Semantic classification + canonical account linkage (see src/utils/transactionKind.ts)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS to_account_id TEXT;

-- =======================================================
-- SYNC METADATA: updated_at (last-writer timestamp) and deleted_at
-- (tombstone). Deletes are soft so every device learns about them and
-- a stale device can never resurrect a deleted row.
-- =======================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'categories', 'financial_accounts', 'investments', 'loans'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, deleted_at)', t || '_user_deleted_idx', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.tmf_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'categories', 'financial_accounts', 'investments', 'loans'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tmf_set_updated_at()', t || '_set_updated_at', t);
  END LOOP;
END $$;

-- The app never stores the PIN in the cloud (it keeps a salted hash on-device
-- only); remove the legacy plaintext column so it can never be populated.
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS passcode;

-- Indexes for the per-user reads/orders the client performs
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON public.transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS categories_user_idx ON public.categories (user_id);
CREATE INDEX IF NOT EXISTS financial_accounts_user_idx ON public.financial_accounts (user_id);
CREATE INDEX IF NOT EXISTS investments_user_idx ON public.investments (user_id);
CREATE INDEX IF NOT EXISTS loans_user_idx ON public.loans (user_id);

-- Enforce user_id NOT NULL and DEFAULT auth.uid() on all tables
ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.categories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.financial_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.financial_accounts ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.investments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.investments ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.loans ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.loans ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.user_settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_settings ALTER COLUMN user_id SET DEFAULT auth.uid();

-- =======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SECURE MULTI-USER ACCESS
-- =======================================================
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can access their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can access their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can access their own financial_accounts" ON public.financial_accounts;
DROP POLICY IF EXISTS "Users can access their own investments" ON public.investments;
DROP POLICY IF EXISTS "Users can access their own loans" ON public.loans;
DROP POLICY IF EXISTS "Users can access their own user_settings" ON public.user_settings;

-- Strict per-user policies: only the authenticated owner can read/write their
-- own rows. No anonymous access, no NULL-owner bypass.
CREATE POLICY "Users can access their own transactions" ON public.transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access their own categories" ON public.categories
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access their own financial_accounts" ON public.financial_accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access their own investments" ON public.investments
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access their own loans" ON public.loans
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access their own user_settings" ON public.user_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
