import React, { useEffect, useRef, useState } from 'react';
import { X, Mail, CheckCircle2 } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { PasswordField } from './PasswordField';
import { UserSettings } from '../types/finance';
import { useDialog } from '../hooks/useDialog';
import { isStrongPassword } from '../utils/passwordPolicy';
import { createEmailRegistration, EmailAlreadyRegisteredError, getSupabaseClient, sendPasswordResetEmail, signInUser, updatePassword } from '../services/supabaseClient';

type AuthMode = 'login' | 'register' | 'verify_email' | 'forgot_password' | 'set_new_password';
interface AuthModalProps {
  initialMode?: AuthMode;
  onClose: () => void;
  onSuccess: (user: { name: string; emailOrPhone: string }) => void;
  settings?: UserSettings;
  canClose?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ initialMode = 'login', onClose, onSuccess, canClose = true }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [existingEmail, setExistingEmail] = useState('');
  const registration = useRef<ReturnType<typeof createEmailRegistration> | null>(null);
  const emailRevision = useRef(0);
  const dialogRef = useDialog({ isOpen: true, onClose: () => { if (canClose && !busy) onClose(); } });
  const configured = Boolean(getSupabaseClient());
  const registering = mode === 'register' || mode === 'verify_email';
  const normalizedEmail = email.trim().toLowerCase();
  const emailVerified = Boolean(verifiedEmail && verifiedEmail === normalizedEmail);
  const strong = isStrongPassword(password);
  const passwordsMatch = Boolean(confirmPassword && password === confirmPassword);
  const cooldown = Math.max(0, Math.ceil((resendAfter - now) / 1000));

  useEffect(() => {
    if (!resendAfter) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAfter]);

  useEffect(() => () => { registration.current?.reset(); }, []);

  const clearFeedback = () => { setError(''); setSuccess(''); };
  const changeMode = (next: AuthMode) => {
    emailRevision.current++;
    registration.current?.reset();
    registration.current = null;
    setMode(next);
    // Login/autofill values must never become signup or recovery password values.
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setCodeSent(false);
    setVerifiedEmail('');
    setExistingEmail('');
    clearFeedback();
  };
  const changeEmail = (value: string) => {
    emailRevision.current++;
    registration.current?.reset();
    setEmail(value);
    setVerifiedEmail('');
    setCodeSent(false);
    setOtp('');
    setExistingEmail('');
    clearFeedback();
  };
  const reportError = (reason: unknown, fallback: string) => {
    setError(reason instanceof Error ? reason.message : fallback);
  };

  const sendCode = async () => {
    clearFeedback();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address first.');
      return;
    }
    if (Date.now() < resendAfter) {
      setError('Please wait before requesting another code.');
      return;
    }
    const revision = emailRevision.current;
    setBusy(true);
    setVerifiedEmail('');
    setOtp('');
    try {
      registration.current ??= createEmailRegistration();
      await registration.current.sendCode(normalizedEmail);
      if (revision !== emailRevision.current) return;
      setCodeSent(true);
      setResendAfter(Date.now() + 60_000);
      setNow(Date.now());
      setSuccess('Verification code requested. Check your inbox and spam folder.');
    } catch (reason) {
      if (revision !== emailRevision.current) return;
      if (reason instanceof EmailAlreadyRegisteredError) {
        setCodeSent(false);
        setExistingEmail(normalizedEmail);
      } else {
        reportError(reason, 'Could not send a code. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };
  const verifyCode = async () => {
    clearFeedback();
    const revision = emailRevision.current;
    setBusy(true);
    try {
      if (!registration.current) throw new Error('Request a code first.');
      await registration.current.verifyCode(normalizedEmail, otp.trim());
      if (revision !== emailRevision.current) return;
      setVerifiedEmail(normalizedEmail);
      setSuccess('Email verified. Set your password, then create your account.');
    } catch (reason) {
      reportError(reason, 'Verification failed. Request a new code.');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!configured) { setError('Cloud backend is not configured for this build.'); return; }
    if (registering && !emailVerified) { setError('Verify your email before creating an account.'); return; }
    if ((registering || mode === 'set_new_password') && (!strong || !passwordsMatch)) {
      setError('Complete the password requirements and make both passwords match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'forgot_password') {
        await sendPasswordResetEmail(normalizedEmail);
        setSuccess('If this email has an account, a password reset link has been sent. Open it to continue.');
      } else if (mode === 'set_new_password') {
        await updatePassword(password);
        changeMode('login');
        setSuccess('Password updated. Sign in with your new password.');
      } else {
        if (registering && !registration.current) throw new Error('Request and verify a code first.');
        const data = registering
          ? await registration.current?.complete(normalizedEmail, password, name.trim() || normalizedEmail.split('@')[0])
          : await signInUser(normalizedEmail, password);
        if (!data?.user) throw new Error('Sign-in did not return a user.');
        onSuccess({ name: data.user.user_metadata?.full_name || normalizedEmail.split('@')[0], emailOrPhone: data.user.email || normalizedEmail });
        onClose();
      }
    } catch (reason) {
      reportError(reason, 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const heading = existingEmail ? 'Account already exists' : registering ? 'Create New Account' : mode === 'login' ? 'Sign In To MINARTH'
    : mode === 'set_new_password' ? 'Set New Password' : 'Reset Password';
  const inputClass = 'w-full px-3 py-2 bg-surface-2 border border-line rounded-xl text-xs text-content-1 focus:outline-none focus:border-violet-500';
  const actionClass = 'rounded-xl bg-violet-600 hover:bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="identity-glass identity-login fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono">
      <div className="fixed inset-0" onClick={canClose && !busy ? onClose : undefined} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auth-heading" tabIndex={-1}
        className="identity-glass-panel relative z-10 w-full max-w-md rounded-3xl p-6 text-content-1 space-y-5 my-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div>
              <h3 id="auth-heading" className="text-xs font-bold uppercase tracking-wider">{heading}</h3>
              <p className="text-[10px] text-content-2">
                {existingEmail ? 'Continue with your existing account' : registering ? 'Verify email first, then set a password' : mode === 'login' ? 'Enter your credentials'
                  : mode === 'set_new_password' ? 'Choose and confirm a strong password' : 'We will email you a reset link'}
              </p>
            </div>
          </div>
          {canClose && <button type="button" disabled={busy} onClick={onClose} aria-label="Close sign-in"><X className="w-4 h-4" /></button>}
        </div>
        {!configured && <p role="alert" className="text-xs text-amber-400">Cloud backend is not configured for this build. Sign-in is unavailable.</p>}
        {existingEmail ? (
          <div className="space-y-4">
            <p role="status" className="text-sm leading-relaxed text-content-2">
              <strong className="break-all text-content-1">{existingEmail}</strong> is already registered.
              No verification code was sent. Sign in to continue, or use Forgot Password if you need to reset your password.
            </p>
            <button type="button" autoFocus onClick={() => changeMode('login')} className={`${actionClass} w-full py-3`}>Go to sign in</button>
            <button type="button" onClick={() => { setExistingEmail(''); changeEmail(''); }} className="w-full rounded-xl border border-line px-3 py-2.5 text-xs text-content-2">Use a different email</button>
          </div>
        ) : (
        <>
        {error && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-400">{error}</p>}
        {success && <p role="status" className="flex gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-400"><CheckCircle2 className="w-4 h-4 shrink-0" />{success}</p>}
        <form key={mode} onSubmit={submit} className="space-y-3.5" autoComplete={registering ? 'off' : 'on'}>
          {registering && (
            <label className="block text-[10px] text-content-2 uppercase">Full name
              <input name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="John Doe" disabled={busy} className={`${inputClass} mt-1`} />
            </label>
          )}
          {mode !== 'set_new_password' && (
            <div>
              <label htmlFor="auth-email" className="flex items-center gap-1 text-[10px] text-content-2 uppercase mb-1"><Mail className="w-3 h-3" />{mode === 'forgot_password' ? 'Registered email address' : 'Email address'}</label>
              <div className="flex gap-2">
                <input id="auth-email" name="email" type="email" value={email} onChange={event => changeEmail(event.target.value)}
                  autoComplete={registering ? 'email' : 'username'} placeholder="user@example.com" required disabled={busy} className={`${inputClass} min-w-0 flex-1`} />
                {registering && <button type="button" onClick={sendCode} disabled={busy || emailVerified || cooldown > 0 || !configured} className={actionClass}>
                  {emailVerified ? 'Verified' : cooldown > 0 ? `Wait ${cooldown}s` : codeSent ? 'Resend code' : 'Verify'}
                </button>}
              </div>
              {registering && codeSent && !emailVerified && (
                <div className="mt-3 space-y-2">
                  <label htmlFor="auth-otp" className="block text-[10px] text-content-2 uppercase">Email verification code</label>
                  <div className="flex gap-2">
                    <input id="auth-otp" name="otp" value={otp} onChange={event => setOtp(event.target.value)} inputMode="numeric"
                      autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} disabled={busy}
                      className={`${inputClass} min-w-0 flex-1 tracking-widest`} />
                    <button type="button" onClick={verifyCode} disabled={busy || !/^\d{6,10}$/.test(otp)} className={actionClass}>Verify code</button>
                  </div>
                </div>
              )}
              {emailVerified && <p role="status" className="mt-2 text-xs text-emerald-500">Email verified</p>}
            </div>
          )}
          {mode !== 'forgot_password' && (
            <PasswordField key={`${mode}-password`} label={mode === 'set_new_password' ? 'New password' : 'Password'}
              value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              showRequirements={registering ? password.length > 0 : mode === 'set_new_password'} />
          )}
          {(registering || mode === 'set_new_password') && (
            <PasswordField key={`${mode}-confirm`} label="Confirm password" value={confirmPassword} onChange={setConfirmPassword}
              autoComplete="new-password" matches={passwordsMatch} />
          )}
          {mode === 'login' && <button type="button" disabled={busy} onClick={() => changeMode('forgot_password')} className="text-xs text-violet-300">Forgot Password?</button>}
          <button type="submit" disabled={busy || !configured || ((registering || mode === 'set_new_password') && (!strong || !passwordsMatch || (registering && !emailVerified)))}
            className={`${actionClass} w-full py-3 uppercase`}>
            {busy ? 'Please wait...' : registering ? 'Create account' : mode === 'login' ? 'Sign in' : mode === 'set_new_password' ? 'Update password' : 'Send reset link'}
          </button>
        </form>
        {mode !== 'set_new_password' && (
          <div className="text-center pt-2 border-t border-line text-[10px] text-content-2">
            {mode === 'login' ? "Don't have an account? " : registering ? 'Already have an account? ' : 'Remembered your password? '}
            <button type="button" disabled={busy} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')} className="font-bold text-violet-300">
              {mode === 'login' ? 'Register Now' : 'Back to Sign In'}
            </button>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
};
