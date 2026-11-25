import React from 'react';
import type { AssistantReport } from '../utils/assistantReport';
import { formatMoney, getCurrencyLocale } from '../utils/money';

interface AssistantReportViewProps {
  report: AssistantReport;
  currencyCode: string;
  explanation: string;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

export const AssistantReportView: React.FC<AssistantReportViewProps> = ({
  report, currencyCode, explanation, onExportCsv, onExportPdf,
}) => {
  const money = (amount: number) => `${currencyCode} ${formatMoney(amount, { locale: getCurrencyLocale(currencyCode) })}`;
  return (
    <article aria-label={`Financial report for ${report.month}`} className="space-y-4 rounded-2xl border border-line bg-surface-1 p-4 text-content-1">
      <header>
        <h3 className="text-sm font-bold">Financial report: {report.month}</h3>
        <p className="mt-1 text-xs text-content-3">Transactions and budgets cover this month. Other balances are current snapshots as of {report.asOfDate}.</p>
      </header>
      <section aria-label="Monthly cashflow">
        <h4 className="text-xs font-bold">Monthly cashflow</h4>
        <dl className="mt-1 space-y-1 text-xs">
          <div className="flex justify-between gap-2"><dt>Recorded transactions</dt><dd>{report.transactionCount}</dd></div>
          <div className="flex justify-between gap-2"><dt>Operating income</dt><dd>{money(report.operatingIncome)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Net operating spending</dt><dd>{money(report.operatingExpense)}</dd></div>
        </dl>
      </section>
      {report.categorySpending.length > 0 && (
        <section aria-label="Category spending">
          <h4 className="text-xs font-bold">Category spending</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.categorySpending.map(item =>
            <li key={item.category} className="flex justify-between gap-2"><span>{item.category}</span><span>{money(item.amount)}</span></li>)}</ul>
        </section>
      )}
      {report.budgets.length > 0 && (
        <section aria-label="Monthly budgets">
          <h4 className="text-xs font-bold">Monthly budgets</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.budgets.map(item =>
            <li key={item.category.id} className="flex justify-between gap-2"><span>{item.category.name}</span><span>{money(item.spent)} / {money(item.budget)}</span></li>)}</ul>
        </section>
      )}
      {report.accounts.length > 0 && (
        <section aria-label="Current accounts">
          <h4 className="text-xs font-bold">Accounts</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.accounts.map((item, index) =>
            <li key={`${item.name}-${index}`} className="flex justify-between gap-2"><span>{item.name} ({item.type})</span><span>{money(item.balance)}</span></li>)}</ul>
        </section>
      )}
      {report.investments.length > 0 && (
        <section aria-label="Current investments">
          <h4 className="text-xs font-bold">Investments</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.investments.map((item, index) =>
            <li key={`${item.name}-${index}`} className="flex justify-between gap-2"><span>{item.name} ({item.type}, {item.status})</span><span>{money(item.currentValue)}</span></li>)}</ul>
        </section>
      )}
      {report.loans.length > 0 && (
        <section aria-label="Current loans and lends">
          <h4 className="text-xs font-bold">Loans and lends</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.loans.map((item, index) =>
            <li key={`${item.title}-${index}`} className="flex justify-between gap-2"><span>{item.title} ({item.type}, {item.status})</span><span>{money(item.remainingAmount)} remaining</span></li>)}</ul>
        </section>
      )}
      {report.savingsGoals.length > 0 && (
        <section aria-label="Current savings goals">
          <h4 className="text-xs font-bold">Savings goals</h4>
          <ul className="mt-1 space-y-1 text-xs">{report.savingsGoals.map((item, index) =>
            <li key={`${item.title}-${index}`} className="flex justify-between gap-2"><span>{item.title}</span><span>{money(item.savedAmount)} / {money(item.targetAmount)} ({item.progress}%)</span></li>)}</ul>
        </section>
      )}
      {explanation && (
        <section aria-label="AI-selected findings">
          <h4 className="text-xs font-bold">AI-selected findings</h4>
          <p className="mt-1 whitespace-pre-line text-xs">{explanation}</p>
        </section>
      )}
      <section aria-label="Report limitations">
        <h4 className="text-xs font-bold">Data limitations</h4>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-content-3">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
      </section>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onExportCsv} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold">Export CSV</button>
        <button type="button" onClick={onExportPdf} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-bold">Export PDF</button>
      </div>
    </article>
  );
};
