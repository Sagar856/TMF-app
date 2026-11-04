import React, { useEffect, useRef, useState } from 'react';
import { useBackActivity } from '../../hooks/useActivityState';
import { Check, LogOut, Trash2, Upload, UserCircle2, Lock } from 'lucide-react';
import { UserSettings } from '../../types/finance';
import { createProfileThumbnail } from '../../utils/profilePhoto';
import { isStrongPassword } from '../../utils/passwordPolicy';
import { signInUser, updatePassword } from '../../services/supabaseClient';
import { PasswordField } from '../PasswordField';
import { SettingButton, SettingSection } from './SettingsPrimitives';

interface ProfileSettingsProps {
  settings: UserSettings;
  authUserEmail?: string | null;
  onUpdateSettings: (settings: UserSettings) => void;
  onSignOut?: () => void;
}

export function ProfileSettings({ settings, authUserEmail, onUpdateSettings, onSignOut }: ProfileSettingsProps) {
  const [name, setName] = useState(settings.userName || '');
  const email = authUserEmail || settings.userEmail || '';
  const [photo, setPhoto] = useState(settings.userPhoto || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const hasChanges = name.trim() !== (settings.userName || '').trim() || photo !== (settings.userPhoto || '');

  useEffect(() => {
    setName(settings.userName || '');
    setPhoto(settings.userPhoto || '');
  }, [settings.userName, settings.userPhoto]);

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setSaved(false);
    setUploading(true);
    try {
      setPhoto(await createProfileThumbnail(file));
    } catch (reason) {
      console.warn('Could not prepare profile photo:', reason);
      setError(reason instanceof Error ? reason.message : 'Could not prepare your profile photo.');
    } finally {
      setUploading(false);
    }
  };

  const inputClass = 'mt-2 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm text-content-1 focus:outline-none focus:border-violet-400';
  return (
    <div className="space-y-5">
      <SettingSection id="settings-profile" title="Profile settings" icon={UserCircle2} description="Your photo and personal details, shown across MINARTH.">
        <form onSubmit={event => {
          event.preventDefault();
          if (uploading || !hasChanges) return;
          if (!name.trim()) { setError('Enter a display name.'); return; }
          onUpdateSettings({ ...settings, userName: name.trim(), userPhoto: photo });
          setError('');
          setSaved(true);
        }} onChange={() => setSaved(false)} className="space-y-5 py-2">
          <div id="settings-profile-photo" className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4">
            {photo ? <img src={photo} alt="User Avatar" className="h-20 w-20 shrink-0 rounded-2xl object-cover border border-line" />
              : <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-3xl font-semibold text-white">{name.trim().charAt(0).toUpperCase() || 'U'}</div>}
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-sm font-semibold text-content-1">Profile picture</p>
              <p className="text-xs text-content-3">Images up to 5 MB are resized for your profile.</p>
              <input ref={fileInput} type="file" accept="image/*" aria-label="Select profile picture" className="hidden" disabled={uploading} onChange={event => void uploadPhoto(event)} />
              <div className="flex flex-wrap gap-2">
                <SettingButton icon={Upload} disabled={uploading} onClick={() => fileInput.current?.click()}>Upload Photo</SettingButton>
                {photo && <SettingButton icon={Trash2} disabled={uploading} onClick={() => { setPhoto(''); setSaved(false); }}>Remove</SettingButton>}
              </div>
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
          {uploading && <p role="status" className="text-xs text-content-3">Preparing photo...</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="profile-display-name" className="text-xs font-medium text-content-2">Display name
              <input id="profile-display-name" autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} required className={inputClass} />
            </label>
            <label htmlFor="profile-contact-email" className="text-xs font-medium text-content-2">Account email
              <input id="profile-contact-email" type="email" autoComplete="email" value={email} readOnly aria-describedby="profile-email-help" className={inputClass} />
            </label>
          </div>
          <p id="profile-email-help" className="text-xs leading-relaxed text-content-3">This email identifies your account and cannot be edited. Manage your password under Privacy &amp; Security.</p>
          <button type="submit" disabled={uploading || !hasChanges} className="flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white enabled:hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed">
            <Check className="h-4 w-4" />Save Changes
          </button>
          {saved && <p role="status" className="text-xs text-emerald-500">Profile updated successfully.</p>}
        </form>
      </SettingSection>
      {onSignOut && <div id="settings-profile-signout" className="flex justify-end border-t border-line pt-4"><SettingButton icon={LogOut} onClick={onSignOut}>Sign out</SettingButton></div>}
    </div>
  );
}

export function AccountPasswordSettings({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  useBackActivity(open, () => setOpen(false));
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  return (
    <SettingSection id="settings-password" title="Change password" icon={Lock} description="Confirm your current password before choosing a new one.">
      <SettingButton aria-expanded={open} aria-controls="settings-password-form" onClick={() => setOpen(value => !value)}>Change password</SettingButton>
      {open && <form id="settings-password-form" className="space-y-4 pt-4" onSubmit={async event => {
        event.preventDefault();
        setError('');
        setSuccess('');
        if (!email) { setError('Your sign-in email is unavailable. Sign in again before changing your password.'); return; }
        if (!current) { setError('Enter your current password.'); return; }
        if (!isStrongPassword(password)) { setError('Complete all password requirements.'); return; }
        if (password !== confirmation) { setError('New passwords do not match.'); return; }
        setBusy(true);
        try {
          await signInUser(email, current);
          await updatePassword(password);
          setCurrent('');
          setPassword('');
          setConfirmation('');
          setSuccess('Password updated. Sign in again with your new password.');
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Could not change your password. Please try again.');
        } finally {
          setBusy(false);
        }
      }}>
        <fieldset disabled={busy} className="space-y-4">
          <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" showRequirements />
          <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" matches={Boolean(confirmation && password === confirmation)} />
          <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Updating...' : 'Update password'}</button>
        </fieldset>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        {success && <p role="status" className="text-xs text-emerald-500">{success}</p>}
      </form>}
    </SettingSection>
  );
}
