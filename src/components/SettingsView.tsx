import React, { useState, useEffect, useMemo } from 'react';
import { UserSettings, Category, FinancialAccount, Transaction, InvestmentRecord, ConnectedDematAccount } from '../types/finance';
import { BackupRestoreData, parseBackupJson } from '../utils/backup';
import { isNativeAndroid, isNotificationAccessGranted, requestNotificationAccess } from '../services/notificationListener';
import { 
  Shield, 
  Download, 
  RefreshCw, 
  Palette, 
  Sliders, 
  Eye, 
  EyeOff, 
  Smartphone, 
  BellRing, 
  ChevronsUpDown, 
  MousePointerClick, 
  Sun, 
  Moon, 
  Trash2,
  Coins,
  Lock,
  Database,
  Building2,
  Link2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  PlusCircle,
  Sparkles,
  TrendingUp,
  Unlink,
  Layers,
  ArrowUpRight,
  Check,
  X
} from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';
import { InfoButton } from './InfoButton';
import { newId } from '../utils/ids';
import { formatMoney } from '../utils/money';
import { PasscodeSetupModal } from './PasscodeSetupModal';
import { requestPushNotificationPermission } from '../services/localNotifications';

interface SettingsViewProps {
  settings: UserSettings;
  categories: Category[];
  accounts?: FinancialAccount[];
  transactions?: Transaction[];
  investments?: InvestmentRecord[];
  onUpdateSettings: (newSettings: UserSettings) => void;
  onAddCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onAddAccount?: (acc: FinancialAccount) => void;
  onUpdateAccount?: (acc: FinancialAccount) => void;
  onDeleteAccount?: (id: string) => void;
  onExportBackupJSON: () => void;
  onRestoreBackupJSON: (backup: BackupRestoreData) => void;
  onResetAllData: () => void;
  onLoadSampleData?: () => void;
  onRemoveSampleData?: () => void;
  syncStatus?: { collection: string; success: boolean; error?: string; timestamp: number } | null;
  onForceSyncNow?: () => Promise<{ success: boolean; error?: string }>;
  isAuthenticated?: boolean;
  authUserEmail?: string | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  categories,
  accounts = [],
  transactions = [],
  investments = [],
  onUpdateSettings,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onExportBackupJSON,
  onRestoreBackupJSON,
  onResetAllData,
  onLoadSampleData,
  onRemoveSampleData,
  syncStatus,
  onForceSyncNow,
  isAuthenticated = false,
  authUserEmail = null,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'system' | 'personalisation'>('system');
  const [activeSystemSection, setActiveSystemSection] = useState<'general' | 'connections' | 'security' | 'data'>('general');
  const currencySymbol = settings.currencySymbol;

  // Security
  const passcodeEnabled = settings.passcodeEnabled;
  const [showPasscodeSetup, setShowPasscodeSetup] = useState(false);

  // UPI/SMS Interceptor & Notifications
  const { autoExtractSms, notificationsEnabled, locationTracking } = settings;
  const [notificationPermissionError, setNotificationPermissionError] = useState('');
  const [requestingNotificationPermission, setRequestingNotificationPermission] = useState(false);
  const latestSettingsRef = React.useRef(settings);
  latestSettingsRef.current = settings;
  const [notifAccessGranted, setNotifAccessGranted] = useState<boolean>(false);

  // Demat & Connected Accounts State
  const [syncingBrokerId, setSyncingBrokerId] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [editingDemat, setEditingDemat] = useState<ConnectedDematAccount | null>(null);

  // Manual portfolio form fields
  const [modalBrokerCode, setModalBrokerCode] = useState<string>('Zerodha');
  const [modalBrokerName, setModalBrokerName] = useState<string>('Zerodha Kite');
  const [modalPortfolioValue, setModalPortfolioValue] = useState<string>('0');
  const [modalPortfolioReturns, setModalPortfolioReturns] = useState<string>('0');
  const [modalHoldingCount, setModalHoldingCount] = useState<string>('0');
  const [modalValidationError, setModalValidationError] = useState<string>('');
  const backupFileInputRef = React.useRef<HTMLInputElement>(null);
  const [backupRestoreMessage, setBackupRestoreMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    isNotificationAccessGranted().then(setNotifAccessGranted);
  }, []);

  // Theme selection handler
  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    onUpdateSettings({
      ...settings,
      theme: newTheme,
    });
  };

  const handleBackupFileSelection = async (file?: File) => {
    if (!file) return;
    setBackupRestoreMessage(null);
    try {
      if (file.size > 25 * 1024 * 1024) {
        setBackupRestoreMessage('Backup file is too large. Maximum file size is 25 MB.');
        return;
      }
      const backup = parseBackupJson(await file.text());
      onRestoreBackupJSON(backup);
      setBackupRestoreMessage('Backup validated. Review the confirmation before replacing data.');
    } catch (error) {
      console.error('Could not validate backup file:', error);
      setBackupRestoreMessage(error instanceof Error ? error.message : 'Could not read this backup file.');
    } finally {
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    }
  };

  // Connected Demat Accounts list
  const dematAccounts: ConnectedDematAccount[] = useMemo(() => {
    return settings.connectedDematAccounts || [];
  }, [settings.connectedDematAccounts]);

  // Compute portfolio stats for a broker (combining live investments logged under this demat or fallback to mock)
  const getBrokerStats = (account: ConnectedDematAccount) => {
    const matching = (investments || []).filter(
      (inv) =>
        (inv.dematAccount && inv.dematAccount.toLowerCase() === account.brokerCode.toLowerCase()) ||
        (inv.dematAccount && inv.dematAccount.toLowerCase() === account.brokerName.toLowerCase()) ||
        (account.clientId && inv.brokerClientId === account.clientId)
    );

    if (matching.length > 0) {
      const val = matching.reduce((sum, inv) => sum + (inv.currentValue || 0), 0);
      const invAmt = matching.reduce((sum, inv) => sum + (inv.amountInvested || 0), 0);
      const ret = invAmt > 0 ? ((val - invAmt) / invAmt) * 100 : 0;
      return {
        value: val,
        invested: invAmt,
        returnsPercent: Math.round(ret * 10) / 10,
        holdingsCount: matching.length,
        isRealData: true,
      };
    }

    const val = account.mockPortfolioValue || 0;
    const ret = account.mockReturnsPercent || 0;
    const invAmt = ret !== -100 ? Math.round(val / (1 + ret / 100)) : val;
    return {
      value: val,
      invested: invAmt,
      returnsPercent: ret,
      holdingsCount: account.totalHoldingsCount || 0,
      isRealData: false,
    };
  };

  // Aggregated summary stats across all connected demat accounts
  const aggregatedStats = useMemo(() => {
    const active = dematAccounts.filter((a) => a.isConnected);
    let totalVal = 0;
    let totalInv = 0;
    let totalHoldings = 0;

    active.forEach((acc) => {
      const stats = getBrokerStats(acc);
      totalVal += stats.value;
      totalInv += stats.invested;
      totalHoldings += stats.holdingsCount;
    });

    const totalGainLoss = totalVal - totalInv;
    const totalGainLossPercent = totalInv > 0 ? (totalGainLoss / totalInv) * 100 : 0;

    return {
      totalVal,
      totalInv,
      totalGainLoss,
      totalGainLossPercent,
      totalHoldings,
      activeCount: active.length,
      activeBrokers: active,
    };
  }, [dematAccounts, investments]);

  // Actions for Demat Accounts
  const handleToggleConnect = (account: ConnectedDematAccount) => {
    const now = new Date().toISOString();
    const updated = dematAccounts.map((acc) => {
      if (acc.id === account.id) {
        const nextConnected = !acc.isConnected;
        return {
          ...acc,
          isConnected: nextConnected,
          connectedAt: nextConnected ? now : acc.connectedAt,
          mockPortfolioValue: acc.mockPortfolioValue || 0,
          mockReturnsPercent: acc.mockReturnsPercent || 0,
          totalHoldingsCount: acc.totalHoldingsCount || 0,
        };
      }
      return acc;
    });

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    const isNowConnected = !account.isConnected;
    setFeedbackMessage(
      isNowConnected
        ? `Resumed manual tracking for ${account.brokerName}.`
        : `Paused manual tracking for ${account.brokerName}.`
    );
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSyncBroker = (accountId: string) => {
    setSyncingBrokerId(accountId);
    const updated = dematAccounts.map((acc) => {
      if (acc.id === accountId) {
        return {
          ...acc,
          lastSyncedAt: new Date().toISOString(),
        };
      }
      return acc;
    });
    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });
    setSyncingBrokerId(null);
    setFeedbackMessage('Manual portfolio totals recalculated. No external data was fetched.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleSyncAll = () => {
    setIsSyncingAll(true);
    const now = new Date().toISOString();
    const updated = dematAccounts.map((acc) => {
      if (acc.isConnected) {
        return { ...acc, lastSyncedAt: now };
      }
      return acc;
    });
    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });
    setIsSyncingAll(false);
    setFeedbackMessage('Manual portfolio totals recalculated. No external data was fetched.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleOpenLinkModal = (existing?: ConnectedDematAccount) => {
    setModalValidationError('');
    if (existing) {
      setEditingDemat(existing);
      setModalBrokerCode(existing.brokerCode);
      setModalBrokerName(existing.brokerName);
      setModalPortfolioValue((existing.mockPortfolioValue || 0).toString());
      setModalPortfolioReturns((existing.mockReturnsPercent || 0).toString());
      setModalHoldingCount((existing.totalHoldingsCount || 0).toString());
    } else {
      setEditingDemat(null);
      setModalBrokerCode('Zerodha');
      setModalBrokerName('Zerodha Kite');
      setModalPortfolioValue('0');
      setModalPortfolioReturns('0');
      setModalHoldingCount('0');
    }
    setShowLinkModal(true);
  };

  const handleSaveLinkedAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(modalPortfolioValue);
    const ret = Number(modalPortfolioReturns);
    const holdings = Number(modalHoldingCount);
    if (!Number.isFinite(val) || val < 0) {
      setModalValidationError('Portfolio valuation must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(ret) || ret < -100) {
      setModalValidationError('Estimated return must be at least -100%.');
      return;
    }
    if (!Number.isInteger(holdings) || holdings < 0) {
      setModalValidationError('Holdings count must be a whole number of zero or more.');
      return;
    }
    const now = new Date().toISOString();

    const brokerColors: Record<string, string> = {
      Zerodha: '#387ed1',
      Dhan: '#6842ff',
      Groww: '#00d09c',
      Upstox: '#8833ff',
      'Angel One': '#0066ff',
      'ICICI Direct': '#e65100',
    };

    let updated: ConnectedDematAccount[];
    if (editingDemat) {
      updated = dematAccounts.map((acc) => {
        if (acc.id === editingDemat.id) {
          return {
            ...acc,
            brokerName: modalBrokerName,
            brokerCode: modalBrokerCode,
            mockPortfolioValue: val,
            mockReturnsPercent: ret,
            totalHoldingsCount: holdings,
            color: brokerColors[modalBrokerCode] || acc.color || '#387ed1',
          };
        }
        return acc;
      });
      setFeedbackMessage(`Updated portfolio details for ${modalBrokerName}.`);
    } else {
      const newAcc: ConnectedDematAccount = {
        id: newId('broker'),
        brokerName: modalBrokerName,
        brokerCode: modalBrokerCode,
        clientId: '',
        isConnected: true,
        connectedAt: now,
        mockPortfolioValue: val,
        mockReturnsPercent: ret,
        totalHoldingsCount: holdings,
        color: brokerColors[modalBrokerCode] || '#387ed1',
      };
      updated = [...dematAccounts, newAcc];
      setFeedbackMessage(`Added ${modalBrokerName} portfolio.`);
    }

    onUpdateSettings({
      ...settings,
      connectedDematAccounts: updated,
    });

    setShowLinkModal(false);
    setEditingDemat(null);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  return (
    <div className="space-y-6 pb-16 max-w-4xl font-mono">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#222] pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white tracking-tight uppercase">
            SETTINGS & PREFERENCES
          </h2>
          <InfoButton
            id="settings-header-info"
            title="Settings & Preferences"
            content="Browse General, Connections, Security, and Data & Backup settings, or open Personalisation for categories, budgets, and accounts."
            align="left"
          />
        </div>

        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-[#141418] border border-slate-200 dark:border-[#222] rounded-2xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('system')}
            className={`px-3.5 py-1.5 text-xs font-mono font-bold uppercase rounded-xl transition-all cursor-pointer ${
              activeSubTab === 'system'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            System & Security
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('personalisation')}
            className={`px-3.5 py-1.5 text-xs font-mono font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'personalisation'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Personalisation</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'personalisation' ? (
        <CustomisationsView
          categories={categories}
          accounts={accounts}
          transactions={transactions}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onAddAccount={onAddAccount}
          onUpdateAccount={onUpdateAccount}
          onDeleteAccount={onDeleteAccount}
          currencySymbol={settings.currencySymbol}
          syncStatus={syncStatus}
          onForceSyncNow={onForceSyncNow}
        />
      ) : (
        <div className="space-y-6">
          <div
            role="group"
            aria-label="Settings sections"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {([
              ['general', 'General'],
              ['connections', 'Connections'],
              ['security', 'Security'],
              ['data', 'Data & Backup'],
            ] as const).map(([section, label]) => (
              <button
                key={section}
                type="button"
                aria-pressed={activeSystemSection === section}
                onClick={() => setActiveSystemSection(section)}
                className={`shrink-0 rounded-xl border px-3.5 py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                  activeSystemSection === section
                    ? 'border-red-600 bg-red-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#2a2a34] dark:bg-[#141418] dark:text-[#aaa] dark:hover:bg-[#1c1c24]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ==================== 1. APPEARANCE & DISPLAY ==================== */}
          {activeSystemSection === 'general' && (
            <>
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Palette className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                Appearance & Display
              </h3>
            </div>

            {/* Theme Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Interface Theme</span>
                <span className="text-[9px] bg-red-600 text-white font-mono px-2 py-0.5 rounded-full uppercase font-bold">
                  {(settings.theme || 'dark').toUpperCase()}
                </span>
                <InfoButton
                  id="theme-toggle-info"
                  title="Interface Theme"
                  content="Switch between Obsidian Dark and Ceramic Light color schemes across all screens and widgets."
                  align="left"
                />
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-[#1e1e26] rounded-xl border border-slate-300/50 dark:border-[#333] shrink-0">
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    settings.theme === 'light'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    (settings.theme || 'dark') === 'dark'
                      ? 'bg-[#121218] text-white shadow-sm'
                      : 'text-slate-500 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            {/* Default Net Worth Masking */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Executive Summary Privacy</span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                  settings.defaultNetWorthMasked !== false 
                    ? 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' 
                    : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                }`}>
                  {settings.defaultNetWorthMasked !== false ? 'MASKED' : 'VISIBLE'}
                </span>
                <InfoButton
                  id="privacy-mask-info"
                  title="Net Worth Privacy"
                  content="Choose whether Net Worth and account balances on the dashboard start masked (••••) by default or displayed openly."
                  align="left"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const currentVal = settings.defaultNetWorthMasked !== false;
                  onUpdateSettings({
                    ...settings,
                    defaultNetWorthMasked: !currentVal,
                  });
                }}
                className={`px-3.5 py-1.5 border text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                  settings.defaultNetWorthMasked !== false
                    ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-100'
                    : 'bg-white dark:bg-[#1f1f1f] border-slate-300 dark:border-[#333] text-slate-800 dark:text-white hover:border-emerald-500'
                }`}
              >
                {settings.defaultNetWorthMasked !== false ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                    <span>MASKED</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>VISIBLE</span>
                  </>
                )}
              </button>
            </div>

            {/* Dashboard Sections Auto-Expand on Scroll */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Dashboard Section Expansion</span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                  settings.autoCollapseExpandOnScroll !== false 
                    ? 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' 
                    : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50'
                }`}>
                  {settings.autoCollapseExpandOnScroll !== false ? 'AUTO' : 'MANUAL'}
                </span>
                <InfoButton
                  id="section-expansion-info"
                  title="Scroll Auto-Expansion"
                  content="Automatically expand or collapse dashboard budget, upcoming bills, and trend sections as you scroll into view."
                  align="left"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const currentVal = settings.autoCollapseExpandOnScroll !== false;
                  onUpdateSettings({
                    ...settings,
                    autoCollapseExpandOnScroll: !currentVal,
                  });
                }}
                className={`px-3.5 py-1.5 border text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                  settings.autoCollapseExpandOnScroll !== false
                    ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-100'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100'
                }`}
              >
                {settings.autoCollapseExpandOnScroll !== false ? (
                  <>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                    <span>AUTO SCROLL</span>
                  </>
                ) : (
                  <>
                    <MousePointerClick className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>MANUAL</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ==================== 2. CURRENCY & REGIONAL ==================== */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Coins className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                Currency & Regional
              </h3>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Default Preferred Currency</span>
                  <InfoButton
                    id="currency-info"
                    title="Currency Symbol"
                    content="Applied across all balance totals, transactions, budget calculations, and financial reports."
                    align="left"
                  />
                </div>
                <span className="text-sm font-mono font-bold text-red-600 dark:text-red-400 px-2 py-0.5 bg-slate-200/80 dark:bg-[#222] rounded-lg">
                  {currencySymbol}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { symbol: '₹', code: 'INR', locale: ['en', 'IN'].join('-'), name: '₹ INR' },
                  { symbol: '$', code: 'USD', locale: 'en-US', name: '$ USD' },
                  { symbol: '€', code: 'EUR', locale: 'de-DE', name: '€ EUR' },
                  { symbol: '£', code: 'GBP', locale: 'en-GB', name: '£ GBP' },
                ].map((c) => (
                  <button
                    type="button"
                    key={c.symbol}
                    onClick={() => {
                      onUpdateSettings({
                        ...settings,
                        currencySymbol: c.symbol,
                        currencyCode: c.code,
                        locale: c.locale,
                      });
                    }}
                    className={`py-2 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      currencySymbol === c.symbol
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-white dark:bg-[#1a1a22] border border-slate-200 dark:border-[#2a2a34] text-slate-700 dark:text-[#aaa] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
            </>
          )}

          {/* ==================== 3. MANUAL BROKER PORTFOLIOS ==================== */}
          {activeSystemSection === 'connections' && (
            <>
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#222]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Manual Broker Portfolios</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                      {aggregatedStats.activeCount} TRACKED
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-[#888]">
                    Record portfolio valuations and estimated returns here. Live broker connections are coming soon.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <InfoButton
                  id="connected-demat-info"
                  title="Manual Broker Portfolios"
                  content="Manually record each brokerage portfolio's total valuation, estimated return, and holding count. Live broker connections are coming soon."
                  align="right"
                />
                <button
                  type="button"
                  onClick={() => handleOpenLinkModal()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Portfolio</span>
                </button>
              </div>
            </div>

            {/* Notification Feedback */}
            {feedbackMessage && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-mono">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{feedbackMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackMessage(null)}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* SUMMARY CARD: Aggregated External Portfolio Value */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-black p-5 sm:p-6 text-white shadow-lg space-y-4">
              <div className="absolute -right-8 -top-8 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -left-8 -bottom-8 w-44 h-44 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                    Aggregated Manual Portfolio Summary
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400">
                    {aggregatedStats.activeCount > 0
                      ? `${aggregatedStats.activeCount} Portfolio${aggregatedStats.activeCount > 1 ? 's' : ''} Tracked`
                      : 'No Portfolios Tracked'}
                  </span>
                  <button
                    type="button"
                    disabled={isSyncingAll || aggregatedStats.activeCount === 0}
                    onClick={handleSyncAll}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 text-emerald-400 ${isSyncingAll ? 'animate-spin' : ''}`} />
                    <span>{isSyncingAll ? 'Updating...' : 'Recalculate Totals'}</span>
                  </button>
                </div>
              </div>

              {/* Primary Portfolio Value Display */}
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                <div className="sm:col-span-2 space-y-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                    Total Portfolio Valuation
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white">
                      {formatMoney(aggregatedStats.totalVal, { symbol: currencySymbol, locale: settings?.locale })}
                    </div>
                    <div className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 ${
                      aggregatedStats.totalGainLoss >= 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      <TrendingUp className="w-3 h-3" />
                      <span>
                        {aggregatedStats.totalGainLoss >= 0 ? '+' : ''}
                        {formatMoney(Math.abs(aggregatedStats.totalGainLoss), { symbol: currencySymbol, locale: settings?.locale })}
                        {' '}
                        ({aggregatedStats.totalGainLossPercent >= 0 ? '+' : ''}{aggregatedStats.totalGainLossPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-white/10 sm:pl-4 pt-2 sm:pt-0">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Cost Basis:</span>
                    <span className="font-mono font-bold text-white">
                      {formatMoney(aggregatedStats.totalInv, { symbol: currencySymbol, locale: settings?.locale })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Holdings:</span>
                    <span className="font-mono font-bold text-white">
                      {aggregatedStats.totalHoldings} Assets
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-mono text-[10px] uppercase">Portfolios:</span>
                    <span className="font-mono font-bold text-emerald-400 truncate max-w-[120px]">
                      {aggregatedStats.activeBrokers.map(b => b.brokerCode).join(', ') || 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Portfolio Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#888]">
                <span className="uppercase text-[10px] font-bold tracking-wider">
                  Manual Portfolios ({dematAccounts.length})
                </span>
                <span className="text-[10px]">Live broker sync coming soon</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {dematAccounts.map((account) => {
                  const stats = getBrokerStats(account);
                  const isSyncing = syncingBrokerId === account.id;

                  return (
                    <div
                      key={account.id}
                      className={`p-4 rounded-xl border transition-all ${
                        account.isConnected
                          ? 'bg-slate-50 dark:bg-[#0e0e14] border-slate-200 dark:border-[#2a2a35] hover:border-emerald-500/40'
                          : 'bg-slate-100/50 dark:bg-[#121217]/50 border-dashed border-slate-300 dark:border-[#222] opacity-75 hover:opacity-100'
                      }`}
                    >
                      {/* Broker Header */}
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-200/80 dark:border-[#1a1a24]">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm"
                            style={{ backgroundColor: account.color || '#3b82f6' }}
                          >
                            {account.brokerCode.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                                {account.brokerName}
                              </span>
                              {account.isConnected && (
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-[#888]">
                              Status: <span className="font-bold text-slate-700 dark:text-slate-300">{account.isConnected ? 'Active' : 'Paused'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                            account.isConnected
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border-slate-300 dark:border-[#333]'
                          }`}
                        >
                          {account.isConnected ? 'TRACKING' : 'PAUSED'}
                        </span>
                      </div>

                      {/* Broker Value / Metrics */}
                      <div className="py-3 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono">
                            {stats.isRealData ? 'TRACKED INVESTMENT TOTAL' : 'MANUAL VALUATION'}
                          </div>
                          <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                            {formatMoney(stats.value, { symbol: currencySymbol, locale: settings?.locale })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-mono font-bold ${
                            stats.returnsPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                          }`}>
                            {stats.returnsPercent >= 0 ? '+' : ''}{stats.returnsPercent}%
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono">
                            {stats.holdingsCount} Holdings {stats.isRealData ? '(Investment records)' : '(Entered manually)'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 border-t border-slate-200/80 dark:border-[#1a1a24] flex items-center justify-between gap-2">
                        <div className="text-[9px] font-mono text-slate-400 truncate max-w-[120px]">
                          {account.lastSyncedAt ? `Updated ${new Date(account.lastSyncedAt).toLocaleDateString()}` : 'Manual valuation'}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {account.isConnected ? (
                            <>
                              <button
                                type="button"
                                disabled={isSyncing}
                                onClick={() => handleSyncBroker(account.id)}
                                className="px-2.5 py-1 bg-white dark:bg-[#1a1a24] hover:bg-slate-100 dark:hover:bg-[#252535] border border-slate-200 dark:border-[#333] text-slate-700 dark:text-[#ccc] hover:text-slate-900 dark:hover:text-white rounded-lg text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer"
                                title="Recalculate from saved manual values; no market or broker data is fetched"
                              >
                                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-500' : ''}`} />
                                <span>{isSyncing ? 'Updating...' : 'Recalculate'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenLinkModal(account)}
                                className="px-2 py-1 bg-white dark:bg-[#1a1a24] hover:bg-slate-100 dark:hover:bg-[#252535] border border-slate-200 dark:border-[#333] text-slate-700 dark:text-[#ccc] hover:text-slate-900 dark:hover:text-white rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                                title="Edit the manually tracked portfolio snapshot"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleConnect(account)}
                                className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                title="Pause manual tracking"
                              >
                                Unlink
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleConnect(account)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                            >
                              <Link2 className="w-3 h-3" />
                              <span>Resume Tracking</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ==================== 4. UPI & SMS NOTIFICATION INTERCEPTOR ==================== */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Smartphone className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                UPI &amp; SMS Interceptor
              </h3>
            </div>

            {isNativeAndroid() ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Notification Access</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                    notifAccessGranted 
                      ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' 
                      : 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50'
                  }`}>
                    {notifAccessGranted ? 'GRANTED' : 'NOT GRANTED'}
                  </span>
                  <InfoButton
                    id="notif-access-info"
                    title="Notification Access"
                    content="Required by the Android system service to parse incoming bank and UPI alerts in real time without manual entry."
                    align="left"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await requestNotificationAccess();
                    setTimeout(() => isNotificationAccessGranted().then(setNotifAccessGranted), 1000);
                  }}
                  className="px-3.5 py-1.5 bg-white dark:bg-[#1f1f1f] border border-slate-300 dark:border-[#333] hover:border-red-500 text-xs font-mono font-bold text-slate-800 dark:text-white rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0"
                >
                  <BellRing className="w-3.5 h-3.5 text-red-500" />
                  <span>{notifAccessGranted ? 'REVIEW' : 'GRANT ACCESS'}</span>
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl flex items-center justify-between gap-3">
                <span className="text-xs text-slate-700 dark:text-[#ccc] font-mono">On-device notification parsing active in Android APK</span>
                <InfoButton
                  id="web-interceptor-info"
                  title="SMS Interceptor"
                  content="Real-time on-device notification interception runs in the Android APK. On the web preview, you can test SMS parsing using the SMS Simulator on the Dashboard."
                  align="right"
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Auto-Extract From Notifications</span>
                <InfoButton
                  id="auto-extract-info"
                  title="Auto-Extraction"
                  content="Automatically detect and extract amounts, merchants, categories, and payment modes from bank transaction SMS."
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = !autoExtractSms;
                  onUpdateSettings({ ...settings, autoExtractSms: updated });
                }}
                className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 ${
                  autoExtractSms 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border border-slate-300 dark:border-[#333]'
                }`}
              >
                {autoExtractSms ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">"Add Transaction?" Push Alerts</span>
                <InfoButton
                  id="push-alerts-info"
                  title="Instant Alerts"
                  content="Post a notification the moment an unlogged debit or credit is detected so you can approve it with one tap."
                  align="left"
                />
              </div>
              <button
                type="button"
                disabled={requestingNotificationPermission}
                onClick={async () => {
                  setNotificationPermissionError('');
                  if (notificationsEnabled) {
                    onUpdateSettings({ ...settings, notificationsEnabled: false });
                    return;
                  }
                  setRequestingNotificationPermission(true);
                  try {
                    const granted = await requestPushNotificationPermission();
                    if (!granted) {
                      setNotificationPermissionError('Notification permission was not granted. Allow notifications in your browser or device settings.');
                      return;
                    }
                    onUpdateSettings({ ...latestSettingsRef.current, notificationsEnabled: true });
                  } catch (error) {
                    console.warn('Could not request notification permission:', error);
                    setNotificationPermissionError('Could not request notification permission. Please try again.');
                  } finally {
                    setRequestingNotificationPermission(false);
                  }
                }}
                className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 ${
                  notificationsEnabled 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border border-slate-300 dark:border-[#333]'
                }`}
              >
                {notificationsEnabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            {notificationPermissionError && <p role="alert" className="text-xs text-red-400">{notificationPermissionError}</p>}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Location Tagging</span>
                <InfoButton
                  id="location-tagging-info"
                  title="Location Tagging"
                  content="Capture real GPS coordinates and reverse-geocode place names when recording transactions or intercepting notifications."
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = !locationTracking;
                  onUpdateSettings({ ...settings, locationTracking: updated });
                }}
                className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 ${
                  locationTracking 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border border-slate-300 dark:border-[#333]'
                }`}
              >
                {locationTracking ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
          </div>
            </>
          )}

          {/* ==================== 4. SECURITY & PASSCODE ==================== */}
          {activeSystemSection === 'security' && (
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Lock className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                Security &amp; Passcode
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">App Lock Passcode</span>
                <InfoButton
                  id="app-lock-info"
                  title="App Passcode Lock"
                  content="Require a 4 to 6-digit numeric PIN every time MTracker launches to protect your financial confidentiality."
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (passcodeEnabled) {
                    onUpdateSettings({ ...settings, passcodeEnabled: false });
                  } else {
                    setShowPasscodeSetup(true);
                  }
                }}
                className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0 ${
                  passcodeEnabled 
                    ? 'bg-red-600 text-white' 
                    : 'bg-slate-200 dark:bg-[#1f1f26] text-slate-600 dark:text-[#777] border border-slate-300 dark:border-[#333]'
                }`}
              >
                {passcodeEnabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            {passcodeEnabled && (
              <button type="button" onClick={() => setShowPasscodeSetup(true)}
                className="px-4 py-2 bg-red-600 text-white font-mono text-xs rounded-xl">
                Change PIN
              </button>
            )}
            {showPasscodeSetup && (
              <PasscodeSetupModal onClose={() => setShowPasscodeSetup(false)} onSave={credentials => {
                onUpdateSettings({ ...settings, ...credentials, passcodeEnabled: true });
                setShowPasscodeSetup(false);
              }} />
            )}
          </div>
          )}

          {/* ==================== 5. DATA MANAGEMENT & BACKUP ==================== */}
          {activeSystemSection === 'data' && (
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#222]">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-red-500" />
                <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                  Data Management &amp; Backup
                </h3>
              </div>
              <span className="text-[9px] font-mono font-bold text-slate-400 dark:text-[#666] uppercase tracking-widest">
                LOCAL &amp; EXPORT
              </span>
            </div>

            {/* JSON Backup Export */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Full Financial Data Backup (JSON)</span>
                <InfoButton
                  id="backup-export-info"
                  title="JSON Backup"
                  content="Export all transactions, investments, categories, accounts, and system preferences to a downloadable JSON file."
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={onExportBackupJSON}
                className="px-4 py-2 bg-white dark:bg-[#1f1f1f] border border-slate-300 dark:border-[#333] hover:border-red-500 text-xs font-mono font-bold text-slate-800 dark:text-white rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
              >
                <Download className="w-3.5 h-3.5 text-red-500" />
                <span>Export Backup JSON</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Restore From JSON Backup</span>
                <InfoButton
                  id="backup-restore-info"
                  title="Restore JSON Backup"
                  content="Validate a previously exported MTracker JSON backup, review the record counts, then confirm to replace the current records."
                  align="left"
                />
              </div>
              <input
                ref={backupFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                aria-label="Select MTracker JSON backup"
                onChange={(event) => {
                  void handleBackupFileSelection(event.target.files?.[0]);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setBackupRestoreMessage(null);
                  backupFileInputRef.current?.click();
                }}
                className="px-4 py-2 bg-white dark:bg-[#1f1f1f] border border-slate-300 dark:border-[#333] hover:border-amber-500 text-xs font-mono font-bold text-slate-800 dark:text-white rounded-xl transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Choose Backup to Restore</span>
              </button>
            </div>
            {backupRestoreMessage && (
              <p role="status" className="text-xs text-slate-700 dark:text-slate-300" aria-live="polite">
                {backupRestoreMessage}
              </p>
            )}

            {/* Sample Demo Data Controls */}
            <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">Sample Demo Data</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-mono uppercase border ${
                    settings.sampleDataLoaded !== false
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/80'
                      : 'bg-slate-200 dark:bg-zinc-800/90 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700/80'
                  }`}>
                    {settings.sampleDataLoaded !== false ? 'LOADED' : 'REMOVED'}
                  </span>
                  <InfoButton
                    id="demo-data-info"
                    title="Sample Records"
                    content="Toggle initial sample records. When removed, demo records won't re-seed on restart."
                    align="left"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-[#1e1e1e]">
                {onLoadSampleData && (
                  <button
                    type="button"
                    onClick={onLoadSampleData}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer bg-transparent border-none p-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Re-Load Sample Data</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const isCurrentlyLoaded = settings.sampleDataLoaded !== false;
                    if (isCurrentlyLoaded && onRemoveSampleData) {
                      onRemoveSampleData();
                    } else if (!isCurrentlyLoaded && onLoadSampleData) {
                      onLoadSampleData();
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.sampleDataLoaded !== false ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'
                  }`}
                  title={settings.sampleDataLoaded !== false ? 'Click to Remove Sample Data' : 'Click to Load Sample Data'}
                >
                  <span className="sr-only">Toggle Sample Data</span>
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.sampleDataLoaded !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Total Reset Data */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-red-50/50 dark:bg-[#1a0f12] border border-red-200 dark:border-red-950/80 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">Clear All Financial Records</span>
                <InfoButton
                  id="wipe-data-info"
                  title="Wipe All Data"
                  content="Permanently wipe all local and cloud accounts, transactions, investments, and loans."
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={onResetAllData}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shrink-0 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset All Data</span>
              </button>
            </div>
          </div>
          )}
        </div>
      )}

      {/* Manual Portfolio Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#121217] border border-[#2a2a34] p-5 sm:p-6 rounded-3xl max-w-md w-full shadow-2xl relative max-h-[92vh] overflow-y-auto space-y-4 text-white font-mono">
            <div className="flex justify-between items-center pb-3 border-b border-[#222]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-950/70 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase">
                    {editingDemat ? 'Edit Manual Portfolio' : 'Add Manual Portfolio'}
                  </h3>
                  <p className="text-[10px] text-[#888]">
                    Record a snapshot now; live broker connections are coming soon.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  setEditingDemat(null);
                }}
                className="text-[#666] hover:text-white p-1 rounded-lg bg-[#181820]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLinkedAccount} className="space-y-3.5">
              {/* Select Portfolio Provider */}
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                  Brokerage / Portfolio Name
                </label>
                <select
                  value={modalBrokerCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setModalBrokerCode(code);
                    const brokerNames: Record<string, string> = {
                      Zerodha: 'Zerodha Kite',
                      Dhan: 'Dhan HQ',
                      Groww: 'Groww Direct',
                      Upstox: 'Upstox Pro',
                      'Angel One': 'Angel One',
                      'ICICI Direct': 'ICICI Direct',
                    };
                    setModalBrokerName(brokerNames[code] || code);
                  }}
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Zerodha">Zerodha</option>
                  <option value="Dhan">Dhan</option>
                  <option value="Groww">Groww</option>
                  <option value="Upstox">Upstox</option>
                  <option value="Angel One">Angel One</option>
                  <option value="ICICI Direct">ICICI Direct</option>
                </select>
              </div>

              {/* Manual Portfolio Snapshot */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Portfolio Value ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={modalPortfolioValue}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalPortfolioValue(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Estimated Returns (%)
                  </label>
                  <input
                    type="number"
                    min="-100"
                    step="any"
                    required
                    value={modalPortfolioReturns}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalPortfolioReturns(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
                    Number of Holdings
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={modalHoldingCount}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    onChange={(e) => {
                      setModalHoldingCount(e.target.value);
                      setModalValidationError('');
                    }}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {modalValidationError && (
                <p role="alert" className="text-xs text-red-400">{modalValidationError}</p>
              )}

              {/* Manual Tracking Note */}
              <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl flex items-start gap-2.5 text-[10px] text-emerald-300">
                <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Values are entered manually and stored in app settings. No broker account access or price feed is connected.
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkModal(false);
                    setEditingDemat(null);
                  }}
                  className="flex-1 py-2.5 bg-[#181820] hover:bg-[#252530] text-[#aaa] hover:text-white rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingDemat ? 'Save Portfolio' : 'Add Portfolio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
