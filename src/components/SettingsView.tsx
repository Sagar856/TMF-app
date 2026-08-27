import React, { useState, useEffect } from 'react';
import { UserSettings, Category, FinancialAccount, Transaction } from '../types/finance';
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
  Database
} from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';

interface SettingsViewProps {
  settings: UserSettings;
  categories: Category[];
  accounts?: FinancialAccount[];
  transactions?: Transaction[];
  onUpdateSettings: (newSettings: UserSettings) => void;
  onAddCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onAddAccount?: (acc: FinancialAccount) => void;
  onUpdateAccount?: (acc: FinancialAccount) => void;
  onDeleteAccount?: (id: string) => void;
  onExportBackupJSON: () => void;
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
  onUpdateSettings,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onExportBackupJSON,
  onResetAllData,
  onLoadSampleData,
  onRemoveSampleData,
  syncStatus,
  onForceSyncNow,
  isAuthenticated = false,
  authUserEmail = null,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'system' | 'personalisation'>('system');
  const [currencySymbol, setCurrencySymbol] = useState<string>(settings?.currencySymbol || '₹');

  // Security
  const [passcodeEnabled, setPasscodeEnabled] = useState<boolean>(Boolean(settings?.passcodeEnabled));
  const [passcode, setPasscode] = useState<string>(settings?.passcode || '1234');

  // UPI/SMS Interceptor & Notifications
  const [autoExtractSms, setAutoExtractSms] = useState<boolean>(settings?.autoExtractSms ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(settings?.notificationsEnabled ?? true);
  const [notifAccessGranted, setNotifAccessGranted] = useState<boolean>(false);

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

  return (
    <div className="space-y-6 pb-16 max-w-4xl font-mono">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#222] pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold font-mono text-slate-900 dark:text-white tracking-tight uppercase">
            SETTINGS & PREFERENCES
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#888] font-mono mt-0.5">
            System configuration, theme, security, categories, budgets and accounts
          </p>
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
          {/* ==================== 1. APPEARANCE & DISPLAY ==================== */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Palette className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                Appearance & Display
              </h3>
            </div>

            {/* Theme Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Interface Theme</span>
                  <span className="text-[9px] bg-red-600 text-white font-mono px-2 py-0.5 rounded-full uppercase font-bold">
                    {(settings.theme || 'dark').toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">
                  Switch between Obsidian Dark and Ceramic Light color schemes
                </div>
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
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Executive Summary Privacy</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                    settings.defaultNetWorthMasked !== false 
                      ? 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' 
                      : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                  }`}>
                    {settings.defaultNetWorthMasked !== false ? 'MASKED BY DEFAULT' : 'VISIBLE BY DEFAULT'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">
                  Choose whether Net Worth on the dashboard starts masked (••••) or visible
                </div>
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
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Dashboard Section Expansion</span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                    settings.autoCollapseExpandOnScroll !== false 
                      ? 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' 
                      : 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50'
                  }`}>
                    {settings.autoCollapseExpandOnScroll !== false ? 'AUTO ON SCROLL' : 'MANUAL ON CLICK'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">
                  Auto-expand & collapse budget, bills & trend sections as you scroll, or keep them manual
                </div>
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
                <div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">Default Preferred Currency</div>
                  <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono">Applied to all transaction calculations and summaries</div>
                </div>
                <span className="text-sm font-mono font-bold text-red-600 dark:text-red-400 px-2 py-0.5 bg-slate-200/80 dark:bg-[#222] rounded-lg">
                  {currencySymbol}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {[
                  { symbol: '₹', name: '₹ INR' },
                  { symbol: '$', name: '$ USD' },
                  { symbol: '€', name: '€ EUR' },
                  { symbol: '£', name: '£ GBP' },
                ].map((c) => (
                  <button
                    type="button"
                    key={c.symbol}
                    onClick={() => {
                      setCurrencySymbol(c.symbol);
                      onUpdateSettings({ ...settings, currencySymbol: c.symbol });
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

          {/* ==================== 3. UPI & SMS NOTIFICATION INTERCEPTOR ==================== */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Smartphone className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                UPI &amp; SMS Interceptor
              </h3>
            </div>

            {isNativeAndroid() ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
                <div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Notification Access</span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                      notifAccessGranted 
                        ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' 
                        : 'bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50'
                    }`}>
                      {notifAccessGranted ? 'GRANTED' : 'NOT GRANTED'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">
                    Required to parse incoming bank and UPI notifications in real time
                  </div>
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
              <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl text-xs text-slate-600 dark:text-[#888] font-mono">
                Real-time on-device notification interception runs in the Android APK. On the web preview, you can test SMS parsing using the SMS Simulator on the Dashboard.
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">Auto-Extract From Notifications</div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">Automatically parse detected bank/UPI transaction notifications</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = !autoExtractSms;
                  setAutoExtractSms(updated);
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
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">"Add Transaction?" Push Alerts</div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">Post a native notification the moment an unlogged debit or credit is detected</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = !notificationsEnabled;
                  setNotificationsEnabled(updated);
                  onUpdateSettings({ ...settings, notificationsEnabled: updated });
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
          </div>

          {/* ==================== 4. SECURITY & PASSCODE ==================== */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-[#222]">
              <Lock className="w-4 h-4 text-red-500" />
              <h3 className="text-xs sm:text-sm font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                Security &amp; Passcode
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl">
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">App Lock Passcode</div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">Require a PIN every time the app opens</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = !passcodeEnabled;
                  setPasscodeEnabled(updated);
                  onUpdateSettings({ ...settings, passcodeEnabled: updated, passcode });
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
              <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl space-y-2.5">
                <label className="block text-[10px] text-slate-500 dark:text-[#888] uppercase tracking-wider font-mono font-bold">
                  Set Your Passcode (4-6 digits)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter new PIN"
                    className="flex-1 px-3 py-2 bg-white dark:bg-[#181820] border border-slate-200 dark:border-[#333] rounded-xl text-xs font-mono tracking-[0.3em] text-slate-900 dark:text-white focus:outline-none focus:border-red-600"
                  />
                  <button
                    type="button"
                    disabled={passcode.length < 4}
                    onClick={() => onUpdateSettings({ ...settings, passcodeEnabled, passcode })}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase rounded-xl transition-colors disabled:opacity-40 cursor-pointer shadow-sm"
                  >
                    Save PIN
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#666] font-mono">
                  Enter a 4-6 digit numeric passcode to protect your data.
                </div>
              </div>
            )}
          </div>

          {/* ==================== 5. DATA MANAGEMENT & BACKUP ==================== */}
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
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">Full Financial Data Backup (JSON)</div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">Export all transactions, investments, categories, loans, and settings to a JSON file</div>
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

            {/* Sample Demo Data Controls */}
            <div className="p-3.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] rounded-xl space-y-3">
              <div>
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Sample Demo Data</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold font-mono uppercase border ${
                    settings.sampleDataLoaded !== false
                      ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/80'
                      : 'bg-slate-200 dark:bg-zinc-800/90 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700/80'
                  }`}>
                    {settings.sampleDataLoaded !== false ? 'LOADED' : 'REMOVED'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">
                  Toggle initial demo records. When removed, demo records won't re-seed on restart.
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
              <div>
                <div className="text-xs font-mono font-bold text-red-600 dark:text-red-400">Clear All Financial Records</div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] font-mono mt-0.5">Wipe all local and synced accounts, transactions, investments, and loans completely</div>
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
        </div>
      )}
    </div>
  );
};
