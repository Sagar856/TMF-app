import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import React, { useState } from 'react';
import { LoanRecord, LoanInstallment, FinancialAccount } from '../types/finance';
import { todayLocalISO } from '../utils/dates';
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
  const formatAmount = useMoneyFormatter();
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
  const [paymentDate, setPaymentDate] = useState<string>(todayLocalISO());
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
      setActionError(`Insufficient funds in ${targetAccount.name}. Available: ${currencySymbol}${formatAmount(targetAccount.balance)}`);
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-content-2 border border-line">
            Scheduled
          </span>
        );
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Loan repayment schedule" className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-4 font-mono">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-backdrop backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 bg-surface-1 border border-line rounded-3xl p-5 sm:p-6 max-w-4xl w-full text-content-1 shadow-2xl max-h-[92vh] flex flex-col space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-content-1 uppercase tracking-wider flex items-center gap-2">
                <span>Amortization Repayment Schedule</span>
                {loan.loanStructure === 'no_cost_emi' && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-400 font-bold">
                    No-Cost EMI (0% Int)
                  </span>
                )}
              </h3>
              <p className="text-xs text-content-3 truncate max-w-[420px]">
                {loan.title} · Financed: {currencySymbol}{formatAmount(loan.totalAmount)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-surface-2 border border-line text-content-2 hover:text-content-1 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Loan Stats KPI Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-surface-2 border border-line rounded-2xl shrink-0 text-xs">
          <div>
            <span className="text-content-3 block text-[9px] uppercase tracking-wider">Installments Paid</span>
            <span className="font-bold text-content-1">
              {paidCount} / {schedule.length}
            </span>
          </div>
          <div>
            <span className="text-content-3 block text-[9px] uppercase tracking-wider">Principal Repaid</span>
            <span className="font-bold text-emerald-400">
              {currencySymbol}{formatAmount(totalPrincipalPaid)}
            </span>
          </div>
          <div>
            <span className="text-content-3 block text-[9px] uppercase tracking-wider">Interest Paid</span>
            <span className="font-bold text-amber-400">
              {currencySymbol}{formatAmount(totalInterestPaid)}
            </span>
          </div>
          <div>
            <span className="text-content-3 block text-[9px] uppercase tracking-wider">Remaining Balance</span>
            <span className="font-bold text-red-400">
              {currencySymbol}{formatAmount(loan.remainingAmount)}
            </span>
          </div>
        </div>

        {/* Confirmation Modal Overlay when user clicks Confirm on an installment */}
        {confirmingInstallment && (
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border-2 border-red-600/70 rounded-2xl space-y-3 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span>Confirm EMI Payment #{confirmingInstallment.installmentNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingInstallment(null)}
                className="text-content-3 hover:text-content-1 p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-content-2 uppercase mb-1">Due Date</label>
                <div className="font-bold text-content-1">{confirmingInstallment.dueDate}</div>
              </div>
              <div>
                <label className="block text-[10px] text-content-2 uppercase mb-1">Installment Amount</label>
                <div className="font-bold text-lg text-emerald-400">
                  {currencySymbol}{formatAmount(confirmingInstallment.emiAmount)}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-content-2 uppercase mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-1 border border-line rounded-lg text-xs text-content-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] text-content-2 uppercase mb-1">Debit Bank Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-1 border border-line rounded-lg text-xs text-content-1"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.bankName}) - Bal: {currencySymbol}{formatAmount(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-content-2 uppercase mb-1">Payment Note</label>
                <input
                  type="text"
                  placeholder="Auto-debit confirmed"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface-1 border border-line rounded-lg text-xs text-content-1"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmingInstallment(null)}
                className="px-3 py-1.5 bg-surface-2 text-content-2 hover:text-content-1 rounded-lg text-xs font-bold uppercase"
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
        <div className="flex-1 overflow-y-auto border border-line rounded-2xl bg-surface-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 bg-surface-2 border-b border-line text-[10px] text-content-3 uppercase tracking-wider font-bold z-10">
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
            <tbody className="divide-y divide-line">
              {schedule.map((inst) => {
                const isPaid = inst.status === 'paid';
                const isPending = inst.status === 'pending_confirmation';
                return (
                  <tr
                    key={inst.installmentNumber}
                    className={`hover:bg-surface-3 transition-colors ${
                      isPending ? 'bg-red-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-content-3">
                      {inst.installmentNumber}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-content-1">
                      {inst.dueDate}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-content-1 whitespace-nowrap">
                      {currencySymbol}{formatAmount(inst.emiAmount)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 hidden sm:table-cell whitespace-nowrap">
                      {currencySymbol}{formatAmount(inst.principalComponent)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-amber-400 hidden sm:table-cell whitespace-nowrap">
                      {currencySymbol}{formatAmount(inst.interestComponent)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-content-2 whitespace-nowrap">
                      {currencySymbol}{formatAmount(inst.outstandingBalance)}
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
                              className="px-2 py-1 bg-surface-2 hover:bg-surface-3 text-content-3 hover:text-content-1 text-[10px] rounded-lg transition-colors cursor-pointer"
                              title="Skip this installment"
                            >
                              Skip
                            </button>
                          )}
                        </div>
                      )}
                      {isPaid && (
                        <span className="text-[10px] text-content-3">
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
        <div className="flex justify-between items-center pt-2 border-t border-line shrink-0 text-xs">
          <div className="text-[10px] text-content-3">
            Total {schedule.length} installments scheduled · Industry standard reducing balance amortization
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-line text-xs font-bold uppercase rounded-xl text-content-1 cursor-pointer"
          >
            Close Schedule
          </button>
        </div>
      </div>
    </div>
  );
};
