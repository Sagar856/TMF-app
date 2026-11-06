import React, { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { useDialog } from '../hooks/useDialog';
import { canCheckApkUpdates, checkForApkUpdate, CHECK_APP_UPDATE_EVENT, downloadAndInstallApk, startAutomaticUpdateChecks, type ApkUpdate } from '../services/appUpdates';

export function AppUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<ApkUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const manualRequested = useRef(false);
  const active = useRef(false);
  const ref = useDialog({ isOpen: open, onClose: () => { if (!busy) setOpen(false); } });

  useEffect(() => {
    if (!canCheckApkUpdates()) return;
    active.current = true;
    const check = async (manual: boolean) => {
      if (manual) {
        manualRequested.current = true;
        setOpen(true);
        setBusy(true);
        setMessage('Checking for updates...');
        setError('');
      }
      if (inFlight.current) return;
      inFlight.current = true;
      setUpdate(null);
      try {
        const result = await checkForApkUpdate();
        if (!active.current) return;
        setUpdate(result.update);
        setError('');
        setMessage(!result.installed.supported ? 'This installation uses store-managed updates. Check Google Play for updates.'
          : result.update ? `Version ${result.update.versionName}, build ${result.update.versionCode}, is available (${(result.update.size / 1024 / 1024).toFixed(1)} MB).`
          : `You are up to date (version ${result.installed.versionName}).`);
        if (manualRequested.current || result.update) setOpen(true);
      } catch (reason) {
        console.warn('Could not check for app updates:', reason);
        if (active.current && manualRequested.current) {
          setMessage('The update check could not be completed.');
          setError(reason instanceof Error ? reason.message : 'Could not check for updates. Please try again.');
        }
      } finally {
        inFlight.current = false;
        manualRequested.current = false;
        if (active.current) setBusy(false);
      }
    };
    const manualCheck = () => { void check(true); };
    const automaticCheck = () => {
      void startAutomaticUpdateChecks().catch(reason => console.warn('Could not enable background update notifications:', reason));
      void check(false);
    };
    window.addEventListener(CHECK_APP_UPDATE_EVENT, manualCheck);
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && active.current) automaticCheck();
    });
    void listener.catch(reason => console.warn('Could not listen for app resume update checks:', reason));
    const timer = setTimeout(automaticCheck, 2000);
    return () => {
      active.current = false;
      clearTimeout(timer);
      window.removeEventListener(CHECK_APP_UPDATE_EVENT, manualCheck);
      void listener.then(handle => handle.remove()).catch(reason => console.warn('Could not remove app update resume listener:', reason));
    };
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="app-update-title" tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-line bg-surface-1 text-content-1 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="app-update-title" className="text-base font-semibold">{update ? 'Update available' : 'App updates'}</h2>
          <button type="button" aria-label="Close app updates" disabled={busy} onClick={() => setOpen(false)} className="p-2 text-content-2 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>
        <p role="status" className="text-sm text-content-2">{message}</p>
        {update && <p className="text-xs text-content-3">The APK is downloaded and verified before Android asks you to approve installation. Your account and app data stay in place. Do not uninstall the app.</p>}
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-3 py-2 text-sm disabled:opacity-50">{update ? 'Later' : 'Close'}</button>
          {error && !update && <button type="button" disabled={busy} onClick={() => window.dispatchEvent(new Event(CHECK_APP_UPDATE_EVENT))} className="px-3 py-2 text-sm">Retry check</button>}
          {update && <button type="button" disabled={busy} onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setError('');
            setMessage('Downloading and verifying the update...');
            try {
              const result = await downloadAndInstallApk(update);
              if (!active.current) return;
              setMessage(result.status === 'permission-required'
                ? 'Allow updates from MINARTH in Android Settings, then return and tap Install update again.'
                : 'Android installer opened. Approve the update there. If you cancelled, tap Install update to try again.');
            } catch (reason) {
              console.warn('Could not install app update:', reason);
              if (active.current) setError(reason instanceof Error ? reason.message : 'Could not download or open the update. Please try again.');
            } finally {
              inFlight.current = false;
              if (active.current) setBusy(false);
            }
          }} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50"><Download className="h-4 w-4" />Install update</button>}
        </div>
      </div>
    </div>
  );
}
