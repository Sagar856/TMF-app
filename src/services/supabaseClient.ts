import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Transaction, Category, FinancialAccount, InvestmentRecord, LoanRecord } from '../types/finance';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(url?: string, key?: string): SupabaseClient | null {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  const supabaseUrl = url || metaEnv.VITE_SUPABASE_URL || localStorage.getItem('tmf_supabase_url');
  const supabaseKey = key || metaEnv.VITE_SUPABASE_ANON_KEY || localStorage.getItem('tmf_supabase_key');

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return supabaseInstance;
}

export async function testSupabaseConnection(url: string, key: string): Promise<boolean> {
  try {
    const client = createClient(url, key);
    const { error } = await client.from('transactions').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      if (error.message?.includes('apiKey') || error.message?.includes('JWT')) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ===============================================
// DATA SYNC SERVICES FOR REACT COMPONENTS
// ===============================================

// 1. Transactions Sync
export async function syncTransactionsToSupabase(transactions: Transaction[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = transactions.map((t) => ({
      id: t.id,
      title: t.title,
      amount: t.amount,
      type: t.type,
      category: t.category,
      subcategory: t.subcategory,
      date: t.date,
      time: t.time || '00:00',
      location: t.location || null,
      source: t.source || 'Manual',
      raw_text: t.rawText || null,
      payee_or_payer: t.payeeOrPayer || null,
      payment_method: t.paymentMethod || null,
      note: t.note || null,
    }));

    const { error } = await client.from('transactions').upsert(rows, { onConflict: 'id' });
    if (error) console.error('Supabase transactions sync error:', error);
    return !error;
  } catch (err) {
    console.error('Failed syncing transactions to Supabase:', err);
    return false;
  }
}

export async function fetchTransactionsFromSupabase(): Promise<Transaction[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('transactions').select('*').order('date', { ascending: false });
    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      amount: Number(row.amount),
      type: row.type,
      category: row.category,
      subcategory: row.subcategory,
      date: row.date,
      time: row.time,
      location: row.location,
      source: row.source,
      rawText: row.raw_text,
      payeeOrPayer: row.payee_or_payer,
      paymentMethod: row.payment_method,
      note: row.note,
    }));
  } catch {
    return null;
  }
}

// 2. Categories Sync
export async function syncCategoriesToSupabase(categories: Category[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon_name: c.iconName,
      subcategories: c.subcategories || [],
      budget_limit: c.budgetLimit || 0,
    }));

    const { error } = await client.from('categories').upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchCategoriesFromSupabase(): Promise<Category[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('categories').select('*');
    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      iconName: row.icon_name,
      subcategories: row.subcategories || [],
      budgetLimit: Number(row.budget_limit || 0),
    }));
  } catch {
    return null;
  }
}

// 3. Financial Accounts Sync
export async function syncAccountsToSupabase(accounts: FinancialAccount[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      bank_name: a.bankName,
      type: a.type,
      account_number_last4: a.accountNumberLast4,
      balance: a.balance,
      credit_limit: a.creditLimit || 0,
      approx_monthly_bill: a.approxMonthlyBill || 0,
      due_date: a.dueDate || null,
      card_holder_name: a.cardHolderName || null,
      card_network: a.cardNetwork || null,
      card_color_theme: a.cardColorTheme || 'dark',
      is_default: Boolean(a.isDefault),
    }));

    const { error } = await client.from('financial_accounts').upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchAccountsFromSupabase(): Promise<FinancialAccount[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('financial_accounts').select('*');
    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      bankName: row.bank_name,
      type: row.type,
      accountNumberLast4: row.account_number_last4,
      balance: Number(row.balance),
      creditLimit: Number(row.credit_limit || 0),
      approxMonthlyBill: Number(row.approx_monthly_bill || 0),
      dueDate: row.due_date,
      cardHolderName: row.card_holder_name,
      cardNetwork: row.card_network,
      cardColorTheme: row.card_color_theme,
      isDefault: Boolean(row.is_default),
    }));
  } catch {
    return null;
  }
}

// 4. Investments Sync
export async function syncInvestmentsToSupabase(investments: InvestmentRecord[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = investments.map((inv) => ({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      amount_invested: inv.amountInvested,
      current_value: inv.currentValue,
      returns_percent: inv.returnsPercent,
      date: inv.date,
      monthly_contributions: inv.monthlyContributions || [],
      notes: inv.notes || null,
    }));

    const { error } = await client.from('investments').upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchInvestmentsFromSupabase(): Promise<InvestmentRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('investments').select('*');
    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      amountInvested: Number(row.amount_invested),
      currentValue: Number(row.current_value),
      returnsPercent: Number(row.returns_percent),
      date: row.date,
      monthlyContributions: row.monthly_contributions || [],
      notes: row.notes,
    }));
  } catch {
    return null;
  }
}

// 5. Loans Sync
export async function syncLoansToSupabase(loans: LoanRecord[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rows = loans.map((l) => ({
      id: l.id,
      title: l.title,
      person_or_bank: l.personOrBank,
      type: l.type,
      total_amount: l.totalAmount,
      remaining_amount: l.remainingAmount,
      interest_rate: l.interestRate || 0,
      due_date: l.dueDate || null,
      status: l.status,
      repayments: l.repayments || [],
      notes: l.notes || null,
    }));

    const { error } = await client.from('loans').upsert(rows, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchLoansFromSupabase(): Promise<LoanRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from('loans').select('*');
    if (error || !data) return null;

    return data.map((row) => ({
      id: row.id,
      title: row.title,
      personOrBank: row.person_or_bank,
      type: row.type,
      totalAmount: Number(row.total_amount),
      remainingAmount: Number(row.remaining_amount),
      interestRate: Number(row.interest_rate || 0),
      dueDate: row.due_date,
      status: row.status,
      repayments: row.repayments || [],
      notes: row.notes,
    }));
  } catch {
    return null;
  }
}
