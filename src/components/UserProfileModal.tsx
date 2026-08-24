import React, { useState, useRef } from 'react';
import {
  X,
  User,
  ShieldCheck,
  Building2,
  Lock,
  Smartphone,
  Bell,
  Download,
  LogOut,
  ChevronRight,
  Check,
  CreditCard,
  Key,
  Globe,
  Sparkles,
  Camera,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { UserSettings, FinancialAccount } from '../types/finance';
import { signInUser, updatePassword } from '../services/supabaseClient';

interface UserProfileModalProps {
  settings: UserSettings;
  accounts: FinancialAccount[];
  onClose: () => void;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onExportData: () => void;
  onSignOut?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  settings,
  accounts,
  onClose,
  onUpdateSettings,
  onExportData,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'accounts' | 'preferences'>('profile');
  const [userName, setUserName] = useState<string>(settings?.userName || 'User');
  const [userEmail, setUserEmail] = useState<string>(settings?.userEmail || '');
  const [userPhoto, setUserPhoto] = useState<string>(settings?.userPhoto || '');
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (settings?.userName) setUserName(settings.userName);
    if (settings?.userEmail) setUserEmail(settings.userEmail);
    if (settings?.userPhoto !== undefined) setUserPhoto(settings.userPhoto || '');
  }, [settings?.userName, settings?.userEmail, settings?.userPhoto]);

  // Change Password State
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [pwdError, setPwdError] = useState<string>('');
  const [pwdSuccess, setPwdSuccess] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (!currentPassword) {
      setPwdError('Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwdError('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Re-verify identity with the current password before allowing the
      // change — updateUser() alone doesn't require re-entering it.
      await signInUser(settings.userEmail, currentPassword);
      await updatePassword(newPassword);
      setPwdSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setTimeout(() => setPwdSuccess(''), 3000);
    } catch (err: any) {
      setPwdError(err?.message || 'Current password is incorrect.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit. Please choose a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setUserPhoto(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...settings,
      userName,
      userEmail,
      userPhoto,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto font-mono">
      <div className="bg-[#111111] border border-[#222] w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl space-y-0 my-auto text-white">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[#222] bg-[#0d0d0d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt="User Avatar"
                  className="w-11 h-11 rounded-full object-cover border-2 border-red-500/80 shadow-md"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-red-600 to-red-400 text-white font-bold flex items-center justify-center text-lg shadow-md">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white uppercase">{userName}</h3>
                <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-[9px] font-bold rounded-full flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> PRO USER
                </span>
              </div>
              <p className="text-[11px] text-[#777]">{userEmail}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-[#1c1c1c] text-[#888] hover:text-white hover:bg-[#252525] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-[#222] bg-[#0a0a0a] text-[10px] uppercase tracking-wider font-bold text-[#888]">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3 px-2 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'profile'
                ? 'border-red-600 text-white bg-[#111]'
                : 'border-transparent hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Profile</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`py-3 px-2 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'security'
                ? 'border-red-600 text-white bg-[#111]'
                : 'border-transparent hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Security</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`py-3 px-2 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'accounts'
                ? 'border-red-600 text-white bg-[#111]'
                : 'border-transparent hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Banks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`py-3 px-2 flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'preferences'
                ? 'border-red-600 text-white bg-[#111]'
                : 'border-transparent hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden sm:inline">Prefs</span>
          </button>
        </div>

        {/* Content Panel */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">
                PERSONAL DETAILS & PHOTO
              </div>

              {/* Profile Photo Editor Section */}
              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex flex-col sm:flex-row items-center gap-4">
                <div className="relative group shrink-0">
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt="User Avatar"
                      className="w-16 h-16 rounded-full object-cover border-2 border-red-500 shadow-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-red-600 to-red-400 text-white font-bold flex items-center justify-center text-2xl shadow-lg">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Change Photo"
                  >
                    <Camera className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div className="space-y-2 flex-1 text-center sm:text-left">
                  <div className="text-xs font-bold text-white">Profile Picture</div>
                  <p className="text-[10px] text-[#777]">
                    Upload a custom avatar or photo to display in the top bar. (Max 5MB)
                  </p>
                  
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handlePhotoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#252525] border border-[#333] hover:border-red-500 text-white font-bold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3 h-3 text-red-400" />
                      <span>Upload Photo</span>
                    </button>

                    {userPhoto && (
                      <button
                        type="button"
                        onClick={() => setUserPhoto('')}
                        className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-red-950/80 border border-[#333] hover:border-red-800 text-red-400 font-bold text-[10px] uppercase rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#777] uppercase tracking-wider mb-1">
                  DISPLAY USERNAME
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#777] uppercase tracking-wider mb-1">
                  PRIMARY EMAIL
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                  required
                />
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">KYC Verification Status</div>
                  <div className="text-[10px] text-emerald-400 mt-0.5">PAN & Aadhaar Linked • Verified</div>
                </div>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {savedSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                  <span>{savedSuccess ? 'Profile Updated' : 'Save Changes'}</span>
                </button>

                <button
                  type="button"
                  onClick={onExportData}
                  className="px-4 py-2.5 bg-[#1a1a1a] border border-[#333] hover:text-white text-[#aaa] font-bold text-xs uppercase rounded-xl transition-colors flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Backup</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">
                SECURITY & APP ACCESS
              </div>

              {/* CHANGE PASSWORD COLLAPSIBLE OPTION */}
              <div className="bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden transition-all duration-200">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(!isChangePasswordOpen)}
                  className="w-full p-4 flex items-center justify-between text-xs font-bold text-white hover:bg-[#121212] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-red-500" />
                    <span>CHANGE ACCOUNT PASSWORD</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#666] font-normal">
                      {isChangePasswordOpen ? 'Tap to collapse' : 'Tap to expand'}
                    </span>
                    {isChangePasswordOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#888]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#888]" />
                    )}
                  </div>
                </button>

                {isChangePasswordOpen && (
                  <form onSubmit={handleChangePassword} className="p-4 pt-1 border-t border-[#1a1a1a] space-y-3 animate-in fade-in duration-200">
                    {pwdError && (
                      <div className="text-[10px] text-red-400 bg-red-950/50 p-2 rounded-lg border border-red-800">
                        {pwdError}
                      </div>
                    )}
                    {pwdSuccess && (
                      <div className="text-[10px] text-emerald-400 bg-emerald-950/50 p-2 rounded-lg border border-emerald-800">
                        {pwdSuccess}
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] text-[#777] uppercase mb-1">Current Password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full px-3 py-2 bg-[#141414] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] text-[#777] uppercase mb-1">New Password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-[#141414] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-[#777] uppercase mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 bg-[#141414] border border-[#222] rounded-xl text-xs text-white focus:outline-none focus:border-red-600"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] uppercase rounded-xl transition-colors cursor-pointer"
                    >
                      Update Password
                    </button>
                  </form>
                )}
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white">App Passcode Protection</div>
                  <div className="text-[10px] text-[#666]">PIN required when launching application</div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, passcodeEnabled: !settings.passcodeEnabled })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    settings.passcodeEnabled
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-[#1c1c1c] text-[#777]'
                  }`}
                >
                  {settings.passcodeEnabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white">Biometric FaceID / TouchID</div>
                  <div className="text-[10px] text-[#666]">Quick authentication using device biometrics</div>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-900">
                  ACTIVE
                </span>
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white">Active Device Sessions</div>
                  <div className="text-[10px] text-[#666]">1 Session (Current Web Browser)</div>
                </div>
                <Key className="w-4 h-4 text-[#666]" />
              </div>
            </div>
          )}

          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">
                LINKED FINANCIAL ACCOUNTS ({accounts.length})
              </div>

              <div className="space-y-2">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-3.5 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#1a1a1a] border border-[#333] flex items-center justify-center font-bold text-xs text-red-500">
                        {acc.bankName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{acc.name}</div>
                        <div className="text-[10px] text-[#666]">
                          {acc.type} • A/C **{acc.accountNumberLast4}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold text-white">
                        {settings.currencySymbol}{acc.balance.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[9px] text-emerald-400">ACTIVE</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-[#888] uppercase tracking-wider mb-2">
                SYSTEM PREFERENCES
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">SMS / UPI Auto-Interceptor</div>
                  <div className="text-[10px] text-[#666]">Automatically capture transaction SMS</div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, autoExtractSms: !settings.autoExtractSms })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    settings.autoExtractSms
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-[#1c1c1c] text-[#777]'
                  }`}
                >
                  {settings.autoExtractSms ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Push Notifications & Payment Alerts</div>
                  <div className="text-[10px] text-[#666]">Daily budget alerts and bill reminders</div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, notificationsEnabled: !settings.notificationsEnabled })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    settings.notificationsEnabled
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-[#1c1c1c] text-[#777]'
                  }`}
                >
                  {settings.notificationsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#222] bg-[#0d0d0d] flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut?.();
            }}
            className="px-3 py-2 bg-red-950/60 border border-red-800/80 hover:bg-red-900 text-red-400 font-bold text-xs uppercase rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1c1c1c] hover:bg-red-950 hover:text-red-400 text-[#aaa] font-bold text-xs uppercase rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
