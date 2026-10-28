import React, { useRef, useState } from 'react';
import { createPasscodeCredentials, getWeakPinReason, PasscodeCredentials } from '../utils/passcode';
import { useDialog } from '../hooks/useDialog';

interface PasscodeSetupModalProps {
  onSave: (credentials: PasscodeCredentials) => void;
  onClose: () => void;
}

export const PasscodeSetupModal: React.FC<PasscodeSetupModalProps> = ({ onSave, onClose }) => {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const dialogRef = useDialog<HTMLElement>({ isOpen: true, onClose, autoFocus: false });

  const weakReason = pin.length >= 4 ? getWeakPinReason(pin) : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const reason = getWeakPinReason(pin);
    if (reason) {
      setError(reason);
      return;
    }
    if (pin !== confirmation) {
      setError('PINs do not match.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const credentials = await createPasscodeCredentials(pin);
      setPin('');
      setConfirmation('');
      onSaveRef.current(credentials);
    } catch (err) {
      console.warn('Could not set passcode:', err);
      setError('Could not secure your PIN. Please try again on a secure connection.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop backdrop-blur-md p-4 font-mono">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="passcode-setup-title" tabIndex={-1} className="w-full max-w-sm bg-surface-1 border border-line rounded-3xl p-6 text-content-1 shadow-2xl outline-none">
        <h3 id="passcode-setup-title" className="text-sm font-bold uppercase">Set App Passcode</h3>
        <p className="text-xs text-content-3 mt-2 mb-4">Choose and confirm a 4-6 digit PIN. Avoid repeated or sequential digits. App lock applies on the next launch.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs">
            New PIN
            <input autoFocus type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} disabled={saving}
              onChange={event => { setPin(event.target.value.replace(/\D/g, '')); setError(''); }}
              aria-invalid={weakReason ? true : undefined}
              className="mt-1 w-full bg-surface-3 border border-line rounded-xl p-3 tracking-[0.3em] text-content-1 focus:outline-none focus:border-red-600" />
          </label>
          {weakReason && !error && <p className="text-[11px] text-amber-600 dark:text-amber-400">{weakReason}</p>}
          <label className="block text-xs">
            Confirm PIN
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirmation} disabled={saving}
              onChange={event => { setConfirmation(event.target.value.replace(/\D/g, '')); setError(''); }}
              className="mt-1 w-full bg-surface-3 border border-line rounded-xl p-3 tracking-[0.3em] text-content-1 focus:outline-none focus:border-red-600" />
          </label>
          {error && <p role="alert" className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" disabled={saving} onClick={onClose} className="flex-1 py-2 bg-surface-2 border border-line rounded-xl text-xs text-content-2 hover:text-content-1 disabled:opacity-40 cursor-pointer">Cancel</button>
            <button type="submit" disabled={saving || Boolean(weakReason) || !/^\d{4,6}$/.test(pin) || pin !== confirmation}
              className="flex-1 py-2 bg-red-600 text-white rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer">
              {saving ? 'Saving...' : 'Save PIN'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
