import type { AssistantReport } from './assistantReport';

export interface AssistantReportInsight {
  id: string;
  text: string;
}

export function assistantReportInsights(report: AssistantReport): AssistantReportInsight[] {
  const insights: AssistantReportInsight[] = [];
  if (report.transactionCount === 0) {
    insights.push({ id: 'no-transactions', text: 'No transactions were recorded in the selected month.' });
  } else if (report.operatingIncome > report.operatingExpense) {
    insights.push({ id: 'income-higher', text: 'Operating income exceeded net operating spending in the selected month.' });
  } else if (report.operatingIncome < report.operatingExpense) {
    insights.push({ id: 'spending-higher', text: 'Net operating spending exceeded operating income in the selected month.' });
  } else {
    insights.push({ id: 'cashflow-equal', text: 'Operating income and net operating spending were equal in the selected month.' });
  }
  if (report.categorySpending.length > 0) {
    insights.push({ id: 'category-breakdown', text: 'The category breakdown is ordered by net operating spending.' });
  }
  if (report.budgets.some(budget => budget.spent > budget.budget)) {
    insights.push({ id: 'budget-exceeded', text: 'At least one recorded monthly budget was exceeded.' });
  } else if (report.budgets.length > 0) {
    insights.push({ id: 'budget-within', text: 'No recorded monthly budget was exceeded.' });
  }
  insights.push({
    id: 'data-limits',
    text: 'These figures use records available on this device and may be incomplete; snapshots are current, not historical month-end values.',
  });
  return insights;
}

export function assistantReportPrompt(insights: readonly AssistantReportInsight[]): string {
  return `Select up to three useful findings from this verified list. Return only a JSON array of their exact IDs, with no other text. Do not invent IDs.\n${JSON.stringify(insights)}`;
}

export function resolveAssistantReportExplanation(
  output: string,
  insights: readonly AssistantReportInsight[],
): string {
  let parsed: unknown;
  try {
    const trimmed = output.trim();
    const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
    parsed = JSON.parse(fenced ? fenced[1] : trimmed);
  } catch {
    throw new Error('The local AI returned an invalid report explanation. Please retry.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 3) {
    throw new Error('The local AI returned an invalid report explanation. Please retry.');
  }
  const ids: string[] = [];
  for (const value of parsed) {
    if (typeof value === 'string') ids.push(value);
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)
      && typeof value.id === 'string' && (value.text === undefined || typeof value.text === 'string')
      && Object.keys(value).every(key => key === 'id' || key === 'text')) ids.push(value.id);
    else throw new Error('The local AI returned an invalid report explanation. Please retry.');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('The local AI returned an invalid report explanation. Please retry.');
  }
  const available = new Map(insights.map(insight => [insight.id, insight.text]));
  const selected: string[] = [];
  for (const id of ids) {
    const text = available.get(id);
    if (!text) throw new Error('The local AI selected an unverified report finding. Please retry.');
    selected.push(text);
  }
  return selected.join('\n');
}
