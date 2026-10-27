/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { InvestmentsView } from './components/InvestmentsView';
import { LoansView } from './components/LoansView';
import { AccountsView } from './components/AccountsView';
import { UserProfileModal } from './components/UserProfileModal';
import { CustomisationsView } from './components/CustomisationsView';
import { SettingsView } from './components/SettingsView';
import { NotificationPromptModal } from './components/NotificationPromptModal';
import { SmsSimulatorWidget } from './components/SmsSimulatorWidget';
import { EditTransactionModal, CategoryType } from './components/EditTransactionModal';
import { FloatingActionButton } from './components/FloatingActionButton';
import { BottomNav } from './components/BottomNav';
import { AuthModal } from './components/AuthModal';
import { TopBarToast, ToastMessage } from './components/TopBarToast';
import { ConfirmationModal, ConfirmDialogConfig } from './components/ConfirmationModal';
import { BudgetPushNotificationBanner } from './components/BudgetPushNotificationBanner';
import { BudgetAlertPayload, checkBudgetThresholds } from './services/budgetAlertService';
import { EmiConfirmationPromptModal } from './components/EmiConfirmationPromptModal';

import {
  Transaction,
  TransactionType,
  Category,
  FinancialAccount,
  InvestmentRecord,
  LoanRecord,
  ParsedNotification,
  UserSettings,
  Repayment,
  InvestmentRedemption,
  EmiConfirmationRequest,
  LocationTag,
  PaymentSource,
} from './types/finance';

import {
  INITIAL_USER_SETTINGS,
  INITIAL_CATEGORIES,
  INITIAL_TRANSACTIONS,
  INITIAL_INVESTMENTS,
  INITIAL_LOANS,
  INITIAL_ACCOUNTS,
  SAMPLE_ACCOUNT_IDS,
  SAMPLE_TRANSACTION_IDS,
  SAMPLE_INVESTMENT_IDS,
  SAMPLE_LOAN_IDS
} from './data/initialData';

import {
  syncTransactionsToSupabase,
  fetchTransactionsFromSupabase,
  syncCategoriesToSupabase,
  fetchCategoriesFromSupabase,
  syncAccountsToSupabase,
  fetchAccountsFromSupabase,
  syncInvestmentsToSupabase,
  fetchInvestmentsFromSupabase,
  syncLoansToSupabase,
  fetchLoansFromSupabase,
  subscribeToAuthChanges,
  getCurrentUserSession,
  isCloudBackendConfigured,
  signOutUser,
  deleteTransactionFromSupabase,
  deleteAccountFromSupabase,
  deleteCategoryFromSupabase,
  deleteInvestmentFromSupabase,
  deleteLoanFromSupabase,
  deleteMultipleTransactionsFromSupabase,
  deleteMultipleAccountsFromSupabase,
  deleteMultipleInvestmentsFromSupabase,
  deleteMultipleLoansFromSupabase,
  deleteAllUserDataFromSupabase,
} from './services/supabaseClient';

import { parseNotification } from './services/notification/ParserManager';
import { getCurrentDeviceLocation } from './services/locationService';
import { resetDuplicateMemory } from './services/notification/DuplicateDetector';
import { startNotificationListener } from './services/notificationListener';
import { newId } from './utils/ids';
import { todayLocalISO, nowLocalTimeHHMM } from './utils/dates';
import { resolveAccountId } from './utils/accountResolver';
import { notifyTransactionDetected } from './services/localNotifications';
import { 
  LayoutDashboard, 
  ReceiptText, 
  TrendingUp, 
  HandCoins, 
  Building2,
  Sliders, 
  Settings, 
  Lock, 
  Key, 
  Smartphone,
  Bell
} from 'lucide-react';

// Max wrong passcode attempts before a cooldown lockout kicks in.
const MAX_PASSCODE_ATTEMPTS = 5;
const PASSCODE_LOCKOUT_MS = 30_000;

function ensureMandatoryCategories(cats: Category[]): Category[] {
  let updated = [...cats];
  let changed = false;
  if (!updated.some((c) => c.name.toLowerCase() === 'loans & lends')) {
    updated.push({
      id: 'cat_loans',
      name: 'Loans & Lends',
      type: 'expense',
      iconName: 'HandCoins',
      subcategories: ['EMI Repayment', 'Loan Received', 'Lent Out', 'Repayment Received'],
    });
    changed = true;
  }
  if (!updated.some((c) => c.name.toLowerCase() === 'investment')) {
    updated.push({
      id: 'cat_investment',
      name: 'Investment',
      type: 'investment',
      iconName: 'TrendingUp',
      subcategories: ['Purchase', 'Redemption', 'SIP'],
    });
    changed = true;
  }
  return changed ? updated : cats;
}

export default function App() {
  // Navigation Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // App Data with LocalStorage Persistence
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('tmf_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        sampleDataLoaded: parsed.sampleDataLoaded !== undefined ? parsed.sampleDataLoaded : true,
        skipDeleteConfirmation: parsed.skipDeleteConfirmation !== undefined ? parsed.skipDeleteConfirmation : false,
        skipInvestmentDeleteConfirmation: parsed.skipInvestmentDeleteConfirmation !== undefined ? parsed.skipInvestmentDeleteConfirmation : false,
        skipLoanDeleteConfirmation: parsed.skipLoanDeleteConfirmation !== undefined ? parsed.skipLoanDeleteConfirmation : false,
        autoCollapseExpandOnScroll: parsed.autoCollapseExpandOnScroll !== undefined ? parsed.autoCollapseExpandOnScroll : true,
      };
    }
    return {
      userName: '',
      userEmail: '',
      userPhoto: '',
      currencySymbol: '₹',
      currencyCode: 'INR',
      theme: 'dark',
      passcodeEnabled: false,
      passcode: '1234',
      supabaseUrl: '',
      supabaseKey: '',
      supabaseConnected: false,
      locationTracking: true,
      autoExtractSms: true,
      notificationsEnabled: true,
      budgetAlertsEnabled: true,
      sampleDataLoaded: true,
      skipDeleteConfirmation: false,
      skipInvestmentDeleteConfirmation: false,
      skipLoanDeleteConfirmation: false,
      autoCollapseExpandOnScroll: true,
    };
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('tmf_categories');
    const parsed: Category[] = saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
    const ensured = ensureMandatoryCategories(parsed);
    if (saved && ensured.length !== parsed.length) {
      localStorage.setItem('tmf_categories', JSON.stringify(ensured));
    }
    return ensured;
  });

  const [accounts, setAccounts] = useState<FinancialAccount[]>(() => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_account_ids') || '[]'));
    const saved = localStorage.getItem('tmf_accounts');
    if (saved !== null) {
      try {
        const parsed: FinancialAccount[] = JSON.parse(saved);
        return parsed.filter((a) => !deletedIds.has(a.id));
      } catch {
        return [];
      }
    }
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_ACCOUNTS.filter((a) => !deletedIds.has(a.id)) : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_tx_ids') || '[]'));
    const saved = localStorage.getItem('tmf_transactions');
    if (saved !== null) {
      try {
        const parsed: Transaction[] = JSON.parse(saved);
        return parsed.filter((t) => !deletedIds.has(t.id));
      } catch {
        return [];
      }
    }
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_TRANSACTIONS.filter((t) => !deletedIds.has(t.id)) : [];
  });

  const [investments, setInvestments] = useState<InvestmentRecord[]>(() => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_investment_ids') || '[]'));
    const saved = localStorage.getItem('tmf_investments');
    if (saved !== null) {
      try {
        const parsed: InvestmentRecord[] = JSON.parse(saved);
        return parsed.filter((i) => !deletedIds.has(i.id));
      } catch {
        return [];
      }
    }
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_INVESTMENTS.filter((i) => !deletedIds.has(i.id)) : [];
  });

  const [loans, setLoans] = useState<LoanRecord[]>(() => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_loan_ids') || '[]'));
    const saved = localStorage.getItem('tmf_loans');
    if (saved !== null) {
      try {
        const parsed: LoanRecord[] = JSON.parse(saved);
        return parsed.filter((l) => !deletedIds.has(l.id));
      } catch {
        return [];
      }
    }
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_LOANS.filter((l) => !deletedIds.has(l.id)) : [];
  });

  // Pending SMS / UPI Intercepted Notifications Queue
  const [pendingNotifications, setPendingNotifications] = useState<ParsedNotification[]>(() => {
    const saved = localStorage.getItem('tmf_pending_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Modals & UI States
  const mainScrollRef = useRef<HTMLElement>(null);
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);

  // Real Supabase Auth session state. This — not a locally-forgeable
  // localStorage flag — is what actually gates access to the app. Every user
  // shares one Supabase backend (see services/supabaseClient.ts); RLS keeps
  // their data private based on this session's real JWT.
  const [authUser, setAuthUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const isAuthenticated = Boolean(authUser);

  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Partial<Transaction> | null>(null);
  const [modalInitialCategoryType, setModalInitialCategoryType] = useState<CategoryType>('Expense');
  const [topBarToast, setTopBarToast] = useState<ToastMessage | null>(null);
  const [activeBudgetPushAlert, setActiveBudgetPushAlert] = useState<BudgetAlertPayload | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmDialogConfig | null>(null);
  const [isEmiModalOpen, setIsEmiModalOpen] = useState<boolean>(false);

  const pendingEmiRequests: EmiConfirmationRequest[] = useMemo(() => {
    const today = todayLocalISO();
    const reqs: EmiConfirmationRequest[] = [];
    loans.forEach((loan) => {
      if (loan.status === 'repaid' || loan.remainingAmount <= 0 || !loan.schedule) return;
      loan.schedule.forEach((inst) => {
        if (inst.status === 'pending_confirmation' || (inst.status === 'scheduled' && inst.dueDate <= today)) {
          reqs.push({
            id: `emi_req_${loan.id}_${inst.installmentNumber}`,
            loanId: loan.id,
            installmentNumber: inst.installmentNumber,
            loanTitle: loan.title || loan.personOrBank,
            lenderOrBank: loan.personOrBank,
            amount: inst.emiAmount,
            dueDate: inst.dueDate,
            linkedAccountId: inst.paymentAccountId || loan.linkedAccountId,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
        }
      });
    });
    return reqs.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [loans]);

  const showToast = (
    text: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'success',
    duration = 3200
  ) => {
    setTopBarToast({
      id: newId('toast'),
      text,
      type,
      duration,
    });
  };

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    if (!settings.passcodeEnabled) return true;
    return sessionStorage.getItem('tmf_session_unlocked') === 'true';
  });
  const [inputPasscode, setInputPasscode] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<boolean>(false);
  const [passcodeAttempts, setPasscodeAttempts] = useState<number>(0);
  const [passcodeLockedUntil, setPasscodeLockedUntil] = useState<number>(() => {
    const saved = localStorage.getItem('tmf_passcode_lock_until');
    const until = saved ? parseInt(saved, 10) : 0;
    return until > Date.now() ? until : 0;
  });
  const [passcodeLockRemaining, setPasscodeLockRemaining] = useState<number>(0);
  // Guards against duplicate concurrent cloud-data fetches (initial mount + auth success can both fire)
  const cloudLoadInFlightRef = useRef<boolean>(false);
  const [cloudHydrated, setCloudHydrated] = useState<boolean>(false);
  const lastPushedRef = useRef<Record<string, string>>({});
  // Surfaces the most recent backend sync outcome (success or a real error
  // message) so failures are visible instead of vanishing into the console.
  const [syncStatus, setSyncStatus] = useState<{ collection: string; success: boolean; error?: string; timestamp: number } | null>(null);

  // Helper to open modal with contextual Category Type based on active tab
  const handleOpenAddModal = (overrideCategoryType?: CategoryType) => {
    let catType: CategoryType = 'Expense';
    if (overrideCategoryType) {
      catType = overrideCategoryType;
    } else if (activeTab === 'investments') {
      catType = 'Investment';
    } else if (activeTab === 'loans') {
      catType = 'Loan & Lend';
    } else {
      catType = 'Expense';
    }
    setModalInitialCategoryType(catType);
    setEditingTransaction(null);
    setIsAddModalOpen(true);
  };

  const handleEditTransaction = (tx: Transaction) => {
    setModalInitialCategoryType(tx.type === 'credit' ? 'Income' : 'Expense');
    setEditingTransaction(tx);
    setIsAddModalOpen(true);
  };

  // Sync state changes to local storage
  useEffect(() => {
    localStorage.setItem('tmf_settings', JSON.stringify(settings));
  }, [settings]);

  // Theme sync to HTML element
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [settings.theme]);

  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 1100);
    return () => clearTimeout(timer);
  }, []);

  // Cloud sync only ever runs for a real, signed-in user against the shared
  // backend — there is no per-user Supabase URL/Key to "connect" anymore.
  const cloudReady = isCloudBackendConfigured() && isAuthenticated;

  useEffect(() => {
    localStorage.setItem('tmf_categories', JSON.stringify(categories));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(categories);
    if (lastPushedRef.current['categories'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['categories'] = snapshot;
      syncCategoriesToSupabase(categories).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'categories', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'categories', success: true, timestamp: Date.now() });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [categories, cloudReady, cloudHydrated]);

  useEffect(() => {
    localStorage.setItem('tmf_accounts', JSON.stringify(accounts));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(accounts);
    if (lastPushedRef.current['accounts'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['accounts'] = snapshot;
      syncAccountsToSupabase(accounts).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'accounts', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'accounts', success: true, timestamp: Date.now() });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [accounts, cloudReady, cloudHydrated]);

  useEffect(() => {
    localStorage.setItem('tmf_transactions', JSON.stringify(transactions));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(transactions);
    if (lastPushedRef.current['transactions'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['transactions'] = snapshot;
      syncTransactionsToSupabase(transactions).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'transactions', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'transactions', success: true, timestamp: Date.now() });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [transactions, cloudReady, cloudHydrated]);

  useEffect(() => {
    localStorage.setItem('tmf_investments', JSON.stringify(investments));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(investments);
    if (lastPushedRef.current['investments'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['investments'] = snapshot;
      syncInvestmentsToSupabase(investments).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'investments', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'investments', success: true, timestamp: Date.now() });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [investments, cloudReady, cloudHydrated]);

  useEffect(() => {
    localStorage.setItem('tmf_loans', JSON.stringify(loans));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(loans);
    if (lastPushedRef.current['loans'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['loans'] = snapshot;
      syncLoansToSupabase(loans).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'loans', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'loans', success: true, timestamp: Date.now() });
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [loans, cloudReady, cloudHydrated]);

  // Manually re-runs every sync call immediately and reports aggregated result
  // — lets the user verify right now whether the backend connection actually
  // works, instead of waiting for the next silent background attempt.
  const handleForceSyncNow = async (): Promise<{ success: boolean; error?: string }> => {
    const results = await Promise.all([
      syncCategoriesToSupabase(categories),
      syncAccountsToSupabase(accounts),
      syncTransactionsToSupabase(transactions),
      syncInvestmentsToSupabase(investments),
      syncLoansToSupabase(loans),
    ]);
    const failed = results.find((r) => !r.success);
    if (failed) {
      setSyncStatus({ collection: 'manual sync', success: false, error: failed.error, timestamp: Date.now() });
      return { success: false, error: failed.error };
    }
    setSyncStatus({ collection: 'manual sync', success: true, timestamp: Date.now() });
    return { success: true };
  };

  // Shared cloud data loader. Guarded by a ref so the initial-mount fetch and
  // the post-auth fetch can never run concurrently and race/overwrite each other.
  const loadCloudData = async () => {
    if (cloudLoadInFlightRef.current) return;
    cloudLoadInFlightRef.current = true;
    let fetchThrewError = false;
    try {
      const [cloudTx, cloudAcc, cloudCat, cloudInv, cloudLoans] = await Promise.all([
        fetchTransactionsFromSupabase(),
        fetchAccountsFromSupabase(),
        fetchCategoriesFromSupabase(),
        fetchInvestmentsFromSupabase(),
        fetchLoansFromSupabase(),
      ]);

      if (cloudTx === null || cloudAcc === null || cloudCat === null || cloudInv === null || cloudLoans === null) {
        throw new Error('Could not load cloud data — local changes are not being pushed');
      }

      const isCloudEmpty =
        cloudTx.length === 0 &&
        cloudAcc.length === 0 &&
        cloudInv.length === 0 &&
        cloudLoans.length === 0;

      if (isCloudEmpty) {
        setSettings((prev) => {
          const updated = { ...prev, sampleDataLoaded: false };
          localStorage.setItem('tmf_settings', JSON.stringify(updated));
          return updated;
        });
      }

      const savedSettings = localStorage.getItem('tmf_settings');
      const isSampleLoaded = isCloudEmpty
        ? false
        : (savedSettings ? JSON.parse(savedSettings).sampleDataLoaded !== false : true);

      const deletedTxIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_tx_ids') || '[]'));
      const deletedAccIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_account_ids') || '[]'));
      const deletedInvIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_investment_ids') || '[]'));
      const deletedLoanIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_loan_ids') || '[]'));

      if (cloudTx) {
        const filteredTx = (isSampleLoaded ? cloudTx : cloudTx.filter((t) => !SAMPLE_TRANSACTION_IDS.has(t.id)))
          .filter((t) => !deletedTxIds.has(t.id));
        lastPushedRef.current['transactions'] = JSON.stringify(filteredTx);
        setTransactions(filteredTx);
        localStorage.setItem('tmf_transactions', JSON.stringify(filteredTx));
      }
      if (cloudAcc) {
        const filteredAcc = (isSampleLoaded ? cloudAcc : cloudAcc.filter((a) => !SAMPLE_ACCOUNT_IDS.has(a.id)))
          .filter((a) => !deletedAccIds.has(a.id));
        lastPushedRef.current['accounts'] = JSON.stringify(filteredAcc);
        setAccounts(filteredAcc);
        localStorage.setItem('tmf_accounts', JSON.stringify(filteredAcc));
      }
      if (cloudCat && cloudCat.length > 0) {
        const ensuredCat = ensureMandatoryCategories(cloudCat);
        lastPushedRef.current['categories'] = JSON.stringify(ensuredCat);
        setCategories(ensuredCat);
        localStorage.setItem('tmf_categories', JSON.stringify(ensuredCat));
      }
      if (cloudInv) {
        const localInvMap = new Map<string, InvestmentRecord>();
        try {
          const localSaved = localStorage.getItem('tmf_investments');
          if (localSaved) {
            const parsed: InvestmentRecord[] = JSON.parse(localSaved);
            parsed.forEach((inv) => localInvMap.set(inv.id, inv));
          }
        } catch {
          // ignore error
        }

        const mergedInv = cloudInv.map((cloudRecord) => {
          const localRecord = localInvMap.get(cloudRecord.id);
          const cloudHasDetails = Boolean(
            cloudRecord.lots?.length ||
            cloudRecord.units !== undefined ||
            cloudRecord.shares !== undefined ||
            cloudRecord.symbol ||
            cloudRecord.bankName ||
            cloudRecord.dematAccount ||
            cloudRecord.purchaseNav !== undefined ||
            cloudRecord.redemptions?.length
          );
          const localHasDetails = localRecord && Boolean(
            localRecord.lots?.length ||
            localRecord.units !== undefined ||
            localRecord.shares !== undefined ||
            localRecord.symbol ||
            localRecord.bankName ||
            localRecord.dematAccount ||
            localRecord.purchaseNav !== undefined ||
            localRecord.redemptions?.length
          );
          if (!cloudHasDetails && localRecord && localHasDetails) {
            return { ...localRecord, ...cloudRecord };
          }
          return cloudRecord;
        });

        const filteredInv = (isSampleLoaded ? mergedInv : mergedInv.filter((i) => !SAMPLE_INVESTMENT_IDS.has(i.id)))
          .filter((i) => !deletedInvIds.has(i.id));
        lastPushedRef.current['investments'] = JSON.stringify(filteredInv);
        setInvestments(filteredInv);
        localStorage.setItem('tmf_investments', JSON.stringify(filteredInv));
      }
      if (cloudLoans) {
        const localLoansMap = new Map<string, LoanRecord>();
        try {
          const localSaved = localStorage.getItem('tmf_loans');
          if (localSaved) {
            const parsed: LoanRecord[] = JSON.parse(localSaved);
            parsed.forEach((l) => localLoansMap.set(l.id, l));
          }
        } catch {
          // ignore error
        }

        const mergedLoans = cloudLoans.map((cloudRecord) => {
          const localRecord = localLoansMap.get(cloudRecord.id);
          const cloudHasDetails = Boolean(
            cloudRecord.schedule?.length ||
            cloudRecord.loanStructure ||
            cloudRecord.monthlyEmi !== undefined ||
            cloudRecord.expectedEmi !== undefined ||
            cloudRecord.financedPrincipal !== undefined ||
            cloudRecord.totalPurchasePrice !== undefined
          );
          const localHasDetails = localRecord && Boolean(
            localRecord.schedule?.length ||
            localRecord.loanStructure ||
            localRecord.monthlyEmi !== undefined ||
            localRecord.expectedEmi !== undefined ||
            localRecord.financedPrincipal !== undefined ||
            localRecord.totalPurchasePrice !== undefined
          );
          if (!cloudHasDetails && localRecord && localHasDetails) {
            return { ...localRecord, ...cloudRecord };
          }
          return cloudRecord;
        });

        const filteredLoans = (isSampleLoaded ? mergedLoans : mergedLoans.filter((l) => !SAMPLE_LOAN_IDS.has(l.id)))
          .filter((l) => !deletedLoanIds.has(l.id));
        lastPushedRef.current['loans'] = JSON.stringify(filteredLoans);
        setLoans(filteredLoans);
        localStorage.setItem('tmf_loans', JSON.stringify(filteredLoans));
      }

      // Cleanup any pending deletions in cloud database if deleted while offline
      if (deletedTxIds.size > 0) {
        deleteMultipleTransactionsFromSupabase(Array.from(deletedTxIds));
      }
      if (deletedAccIds.size > 0) {
        deleteMultipleAccountsFromSupabase(Array.from(deletedAccIds));
      }
      if (deletedInvIds.size > 0) {
        deleteMultipleInvestmentsFromSupabase(Array.from(deletedInvIds));
      }
      if (deletedLoanIds.size > 0) {
        deleteMultipleLoansFromSupabase(Array.from(deletedLoanIds));
      }
    } catch (err) {
      fetchThrewError = true;
      console.warn('Cloud data fetch failed:', err);
      setSyncStatus({
        collection: 'cloud-load',
        success: false,
        error: 'Could not load cloud data — local changes are not being pushed',
        timestamp: Date.now(),
      });
    } finally {
      cloudLoadInFlightRef.current = false;
      if (!fetchThrewError) {
        setCloudHydrated(true);
      }
    }
  };

  // Initial Supabase Data Fetch on launch, once we know who's signed in
  useEffect(() => {
    if (!cloudReady) return;
    loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady]);

  // Clears all locally-cached financial data. Used on sign-out so the next
  // person to use this device/browser never sees the previous account's data
  // before their own cloud data has loaded.
  const clearLocalDataOnSignOut = () => {
    setCloudHydrated(false);
    lastPushedRef.current = {};
    setTransactions([]);
    setAccounts([]);
    setInvestments([]);
    setLoans([]);
    setCategories(INITIAL_CATEGORIES);
    setPendingNotifications([]);
    localStorage.setItem('tmf_transactions', '[]');
    localStorage.setItem('tmf_accounts', '[]');
    localStorage.setItem('tmf_investments', '[]');
    localStorage.setItem('tmf_loans', '[]');
    localStorage.setItem('tmf_pending_notifications', '[]');
    sessionStorage.removeItem('tmf_session_unlocked');
    resetDuplicateMemory();
  };

  // Bootstraps the real auth session on launch, and reacts to sign-in /
  // sign-out / password-recovery in real time. This — not a locally-editable
  // flag — is the actual gate that decides whether the mandatory login
  // screen or the app itself is shown.
  useEffect(() => {
    getCurrentUserSession().then((session) => {
      if (session?.user) {
        setAuthUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
        });
      }
      setAuthLoading(false);
    });

    const unsubscribe = subscribeToAuthChanges((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        clearLocalDataOnSignOut();
        return;
      }

      if (session?.user) {
        setAuthUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
        });
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native Android notification listener: when the OS receives a new bank/UPI
  // notification, the native plugin captures its text and forwards it here so
  // it can be parsed exactly like the SMS simulator, then queued for review.
  useEffect(() => {
    if (!settings.autoExtractSms) return;
    const stopListening = startNotificationListener(async (rawText) => {
      let locationTag: LocationTag | null = null;
      if (settings.locationTracking) {
        try {
          const locPromise = getCurrentDeviceLocation();
          const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
          const devLoc = await Promise.race([locPromise, timeoutPromise]);
          if (devLoc) {
            locationTag = {
              lat: devLoc.lat,
              lng: devLoc.lng,
              name: devLoc.formattedLocation,
            };
          }
        } catch {
          locationTag = null;
        }
      }

      const { parsed, isDuplicate } = parseNotification(rawText, locationTag, transactions, pendingNotifications);
      if (isDuplicate) return; // Silently drop duplicates

      setPendingNotifications((prev) => [parsed, ...prev]);
      if (settings.notificationsEnabled) {
        notifyTransactionDetected(parsed, settings.currencySymbol);
      }
    });
    return stopListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoExtractSms, settings.notificationsEnabled, settings.locationTracking, settings.currencySymbol, transactions, pendingNotifications]);


  // Passcode lockout cooldown ticker
  useEffect(() => {
    if (!passcodeLockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((passcodeLockedUntil - Date.now()) / 1000));
      setPasscodeLockRemaining(remaining);
      if (remaining <= 0) {
        setPasscodeLockedUntil(0);
        setPasscodeAttempts(0);
        localStorage.removeItem('tmf_passcode_lock_until');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [passcodeLockedUntil]);

  useEffect(() => {
    localStorage.setItem('tmf_pending_notifications', JSON.stringify(pendingNotifications));
  }, [pendingNotifications]);

  // Real-time Push-Style Budget Notification Monitor (80% and 100% Thresholds)
  useEffect(() => {
    if (!settings.notificationsEnabled || settings.budgetAlertsEnabled === false) return;
    const newAlerts = checkBudgetThresholds(transactions, categories, settings.currencySymbol);
    if (newAlerts && newAlerts.length > 0) {
      setActiveBudgetPushAlert(newAlerts[0]);
    }
  }, [transactions, categories, settings.currencySymbol, settings.notificationsEnabled, settings.budgetAlertsEnabled]);

  // Passcode verification with brute-force lockout protection
  const handlePasscodeUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeLockedUntil > Date.now()) return;

    if (inputPasscode === settings.passcode) {
      setIsUnlocked(true);
      sessionStorage.setItem('tmf_session_unlocked', 'true');
      localStorage.removeItem('tmf_passcode_lock_until');
      setPasscodeError(false);
      setPasscodeAttempts(0);
      setInputPasscode('');
    } else {
      const nextAttempts = passcodeAttempts + 1;
      setPasscodeAttempts(nextAttempts);
      setPasscodeError(true);
      setInputPasscode('');
      if (nextAttempts >= MAX_PASSCODE_ATTEMPTS) {
        const lockUntil = Date.now() + PASSCODE_LOCKOUT_MS;
        setPasscodeLockedUntil(lockUntil);
        localStorage.setItem('tmf_passcode_lock_until', lockUntil.toString());
      }
    }
  };

  // Helper to adjust financial account balance atomically with floating-point safety
  const adjustAccountBalance = (
    accountsList: FinancialAccount[],
    methodOrName: string | undefined,
    delta: number
  ): FinancialAccount[] => {
    if (!methodOrName || accountsList.length === 0) return accountsList;
    if (methodOrName === 'Cash' || methodOrName.toLowerCase() === 'cash') return accountsList;

    const resolvedId = resolveAccountId(accountsList, methodOrName);
    let idx = -1;

    if (resolvedId) {
      idx = accountsList.findIndex((a) => a.id === resolvedId);
    }

    // c. 'Cash' -> return list unchanged; 'UPI' / 'Other UPI' / unmatched -> use isDefault account if one exists, otherwise return list unchanged (never index 0)
    if (idx === -1) {
      idx = accountsList.findIndex((a) => a.isDefault);
      if (idx === -1) return accountsList;
    }

    const copy = [...accountsList];
    const acc = copy[idx];
    // d. sign: spend raises credit card outstanding, payment/refund lowers it
    const applied = acc.type === 'Credit Card' ? -delta : delta;
    const newBal = Math.round((acc.balance + applied) * 100) / 100;
    copy[idx] = { ...acc, balance: newBal };
    return copy;
  };

  // Helper to resolve notification category against current categories, falling back to matching type or Uncategorized
  const resolveNotificationCategory = (
    categoryName: string,
    subcategoryName: string,
    transactionType: TransactionType
  ): { category: string; subcategory: string } => {
    const targetType: 'expense' | 'income' = transactionType === 'credit' ? 'income' : 'expense';
    const matchedCat = categories.find((c) => c.name.toLowerCase() === (categoryName || '').toLowerCase());
    if (matchedCat) {
      return {
        category: matchedCat.name,
        subcategory: matchedCat.subcategories.includes(subcategoryName)
          ? subcategoryName
          : (matchedCat.subcategories[0] || 'General'),
      };
    }

    // Category was renamed or does not exist: fall back to first category of matching type or 'Uncategorized'
    const firstMatching = categories.find((c) => c.type === targetType);
    if (firstMatching) {
      return {
        category: firstMatching.name,
        subcategory: firstMatching.subcategories[0] || 'General',
      };
    }

    // Fall back to Uncategorized and create category if missing
    const hasUncat = categories.some((c) => c.name.toLowerCase() === 'uncategorized' && c.type === targetType);
    if (!hasUncat) {
      const newUncat: Category = {
        id: `cat_uncategorized_${targetType}`,
        name: 'Uncategorized',
        type: targetType,
        iconName: 'Tag',
        subcategories: ['General'],
      };
      setCategories((prev) => {
        const updated = [...prev, newUncat];
        localStorage.setItem('tmf_categories', JSON.stringify(updated));
        return updated;
      });
    }

    return {
      category: 'Uncategorized',
      subcategory: 'General',
    };
  };

  // Notification Handlers (The requested feature: ADD, EDIT, IGNORE)
  const handleConfirmAddNotification = (notif: ParsedNotification) => {
    // 3. Resolve account by notif.accountLast4 first, then appSource/paymentMethod, then default
    let resolvedAccId: string | null = null;
    if (notif.accountLast4) {
      const byLast4 = accounts.find((a) => a.accountNumberLast4 === notif.accountLast4);
      if (byLast4) resolvedAccId = byLast4.id;
    }
    if (!resolvedAccId && notif.appSource) {
      resolvedAccId = resolveAccountId(accounts, notif.appSource);
    }
    if (!resolvedAccId && notif.paymentMethod) {
      resolvedAccId = resolveAccountId(accounts, notif.paymentMethod);
    }
    if (!resolvedAccId) {
      const defaultAcc = accounts.find((a) => a.isDefault);
      if (defaultAcc) resolvedAccId = defaultAcc.id;
    }

    const finalPaymentMethod = resolvedAccId || notif.appSource || notif.paymentMethod || 'Other UPI';
    const { category: resolvedCat, subcategory: resolvedSubcat } = resolveNotificationCategory(
      notif.category,
      notif.subcategory,
      notif.type
    );

    const newTx: Transaction = {
      id: newId('tx_notif'),
      title: notif.payeeOrPayer,
      amount: notif.amount,
      type: notif.type,
      category: resolvedCat,
      subcategory: resolvedSubcat,
      date: notif.date,
      time: notif.time,
      location: notif.location,
      source: 'UPI',
      payeeOrPayer: notif.payeeOrPayer,
      paymentMethod: finalPaymentMethod,
      rawText: notif.rawText,
      refNumber: notif.refNumber,
    };

    const delta = notif.type === 'credit' ? notif.amount : -notif.amount;
    setAccounts((prevAccs) => adjustAccountBalance(prevAccs, finalPaymentMethod, delta));
    setTransactions((prev) => [newTx, ...prev]);
    setPendingNotifications((prev) => {
      const remaining = prev.filter((n) => n.id !== notif.id);
      if (remaining.length === 0) setIsNotificationModalOpen(false);
      return remaining;
    });
  };

  const handleConfirmEditNotification = (notif: ParsedNotification) => {
    // 3. Resolve account by notif.accountLast4 first, then appSource/paymentMethod, then default
    let resolvedAccId: string | null = null;
    if (notif.accountLast4) {
      const byLast4 = accounts.find((a) => a.accountNumberLast4 === notif.accountLast4);
      if (byLast4) resolvedAccId = byLast4.id;
    }
    if (!resolvedAccId && notif.appSource) {
      resolvedAccId = resolveAccountId(accounts, notif.appSource);
    }
    if (!resolvedAccId && notif.paymentMethod) {
      resolvedAccId = resolveAccountId(accounts, notif.paymentMethod);
    }
    if (!resolvedAccId) {
      const defaultAcc = accounts.find((a) => a.isDefault);
      if (defaultAcc) resolvedAccId = defaultAcc.id;
    }

    const finalPaymentMethod = resolvedAccId || notif.appSource || notif.paymentMethod || 'Other UPI';
    const { category: resolvedCat, subcategory: resolvedSubcat } = resolveNotificationCategory(
      notif.category,
      notif.subcategory,
      notif.type
    );

    // Open transaction editor with pre-filled details from notification
    setEditingTransaction({
      title: notif.payeeOrPayer,
      amount: notif.amount,
      type: notif.type,
      category: resolvedCat,
      subcategory: resolvedSubcat,
      date: notif.date,
      time: notif.time,
      location: notif.location,
      source: 'UPI',
      payeeOrPayer: notif.payeeOrPayer,
      paymentMethod: finalPaymentMethod,
      rawText: notif.rawText,
      refNumber: notif.refNumber,
    });

    // Remove from pending queue
    setPendingNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    setIsNotificationModalOpen(false);
  };

  const handleIgnoreNotification = (notifId: string) => {
    setPendingNotifications((prev) => {
      const remaining = prev.filter((n) => n.id !== notifId);
      if (remaining.length === 0) setIsNotificationModalOpen(false);
      return remaining;
    });
  };

  const handleInterceptedFromSimulator = (notif: ParsedNotification) => {
    setPendingNotifications((prev) => [notif, ...prev]);
    setIsNotificationModalOpen(true);
  };

  // Transaction Actions
  const handleSaveTransaction = (tx: Transaction) => {
    setTransactions((prev) => {
      const idx = prev.findIndex((t) => t.id === tx.id);
      if (idx >= 0) {
        const oldTx = prev[idx];
        const revertDelta = oldTx.type === 'credit' ? -oldTx.amount : oldTx.amount;
        const newDelta = tx.type === 'credit' ? tx.amount : -tx.amount;
        const oldTarget = resolveAccountId(accounts, oldTx.paymentMethod) || oldTx.paymentMethod;
        const newTarget = resolveAccountId(accounts, tx.paymentMethod) || tx.paymentMethod;
        setAccounts((prevAccs) => {
          let updated = adjustAccountBalance(prevAccs, oldTarget, revertDelta);
          updated = adjustAccountBalance(updated, newTarget, newDelta);
          return updated;
        });

        const copy = [...prev];
        copy[idx] = tx;
        return copy;
      }

      // New Transaction
      const newDelta = tx.type === 'credit' ? tx.amount : -tx.amount;
      const target = resolveAccountId(accounts, tx.paymentMethod) || tx.paymentMethod;
      setAccounts((prevAccs) => adjustAccountBalance(prevAccs, target, newDelta));
      return [tx, ...prev];
    });
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    // Record locally deleted ID so it is never reloaded from cloud or initial state
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_tx_ids') || '[]'));
    deletedIds.add(id);
    localStorage.setItem('tmf_deleted_tx_ids', JSON.stringify(Array.from(deletedIds)));

    setTransactions((prev) => {
      const tx = prev.find((t) => t.id === id);
      if (tx) {
        const revertDelta = tx.type === 'credit' ? -tx.amount : tx.amount;
        const target = resolveAccountId(accounts, tx.paymentMethod) || tx.paymentMethod;
        setAccounts((prevAccs) => adjustAccountBalance(prevAccs, target, revertDelta));
      }
      const updated = prev.filter((t) => t.id !== id);
      localStorage.setItem('tmf_transactions', JSON.stringify(updated));
      return updated;
    });

    if (isCloudBackendConfigured()) {
      deleteTransactionFromSupabase(id).then((result) => {
        if (!result.success) {
          setSyncStatus({ collection: 'delete-transaction', ...result, timestamp: Date.now() });
        }
      });
    }
  };

  // Account Actions
  const handleAddAccount = (acc: FinancialAccount) => {
    setAccounts((prev) => {
      const sanitized = acc.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
      return [acc, ...sanitized];
    });
    showToast(`Account "${acc.name}" added`, 'success');
  };

  const handleUpdateAccount = (updatedAcc: FinancialAccount) => {
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id === updatedAcc.id) return updatedAcc;
        if (updatedAcc.isDefault) return { ...a, isDefault: false };
        return a;
      })
    );
    showToast(`Account "${updatedAcc.name}" updated`, 'info');
  };

  const handleDeleteAccount = (id: string) => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_account_ids') || '[]'));
    deletedIds.add(id);
    localStorage.setItem('tmf_deleted_account_ids', JSON.stringify(Array.from(deletedIds)));

    setAccounts((prev) => {
      const accToDelete = prev.find((a) => a.id === id);
      const accName = accToDelete ? accToDelete.name : 'Account';
      showToast(`${accName} deleted`, 'warning');
      const updated = prev.filter((a) => a.id !== id);
      localStorage.setItem('tmf_accounts', JSON.stringify(updated));
      return updated;
    });

    if (isCloudBackendConfigured()) {
      deleteAccountFromSupabase(id).then((result) => {
        if (!result.success) {
          setSyncStatus({ collection: 'delete-account', ...result, timestamp: Date.now() });
        }
      });
    }
  };

  // Category Actions
  const handleAddCategory = (cat: Category) => {
    setCategories((prev) => [...prev, cat]);
  };

  const handleUpdateCategory = (cat: Category) => {
    const prevCat = categories.find((c) => c.id === cat.id);
    const oldName = prevCat?.name;
    const nameChanged = Boolean(oldName && oldName !== cat.name);

    // Identify any subcategories removed in this update
    const oldSubs = prevCat?.subcategories || [];
    const newSubsSet = new Set(cat.subcategories || []);
    const removedSubs = new Set(oldSubs.filter((s) => !newSubsSet.has(s)));

    // Cascade name changes and removed subcategories to transactions in one setTransactions call
    if (nameChanged || removedSubs.size > 0) {
      setTransactions((prevTx) => {
        let hasChanges = false;
        const updated = prevTx.map((tx) => {
          let updatedCategory = tx.category;
          let updatedSubcategory = tx.subcategory;
          let modified = false;

          // 1. Category name rename
          if (nameChanged && tx.category === oldName) {
            updatedCategory = cat.name;
            modified = true;
          }

          // 2. Removed subcategory reassignment to 'General'
          const belongsToCategory = tx.category === cat.name || (oldName && tx.category === oldName);
          if (belongsToCategory && removedSubs.has(tx.subcategory)) {
            updatedSubcategory = 'General';
            modified = true;
          }

          if (modified) {
            hasChanges = true;
            return {
              ...tx,
              category: updatedCategory,
              subcategory: updatedSubcategory,
            };
          }
          return tx;
        });

        if (hasChanges) {
          localStorage.setItem('tmf_transactions', JSON.stringify(updated));
          return updated;
        }
        return prevTx;
      });
    }

    setCategories((prev) => {
      const updated = prev.map((c) => (c.id === cat.id ? cat : c));
      localStorage.setItem('tmf_categories', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteCategory = (id: string) => {
    const catToDelete = categories.find((c) => c.id === id);
    if (!catToDelete) return;

    // Prevent deleting the Uncategorized category while it is in use
    if (catToDelete.name.toLowerCase() === 'uncategorized') {
      const inUseCount = transactions.filter((t) => t.category.toLowerCase() === 'uncategorized').length;
      if (inUseCount > 0) {
        showToast(
          `Cannot delete 'Uncategorized' while ${inUseCount} transaction${inUseCount === 1 ? '' : 's'} are using it.`,
          'error'
        );
        return;
      }
    }

    const affectedCount = transactions.filter((t) => t.category === catToDelete.name).length;
    const description = affectedCount > 0
      ? `${affectedCount} ${affectedCount === 1 ? 'transaction uses' : 'transactions use'} this category. They will be moved to 'Uncategorized'.`
      : `Are you sure you want to delete category "${catToDelete.name}"?`;

    setConfirmConfig({
      title: `Delete "${catToDelete.name}"?`,
      description,
      confirmLabel: affectedCount > 0 ? 'Move & Delete' : 'Delete',
      intent: 'danger',
      icon: 'trash',
      onConfirm: () => {
        const targetType = catToDelete.type;

        // Reassign affected transactions to Uncategorized in one batch
        if (affectedCount > 0) {
          setTransactions((prevTx) => {
            const updated = prevTx.map((tx) => {
              if (tx.category === catToDelete.name) {
                return {
                  ...tx,
                  category: 'Uncategorized',
                  subcategory: 'General',
                };
              }
              return tx;
            });
            localStorage.setItem('tmf_transactions', JSON.stringify(updated));
            return updated;
          });
        }

        // Remove category, and create Uncategorized if missing
        setCategories((prev) => {
          const filtered = prev.filter((c) => c.id !== id);
          const hasUncat = filtered.some(
            (c) => c.name.toLowerCase() === 'uncategorized' && c.type === targetType
          );

          if (affectedCount > 0 && !hasUncat) {
            const uncategorizedCategory: Category = {
              id: `cat_uncategorized_${targetType}`,
              name: 'Uncategorized',
              type: targetType,
              iconName: 'Tag',
              subcategories: ['General'],
            };
            const updated = [...filtered, uncategorizedCategory];
            localStorage.setItem('tmf_categories', JSON.stringify(updated));
            return updated;
          }

          localStorage.setItem('tmf_categories', JSON.stringify(filtered));
          return filtered;
        });

        if (isCloudBackendConfigured()) {
          deleteCategoryFromSupabase(id).then((result) => {
            if (!result.success) {
              setSyncStatus({ collection: 'delete-category', ...result, timestamp: Date.now() });
            }
          });
        }

        showToast(
          affectedCount > 0
            ? `Deleted "${catToDelete.name}". ${affectedCount} transaction${affectedCount === 1 ? '' : 's'} moved to Uncategorized.`
            : `Deleted category "${catToDelete.name}".`,
          'warning'
        );
      },
    });
  };

  // Shared helper to record ledger transaction and adjust account balance synchronously
  const postLedgerEntry = ({
    title,
    amount,
    type,
    category,
    subcategory,
    accountId,
    date,
    note,
    source = 'Manual',
  }: {
    title: string;
    amount: number;
    type: TransactionType;
    category: string;
    subcategory: string;
    accountId?: string;
    date?: string;
    note?: string;
    source?: PaymentSource;
  }) => {
    const finalAccountId = accountId || '';
    const newTx: Transaction = {
      id: newId('tx'),
      title,
      amount,
      type,
      category,
      subcategory,
      date: date || todayLocalISO(),
      time: nowLocalTimeHHMM(),
      source,
      paymentMethod: finalAccountId,
      note,
    };

    setTransactions((prev) => {
      const updated = [newTx, ...prev];
      localStorage.setItem('tmf_transactions', JSON.stringify(updated));
      return updated;
    });

    if (finalAccountId) {
      const delta = type === 'credit' ? amount : -amount;
      setAccounts((prevAccs) => {
        const updated = adjustAccountBalance(prevAccs, finalAccountId, delta);
        localStorage.setItem('tmf_accounts', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Investment Actions
  const handleAddInvestment = (
    inv: InvestmentRecord,
    accountId?: string,
    recordInLedger: boolean = true
  ) => {
    setInvestments((prev) => [...prev, inv]);

    const targetAccId = accountId || inv.linkedAccountId;
    if (recordInLedger && targetAccId && inv.amountInvested > 0) {
      const subcat = inv.investmentPlan === 'sip' ? 'SIP' : 'Purchase';
      postLedgerEntry({
        title: `Investment: ${inv.name}`,
        amount: inv.amountInvested,
        type: 'debit',
        category: 'Investment',
        subcategory: subcat,
        accountId: targetAccId,
        date: inv.date || todayLocalISO(),
        note: inv.notes || `Invested in ${inv.name} (${inv.type})`,
        source: 'Manual',
      });
    }
  };

  const handleUpdateInvestment = (updatedInv: InvestmentRecord) => {
    setInvestments((prev) => prev.map((inv) => (inv.id === updatedInv.id ? updatedInv : inv)));
  };

  const handleDeleteInvestment = (id: string) => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_investment_ids') || '[]'));
    deletedIds.add(id);
    localStorage.setItem('tmf_deleted_investment_ids', JSON.stringify(Array.from(deletedIds)));

    setInvestments((prev) => {
      const updated = prev.filter((inv) => inv.id !== id);
      localStorage.setItem('tmf_investments', JSON.stringify(updated));
      return updated;
    });

    if (isCloudBackendConfigured()) {
      deleteInvestmentFromSupabase(id).then((result) => {
        if (!result.success) {
          setSyncStatus({ collection: 'delete-investment', ...result, timestamp: Date.now() });
        }
      });
    }
  };

  // Loan Actions
  const handleAddLoan = (
    loan: LoanRecord,
    accountId?: string,
    recordInLedger: boolean = true
  ) => {
    setLoans((prev) => [...prev, loan]);

    const targetAccId = accountId || loan.linkedAccountId;
    if (recordInLedger && targetAccId) {
      if (loan.type === 'loan') {
        const creditAmt = loan.financedPrincipal || loan.totalAmount;
        if (creditAmt > 0) {
          postLedgerEntry({
            title: `Loan Received: ${loan.title || loan.personOrBank}`,
            amount: creditAmt,
            type: 'credit',
            category: 'Loans & Lends',
            subcategory: 'Loan Received',
            accountId: targetAccId,
            date: loan.startDate || todayLocalISO(),
            note: loan.notes || `Disbursed loan from ${loan.personOrBank}`,
            source: 'Manual',
          });
        }
      } else {
        const debitAmt = loan.totalAmount;
        if (debitAmt > 0) {
          postLedgerEntry({
            title: `Lent to ${loan.personOrBank}`,
            amount: debitAmt,
            type: 'debit',
            category: 'Loans & Lends',
            subcategory: 'Lent Out',
            accountId: targetAccId,
            date: loan.startDate || todayLocalISO(),
            note: loan.notes || `Lent to ${loan.personOrBank}`,
            source: 'Manual',
          });
        }
      }
    }
  };

  const handleRecordRepayment = (
    loanId: string,
    repayment: Repayment,
    accountId?: string,
    recordInLedger: boolean = true
  ) => {
    let targetLoan: LoanRecord | null = null;
    setLoans((prev) =>
      prev.map((l) => {
        if (l.id !== loanId) return l;

        const newRemaining = Math.max(0, l.remainingAmount - repayment.amount);
        const newRepayments = [repayment, ...l.repayments];
        const newStatus = newRemaining === 0 ? 'repaid' : 'active';

        const updated: LoanRecord = {
          ...l,
          remainingAmount: newRemaining,
          status: newStatus,
          repayments: newRepayments,
        };
        targetLoan = updated;
        return updated;
      })
    );

    const loan = targetLoan || loans.find((l) => l.id === loanId);
    if (!loan) return;

    const targetAccId = accountId || loan.linkedAccountId;
    if (recordInLedger && targetAccId && repayment.amount > 0) {
      if (loan.type === 'loan') {
        postLedgerEntry({
          title: `Loan Repayment: ${loan.title || loan.personOrBank}`,
          amount: repayment.amount,
          type: 'debit',
          category: 'Loans & Lends',
          subcategory: 'EMI Repayment',
          accountId: targetAccId,
          date: repayment.date || todayLocalISO(),
          note: repayment.note || `Repayment for ${loan.personOrBank}`,
          source: 'Manual',
        });
      } else {
        postLedgerEntry({
          title: `Repayment Received: ${loan.personOrBank}`,
          amount: repayment.amount,
          type: 'credit',
          category: 'Loans & Lends',
          subcategory: 'Repayment Received',
          accountId: targetAccId,
          date: repayment.date || todayLocalISO(),
          note: repayment.note || `Repayment received from ${loan.personOrBank}`,
          source: 'Manual',
        });
      }
    }
  };

  const handleSettleLoan = (
    loanId: string,
    accountId?: string,
    recordInLedger: boolean = true
  ) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const remaining = loan.remainingAmount;
    const targetAccId = accountId || loan.linkedAccountId;

    if (recordInLedger && targetAccId && remaining > 0) {
      if (loan.type === 'loan') {
        postLedgerEntry({
          title: `Settled Loan: ${loan.title || loan.personOrBank}`,
          amount: remaining,
          type: 'debit',
          category: 'Loans & Lends',
          subcategory: 'EMI Repayment',
          accountId: targetAccId,
          date: todayLocalISO(),
          note: `Full settlement of ${loan.title || loan.personOrBank}`,
          source: 'Manual',
        });
      } else {
        postLedgerEntry({
          title: `Settled Lend: ${loan.personOrBank}`,
          amount: remaining,
          type: 'credit',
          category: 'Loans & Lends',
          subcategory: 'Repayment Received',
          accountId: targetAccId,
          date: todayLocalISO(),
          note: `Full settlement received from ${loan.personOrBank}`,
          source: 'Manual',
        });
      }
    }

    const settleRepayment: Repayment = {
      id: newId('rep'),
      amount: remaining,
      date: todayLocalISO(),
      note: 'Full settlement',
    };

    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? {
              ...l,
              remainingAmount: 0,
              status: 'repaid',
              repayments: remaining > 0 ? [settleRepayment, ...(l.repayments || [])] : l.repayments,
            }
          : l
      )
    );
  };

  const handleDeleteLoan = (loanId: string) => {
    const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('tmf_deleted_loan_ids') || '[]'));
    deletedIds.add(loanId);
    localStorage.setItem('tmf_deleted_loan_ids', JSON.stringify(Array.from(deletedIds)));

    setLoans((prev) => {
      const updated = prev.filter((l) => l.id !== loanId);
      localStorage.setItem('tmf_loans', JSON.stringify(updated));
      return updated;
    });

    if (isCloudBackendConfigured()) {
      deleteLoanFromSupabase(loanId).then((result) => {
        if (!result.success) {
          setSyncStatus({ collection: 'delete-loan', ...result, timestamp: Date.now() });
        }
      });
    }
  };

  const handleUpdateLoan = (updatedLoan: LoanRecord) => {
    setLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
  };

  // Automated & Scheduled EMI Installment Payment Confirmation
  const handleConfirmInstallmentPayment = (
    loanId: string,
    installmentNumber: number,
    paymentAccountId: string,
    amount: number,
    paidDate: string,
    notes?: string
  ) => {
    let updatedTargetLoan: LoanRecord | null = null;
    let isAlreadyPaid = false;

    setLoans((prev) => {
      const currentLoan = prev.find((l) => l.id === loanId);
      if (!currentLoan) return prev;

      const inst = currentLoan.schedule?.find((s) => s.installmentNumber === installmentNumber);
      if (inst && inst.status === 'paid') {
        isAlreadyPaid = true;
        return prev;
      }

      return prev.map((l) => {
        if (l.id !== loanId) return l;
        const newSchedule = (l.schedule || []).map((s) => {
          if (s.installmentNumber === installmentNumber) {
            return {
              ...s,
              status: 'paid' as const,
              paidDate,
              paymentAccountId,
              notes: notes || s.notes,
            };
          }
          return s;
        });

        const newRepayment: Repayment = {
          id: newId('rep'),
          amount,
          date: paidDate,
          note: notes || `EMI Installment #${installmentNumber}`,
        };
        const newRepayments = [newRepayment, ...(l.repayments || [])];
        const newRemaining = Math.max(0, l.remainingAmount - amount);
        const isFullyPaid = newRemaining === 0 || newSchedule.every((s) => s.status === 'paid');

        const updated: LoanRecord = {
          ...l,
          remainingAmount: newRemaining,
          schedule: newSchedule,
          repayments: newRepayments,
          status: isFullyPaid ? ('repaid' as const) : ('active' as const),
        };
        updatedTargetLoan = updated;
        return updated;
      });
    });

    if (isAlreadyPaid) {
      showToast('This installment is already recorded as paid.', 'info');
      return;
    }

    if (!updatedTargetLoan) return;
    const targetLoan: LoanRecord = updatedTargetLoan;

    // Use unified postLedgerEntry to adjust account and post transaction
    postLedgerEntry({
      title: `EMI Payment: ${targetLoan.title || targetLoan.personOrBank} (#${installmentNumber})`,
      amount,
      type: 'debit',
      category: 'Loans & Lends',
      subcategory: 'EMI Repayment',
      accountId: paymentAccountId,
      date: paidDate,
      note: notes || `Scheduled installment #${installmentNumber} of ${targetLoan.personOrBank}`,
      source: 'Manual',
    });

    showToast(`EMI payment of ${settings.currencySymbol}${amount.toLocaleString('en-IN')} confirmed and recorded!`, 'success');
  };

  const handleSkipInstallment = (loanId: string, installmentNumber: number) => {
    setLoans((prev) =>
      prev.map((l) => {
        if (l.id !== loanId) return l;
        const newSchedule = (l.schedule || []).map((s) => {
          if (s.installmentNumber === installmentNumber) {
            return {
              ...s,
              status: 'skipped' as const,
              skippedAt: new Date().toISOString(),
            };
          }
          return s;
        });
        return { ...l, schedule: newSchedule };
      })
    );
    showToast(`Installment #${installmentNumber} marked as skipped.`, 'info');
  };

  // Investment Redemption Handler (Full & Partial Liquidation)
  const handleConfirmRedemption = (
    investmentId: string,
    redemption: InvestmentRedemption,
    updatedInvestment: InvestmentRecord
  ) => {
    // 1. Update investment holding state
    setInvestments((prev) =>
      prev.map((inv) => (inv.id === investmentId ? updatedInvestment : inv))
    );

    // 2. Use unified postLedgerEntry to credit account and post transaction
    if (redemption.creditedAccountId) {
      postLedgerEntry({
        title: `Redemption: ${updatedInvestment.name} (${redemption.isFullRedemption ? 'Full' : `${redemption.unitsOrSharesRedeemed} units`})`,
        amount: redemption.netCredited,
        type: 'credit',
        category: 'Investment',
        subcategory: 'Redemption',
        accountId: redemption.creditedAccountId,
        date: redemption.date,
        note: `Gross proceeds: ${settings.currencySymbol}${redemption.grossProceeds.toLocaleString('en-IN')}, Fees: ${settings.currencySymbol}${(redemption.charges || 0).toLocaleString('en-IN')}, Tax: ${settings.currencySymbol}${(redemption.taxes || 0).toLocaleString('en-IN')}, Realized P&L: ${redemption.realizedGainLoss >= 0 ? '+' : ''}${settings.currencySymbol}${redemption.realizedGainLoss.toLocaleString('en-IN')}`,
        source: 'Manual',
      });
    }

    showToast(
      `Redeemed successfully! ${settings.currencySymbol}${redemption.netCredited.toLocaleString('en-IN')} credited to account.`,
      'success'
    );
  };

  // Auth & Data Handlers. The real session/user comes from the
  // onAuthStateChange listener above — this just updates the display name/
  // email and triggers an immediate cloud fetch so the user doesn't have to
  // wait for the next render cycle.
  const handleAuthSuccess = async (user: { name: string; emailOrPhone: string }) => {
    const updatedSettings = {
      ...settings,
      userName: user.name,
      userEmail: user.emailOrPhone,
    };
    setSettings(updatedSettings);
    setIsPasswordRecovery(false);

    if (isCloudBackendConfigured()) {
      await loadCloudData();
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    // clearLocalDataOnSignOut() + setAuthUser(null) happen automatically via
    // the SIGNED_OUT event from subscribeToAuthChanges above.
  };

  // Demo Sample Data & Reset Handlers with in-app Confirmation Dialogs
  const handleRequestLoadSampleData = () => {
    setConfirmConfig({
      title: 'Load Sample Demo Data?',
      description: 'This will populate your app with sample bank accounts, credit cards, transactions, mutual fund investments, and loans for previewing analytics.',
      confirmLabel: 'Load Demo Data',
      cancelLabel: 'Cancel',
      intent: 'primary',
      icon: 'refresh',
      onConfirm: () => {
        // Clear deleted IDs trackers so sample records are allowed to load
        localStorage.removeItem('tmf_deleted_tx_ids');
        localStorage.removeItem('tmf_deleted_account_ids');
        localStorage.removeItem('tmf_deleted_investment_ids');
        localStorage.removeItem('tmf_deleted_loan_ids');

        setAccounts(INITIAL_ACCOUNTS);
        setTransactions(INITIAL_TRANSACTIONS);
        setInvestments(INITIAL_INVESTMENTS);
        setLoans(INITIAL_LOANS);
        setCategories(INITIAL_CATEGORIES);

        const newSettings = { ...settings, sampleDataLoaded: true };
        setSettings(newSettings);

        localStorage.setItem('tmf_settings', JSON.stringify(newSettings));
        localStorage.setItem('tmf_accounts', JSON.stringify(INITIAL_ACCOUNTS));
        localStorage.setItem('tmf_transactions', JSON.stringify(INITIAL_TRANSACTIONS));
        localStorage.setItem('tmf_investments', JSON.stringify(INITIAL_INVESTMENTS));
        localStorage.setItem('tmf_loans', JSON.stringify(INITIAL_LOANS));

        if (isCloudBackendConfigured()) {
          syncAccountsToSupabase(INITIAL_ACCOUNTS);
          syncTransactionsToSupabase(INITIAL_TRANSACTIONS);
          syncInvestmentsToSupabase(INITIAL_INVESTMENTS);
          syncLoansToSupabase(INITIAL_LOANS);
        }

        showToast('Sample demo data loaded & saved', 'success');
      },
    });
  };

  const handleRequestRemoveSampleData = () => {
    setConfirmConfig({
      title: 'Remove Sample Data?',
      description: 'This will remove all preset demo transactions, bank accounts, investments, and loans from your app and cloud storage. Any custom entries you added will remain untouched.',
      confirmLabel: 'Remove Demo Data',
      cancelLabel: 'Cancel',
      intent: 'warning',
      icon: 'trash',
      onConfirm: async () => {
        const nextTx = transactions.filter((t) => !SAMPLE_TRANSACTION_IDS.has(t.id));
        const nextAcc = accounts.filter((a) => !SAMPLE_ACCOUNT_IDS.has(a.id));
        const nextInv = investments.filter((i) => !SAMPLE_INVESTMENT_IDS.has(i.id));
        const nextLoans = loans.filter((l) => !SAMPLE_LOAN_IDS.has(l.id));

        setTransactions(nextTx);
        setAccounts(nextAcc);
        setInvestments(nextInv);
        setLoans(nextLoans);

        const newSettings = { ...settings, sampleDataLoaded: false };
        setSettings(newSettings);

        localStorage.setItem('tmf_settings', JSON.stringify(newSettings));
        localStorage.setItem('tmf_transactions', JSON.stringify(nextTx));
        localStorage.setItem('tmf_accounts', JSON.stringify(nextAcc));
        localStorage.setItem('tmf_investments', JSON.stringify(nextInv));
        localStorage.setItem('tmf_loans', JSON.stringify(nextLoans));

        if (isCloudBackendConfigured()) {
          deleteMultipleTransactionsFromSupabase(Array.from(SAMPLE_TRANSACTION_IDS));
          deleteMultipleAccountsFromSupabase(Array.from(SAMPLE_ACCOUNT_IDS));
          deleteMultipleInvestmentsFromSupabase(Array.from(SAMPLE_INVESTMENT_IDS));
          deleteMultipleLoansFromSupabase(Array.from(SAMPLE_LOAN_IDS));
        }

        showToast('Sample demo data removed', 'warning');
      },
    });
  };

  // Data Reset & Export Backup
  const handleExportBackupJSON = () => {
    const backupData = {
      settings,
      categories,
      transactions,
      investments,
      loans,
      exportDate: new Date().toISOString(),
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `MTracker_Backup_${todayLocalISO()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Financial backup downloaded (JSON)', 'info');
  };

  const handleRequestResetAllData = () => {
    setConfirmConfig({
      title: 'Reset All Financial Records?',
      description: 'Are you sure you want to delete all financial records? All transactions, accounts, investments, loans, and notifications will be permanently erased.',
      confirmLabel: 'Clear Everything',
      cancelLabel: 'Keep Data',
      intent: 'danger',
      icon: 'warning',
      onConfirm: async () => {
        const newSettings = { ...settings, sampleDataLoaded: false };
        setSettings(newSettings);

        localStorage.setItem('tmf_settings', JSON.stringify(newSettings));
        localStorage.setItem('tmf_transactions', '[]');
        localStorage.setItem('tmf_accounts', '[]');
        localStorage.setItem('tmf_investments', '[]');
        localStorage.setItem('tmf_loans', '[]');
        localStorage.setItem('tmf_pending_notifications', '[]');

        setTransactions([]);
        setAccounts([]);
        setInvestments([]);
        setLoans([]);
        setPendingNotifications([]);
        resetDuplicateMemory();

        if (isCloudBackendConfigured()) {
          await deleteAllUserDataFromSupabase();
        }

        showToast('All local financial records cleared', 'error');
      },
    });
  };

  // 0. App Launch Motion Loader
  if (isAppLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-obsidian text-white font-mono p-6 relative overflow-hidden select-none">
        {/* Ambient Glowing Red Backdrop */}
        <div className="absolute w-96 h-96 bg-red-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center space-y-6 relative z-10 text-center max-w-xs"
        >
          {/* Animated Logo Ring */}
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="w-20 h-20 rounded-full border-2 border-dashed border-red-600/60"
            />
            <div className="absolute w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(220,38,38,0.6)]">
              <span className="font-mono font-black text-white text-base tracking-wider">MTracker</span>
            </div>
          </div>

          <div>
            <h1 className="text-sm font-bold tracking-[0.25em] text-white uppercase font-mono">
              MTracker
            </h1>
            <p className="text-[10px] text-[#777] font-mono mt-1 uppercase tracking-widest">
              Initializing Engine
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#1c1c1c] h-1.5 rounded-full overflow-hidden border border-[#333]">
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
              className="h-full bg-gradient-to-r from-red-600 via-red-500 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.8)]"
            />
          </div>

          <div className="text-[9px] text-[#555] font-mono uppercase tracking-widest">
            Automatic Interceptions Active
          </div>
        </motion.div>
      </div>
    );
  }

  // 0.5. Mandatory Sign-In Gate — this is now a real multi-tenant, cloud-backed
  // app: every account's data lives in the same Supabase project, kept
  // private per-user by Row Level Security. There is no "close and continue
  // as guest" — an account is required, and the login screen cannot be
  // dismissed without actually signing in/registering (or verifying a
  // password-recovery link).
  if (!authLoading && (!authUser || isPasswordRecovery) && isCloudBackendConfigured()) {
    return (
      <AuthModal
        initialMode={isPasswordRecovery ? 'set_new_password' : 'login'}
        canClose={false}
        onClose={() => {}}
        onSuccess={handleAuthSuccess}
        settings={settings}
      />
    );
  }

  // Security Passcode Lock Screen
  if (settings.passcodeEnabled && !isUnlocked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="bg-carbon border border-nothing p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl"
        >
          <div className="w-12 h-12 bg-obsidian border border-nothing rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-mono font-bold uppercase mb-1">MTracker Passcode Lock</h2>
          <p className="text-xs text-[#777] font-mono mb-6">Enter your security PIN to access MTracker</p>

          <form onSubmit={handlePasscodeUnlock} className="space-y-4">
            <input
              type="password"
              maxLength={6}
              autoFocus
              disabled={passcodeLockedUntil > Date.now()}
              value={inputPasscode}
              onChange={(e) => setInputPasscode(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-[0.5em] text-2xl py-3 bg-obsidian border border-nothing rounded-2xl font-mono text-white focus:outline-none focus:border-red-600 disabled:opacity-40"
            />

            {passcodeLockedUntil > Date.now() ? (
              <div className="text-xs font-mono text-red-500">
                Too many incorrect attempts. Try again in {passcodeLockRemaining}s.
              </div>
            ) : (
              passcodeError && (
                <div className="text-xs font-mono text-red-500">
                  Incorrect passcode ({MAX_PASSCODE_ATTEMPTS - passcodeAttempts} attempt(s) left).
                </div>
              )
            )}

            <button
              type="submit"
              disabled={passcodeLockedUntil > Date.now()}
              className="w-full py-3 bg-white text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Unlock Application
            </button>
          </form>
        </motion.div>
      </div>
    );
  }


  return (
    <div className="flex h-screen bg-obsidian text-[#f0f0f0] font-sans overflow-hidden">
      {/* Nothing Desktop Navigation Sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingNotificationsCount={pendingNotifications.length}
          pendingEmiCount={pendingEmiRequests.length}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          supabaseConnected={isAuthenticated && (!syncStatus || syncStatus.success)}
          currencySymbol={settings.currencySymbol}
        />
      </div>

      {/* Main Content View Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-obsidian">
        {/* Header */}
        <Header
          title={
            activeTab === 'dashboard'
              ? 'Dashboard'
              : activeTab === 'transactions'
              ? 'Transactions'
              : activeTab === 'accounts'
              ? 'Accounts'
              : activeTab === 'investments'
              ? 'Investments'
              : activeTab === 'loans'
              ? 'Loans & Lends'
              : activeTab === 'customisations'
              ? 'Customisations'
              : 'Settings'
          }
          subtitle={
            activeTab === 'dashboard'
              ? 'Overview & Flow'
              : activeTab === 'transactions'
              ? 'Logs & Interceptions'
              : activeTab === 'accounts'
              ? 'Bank Balances & Cards'
              : activeTab === 'investments'
              ? 'Portfolio Growth'
              : activeTab === 'loans'
              ? 'Repayments & Liability'
              : activeTab === 'customisations'
              ? 'Categories & Budgets'
              : 'Account Controls'
          }
          userName={settings.userName || 'User'}
          userPhoto={settings.userPhoto || ''}
          pendingNotificationsCount={pendingNotifications.length}
          pendingEmiCount={pendingEmiRequests.length}
          onOpenNotifications={() => setIsNotificationModalOpen(true)}
          onOpenEmiConfirmations={() => setIsEmiModalOpen(true)}
          onOpenAddTransaction={() => handleOpenAddModal()}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          currencySymbol={settings.currencySymbol}
          theme={settings.theme || 'dark'}
          onToggleTheme={handleToggleTheme}
        />

        {/* Backend Sync Error Banner — surfaces real Supabase errors instead of
            failing silently, wherever the user currently is in the app. */}
        {syncStatus && !syncStatus.success && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-3 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-400 text-xs font-mono flex items-start justify-between gap-3">
            <span>
              Backend sync failed ({syncStatus.collection}): {syncStatus.error || 'Unknown error'}
            </span>
            <button
              type="button"
              onClick={() => setSyncStatus(null)}
              className="shrink-0 text-red-300 hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable View Content */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
          {activeTab === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              categories={categories}
              investments={investments}
              loans={loans}
              accounts={accounts}
              pendingNotifications={pendingNotifications}
              onOpenNotifications={() => setIsNotificationModalOpen(true)}
              onOpenAddTransaction={() => handleOpenAddModal()}
              onQuickLogTransaction={(tx) => {
                handleSaveTransaction(tx);
                showToast(`Logged recurring payment for ${tx.title}`, 'success');
              }}
              onNavigateToTransactions={() => setActiveTab('transactions')}
              onNavigateToInvestments={() => setActiveTab('investments')}
              onNavigateToLoans={() => setActiveTab('loans')}
              onNavigateToCustomisations={() => setActiveTab('customisations')}
              onTriggerBudgetAlert={(alert) => setActiveBudgetPushAlert(alert)}
              currencySymbol={settings.currencySymbol}
              defaultNetWorthMasked={settings.defaultNetWorthMasked}
              autoCollapseExpandOnScroll={settings.autoCollapseExpandOnScroll !== false}
              isCloudSynced={isAuthenticated && (!syncStatus || syncStatus.success)}
              onOpenCloudSyncStatus={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsView
              transactions={transactions}
              categories={categories}
              onAddTransaction={() => handleOpenAddModal('Expense')}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              currencySymbol={settings.currencySymbol}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsView
              accounts={accounts}
              transactions={transactions}
              currencySymbol={settings.currencySymbol}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
            />
          )}

          {activeTab === 'investments' && (
            <InvestmentsView
              investments={investments}
              transactions={transactions}
              accounts={accounts}
              onAddInvestment={handleAddInvestment}
              onUpdateInvestment={handleUpdateInvestment}
              onDeleteInvestment={handleDeleteInvestment}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onConfirmRedemption={handleConfirmRedemption}
              currencySymbol={settings.currencySymbol}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'loans' && (
            <LoansView
              loans={loans}
              accounts={accounts}
              onAddLoan={handleAddLoan}
              onRecordRepayment={handleRecordRepayment}
              onSettleLoan={handleSettleLoan}
              onDeleteLoan={handleDeleteLoan}
              onUpdateLoan={handleUpdateLoan}
              onConfirmInstallmentPayment={handleConfirmInstallmentPayment}
              onSkipInstallment={handleSkipInstallment}
              currencySymbol={settings.currencySymbol}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'customisations' && (
            <CustomisationsView
              categories={categories}
              accounts={accounts}
              transactions={transactions}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              currencySymbol={settings.currencySymbol}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              categories={categories}
              accounts={accounts}
              transactions={transactions}
              investments={investments}
              onUpdateSettings={setSettings}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onExportBackupJSON={handleExportBackupJSON}
              onResetAllData={handleRequestResetAllData}
              onLoadSampleData={handleRequestLoadSampleData}
              onRemoveSampleData={handleRequestRemoveSampleData}
              syncStatus={syncStatus}
              onForceSyncNow={handleForceSyncNow}
              isAuthenticated={isAuthenticated}
              authUserEmail={authUser?.email || null}
            />
          )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Global Floating Action Button for Home, Txns, Invest, Loans */}
        <FloatingActionButton
          onClick={() => handleOpenAddModal()}
          scrollContainerRef={mainScrollRef}
          visible={['dashboard', 'transactions', 'investments', 'loans'].includes(activeTab)}
        />

        {/* Mobile Bottom Navigation Bar - Fixed/Sticky with Safe Area Inset Support */}
        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingNotificationsCount={pendingNotifications.length}
          pendingEmiCount={pendingEmiRequests.length}
        />
      </div>

      {/* Top Bar Auto-Vanishing Pop-up Notification */}
      <AnimatePresence>
        {topBarToast && (
          <TopBarToast
            toast={topBarToast}
            onDismiss={() => setTopBarToast(null)}
          />
        )}
      </AnimatePresence>

      {/* Real-time Push-Style Budget Notification Banner (80% / 100% Thresholds) */}
      <AnimatePresence>
        {activeBudgetPushAlert && (
          <BudgetPushNotificationBanner
            alert={activeBudgetPushAlert}
            currencySymbol={settings.currencySymbol}
            onDismiss={() => setActiveBudgetPushAlert(null)}
            onNavigateToCustomisations={() => {
              setActiveBudgetPushAlert(null);
              setActiveTab('customisations');
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirmation Modal Dialog for Destructive / Data Actions */}
      <AnimatePresence>
        {confirmConfig && (
          <ConfirmationModal
            config={confirmConfig}
            onClose={() => setConfirmConfig(null)}
          />
        )}
      </AnimatePresence>

      {/* Global Modals */}

      {/* 1. User Profile Modal */}
      {isProfileModalOpen && (
        <UserProfileModal
          settings={settings}
          accounts={accounts}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdateSettings={setSettings}
          onExportData={handleExportBackupJSON}
          onSignOut={handleSignOut}
        />
      )}

      {/* 2. UPI/SMS Intercept Notification Prompt Modal (The core requested feature!) */}
      {isNotificationModalOpen && (
        <NotificationPromptModal
          notifications={pendingNotifications}
          onConfirmAdd={handleConfirmAddNotification}
          onConfirmEdit={handleConfirmEditNotification}
          onIgnore={handleIgnoreNotification}
          onClose={() => setIsNotificationModalOpen(false)}
          currencySymbol={settings.currencySymbol}
        />
      )}

      {/* 2.5 EMI Repayment Installment Confirmation Prompt Modal */}
      {isEmiModalOpen && pendingEmiRequests.length > 0 && (
        <EmiConfirmationPromptModal
          requests={pendingEmiRequests}
          accounts={accounts}
          currencySymbol={settings.currencySymbol}
          onConfirm={(reqId, accountId, notes) => {
            const req = pendingEmiRequests.find((r) => r.id === reqId);
            if (req) {
              handleConfirmInstallmentPayment(
                req.loanId,
                req.installmentNumber,
                accountId,
                req.amount,
                todayLocalISO(),
                notes
              );
            }
            if (pendingEmiRequests.length <= 1) {
              setIsEmiModalOpen(false);
            }
          }}
          onSkip={(reqId) => {
            const req = pendingEmiRequests.find((r) => r.id === reqId);
            if (req) {
              handleSkipInstallment(req.loanId, req.installmentNumber);
            }
            if (pendingEmiRequests.length <= 1) {
              setIsEmiModalOpen(false);
            }
          }}
          onRemindLater={() => {
            setIsEmiModalOpen(false);
            showToast('EMI payment confirmation deferred.', 'info');
          }}
          onClose={() => setIsEmiModalOpen(false)}
        />
      )}

      {/* 3. Simulator Widget for testing notifications */}
      {isSimulatorOpen && (
        <SmsSimulatorWidget
          transactions={transactions}
          pendingNotifications={pendingNotifications}
          onInterceptNotification={handleInterceptedFromSimulator}
          onClose={() => setIsSimulatorOpen(false)}
          currencySymbol={settings.currencySymbol}
          locationTracking={Boolean(settings.locationTracking)}
        />
      )}

      {/* 4. Add / Edit Record Modal */}
      {(isAddModalOpen || Boolean(editingTransaction)) && (
        <EditTransactionModal
          transaction={editingTransaction}
          categories={categories}
          accounts={accounts}
          loans={loans}
          initialCategoryType={modalInitialCategoryType}
          onSave={handleSaveTransaction}
          onAddInvestment={handleAddInvestment}
          onAddLoan={handleAddLoan}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingTransaction(null);
          }}
          currencySymbol={settings.currencySymbol}
          locationTracking={Boolean(settings.locationTracking)}
        />
      )}
    </div>
  );
}
