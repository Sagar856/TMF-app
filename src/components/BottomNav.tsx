import React from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Building2, 
  TrendingUp, 
  HandCoins, 
  Settings,
  LucideIcon
} from 'lucide-react';

export interface NavItemConfig {
  id: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  badgeCount?: number;
}

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingNotificationsCount?: number;
  pendingEmiCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendingNotificationsCount = 0,
  pendingEmiCount = 0,
}) => {
  const navItems: NavItemConfig[] = [
    { id: 'dashboard', label: 'Home', shortLabel: 'Home', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions', shortLabel: 'Txns', icon: ReceiptText },
    { id: 'accounts', label: 'Accounts', shortLabel: 'Accounts', icon: Building2 },
    { id: 'investments', label: 'Invest', shortLabel: 'Invest', icon: TrendingUp },
    { 
      id: 'loans', 
      label: 'Loans', 
      shortLabel: 'Loans', 
      icon: HandCoins,
      badgeCount: pendingEmiCount > 0 ? pendingEmiCount : undefined,
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      shortLabel: 'Settings', 
      icon: Settings,
      badgeCount: pendingNotificationsCount > 0 ? pendingNotificationsCount : undefined 
    },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Mobile Navigation"
      className="lg:hidden sticky bottom-0 left-0 right-0 z-nav px-2.5 sm:px-4 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] shrink-0 transition-colors select-none"
    >
      <div className="glass-nav-track flex items-center justify-around gap-0.5 sm:gap-1 max-w-lg mx-auto p-1.5 rounded-full border border-line">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={`nav-btn-${item.id}`}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.badgeCount
                ? `${item.label}, ${item.badgeCount} ${item.id === 'loans' ? 'pending EMI confirmations' : 'pending notifications'}`
                : item.label}
              className={`relative flex-1 flex flex-col items-center justify-center min-h-11 py-1 sm:py-1.5 px-1 rounded-full transition-all duration-200 cursor-pointer min-w-0 group ${
                isActive
                  ? 'text-content-1 font-bold'
                  : 'text-content-3 hover:text-content-1 hover:bg-surface-2 active:scale-95'
              }`}
            >
              {/* Active Tab Background Pill */}
              {isActive && (
                <motion.div
                  layoutId="activeBottomTabPill"
                  className="glass-nav-active absolute inset-0 rounded-full border"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}

              {/* Icon Container with Badge */}
              <div className="relative z-10 flex items-center justify-center">
                <Icon
                  className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-transform duration-200 ${
                    isActive ? 'scale-110 stroke-[2.2]' : 'group-hover:scale-105 stroke-[1.8]'
                  }`}
                />
                
                {/* Notification / Alert Badge */}
                {item.badgeCount && item.badgeCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[15px] h-[15px] px-1 bg-red-600 text-white text-[9px] font-mono font-bold rounded-full shadow-xs ring-2 ring-surface-1 animate-pulse">
                    {item.badgeCount > 9 ? '9+' : item.badgeCount}
                  </span>
                ) : null}
              </div>

              {/* Label */}
              <span
                className={`relative z-10 text-[9px] sm:text-[10px] font-mono tracking-tight truncate max-w-full mt-0.5 transition-colors ${
                  isActive
                    ? 'font-bold text-content-1'
                    : 'font-semibold text-content-3 group-hover:text-content-1'
                }`}
              >
                {item.shortLabel || item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
