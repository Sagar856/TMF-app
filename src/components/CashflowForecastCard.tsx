import React, { useMemo } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Wallet } from 'lucide-react';
import { Category, FinancialAccount, Transaction } from '../types/finance';
import { calculateCashflowForecast } from '../utils/cashflowForecast';
import { todayLocalISO } from '../utils/dates';
import { useMoneyFormatter } from '../hooks/useMoneyFormatter';

interface CashflowForecastCardProps {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  categories: Category[];
  currencySymbol: string;
}

function formatForecastDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const CashflowForecastCard: React.FC<CashflowForecastCardProps> = ({
  transactions,
  accounts,
  categories,
  currencySymbol,
}) => {
  const formatAmount = useMoneyFormatter();
  const forecast = useMemo(
    () => calculateCashflowForecast(transactions, accounts, categories, todayLocalISO()),
    [transactions, accounts, categories]
  );

  if (!forecast) return null;

  const hasExpenseIncrease =
    forecast.recentExpenseChangePercent !== null && forecast.recentExpenseChangePercent >= 20;
  const hasBudgetAlerts = forecast.overspendingCategories.length > 0;

  return (
    <section
      aria-labelledby="cashflow-forecast-title"
      className="bg-obsidian border border-nothing rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
            <h2 id="cashflow-forecast-title" className="text-sm sm:text-base font-bold text-white">
              30-day cash-flow forecast
            </h2>
          </div>
          <p className="text-[10px] sm:text-xs text-[#888] mt-1">
            Estimate through {formatForecastDate(forecast.throughDate)} based on account balances and transaction history.
          </p>
        </div>
        <Wallet className="w-4 h-4 text-[#666] shrink-0 mt-1" aria-hidden="true" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-[#26262a] bg-[#111113] p-3 min-w-0">
          <div className="text-[9px] text-[#777] uppercase font-bold">Available cash</div>
          {forecast.availableBalance === null ? (
            <div className="text-xs text-[#999] mt-1">Add a bank, debit, or wallet balance</div>
          ) : (
            <div className="text-sm sm:text-base text-white font-bold mt-1 break-words">
              {currencySymbol}{formatAmount(forecast.availableBalance)}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[#26262a] bg-[#111113] p-3 min-w-0">
          <div className="text-[9px] text-[#777] uppercase font-bold">Estimated balance</div>
          {forecast.projectedBalance === null ? (
            <div className="text-xs text-[#999] mt-1">Unavailable without a cash balance</div>
          ) : (
            <div className={`text-sm sm:text-base font-bold mt-1 break-words ${forecast.projectedBalance < 0 ? 'text-red-400' : 'text-white'}`}>
              {currencySymbol}{formatAmount(forecast.projectedBalance)}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[#26262a] bg-[#111113] p-3 min-w-0">
          <div className="text-[9px] text-[#777] uppercase font-bold">Recurring payments</div>
          <div className="text-sm sm:text-base text-white font-bold mt-1 break-words">
            {currencySymbol}{formatAmount(forecast.recurringExpenses)}
          </div>
          <div className="text-[9px] text-[#777] mt-1">
            {forecast.recurringPayments
              .filter((payment) => payment.type === 'debit')
              .reduce((count, payment) => count + payment.occurrences, 0)} detected in next 30 days
          </div>
        </div>
      </div>

      <p className="text-[9px] leading-relaxed text-[#777] mt-3">
        {forecast.historyCount < 3
          ? 'Limited recent transaction history; the estimate may not reflect typical spending. '
          : ''}
        Estimate only. Repeated transactions are inferred from history; irregular bills and unrecorded spending may be missed. Credit-card limits are not counted as cash.
      </p>

      {(forecast.projectedBalance !== null && forecast.projectedBalance < 0) && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-red-800/60 bg-red-950/30 p-2.5 text-[10px] text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Current cash and estimated upcoming activity may leave a shortfall within 30 days.</span>
        </div>
      )}

      {hasExpenseIncrease && forecast.recentExpenseChangePercent !== null && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-800/60 bg-amber-950/20 p-2.5 text-[10px] text-amber-200">
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Spending is up {Math.round(forecast.recentExpenseChangePercent)}% compared with the previous 30 days.
          </span>
        </div>
      )}
      {forecast.recentExpenseChangePercent !== null && forecast.recentExpenseChangePercent <= -20 && (
        <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/20 p-2.5 text-[10px] text-emerald-300">
          <ArrowDownRight className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Spending is down {Math.round(Math.abs(forecast.recentExpenseChangePercent))}% compared with the previous 30 days.</span>
        </div>
      )}

      {hasBudgetAlerts && (
        <div className="mt-3 space-y-1.5" aria-label="Budget forecast alerts">
          {forecast.overspendingCategories.slice(0, 3).map((item) => (
            <div
              key={item.category}
              role="status"
              className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 text-[10px] ${
                item.status === 'over'
                  ? 'border-red-800/60 bg-red-950/30 text-red-300'
                  : 'border-amber-800/60 bg-amber-950/20 text-amber-200'
              }`}
            >
              <span className="min-w-0">
                <strong>{item.category}</strong>
                {item.status === 'over' ? ' is over budget.' : ' is on track to exceed its budget.'}
              </span>
              <span className="shrink-0 font-bold">
                {currencySymbol}{formatAmount(item.spent)} / {currencySymbol}{formatAmount(item.limit)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
