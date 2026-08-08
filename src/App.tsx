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
  INITIAL_ACCOUNTS
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
} from './services/supabaseClient';

import { parseSmsNotification } from './services/smsParser';
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
    if (saved) return JSON.parse(saved);
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
    };
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem('tmf_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [accounts, setAccounts] = useState<FinancialAccount[]>(() => {
    const saved = localStorage.getItem('tmf_accounts');
    return saved ? JSON.parse(saved) : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('tmf_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [investments, setInvestments] = useState<InvestmentRecord[]>(() => {
    const saved = localStorage.getItem('tmf_investments');
    return saved ? JSON.parse(saved) : [];
  });

  const [loans, setLoans] = useState<LoanRecord[]>(() => {
    const saved = localStorage.getItem('tmf_loans');
    return saved ? JSON.parse(saved) : [];
  });

  // Pending SMS / UPI Intercepted Notifications Queue
  const [pendingNotifications, setPendingNotifications] = useState<ParsedNotification[]>(() => {
    const saved = localStorage.getItem('tmf_pending_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Modals & UI States
  const mainScrollRef = useRef<HTMLElement>(null);
  const [isAppLoading, setIsAppLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => {
    const savedSession = localStorage.getItem('tmf_auth_session');
    const savedSettings = localStorage.getItem('tmf_settings');
    return !savedSession && !savedSettings;
  });
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Partial<Transaction> | null>(null);
  const [modalInitialCategoryType, setModalInitialCategoryType] = useState<CategoryType>('Expense');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(!settings.passcodeEnabled);
  const [inputPasscode, setInputPasscode] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<boolean>(false);
  const [passcodeAttempts, setPasscodeAttempts] = useState<number>(0);
  const [passcodeLockedUntil, setPasscodeLockedUntil] = useState<number>(0);
  const [passcodeLockRemaining, setPasscodeLockRemaining] = useState<number>(0);
  // Guards against duplicate concurrent cloud-data fetches (initial mount + auth success can both fire)
  const cloudLoadInFlightRef = useRef<boolean>(false);

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

  useEffect(() => {
    localStorage.setItem('tmf_categories', JSON.stringify(categories));
    if (settings.supabaseConnected) {
      syncCategoriesToSupabase(categories);
    }
  }, [categories, settings.supabaseConnected]);

  useEffect(() => {
    localStorage.setItem('tmf_accounts', JSON.stringify(accounts));
    if (settings.supabaseConnected) {
      syncAccountsToSupabase(accounts);
    }
  }, [accounts, settings.supabaseConnected]);

  useEffect(() => {
    localStorage.setItem('tmf_transactions', JSON.stringify(transactions));
    if (settings.supabaseConnected) {
      syncTransactionsToSupabase(transactions);
    }
  }, [transactions, settings.supabaseConnected]);

  useEffect(() => {
    localStorage.setItem('tmf_investments', JSON.stringify(investments));
    if (settings.supabaseConnected) {
      syncInvestmentsToSupabase(investments);
    }
  }, [investments, settings.supabaseConnected]);

  useEffect(() => {
    localStorage.setItem('tmf_loans', JSON.stringify(loans));
    if (settings.supabaseConnected) {
      syncLoansToSupabase(loans);
    }
  }, [loans, settings.supabaseConnected]);

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

      if (cloudTx && cloudTx.length > 0) setTransactions(cloudTx);
      if (cloudAcc && cloudAcc.length > 0) setAccounts(cloudAcc);
      if (cloudCat && cloudCat.length > 0) setCategories(cloudCat);
      if (cloudInv && cloudInv.length > 0) setInvestments(cloudInv);
      if (cloudLoans && cloudLoans.length > 0) setLoans(cloudLoans);
    } catch (err) {
      console.warn('Cloud data fetch failed:', err);
    } finally {
      cloudLoadInFlightRef.current = false;
    }
  };

  // Initial Supabase Data Fetch on launch if Supabase is connected
  useEffect(() => {
    if (!settings.supabaseConnected) return;
    loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.supabaseConnected]);

  // Listen for Supabase password-recovery redirects and real-time auth state.
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsAuthModalOpen(true);
      }
    });
    return unsubscribe;
  }, []);

  // Native Android notification listener: when the OS receives a new bank/UPI
  // notification, the native plugin captures its text and forwards it here so
  // it can be parsed exactly like the SMS simulator, then queued for review.
  useEffect(() => {
    if (!settings.autoExtractSms) return;
    const stopListening = startNotificationListener((rawText) => {
      const parsed = parseSmsNotification(rawText, null);
      setPendingNotifications((prev) => [parsed, ...prev]);
      if (settings.notificationsEnabled) {
        notifyTransactionDetected(parsed, settings.currencySymbol);
      }
    });
    return stopListening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoExtractSms, settings.notificationsEnabled, settings.currencySymbol]);

  // Passcode lockout cooldown ticker
  useEffect(() => {
    if (!passcodeLockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((passcodeLockedUntil - Date.now()) / 1000));
      setPasscodeLockRemaining(remaining);
      if (remaining <= 0) {
        setPasscodeLockedUntil(0);
        setPasscodeAttempts(0);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [passcodeLockedUntil]);

  useEffect(() => {
    localStorage.setItem('tmf_pending_notifications', JSON.stringify(pendingNotifications));
  }, [pendingNotifications]);

  // Passcode verification with brute-force lockout protection
  const handlePasscodeUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcodeLockedUntil > Date.now()) return;

    if (inputPasscode === settings.passcode) {
      setIsUnlocked(true);
      setPasscodeError(false);
      setPasscodeAttempts(0);
      setInputPasscode('');
    } else {
      const nextAttempts = passcodeAttempts + 1;
      setPasscodeAttempts(nextAttempts);
      setPasscodeError(true);
      setInputPasscode('');
      if (nextAttempts >= MAX_PASSCODE_ATTEMPTS) {
        setPasscodeLockedUntil(Date.now() + PASSCODE_LOCKOUT_MS);
      }
    }
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
        const copy = [...prev];
        copy[idx] = tx;
        return copy;
      }
      return [tx, ...prev];
    });
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
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

  // Auth & Data Handlers
  const handleAuthSuccess = async (user: { name: string; emailOrPhone: string }) => {
    const updatedSettings = {
      ...settings,
      userName: user.name,
      userEmail: user.emailOrPhone,
    };
    setSettings(updatedSettings);
    localStorage.setItem('tmf_settings', JSON.stringify(updatedSettings));
    localStorage.setItem('tmf_auth_session', JSON.stringify({ name: user.name, email: user.emailOrPhone }));
    setIsAuthModalOpen(false);

    // If Supabase is connected, load user's data (shared/guarded loader, see loadCloudData above)
    if (settings.supabaseConnected) {
      await loadCloudData();
    }
  };

  const handleLoadDemoData = () => {
    setAccounts(INITIAL_ACCOUNTS);
    setTransactions(INITIAL_TRANSACTIONS);
    setInvestments(INITIAL_INVESTMENTS);
    setLoans(INITIAL_LOANS);
    setCategories(INITIAL_CATEGORIES);
    alert('Sample demo data loaded successfully!');
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
  };

  const handleResetAllData = () => {
    if (window.confirm('Are you sure you want to clear all data? All local records will be deleted.')) {
      localStorage.removeItem('tmf_transactions');
      localStorage.removeItem('tmf_accounts');
      localStorage.removeItem('tmf_investments');
      localStorage.removeItem('tmf_loans');
      localStorage.removeItem('tmf_pending_notifications');
      setTransactions([]);
      setAccounts([]);
      setInvestments([]);
      setLoans([]);
      setPendingNotifications([]);
      alert('All local financial records cleared!');
    }
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

  // Security Passcode Lock Screen
  if (settings.passcodeEnabled && !isUnlocked) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="bg-carbon border border-nothing p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
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
        </div>
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
          supabaseConnected={settings.supabaseConnected}
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
          onOpenAuth={() => setIsAuthModalOpen(true)}
          currencySymbol={settings.currencySymbol}
          theme={settings.theme || 'dark'}
          onToggleTheme={handleToggleTheme}
        />

        {/* Scrollable View Content */}
        <main ref={mainScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          {activeTab === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              categories={categories}
              investments={investments}
              loans={loans}
              pendingNotifications={pendingNotifications}
              onOpenNotifications={() => setIsNotificationModalOpen(true)}
              onOpenAddTransaction={() => handleOpenAddModal()}
              onNavigateToTransactions={() => setActiveTab('transactions')}
              onNavigateToInvestments={() => setActiveTab('investments')}
              currencySymbol={settings.currencySymbol}
              defaultNetWorthMasked={settings.defaultNetWorthMasked}
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
              onAddInvestment={handleAddInvestment}
              currencySymbol={settings.currencySymbol}
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
            />
          )}

          {activeTab === 'customisations' && (
            <CustomisationsView
              categories={categories}
              accounts={accounts}
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
              onUpdateSettings={setSettings}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
              onAddAccount={handleAddAccount}
              onUpdateAccount={handleUpdateAccount}
              onDeleteAccount={handleDeleteAccount}
              onExportBackupJSON={handleExportBackupJSON}
              onResetAllData={handleResetAllData}
              onLoadSampleData={handleLoadDemoData}
            />
          )}
        </main>

        {/* Global Floating Action Button for Home, Txns, Invest, Loans */}
        <FloatingActionButton
          onClick={() => handleOpenAddModal()}
          scrollContainerRef={mainScrollRef}
          visible={['dashboard', 'transactions', 'investments', 'loans'].includes(activeTab)}
        />

        {/* Mobile Bottom Navigation Bar */}
        <div className="lg:hidden border-t border-nothing bg-carbon px-2 py-2 flex items-center justify-around shrink-0">
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
                className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'text-red-500 font-bold' : 'text-[#666]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-mono">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Modals */}

      {/* 1. User Profile Modal */}
      {isProfileModalOpen && (
        <UserProfileModal
          settings={settings}
          accounts={accounts}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdateSettings={setSettings}
          onExportData={handleExportBackupJSON}
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
      {/* 5. Auth Modal (Sign In / Register) */}
      {isAuthModalOpen && (
        <AuthModal
          initialMode="register"
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
          settings={settings}
        />
      )}
    </div>
  );
}
