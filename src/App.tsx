/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { AuthModal } from './components/AuthModal';
import { TopBarToast, ToastMessage } from './components/TopBarToast';
import { ConfirmationModal, ConfirmDialogConfig } from './components/ConfirmationModal';
import { BudgetPushNotificationBanner } from './components/BudgetPushNotificationBanner';
import { BudgetAlertPayload, checkBudgetThresholds } from './services/budgetAlertService';

import {
  Transaction,
  Category,
  FinancialAccount,
  InvestmentRecord,
  LoanRecord,
  ParsedNotification,
  UserSettings,
  Repayment
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
  deleteMultipleTransactionsFromSupabase,
  deleteMultipleAccountsFromSupabase,
  deleteMultipleInvestmentsFromSupabase,
  deleteMultipleLoansFromSupabase,
  deleteAllUserDataFromSupabase,
} from './services/supabaseClient';

import { parseSmsNotification } from './services/smsParser';
import { parseNotification } from './services/notification/ParserManager';
import { startNotificationListener } from './services/notificationListener';
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
    };
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('tmf_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [accounts, setAccounts] = useState<FinancialAccount[]>(() => {
    const saved = localStorage.getItem('tmf_accounts');
    if (saved !== null) return JSON.parse(saved);
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_ACCOUNTS : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('tmf_transactions');
    if (saved !== null) return JSON.parse(saved);
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_TRANSACTIONS : [];
  });

  const [investments, setInvestments] = useState<InvestmentRecord[]>(() => {
    const saved = localStorage.getItem('tmf_investments');
    if (saved !== null) return JSON.parse(saved);
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_INVESTMENTS : [];
  });

  const [loans, setLoans] = useState<LoanRecord[]>(() => {
    const saved = localStorage.getItem('tmf_loans');
    if (saved !== null) return JSON.parse(saved);
    const savedSettings = localStorage.getItem('tmf_settings');
    const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
    const isLoaded = parsedSettings ? parsedSettings.sampleDataLoaded !== false : true;
    return isLoaded ? INITIAL_LOANS : [];
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

  const showToast = (
    text: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'success',
    duration = 3200
  ) => {
    setTopBarToast({
      id: `toast_${Date.now()}_${Math.random()}`,
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
  // Surfaces the most recent backend sync outcome (success or a real error
  // message) so failures are visible instead of vanishing into the console.
  const [syncStatus, setSyncStatus] = useState<{ collection: string; success: boolean; error?: string; timestamp: number } | null>(null);

  // Account CRUD Handlers
  const handleAddAccount = (acc: FinancialAccount) => {
    setAccounts((prev) => [acc, ...prev]);
  };

  const handleUpdateAccount = (acc: FinancialAccount) => {
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? acc : a)));
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
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
    if (cloudReady) {
      syncCategoriesToSupabase(categories).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'categories', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'categories', success: true, timestamp: Date.now() });
      });
    }
  }, [categories, cloudReady]);

  useEffect(() => {
    localStorage.setItem('tmf_accounts', JSON.stringify(accounts));
    if (cloudReady) {
      syncAccountsToSupabase(accounts).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'accounts', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'accounts', success: true, timestamp: Date.now() });
      });
    }
  }, [accounts, cloudReady]);

  useEffect(() => {
    localStorage.setItem('tmf_transactions', JSON.stringify(transactions));
    if (cloudReady) {
      syncTransactionsToSupabase(transactions).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'transactions', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'transactions', success: true, timestamp: Date.now() });
      });
    }
  }, [transactions, cloudReady]);

  useEffect(() => {
    localStorage.setItem('tmf_investments', JSON.stringify(investments));
    if (cloudReady) {
      syncInvestmentsToSupabase(investments).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'investments', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'investments', success: true, timestamp: Date.now() });
      });
    }
  }, [investments, cloudReady]);

  useEffect(() => {
    localStorage.setItem('tmf_loans', JSON.stringify(loans));
    if (cloudReady) {
      syncLoansToSupabase(loans).then((result) => {
        if (!result.success) setSyncStatus({ collection: 'loans', ...result, timestamp: Date.now() });
        else setSyncStatus({ collection: 'loans', success: true, timestamp: Date.now() });
      });
    }
  }, [loans, cloudReady]);

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
    try {
      const [cloudTx, cloudAcc, cloudCat, cloudInv, cloudLoans] = await Promise.all([
        fetchTransactionsFromSupabase(),
        fetchAccountsFromSupabase(),
        fetchCategoriesFromSupabase(),
        fetchInvestmentsFromSupabase(),
        fetchLoansFromSupabase(),
      ]);

      const savedSettings = localStorage.getItem('tmf_settings');
      const isSampleLoaded = savedSettings ? JSON.parse(savedSettings).sampleDataLoaded !== false : true;

      if (cloudTx) {
        const filteredTx = isSampleLoaded ? cloudTx : cloudTx.filter((t) => !SAMPLE_TRANSACTION_IDS.has(t.id));
        setTransactions(filteredTx);
      }
      if (cloudAcc) {
        const filteredAcc = isSampleLoaded ? cloudAcc : cloudAcc.filter((a) => !SAMPLE_ACCOUNT_IDS.has(a.id));
        setAccounts(filteredAcc);
      }
      if (cloudCat && cloudCat.length > 0) setCategories(cloudCat);
      if (cloudInv) {
        const filteredInv = isSampleLoaded ? cloudInv : cloudInv.filter((i) => !SAMPLE_INVESTMENT_IDS.has(i.id));
        setInvestments(filteredInv);
      }
      if (cloudLoans) {
        const filteredLoans = isSampleLoaded ? cloudLoans : cloudLoans.filter((l) => !SAMPLE_LOAN_IDS.has(l.id));
        setLoans(filteredLoans);
      }
    } catch (err) {
      console.warn('Cloud data fetch failed:', err);
    } finally {
      cloudLoadInFlightRef.current = false;
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
    setTransactions([]);
    setAccounts([]);
    setInvestments([]);
    setLoans([]);
    setCategories(INITIAL_CATEGORIES);
    setPendingNotifications([]);
    localStorage.removeItem('tmf_transactions');
    localStorage.removeItem('tmf_accounts');
    localStorage.removeItem('tmf_investments');
    localStorage.removeItem('tmf_loans');
    localStorage.removeItem('tmf_pending_notifications');
    sessionStorage.removeItem('tmf_session_unlocked');
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
    const stopListening = startNotificationListener((rawText) => {
      const { parsed, isDuplicate } = parseNotification(rawText, null, transactions, pendingNotifications);
      if (isDuplicate) return; // Silently drop duplicates

      setPendingNotifications((prev) => [parsed, ...prev]);
      if (settings.notificationsEnabled) {
        notifyTransactionDetected(parsed, settings.currencySymbol);
      }
    });
    return stopListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoExtractSms, settings.notificationsEnabled, settings.currencySymbol, transactions, pendingNotifications]);


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
    const target = methodOrName.toLowerCase().trim();
    let idx = accountsList.findIndex(
      (a) =>
        a.id === methodOrName ||
        a.name.toLowerCase() === target ||
        a.bankName.toLowerCase() === target ||
        a.type.toLowerCase() === target
    );
    if (idx === -1) {
      const defaultIdx = accountsList.findIndex((a) => a.isDefault);
      idx = defaultIdx !== -1 ? defaultIdx : 0;
    }
    if (idx === -1) return accountsList;

    const copy = [...accountsList];
    const acc = copy[idx];
    const newBal = Math.round((acc.balance + delta) * 100) / 100;
    copy[idx] = { ...acc, balance: newBal };
    return copy;
  };

  // Notification Handlers (The requested feature: ADD, EDIT, IGNORE)
  const handleConfirmAddNotification = (notif: ParsedNotification) => {
    const newTx: Transaction = {
      id: 'tx_notif_' + Date.now(),
      title: notif.payeeOrPayer,
      amount: notif.amount,
      type: notif.type,
      category: notif.category,
      subcategory: notif.subcategory,
      date: notif.date,
      time: notif.time,
      location: notif.location,
      source: 'UPI',
      payeeOrPayer: notif.payeeOrPayer,
      paymentMethod: notif.appSource,
      rawText: notif.rawText,
    };

    const delta = notif.type === 'credit' ? notif.amount : -notif.amount;
    setAccounts((prevAccs) => adjustAccountBalance(prevAccs, notif.appSource || notif.paymentMethod || 'UPI', delta));
    setTransactions((prev) => [newTx, ...prev]);
    setPendingNotifications((prev) => {
      const remaining = prev.filter((n) => n.id !== notif.id);
      if (remaining.length === 0) setIsNotificationModalOpen(false);
      return remaining;
    });
  };

  const handleConfirmEditNotification = (notif: ParsedNotification) => {
    // Open transaction editor with pre-filled details from notification
    setEditingTransaction({
      title: notif.payeeOrPayer,
      amount: notif.amount,
      type: notif.type,
      category: notif.category,
      subcategory: notif.subcategory,
      date: notif.date,
      time: notif.time,
      location: notif.location,
      source: 'UPI',
      payeeOrPayer: notif.payeeOrPayer,
      paymentMethod: notif.appSource,
      rawText: notif.rawText,
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
        setAccounts((prevAccs) => {
          let updated = adjustAccountBalance(prevAccs, oldTx.paymentMethod, revertDelta);
          updated = adjustAccountBalance(updated, tx.paymentMethod, newDelta);
          return updated;
        });

        const copy = [...prev];
        copy[idx] = tx;
        return copy;
      }

      // New Transaction
      const newDelta = tx.type === 'credit' ? tx.amount : -tx.amount;
      setAccounts((prevAccs) => adjustAccountBalance(prevAccs, tx.paymentMethod, newDelta));
      return [tx, ...prev];
    });
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => {
      const tx = prev.find((t) => t.id === id);
      if (tx) {
        const revertDelta = tx.type === 'credit' ? -tx.amount : tx.amount;
        setAccounts((prevAccs) => adjustAccountBalance(prevAccs, tx.paymentMethod, revertDelta));
      }
      return prev.filter((t) => t.id !== id);
    });
  };

  // Category Actions
  const handleAddCategory = (cat: Category) => {
    setCategories((prev) => [...prev, cat]);
  };

  const handleUpdateCategory = (cat: Category) => {
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
  };

  const handleDeleteCategory = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  // Investment Actions
  const handleAddInvestment = (inv: InvestmentRecord) => {
    setInvestments((prev) => [...prev, inv]);
  };

  const handleUpdateInvestment = (updatedInv: InvestmentRecord) => {
    setInvestments((prev) => prev.map((inv) => (inv.id === updatedInv.id ? updatedInv : inv)));
  };

  const handleDeleteInvestment = (id: string) => {
    setInvestments((prev) => prev.filter((inv) => inv.id !== id));
  };

  // Loan Actions
  const handleAddLoan = (loan: LoanRecord) => {
    setLoans((prev) => [...prev, loan]);
  };

  const handleRecordRepayment = (loanId: string, repayment: Repayment) => {
    setLoans((prev) =>
      prev.map((l) => {
        if (l.id !== loanId) return l;

        const newRemaining = Math.max(0, l.remainingAmount - repayment.amount);
        const newRepayments = [repayment, ...l.repayments];
        const newStatus = newRemaining === 0 ? 'repaid' : 'active';

        return {
          ...l,
          remainingAmount: newRemaining,
          status: newStatus,
          repayments: newRepayments,
        };
      })
    );
  };

  const handleSettleLoan = (loanId: string) => {
    setLoans((prev) =>
      prev.map((l) => (l.id === loanId ? { ...l, remainingAmount: 0, status: 'repaid' } : l))
    );
  };

  const handleDeleteLoan = (loanId: string) => {
    setLoans((prev) => prev.filter((l) => l.id !== loanId));
  };

  const handleUpdateLoan = (updatedLoan: LoanRecord) => {
    setLoans((prev) => prev.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)));
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
    downloadAnchor.setAttribute('download', `TMF_Backup_${new Date().toISOString().slice(0, 10)}.json`);
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
              <span className="font-mono font-black text-white text-lg tracking-wider">TMF</span>
            </div>
          </div>

          <div>
            <h1 className="text-sm font-bold tracking-[0.25em] text-white uppercase font-mono">
              Track Money Flow
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
          <h2 className="text-xl font-mono font-bold uppercase mb-1">TMF Passcode Lock</h2>
          <p className="text-xs text-[#777] font-mono mb-6">Enter your security PIN to access Track Money Flow</p>

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
          onOpenNotifications={() => setIsNotificationModalOpen(true)}
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
              pendingNotifications={pendingNotifications}
              onOpenNotifications={() => setIsNotificationModalOpen(true)}
              onOpenAddTransaction={() => handleOpenAddModal()}
              onQuickLogTransaction={(tx) => {
                handleSaveTransaction(tx);
                showToast(`Logged recurring payment for ${tx.title}`, 'success');
              }}
              onNavigateToTransactions={() => setActiveTab('transactions')}
              onNavigateToInvestments={() => setActiveTab('investments')}
              onNavigateToCustomisations={() => setActiveTab('customisations')}
              onTriggerBudgetAlert={(alert) => setActiveBudgetPushAlert(alert)}
              currencySymbol={settings.currencySymbol}
              defaultNetWorthMasked={settings.defaultNetWorthMasked}
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
              onAddInvestment={handleAddInvestment}
              onUpdateInvestment={handleUpdateInvestment}
              onDeleteInvestment={handleDeleteInvestment}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              currencySymbol={settings.currencySymbol}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'loans' && (
            <LoansView
              loans={loans}
              onAddLoan={handleAddLoan}
              onRecordRepayment={handleRecordRepayment}
              onSettleLoan={handleSettleLoan}
              onDeleteLoan={handleDeleteLoan}
              onUpdateLoan={handleUpdateLoan}
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

        {/* Mobile Bottom Navigation Bar */}
        <div className="lg:hidden border-t border-nothing bg-carbon px-2 py-2 flex items-center justify-around shrink-0 z-30">
          {[
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'transactions', label: 'Txns', icon: ReceiptText },
            { id: 'accounts', label: 'Accounts', icon: Building2 },
            { id: 'investments', label: 'Invest', icon: TrendingUp },
            { id: 'loans', label: 'Loans', icon: HandCoins },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl transition-all nav-lift cursor-pointer ${
                  isActive
                    ? 'text-red-500 font-bold -translate-y-1 scale-105 bg-red-950/20'
                    : 'text-[#666] hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-mono">{item.label}</span>
              </button>
            );
          })}
        </div>
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

      {/* 3. Simulator Widget for testing notifications */}
      {isSimulatorOpen && (
        <SmsSimulatorWidget
          transactions={transactions}
          pendingNotifications={pendingNotifications}
          onInterceptNotification={handleInterceptedFromSimulator}
          onClose={() => setIsSimulatorOpen(false)}
          currencySymbol={settings.currencySymbol}
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
        />
      )}
    </div>
  );
}
