import type { AssistantReport } from './assistantReport';

export type ReportRow = [section: string, item: string, value: string | number, period: string];

function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function assistantReportRows(report: AssistantReport, currencyCode: string, explanation: string): ReportRow[] {
  const month = report.month;
  const snapshot = `As of ${report.asOfDate}`;
  const rows: ReportRow[] = [
    ['Report', 'Currency', currencyCode, ''],
    ['Cashflow', 'Transactions', report.transactionCount, month],
    ['Cashflow', 'Operating income', report.operatingIncome, month],
    ['Cashflow', 'Operating expense net of refunds', report.operatingExpense, month],
    ...report.categorySpending.map(({ category, amount }): ReportRow => ['Category spending', category, amount, month]),
    ...report.budgets.flatMap(({ category, budget, spent }): ReportRow[] => [
      ['Budget limit', category.name, budget, month],
      ['Budget spent', category.name, spent, month],
    ]),
    ...report.accounts.map(({ name, type, balance }): ReportRow => ['Account balance', `${name} (${type})`, balance, snapshot]),
    ...report.investments.map(({ name, currentValue }): ReportRow => ['Investment value', name, currentValue, snapshot]),
    ...report.loans.map(({ title, type, remainingAmount }): ReportRow => [type === 'lend' ? 'Lend remaining' : 'Loan remaining', title, remainingAmount, snapshot]),
    ...report.savingsGoals.flatMap(({ title, savedAmount, targetAmount }): ReportRow[] => [
      ['Savings goal saved', title, savedAmount, snapshot],
      ['Savings goal target', title, targetAmount, snapshot],
    ]),
    ...report.limitations.map((limitation): ReportRow => ['Limitations', limitation, '', '']),
    ...(explanation ? [['AI explanation', 'Unverified commentary', explanation, ''] satisfies ReportRow] : []),
  ];
  return rows;
}

export function stringifyAssistantReportCsv(report: AssistantReport, currencyCode: string, explanation: string): string {
  return [['Section', 'Item', 'Value', 'Period'], ...assistantReportRows(report, currencyCode, explanation)]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
}
