/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useRef, useMemo } from 'react';
import {
  safeGetItem,
  safeGetJson,
  safeGetStringArray,
  safeSetItem,
  removeDeletedIds,
  consumePendingStorageReadFailure,
  STORAGE_READ_FAILED_EVENT,
  STORAGE_WRITE_FAILED_EVENT,
} from './utils/storage';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import type { CategoryType, TransferRequest } from './components/EditTransactionModal';
import { FloatingActionButton } from './components/FloatingActionButton';
import { BottomNav } from './components/BottomNav';
import { TopBarToast, ToastMessage } from './components/TopBarToast';
import type { ConfirmDialogConfig } from './components/ConfirmationModal';
import { BudgetAlertPayload, checkBudgetThresholds } from './services/budgetAlertService';

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
  SavingsGoal,
  TransactionKind,
} from './types/finance';

import {
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
  fetchCloudTombstones,
  SyncResult,
} from './services/supabaseClient';

import { startNotificationListener } from './services/notificationListener';
import { resetDuplicateMemory } from './services/notification/DuplicateDetector';
import { newId } from './utils/ids';
import { todayLocalISO, nowLocalTimeHHMM } from './utils/dates';
import { resolveAccountId } from './utils/accountResolver';
import { inferTransactionKind, normalizeTransactions } from './utils/transactionKind';
import { MoneyLocaleContext } from './hooks/useMoneyFormatter';
import { BackupRestoreData } from './utils/backup';
import { isSavingsGoalArray } from './utils/savingsGoals';
import { formatMoney, getCurrencyLocale } from './utils/money';
import { createPasscodeCredentials, isLegacyPasscodeHash, PasscodeCredentials, verifyPasscode } from './utils/passcode';
import { isBiometricAvailable, isBiometricEnrolled, verifyBiometric } from './services/biometric';
import { deleteAllReceiptAttachments, deleteReceiptAttachmentsForTransaction } from './utils/receiptStorage';
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
  Bell,
  Fingerprint
} from 'lucide-react';

const DashboardView = lazy(() => import('./components/DashboardView').then((module) => ({ default: module.DashboardView })));
const TransactionsView = lazy(() => import('./components/TransactionsView').then((module) => ({ default: module.TransactionsView })));
const InvestmentsView = lazy(() => import('./components/InvestmentsView').then((module) => ({ default: module.InvestmentsView })));
const LoansView = lazy(() => import('./components/LoansView').then((module) => ({ default: module.LoansView })));
const AccountsView = lazy(() => import('./components/AccountsView').then((module) => ({ default: module.AccountsView })));
const CustomisationsView = lazy(() => import('./components/CustomisationsView').then((module) => ({ default: module.CustomisationsView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((module) => ({ default: module.SettingsView })));
const UserProfileModal = lazy(() => import('./components/UserProfileModal').then((module) => ({ default: module.UserProfileModal })));
const NotificationPromptModal = lazy(() => import('./components/NotificationPromptModal').then((module) => ({ default: module.NotificationPromptModal })));
const SmsSimulatorWidget = lazy(() => import('./components/SmsSimulatorWidget').then((module) => ({ default: module.SmsSimulatorWidget })));
const EditTransactionModal = lazy(() => import('./components/EditTransactionModal').then((module) => ({ default: module.EditTransactionModal })));
const AuthModal = lazy(() => import('./components/AuthModal').then((module) => ({ default: module.AuthModal })));
const ConfirmationModal = lazy(() => import('./components/ConfirmationModal').then((module) => ({ default: module.ConfirmationModal })));
const BudgetPushNotificationBanner = lazy(() => import('./components/BudgetPushNotificationBanner').then((module) => ({ default: module.BudgetPushNotificationBanner })));
const EmiConfirmationPromptModal = lazy(() => import('./components/EmiConfirmationPromptModal').then((module) => ({ default: module.EmiConfirmationPromptModal })));

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

  const legacyPasscodeRef = useRef<string | null>(null);
  const migrationRef = useRef<Promise<PasscodeCredentials> | null>(null);
  // App Data with LocalStorage Persistence
  const [settings, setSettings] = useState<UserSettings>(() => {
    const parsed = safeGetJson<(UserSettings & { passcode?: unknown }) | null>(
      'tmf_settings',
      null,
      (value): value is UserSettings & { passcode?: unknown } =>
        typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    if (parsed) {
      const { passcode: legacyPasscode, ...savedSettings } = parsed;
      legacyPasscodeRef.current = typeof legacyPasscode === 'string' ? legacyPasscode : null;
      return {
        ...savedSettings,
        locale: parsed.locale || getCurrencyLocale(parsed.currencyCode),
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
      locale: ['en', 'IN'].join('-'),
      theme: 'dark',
      passcodeEnabled: false,
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
    const parsed = safeGetJson<Category[]>('tmf_categories', INITIAL_CATEGORIES, Array.isArray);
    const ensured = ensureMandatoryCategories(parsed);
    return ensured;
  });

  const [accounts, setAccounts] = useState<FinancialAccount[]>(() => {
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_account_ids'));
    const parsed = safeGetJson<FinancialAccount[] | null>('tmf_accounts', null, Array.isArray);
    if (parsed !== null) {
      return parsed.filter((a) => !deletedIds.has(a.id));
    }
    const parsedSettings = safeGetJson<UserSettings | null>(
      'tmf_settings',
      null,
      (value): value is UserSettings => typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_ACCOUNTS.filter((a) => !deletedIds.has(a.id)) : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_tx_ids'));
    const parsed = safeGetJson<Transaction[] | null>('tmf_transactions', null, Array.isArray);
    if (parsed !== null) {
      return parsed.filter((t) => !deletedIds.has(t.id));
    }
    const parsedSettings = safeGetJson<UserSettings | null>(
      'tmf_settings',
      null,
      (value): value is UserSettings => typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_TRANSACTIONS.filter((t) => !deletedIds.has(t.id)) : [];
  });

  const [investments, setInvestments] = useState<InvestmentRecord[]>(() => {
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_investment_ids'));
    const parsed = safeGetJson<InvestmentRecord[] | null>('tmf_investments', null, Array.isArray);
    if (parsed !== null) {
      return parsed.filter((i) => !deletedIds.has(i.id));
    }
    const parsedSettings = safeGetJson<UserSettings | null>(
      'tmf_settings',
      null,
      (value): value is UserSettings => typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_INVESTMENTS.filter((i) => !deletedIds.has(i.id)) : [];
  });

  const [loans, setLoans] = useState<LoanRecord[]>(() => {
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_loan_ids'));
    const parsed = safeGetJson<LoanRecord[] | null>('tmf_loans', null, Array.isArray);
    if (parsed !== null) {
      return parsed.filter((l) => !deletedIds.has(l.id));
    }
    const parsedSettings = safeGetJson<UserSettings | null>(
      'tmf_settings',
      null,
      (value): value is UserSettings => typeof value === 'object' && value !== null && !Array.isArray(value)
    );
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_LOANS.filter((l) => !deletedIds.has(l.id)) : [];
  });

  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(() =>
    safeGetJson<SavingsGoal[]>('tmf_savings_goals', [], isSavingsGoalArray)
  );

  // Pending SMS / UPI Intercepted Notifications Queue
  const [pendingNotifications, setPendingNotifications] = useState<ParsedNotification[]>(() => {
    return safeGetJson<ParsedNotification[]>('tmf_pending_notifications', [], Array.isArray);
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
    return !settings.passcodeEnabled;
  });
  const [passcodeMigrationPending, setPasscodeMigrationPending] = useState(legacyPasscodeRef.current !== null);
  const [passcodeMigrationError, setPasscodeMigrationError] = useState(false);
  const [migrationRetry, setMigrationRetry] = useState(0);
  const [passcodeBusy, setPasscodeBusy] = useState(false);
  const passcodeBusyRef = useRef(false);
  const [passcodeOperationError, setPasscodeOperationError] = useState('');
  const previouslyEnabledRef = useRef(settings.passcodeEnabled);
  const storageWarningTimeRef = useRef(0);
  const [inputPasscode, setInputPasscode] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<boolean>(false);
  const [passcodeAttempts, setPasscodeAttempts] = useState<number>(0);
  const [passcodeLockedUntil, setPasscodeLockedUntil] = useState<number>(() => {
    const saved = safeGetItem('tmf_passcode_lock_until');
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
  const [syncStatus, setSyncStatus] = useState<{ collection: string; success: boolean; error?: string; warning?: string; schemaOutdated?: boolean; timestamp: number } | null>(null);
  // Schema-outdated warnings are shown once per session so a stale cloud schema
  // doesn't nag on every debounced sync.
  const schemaWarningShownRef = useRef(false);
  // Set when a sync failed because we were offline; cleared by the online retry.
  const pendingRetryRef = useRef(false);

  const acknowledgeCloudDeletion = (key: string, ids: string[], result: SyncResult): boolean => {
    if (!result.success) {
      setSyncStatus({ collection: 'cloud-delete', ...result, timestamp: Date.now() });
      return false;
    }
    removeDeletedIds(key, ids);
    return true;
  };

  const trackDeletedIds = (key: string, ids: string[]): string[] => {
    const pending = new Set(safeGetStringArray(key));
    ids.forEach(id => pending.add(id));
    const result = Array.from(pending);
    safeSetItem(key, JSON.stringify(result));
    return result;
  };

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

  useEffect(() => {
    const handleStorageFailure = (event: Event) => {
      if (Date.now() - storageWarningTimeRef.current < 5000) return;
      storageWarningTimeRef.current = Date.now();
      const message = event.type === STORAGE_READ_FAILED_EVENT
        ? 'Saved local data could not be read. A recovery copy was attempted; export your backup before resetting data.'
        : 'Local storage is full — changes may not persist';
      queueMicrotask(() => showToast(message, 'warning'));
    };
    window.addEventListener(STORAGE_WRITE_FAILED_EVENT, handleStorageFailure);
    window.addEventListener(STORAGE_READ_FAILED_EVENT, handleStorageFailure);
    if (consumePendingStorageReadFailure()) {
      handleStorageFailure(new Event(STORAGE_READ_FAILED_EVENT));
    }
    return () => {
      window.removeEventListener(STORAGE_WRITE_FAILED_EVENT, handleStorageFailure);
      window.removeEventListener(STORAGE_READ_FAILED_EVENT, handleStorageFailure);
    };
  }, []);

  useEffect(() => {
    if (legacyPasscodeRef.current === null) return;
    let active = true;
    migrationRef.current ??= createPasscodeCredentials(legacyPasscodeRef.current);
    migrationRef.current.then(credentials => {
      if (!active) return;
      legacyPasscodeRef.current = null;
      setSettings(previous => ({ ...previous, ...credentials }));
      setPasscodeMigrationPending(false);
    }).catch(error => {
      if (!active) return;
      console.warn('Could not migrate legacy passcode:', error);
      migrationRef.current = null;
      setPasscodeMigrationError(true);
    });
    return () => { active = false; };
  }, [migrationRetry]);

  useEffect(() => {
    if (!settings.passcodeEnabled || !previouslyEnabledRef.current) {
      setIsUnlocked(true);
    }
    previouslyEnabledRef.current = settings.passcodeEnabled;
  }, [settings.passcodeEnabled]);

  // Sync state changes to local storage
  useEffect(() => {
    if (passcodeMigrationPending) return;
    safeSetItem('tmf_settings', JSON.stringify(settings));
  }, [settings, passcodeMigrationPending]);

  // Each tab is a separate page: start it at the top instead of inheriting the
  // previous tab's scroll offset.
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeTab]);

  // One-time local migration: back-fill `kind` and canonical `accountId` on
  // records created before those fields existed.
  useEffect(() => {
    setTransactions((prev) => normalizeTransactions(prev, accounts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const reportSyncResult = (collection: string, result: SyncResult) => {
    const timestamp = Date.now();
    if (!result.success) {
      // Remember that something failed so we can retry as soon as connectivity returns.
      if (/offline|unreachable/i.test(result.error || '')) pendingRetryRef.current = true;
      setSyncStatus({ collection, ...result, timestamp });
      return;
    }
    if (result.warning && !schemaWarningShownRef.current) {
      schemaWarningShownRef.current = true;
      setSyncStatus({ collection, success: true, warning: result.warning, schemaOutdated: result.schemaOutdated, timestamp });
      return;
    }
    // Keep a visible schema warning on screen until the user dismisses it.
    setSyncStatus((prev) => (prev?.success && prev.warning ? prev : { collection, success: true, timestamp }));
  };

  useEffect(() => {
    safeSetItem('tmf_categories', JSON.stringify(categories));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(categories);
    if (lastPushedRef.current['categories'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['categories'] = snapshot;
      syncCategoriesToSupabase(categories).then((result) => reportSyncResult('categories', result));
    }, 400);

    return () => clearTimeout(timer);
  }, [categories, cloudReady, cloudHydrated]);

  useEffect(() => {
    safeSetItem('tmf_accounts', JSON.stringify(accounts));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(accounts);
    if (lastPushedRef.current['accounts'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['accounts'] = snapshot;
      syncAccountsToSupabase(accounts).then((result) => reportSyncResult('accounts', result));
    }, 400);

    return () => clearTimeout(timer);
  }, [accounts, cloudReady, cloudHydrated]);

  useEffect(() => {
    safeSetItem('tmf_transactions', JSON.stringify(transactions));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(transactions);
    if (lastPushedRef.current['transactions'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['transactions'] = snapshot;
      syncTransactionsToSupabase(transactions).then((result) => reportSyncResult('transactions', result));
    }, 400);

    return () => clearTimeout(timer);
  }, [transactions, cloudReady, cloudHydrated]);

  useEffect(() => {
    safeSetItem('tmf_investments', JSON.stringify(investments));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(investments);
    if (lastPushedRef.current['investments'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['investments'] = snapshot;
      syncInvestmentsToSupabase(investments).then((result) => reportSyncResult('investments', result));
    }, 400);

    return () => clearTimeout(timer);
  }, [investments, cloudReady, cloudHydrated]);

  useEffect(() => {
    safeSetItem('tmf_loans', JSON.stringify(loans));
    if (!cloudReady || !cloudHydrated) return;
    const snapshot = JSON.stringify(loans);
    if (lastPushedRef.current['loans'] === snapshot) return;

    const timer = setTimeout(() => {
      lastPushedRef.current['loans'] = snapshot;
      syncLoansToSupabase(loans).then((result) => reportSyncResult('loans', result));
    }, 400);

    return () => clearTimeout(timer);
  }, [loans, cloudReady, cloudHydrated]);

  useEffect(() => {
    safeSetItem('tmf_savings_goals', JSON.stringify(savingsGoals));
  }, [savingsGoals]);

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

  // When connectivity returns after an offline failure, push everything once
  // so changes made offline aren't stranded until the next edit.
  useEffect(() => {
    if (!cloudReady) return;
    const handleOnline = () => {
      if (!pendingRetryRef.current) return;
      pendingRetryRef.current = false;
      handleForceSyncNow().then((result) => {
        if (result.success) showToast('Back online — changes synced to cloud.', 'success');
      });
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, categories, accounts, transactions, investments, loans]);

  // Shared cloud data loader. Guarded by a ref so the initial-mount fetch and
  // the post-auth fetch can never run concurrently and race/overwrite each other.
  const loadCloudData = async () => {
    if (cloudLoadInFlightRef.current) return;
    cloudLoadInFlightRef.current = true;
    setCloudHydrated(false);
    let fetchThrewError = false;
    try {
      const [cloudTx, cloudAcc, cloudCat, cloudInv, cloudLoans, tombstones] = await Promise.all([
        fetchTransactionsFromSupabase(),
        fetchAccountsFromSupabase(),
        fetchCategoriesFromSupabase(),
        fetchInvestmentsFromSupabase(),
        fetchLoansFromSupabase(),
        fetchCloudTombstones(),
      ]);

      if (cloudTx === null || cloudAcc === null || cloudCat === null || cloudInv === null || cloudLoans === null) {
        throw new Error('Could not load cloud data — local changes are not being pushed');
      }

      // Rows deleted on another device arrive as tombstones: remember them
      // locally so this device drops its copy and never re-uploads it.
      const mergeTombstones = (key: string, ids: string[]) => {
        if (ids.length === 0) return;
        const merged = new Set([...safeGetStringArray(key), ...ids]);
        safeSetItem(key, JSON.stringify(Array.from(merged)));
      };
      mergeTombstones('tmf_deleted_tx_ids', tombstones.transactions);
      mergeTombstones('tmf_deleted_account_ids', tombstones.accounts);
      mergeTombstones('tmf_deleted_investment_ids', tombstones.investments);
      mergeTombstones('tmf_deleted_loan_ids', tombstones.loans);

      const isCloudEmpty =
        cloudTx.length === 0 &&
        cloudAcc.length === 0 &&
        cloudInv.length === 0 &&
        cloudLoans.length === 0;

      if (isCloudEmpty) {
        setSettings(previous => ({ ...previous, sampleDataLoaded: false }));
      }

      const savedSettings = safeGetJson<UserSettings | null>(
        'tmf_settings',
        null,
        (value): value is UserSettings => typeof value === 'object' && value !== null && !Array.isArray(value)
      );
      const isSampleLoaded = isCloudEmpty
        ? false
        : (savedSettings ? savedSettings.sampleDataLoaded !== false : true);

      const deletedTxIds = new Set(safeGetStringArray('tmf_deleted_tx_ids'));
      const deletedAccIds = new Set(safeGetStringArray('tmf_deleted_account_ids'));
      const deletedInvIds = new Set(safeGetStringArray('tmf_deleted_investment_ids'));
      const deletedLoanIds = new Set(safeGetStringArray('tmf_deleted_loan_ids'));

      if (cloudTx) {
        const filteredTx = (isSampleLoaded ? cloudTx : cloudTx.filter((t) => !SAMPLE_TRANSACTION_IDS.has(t.id)))
          .filter((t) => !deletedTxIds.has(t.id));
        // Snapshot the raw cloud rows so that any back-filled kind/accountId
        // fields are pushed back to the cloud on the next sync pass.
        lastPushedRef.current['transactions'] = JSON.stringify(filteredTx);
        const accountsForResolution = cloudAcc && cloudAcc.length > 0 ? cloudAcc : accounts;
        const normalizedTx = normalizeTransactions(filteredTx, accountsForResolution);
        setTransactions(normalizedTx);
        safeSetItem('tmf_transactions', JSON.stringify(normalizedTx));
      }
      if (cloudAcc) {
        const filteredAcc = (isSampleLoaded ? cloudAcc : cloudAcc.filter((a) => !SAMPLE_ACCOUNT_IDS.has(a.id)))
          .filter((a) => !deletedAccIds.has(a.id));
        lastPushedRef.current['accounts'] = JSON.stringify(filteredAcc);
        setAccounts(filteredAcc);
        safeSetItem('tmf_accounts', JSON.stringify(filteredAcc));
      }
      if (cloudCat && cloudCat.length > 0) {
        const ensuredCat = ensureMandatoryCategories(cloudCat);
        lastPushedRef.current['categories'] = JSON.stringify(ensuredCat);
        setCategories(ensuredCat);
        safeSetItem('tmf_categories', JSON.stringify(ensuredCat));
      }
      if (cloudInv) {
        const localInvMap = new Map<string, InvestmentRecord>();
        const parsedLocalInvestments = safeGetJson<InvestmentRecord[]>('tmf_investments', [], Array.isArray);
        parsedLocalInvestments.forEach((inv) => localInvMap.set(inv.id, inv));

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
        safeSetItem('tmf_investments', JSON.stringify(filteredInv));
      }
      if (cloudLoans) {
        const localLoansMap = new Map<string, LoanRecord>();
        const parsedLocalLoans = safeGetJson<LoanRecord[]>('tmf_loans', [], Array.isArray);
        parsedLocalLoans.forEach((loan) => localLoansMap.set(loan.id, loan));

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
        safeSetItem('tmf_loans', JSON.stringify(filteredLoans));
      }

      // Only acknowledge the snapshot sent to the server; newer offline deletions must survive.
      const cleanup = [
        { key: 'tmf_deleted_tx_ids', ids: Array.from(deletedTxIds), remove: deleteMultipleTransactionsFromSupabase },
        { key: 'tmf_deleted_account_ids', ids: Array.from(deletedAccIds), remove: deleteMultipleAccountsFromSupabase },
        { key: 'tmf_deleted_investment_ids', ids: Array.from(deletedInvIds), remove: deleteMultipleInvestmentsFromSupabase },
        { key: 'tmf_deleted_loan_ids', ids: Array.from(deletedLoanIds), remove: deleteMultipleLoansFromSupabase },
      ];
      const results = await Promise.all(cleanup.filter(item => item.ids.length > 0).map(async item =>
        acknowledgeCloudDeletion(item.key, item.ids, await item.remove(item.ids))
      ));
      if (results.some(success => !success)) fetchThrewError = true;
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
    safeSetItem('tmf_transactions', '[]');
    safeSetItem('tmf_accounts', '[]');
    safeSetItem('tmf_investments', '[]');
    safeSetItem('tmf_loans', '[]');
    safeSetItem('tmf_pending_notifications', '[]');
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
          const { getCurrentDeviceLocation } = await import('./services/locationService');
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

      const { parseNotification } = await import('./services/notification/ParserManager');
      const { parsed, isDuplicate } = parseNotification(rawText, locationTag, transactions, pendingNotifications);
      if (isDuplicate) return; // Silently drop duplicates

      setPendingNotifications((prev) => [parsed, ...prev]);
      if (settings.notificationsEnabled) {
        const { notifyTransactionDetected } = await import('./services/localNotifications');
        await notifyTransactionDetected(parsed, settings.currencySymbol, settings.locale);
      }
    });
    return stopListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoExtractSms, settings.notificationsEnabled, settings.locationTracking, settings.currencySymbol, settings.locale, transactions, pendingNotifications]);


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

  // Auto-lock: when the app has been hidden/backgrounded for longer than the
  // configured grace period, require the PIN/biometric again on return.
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!settings.passcodeEnabled || settings.autoLockMinutes === undefined) return;
    const graceMs = Math.max(0, settings.autoLockMinutes) * 60_000;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        if (graceMs === 0) setIsUnlocked(false);
        return;
      }
      if (hiddenAtRef.current !== null && Date.now() - hiddenAtRef.current >= graceMs) {
        setIsUnlocked(false);
      }
      hiddenAtRef.current = null;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [settings.passcodeEnabled, settings.autoLockMinutes]);

  // Biometric unlock (WebAuthn platform authenticator), offered when enabled & enrolled on this device.
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  useEffect(() => {
    if (!settings.passcodeEnabled || !settings.biometricUnlockEnabled || isUnlocked) {
      setBiometricReady(false);
      return;
    }
    let active = true;
    isBiometricAvailable().then((available) => {
      if (active) setBiometricReady(available && isBiometricEnrolled());
    });
    return () => { active = false; };
  }, [settings.passcodeEnabled, settings.biometricUnlockEnabled, isUnlocked]);

  const handleBiometricUnlock = async () => {
    if (biometricBusy || passcodeLockedUntil > Date.now()) return;
    setBiometricBusy(true);
    setPasscodeOperationError('');
    try {
      if (await verifyBiometric()) {
        setIsUnlocked(true);
        setPasscodeError(false);
        setPasscodeAttempts(0);
        setInputPasscode('');
      } else {
        setPasscodeOperationError('Biometric check did not complete. Use your PIN instead.');
      }
    } finally {
      setBiometricBusy(false);
    }
  };

  useEffect(() => {
    safeSetItem('tmf_pending_notifications', JSON.stringify(pendingNotifications));
  }, [pendingNotifications]);

  // Real-time Push-Style Budget Notification Monitor (80% and 100% Thresholds)
  useEffect(() => {
    if (!settings.notificationsEnabled || settings.budgetAlertsEnabled === false) return;
    const newAlerts = checkBudgetThresholds(transactions, categories, settings.currencySymbol, undefined, settings.locale);
    if (newAlerts && newAlerts.length > 0) {
      setActiveBudgetPushAlert(newAlerts[0]);
    }
  }, [transactions, categories, settings.currencySymbol, settings.locale, settings.notificationsEnabled, settings.budgetAlertsEnabled]);

  // Passcode verification with brute-force lockout protection
  const handlePasscodeUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeLockedUntil > Date.now() || passcodeBusyRef.current) return;
    passcodeBusyRef.current = true;
    setPasscodeBusy(true);
    setPasscodeOperationError('');

    try {
      if (await verifyPasscode(inputPasscode, settings)) {
        setIsUnlocked(true);
        localStorage.removeItem('tmf_passcode_lock_until');
        setPasscodeError(false);
        setPasscodeAttempts(0);
        // Transparently upgrade legacy SHA-256 credentials to PBKDF2 now that
        // we hold the correct PIN in memory.
        if (isLegacyPasscodeHash(settings.passcodeHash)) {
          try {
            const upgraded = await createPasscodeCredentials(inputPasscode);
            setSettings((previous) => ({ ...previous, ...upgraded }));
          } catch (upgradeError) {
            console.warn('Could not upgrade passcode hash:', upgradeError);
          }
        }
        setInputPasscode('');
      } else {
        const nextAttempts = passcodeAttempts + 1;
        setPasscodeAttempts(nextAttempts);
        setPasscodeError(true);
        setInputPasscode('');
        if (nextAttempts >= MAX_PASSCODE_ATTEMPTS) {
          const lockUntil = Date.now() + PASSCODE_LOCKOUT_MS;
          setPasscodeLockedUntil(lockUntil);
          safeSetItem('tmf_passcode_lock_until', lockUntil.toString());
        }
      }
    } catch (error) {
      console.warn('Could not verify passcode:', error);
      setPasscodeOperationError('Could not verify your PIN. Please try again on a secure connection.');
    } finally {
      passcodeBusyRef.current = false;
      setPasscodeBusy(false);
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
      setCategories(previous => [...previous, newUncat]);
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
      kind: inferTransactionKind({ type: notif.type, category: resolvedCat, subcategory: resolvedSubcat, title: notif.payeeOrPayer, note: notif.rawText }),
      category: resolvedCat,
      subcategory: resolvedSubcat,
      date: notif.date,
      time: notif.time,
      location: notif.location,
      source: 'UPI',
      payeeOrPayer: notif.payeeOrPayer,
      accountId: resolvedAccId || undefined,
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
  const handleSaveTransaction = (incoming: Transaction) => {
    const oldTx = transactions.find(t => t.id === incoming.id);
    const newTarget = resolveAccountId(accounts, incoming.accountId || incoming.paymentMethod) || incoming.paymentMethod;
    const oldTarget = oldTx && (resolveAccountId(accounts, oldTx.accountId || oldTx.paymentMethod) || oldTx.paymentMethod);
    const resolvedAccountId = resolveAccountId(accounts, incoming.accountId || incoming.paymentMethod) || undefined;
    // Re-derive the semantic kind unless the editor set one explicitly, so a
    // category change (e.g. to Investment) is reflected in dashboard metrics.
    const tx: Transaction = {
      ...incoming,
      accountId: resolvedAccountId,
      kind: incoming.kind ?? inferTransactionKind(incoming),
    };
    setAccounts(previous => {
      const reverted = oldTx
        ? adjustAccountBalance(previous, oldTarget, oldTx.type === 'credit' ? -oldTx.amount : oldTx.amount)
        : previous;
      return adjustAccountBalance(reverted, newTarget, tx.type === 'credit' ? tx.amount : -tx.amount);
    });
    setTransactions(previous => previous.some(t => t.id === tx.id)
      ? previous.map(t => t.id === tx.id ? tx : t)
      : [tx, ...previous]);
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    const primary = transactions.find(t => t.id === id);
    // A transfer is two linked legs sharing a refNumber; removing one must remove both.
    const idsToDelete =
      primary && primary.kind === 'transfer' && primary.refNumber
        ? transactions.filter((t) => t.kind === 'transfer' && t.refNumber === primary.refNumber).map((t) => t.id)
        : [id];

    // Record locally deleted IDs so they are never reloaded from cloud or initial state
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_tx_ids'));
    idsToDelete.forEach((txId) => deletedIds.add(txId));
    safeSetItem('tmf_deleted_tx_ids', JSON.stringify(Array.from(deletedIds)));

    setAccounts((previous) =>
      idsToDelete.reduce((accs, txId) => {
        const tx = transactions.find((t) => t.id === txId);
        if (!tx) return accs;
        const revertDelta = tx.type === 'credit' ? -tx.amount : tx.amount;
        const target = resolveAccountId(accs, tx.accountId || tx.paymentMethod) || tx.paymentMethod;
        return adjustAccountBalance(accs, target, revertDelta);
      }, previous)
    );
    setTransactions(previous => previous.filter(t => !idsToDelete.includes(t.id)));
    idsToDelete.forEach((txId) =>
      deleteReceiptAttachmentsForTransaction(txId).catch((error: unknown) => {
        showToast(
          `Transaction deleted, but its local receipt image could not be removed: ${error instanceof Error ? error.message : 'Unknown storage error'}`,
          'warning'
        );
      })
    );

    if (isCloudBackendConfigured()) {
      deleteMultipleTransactionsFromSupabase(idsToDelete).then((result) => {
        acknowledgeCloudDeletion('tmf_deleted_tx_ids', idsToDelete, result);
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
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_account_ids'));
    deletedIds.add(id);
    safeSetItem('tmf_deleted_account_ids', JSON.stringify(Array.from(deletedIds)));

    const accName = accounts.find(a => a.id === id)?.name || 'Account';
    setAccounts(previous => previous.filter(a => a.id !== id));
    showToast(`${accName} deleted`, 'warning');

    if (isCloudBackendConfigured()) {
      deleteAccountFromSupabase(id).then((result) => {
        acknowledgeCloudDeletion('tmf_deleted_account_ids', [id], result);
      });
    }
  };

  // Category Actions
  // Category names are the join key for transactions and budgets, so they
  // must be unique (case-insensitive) within a type.
  const findDuplicateCategory = (name: string, type: Category['type'], excludeId?: string) =>
    categories.find((c) => c.id !== excludeId && c.type === type && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  const handleAddCategory = (cat: Category) => {
    const duplicate = findDuplicateCategory(cat.name, cat.type);
    if (duplicate) {
      showToast(`A ${cat.type} category named "${duplicate.name}" already exists.`, 'error');
      return;
    }
    setCategories((prev) => [...prev, cat]);
  };

  const handleUpdateCategory = (cat: Category) => {
    const duplicate = findDuplicateCategory(cat.name, cat.type, cat.id);
    if (duplicate) {
      showToast(`A ${cat.type} category named "${duplicate.name}" already exists.`, 'error');
      return;
    }
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
          return updated;
        }
        return prevTx;
      });
    }

    setCategories(previous => previous.map(c => c.id === cat.id ? cat : c));
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
            return updated;
          }

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
    kind,
    category,
    subcategory,
    accountId,
    toAccountId,
    date,
    note,
    source = 'Manual',
  }: {
    title: string;
    amount: number;
    type: TransactionType;
    kind?: TransactionKind;
    category: string;
    subcategory: string;
    accountId?: string;
    toAccountId?: string;
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
      kind: kind ?? inferTransactionKind({ type, category, subcategory, title, note }),
      category,
      subcategory,
      date: date || todayLocalISO(),
      time: nowLocalTimeHHMM(),
      source,
      accountId: finalAccountId || undefined,
      toAccountId,
      paymentMethod: finalAccountId,
      note,
    };

    setTransactions(previous => [newTx, ...previous]);

    if (finalAccountId) {
      const delta = type === 'credit' ? amount : -amount;
      setAccounts(previous => adjustAccountBalance(previous, finalAccountId, delta));
    }
  };

  // Account-to-account transfer: two linked ledger legs with kind='transfer'.
  // Both balances move; neither leg counts as income or spend anywhere.
  // adjustAccountBalance already inverts the sign for credit cards, so
  // "transfer to card" naturally reduces the card's outstanding balance.
  const handleAddTransfer = ({ fromAccountId, toAccountId, amount, date, time, note }: TransferRequest) => {
    const from = accounts.find((a) => a.id === fromAccountId);
    const to = accounts.find((a) => a.id === toAccountId);
    if (!from || !to || from.id === to.id || !(amount > 0)) return;

    const transferId = newId('xfer');
    const isCardPayment = to.type === 'Credit Card';
    const title = isCardPayment ? `Card payment: ${to.name}` : `Transfer to ${to.name}`;
    const baseNote = note || `${from.name} → ${to.name}`;

    const outLeg: Transaction = {
      id: `${transferId}_out`,
      title,
      amount,
      type: 'debit',
      kind: 'transfer',
      category: 'Transfer',
      subcategory: isCardPayment ? 'Card Payment' : 'Self Transfer',
      date,
      time,
      source: 'Manual',
      accountId: from.id,
      toAccountId: to.id,
      paymentMethod: from.id,
      payeeOrPayer: to.name,
      note: baseNote,
      refNumber: transferId,
    };
    const inLeg: Transaction = {
      id: `${transferId}_in`,
      title: isCardPayment ? `Card payment from ${from.name}` : `Transfer from ${from.name}`,
      amount,
      type: 'credit',
      kind: 'transfer',
      category: 'Transfer',
      subcategory: isCardPayment ? 'Card Payment' : 'Self Transfer',
      date,
      time,
      source: 'Manual',
      accountId: to.id,
      toAccountId: from.id,
      paymentMethod: to.id,
      payeeOrPayer: from.name,
      note: baseNote,
      refNumber: transferId,
    };

    setTransactions((previous) => [outLeg, inLeg, ...previous]);
    setAccounts((previous) => adjustAccountBalance(adjustAccountBalance(previous, from.id, -amount), to.id, amount));
    showToast(
      `${formatMoney(amount, { symbol: settings.currencySymbol, locale: settings.locale })} moved ${from.name} → ${to.name}.`,
      'success'
    );
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
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_investment_ids'));
    deletedIds.add(id);
    safeSetItem('tmf_deleted_investment_ids', JSON.stringify(Array.from(deletedIds)));

    setInvestments(previous => previous.filter(inv => inv.id !== id));

    if (isCloudBackendConfigured()) {
      deleteInvestmentFromSupabase(id).then((result) => {
        acknowledgeCloudDeletion('tmf_deleted_investment_ids', [id], result);
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
    const deletedIds = new Set(safeGetStringArray('tmf_deleted_loan_ids'));
    deletedIds.add(loanId);
    safeSetItem('tmf_deleted_loan_ids', JSON.stringify(Array.from(deletedIds)));

    setLoans(previous => previous.filter(loan => loan.id !== loanId));

    if (isCloudBackendConfigured()) {
      deleteLoanFromSupabase(loanId).then((result) => {
        acknowledgeCloudDeletion('tmf_deleted_loan_ids', [loanId], result);
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

        const paidInst = (l.schedule || []).find((s) => s.installmentNumber === installmentNumber);
        const newRepayment: Repayment = {
          id: newId('rep'),
          amount,
          date: paidDate,
          note: notes || `EMI Installment #${installmentNumber}`,
          installmentNumber,
          principalComponent: paidInst?.principalComponent,
          interestComponent: paidInst?.interestComponent,
        };
        const newRepayments = [newRepayment, ...(l.repayments || [])];
        // remainingAmount tracks outstanding principal, so only the principal
        // part of an amortised installment reduces it (interest is a cost).
        const principalPaid = paidInst && paidInst.principalComponent > 0 ? paidInst.principalComponent : amount;
        const newRemaining = Math.max(0, Math.round((l.remainingAmount - principalPaid) * 100) / 100);
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

    showToast(`EMI payment of ${formatMoney(amount, { symbol: settings.currencySymbol, locale: settings.locale })} confirmed and recorded!`, 'success');
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
        note: `Gross proceeds: ${formatMoney(redemption.grossProceeds, { symbol: settings.currencySymbol, locale: settings.locale })}, Fees: ${formatMoney(redemption.charges || 0, { symbol: settings.currencySymbol, locale: settings.locale })}, Tax: ${formatMoney(redemption.taxes || 0, { symbol: settings.currencySymbol, locale: settings.locale })}, Realized P&L: ${redemption.realizedGainLoss >= 0 ? '+' : ''}${formatMoney(redemption.realizedGainLoss, { symbol: settings.currencySymbol, locale: settings.locale })}`,
        source: 'Manual',
      });
    }

    showToast(
      `Redeemed successfully! ${formatMoney(redemption.netCredited, { symbol: settings.currencySymbol, locale: settings.locale })} credited to account.`,
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

        safeSetItem('tmf_settings', JSON.stringify(newSettings));
        safeSetItem('tmf_accounts', JSON.stringify(INITIAL_ACCOUNTS));
        safeSetItem('tmf_transactions', JSON.stringify(INITIAL_TRANSACTIONS));
        safeSetItem('tmf_investments', JSON.stringify(INITIAL_INVESTMENTS));
        safeSetItem('tmf_loans', JSON.stringify(INITIAL_LOANS));

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
        const removals = [
          { key: 'tmf_deleted_tx_ids', ids: Array.from(SAMPLE_TRANSACTION_IDS), remove: deleteMultipleTransactionsFromSupabase },
          { key: 'tmf_deleted_account_ids', ids: Array.from(SAMPLE_ACCOUNT_IDS), remove: deleteMultipleAccountsFromSupabase },
          { key: 'tmf_deleted_investment_ids', ids: Array.from(SAMPLE_INVESTMENT_IDS), remove: deleteMultipleInvestmentsFromSupabase },
          { key: 'tmf_deleted_loan_ids', ids: Array.from(SAMPLE_LOAN_IDS), remove: deleteMultipleLoansFromSupabase },
        ];
        removals.forEach(item => trackDeletedIds(item.key, item.ids));
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

        safeSetItem('tmf_settings', JSON.stringify(newSettings));
        safeSetItem('tmf_transactions', JSON.stringify(nextTx));
        safeSetItem('tmf_accounts', JSON.stringify(nextAcc));
        safeSetItem('tmf_investments', JSON.stringify(nextInv));
        safeSetItem('tmf_loans', JSON.stringify(nextLoans));

        if (isCloudBackendConfigured()) {
          await Promise.all(removals.map(async item =>
            acknowledgeCloudDeletion(item.key, item.ids, await item.remove(item.ids))
          ));
        }

        showToast('Sample demo data removed', 'warning');
      },
    });
  };

  // Data Reset & Export Backup
  const handleExportBackupJSON = () => {
    // Device security material never leaves the device: the backup carries
    // preferences only, not the PIN hash/salt.
    const { passcodeHash: _hash, passcodeSalt: _salt, ...exportableSettings } = settings;
    const backupData = {
      formatVersion: 1,
      settings: { ...exportableSettings, passcodeEnabled: false },
      categories,
      accounts,
      transactions,
      investments,
      loans,
      savingsGoals,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `MTracker_Backup_${todayLocalISO()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Financial backup downloaded (JSON)', 'info');
  };

  const handleRestoreBackupJSON = (backup: BackupRestoreData) => {
    const restoredCategories = ensureMandatoryCategories(backup.categories);
    const restoredAccounts = backup.accounts ?? accounts;
    const restoredSavingsGoals = backup.savingsGoals ?? savingsGoals;
    const legacyAccountNote = backup.accounts === undefined
      ? ' This older backup does not include accounts, so current accounts will be kept.'
      : '';
    const legacyGoalsNote = backup.savingsGoals === undefined
      ? ' This backup does not include savings goals, so current goals will be kept.'
      : '';

    setConfirmConfig({
      title: 'Replace Data With This Backup?',
      description: `This will replace ${transactions.length} transactions, ${accounts.length} accounts, ${investments.length} investments, ${loans.length} loans, ${savingsGoals.length} savings goals, and ${categories.length} categories with ${backup.transactions.length} transactions, ${restoredAccounts.length} accounts, ${backup.investments.length} investments, ${backup.loans.length} loans, ${restoredSavingsGoals.length} savings goals, and ${restoredCategories.length} categories from the selected backup. This action cannot be undone.${legacyAccountNote}${legacyGoalsNote}${cloudReady ? ' Your signed-in cloud data will also be replaced.' : ''}`,
      confirmLabel: 'Replace With Backup',
      cancelLabel: 'Cancel',
      intent: 'danger',
      icon: 'warning',
      onConfirm: async () => {
        if (cloudReady) {
          const deletion = await deleteAllUserDataFromSupabase();
          if (!deletion.success) {
            setSyncStatus({ collection: 'backup-restore', ...deletion, timestamp: Date.now() });
            showToast(`Could not restore backup because cloud data could not be cleared: ${deletion.error || 'Unknown error'}`, 'error');
            return;
          }
        }

        const tombstoneKeys = [
          'tmf_deleted_tx_ids',
          'tmf_deleted_account_ids',
          'tmf_deleted_investment_ids',
          'tmf_deleted_loan_ids',
        ];
        tombstoneKeys.forEach((key) => safeSetItem(key, JSON.stringify([])));
        lastPushedRef.current = {};

        // Keep this device's lock configuration; a backup never carries PIN material.
        setSettings({
          ...backup.settings,
          passcodeEnabled: settings.passcodeEnabled,
          passcodeHash: settings.passcodeHash,
          passcodeSalt: settings.passcodeSalt,
        });
        setCategories(restoredCategories);
        setAccounts(restoredAccounts);
        setTransactions(backup.transactions);
        setInvestments(backup.investments);
        setLoans(backup.loans);
        setSavingsGoals(restoredSavingsGoals);
        setPendingNotifications([]);

        showToast('Backup restored successfully.', 'success');
      },
    });
  };

  const handleImportTransactions = (imported: Transaction[]) => {
    const existingIds = new Set(transactions.map((transaction) => transaction.id));
    const importedIds = new Set<string>();
    const added = imported.filter((transaction) => {
      if (existingIds.has(transaction.id) || importedIds.has(transaction.id)) return false;
      importedIds.add(transaction.id);
      return true;
    });

    if (added.length > 0) {
      removeDeletedIds('tmf_deleted_tx_ids', added.map((transaction) => transaction.id));
      setTransactions((current) => [...added.filter((transaction) => !current.some((item) => item.id === transaction.id)), ...current]);
    }

    return { added: added.length, duplicates: imported.length - added.length };
  };

  const handleRequestResetAllData = () => {
    setConfirmConfig({
      title: 'Reset All Financial Records?',
      description: 'Are you sure you want to delete all financial records? All transactions, accounts, investments, loans, savings goals, and notifications will be permanently erased.',
      confirmLabel: 'Clear Everything',
      cancelLabel: 'Keep Data',
      intent: 'danger',
      icon: 'warning',
      onConfirm: async () => {
        let receiptCleanupError: string | null = null;
        try {
          await deleteAllReceiptAttachments();
        } catch (error) {
          receiptCleanupError = error instanceof Error ? error.message : 'Unknown storage error';
        }
        const deletedSnapshots = [
          { key: 'tmf_deleted_tx_ids', ids: transactions.map(item => item.id) },
          { key: 'tmf_deleted_account_ids', ids: accounts.map(item => item.id) },
          { key: 'tmf_deleted_investment_ids', ids: investments.map(item => item.id) },
          { key: 'tmf_deleted_loan_ids', ids: loans.map(item => item.id) },
        ].map(item => ({ key: item.key, ids: trackDeletedIds(item.key, item.ids) }));
        const newSettings = { ...settings, sampleDataLoaded: false };
        setSettings(newSettings);

        safeSetItem('tmf_settings', JSON.stringify(newSettings));
        safeSetItem('tmf_transactions', '[]');
        safeSetItem('tmf_accounts', '[]');
        safeSetItem('tmf_investments', '[]');
        safeSetItem('tmf_loans', '[]');
        safeSetItem('tmf_savings_goals', '[]');
        safeSetItem('tmf_pending_notifications', '[]');

        setTransactions([]);
        setAccounts([]);
        setInvestments([]);
        setLoans([]);
        setSavingsGoals([]);
        setPendingNotifications([]);
        resetDuplicateMemory();

        if (isCloudBackendConfigured()) {
          const result = await deleteAllUserDataFromSupabase();
          if (result.success) {
            deletedSnapshots.forEach(item => acknowledgeCloudDeletion(item.key, item.ids, result));
          } else {
            setSyncStatus({ collection: 'delete-all-data', ...result, timestamp: Date.now() });
          }
        }

        showToast(
          receiptCleanupError
            ? `Financial records were cleared, but local receipt images could not be removed: ${receiptCleanupError}`
            : 'All local financial records cleared',
          receiptCleanupError ? 'warning' : 'error'
        );
      },
    });
  };

  if (passcodeMigrationError) {
    return (
      <div className="min-h-screen bg-obsidian text-white font-mono flex flex-col items-center justify-center gap-4 p-6">
        <p role="alert">Could not secure your existing passcode. Your app remains locked.</p>
        <button type="button" className="bg-red-600 rounded-xl px-4 py-2" onClick={() => {
          setPasscodeMigrationError(false);
          setMigrationRetry(previous => previous + 1);
        }}>Retry</button>
      </div>
    );
  }

  // 0. App Launch Motion Loader
  if (isAppLoading || passcodeMigrationPending) {
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
      <Suspense fallback={<div role="status" className="min-h-screen bg-black" />}>
        <AuthModal
          initialMode={isPasswordRecovery ? 'set_new_password' : 'login'}
          canClose={false}
          onClose={() => {}}
          onSuccess={handleAuthSuccess}
          settings={settings}
        />
      </Suspense>
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
              disabled={passcodeBusy || passcodeLockedUntil > Date.now()}
              value={inputPasscode}
              onChange={(e) => setInputPasscode(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-[0.5em] text-2xl py-3 bg-obsidian border border-nothing rounded-2xl font-mono text-white focus:outline-none focus:border-red-600 disabled:opacity-40"
            />

            {passcodeOperationError && <p role="alert" className="text-xs text-red-400">{passcodeOperationError}</p>}
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
              disabled={passcodeBusy || passcodeLockedUntil > Date.now()}
              className="w-full py-3 bg-white text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Unlock Application
            </button>

            {biometricReady && (
              <button
                type="button"
                onClick={handleBiometricUnlock}
                disabled={biometricBusy || passcodeLockedUntil > Date.now()}
                className="w-full py-3 bg-obsidian border border-nothing text-white font-mono font-bold text-xs uppercase rounded-xl hover:border-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                <Fingerprint className="w-4 h-4 text-red-500" />
                {biometricBusy ? 'Checking…' : 'Unlock with device biometrics'}
              </button>
            )}
          </form>
        </motion.div>
      </div>
    );
  }


  return (
    <MoneyLocaleContext.Provider value={settings.locale}>
    <div className="app-viewport flex bg-obsidian text-[#f0f0f0] font-sans overflow-hidden">
      <a className="skip-link" href="#main-content">Skip to main content</a>
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
          currencyCode={settings.currencyCode}
          locationTracking={settings.locationTracking}
          theme={settings.theme || 'dark'}
          onToggleTheme={handleToggleTheme}
        />

        {/* Backend Sync Banner — surfaces real Supabase errors (red) and
            non-fatal schema warnings (amber) instead of failing silently. */}
        {syncStatus && (!syncStatus.success || syncStatus.warning) && (
          <div
            role={syncStatus.success ? 'status' : 'alert'}
            className={`mx-4 sm:mx-6 lg:mx-8 mt-3 p-3 border rounded-xl text-xs font-mono flex items-start justify-between gap-3 ${
              syncStatus.success
                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800/80 text-amber-800 dark:text-amber-300'
                : 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800/80 text-red-700 dark:text-red-400'
            }`}
          >
            <span>
              {syncStatus.success
                ? `Cloud sync warning (${syncStatus.collection}): ${syncStatus.warning}`
                : `Backend sync failed (${syncStatus.collection}): ${syncStatus.error || 'Unknown error'}`}
            </span>
            <button
              type="button"
              onClick={() => setSyncStatus((prev) => (prev ? { ...prev, success: true, warning: undefined } : null))}
              aria-label="Dismiss sync message"
              className="shrink-0 font-bold hover:opacity-70 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable View Content */}
        <main id="main-content" ref={mainScrollRef} tabIndex={-1} aria-label="Main content" className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <Suspense
            fallback={
              <div role="status" className="py-8 text-center text-xs font-mono text-[#888]">
                Loading section…
              </div>
            }
          >
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
              savingsGoals={savingsGoals}
              onSavingsGoalsChange={setSavingsGoals}
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
              accounts={accounts}
              onAddTransaction={() => handleOpenAddModal('Expense')}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onImportTransactions={handleImportTransactions}
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
              settings={settings}
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
              onRestoreBackupJSON={handleRestoreBackupJSON}
              onResetAllData={handleRequestResetAllData}
              onLoadSampleData={handleRequestLoadSampleData}
              onRemoveSampleData={handleRequestRemoveSampleData}
              syncStatus={syncStatus}
              onForceSyncNow={handleForceSyncNow}
              isAuthenticated={isAuthenticated}
              authUserEmail={authUser?.email || null}
              onSignOut={handleSignOut}
              onOpenProfile={() => setIsProfileModalOpen(true)}
              onNavigateToTab={setActiveTab}
            />
          )}
            </motion.div>
          </AnimatePresence>
          </Suspense>
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
          <Suspense fallback={null}>
            <BudgetPushNotificationBanner
              alert={activeBudgetPushAlert}
              currencySymbol={settings.currencySymbol}
              onDismiss={() => setActiveBudgetPushAlert(null)}
              onNavigateToCustomisations={() => {
                setActiveBudgetPushAlert(null);
                setActiveTab('customisations');
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Confirmation Modal Dialog for Destructive / Data Actions */}
      <AnimatePresence>
        {confirmConfig && (
          <Suspense fallback={null}>
            <ConfirmationModal
              config={confirmConfig}
              onClose={() => setConfirmConfig(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Global Modals */}

      {/* 1. User Profile Modal */}
      {isProfileModalOpen && (
        <Suspense fallback={null}>
          <UserProfileModal
            settings={settings}
            accounts={accounts}
            onClose={() => setIsProfileModalOpen(false)}
            onUpdateSettings={setSettings}
            onExportData={handleExportBackupJSON}
            onSignOut={handleSignOut}
          />
        </Suspense>
      )}

      {/* 2. UPI/SMS Intercept Notification Prompt Modal (The core requested feature!) */}
      {isNotificationModalOpen && (
        <Suspense fallback={null}>
          <NotificationPromptModal
            notifications={pendingNotifications}
            onConfirmAdd={handleConfirmAddNotification}
            onConfirmEdit={handleConfirmEditNotification}
            onIgnore={handleIgnoreNotification}
            onClose={() => setIsNotificationModalOpen(false)}
            currencySymbol={settings.currencySymbol}
          />
        </Suspense>
      )}

      {/* 2.5 EMI Repayment Installment Confirmation Prompt Modal */}
      {isEmiModalOpen && pendingEmiRequests.length > 0 && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* 3. Simulator Widget for testing notifications */}
      {isSimulatorOpen && (
        <Suspense fallback={null}>
          <SmsSimulatorWidget
            transactions={transactions}
            pendingNotifications={pendingNotifications}
            onInterceptNotification={handleInterceptedFromSimulator}
            onClose={() => setIsSimulatorOpen(false)}
            currencySymbol={settings.currencySymbol}
            locationTracking={Boolean(settings.locationTracking)}
          />
        </Suspense>
      )}

      {/* 4. Add / Edit Record Modal — keyed so switching between add/edit or
          between two transactions always starts from fresh form state. */}
      {(isAddModalOpen || Boolean(editingTransaction)) && (
        <Suspense fallback={null}>
          <EditTransactionModal
            key={
              editingTransaction
                ? editingTransaction.id || `prefill-${editingTransaction.refNumber || ''}-${editingTransaction.amount}-${editingTransaction.date}-${editingTransaction.time}`
                : `new-${modalInitialCategoryType}`
            }
            transaction={editingTransaction}
            categories={categories}
            accounts={accounts}
            loans={loans}
            initialCategoryType={modalInitialCategoryType}
            onSave={handleSaveTransaction}
            onAddInvestment={handleAddInvestment}
            onAddLoan={handleAddLoan}
            onAddTransfer={handleAddTransfer}
            onClose={() => {
              setIsAddModalOpen(false);
              setEditingTransaction(null);
            }}
            currencySymbol={settings.currencySymbol}
            locationTracking={Boolean(settings.locationTracking)}
          />
        </Suspense>
      )}
    </div>
    </MoneyLocaleContext.Provider>
  );
}
