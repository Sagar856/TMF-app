import React, { useRef, useState } from 'react';
import { AppWalkthrough } from './AppWalkthrough';
import { PermissionDisclosureModal, type PermissionDisclosure } from './PermissionDisclosureModal';
import { PasscodeSetupModal } from './PasscodeSetupModal';
import { useDialog } from '../hooks/useDialog';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { requestPushNotificationPermission } from '../services/localNotifications';
import { requestDeviceLocationPermission } from '../services/locationService';
import { enrollBiometric } from '../services/biometric';
import type { UserSettings } from '../types/finance';
import type { ThemePreference } from '../utils/theme';

const PERMISSIONS: PermissionDisclosure[] = ['notifications', 'location', 'biometrics'];

export function needsFirstLoginSetup(userId: string): boolean {
  return safeGetItem(`tmf_first_login_setup_v1_${userId}`) !== 'complete'
    && safeGetItem(`tmf_walkthrough_v1_${userId}`) !== 'complete';
}

export const FirstLoginSetup: React.FC<{
  userId: string;
  settings: UserSettings;
  onUpdate: (patch: Partial<UserSettings>) => void;
  onNavigate: (tab: string) => void;
}> = ({ userId, settings, onUpdate, onNavigate }) => {
  const [open, setOpen] = useState(() => needsFirstLoginSetup(userId));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [pinSetup, setPinSetup] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<ThemePreference>(settings.theme || 'system');
  const next = () => { setError(''); setStep(value => value + 1); };
  const finish = () => {
    onUpdate({ theme });
    if (!safeSetItem(`tmf_first_login_setup_v1_${userId}`, 'complete')) {
      setError('Could not save your setup preference. Please try again.');
      return;
    };
    setOpen(false);
  };
  const themeRef = useDialog<HTMLElement>({ isOpen: open && step === PERMISSIONS.length, onClose: finish });
  const allow = async () => {
    if (busyRef.current) return;
    const permission = PERMISSIONS[step];
    if (permission === 'biometrics' && (!settings.passcodeEnabled || !settings.passcodeHash || !settings.passcodeSalt)) {
      setPinSetup(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const granted = permission === 'notifications' ? await requestPushNotificationPermission()
        : permission === 'location' ? await requestDeviceLocationPermission()
        : await enrollBiometric(settings.userEmail || settings.userName || 'MINARTH');
      if (!granted) {
        setError(permission === 'biometrics'
          ? 'Biometric setup was cancelled or is unavailable. Set up fingerprint or face recognition in device Settings, retry, or choose Not now. Your app PIN remains available.'
          : 'Permission was not granted. You can retry, allow access in device Settings, or choose Not now.');
        return;
      }
      onUpdate(permission === 'notifications' ? { notificationsEnabled: true }
        : permission === 'location' ? { locationTracking: true } : { biometricUnlockEnabled: true });
      next();
    } catch (cause) {
      console.warn(`First-login ${permission} setup failed:`, cause);
      setError('Could not complete this request. Please retry or choose Not now.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  if (!open) return <AppWalkthrough userId={userId} onNavigate={onNavigate} />;
  if (pinSetup) return <PasscodeSetupModal onClose={() => setPinSetup(false)} onSave={credentials => {
    onUpdate({ ...credentials, passcodeEnabled: true });
    setPinSetup(false);
  }} />;
  if (step < PERMISSIONS.length) return <PermissionDisclosureModal key={PERMISSIONS[step]} permission={PERMISSIONS[step]} busy={busy}
    error={error} onAllow={() => { void allow(); }} onCancel={next} />;
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-4 backdrop-blur-md">
      <section ref={themeRef} role="dialog" aria-modal="true" aria-labelledby="first-theme-title"
        className="finance-dialog-glass w-full max-w-sm rounded-3xl border p-5 text-content-1 shadow-2xl">
        <h2 id="first-theme-title" className="text-lg font-bold">Choose your theme</h2>
        <p className="mt-2 text-xs text-content-2">Same as system follows Android or your device's light/dark setting, including changes while the app is open.</p>
        <div role="radiogroup" aria-label="App theme" className="my-4 flex flex-col gap-2">
          {(['dark', 'light', 'system'] as const).map(value => <label key={value}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${theme === value ? 'border-violet-400 bg-violet-500/20' : 'border-line bg-surface-2'}`}>
            <input type="radio" name="first-login-theme" value={value} checked={theme === value}
              onChange={() => { setTheme(value); onUpdate({ theme: value }); }} />
            {value === 'system' ? 'Same as system' : value === 'dark' ? 'Dark' : 'Light'}
          </label>)}
        </div>
        {error && <p role="alert" className="mb-3 text-xs">{error}</p>}
        <button type="button" onClick={finish} className="min-h-11 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-3 text-sm font-bold text-white">Continue to walkthrough</button>
      </section>
    </div>
  );
}
