import React, { useState } from 'react';
import { LoanRecord, LoanInstallment, FinancialAccount } from '../types/finance';
import { X, Calendar, CheckCircle2, Clock, SkipForward, AlertCircle, Building2, Layers, DollarSign, ArrowUpRight } from 'lucide-react';

interface LoanScheduleModalProps {
  loan: LoanRecord;
  accounts: FinancialAccount[];
  currencySymbol: string;
  onClose: () => void;
  onConfirmInstallmentPayment: (
    loanId: string,
    installmentNumber: number,
    paymentAccountId: string,
    amount: number,
    paidDate: string,
    notes?: string
  ) => void;
  onSkipInstallment: (loanId: string, installmentNumber: number) => void;
}

export const LoanScheduleModal: React.FC<LoanScheduleModalProps> = ({
  loan,
  accounts,
  currencySymbol,
  onClose,
  onConfirmInstallmentPayment,
  onSkipInstallment,
}) => {
  const schedule = loan.schedule || [];

  // Active confirmation installment state
  const [confirmingInstallment, setConfirmingInstallment] = useState<LoanInstallment | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (loan.linkedAccountId && accounts.some((a) => a.id === loan.linkedAccountId)) {
      return loan.linkedAccountId;
    }
    const defaultBank = accounts.find((a) => a.type === 'Bank');
    return defaultBank?.id || accounts[0]?.id || '';
  });
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  const paidCount = schedule.filter((s) => s.status === 'paid').length;
  const pendingCount = schedule.filter((s) => s.status === 'pending_confirmation').length;
  const totalPrincipalPaid = schedule
    .filter((s) => s.status === 'paid')
    .reduce((sum, s) => sum + s.principalComponent, 0);
  const totalInterestPaid = schedule
    .filter((s) => s.status === 'paid')
    .reduce((sum, s) => sum + s.interestComponent, 0);

  const handleExecutePayment = (inst: LoanInstallment) => {
    setActionError('');
    if (!selectedAccountId) {
      setActionError('Please select a payment account.');
      return;
    }
    const targetAccount = accounts.find((a) => a.id === selectedAccountId);
    if (targetAccount && targetAccount.type === 'Bank' && targetAccount.balance < inst.emiAmount) {
      setActionError(`Insufficient funds in ${targetAccount.name}. Available: ${currencySymbol}${targetAccount.balance.toLocaleString('en-IN')}`);
      return;
    }

    onConfirmInstallmentPayment(
      loan.id,
      inst.installmentNumber,
      selectedAccountId,
      inst.emiAmount,
      paymentDate,
      paymentNote || `EMI Installment #${inst.installmentNumber} for ${loan.title}`
    );
    setConfirmingInstallment(null);
  };

  const getStatusBadge = (status: LoanInstallment['status']) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        );
      case 'pending_confirmation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-400 border border-amber-800 animate-pulse">
            <Clock className="w-3 h-3" /> Needs Confirmation
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950/70 text-red-400 border border-red-800">
            <AlertCircle className="w-3 h-3" /> Overdue
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
            <SkipForward className="w-3 h-3" /> Skipped
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1a1a24] text-[#aaa] border border-[#333]">
            Scheduled
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-mono">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 bg-[#121217] border border-[#2a2a34] rounded-3xl p-5 sm:p-6 max-w-4xl w-full text-white shadow-2xl max-h-[92vh] flex flex-col space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Amortization Repayment Schedule</span>
                {loan.loanStructure === 'no_cost_emi' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 font-bold">
                    No-Cost EMI (0% Int)
                  </span>
                )}
              </h3>
              <p className="text-xs text-[#888] truncate max-w-[420px]">
                {loan.title} · Financed: {currencySymbol}{loan.totalAmount.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#1e1e24] border border-[#333] text-[#aaa] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loan Stats KPI Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-[#181820] border border-[#262632] rounded-2xl shrink-0 text-xs">
          <div>
            <span className="text-[#666] block text-[9px] uppercase tracking-wider">Installments Paid</span>
            <span className="font-bold text-white">
              {paidCount} / {schedule.length}
            </span>
          </div>
          <div>
            <span className="text-[#666] block text-[9px] uppercase tracking-wider">Principal Repaid</span>
            <span className="font-bold text-emerald-400">
              {currencySymbol}{Math.round(totalPrincipalPaid).toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[#666] block text-[9px] uppercase tracking-wider">Interest Paid</span>
            <span className="font-bold text-amber-400">
              {currencySymbol}{Math.round(totalInterestPaid).toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[#666] block text-[9px] uppercase tracking-wider">Remaining Balance</span>
            <span className="font-bold text-red-400">
              {currencySymbol}{Math.round(loan.remainingAmount).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Confirmation Modal Overlay when user clicks Confirm on an installment */}
        {confirmingInstallment && (
          <div className="p-4 bg-gradient-to-br from-red-950/40 via-[#181820] to-[#14141c] border-2 border-red-600/70 rounded-2xl space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-[#333]">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>Confirm EMI Payment #{confirmingInstallment.installmentNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingInstallment(null)}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-950 border border-red-800 rounded-xl text-xs text-red-300">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase mb-1">Due Date</label>
                <div className="font-bold text-white">{confirmingInstallment.dueDate}</div>
              </div>
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase mb-1">Installment Amount</label>
                <div className="font-bold text-lg text-emerald-400">
                  {currencySymbol}{confirmingInstallment.emiAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#121216] border border-[#333] rounded-lg text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase mb-1">Debit Bank Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#121216] border border-[#333] rounded-lg text-xs text-white"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName}) - Bal: {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[#aaa] uppercase mb-1">Payment Note</label>
                <input
                  type="text"
                  placeholder="Auto-debit confirmed"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#121216] border border-[#333] rounded-lg text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmingInstallment(null)}
                className="px-3 py-1.5 bg-[#222] text-[#aaa] hover:text-white rounded-lg text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecutePayment(confirmingInstallment)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold uppercase flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm & Record Transaction</span>
              </button>
            </div>
          </div>
        )}

        {/* Schedule Table */}
        <div className="flex-1 overflow-y-auto border border-[#222] rounded-2xl bg-[#0e0e12]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-[#16161c] border-b border-[#252530] text-[10px] text-[#888] uppercase tracking-wider font-bold z-10">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Due Date</th>
                <th className="py-2.5 px-3">EMI Amount</th>
                <th className="py-2.5 px-3 hidden sm:table-cell">Principal</th>
                <th className="py-2.5 px-3 hidden sm:table-cell">Interest</th>
                <th className="py-2.5 px-3">Outstanding</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b1b22]">
              {schedule.map((inst) => {
                const isPaid = inst.status === 'paid';
                const isPending = inst.status === 'pending_confirmation';
                return (
                  <tr
                    key={inst.installmentNumber}
                    className={`hover:bg-[#15151c] transition-colors ${
                      isPending ? 'bg-red-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#888]">
                      {inst.installmentNumber}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-white">
                      {inst.dueDate}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-white whitespace-nowrap">
                      {currencySymbol}{inst.emiAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 hidden sm:table-cell whitespace-nowrap">
                      {currencySymbol}{inst.principalComponent.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-amber-400 hidden sm:table-cell whitespace-nowrap">
                      {currencySymbol}{inst.interestComponent.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#aaa] whitespace-nowrap">
                      {currencySymbol}{inst.outstandingBalance.toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {getStatusBadge(inst.status)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {!isPaid && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingInstallment(inst);
                              setPaymentDate(inst.dueDate);
                            }}
                            className="px-2 py-1 bg-red-600/90 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Confirm Pay
                          </button>
                          {inst.status !== 'skipped' && (
                            <button
                              type="button"
                              onClick={() => onSkipInstallment(loan.id, inst.installmentNumber)}
                              className="px-2 py-1 bg-[#202028] hover:bg-[#2c2c36] text-[#888] hover:text-white text-[10px] rounded-lg transition-colors cursor-pointer"
                              title="Skip this installment"
                            >
                              Skip
                            </button>
                          )}
                        </div>
                      )}
                      {isPaid && (
                        <span className="text-[10px] text-[#666]">
                          {inst.paidDate || 'Paid'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-[#222] shrink-0 text-xs">
          <div className="text-[10px] text-[#777]">
            Total {schedule.length} installments scheduled · Industry standard reducing balance amortization
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1e1e24] hover:bg-[#252530] border border-[#333] text-xs font-bold uppercase rounded-xl text-white cursor-pointer"
          >
            Close Schedule
          </button>
        </div>
      </div>
    </div>
  );
};
