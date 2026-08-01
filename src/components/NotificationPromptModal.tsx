import React, { useState } from 'react';
import { ParsedNotification } from '../types/finance';
import { Check, Edit3, X, MapPin, Smartphone, ChevronDown, ChevronUp, Radio } from 'lucide-react';

interface NotificationPromptModalProps {
  notifications: ParsedNotification[];
  onConfirmAdd: (notif: ParsedNotification) => void;
  onConfirmEdit: (notif: ParsedNotification) => void;
  onIgnore: (notifId: string) => void;
  onClose: () => void;
  currencySymbol: string;
}

export const NotificationPromptModal: React.FC<NotificationPromptModalProps> = ({
  notifications,
  onConfirmAdd,
  onConfirmEdit,
  onIgnore,
  onClose,
  currencySymbol,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showRawText, setShowRawText] = useState<boolean>(false);

  if (notifications.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity" onClick={onClose} />
        <div className="relative z-10 bg-[#0d0e12]/85 border border-white/20 backdrop-blur-xl p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl text-white my-auto animate-in zoom-in-95 duration-150">
          <div className="w-12 h-12 bg-black/50 border border-white/15 rounded-full flex items-center justify-center mx-auto mb-3 text-red-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1 uppercase">No Pending Notifications</h3>
          <p className="text-xs text-[#aaa] mb-4">You have reviewed all detected UPI & Bank SMS transactions.</p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-white text-black text-xs font-bold uppercase rounded-xl hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const activeNotif = notifications[currentIndex] || notifications[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-mono">
      {/* Semi-transparent Backdrop Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Highly transparent, content-fitted glassmorphic notification prompt card */}
      <div className="relative z-10 bg-gradient-to-br from-red-950/60 via-[#0d0e12]/80 to-emerald-950/60 border border-white/20 p-4 sm:p-5 rounded-3xl max-w-md w-full shadow-2xl backdrop-blur-xl text-white overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-[0.2em]">
              UPI / SMS Detected ({currentIndex + 1}/{notifications.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#aaa] hover:text-white p-1 rounded-lg bg-black/40 border border-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transaction Summary Card */}
        <div className="bg-obsidian p-4 rounded-2xl border border-[#222] mb-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[10px] text-[#666] uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-red-500" />
                {activeNotif.appSource}
              </div>
              <div className="text-lg font-bold text-white mt-0.5">{activeNotif.payeeOrPayer}</div>
            </div>
            <div className={`text-2xl font-mono font-bold ${
              activeNotif.type === 'debit' ? 'text-red-500' : 'text-green-400'
            }`}>
              {activeNotif.type === 'debit' ? '-' : '+'}{currencySymbol}{activeNotif.amount.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Time & Geolocation */}
          <div className="flex items-center gap-2 text-[10px] text-[#777] font-mono mt-2 pt-2 border-t border-[#181818]">
            <span className="text-white">{activeNotif.date} · {activeNotif.time}</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-[#aaa]">
              <MapPin className="w-3 h-3 text-red-500" />
              {activeNotif.location?.name || `${activeNotif.location?.lat.toFixed(4)}°, ${activeNotif.location?.lng.toFixed(4)}°`}
            </span>
          </div>

          {/* Extracted Category & Subcategory Tag */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 bg-[#181818] border border-[#333] text-[10px] font-mono rounded text-red-400 font-medium">
              #{activeNotif.category.toUpperCase().replace(/\s+/g, '_')}
            </span>
            <span className="px-2.5 py-0.5 bg-[#181818] border border-[#333] text-[10px] font-mono rounded text-[#aaa]">
              {activeNotif.subcategory}
            </span>
          </div>
        </div>

        {/* Raw SMS Text Foldout */}
        <div className="mb-5">
          <button
            onClick={() => setShowRawText(!showRawText)}
            className="text-[10px] text-[#666] hover:text-[#aaa] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors"
          >
            {showRawText ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showRawText ? 'Hide Raw Intercepted SMS' : 'View Intercepted SMS Text'}
          </button>
          {showRawText && (
            <div className="mt-2 p-3 bg-carbon border border-[#222] rounded-xl text-[10px] font-mono text-[#888] leading-relaxed break-words">
              "{activeNotif.rawText}"
            </div>
          )}
        </div>

        {/* 3 Prominent Confirmation Action Buttons */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={() => onConfirmAdd(activeNotif)}
            className="py-2.5 bg-white text-black text-[11px] font-mono font-bold uppercase rounded-xl hover:bg-neutral-200 transition-colors flex items-center justify-center gap-1.5 shadow-md"
          >
            <Check className="w-3.5 h-3.5 text-black" />
            ADD
          </button>

          <button
            onClick={() => onConfirmEdit(activeNotif)}
            className="py-2.5 border border-[#444] text-white text-[11px] font-mono font-bold uppercase rounded-xl hover:bg-[#1f1f1f] transition-colors flex items-center justify-center gap-1.5"
          >
            <Edit3 className="w-3.5 h-3.5 text-red-400" />
            EDIT
          </button>

          <button
            onClick={() => onIgnore(activeNotif.id)}
            className="py-2.5 border border-[#333] text-[#777] text-[11px] font-mono font-bold uppercase rounded-xl hover:bg-[#151515] hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <X className="w-3.5 h-3.5 text-[#555]" />
            IGNORE
          </button>
        </div>

        {/* Multi notification pagination indicator */}
        {notifications.length > 1 && (
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#1e1e1e] text-[10px] font-mono text-[#666]">
            <button
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : notifications.length - 1))}
              className="hover:text-white transition-colors"
            >
              ← Previous
            </button>
            <span>Notification {currentIndex + 1} of {notifications.length}</span>
            <button
              onClick={() => setCurrentIndex((prev) => (prev < notifications.length - 1 ? prev + 1 : 0))}
              className="hover:text-white transition-colors"
            >
              Next →
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
