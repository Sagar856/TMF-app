import React, { useState, useEffect } from 'react';
import { UserSettings, Category, FinancialAccount } from '../types/finance';
import { isCloudBackendConfigured, getAuthRedirectUrl } from '../services/supabaseClient';
import { isNativeAndroid, isNotificationAccessGranted, requestNotificationAccess } from '../services/notificationListener';
import { User, Shield, Database, Download, RefreshCw, Key, MapPin, Check, AlertCircle, Trash2, Sun, Moon, Palette, Sliders, Eye, EyeOff, Smartphone, BellRing, Copy } from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';

interface SettingsViewProps {
  settings: UserSettings;
  categories: Category[];
  accounts?: FinancialAccount[];
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
  const [activeSubTab, setActiveSubTab] = useState<'system' | 'customisations'>('system');
  const [userName, setUserName] = useState<string>(settings?.userName || 'sgrnboff');
  const [userEmail, setUserEmail] = useState<string>(settings?.userEmail || 'sgrnboff@gmail.com');
  const [currencySymbol, setCurrencySymbol] = useState<string>(settings?.currencySymbol || '₹');
  const [isForceSyncing, setIsForceSyncing] = useState<boolean>(false);
  const [forceSyncResult, setForceSyncResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [redirectUrlCopied, setRedirectUrlCopied] = useState<boolean>(false);

  // Security
  const [passcodeEnabled, setPasscodeEnabled] = useState<boolean>(Boolean(settings?.passcodeEnabled));
  const [passcode, setPasscode] = useState<string>(settings?.passcode || '1234');

  // Shared backend status (read-only — there is nothing for the user to
  // configure here; every user of this app shares one Supabase project, and
  // access is scoped per-user purely by Row Level Security + their real
  // sign-in session).
  const cloudConfigured = isCloudBackendConfigured();

  // UPI/SMS Interceptor
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

  // Save profile & currency
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      userName: userName.trim() || 'Alex',
      userEmail: userEmail.trim(),
      currencySymbol,
      passcodeEnabled,
      passcode,
    });
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222] pb-4">
        <div>
          <h2 className="text-xl font-bold font-mono text-white tracking-tight uppercase">
            SETTINGS & CUSTOMISATIONS
          </h2>
          <p className="text-xs text-[#777] font-mono mt-0.5">
            System configuration, user preferences, categories, budgets and bank accounts
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('system')}
            className={`px-3.5 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer ${
              activeSubTab === 'system'
                ? 'bg-red-600 text-white'
                : 'bg-[#141414] border border-[#222] text-[#888] hover:text-white'
            }`}
          >
            System & Security
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('customisations')}
            className={`px-3.5 py-2 text-xs font-mono font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'customisations'
                ? 'bg-red-600 text-white'
                : 'bg-[#141414] border border-[#222] text-[#888] hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Customisations</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'customisations' ? (
        <CustomisationsView
          categories={categories}
          accounts={accounts}
          onAddCategory={onAddCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
          onAddAccount={onAddAccount}
          onUpdateAccount={onUpdateAccount}
          onDeleteAccount={onDeleteAccount}
          currencySymbol={settings.currencySymbol}
        />
      ) : (
        <>
      {/* Personalization Section */}
      <div className="bg-carbon border border-nothing p-5 sm:p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-nothing">
          <Palette className="w-4 h-4 text-red-500" />
          <h3 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
            Personalization
          </h3>
        </div>

        {/* Theme Setting (Simple Toggle) */}
        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
          <div>
            <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
              <span>App Theme</span>
              <span className="text-[9px] bg-red-600/80 text-white font-mono px-1.5 py-0.5 rounded uppercase">
                {(settings.theme || 'dark').toUpperCase()}
              </span>
            </div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">
              Toggle between Obsidian Dark and Ceramic Light interface
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleThemeChange((settings.theme || 'dark') === 'dark' ? 'light' : 'dark')}
            className="px-3.5 py-1.5 bg-[#1f1f1f] border border-[#333] hover:border-red-600 text-xs font-mono font-bold text-white rounded-xl transition-all cursor-pointer flex items-center gap-2"
          >
            {(settings.theme || 'dark') === 'dark' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span>DARK</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-indigo-400" />
                <span>LIGHT</span>
              </>
            )}
          </button>
        </div>

        {/* Default Net Worth Masking / Privacy Setting */}
        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
          <div>
            <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
              <span>Default Net Worth Privacy</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                settings.defaultNetWorthMasked !== false ? 'bg-red-950 text-red-400 border border-red-800/50' : 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
              }`}>
                {settings.defaultNetWorthMasked !== false ? 'HIDDEN BY DEFAULT' : 'VISIBLE BY DEFAULT'}
              </span>
            </div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">
              Set whether Net Worth on Executive Summary initializes as masked (••••) or visible
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const currentVal = settings.defaultNetWorthMasked !== false; // default true
              onUpdateSettings({
                ...settings,
                defaultNetWorthMasked: !currentVal,
              });
            }}
            className={`px-3.5 py-1.5 border text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              settings.defaultNetWorthMasked !== false
                ? 'bg-red-950/60 border-red-600 text-red-400 hover:bg-red-900/80'
                : 'bg-[#1f1f1f] border-[#333] text-white hover:border-emerald-500'
            }`}
          >
            {settings.defaultNetWorthMasked !== false ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-red-400" />
                <span>MASKED</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>VISIBLE</span>
              </>
            )}
          </button>
        </div>

        {/* Currency Setting */}
        <div className="p-3 bg-obsidian border border-nothing rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono font-bold text-white">Default Preferred Currency</div>
            <span className="text-xs font-mono font-bold text-red-400">{currencySymbol}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 pt-1">
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
                className={`py-1.5 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                  currencySymbol === c.symbol
                    ? 'bg-red-600 text-white'
                    : 'bg-[#141414] border border-[#222] text-[#888] hover:text-white'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* UPI & SMS Interceptor — the flagship real-time feature */}
      <div className="bg-carbon border border-nothing p-5 sm:p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-nothing">
          <Smartphone className="w-4 h-4 text-red-500" />
          <h3 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
            UPI &amp; SMS Interceptor
          </h3>
        </div>

        {isNativeAndroid() ? (
          <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
            <div>
              <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                <span>Notification Access</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                  notifAccessGranted ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50' : 'bg-red-950 text-red-400 border border-red-800/50'
                }`}>
                  {notifAccessGranted ? 'GRANTED' : 'NOT GRANTED'}
                </span>
              </div>
              <div className="text-[10px] text-[#777] font-mono mt-0.5">
                Required so TMF can read incoming bank/UPI notifications in real time
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await requestNotificationAccess();
                setTimeout(() => isNotificationAccessGranted().then(setNotifAccessGranted), 1000);
              }}
              className="px-3.5 py-1.5 bg-[#1f1f1f] border border-[#333] hover:border-red-600 text-xs font-mono font-bold text-white rounded-xl transition-all cursor-pointer flex items-center gap-2"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{notifAccessGranted ? 'REVIEW' : 'GRANT ACCESS'}</span>
            </button>
          </div>
        ) : (
          <div className="p-3 bg-obsidian border border-nothing rounded-xl text-[10px] text-[#777] font-mono">
            Real-time on-device notification interception only runs inside the Android app.
            Download it below (or from Settings on mobile) — on the web you can still try it
            out with the SMS Simulator.
          </div>
        )}

        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
          <div>
            <div className="text-xs font-mono font-bold text-white">Auto-Extract From Notifications</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">Automatically parse detected bank/UPI notifications</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const updated = !autoExtractSms;
              setAutoExtractSms(updated);
              onUpdateSettings({ ...settings, autoExtractSms: updated });
            }}
            className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors ${
              autoExtractSms ? 'bg-red-600 text-white' : 'bg-carbon text-[#777] border border-nothing'
            }`}
          >
            {autoExtractSms ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
          <div>
            <div className="text-xs font-mono font-bold text-white">"Add This Transaction?" Push Alerts</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">Post a native notification the moment a transaction is detected</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const updated = !notificationsEnabled;
              setNotificationsEnabled(updated);
              onUpdateSettings({ ...settings, notificationsEnabled: updated });
            }}
            className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors ${
              notificationsEnabled ? 'bg-red-600 text-white' : 'bg-carbon text-[#777] border border-nothing'
            }`}
          >
            {notificationsEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* Cloud Backend Status (read-only — this is a shared multi-tenant
          backend, there is nothing here for a user to configure). */}
      <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-nothing">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              Cloud Backend
            </h3>
          </div>
          <span className={`px-2.5 py-0.5 text-[9px] font-mono rounded font-bold ${
            isAuthenticated ? 'bg-green-950 text-green-400' : 'bg-yellow-950 text-yellow-400'
          }`}>
            {isAuthenticated ? 'SYNCED' : 'NOT SIGNED IN'}
          </span>
        </div>

        <p className="text-xs text-[#888] font-mono leading-relaxed">
          Your data automatically syncs to TMF's secure cloud database once you're signed in —
          there's no Supabase account or setup required on your end. Every account's data is kept
          completely private via database-level access rules.
        </p>

        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-xl">
          <div>
            <div className="text-xs font-mono font-bold text-white">Signed in as</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">{authUserEmail || 'Not signed in'}</div>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${isAuthenticated ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>

        {!cloudConfigured && (
          <div className="p-3 rounded-xl border border-yellow-800/60 bg-yellow-950/40 text-yellow-400 text-xs font-mono flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Cloud sync isn't configured for this build (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time). Your data still works fully offline.</span>
          </div>
        )}

        {cloudConfigured && (
          <div className="p-3 rounded-xl border border-nothing bg-obsidian space-y-2">
            <div className="text-xs font-mono font-bold text-white">Fixing "requested path is invalid" on sign-up/reset emails</div>
            <div className="text-[10px] text-[#777] font-mono leading-relaxed">
              This error means Supabase's dashboard doesn't have this app's URL whitelisted for auth
              redirects yet. Copy the exact URL below and add it (or a wildcard like it + <code>**</code>) to
              your Supabase project's <span className="text-white">Authentication → URL Configuration → Redirect URLs</span>.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2.5 py-2 bg-carbon border border-nothing rounded-lg text-[10px] text-emerald-400 truncate">
                {getAuthRedirectUrl()}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(getAuthRedirectUrl());
                  setRedirectUrlCopied(true);
                  setTimeout(() => setRedirectUrlCopied(false), 2000);
                }}
                className="px-3 py-2 bg-[#1f1f1f] border border-[#333] hover:border-red-600 text-xs font-mono font-bold text-white rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                {redirectUrlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{redirectUrlCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Real sync diagnostics: records failing to reach the backend used to
            fail completely silently. This surfaces the actual error and lets
            you retry on demand. */}
        {cloudConfigured && isAuthenticated && onForceSyncNow && (
          <div className="pt-4 border-t border-nothing space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs font-mono font-bold text-white">Backend Sync Diagnostics</div>
                <div className="text-[10px] text-[#777] font-mono mt-0.5">
                  Push all local records to the cloud right now and check for errors
                </div>
              </div>
              <button
                type="button"
                disabled={isForceSyncing}
                onClick={async () => {
                  setIsForceSyncing(true);
                  setForceSyncResult(null);
                  const result = await onForceSyncNow();
                  setForceSyncResult(result);
                  setIsForceSyncing(false);
                }}
                className="px-4 py-2 bg-obsidian border border-nothing hover:border-[#444] text-xs font-mono font-bold text-white rounded-xl transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isForceSyncing ? 'animate-spin' : ''}`} />
                <span>{isForceSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>

            {(forceSyncResult || (syncStatus && !syncStatus.success)) && (
              <div className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                (forceSyncResult ?? { success: false }).success
                  ? 'bg-green-950/40 border-green-800 text-green-400'
                  : 'bg-red-950/40 border-red-800 text-red-400'
              }`}>
                {(forceSyncResult ?? { success: false }).success ? (
                  <>
                    <Check className="w-4 h-4 shrink-0" />
                    <span>All records synced to the cloud successfully.</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{forceSyncResult?.error || syncStatus?.error || 'Sync failed for an unknown reason.'}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account Security Passcode */}
      <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-nothing">
          <Shield className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
            Account Security & Passcode
          </h3>
        </div>

        <div className="flex items-center justify-between p-3 bg-obsidian border border-nothing rounded-2xl">
          <div>
            <div className="text-xs font-mono font-bold text-white">App Lock Passcode</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">Require a PIN on app launch</div>
          </div>
          <button
            type="button"
            onClick={() => {
              const updated = !passcodeEnabled;
              setPasscodeEnabled(updated);
              onUpdateSettings({ ...settings, passcodeEnabled: updated, passcode });
            }}
            className={`px-4 py-1.5 font-mono text-xs font-bold rounded-xl transition-colors ${
              passcodeEnabled ? 'bg-red-600 text-white' : 'bg-carbon text-[#777] border border-nothing'
            }`}
          >
            {passcodeEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {passcodeEnabled && (
          <div className="p-3 bg-obsidian border border-nothing rounded-2xl space-y-2">
            <label className="block text-[10px] text-[#777] uppercase tracking-wider font-mono">
              Set Your Passcode (4-6 digits)
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter a new PIN"
                className="flex-1 px-3 py-2 bg-carbon border border-nothing rounded-xl text-xs font-mono tracking-[0.3em] text-white focus:outline-none focus:border-red-600"
              />
              <button
                type="button"
                disabled={passcode.length < 4}
                onClick={() => onUpdateSettings({ ...settings, passcodeEnabled, passcode })}
                className="px-4 py-2 bg-white text-black font-mono font-bold text-xs uppercase rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-40"
              >
                Save PIN
              </button>
            </div>
            <div className="text-[9px] text-[#666] font-mono">
              Choose a PIN only you know. It is never shown back to you after saving.
            </div>
          </div>
        )}
      </div>

      {/* Data Management, Demo Data & Backup */}
      <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-nothing">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-white" />
            <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
              Data Management & Backup
            </h3>
          </div>
          <span className="text-[9px] font-mono font-bold text-[#666] uppercase tracking-widest">
            LOCAL & EXPORT
          </span>
        </div>

        {/* JSON Backup Export */}
        <div className="flex items-center justify-between flex-wrap gap-4 p-3.5 bg-obsidian border border-nothing rounded-2xl">
          <div>
            <div className="text-xs font-mono font-bold text-white">Full Financial Data Backup (JSON)</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">Export all transactions, investments, categories, and settings</div>
          </div>
          <button
            type="button"
            onClick={onExportBackupJSON}
            className="px-4 py-2 bg-carbon border border-nothing hover:border-[#444] text-xs font-mono font-bold text-white rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Backup JSON</span>
          </button>
        </div>

        {/* Sample Demo Data Controls */}
        <div className="p-3.5 bg-obsidian border border-nothing rounded-2xl space-y-3">
          <div>
            <div className="text-xs font-mono font-bold text-white">Sample Demo Data Management</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">
              Populate or clean out sample bank accounts, transactions, investments, and loans
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap pt-1">
            {onLoadSampleData && (
              <button
                type="button"
                onClick={onLoadSampleData}
                className="px-4 py-2 border border-blue-800/80 bg-blue-950/20 text-blue-400 hover:bg-blue-950/50 text-xs font-mono font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Load Sample Data</span>
              </button>
            )}

            {onRemoveSampleData && (
              <button
                type="button"
                onClick={onRemoveSampleData}
                className="px-4 py-2 border border-amber-800/80 bg-amber-950/20 text-amber-400 hover:bg-amber-950/50 text-xs font-mono font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Sample Data</span>
              </button>
            )}
          </div>
        </div>

        {/* Total Reset Data */}
        <div className="flex items-center justify-between flex-wrap gap-4 p-3.5 bg-obsidian border border-red-950/60 rounded-2xl">
          <div>
            <div className="text-xs font-mono font-bold text-red-400">Clear All Financial Records</div>
            <div className="text-[10px] text-[#777] font-mono mt-0.5">Wipe all local accounts, transactions, investments, and loans completely</div>
          </div>
          <button
            type="button"
            onClick={onResetAllData}
            className="px-4 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-xs font-mono font-bold text-red-400 hover:text-red-200 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset All Data</span>
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
