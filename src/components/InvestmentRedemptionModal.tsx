import React, { useState, useMemo } from 'react';
import { InvestmentRecord, FinancialAccount, InvestmentRedemption } from '../types/finance';
import { calculateRedemption, roundCurrency } from '../services/financialCalculations';
import { X, ArrowDownRight, CheckCircle2, AlertCircle, Building2, DollarSign, Percent, ShieldCheck } from 'lucide-react';

interface InvestmentRedemptionModalProps {
  investment: InvestmentRecord;
  accounts: FinancialAccount[];
  currencySymbol: string;
  onClose: () => void;
  onConfirmRedemption: (
    investmentId: string,
    redemption: InvestmentRedemption,
    updatedInvestment: InvestmentRecord,
    creditedAccountId: string,
    netProceeds: number
  ) => void;
}

export const InvestmentRedemptionModal: React.FC<InvestmentRedemptionModalProps> = ({
  investment,
  accounts,
  currencySymbol,
  onClose,
  onConfirmRedemption,
}) => {
  const isFD = investment.type === 'Fixed Deposit';
  const isStock = investment.type === 'Stocks';
  const isMF = investment.type === 'Mutual Funds';

  // Determine available units/shares/amount
  const availableQuantity = useMemo(() => {
    if (isStock) return investment.shares || (investment.amountInvested / (investment.purchasePrice || 100));
    if (isMF) return investment.units || (investment.amountInvested / (investment.purchaseNav || 100));
    return 1; // for FD or generic
  }, [investment, isStock, isMF]);

  const defaultPrice = useMemo(() => {
    if (isStock) return investment.currentPrice || investment.purchasePrice || (investment.currentValue / (availableQuantity || 1));
    if (isMF) return investment.currentNav || investment.purchaseNav || (investment.currentValue / (availableQuantity || 1));
    if (isFD) return investment.currentValue || investment.amountInvested;
    return investment.currentValue || investment.amountInvested;
  }, [investment, isStock, isMF, isFD, availableQuantity]);

  const [isFull, setIsFull] = useState<boolean>(true);
  const [redeemQuantity, setRedeemQuantity] = useState<string>(String(roundCurrency(availableQuantity)));
  const [redemptionPrice, setRedemptionPrice] = useState<string>(String(roundCurrency(defaultPrice)));
  const [charges, setCharges] = useState<string>(() => {
    if (isMF && investment.exitLoadPercent) {
      return String(roundCurrency((availableQuantity * defaultPrice * investment.exitLoadPercent) / 100));
    }
    if (isFD && investment.prematurePenaltyPercent) {
      return String(roundCurrency((investment.amountInvested * (investment.prematurePenaltyPercent / 100))));
    }
    return '0';
  });
  const [taxPercent, setTaxPercent] = useState<string>('0');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (investment.linkedAccountId && accounts.some((a) => a.id === investment.linkedAccountId)) {
      return investment.linkedAccountId;
    }
    const defaultBank = accounts.find((a) => a.type === 'Bank');
    return defaultBank?.id || accounts[0]?.id || '';
  });
  const [redemptionDate, setRedemptionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Handle mode toggle
  const handleToggleFull = (full: boolean) => {
    setIsFull(full);
    if (full) {
      setRedeemQuantity(String(roundCurrency(availableQuantity)));
    } else {
      setRedeemQuantity(String(roundCurrency(availableQuantity / 2)));
    }
  };

  const parsedQty = parseFloat(redeemQuantity) || 0;
  const parsedPrice = parseFloat(redemptionPrice) || 0;
  const parsedCharges = parseFloat(charges) || 0;
  const parsedTaxPercent = parseFloat(taxPercent) || 0;

  // Real-time calculation using financial engine
  const calculationResult = useMemo(() => {
    return calculateRedemption({
      totalUnitsOrShares: availableQuantity,
      totalCostBasis: investment.amountInvested,
      unitsOrSharesToRedeem: isFull ? availableQuantity : parsedQty,
      redemptionPrice: parsedPrice,
      chargesAmount: parsedCharges,
      taxRatePercent: parsedTaxPercent,
      isFixedDeposit: isFD,
    });
  }, [availableQuantity, investment.amountInvested, isFull, parsedQty, parsedPrice, parsedCharges, parsedTaxPercent, isFD]);

  const handleExecuteRedemption = () => {
    setErrorMsg('');
    if (!selectedAccountId) {
      setErrorMsg('Please select a bank account to receive the redemption funds.');
      return;
    }
    if (parsedQty <= 0 && !isFull) {
      setErrorMsg('Redemption quantity must be greater than zero.');
      return;
    }
    if (parsedQty > availableQuantity + 0.0001 && !isFull) {
      setErrorMsg(`Cannot redeem more than available holdings (${availableQuantity}).`);
      return;
    }
    if (parsedPrice <= 0) {
      setErrorMsg('Redemption price must be greater than zero.');
      return;
    }

    setIsSubmitting(true);

    const redemptionId = `red_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const creditedAccount = accounts.find((a) => a.id === selectedAccountId);

    const redemptionRecord: InvestmentRedemption = {
      id: redemptionId,
      date: redemptionDate,
      unitsOrSharesRedeemed: calculationResult.unitsOrSharesRedeemed,
      redemptionPrice: parsedPrice,
      grossProceeds: calculationResult.grossProceeds,
      charges: calculationResult.charges,
      taxes: calculationResult.taxes,
      netCredited: calculationResult.netCreditedAmount,
      costBasis: calculationResult.allocatedCostBasis,
      realizedGainLoss: calculationResult.realizedProfitLoss,
      creditedAccountId: selectedAccountId,
      creditedAccountName: creditedAccount?.name || 'Selected Account',
      isFullRedemption: calculationResult.isFullRedemption,
      notes: notes.trim() || (calculationResult.isFullRedemption ? 'Full investment liquidation' : 'Partial redemption liquidation'),
    };

    // Calculate updated investment state
    const existingRedemptions = investment.redemptions || [];
    const updatedRedemptions = [...existingRedemptions, redemptionRecord];
    const totalRealizedPL = roundCurrency((investment.realizedProfitLoss || 0) + calculationResult.realizedProfitLoss);

    let updatedInvestment: InvestmentRecord;

    if (calculationResult.isFullRedemption) {
      updatedInvestment = {
        ...investment,
        status: 'redeemed',
        amountInvested: 0,
        currentValue: 0,
        units: 0,
        shares: 0,
        realizedProfitLoss: totalRealizedPL,
        redemptions: updatedRedemptions,
        notes: `${investment.notes ? investment.notes + ' | ' : ''}Liquidated on ${redemptionDate}`,
      };
    } else {
      // Partial redemption
      const remainingCostBasis = calculationResult.remainingCostBasis;
      const remainingQty = calculationResult.remainingUnitsOrShares;
      const remainingCurrentValue = roundCurrency(remainingQty * parsedPrice);
      const remainingReturnPct = remainingCostBasis > 0 
        ? roundCurrency(((remainingCurrentValue - remainingCostBasis) / remainingCostBasis) * 100) 
        : 0;

      updatedInvestment = {
        ...investment,
        status: 'partially_redeemed',
        amountInvested: remainingCostBasis,
        currentValue: remainingCurrentValue,
        returnsPercent: remainingReturnPct,
        units: isMF ? remainingQty : investment.units,
        shares: isStock ? remainingQty : investment.shares,
        realizedProfitLoss: totalRealizedPL,
        redemptions: updatedRedemptions,
      };
    }

    onConfirmRedemption(
      investment.id,
      redemptionRecord,
      updatedInvestment,
      selectedAccountId,
      calculationResult.netCreditedAmount
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 font-mono">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 bg-[#121217] border border-[#2a2a34] rounded-3xl p-5 sm:p-6 max-w-lg w-full text-white shadow-2xl max-h-[92vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-950/70 border border-red-700/60 flex items-center justify-center text-red-400">
              <ArrowDownRight className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                {isFD ? 'Withdraw Fixed Deposit' : 'Redeem Investment'}
              </h3>
              <p className="text-[10px] text-[#888] truncate max-w-[280px]">
                {investment.name} ({investment.type})
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Full vs Partial Tabs */}
        {!isFD && (
          <div className="flex items-center p-1 bg-[#181820] border border-[#2a2a34] rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => handleToggleFull(true)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                isFull
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-[#888] hover:text-white'
              }`}
            >
              Full Redemption (100%)
            </button>
            <button
              type="button"
              onClick={() => handleToggleFull(false)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                !isFull
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-[#888] hover:text-white'
              }`}
            >
              Partial Redemption
            </button>
          </div>
        )}

        {/* Investment Current Position Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-[#16161c] border border-[#22222a] rounded-2xl text-[11px]">
          <div>
            <span className="text-[#666] block text-[9px] uppercase">Total Cost Basis</span>
            <span className="font-bold text-[#ddd]">
              {currencySymbol}{investment.amountInvested.toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[#666] block text-[9px] uppercase">Market Value</span>
            <span className="font-bold text-emerald-400">
              {currencySymbol}{investment.currentValue.toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[#666] block text-[9px] uppercase">
              {isStock ? 'Total Shares' : isMF ? 'Total Units' : 'Tenure'}
            </span>
            <span className="font-bold text-white">
              {isFD ? `${investment.tenureMonths || 12} Mos` : availableQuantity.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Input Fields */}
        <div className="space-y-3">
          {/* Quantity to Redeem */}
          {!isFull && !isFD && (
            <div>
              <label className="block text-[10px] text-[#aaa] uppercase mb-1">
                {isStock ? 'Shares to Sell' : isMF ? 'Units to Redeem' : 'Amount to Redeem'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  max={availableQuantity}
                  value={redeemQuantity}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setRedeemQuantity(e.target.value)}
                  className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  placeholder="e.g. 50"
                />
                <button
                  type="button"
                  onClick={() => setRedeemQuantity(String(availableQuantity))}
                  className="absolute right-2 top-1.5 px-2 py-0.5 bg-[#252530] text-[9px] text-red-400 font-bold rounded hover:bg-[#303040]"
                >
                  MAX
                </button>
              </div>
            </div>
          )}

          {/* Redemption Price / NAV */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-[#aaa] uppercase mb-1">
                {isStock ? 'Sale Price Per Share' : isMF ? 'Applicable NAV' : 'Gross Maturity / Value'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-[#666]">{currencySymbol}</span>
                <input
                  type="number"
                  step="any"
                  value={redemptionPrice}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setRedemptionPrice(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            {/* Exit Load / Charges / Penalty */}
            <div>
              <label className="block text-[10px] text-[#aaa] uppercase mb-1">
                {isFD ? 'Premature Penalty' : 'Exit Load / Brokerage'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-[#666]">{currencySymbol}</span>
                <input
                  type="number"
                  step="any"
                  value={charges}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setCharges(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Taxes % (STCG / LTCG / TDS) */}
            <div>
              <label className="block text-[10px] text-[#aaa] uppercase mb-1">
                Tax / TDS Rate (%)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-[#666]">%</span>
                <input
                  type="number"
                  step="any"
                  value={taxPercent}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
                  placeholder="0 (e.g. 15 for STCG)"
                />
              </div>
            </div>

            {/* Redemption Date */}
            <div>
              <label className="block text-[10px] text-[#aaa] uppercase mb-1">Redemption Date</label>
              <input
                type="date"
                value={redemptionDate}
                onChange={(e) => setRedemptionDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-[10px] text-[#aaa] uppercase mb-1">
              Credit Proceeds To Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500 cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-[#181820] text-white">
                  {acc.name} ({acc.bankName}) - Bal: {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] text-[#aaa] uppercase mb-1">Notes / Audit Memo</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rebalancing portfolio into debt"
              className="w-full px-3 py-2 bg-[#181820] border border-[#333] rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Live Calculation Summary Breakdown Card */}
        <div className="p-4 bg-gradient-to-br from-[#181820] to-[#121217] border border-[#2a2a34] rounded-2xl space-y-2">
          <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center justify-between pb-1 border-b border-[#252530]">
            <span>Financial Settlement Breakdown</span>
            <span className="text-[#888]">
              {calculationResult.isFullRedemption ? '100% Liquidation' : 'Partial Liquidation'}
            </span>
          </div>

          <div className="flex justify-between text-xs text-[#bbb]">
            <span>Gross Liquidation Value:</span>
            <span className="font-bold text-white">
              {currencySymbol}{calculationResult.grossProceeds.toLocaleString('en-IN')}
            </span>
          </div>

          {calculationResult.charges > 0 && (
            <div className="flex justify-between text-xs text-red-400">
              <span>Less Charges / Exit Load:</span>
              <span>-{currencySymbol}{calculationResult.charges.toLocaleString('en-IN')}</span>
            </div>
          )}

          {calculationResult.taxes > 0 && (
            <div className="flex justify-between text-xs text-red-400">
              <span>Less Estimated Taxes / TDS:</span>
              <span>-{currencySymbol}{calculationResult.taxes.toLocaleString('en-IN')}</span>
            </div>
          )}

          <div className="pt-2 border-t border-[#252530] flex justify-between items-baseline">
            <div>
              <span className="text-xs text-[#aaa] block">Net Credited to Bank Account</span>
              <span className="text-[9px] text-[#666]">
                Transfers directly into ledger
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-400">
              {currencySymbol}{calculationResult.netCreditedAmount.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Realized Profit or Loss vs Returned Principal */}
          <div className="pt-2 border-t border-[#252530] flex justify-between items-center text-xs">
            <span className="text-[#aaa]">Realized Profit / Loss:</span>
            <span
              className={`font-bold ${
                calculationResult.realizedProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {calculationResult.realizedProfitLoss >= 0 ? '+' : ''}
              {currencySymbol}{calculationResult.realizedProfitLoss.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#1e1e24] hover:bg-[#252530] border border-[#333] text-xs font-bold uppercase rounded-xl text-[#aaa] hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleExecuteRedemption}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase rounded-xl transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirm & Credit Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
