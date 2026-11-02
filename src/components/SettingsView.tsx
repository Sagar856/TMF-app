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
  Search,
  ArrowLeft,
  Headphones,
} from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';
import { PremiumComingSoon } from './PremiumComingSoon';
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
  onDeleteUserAccount?: () => void;
  lastSettingsSyncAt?: number | null;
  onOpenProfile?: () => void;
  onNavigateToTab?: (tab: string) => void;
}

const SETTINGS_GROUPS = [
  { id: 'account', label: 'Account', icon: UserCircle2, keywords: 'profile name email photo sign out cloud sync brokers portfolios categories budgets accounts data backup export restore sample demo' },
  { id: 'notifications', label: 'Notifications', icon: BellRing, keywords: 'notification access android upi sms interceptor auto extract push alerts budget threshold' },
  { id: 'appearance', label: 'Appearance', icon: Palette, keywords: 'theme light dark display auto expand dashboard scroll currency region locale' },
  { id: 'privacy', label: 'Privacy & Security', icon: Lock, keywords: 'mask balances net worth location gps tagging app lock pin passcode biometrics fingerprint auto lock delete confirmations reset data privacy' },
  { id: 'help', label: 'Help and Support', icon: Headphones, keywords: 'help support troubleshooting notification background battery permissions backup github issues feature requests' },
  { id: 'about', label: 'About', icon: Info, keywords: 'version minarth mtracker track money flow android download apk' },
] as const;
type SettingsGroup = typeof SETTINGS_GROUPS[number]['id'];

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
  onDeleteUserAccount,
  lastSettingsSyncAt,
  onOpenProfile,
  onNavigateToTab,
}) => {
  const [selectedGroup, setSelectedGroup] = useState<SettingsGroup | null>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('delete-account') ? 'account' : null
  );
  const [notificationDisclosureAccepted, setNotificationDisclosureAccepted] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [customisationOpen, setCustomisationOpen] = useState(false);
  const categoriesMenuRef = useRef<HTMLElement>(null);
  const groupHeadingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const lastGroupRef = useRef<SettingsGroup | null>(null);
  const visibleGroups = SETTINGS_GROUPS.filter(group =>
    `${group.label} ${group.keywords}`.toLowerCase().includes(settingsSearch.trim().toLowerCase())
  );

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
      const ok = await enrollBiometric(authUserEmail || settings.userEmail || settings.userName || 'MINARTH');
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
    } catch (error) {
      console.error('Settings sync failed:', error);
      setForceSyncResult({ success: false, error: error instanceof Error ? error.message : 'Settings sync failed.' });
    } finally {
      setIsForceSyncing(false);
    }
  };
  const lastSyncLabel = useMemo(() => {
    if (!lastSettingsSyncAt) return null;
    return new Date(lastSettingsSyncAt).toLocaleString();
  }, [lastSettingsSyncAt]);
  const cloudTone: 'emerald' | 'red' | 'amber' | 'neutral' = !isAuthenticated
    ? 'neutral'
    : syncStatus && !syncStatus.success
    ? 'red'
    : syncStatus?.warning
    ? 'amber'
    : 'emerald';

  useEffect(() => {
    if (selectedGroup) {
      lastGroupRef.current = selectedGroup;
      groupHeadingRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'auto' });
      groupHeadingRef.current?.focus();
    } else if (lastGroupRef.current) {
      menuRef.current?.querySelector<HTMLButtonElement>(`[data-settings-group="${lastGroupRef.current}"]`)?.focus();
    }
  }, [selectedGroup]);

  const theme = settings.theme || 'dark';
  const sampleLoaded = settings.sampleDataLoaded !== false;

  return (
    <div className="settings-glass space-y-5 pb-16 max-w-5xl mx-auto font-mono">
      {/* Page header */}
      <div className="flex flex-col gap-3 border-b border-line pb-4">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold font-mono text-content-1 tracking-tight uppercase">Settings</h2>
          <div className="flex min-w-0 flex-1 basis-48 items-center justify-end gap-2">
            <div className="relative min-w-0 flex-1 max-w-xs">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-3 pointer-events-none" />
              <input
                type="search"
                value={settingsSearch}
                onChange={event => {
                  setSettingsSearch(event.target.value);
                  setSelectedGroup(null);
                  lastGroupRef.current = null;
                }}
                aria-label="Search settings"
                placeholder="Search settings..."
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-2 text-xs text-content-1 border border-line focus:outline-none focus:border-red-500"
              />
            </div>
          {onForceSyncNow && (
            <SettingButton
              onClick={handleSyncNow}
              disabled={isForceSyncing || !isAuthenticated}
              icon={RefreshCw}
              className="h-10 shrink-0"
              iconClassName={isForceSyncing ? 'animate-spin' : 'text-red-500'}
            >
              {isForceSyncing ? 'Syncing…' : 'Sync'}
            </SettingButton>
          )}
          </div>
        </div>

        {forceSyncResult && (
          <p role={forceSyncResult.success ? 'status' : 'alert'} className={`text-[11px] ${forceSyncResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {forceSyncResult.success
              ? forceSyncResult.warning || 'Settings and financial data synced to cloud.'
              : forceSyncResult.error || 'Sync failed.'}
          </p>
        )}

      </div>

        <section hidden={customisationOpen} aria-labelledby="preferences-heading" className="max-w-3xl mx-auto">
          <h3 id="preferences-heading" className="text-base font-bold text-content-1 mb-4">Preferences</h3>
          <div hidden={selectedGroup !== null}>
          <nav
            ref={menuRef}
            aria-label="Settings sections"
            className="rounded-2xl bg-surface-1 border border-line divide-y divide-[var(--border-nothing)] px-4"
          >
            {visibleGroups.map((group) => {
              const Icon = group.icon;
              return (
                <button
                  key={group.id}
                  data-settings-group={group.id}
                  type="button"
                  onClick={() => setSelectedGroup(group.id)}
                  className="flex w-full items-center gap-3 py-4 px-2 text-left text-sm text-content-1 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-red-500 cursor-pointer"
                >
                  <Icon aria-hidden="true" className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{group.label}</span>
                  <ChevronRight aria-hidden="true" className="w-4 h-4 text-content-3" />
                </button>
              );
            })}
          </nav>
          {visibleGroups.length === 0 && <p role="status" className="text-xs text-content-3 py-6 text-center">No settings match your search.</p>}
          </div>
          {selectedGroup && (
            <div className="flex items-center gap-3 mb-5">
              <SettingButton icon={ArrowLeft} onClick={() => setSelectedGroup(null)} aria-label="Back to settings menu">Back</SettingButton>
              <h3 ref={groupHeadingRef} tabIndex={-1} className="text-base font-bold text-content-1 focus:outline-none">{SETTINGS_GROUPS.find(group => group.id === selectedGroup)?.label}</h3>
            </div>
          )}
          <div className="min-w-0">
            <div hidden={selectedGroup !== 'account'}>
            <div className="space-y-5">
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
                    : 'No successful settings sync yet. Changes upload automatically when connected.'
                }
                infoId="cloud-sync-info"
                infoTitle="Cloud sync"
                infoContent="Preferences and category rules upload automatically after edits and when connectivity returns. The timestamp records a successful settings upload, not a failed attempt. Passcodes, biometrics and device permissions stay local."
              >
              </SettingRow>

              <SettingRow label="Last successful settings sync" description={lastSyncLabel || 'Not synced yet on this device.'} />
              <SettingRow label="Plan" description="Manual tracking and notification-based spending capture are free.">
                <PremiumComingSoon />
              </SettingRow>
              {isAuthenticated && onDeleteUserAccount && (
                <SettingRow label="Delete account" description="Permanently delete your sign-in account and associated cloud data. This is different from resetting your records.">
                  <SettingButton variant="danger" icon={Trash2} onClick={onDeleteUserAccount}>Delete account</SettingButton>
                </SettingRow>
              )}
              {isAuthenticated && onSignOut && (
                <SettingRow label="Sign out" description="Clears this device's local copy. Your cloud data stays safe.">
                  <SettingButton onClick={onSignOut} icon={LogOut} iconClassName="text-red-500">
                    Sign out
                  </SettingButton>
                </SettingRow>
              )}
            </SettingSection>
            <div id="settings-brokers" className="scroll-mt-24">
              <BrokerPortfoliosSection settings={settings} investments={investments} onUpdateSettings={onUpdateSettings} />
            </div>
            </div>
            </div>

            {/* ============ APPEARANCE ============ */}
            <div hidden={selectedGroup !== 'appearance'}>
            <div className="space-y-5">
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
            </div>
            </div>

            {/* ============ AUTOMATION ============ */}
            <div hidden={selectedGroup !== 'notifications'}>
            <SettingSection
              id="settings-automation"
              title="Automation & Alerts"
              icon={Smartphone}
              description="On-device UPI/SMS capture, push alerts and budget notifications."
            >
              {isAndroid ? (
                <SettingRow
                  label="Notification access"
                  description="MINARTH reads bank and UPI notifications, including in the background, to detect payments. Parsed transactions and their source message text may sync to your private cloud account when saved. Other notifications are not used for financial tracking."
                  badge={<StatusPill tone={notifAccessGranted ? 'emerald' : 'red'}>{notifAccessGranted ? 'Granted' : 'Not granted'}</StatusPill>}
                >
                  <SettingButton
                    disabled={!notifAccessGranted && !notificationDisclosureAccepted}
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
                  description="Automatic capture of bank/UPI alerts is available in the Android app. Use manual entry on the web."
                  badge={<StatusPill tone="neutral">Android only</StatusPill>}
                />
              )}
              {isAndroid && !notifAccessGranted && (
                <label className="flex items-start gap-2 py-3 text-xs text-content-2">
                  <input type="checkbox" checked={notificationDisclosureAccepted} onChange={event => setNotificationDisclosureAccepted(event.target.checked)} />
                  I agree to notification access for payment detection and understand the cloud storage described above. I can revoke access in Android Settings.
                </label>
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

            </SettingSection>
            </div>

            {/* ============ SECURITY & PRIVACY ============ */}
            <div hidden={selectedGroup !== 'privacy'}>
            <div className="space-y-5">
            <SettingSection id="settings-security" title="Security & Privacy" icon={Lock}>
              <SettingRow label="Mask balances by default" description="Hide net worth and totals until you tap the eye icon." htmlFor="sw-mask-balances">
                <SettingSwitch id="sw-mask-balances" label="Mask balances by default" checked={settings.defaultNetWorthMasked !== false} onChange={v => update({ defaultNetWorthMasked: v })} />
              </SettingRow>
              <SettingRow label="Location tagging"               description="Attach device GPS location to transactions. Saved locations sync with your financial records when signed in." htmlFor="sw-location">
                <SettingSwitch id="sw-location" label="Location tagging" checked={settings.locationTracking} onChange={v => update({ locationTracking: v })} />
              </SettingRow>
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
            <SettingSection id="settings-danger" title="Danger zone" icon={Trash2} iconClassName="text-red-600" tone="danger">
              <SettingRow label="Reset all data" description="Permanently wipes all local and cloud accounts, transactions, investments, loans and categories. Export a backup first.">
                <SettingButton variant="danger" icon={Trash2} onClick={onResetAllData}>Reset all data</SettingButton>
              </SettingRow>
            </SettingSection>
            <SettingSection id="settings-privacy" title="Privacy" icon={Shield}>
              <SettingRow label="Your data" description="Data stays on your device and, when signed in, in your private cloud space protected by row-level security." />
              <a className="text-xs underline text-content-1" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
              <p className="mt-2 text-xs text-content-2">App updates from Google Play keep your sign-in and local data. Auto-update timing is controlled by Google Play and your device settings. Uninstalling or clearing app data removes the local session.</p>
            </SettingSection>
            </div>
            </div>

            {/* ============ DATA & BACKUP ============ */}
            <div hidden={selectedGroup !== 'account'} className="mt-5">
            <SettingSection id="settings-data" title="Data & Backup" icon={Database}>
              <SettingRow
                label="Categories, budgets & accounts"
                description="Manage spending categories, monthly budgets and linked bank accounts."
              >
                <SettingButton icon={Tags} iconClassName="text-content-3" onClick={() => {
                  setSelectedGroup(null);
                  requestAnimationFrame(() => {
                    categoriesMenuRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
                    categoriesMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
                  });
                }}>
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
                  aria-label="Select MINARTH JSON backup"
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

            </div>

            <div hidden={selectedGroup !== 'help'}>
              <SettingSection id="settings-help" title="Help and Support" icon={Headphones}>
                <SettingRow label="Payment capture on Android" description="Enable notification access and push alerts. If background alerts stop, check your phone's battery and autostart restrictions. Force-stopping the app prevents capture.">
                  <SettingButton onClick={() => setSelectedGroup('notifications')} icon={BellRing}>Notification settings</SettingButton>
                </SettingRow>
                <SettingRow label="Back up your data" description="Export a JSON backup before resetting data. Restore validates your file before replacing records.">
                  <SettingButton onClick={() => setSelectedGroup('account')} icon={Database}>Data & Backup</SettingButton>
                </SettingRow>
                <SettingRow label="Report an issue or request a feature" description="Get help through the project's GitHub issues. Never include private bank messages or account details.">
                  <a href="https://github.com/Sagar856/TMF-app/issues" target="_blank" rel="noreferrer" className="text-xs text-content-1 flex items-center gap-1.5">GitHub issues <ExternalLink className="w-3 h-3" /></a>
                </SettingRow>
              </SettingSection>
            </div>

            {/* ============ ABOUT ============ */}
            <div hidden={selectedGroup !== 'about'}>
            <SettingSection id="settings-about" title="About" icon={Info} iconClassName="text-content-3">
              <SettingRow label="Version" description="MINARTH · Clarity for your money">
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
        </section>

      <section ref={categoriesMenuRef} hidden={selectedGroup !== null} aria-label="Categories & Budgets" className="max-w-3xl mx-auto border-t border-line pt-5">
        {!customisationOpen && <h3 className="text-base font-bold text-content-1 mb-4">Categories &amp; Budgets</h3>}
        <CustomisationsView
          onSectionOpenChange={setCustomisationOpen}
          settingsSearch={settingsSearch}
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
        />
      </section>

      {showPasscodeSetup && (
        <PasscodeSetupModal
          onClose={() => setShowPasscodeSetup(false)}
          onSave={(credentials) => {
            update({ ...credentials, passcodeEnabled: true });
            setShowPasscodeSetup(false);
          }}
        />
      )}

    </div>
  );
};
