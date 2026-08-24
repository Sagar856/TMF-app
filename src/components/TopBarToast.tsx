import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
}

interface TopBarToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const TopBarToast: React.FC<TopBarToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const duration = toast.duration || 3200;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'warning':
      case 'error':
        return <Trash2 className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />;
      case 'info':
        return <Info className="w-4 h-4 text-cyan-400 shrink-0" />;
      case 'success':
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'warning':
      case 'error':
        return 'border-red-600/80 shadow-[0_4px_25px_rgba(220,38,38,0.35)] bg-[#120808]/95';
      case 'info':
        return 'border-cyan-500/80 shadow-[0_4px_25px_rgba(6,182,212,0.35)] bg-[#081216]/95';
      case 'success':
      default:
        return 'border-emerald-500/80 shadow-[0_4px_25px_rgba(16,185,129,0.35)] bg-[#08140e]/95';
    }
  };

  const getTextColor = () => {
    switch (toast.type) {
      case 'warning':
      case 'error':
        return 'text-red-200';
      case 'info':
        return 'text-cyan-200';
      case 'success':
      default:
        return 'text-emerald-200';
    }
  };

  return (
    <div className="fixed top-3 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        className={`pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full border backdrop-blur-md font-mono text-xs max-w-md shadow-2xl ${getBorderColor()}`}
      >
        {getIcon()}
        <span className={`font-bold tracking-wide select-none ${getTextColor()}`}>
          {toast.text}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 p-0.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </div>
  );
};
