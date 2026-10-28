import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import React, { useState } from 'react';
import { EmiConfirmationRequest, FinancialAccount } from '../types/finance';
import { AlertCircle, CheckCircle2, Clock, SkipForward, X, Building2, BellRing, ShieldCheck } from 'lucide-react';

interface EmiConfirmationPromptModalProps {
  requests: EmiConfirmationRequest[];
  accounts: FinancialAccount[];
  currencySymbol: string;
  onConfirm: (requestId: string, accountId: string, notes?: string) => void;
  onSkip: (requestId: string) => void;
  onRemindLater: (requestId: string) => void;
  onClose: () => void;
}

export const EmiConfirmationPromptModal: React.FC<EmiConfirmationPromptModalProps> = ({
  requests,
  accounts,
  currencySymbol,
  onConfirm,
  onSkip,
  onRemindLater,
  onClose,
}) => {
  const formatAmount = useMoneyFormatter();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const activeReq = requests[currentIndex];
  
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (activeReq?.linkedAccountId && accounts.some((a) => a.id === activeReq.linkedAccountId)) {
      return activeReq.linkedAccountId;
    }
    const defaultBank = accounts.find((a) => a.type === 'Bank');
    return defaultBank?.id || accounts[0]?.id || '';
  });
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!activeReq) return null;

  const currentAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleConfirmCurrent = () => {
    setErrorMsg('');
    if (!selectedAccountId) {
      setErrorMsg('Please select a payment account.');
      return;
    }
    if (currentAccount && currentAccount.type === 'Bank' && currentAccount.balance < activeReq.amount) {
      setErrorMsg(`Insufficient funds in ${currentAccount.name} (${currencySymbol}${formatAmount(currentAccount.balance)}).`);
      return;
    }
    onConfirm(activeReq.id, selectedAccountId, notes || `EMI Installment #${activeReq.installmentNumber} for ${activeReq.loanTitle}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-mono">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 bg-gradient-to-br from-red-950/60 via-[#121217] to-[#161622] border border-red-800/60 rounded-3xl p-5 sm:p-6 max-w-md w-full text-white shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#252530]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
            <h3 className="text-xs sm:text-sm font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
              <BellRing className="w-4 h-4 text-red-500" />
              <span>EMI Payment Confirmation ({currentIndex + 1}/{requests.length})</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-[#202028] text-[#888] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loan Details Banner */}
        <div className="p-4 bg-[#181820] border border-[#2a2a38] rounded-2xl space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] text-[#777] uppercase tracking-wider block">Loan / Lender</span>
              <h4 className="text-base font-bold text-white mt-0.5">{activeReq.loanTitle}</h4>
              <p className="text-xs text-[#aaa]">{activeReq.lenderOrBank}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-[#777] uppercase tracking-wider block">EMI Amount</span>
              <div className="text-xl font-bold text-red-400 mt-0.5">
                {currencySymbol}{formatAmount(activeReq.amount)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#222] text-xs">
            <span className="text-[#888]">Scheduled Due Date:</span>
            <span className="font-bold text-white flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              {activeReq.dueDate}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#888]">Installment Number:</span>
            <span className="font-bold text-white">#{activeReq.installmentNumber}</span>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-2.5 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-300">
            {errorMsg}
          </div>
        )}

        {/* Payment Account Selection */}
        <div className="space-y-2">
          <label className="block text-[10px] text-[#aaa] uppercase tracking-wider">
            Debit Account (Check Balance)
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id} className="bg-[#181820] text-white">
                {acc.name} ({acc.bankName}) - Available: {currencySymbol}{formatAmount(acc.balance)}
              </option>
            ))}
          </select>
        </div>

        {/* Confirmation Note */}
        <div>
          <label className="block text-[10px] text-[#aaa] uppercase tracking-wider mb-1">
            Memo / Reference (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Bank ECS / Auto-debit confirmed"
            className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Explanatory security notice */}
        <div className="flex items-center gap-2 text-[10px] text-[#777] p-2 bg-[#14141a] rounded-xl border border-[#222]">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Scheduled EMIs are recorded to your account ledger only after you confirm here.</span>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleConfirmCurrent}
            className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm Payment & Debit Account</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSkip(activeReq.id)}
              className="flex-1 py-2 bg-[#1e1e24] hover:bg-[#282832] border border-[#333] text-[#aaa] hover:text-white text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <SkipForward className="w-3.5 h-3.5" />
              <span>Skip Installment</span>
            </button>
            <button
              type="button"
              onClick={() => onRemindLater(activeReq.id)}
              className="flex-1 py-2 bg-[#1e1e24] hover:bg-[#282832] border border-[#333] text-[#aaa] hover:text-white text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Remind Later</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
