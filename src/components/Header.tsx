import React, { useState, useEffect } from 'react';
import { Bell, Smartphone, MapPin, Search, Sun, Moon, User } from 'lucide-react';
import { motion } from 'motion/react';
import { DownloadAppCard } from './DownloadAppCard';

interface HeaderProps {
  userName?: string;
  userPhoto?: string;
  pendingNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenAddTransaction?: () => void;
  onOpenSimulator: () => void;
  onOpenProfile?: () => void;
  onOpenAuth?: () => void;
  currencySymbol: string;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userName = 'New User',
  userPhoto = '',
  pendingNotificationsCount,
  onOpenNotifications,
  onOpenSimulator,
  onOpenProfile,
  onOpenAuth,
  currencySymbol,
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
          <span className="text-base sm:text-xl font-black font-mono tracking-wider tmf-logo-text uppercase select-none leading-none">
            TMF
          </span>
          <span className="text-[8px] sm:text-[9px] font-mono tracking-[0.2em] text-[#777] hidden sm:inline-block leading-tight">
            TRACK MONEY FLOW
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live Clock & Currency Badge */}
        <div className="hidden lg:flex items-center gap-3 bg-obsidian border border-nothing px-3 py-1.5 rounded-lg text-xs font-mono text-[#888]">
          <span className="text-white font-bold">{currencySymbol} INR</span>
          <span className="text-[#333]">|</span>
          <span className="text-red-500 font-bold">{timeStr}</span>
        </div>

        {/* GPS Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 bg-obsidian border border-nothing rounded-lg text-[10px] font-mono text-[#777]">
          <MapPin className="w-3 h-3 text-red-500 animate-pulse" />
          <span>GPS Auto-Loc</span>
        </div>

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
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
          className="p-2 sm:p-2.5 bg-graphite hover:bg-[#222] border border-nothing rounded-xl text-[#aaa] hover:text-white transition-all nav-lift relative min-w-[38px] min-h-[38px] cursor-pointer"
          title="Simulate SMS / UPI Payment"
        >
          <Smartphone className="w-4 h-4 text-red-400" />
        </button>

        {/* Download Android App (hidden inside the native app itself) */}
        <DownloadAppCard compact />

        {/* Pending Notification Bell Button */}
        <button
          onClick={onOpenNotifications}
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

