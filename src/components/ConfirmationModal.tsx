import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Database, Trash2, RefreshCw, X, ShieldAlert } from 'lucide-react';

export interface ConfirmDialogConfig {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  intent?: 'danger' | 'warning' | 'info' | 'primary';
  icon?: 'trash' | 'database' | 'refresh' | 'warning';
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ConfirmationModalProps {
  config: ConfirmDialogConfig | null;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ config, onClose }) => {
  if (!config) return null;

  const handleConfirm = () => {
    config.onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (config.onCancel) config.onCancel();
    onClose();
  };

  const getIcon = () => {
    switch (config.icon) {
      case 'trash':
        return <Trash2 className="w-5 h-5 text-red-500" />;
      case 'refresh':
        return <RefreshCw className="w-5 h-5 text-cyan-400" />;
      case 'database':
        return <Database className="w-5 h-5 text-yellow-400" />;
      case 'warning':
      default:
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    }
  };

  const getConfirmButtonClasses = () => {
    switch (config.intent) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-500 text-black font-extrabold shadow-[0_0_15px_rgba(217,119,6,0.4)]';
      case 'info':
      case 'primary':
      default:
        return 'bg-white hover:bg-neutral-200 text-black font-extrabold shadow-[0_0_15px_rgba(255,255,255,0.2)]';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleCancel}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* Dialog Box */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative z-10 w-full max-w-md bg-carbon border border-nothing rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-obsidian border border-nothing rounded-2xl shrink-0">
              {getIcon()}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                {config.title}
              </h3>
              <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                CONFIRMATION REQUIRED
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 text-[#666] hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 bg-obsidian border border-nothing rounded-2xl">
          <p className="text-xs text-[#aaa] leading-relaxed">
            {config.description}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-graphite hover:bg-[#222] border border-nothing text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
          >
            {config.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-5 py-2 text-xs font-mono uppercase rounded-xl transition-all cursor-pointer ${getConfirmButtonClasses()}`}
          >
            {config.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
