import type { Category, Transaction } from '../types/finance';
import { computeBudgetUsage } from './budgetUsage';
import { protectAssistantText } from './assistantPrivacy';
import { formatMoney, getCurrencyLocale } from './money';
import { isValidDate } from './savingsGoals';

export function answerAssistantCategoryOverview(
  question: string, categories: readonly Category[], transactions: readonly Transaction[], asOfDate: string, currencyCode: string,
): string | undefined {
  const text = question.trim();
  const request = '^(?:(?:please|mina)[, ]+)*(?:list(?: down)?|show|display|what are|which are|give me)\\s+';
  const subject = '(?:(?:all|my|the|available|existing|current)\\s+)*(?:categories(?:\\s+(?:and|with|&)\\s+(?:their\\s+)?budgets)?|budgets(?:\\s+(?:and|&)\\s+categories)?)';
  const period = '(?:\\s+(?:for (?:the )?(?:current|this) month|this month|currently|in (?:the )?app))?(?:\\s+please)?[?.!]*$';
  if (!new RegExp(request + subject + period, 'i').test(text)) return undefined;
  if (!isValidDate(asOfDate)) throw new Error('The current date is invalid. Check your device clock.');
  if (categories.some(category => category.budgetLimit !== undefined && !Number.isFinite(category.budgetLimit))
    || transactions.some(transaction => !Number.isFinite(transaction.amount))) {
    throw new Error('A budget or transaction amount is invalid. Correct it before listing budgets.');
  }
  const month = asOfDate.slice(0, 7);
  const validTransactions = transactions.filter(transaction => isValidDate(transaction.date));
  const usage = computeBudgetUsage(validTransactions, categories, month);
  const money = (amount: number) => `${currencyCode} ${formatMoney(amount, { locale: getCurrencyLocale(currencyCode) })}`;
  const lines = [`Categories and monthly budgets for ${month}, as of ${asOfDate}:`];
  for (const category of categories) {
    const budget = usage.find(item => item.category.id === category.id);
    lines.push(`${protectAssistantText(category.name)} (${category.type}): ${budget
      ? `budget ${money(budget.budget)}; used ${money(budget.spent)}; remaining ${money(budget.remaining)}${budget.overBudget > 0 ? `; over budget ${money(budget.overBudget)}` : ''}`
      : 'no monthly expense budget'}.`);
  }
  if (!categories.length) lines.push('No categories are available.');
  lines.push('Budgets are your current recurring monthly limits, not historical snapshots. Usage includes operating spending minus refunds; transfers, investments and loan payments are excluded.');
  lines.push('Based only on records available on this device; missing or unsynced transactions may make usage incomplete.');
  if (validTransactions.length !== transactions.length) lines.push('Transactions with invalid dates were excluded.');
  return lines.join('\n');
}
