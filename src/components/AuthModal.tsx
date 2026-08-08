import React, { useState } from 'react';
import { X, Mail, Lock, CheckCircle2, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { UserSettings } from '../types/finance';
import { signInUser, signUpUser, sendPasswordResetEmail, updatePassword, getSupabaseClient } from '../services/supabaseClient';

interface AuthModalProps {
  initialMode?: 'login' | 'register' | 'forgot_password' | 'set_new_password';
  onClose: () => void;
  onSuccess: (updatedUser: { name: string; emailOrPhone: string }) => void;
  settings?: UserSettings;
}

// Real authentication only: Supabase email/password auth (free tier).
// No simulated OTPs, no hardcoded bypass codes, no default weak passwords.
export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password' | 'set_new_password'>(initialMode);

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');

  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const supabaseConfigured = Boolean(getSupabaseClient());

  const resetFeedback = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (!email.trim() || !password) {
      setErrorMsg('Please enter your email and a password.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!supabaseConfigured) {
      setErrorMsg('Cloud account creation requires Supabase to be configured in Settings. You can still use the app locally without an account.');
      return;
    }

    setIsVerifying(true);
    try {
      await signUpUser(email.trim(), password, name.trim() || email.split('@')[0]);
      setIsVerifying(false);
      setSuccessMsg('Account created! Check your email for a confirmation link, then sign in.');
      setTimeout(() => setMode('login'), 2000);
    } catch (err: any) {
      setIsVerifying(false);
      if (err?.message?.toLowerCase().includes('already registered')) {
        setErrorMsg('This email is already registered. Please sign in instead.');
        setMode('login');
      } else {
        setErrorMsg(err?.message || 'Registration failed. Please try again.');
      }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    if (!supabaseConfigured) {
      setErrorMsg('Cloud sign-in requires Supabase to be configured in Settings. You can continue using the app locally without signing in.');
      return;
    }

    setIsVerifying(true);
    try {
      const data = await signInUser(email.trim(), password);
      setIsVerifying(false);
      const userObj = data?.user;
      onSuccess({
        name: userObj?.user_metadata?.full_name || email.split('@')[0] || 'User',
        emailOrPhone: userObj?.email || email.trim(),
      });
      setSuccessMsg('Login successful!');
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err?.message || 'Invalid credentials or user not found.');
    }
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (!email.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }
    if (!supabaseConfigured) {
      setErrorMsg('Password reset requires Supabase to be configured in Settings.');
      return;
    }

    setIsVerifying(true);
    try {
      await sendPasswordResetEmail(email.trim());
      setIsVerifying(false);
      setSuccessMsg('A password reset link has been sent to your email. Open it to continue.');
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err?.message || 'Failed to send reset email.');
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    if (!newPassword || newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    setIsVerifying(true);
    try {
      await updatePassword(newPassword);
      setIsVerifying(false);
      setSuccessMsg('Password updated successfully! Please sign in.');
      setTimeout(() => setMode('login'), 1500);
    } catch (err: any) {
      setIsVerifying(false);
      setErrorMsg(err?.message || 'Failed to update password.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono">
      {/* Background Overlay */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative z-10 bg-[#0d0d0e] border border-[#26262a] w-full max-w-md rounded-3xl p-6 shadow-2xl text-white space-y-5 my-auto animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-950/60 border border-red-600/50 flex items-center justify-center text-red-500">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                {mode === 'register'
                  ? 'Create New Account'
                  : mode === 'login'
                  ? 'Sign In To TMF'
                  : mode === 'set_new_password'
                  ? 'Set New Password'
                  : 'Reset Password'}
              </h3>
              <p className="text-[10px] text-[#777]">
                {mode === 'register'
                  ? 'Secure email + password account'
                  : mode === 'login'
                  ? 'Enter your credentials'
                  : mode === 'set_new_password'
                  ? 'Choose a new password for your account'
                  : 'We will email you a reset link'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#1a1a1a] text-[#888] hover:text-white hover:bg-[#252525] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!supabaseConfigured && (
          <div className="p-3 bg-yellow-950/50 border border-yellow-800/60 rounded-xl text-yellow-400 text-[11px]">
            Supabase is not configured yet. Cloud accounts are disabled — you can still use TMF fully offline. Add your Supabase URL &amp; Key in Settings to enable sign-in and cloud sync.
          </div>
        )}

        {/* Error / Success Feedback Banners */}
        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <X className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ==================== 1. REGISTER MODE ==================== */}
        {mode === 'register' && (
          <>
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-[#777] uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#777] uppercase mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#777] uppercase mb-1">Confirm</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isVerifying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isVerifying ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}</span>
                {!isVerifying && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </form>

            {/* Bottom switch mode link */}
            <div className="text-center pt-2 border-t border-[#222] text-[10px] text-[#777]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  resetFeedback();
                  setMode('login');
                }}
                className="text-red-400 font-bold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </>
        )}

        {/* ==================== 2. LOGIN MODE ==================== */}
        {mode === 'login' && (
          <>
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-[#777] uppercase mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] text-[#777] uppercase flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      resetFeedback();
                      setMode('forgot_password');
                    }}
                    className="text-[9px] text-red-400 hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isVerifying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isVerifying ? 'AUTHENTICATING...' : 'SIGN IN'}</span>
              </button>
            </form>

            {/* Bottom switch mode link */}
            <div className="text-center pt-2 border-t border-[#222] text-[10px] text-[#777]">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  resetFeedback();
                  setMode('register');
                }}
                className="text-red-400 font-bold hover:underline cursor-pointer"
              >
                Register Now
              </button>
            </div>
          </>
        )}

        {/* ==================== 3. FORGOT PASSWORD MODE ==================== */}
        {mode === 'forgot_password' && (
          <>
            <form onSubmit={handleSendResetEmail} className="space-y-3.5">
              <div>
                <label className="block text-[10px] text-[#777] uppercase mb-1">
                  Registered Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isVerifying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isVerifying ? 'SENDING...' : 'SEND RESET LINK'}</span>
              </button>
            </form>

            <div className="text-center pt-2 border-t border-[#222] text-[10px] text-[#777]">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => {
                  resetFeedback();
                  setMode('login');
                }}
                className="text-red-400 font-bold hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </>
        )}

        {/* ==================== 4. SET NEW PASSWORD (after recovery redirect) ==================== */}
        {mode === 'set_new_password' && (
          <form onSubmit={handleSetNewPassword} className="space-y-3.5">
            <div>
              <label className="block text-[10px] text-[#777] uppercase mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full px-3 py-2 bg-[#141414] border border-[#262626] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isVerifying && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isVerifying ? 'UPDATING...' : 'UPDATE PASSWORD'}</span>
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
