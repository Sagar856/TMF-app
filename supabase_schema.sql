-- =======================================================
-- SUPABASE MULTI-USER SECURE SCHEMA FOR TRACK MONEY FLOW (TMF)
-- Paste and Run this in your Supabase SQL Editor
-- (Supabase Dashboard -> SQL Editor -> New Query -> Run)
-- =======================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Transactions Table (User isolated)
CREATE TABLE IF NOT EXISTS public.transactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'investment')),
  icon_name TEXT DEFAULT 'Folder',
  subcategories JSONB DEFAULT '[]'::jsonb,
  budget_limit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Financial Accounts Table
CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Investments Table
CREATE TABLE IF NOT EXISTS public.investments (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  amount_invested NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  returns_percent NUMERIC DEFAULT 0,
  date DATE NOT NULL,
  monthly_contributions JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Loans Table
CREATE TABLE IF NOT EXISTS public.loans (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. User Settings Table
CREATE TABLE IF NOT EXISTS public.user_settings (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  user_name TEXT DEFAULT 'New User',
  user_email TEXT,
  currency_symbol TEXT DEFAULT '₹',
  theme TEXT DEFAULT 'dark',
  passcode_enabled BOOLEAN DEFAULT FALSE,
  passcode TEXT DEFAULT '1234',
  default_net_worth_masked BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR SECURE MULTI-USER ACCESS
-- =======================================================
--
-- SECURITY FIX (2026-08-09): the previous policies used
--   USING (user_id IS NULL OR user_id = auth.uid())
-- which let ANY signed-in (or even anonymous) user read/write every row that
-- had a NULL user_id — effectively a shared, unprotected data pool. This is
-- now a strict per-user policy: only the row's owner can ever see or modify
-- it, and only signed-in ("authenticated") requests are allowed at all —
-- anonymous/anon-key-only requests are rejected outright.
--
-- If you already have existing rows with user_id = NULL from before this
-- fix, they are now permanently inaccessible under RLS (by design — nobody
-- can safely claim ownership of them). Either delete them or manually
-- UPDATE ... SET user_id = '<owner-uuid>' as the service_role before running
-- the NOT NULL migration below.

-- Backfill/cleanup required before enforcing NOT NULL — uncomment if you have
-- pre-existing NULL-owned rows you want to discard:
-- DELETE FROM public.transactions WHERE user_id IS NULL;
-- DELETE FROM public.categories WHERE user_id IS NULL;
-- DELETE FROM public.financial_accounts WHERE user_id IS NULL;
-- DELETE FROM public.investments WHERE user_id IS NULL;
-- DELETE FROM public.loans WHERE user_id IS NULL;
-- DELETE FROM public.user_settings WHERE user_id IS NULL;

ALTER TABLE public.transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.financial_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.investments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.loans ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.user_settings ALTER COLUMN user_id SET NOT NULL;

-- Enable RLS on all tables
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
