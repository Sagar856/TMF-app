import React, { useRef, useState } from 'react';
import { createPasscodeCredentials, PasscodeCredentials } from '../utils/passcode';

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter a 4-6 digit PIN.');
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-mono">
      <section role="dialog" aria-modal="true" aria-labelledby="passcode-setup-title" className="w-full max-w-sm bg-carbon border border-nothing rounded-3xl p-6 text-white shadow-2xl">
        <h3 id="passcode-setup-title" className="text-sm font-bold uppercase">Set App Passcode</h3>
        <p className="text-xs text-[#888] mt-2 mb-4">Choose and confirm a 4-6 digit PIN. App lock applies on the next launch.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs">
            New PIN
            <input autoFocus type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} disabled={saving}
              onChange={event => setPin(event.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full bg-obsidian border border-nothing rounded-xl p-3 tracking-[0.3em] focus:outline-none focus:border-red-600" />
          </label>
          <label className="block text-xs">
            Confirm PIN
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={confirmation} disabled={saving}
              onChange={event => setConfirmation(event.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full bg-obsidian border border-nothing rounded-xl p-3 tracking-[0.3em] focus:outline-none focus:border-red-600" />
          </label>
          {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" disabled={saving} onClick={onClose} className="flex-1 py-2 bg-obsidian border border-nothing rounded-xl text-xs disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={saving || !/^\d{4,6}$/.test(pin) || pin !== confirmation}
              className="flex-1 py-2 bg-red-600 rounded-xl text-xs font-bold disabled:opacity-40">
              {saving ? 'Saving...' : 'Save PIN'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
