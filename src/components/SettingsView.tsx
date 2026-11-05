import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { useActivityState, useBackActivity } from '../hooks/useActivityState';
import { UserSettings, Category, FinancialAccount, Transaction, InvestmentRecord } from '../types/finance';
import { BackupRestoreData, parseBackupJson } from '../utils/backup';
import { searchSettings, type SettingsGroup, type SettingsSearchEntry, type CustomisationSection } from '../utils/settingsSearch';
import { isNativeAndroid, isNotificationAccessGranted, requestNotificationAccess } from '../services/notificationListener';
import { requestPushNotificationPermission } from '../services/localNotifications';
import { requestDeviceLocationPermission } from '../services/locationService';
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
  ChevronRight,
  KeyRound,
  Upload,
  Search,
  ArrowLeft,
  Headphones,
  X,
} from 'lucide-react';
import { CustomisationsView } from './CustomisationsView';
import { PremiumComingSoon } from './PremiumComingSoon';
import { PasscodeSetupModal } from './PasscodeSetupModal';
import { PermissionDisclosureModal, type PermissionDisclosure } from './PermissionDisclosureModal';
import { BrokerPortfoliosSection } from './settings/BrokerPortfoliosSection';
import { AccountPasswordSettings, ProfileSettings } from './settings/ProfileSettings';
import { ColorPalettePicker } from './settings/ColorPalettePicker';
import { getCurrencyLocale } from '../utils/money';
import { getUiPalette } from '../utils/uiPalette';
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
  openProfileRequest?: number;
}

const SETTINGS_GROUPS = [
  { id: 'profile', label: 'Profile settings', icon: UserCircle2 },
  { id: 'account', label: 'Account setting', icon: Cloud },
  { id: 'notifications', label: 'Notifications', icon: BellRing },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'privacy', label: 'Privacy & Security', icon: Lock },
  { id: 'help', label: 'Help and Support', icon: Headphones },
  { id: 'about', label: 'About', icon: Info },
] as const;

const CURRENCIES = [
  { symbol: '₹', code: 'INR', locale: 'en-IN', name: '₹ INR' },
  { symbol: '$', code: 'USD', locale: 'en-US', name: '$ USD' },
  { symbol: '€', code: 'EUR', locale: 'de-DE', name: '€ EUR' },
  { symbol: '£', code: 'GBP', locale: 'en-GB', name: '£ GBP' },
];

const REGIONS = [
  { locale: 'en-IN', name: 'India · English' },
  { locale: 'en-US', name: 'United States · English' },
  { locale: 'en-GB', name: 'United Kingdom · English' },
  { locale: 'de-DE', name: 'Germany · German' },
  { locale: 'fr-FR', name: 'France · French' },
  { locale: 'en-CA', name: 'Canada · English' },
  { locale: 'en-AU', name: 'Australia · English' },
  { locale: 'ja-JP', name: 'Japan · Japanese' },
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
  openProfileRequest = 0,
}) => {
  const [selectedGroup, setSelectedGroup] = useActivityState<SettingsGroup | null>('settings.group', () =>
    openProfileRequest > 0 ? 'profile' :
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('delete-account') ? 'account' : null
  );
  const [notificationDisclosureAccepted, setNotificationDisclosureAccepted] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useActivityState('settings.colorPickerOpen', false);
  const colorPageHeadingRef = useRef<HTMLHeadingElement>(null);
  const colorEntryRef = useRef<HTMLButtonElement>(null);
  const colorPageWasOpen = useRef(false);
  const showingColorPicker = colorPickerOpen && selectedGroup === 'appearance';
  useEffect(() => {
    if (showingColorPicker) {
      colorPageHeadingRef.current?.focus();
      colorPageHeadingRef.current?.scrollIntoView({ block: 'start' });
    } else if (colorPageWasOpen.current && selectedGroup === 'appearance') {
      colorEntryRef.current?.focus();
    }
    colorPageWasOpen.current = showingColorPicker;
  }, [showingColorPicker, selectedGroup]);
  const [permissionDisclosure, setPermissionDisclosure] = useState<PermissionDisclosure | null>(null);
  const [permissionRequestBusy, setPermissionRequestBusy] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState('');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [customisationOpen, setCustomisationOpen] = useActivityState('settings.customisationOpen', false);
  const [openAccountsRequest, setOpenAccountsRequest] = useState(0);
  const [resetCustomisationRequest, setResetCustomisationRequest] = useState(0);
  const [openSectionRequest, setOpenSectionRequest] = useState<{ section: CustomisationSection; requestId: number }>();
  const [searchTarget, setSearchTarget] = useState<{ id: string; requestId: number }>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLUListElement>(null);
  const categoriesMenuRef = useRef<HTMLElement>(null);
  const groupHeadingRef = useRef<HTMLHeadingElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const lastGroupRef = useRef<SettingsGroup | null>(null);
  const isSearching = settingsSearch.trim().length > 0;
  const searchResults = useMemo(() => searchSettings(settingsSearch, {
    isAuthenticated,
    canDeleteAccount: Boolean(onDeleteUserAccount),
    canSignOut: Boolean(onSignOut),
    passcodeEnabled: settings.passcodeEnabled,
  }), [settingsSearch, isAuthenticated, onDeleteUserAccount, onSignOut, settings.passcodeEnabled]);

  const changeSearch = (value: string) => {
    setColorPickerOpen(false);
    setSettingsSearch(value);
    setSelectedGroup(null);
    setSearchTarget(undefined);
    lastGroupRef.current = null;
    if (customisationOpen) {
      setCustomisationOpen(false);
      setResetCustomisationRequest(request => request + 1);
    }
  };

  const openSearchResult = (entry: SettingsSearchEntry) => {
    setColorPickerOpen(false);
    setSettingsSearch('');
    if (entry.section) {
      const section = entry.section;
      setSelectedGroup(null);
      setOpenSectionRequest(previous => ({ section, requestId: (previous?.requestId || 0) + 1 }));
    } else if (entry.group) {
      setCustomisationOpen(false);
      setSelectedGroup(entry.group);
    }
    const targetId = !settings.passcodeEnabled && (entry.id === 'biometrics' || entry.id === 'auto-lock') ? 'sw-passcode' : entry.targetId;
    setSearchTarget(previous => ({ id: targetId, requestId: (previous?.requestId || 0) + 1 }));
  };

  useEffect(() => {
    if (!searchTarget || isSearching) return;
    let target: HTMLElement | null = null;
    let previousTabIndex: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(searchTarget.id);
      if (!element || element.closest('[hidden]')) return;
      target = element.matches(':disabled') ? element.closest<HTMLElement>('[data-setting-row]') || element : element;
      previousTabIndex = target.getAttribute('tabindex');
      target.setAttribute('tabindex', '-1');
      target.setAttribute('data-settings-search-target', 'true');
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      timer = setTimeout(() => target?.removeAttribute('data-settings-search-target'), 4000);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      if (target) {
        target.removeAttribute('data-settings-search-target');
        if (previousTabIndex === null) target.removeAttribute('tabindex');
        else target.setAttribute('tabindex', previousTabIndex);
      }
    };
  }, [searchTarget, isSearching, selectedGroup, customisationOpen]);

  useEffect(() => {
    if (!openProfileRequest) return;
    setColorPickerOpen(false);
    setSettingsSearch('');
    setOpenAccountsRequest(0);
    setSearchTarget(undefined);
    setResetCustomisationRequest(request => request + 1);
    setCustomisationOpen(false);
    setSelectedGroup('profile');
  }, [openProfileRequest]);

  const update = (patch: Partial<UserSettings>) => onUpdateSettings({ ...settings, ...patch });

  /* ---------------- Android notification access ---------------- */
  const isAndroid = isNativeAndroid();
  const [notifAccessGranted, setNotifAccessGranted] = useState<boolean>(false);
  const [notificationAccessError, setNotificationAccessError] = useState('');
  useEffect(() => {
    if (!isAndroid) return;
    let active = true;
    const refresh = () => {
      void isNotificationAccessGranted().then(granted => { if (active) setNotifAccessGranted(granted); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh(); });
    void listener.catch(error => {
      console.warn('Could not monitor notification access:', error);
      if (active) setNotificationAccessError('Could not refresh notification access automatically. Reopen Settings to check it.');
    });
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      void listener.then(handle => handle.remove(), () => {}).catch(error => console.warn('Could not remove notification access monitor:', error));
    };
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
    setPermissionDisclosure('notifications');
  };

  const handleAllowPermission = async () => {
    if (!permissionDisclosure) return;
    setPermissionRequestBusy(true);
    try {
      if (permissionDisclosure === 'biometrics') {
        await handleEnableBiometric();
        return;
      }
      if (permissionDisclosure === 'notifications') {
        setRequestingNotificationPermission(true);
        const granted = await requestPushNotificationPermission();
        if (!granted) {
          setNotificationPermissionError('Notification permission was not granted. Allow notifications in your browser or device settings.');
          return;
        }
        onUpdateSettings({ ...latestSettingsRef.current, notificationsEnabled: true });
      } else {
        setLocationPermissionError('');
        const granted = await requestDeviceLocationPermission();
        if (!granted) {
          setLocationPermissionError('Location permission was not granted. Allow location access in your device or browser settings, then try again.');
          return;
        }
        onUpdateSettings({ ...latestSettingsRef.current, locationTracking: true });
      }
    } catch (error) {
      console.warn(`Could not request ${permissionDisclosure} permission:`, error);
      if (permissionDisclosure === 'biometrics') {
        setBiometricError('Could not enable biometric unlock. Please try again or use your PIN.');
      } else if (permissionDisclosure === 'notifications') {
        setNotificationPermissionError('Could not request notification permission. Please try again.');
      } else {
        setLocationPermissionError('Could not request location permission. Please try again.');
      }
    } finally {
      setRequestingNotificationPermission(false);
      setPermissionRequestBusy(false);
      setPermissionDisclosure(null);
    }
  };

  const handleToggleLocation = (next: boolean) => {
    setLocationPermissionError('');
    if (!next) {
      update({ locationTracking: false });
      return;
    }
    setPermissionDisclosure('location');
  };

  /* ---------------- Passcode ---------------- */
  const [showPasscodeSetup, setShowPasscodeSetup] = useState(false);
  useBackActivity(showPasscodeSetup, () => setShowPasscodeSetup(false));
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
    setPermissionDisclosure('biometrics');
  };
  const handleEnableBiometric = async () => {
    setBiometricBusy(true);
    try {
      const ok = await enrollBiometric(authUserEmail || settings.userEmail || settings.userName || 'MINARTH');
      if (!ok) {
        setBiometricError('Biometric enrolment was cancelled or is not supported here. You can keep using the PIN.');
        return;
      }
      onUpdateSettings({ ...latestSettingsRef.current, biometricUnlockEnabled: true });
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
  }, [selectedGroup, openProfileRequest]);

  const theme = settings.theme || 'dark';
  const sampleLoaded = settings.sampleDataLoaded !== false;

  if (showingColorPicker) {
    return (
      <section className="settings-glass palette-selection-page mx-auto max-w-3xl" aria-labelledby="color-page-title">
        <div className="palette-page-header flex items-center gap-3">
          <button type="button" onClick={() => setColorPickerOpen(false)}
            aria-label="Back to Appearance" className="rounded-xl border border-line p-2 text-content-1">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 id="color-page-title" ref={colorPageHeadingRef} tabIndex={-1}
            className="text-lg font-bold text-content-1">Choose your UI experience</h2>
        </div>
        <ColorPalettePicker value={settings.colorPalette || 'purple'} currencySymbol={settings.currencySymbol}
          onChange={colorPalette => update({ colorPalette })} />
      </section>
    );
  }

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
                ref={searchInputRef}
                type="search"
                value={settingsSearch}
                onChange={event => changeSearch(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    changeSearch('');
                  } else if (isSearching && (event.key === 'ArrowDown' || event.key === 'Enter')) {
                    event.preventDefault();
                    if (event.key === 'Enter' && searchResults[0]) openSearchResult(searchResults[0]);
                    else searchResultsRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
                  }
                }}
                aria-controls={isSearching ? 'settings-search-results' : undefined}
                aria-describedby={isSearching ? 'settings-search-status' : undefined}
                aria-label="Search settings"
                placeholder="Search settings..."
                className="w-full h-10 pl-9 pr-10 rounded-lg bg-surface-2 text-xs text-content-1 border border-line focus:outline-none focus:border-red-500"
              />
              {settingsSearch && <button type="button" aria-label="Clear settings search" className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-content-2 hover:text-content-1" onClick={() => {
                changeSearch('');
                searchInputRef.current?.focus();
              }}><X aria-hidden="true" className="h-4 w-4" /></button>}
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
        <p className="text-[10px] text-content-3">
          {isAuthenticated
            ? 'Account preferences sync automatically after changes. Device permissions and app-lock settings stay on this device.'
            : 'Settings save automatically on this device. Sign in to sync account preferences.'}
        </p>

      </div>

      {isSearching && (
        <section aria-labelledby="settings-search-heading" className="max-w-3xl mx-auto space-y-3">
          <h3 id="settings-search-heading" className="text-base font-bold text-content-1">Search results</h3>
          <p id="settings-search-status" role="status" aria-live="polite" className="text-xs text-content-3">
            {searchResults.length ? `${searchResults.length} ${searchResults.length === 1 ? 'setting' : 'settings'} found` : 'No settings found. Try a term such as password, backup, theme or bank account.'}
          </p>
          <ul id="settings-search-results" ref={searchResultsRef} className="rounded-2xl bg-surface-1 border border-line divide-y divide-line" onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              changeSearch('');
              searchInputRef.current?.focus();
              return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const buttons = Array.from<HTMLButtonElement>(searchResultsRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
            const index = buttons.findIndex(button => button === document.activeElement);
            if (index < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}>
            {searchResults.map(result => (
              <li key={result.id}>
                <button type="button" data-settings-result={result.id} onClick={() => openSearchResult(result)} className="flex w-full items-center gap-3 px-4 py-4 text-left text-content-1 rounded-xl hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-red-500">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm font-semibold">{result.title}</span>
                    <span className="block text-[11px] text-content-2">{result.path}</span>
                    <span className="block text-xs text-content-3">{result.description}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-content-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
        <section hidden={isSearching || customisationOpen} aria-labelledby="preferences-heading" className="max-w-3xl mx-auto">
          <h3 id="preferences-heading" className="text-base font-bold text-content-1 mb-4">Preferences</h3>
          <div hidden={selectedGroup !== null}>
          <nav
            ref={menuRef}
            aria-label="Settings sections"
            className="rounded-2xl bg-surface-1 border border-line divide-y divide-[var(--border-nothing)] px-4"
          >
            {SETTINGS_GROUPS.map((group) => {
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
          </div>
          {selectedGroup && (
            <div className="flex items-center gap-3 mb-5">
              <SettingButton icon={ArrowLeft} onClick={() => setSelectedGroup(null)} aria-label="Back to settings menu">Back</SettingButton>
              <h3 ref={groupHeadingRef} tabIndex={-1} className="text-base font-bold text-content-1 focus:outline-none">{SETTINGS_GROUPS.find(group => group.id === selectedGroup)?.label}</h3>
            </div>
          )}
          <div className="min-w-0">
            <div hidden={selectedGroup !== 'profile'}>
              <ProfileSettings settings={settings} authUserEmail={authUserEmail} onUpdateSettings={onUpdateSettings} onSignOut={isAuthenticated ? onSignOut : undefined} />
            </div>
            <div hidden={selectedGroup !== 'account'}>
            <div className="space-y-5">
            {/* ============ PROFILE & ACCOUNT ============ */}
            <SettingSection
              id="settings-account"
              title="Account setting"
              icon={UserCircle2}
              iconClassName="text-red-500"
              badge={
                <StatusPill tone={cloudTone}>
                  {!isAuthenticated ? 'Local only' : cloudTone === 'red' ? 'Sync failed' : cloudTone === 'amber' ? 'Sync warning' : 'Cloud synced'}
                </StatusPill>
              }
            >
              <SettingRow
                id="settings-cloud-sync"
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
              <SettingRow id="settings-plan" label="Plan" description="Manual tracking and notification-based spending capture are free.">
                <PremiumComingSoon />
              </SettingRow>
            </SettingSection>
            </div>
            </div>

            {/* ============ APPEARANCE ============ */}
            <div hidden={selectedGroup !== 'appearance'}>
            <div className="space-y-5">
            <SettingSection id="settings-appearance" title="Appearance & Display" icon={Palette}>
              <SettingRow
                id="settings-theme"
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

              <button id="settings-color-palette" ref={colorEntryRef} type="button"
                data-setting-row="" onClick={() => setColorPickerOpen(true)} aria-label="App UI color"
                className="palette-settings-row flex w-full items-center justify-between gap-3 py-3 text-left text-content-1">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold">App UI color</span>
                  <span className="mt-0.5 block text-[10px] text-content-3">Preview and apply your color gradient.</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-xs">
                  <span className="palette-swatch h-5 w-6 rounded-md" aria-hidden="true" />
                  <span>{getUiPalette(settings.colorPalette).name}</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </button>

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
                description="Changes the display currency, not amounts or exchange rates."
                htmlFor="settings-currency-select"
                badge={<StatusPill tone="neutral">{settings.currencyCode} · {settings.currencySymbol}</StatusPill>}
                stacked
              >
                <select id="settings-currency-select" className="settings-region-select w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs text-content-1"
                  value={settings.currencyCode} onChange={event => {
                    const currency = CURRENCIES.find(currency => currency.code === event.target.value);
                    if (!currency) throw new TypeError('Invalid currency selection.');
                    update({ currencySymbol: currency.symbol, currencyCode: currency.code,
                      locale: settings.locale || getCurrencyLocale(settings.currencyCode) });
                  }}>
                  {!CURRENCIES.some(currency => currency.code === settings.currencyCode) && (
                    <option value={settings.currencyCode}>{settings.currencySymbol} {settings.currencyCode} (current)</option>
                  )}
                  {CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.name}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="settings-region-format" label="Region & number format"
                description="Choose digit grouping and decimal separators independently of currency."
                htmlFor="settings-region-select" stacked>
                <select id="settings-region-select" className="settings-region-select w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs text-content-1"
                  value={settings.locale || getCurrencyLocale(settings.currencyCode)}
                  onChange={event => update({ locale: event.target.value })}>
                  {settings.locale && !REGIONS.some(region => region.locale === settings.locale) && (
                    <option value={settings.locale}>{settings.locale} (current)</option>
                  )}
                  {REGIONS.map(region => <option key={region.locale} value={region.locale}>
                    {region.name} · {new Intl.NumberFormat(region.locale, { minimumFractionDigits: 2 }).format(1234567.89)}
                  </option>)}
                </select>
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
                  id="settings-notification-access"
                  label="Notification access"
                  description="MINARTH reads bank and UPI notifications, including in the background, to detect payments. Parsed transactions and their source message text may sync to your private cloud account when saved. Other notifications are not used for financial tracking."
                  badge={<StatusPill tone={notifAccessGranted ? 'emerald' : 'red'}>{notifAccessGranted ? 'Granted' : 'Not granted'}</StatusPill>}
                >
                  <SettingButton
                    disabled={!notifAccessGranted && !notificationDisclosureAccepted}
                    icon={BellRing}
                    iconClassName="text-red-500"
                    onClick={async () => {
                      setNotificationAccessError('');
                      try {
                        await requestNotificationAccess();
                      } catch (error) {
                        console.warn('Could not open notification access settings:', error);
                        setNotificationAccessError('Could not open Android notification access settings. Please try again.');
                      }
                    }}
                  >
                    {notifAccessGranted ? 'Review' : 'Grant access'}
                  </SettingButton>
                </SettingRow>
              ) : (
                <SettingRow
                  id="settings-notification-access"
                  label="Notification access"
                  description="Automatic capture of bank/UPI alerts is available in the Android app. Use manual entry on the web."
                  badge={<StatusPill tone="neutral">Android only</StatusPill>}
                />
              )}
              {notificationAccessError && <p role="alert" className="py-2 text-[11px] text-red-400">{notificationAccessError}</p>}
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
            {isAuthenticated && <AccountPasswordSettings email={authUserEmail || ''} />}
            <SettingSection id="settings-security" title="Security & Privacy" icon={Lock}>
              <SettingRow label="Mask balances by default" description="Hide net worth and totals until you tap the eye icon." htmlFor="sw-mask-balances">
                <SettingSwitch id="sw-mask-balances" label="Mask balances by default" checked={settings.defaultNetWorthMasked !== false} onChange={v => update({ defaultNetWorthMasked: v })} />
              </SettingRow>
              <SettingRow label="Location tagging" description="Optional foreground location access. Coordinates go to BigDataCloud or OpenStreetMap Nominatim to resolve a place name, even before saving. Saved locations sync with your private financial records." htmlFor="sw-location">
                <SettingSwitch id="sw-location" label="Location tagging" checked={settings.locationTracking} onChange={handleToggleLocation} />
              </SettingRow>
              {locationPermissionError && <p role="alert" className="py-2 text-[11px] text-red-600 dark:text-red-400">{locationPermissionError}</p>}
              <SettingRow
                label="App passcode protection"
                description="Require a 4–6 digit PIN every time the app opens."
                htmlFor="sw-passcode"
                badge={settings.passcodeEnabled ? <StatusPill tone="emerald">On</StatusPill> : undefined}
              >
                {settings.passcodeEnabled && (
                  <SettingButton id="settings-change-pin" icon={KeyRound} iconClassName="text-content-3" onClick={() => setShowPasscodeSetup(true)}>
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
                    id="settings-auto-lock"
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
                id="settings-delete-confirmations"
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
                <SettingButton icon={Building2} iconClassName="text-content-3" onClick={() => {
                  setSettingsSearch('');
                  setSelectedGroup(null);
                  setOpenAccountsRequest(request => request + 1);
                }}>Manage accounts</SettingButton>
              </SettingRow>

              <SettingRow
                id="settings-export"
                label="Export backup (JSON)"
                description="All transactions, investments, loans, categories, accounts and preferences in one file."
              >
                <SettingButton icon={Download} iconClassName="text-red-500" onClick={onExportBackupJSON}>
                  Export
                </SettingButton>
              </SettingRow>

              <SettingRow
                id="settings-restore"
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
            <div className="pt-5">
              <SettingSection id="settings-danger" title="Danger zone" icon={Trash2} iconClassName="text-red-600" tone="danger">
                <SettingRow id="settings-reset-data" label="Reset all data" description="Permanently wipes all local and cloud accounts, transactions, investments, loans and categories. Export a backup first.">
                  <SettingButton variant="danger" icon={Trash2} onClick={onResetAllData}>Reset all data</SettingButton>
                </SettingRow>
                {isAuthenticated && onDeleteUserAccount && (
                  <SettingRow id="settings-delete-account" label="Delete account" description="Permanently delete your sign-in account and associated cloud data. This is different from resetting your records.">
                    <SettingButton variant="danger" icon={Trash2} onClick={onDeleteUserAccount}>Delete account</SettingButton>
                  </SettingRow>
                )}
              </SettingSection>
            </div>
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
                <SettingRow id="settings-report-issue" label="Report an issue or request a feature" description="Get help through the project's GitHub issues. Never include private bank messages or account details.">
                  <a href="https://github.com/Sagar856/TMF-app/issues" target="_blank" rel="noreferrer" className="text-xs text-content-1 flex items-center gap-1.5">GitHub issues <ExternalLink className="w-3 h-3" /></a>
                </SettingRow>
              </SettingSection>
            </div>

            {/* ============ ABOUT ============ */}
            <div hidden={selectedGroup !== 'about'}>
            <SettingSection id="settings-about" title="About" icon={Info} iconClassName="text-content-3">
              <SettingRow id="settings-version" label="Version" description="MINARTH · Clarity for your money">
                <StatusPill tone="neutral">v{__APP_VERSION__}</StatusPill>
              </SettingRow>
              <SettingRow
                id="settings-android"
                label="Android app"
                description={isAndroid ? 'Installed Android app. Updates are delivered through Google Play for Play installations.' : 'Install the Android test APK to enable on-device UPI/SMS capture. This sideload build is not a Play Store release.'}
              >
                {!isAndroid && <a
                  href="https://sagar856.github.io/TMF-app/downloads/TMF-app.apk"
                  className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl bg-surface-2 hover:bg-surface-3 border border-line text-content-1 flex items-center gap-2 transition-colors"
                  download
                >
                  <Download className="w-3.5 h-3.5 text-emerald-500" />
                  Download test APK
                </a>}
              </SettingRow>
              <SettingRow id="settings-source" label="Open source" description="Issues and feature requests are welcome.">
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

      <section ref={categoriesMenuRef} hidden={isSearching || selectedGroup !== null} aria-label="Categories & Budgets" className="max-w-3xl mx-auto border-t border-line pt-5">
        {!customisationOpen && <h3 className="text-base font-bold text-content-1 mb-4">Categories &amp; Budgets</h3>}
        <CustomisationsView
          resetToMenuRequest={resetCustomisationRequest}
          openSectionRequest={openSectionRequest}
          openAccountsRequest={openAccountsRequest}
          onSectionOpenChange={setCustomisationOpen}
          settingsSearch=""
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
          accountsFooter={<div id="settings-brokers" className="scroll-mt-24"><BrokerPortfoliosSection settings={settings} investments={investments} onUpdateSettings={onUpdateSettings} /></div>}
        />
      </section>

      {!isSearching && selectedGroup === null && !customisationOpen && isAuthenticated && onSignOut && (
        <div className="max-w-3xl mx-auto flex justify-end border-t border-line pt-5">
          <SettingButton icon={LogOut} onClick={onSignOut}>Sign out</SettingButton>
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

      {permissionDisclosure && (
        <PermissionDisclosureModal
          permission={permissionDisclosure}
          busy={permissionRequestBusy}
          onAllow={() => void handleAllowPermission()}
          onCancel={() => {
            if (permissionRequestBusy) return;
            setPermissionDisclosure(null);
          }}
        />
      )}

    </div>
  );
};
