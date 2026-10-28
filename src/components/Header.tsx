import React, { useState, useEffect } from 'react';
import { Bell, Smartphone, MapPin, Search, Sun, Moon, User } from 'lucide-react';
import { motion } from 'motion/react';
import { DownloadAppCard } from './DownloadAppCard';

interface HeaderProps {
  userName?: string;
  userPhoto?: string;
  pendingNotificationsCount: number;
  pendingEmiCount?: number;
  onOpenNotifications: () => void;
  onOpenEmiConfirmations?: () => void;
  onOpenAddTransaction?: () => void;
  onOpenSimulator: () => void;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  currencySymbol: string;
  currencyCode?: string;
  locationTracking?: boolean;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userName = 'New User',
  userPhoto = '',
  pendingNotificationsCount,
  pendingEmiCount = 0,
  onOpenNotifications,
  onOpenEmiConfirmations,
  onOpenSimulator,
  onOpenProfile,
  onOpenAuth,
  currencySymbol,
  currencyCode,
  locationTracking,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().slice(0, 8));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 sm:h-16 border-b border-nothing bg-carbon px-3 sm:px-6 flex items-center justify-between shrink-0">
      {/* Top Left: App Name as Brand Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 sm:w-8 sm:h-8 tmf-logo-box flex items-center justify-center rounded-md shadow-sm border shrink-0">
          <div className="w-3.5 h-3.5 tmf-logo-box-dot rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col">
          <span className="text-base sm:text-lg font-black font-mono tracking-wider tmf-logo-text uppercase select-none leading-none">
            MTracker
          </span>
          <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.2em] text-[#777] hidden sm:inline-block leading-tight">
            SMART EXPENSE TRACKER
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live Clock & Currency Badge */}
        <div className="hidden lg:flex items-center gap-3 bg-obsidian border border-nothing px-3 py-1.5 rounded-lg text-xs font-mono text-[#888]">
          <span className="text-white font-bold">{currencySymbol} {currencyCode || 'INR'}</span>
          <span className="text-[#333]">|</span>
          <span className="text-red-500 font-bold">{timeStr}</span>
        </div>

        {/* GPS Badge */}
        {locationTracking && (
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 bg-obsidian border border-nothing rounded-lg text-[10px] font-mono text-[#777]">
            <MapPin className="w-3 h-3 text-red-500 animate-pulse" />
            <span>GPS Auto-Loc</span>
          </div>
        )}

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="p-2 sm:p-2.5 bg-graphite hover:bg-[#222] border border-nothing rounded-xl text-[#aaa] hover:text-white transition-all nav-lift flex items-center justify-center min-w-[38px] min-h-[38px] cursor-pointer"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-500" />
            )}
          </button>
        )}

        {/* SMS Simulator Button */}
        <button
          onClick={onOpenSimulator}
          aria-label="Simulate SMS or UPI payment"
          className="p-2 sm:p-2.5 bg-graphite hover:bg-[#222] border border-nothing rounded-xl text-[#aaa] hover:text-white transition-all nav-lift relative min-w-[38px] min-h-[38px] cursor-pointer"
          title="Simulate SMS / UPI Payment"
        >
          <Smartphone className="w-4 h-4 text-red-400" />
        </button>

        {/* Due EMI Confirmations Prompt Button */}
        {pendingEmiCount > 0 && onOpenEmiConfirmations && (
          <button
            onClick={onOpenEmiConfirmations}
            aria-label={`${pendingEmiCount} pending loan EMI payment${pendingEmiCount === 1 ? '' : 's'} awaiting confirmation`}
            className="px-2.5 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700/80 rounded-xl text-red-300 hover:text-white text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(220,38,38,0.3)] animate-pulse cursor-pointer"
            title={`${pendingEmiCount} pending loan EMI payment(s) awaiting confirmation`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>EMI ({pendingEmiCount})</span>
          </button>
        )}

        {/* Download Android App (hidden inside the native app itself) */}
        <DownloadAppCard compact />

        {/* Pending Notification Bell Button */}
        <button
          onClick={onOpenNotifications}
          aria-label={pendingNotificationsCount > 0
            ? `Pending payment confirmations, ${pendingNotificationsCount} notifications`
            : 'Pending payment confirmations'}
          className="p-2 sm:p-2.5 bg-graphite hover:bg-[#222] border border-nothing rounded-xl text-[#aaa] hover:text-white transition-all nav-lift relative min-w-[38px] min-h-[38px] cursor-pointer"
          title="Pending Payment Confirmations"
        >
          <Bell className="w-4 h-4 text-white" />
          {pendingNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white font-mono text-[9px] font-bold rounded-full flex items-center justify-center animate-bounce">
              {pendingNotificationsCount}
            </span>
          )}
        </button>

        {/* User Profile Avatar Icon Button */}
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label={`Open profile for ${userName}`}
          className="p-0.5 bg-graphite border border-nothing/60 hover:border-red-600/80 rounded-full shadow-sm transition-all nav-lift cursor-pointer group shrink-0"
          title="Click to view/edit User Profile & Photo"
        >
          {userPhoto ? (
            <img
              src={userPhoto}
              alt="User Photo"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover group-hover:scale-105 transition-transform border border-red-500/60"
            />
          ) : (
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-red-600 to-red-500 text-white font-bold flex items-center justify-center text-xs group-hover:scale-105 transition-transform shadow-inner">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      </div>
    </header>
  );
};
