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

-- Create policies allowing authenticated & anon users to access rows matching their user_id or auth.uid()
CREATE POLICY "Users can access their own transactions" ON public.transactions 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can access their own categories" ON public.categories 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can access their own financial_accounts" ON public.financial_accounts 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can access their own investments" ON public.investments 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can access their own loans" ON public.loans 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can access their own user_settings" ON public.user_settings 
  FOR ALL USING (user_id IS NULL OR user_id = auth.uid()) WITH CHECK (user_id IS NULL OR user_id = auth.uid());
