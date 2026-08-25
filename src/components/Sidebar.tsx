import React from 'react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  TrendingUp, 
  HandCoins, 
  Building2,
  Sliders, 
  Settings, 
  BellRing,
  Smartphone,
  MapPin,
  RefreshCw
} from 'lucide-react';
import { DownloadAppCard } from './DownloadAppCard';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingNotificationsCount: number;
  onOpenSimulator: () => void;
  supabaseConnected: boolean;
  currencySymbol: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingNotificationsCount,
  onOpenSimulator,
  supabaseConnected,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Main' },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText, section: 'Main' },
    { id: 'accounts', label: 'Accounts', icon: Building2, section: 'Main' },
    { id: 'investments', label: 'Investments', icon: TrendingUp, section: 'Main' },
    { id: 'loans', label: 'Loans & Lends', icon: HandCoins, section: 'Main' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'System' },
  ];

  return (
    <nav className="w-[240px] bg-carbon border-r border-nothing flex flex-col p-5 shrink-0 h-full select-none">
      {/* Brand Logo Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 tmf-logo-box flex items-center justify-center rounded-md shadow-sm border shrink-0">
            <div className="w-3.5 h-3.5 tmf-logo-box-dot rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></div>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase font-mono tmf-logo-text">TMF</h1>
            <div className="text-[9px] text-slate-500 dark:text-[#666] tracking-[0.25em] font-mono">TRACK MONEY FLOW</div>
          </div>
        </div>
      </div>

      {/* Simulator Trigger Banner */}
      <button
        onClick={onOpenSimulator}
        className="mb-6 p-3 bg-shadow hover:bg-[#222] border border-red-900/60 rounded-xl transition-all tactile-lift group text-left relative overflow-hidden cursor-pointer"
      >
        <div className="absolute top-0 right-0 w-12 h-12 bg-red-600/10 rounded-full blur-xl pointer-events-none"></div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse-red"></span>
            UPI / SMS Tracker
          </span>
          {pendingNotificationsCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-600 text-white font-mono text-[9px] font-bold rounded-full">
              {pendingNotificationsCount}
            </span>
          )}
        </div>
        <div className="text-xs text-[#aaa] font-medium group-hover:text-white transition-colors flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5 text-red-400" />
          Test Auto-Interceptor
        </div>
      </button>

      {/* Navigation Sections */}
      <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
        <div className="text-[9px] text-slate-400 dark:text-[#555] uppercase tracking-[0.25em] font-mono mb-2 px-3">Main Navigation</div>
        {navItems.filter(item => item.section === 'Main').map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all nav-lift cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-md -translate-y-0.5'
                  : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-graphite'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isActive ? 'bg-red-600' : 'bg-transparent'
              }`} />
              <Icon className={`w-4 h-4 ${isActive ? 'text-white dark:text-black' : 'text-slate-500 dark:text-[#888]'}`} />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          );
        })}

        <div className="text-[9px] text-slate-400 dark:text-[#555] uppercase tracking-[0.25em] font-mono mt-6 mb-2 px-3">System Controls</div>
        {navItems.filter(item => item.section === 'System').map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all nav-lift cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-semibold shadow-md -translate-y-0.5'
                  : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-graphite'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                isActive ? 'bg-red-600' : 'bg-transparent'
              }`} />
              <Icon className={`w-4 h-4 ${isActive ? 'text-white dark:text-black' : 'text-slate-500 dark:text-[#888]'}`} />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer System Status Widget */}
      <div className="mt-auto pt-4 border-t border-nothing flex flex-col gap-2">
        <DownloadAppCard />

        <div className="p-3 bg-obsidian border border-nothing rounded-xl flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#666] uppercase font-mono">
            <span>Backend Sync</span>
            <RefreshCw className="w-3 h-3 text-[#555]" />
          </div>
          <div className="text-xs font-mono flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${supabaseConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={supabaseConnected ? 'text-green-400 font-semibold' : 'text-red-400'}>
              {supabaseConnected ? 'Cloud Synced' : 'Not Synced'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-2 text-[10px] font-mono text-[#555]">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-red-500" /> GPS ACTIVE
          </span>
          <span>v1.0.4</span>
        </div>
      </div>
    </nav>
  );
};
