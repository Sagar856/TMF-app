import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserSettings, Category, FinancialAccount, Transaction, InvestmentRecord } from '../types/finance';
import { BackupRestoreData, parseBackupJson } from '../utils/backup';
import { isNativeAndroid, isNotificationAccessGranted, requestNotificationAccess } from '../services/notificationListener';
import { requestPushNotificationPermission } from '../services/localNotifications';
import { clearBiometricEnrollment, enrollBiometric, isBiometricAvailable, isBiometricEnrolled } from '../services/biometric';
import {
  Shield,
  Download,
  RefreshCw,
  Palette,
  Sliders,
  Smartphone,
  BellRing,
  Sun,
  Moon,
  Trash2,
  Coins,
  Lock,
  Database,
  Building2,
  UserCircle2,
  LogOut,
  Cloud,
  CloudOff,
  Info,
  ExternalLink,
  Tags,
  Landmark,
  ChevronRight,
  KeyRound,
  Upload,
} from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';
import { PasscodeSetupModal } from './PasscodeSetupModal';
import { BrokerPortfoliosSection } from './settings/BrokerPortfoliosSection';
import {
  SettingSection,
  SettingRow,
  SettingSwitch,
  SegmentedControl,
  SettingButton,
  StatusPill,
} from './settings/SettingsPrimitives';

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
  syncStatus?: { collection: string; success: boolean; error?: string; warning?: string; schemaOutdated?: boolean; timestamp: number } | null;
  onForceSyncNow?: () => Promise<{ success: boolean; error?: string; warning?: string }>;
  isAuthenticated?: boolean;
  authUserEmail?: string | null;
  onSignOut?: () => void;
  onOpenProfile?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

type SettingsMode = 'preferences' | 'personalisation';

const SECTION_LINKS: { id: string; label: string }[] = [
  { id: 'settings-profile', label: 'Account' },
  { id: 'settings-appearance', label: 'Appearance' },
  { id: 'settings-region', label: 'Currency' },
  { id: 'settings-automation', label: 'Automation' },
  { id: 'settings-security', label: 'Security' },
  { id: 'settings-brokers', label: 'Brokers' },
  { id: 'settings-data', label: 'Data & Backup' },
  { id: 'settings-about', label: 'About' },
];

const CURRENCIES = [
  { symbol: '₹', code: 'INR', locale: 'en-IN', name: '₹ INR' },
  { symbol: '$', code: 'USD', locale: 'en-US', name: '$ USD' },
  { symbol: '€', code: 'EUR', locale: 'de-DE', name: '€ EUR' },
  { symbol: '£', code: 'GBP', locale: 'en-GB', name: '£ GBP' },
];

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
  onSignOut,
  onOpenProfile,
  onNavigateToTab,
}) => {
  const [mode, setMode] = useState<SettingsMode>('preferences');
  const [activeSectionId, setActiveSectionId] = useState<string>(SECTION_LINKS[0].id);
  const sectionsRootRef = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<UserSettings>) => onUpdateSettings({ ...settings, ...patch });

  /* ---------------- Android notification access ---------------- */
  const isAndroid = isNativeAndroid();
  const [notifAccessGranted, setNotifAccessGranted] = useState<boolean>(false);
  useEffect(() => {
    if (!isAndroid) return;
    isNotificationAccessGranted().then(setNotifAccessGranted);
  }, [isAndroid]);

  /* ---------------- Push permission ---------------- */
  const [notificationPermissionError, setNotificationPermissionError] = useState('');
  const [requestingNotificationPermission, setRequestingNotificationPermission] = useState(false);
  const latestSettingsRef = useRef(settings);
  latestSettingsRef.current = settings;

  const handleTogglePushAlerts = async (next: boolean) => {
    setNotificationPermissionError('');
    if (!next) {
      update({ notificationsEnabled: false });
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
  };

  /* ---------------- Passcode ---------------- */
  const [showPasscodeSetup, setShowPasscodeSetup] = useState(false);
  const handleTogglePasscode = (next: boolean) => {
    if (next) {
      setShowPasscodeSetup(true);
      return;
    }
    // Disabling the lock must also forget the stored hash + salt and any biometric enrolment.
    clearBiometricEnrollment();
    update({ passcodeEnabled: false, passcodeHash: undefined, passcodeSalt: undefined, biometricUnlockEnabled: false });
  };

  /* ---------------- Biometric ---------------- */
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState('');
  useEffect(() => {
    let active = true;
    isBiometricAvailable().then((available) => {
      if (active) setBiometricAvailable(available);
    });
    return () => { active = false; };
  }, []);
  const handleToggleBiometric = async (next: boolean) => {
    setBiometricError('');
    if (!next) {
      clearBiometricEnrollment();
      update({ biometricUnlockEnabled: false });
      return;
    }
    setBiometricBusy(true);
    try {
      const ok = await enrollBiometric(authUserEmail || settings.userEmail || settings.userName || 'MTracker');
      if (!ok) {
        setBiometricError('Biometric enrolment was cancelled or is not supported here. You can keep using the PIN.');
        return;
      }
      update({ biometricUnlockEnabled: true });
    } finally {
      setBiometricBusy(false);
    }
  };

  /* ---------------- Backup ---------------- */
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [backupRestoreMessage, setBackupRestoreMessage] = useState<string | null>(null);
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

  /* ---------------- Cloud sync ---------------- */
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [forceSyncResult, setForceSyncResult] = useState<{ success: boolean; error?: string; warning?: string } | null>(null);
  const handleSyncNow = async () => {
    if (!onForceSyncNow) return;
    setIsForceSyncing(true);
    setForceSyncResult(null);
    try {
      setForceSyncResult(await onForceSyncNow());
    } finally {
      setIsForceSyncing(false);
    }
  };
  const lastSyncLabel = useMemo(() => {
    if (!syncStatus?.timestamp) return null;
    return new Date(syncStatus.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [syncStatus?.timestamp]);
  const cloudTone: 'emerald' | 'red' | 'amber' | 'neutral' = !isAuthenticated
    ? 'neutral'
    : syncStatus && !syncStatus.success
    ? 'red'
    : syncStatus?.warning
    ? 'amber'
    : 'emerald';

  /* ---------------- Section jump + scroll-spy ---------------- */
  const jumpTo = (id: string) => {
    setActiveSectionId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (mode !== 'preferences' || typeof IntersectionObserver === 'undefined') return;
    const root = sectionsRootRef.current;
    if (!root) return;
    const sections: HTMLElement[] = Array.from(root.querySelectorAll<HTMLElement>('section[id^="settings-"]'));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSectionId(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((s: HTMLElement) => observer.observe(s));
    return () => observer.disconnect();
  }, [mode]);

  const theme = settings.theme || 'dark';
  const sampleLoaded = settings.sampleDataLoaded !== false;

  return (
    <div className="space-y-5 pb-16 max-w-5xl font-mono">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-bold font-mono text-content-1 tracking-tight uppercase">Settings</h2>
          <span className="text-[10px] text-content-3 hidden sm:inline">Preferences, automation, security & data</span>
        </div>

        <SegmentedControl<SettingsMode>
          ariaLabel="Settings area"
          size="md"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'preferences', label: 'Preferences' },
            {
              value: 'personalisation',
              label: (
                <>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Categories & Budgets</span>
                </>
              ),
            },
          ]}
        />
      </div>

      {mode === 'personalisation' ? (
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
        <div className="lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-6 lg:items-start">
          {/* Section navigation: horizontal chips on mobile, sticky rail on desktop */}
          <nav
            aria-label="Settings sections"
            className="lg:sticky lg:top-2 -mx-1 px-1 mb-4 lg:mb-0 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
          >
            {SECTION_LINKS.map((link) => {
              const active = activeSectionId === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => jumpTo(link.id)}
                  className={`shrink-0 lg:w-full lg:text-left rounded-xl border px-3 py-1.5 lg:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer ${
                    active
                      ? 'border-red-600 bg-red-600 text-white shadow-sm'
                      : 'border-line bg-surface-1 text-content-2 hover:bg-surface-2 hover:text-content-1'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          <div ref={sectionsRootRef} className="space-y-5 min-w-0">
            {/* ============ PROFILE & ACCOUNT ============ */}
            <SettingSection
              id="settings-profile"
              title="Profile & Account"
              icon={UserCircle2}
              iconClassName="text-red-500"
              badge={
                <StatusPill tone={cloudTone}>
                  {!isAuthenticated ? 'Local only' : cloudTone === 'red' ? 'Sync failed' : cloudTone === 'amber' ? 'Sync warning' : 'Cloud synced'}
                </StatusPill>
              }
            >
              <SettingRow
                label={settings.userName || 'Your profile'}
                description={authUserEmail || settings.userEmail || 'Name, email and photo shown across the app.'}
              >
                {onOpenProfile && (
                  <SettingButton onClick={onOpenProfile} icon={ChevronRight} iconClassName="text-content-3">
                    Edit profile
                  </SettingButton>
                )}
              </SettingRow>

              <SettingRow
                label="Cloud sync"
                description={
                  !isAuthenticated
                    ? 'Sign in to back up your data to the cloud and use it on other devices.'
                    : syncStatus && !syncStatus.success
                    ? `Last attempt failed (${syncStatus.collection}): ${syncStatus.error}`
                    : syncStatus?.warning
                    ? syncStatus.warning
                    : lastSyncLabel
                    ? `Last synced at ${lastSyncLabel}. Changes sync automatically a moment after you make them.`
                    : 'Changes sync automatically a moment after you make them.'
                }
                infoId="cloud-sync-info"
                infoTitle="Cloud sync"
                infoContent="Every change is saved locally first and then pushed to your private cloud space. Use Sync now to verify the connection immediately."
              >
                {isAuthenticated && onForceSyncNow && (
                  <SettingButton onClick={handleSyncNow} disabled={isForceSyncing} icon={isForceSyncing ? RefreshCw : cloudTone === 'red' ? CloudOff : Cloud} iconClassName={`${isForceSyncing ? 'animate-spin' : ''} ${cloudTone === 'red' ? 'text-red-500' : 'text-emerald-500'}`}>
                    {isForceSyncing ? 'Syncing…' : 'Sync now'}
                  </SettingButton>
                )}
              </SettingRow>
              {forceSyncResult && (
                <p
                  role="status"
                  className={`py-2 text-[11px] ${
                    forceSyncResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {forceSyncResult.success
                    ? forceSyncResult.warning || 'All collections synced successfully.'
                    : forceSyncResult.error || 'Sync failed.'}
                </p>
              )}

              {isAuthenticated && onSignOut && (
                <SettingRow label="Sign out" description="Clears this device's local copy. Your cloud data stays safe.">
                  <SettingButton onClick={onSignOut} icon={LogOut} iconClassName="text-red-500">
                    Sign out
                  </SettingButton>
                </SettingRow>
              )}
            </SettingSection>

            {/* ============ APPEARANCE ============ */}
            <SettingSection id="settings-appearance" title="Appearance & Display" icon={Palette}>
              <SettingRow
                label="Theme"
                description="Obsidian dark or Ceramic light across every screen."
                badge={<StatusPill tone="red">{theme}</StatusPill>}
              >
                <SegmentedControl<'light' | 'dark'>
                  ariaLabel="Interface theme"
                  value={theme}
                  onChange={(t) => update({ theme: t })}
                  options={[
                    { value: 'light', label: (<><Sun className="w-3.5 h-3.5" /><span>Light</span></>) },
                    { value: 'dark', label: (<><Moon className="w-3.5 h-3.5" /><span>Dark</span></>) },
                  ]}
                />
              </SettingRow>

              <SettingRow
                label="Mask balances by default"
                description="Hide net worth and totals until you tap the eye icon."
                htmlFor="sw-mask-balances"
              >
                <SettingSwitch
                  id="sw-mask-balances"
                  label="Mask balances by default"
                  checked={settings.defaultNetWorthMasked !== false}
                  onChange={(v) => update({ defaultNetWorthMasked: v })}
                />
              </SettingRow>

              <SettingRow
                label="Auto-expand dashboard sections on scroll"
                description="Budget, upcoming bills and trend cards open as they scroll into view. Turn off to control them manually."
                htmlFor="sw-auto-expand"
              >
                <SettingSwitch
                  id="sw-auto-expand"
                  label="Auto-expand dashboard sections on scroll"
                  checked={settings.autoCollapseExpandOnScroll !== false}
                  onChange={(v) => update({ autoCollapseExpandOnScroll: v })}
                />
              </SettingRow>
            </SettingSection>

            {/* ============ CURRENCY & REGION ============ */}
            <SettingSection id="settings-region" title="Currency & Region" icon={Coins} iconClassName="text-amber-500">
              <SettingRow
                label="Preferred currency"
                description="Applied to all balances, transactions, budgets and reports."
                badge={<StatusPill tone="neutral">{settings.currencyCode} · {settings.currencySymbol}</StatusPill>}
                stacked
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Preferred currency">
                  {CURRENCIES.map((c) => {
                    const active = settings.currencyCode === c.code;
                    return (
                      <button
                        type="button"
                        key={c.code}
                        role="radio"
                        aria-checked={active}
                        onClick={() => update({ currencySymbol: c.symbol, currencyCode: c.code, locale: c.locale })}
                        className={`py-2 text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer ${
                          active
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'bg-surface-2 border border-line text-content-2 hover:text-content-1 hover:bg-surface-3'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </SettingRow>
            </SettingSection>

            {/* ============ AUTOMATION ============ */}
            <SettingSection
              id="settings-automation"
              title="Automation & Alerts"
              icon={Smartphone}
              description="On-device UPI/SMS capture, push alerts and budget notifications."
            >
              {isAndroid ? (
                <SettingRow
                  label="Notification access"
                  description="Lets the Android service read bank & UPI alerts in real time. Nothing leaves your device."
                  badge={<StatusPill tone={notifAccessGranted ? 'emerald' : 'red'}>{notifAccessGranted ? 'Granted' : 'Not granted'}</StatusPill>}
                >
                  <SettingButton
                    icon={BellRing}
                    iconClassName="text-red-500"
                    onClick={async () => {
                      await requestNotificationAccess();
                      setTimeout(() => isNotificationAccessGranted().then(setNotifAccessGranted), 1000);
                    }}
                  >
                    {notifAccessGranted ? 'Review' : 'Grant access'}
                  </SettingButton>
                </SettingRow>
              ) : (
                <SettingRow
                  label="Notification access"
                  description="Automatic capture of bank/UPI alerts is available in the Android app. On the web you can test parsing with the SMS Simulator (header icon)."
                  badge={<StatusPill tone="neutral">Android only</StatusPill>}
                />
              )}

              <SettingRow
                label="Auto-extract from notifications"
                description="Detect amount, merchant, category and payment mode from bank messages."
                htmlFor="sw-auto-extract"
              >
                <SettingSwitch
                  id="sw-auto-extract"
                  label="Auto-extract from notifications"
                  checked={settings.autoExtractSms}
                  onChange={(v) => update({ autoExtractSms: v })}
                />
              </SettingRow>

              <SettingRow
                label="“Add transaction?” push alerts"
                description="Post a notification the moment an unlogged debit or credit is detected."
                htmlFor="sw-push-alerts"
              >
                <SettingSwitch
                  id="sw-push-alerts"
                  label="Add transaction push alerts"
                  checked={settings.notificationsEnabled}
                  busy={requestingNotificationPermission}
                  onChange={(v) => void handleTogglePushAlerts(v)}
                />
              </SettingRow>
              {notificationPermissionError && (
                <p role="alert" className="py-2 text-[11px] text-red-600 dark:text-red-400">{notificationPermissionError}</p>
              )}

              <SettingRow
                label="Budget threshold alerts"
                description="Notify at 80% and 100% of a category's monthly budget."
                htmlFor="sw-budget-alerts"
              >
                <SettingSwitch
                  id="sw-budget-alerts"
                  label="Budget threshold alerts"
                  checked={settings.budgetAlertsEnabled !== false}
                  disabled={!settings.notificationsEnabled}
                  onChange={(v) => update({ budgetAlertsEnabled: v })}
                />
              </SettingRow>

              <SettingRow
                label="Location tagging"
                description="Attach the place where a transaction happened (uses device GPS)."
                htmlFor="sw-location"
              >
                <SettingSwitch
                  id="sw-location"
                  label="Location tagging"
                  checked={settings.locationTracking}
                  onChange={(v) => update({ locationTracking: v })}
                />
              </SettingRow>
            </SettingSection>

            {/* ============ SECURITY & PRIVACY ============ */}
            <SettingSection id="settings-security" title="Security & Privacy" icon={Lock}>
              <SettingRow
                label="App lock (PIN)"
                description="Require a 4–6 digit PIN every time the app opens."
                htmlFor="sw-passcode"
                badge={settings.passcodeEnabled ? <StatusPill tone="emerald">On</StatusPill> : undefined}
              >
                {settings.passcodeEnabled && (
                  <SettingButton icon={KeyRound} iconClassName="text-content-3" onClick={() => setShowPasscodeSetup(true)}>
                    Change PIN
                  </SettingButton>
                )}
                <SettingSwitch id="sw-passcode" label="App lock" checked={settings.passcodeEnabled} onChange={handleTogglePasscode} />
              </SettingRow>

              {settings.passcodeEnabled && (
                <>
                  <SettingRow
                    label="Unlock with device biometrics"
                    description={
                      biometricAvailable === false
                        ? 'Not available on this device/browser (needs a secure context and a platform authenticator such as Windows Hello, Touch ID or Android biometrics).'
                        : 'Use fingerprint / face / Windows Hello instead of typing the PIN. Enrolled per device; the PIN always still works.'
                    }
                    htmlFor="sw-biometric"
                    badge={settings.biometricUnlockEnabled && isBiometricEnrolled() ? <StatusPill tone="emerald">Enrolled</StatusPill> : undefined}
                  >
                    <SettingSwitch
                      id="sw-biometric"
                      label="Unlock with device biometrics"
                      checked={Boolean(settings.biometricUnlockEnabled) && isBiometricEnrolled()}
                      disabled={biometricAvailable === false}
                      busy={biometricBusy}
                      onChange={(v) => void handleToggleBiometric(v)}
                    />
                  </SettingRow>
                  {biometricError && <p role="alert" className="py-2 text-[11px] text-red-600 dark:text-red-400">{biometricError}</p>}

                  <SettingRow
                    label="Auto-lock"
                    description="Re-lock after the app has been in the background for this long."
                  >
                    <SegmentedControl<string>
                      ariaLabel="Auto-lock delay"
                      value={settings.autoLockMinutes === undefined ? 'never' : String(settings.autoLockMinutes)}
                      onChange={(v) => update({ autoLockMinutes: v === 'never' ? undefined : Number(v) })}
                      options={[
                        { value: '0', label: 'Instantly' },
                        { value: '1', label: '1 min' },
                        { value: '5', label: '5 min' },
                        { value: '15', label: '15 min' },
                        { value: 'never', label: 'On restart', title: 'Only ask for the PIN when the app is launched' },
                      ]}
                    />
                  </SettingRow>
                </>
              )}

              <SettingRow
                label="Skip delete confirmations"
                description="Delete records immediately without a confirmation dialog. You can always restore from a backup."
                stacked
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    ['skipDeleteConfirmation', 'Transactions', 'sw-skip-tx'],
                    ['skipInvestmentDeleteConfirmation', 'Investments', 'sw-skip-inv'],
                    ['skipLoanDeleteConfirmation', 'Loans & lends', 'sw-skip-loan'],
                  ] as const).map(([key, label, id]) => (
                    <label key={key} htmlFor={id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-2 border border-line text-[11px] text-content-1 cursor-pointer">
                      <span>{label}</span>
                      <SettingSwitch id={id} label={`Skip delete confirmation for ${label}`} checked={Boolean(settings[key])} onChange={(v) => update({ [key]: v })} />
                    </label>
                  ))}
                </div>
              </SettingRow>
            </SettingSection>

            {/* ============ BROKER PORTFOLIOS ============ */}
            <div id="settings-brokers" className="scroll-mt-24">
              <BrokerPortfoliosSection settings={settings} investments={investments} onUpdateSettings={onUpdateSettings} />
            </div>

            {/* ============ DATA & BACKUP ============ */}
            <SettingSection id="settings-data" title="Data & Backup" icon={Database}>
              <SettingRow
                label="Categories, budgets & accounts"
                description="Manage spending categories, monthly budgets and linked bank accounts."
              >
                <SettingButton icon={Tags} iconClassName="text-content-3" onClick={() => setMode('personalisation')}>
                  Categories
                </SettingButton>
                {onNavigateToTab && (
                  <SettingButton icon={Landmark} iconClassName="text-content-3" onClick={() => onNavigateToTab('accounts')}>
                    Accounts
                  </SettingButton>
                )}
              </SettingRow>

              <SettingRow
                label="Export backup (JSON)"
                description="All transactions, investments, loans, categories, accounts and preferences in one file."
              >
                <SettingButton icon={Download} iconClassName="text-red-500" onClick={onExportBackupJSON}>
                  Export
                </SettingButton>
              </SettingRow>

              <SettingRow
                label="Restore from backup"
                description="Validates the file and shows record counts before replacing current data."
              >
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Select MTracker JSON backup"
                  onChange={(event) => void handleBackupFileSelection(event.target.files?.[0])}
                />
                <SettingButton
                  icon={Upload}
                  iconClassName="text-amber-600 dark:text-amber-400"
                  onClick={() => {
                    setBackupRestoreMessage(null);
                    backupFileInputRef.current?.click();
                  }}
                >
                  Choose file
                </SettingButton>
              </SettingRow>
              {backupRestoreMessage && (
                <p role="status" aria-live="polite" className="py-2 text-[11px] text-content-2">{backupRestoreMessage}</p>
              )}

              <SettingRow
                label="Sample demo data"
                description={sampleLoaded ? 'Demo records are loaded. Turn off to remove them (they will not re-seed).' : 'Demo records removed. Turn on to load them again.'}
                htmlFor="sw-sample-data"
                badge={<StatusPill tone={sampleLoaded ? 'blue' : 'neutral'}>{sampleLoaded ? 'Loaded' : 'Removed'}</StatusPill>}
              >
                {sampleLoaded && onLoadSampleData && (
                  <SettingButton variant="ghost" icon={RefreshCw} iconClassName="text-blue-500" onClick={onLoadSampleData}>
                    Re-load
                  </SettingButton>
                )}
                <SettingSwitch
                  id="sw-sample-data"
                  label="Sample demo data"
                  tone="blue"
                  checked={sampleLoaded}
                  onChange={(v) => {
                    if (v) onLoadSampleData?.();
                    else onRemoveSampleData?.();
                  }}
                />
              </SettingRow>
            </SettingSection>

            <SettingSection id="settings-danger" title="Danger zone" icon={Trash2} iconClassName="text-red-600" tone="danger">
              <SettingRow
                label="Reset all data"
                description="Permanently wipes all local and cloud accounts, transactions, investments, loans and categories. Export a backup first."
              >
                <SettingButton variant="danger" icon={Trash2} onClick={onResetAllData}>
                  Reset all data
                </SettingButton>
              </SettingRow>
            </SettingSection>

            {/* ============ ABOUT ============ */}
            <SettingSection id="settings-about" title="About" icon={Info} iconClassName="text-content-3">
              <SettingRow label="Version" description="MTracker · Track Money Flow">
                <StatusPill tone="neutral">v{__APP_VERSION__}</StatusPill>
              </SettingRow>
              <SettingRow
                label="Android app"
                description="Install the APK to enable real-time UPI/SMS capture."
              >
                <a
                  href={`${import.meta.env.BASE_URL}downloads/TMF-app.apk`}
                  className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-content-1 flex items-center gap-2 transition-colors"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  Download APK
                </a>
              </SettingRow>
              <SettingRow label="Privacy" description="Data stays on your device and, when signed in, in your private cloud space protected by row-level security.">
                <Shield className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              </SettingRow>
              <SettingRow label="Open source" description="Issues and feature requests are welcome.">
                <a
                  href="https://github.com/Sagar856/TMF-app"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-content-2 hover:text-content-1 flex items-center gap-1.5"
                >
                  GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </SettingRow>
            </SettingSection>
          </div>
        </div>
      )}

      {showPasscodeSetup && (
        <PasscodeSetupModal
          onClose={() => setShowPasscodeSetup(false)}
          onSave={(credentials) => {
            update({ ...credentials, passcodeEnabled: true });
            setShowPasscodeSetup(false);
          }}
        />
      )}

      {/* Keep the icon import used for the broker section header parity */}
      <span className="hidden"><Building2 className="w-0 h-0" /></span>
    </div>
  );
};
