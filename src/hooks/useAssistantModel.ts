import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantRuntime } from '../services/assistantRuntime';
import { ASSISTANT_STORAGE_BYTES, isAssistantModelSupported } from '../services/assistantModel';
import { safeGetItem, safeSetItem } from '../utils/storage';

const ENABLED_KEY = 'tmf_local_assistant_enabled';

export function useAssistantModel() {
  const runtimeRef = useRef<AssistantRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new AssistantRuntime();
  const runtime = runtimeRef.current;
  const [enabled, setEnabledState] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const available = isAssistantModelSupported();
    setSupported(available);
    if (!available) {
      setError('This device or browser does not support the local AI worker and safe model storage required by MINARTH.');
      setReady(true);
      return () => { active = false; };
    }
    void runtime.installed().then(value => {
      if (!active) return;
      setInstalled(value);
      setEnabledState(value && safeGetItem(ENABLED_KEY) === 'true');
      setReady(true);
    }).catch(reason => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : 'Could not check local AI availability.');
      setReady(true);
    });
    return () => { active = false; };
  }, [runtime]);

  const setEnabled = useCallback((next: boolean) => {
    if (next && !installed) {
      setError('Download the local AI model before enabling MINA.');
      return;
    }
    if (!safeSetItem(ENABLED_KEY, String(next))) {
      setError('Could not save the MINA setting on this device.');
      return;
    }
    if (!next) void runtime.stop().catch(reason => {
      setError(reason instanceof Error ? reason.message : 'Could not stop local AI.');
    });
    setEnabledState(next);
    setError('');
  }, [installed, runtime]);

  const install = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setProgress({ loaded: 0, total: ASSISTANT_STORAGE_BYTES });
    try {
      await runtime.install((loaded, total) => setProgress({ loaded, total }));
      setInstalled(true);
      if (!safeSetItem(ENABLED_KEY, 'true')) {
        setError('Model downloaded, but AI could not be enabled because this device could not save the setting.');
        return;
      }
      setEnabledState(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download the local AI model.');
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, [busy, runtime]);

  const cancelInstall = useCallback(async () => {
    try {
      await runtime.cancelInstall();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not cancel model installation.');
    }
  }, [runtime]);

  const remove = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!safeSetItem(ENABLED_KEY, 'false')) {
        throw new Error('Could not disable MINA on this device.');
      }
      setEnabledState(false);
      await runtime.remove();
      setInstalled(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the local AI model.');
    } finally {
      setBusy(false);
    }
  }, [runtime]);

  return {
    runtime, enabled, installed, supported, ready, busy, error, progress,
    setEnabled, install, cancelInstall, remove,
    storageBytes: ASSISTANT_STORAGE_BYTES,
  };
}
