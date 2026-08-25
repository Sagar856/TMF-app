import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BudgetAlertPayload } from '../services/budgetAlertService';
import { 
  AlertTriangle, 
  Flame, 
  X, 
  Sliders, 
  ArrowRight, 
  BellRing,
  TrendingUp,
  Percent
} from 'lucide-react';

interface BudgetPushNotificationBannerProps {
  alert: BudgetAlertPayload | null;
  currencySymbol: string;
  onDismiss: () => void;
  onNavigateToCustomisations: () => void;
}

export const BudgetPushNotificationBanner: React.FC<BudgetPushNotificationBannerProps> = ({
  alert,
  currencySymbol,
  onDismiss,
  onNavigateToCustomisations,
}) => {
  const [progress, setProgress] = useState<number>(100);

  useEffect(() => {
    if (!alert) return;
    setProgress(100);
    const duration = 8500; // 8.5 seconds auto dismiss
    const startTime = Date.now();

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPercent = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remainingPercent);
    }, 50);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [alert, onDismiss]);

  if (!alert) return null;

  const is100 = alert.level === '100';

  return (
    <div className="fixed top-4 left-0 right-0 z-[10000] flex justify-center px-3 sm:px-4 pointer-events-none font-mono">
      <motion.div
        initial={{ opacity: 0, y: -40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className={`pointer-events-auto w-full max-w-lg rounded-2xl border backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden ${
          is100
            ? 'bg-[#180d0f]/95 border-red-600/90 shadow-[0_10px_35px_rgba(220,38,38,0.35)]'
            : 'bg-[#18130d]/95 border-amber-500/80 shadow-[0_10px_35px_rgba(245,158,11,0.25)]'
        }`}
      >
        {/* Top Mini Tag Bar */}
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-[#aaa]">
            <BellRing className={`w-3 h-3 ${is100 ? 'text-red-500 animate-bounce' : 'text-amber-400'}`} />
            <span>BUDGET PUSH NOTIFICATION • {alert.monthLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                is100
                  ? 'bg-red-950 text-red-400 border border-red-700/80 animate-pulse'
                  : 'bg-amber-950 text-amber-300 border border-amber-600/80'
              }`}
            >
              {is100 ? '100% OVER BUDGET' : '80% LIMIT REACHED'}
            </span>
            <button
              onClick={onDismiss}
              className="p-1 rounded-full text-[#888] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss Notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 pt-1.5 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                is100
                  ? 'bg-red-950 border-red-600 text-red-400 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
                  : 'bg-amber-950 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
              }`}
            >
              {is100 ? <Flame className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5 flex-wrap">
                <span>{alert.categoryName}</span>
                <span className="text-xs text-[#888]">Monthly Spend Alert</span>
              </h4>

              <p className="text-xs text-[#ccc] mt-0.5 leading-relaxed">
                {is100 ? (
                  <span>
                    Spending has crossed <strong className="text-red-400 font-bold">100%</strong> of your limit! Total spent is{' '}
                    <span className="font-bold text-white">
                      {currencySymbol}{alert.spent.toLocaleString('en-IN')}
                    </span>{' '}
                    against budget of {currencySymbol}{alert.budgetLimit.toLocaleString('en-IN')} (+{currencySymbol}{alert.overAmount.toLocaleString('en-IN')} over).
                  </span>
                ) : (
                  <span>
                    Spending has reached <strong className="text-amber-400 font-bold">{alert.percent.toFixed(0)}%</strong> of your defined limit ({currencySymbol}{alert.spent.toLocaleString('en-IN')} of {currencySymbol}{alert.budgetLimit.toLocaleString('en-IN')}). Only <span className="text-white font-bold">{currencySymbol}{alert.remaining.toLocaleString('en-IN')}</span> remaining.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Quick Progress Bar Visual */}
          <div className="space-y-1">
            <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden p-0.5 border border-[#333]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  is100
                    ? 'bg-gradient-to-r from-red-600 to-rose-500'
                    : 'bg-gradient-to-r from-amber-500 to-red-500'
                }`}
                style={{ width: `${Math.min(100, alert.percent)}%` }}
              />
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-[10px] text-[#777]">
              Tap to adjust or inspect limits
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onDismiss}
                className="px-2.5 py-1 text-xs text-[#888] hover:text-white transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  onDismiss();
                  onNavigateToCustomisations();
                }}
                className={`px-3 py-1.5 text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                  is100
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Adjust Budget</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Auto-Dismiss Timer Bar */}
        <div className="h-0.5 w-full bg-black/40">
          <div
            className={`h-full transition-all duration-75 ${
              is100 ? 'bg-red-500' : 'bg-amber-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </motion.div>
    </div>
  );
};
