import React from 'react';
import { motion } from 'motion/react';
import { Plus, LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  badge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  badge,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="w-full max-w-xl mx-auto my-6 sm:my-10 p-6 sm:p-10 bg-gradient-to-b from-[#16161a] to-[#0e0e11] border border-white/10 rounded-3xl text-center space-y-5 shadow-2xl relative overflow-hidden"
    >
      {/* Background ambient glow */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Icon Badge */}
      <div className="relative inline-flex items-center justify-center">
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-obsidian border border-white/15 rounded-2xl sm:rounded-3xl flex items-center justify-center text-red-500 shadow-xl ring-1 ring-white/5">
          <Icon className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        {badge && (
          <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-red-600 text-white font-mono text-[9px] font-bold rounded-full uppercase tracking-wider shadow">
            {badge}
          </span>
        )}
      </div>

      {/* Text Info */}
      <div className="space-y-2 max-w-md mx-auto">
        <h3 className="text-base sm:text-lg font-bold font-mono text-white uppercase tracking-wider">
          {title}
        </h3>
        <p className="text-xs sm:text-sm font-mono text-[#888] leading-relaxed">
          {description}
        </p>
      </div>

      {/* Actions */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={onAction}
          className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs sm:text-sm uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.45)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{actionLabel}</span>
        </button>

        {secondaryActionLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="w-full sm:w-auto px-5 py-3 bg-obsidian hover:bg-[#1f1f1f] border border-white/15 text-[#ccc] hover:text-white font-mono font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
};
