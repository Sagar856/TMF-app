import type { Category, Transaction } from '../types/finance';
import { getTransactionKind, inferTransactionKind } from './transactionKind';
import { protectAssistantText } from './assistantPrivacy';

export type CategoryOrigin = NonNullable<Transaction['categoryOrigin']>;

export type AssistantCategoryResult =
  | { status: 'apply'; transaction: Transaction }
  | { status: 'review'; reason: string; category: string; subcategory: string }
  | { status: 'skip'; reason: string };

export interface AssistantCategoryReview {
  transactionId: string;
  before: Transaction;
  categoryId: string;
  category: string;
  subcategory: string;
  reason: string;
  cloudConflict?: boolean;
  manualOnly?: boolean;
  postSave?: boolean;
}

interface AssistantCategoryInput {
  before: Transaction;
  current: Transaction | undefined;
  categories: readonly Category[];
  origin: CategoryOrigin;
  explicitlySelected: boolean;
  rule?: { category: string; subcategory: string };
  output: unknown;
}

/**
 * Validate untrusted model output and local state before proposing an update.
 * A caller must additionally perform a conflict-safe cloud write before
 * applying this proposal to a synced transaction.
 */
export function evaluateAssistantCategory(input: AssistantCategoryInput): AssistantCategoryResult {
  const { before, current, categories, origin, output } = input;
  if (!current) return { status: 'skip', reason: 'Transaction no longer exists.' };
  if ((origin === 'user-edited' || origin === 'assistant') && !input.explicitlySelected) {
    return { status: 'skip', reason: 'This category is protected from automatic changes.' };
  }
  if (origin !== 'eligible' && origin !== 'imported' && origin !== 'rule' && !input.explicitlySelected) {
    return { status: 'skip', reason: 'The existing category has unknown origin.' };
  }
  if (before.id !== current.id || before.category !== current.category || before.subcategory !== current.subcategory
    || before.type !== current.type || before.title !== current.title || before.payeeOrPayer !== current.payeeOrPayer
    || before.note !== current.note || before.rawText !== current.rawText || before.amount !== current.amount
    || before.date !== current.date || before.time !== current.time || before.accountId !== current.accountId
    || before.toAccountId !== current.toAccountId || before.paymentMethod !== current.paymentMethod
    || before.refNumber !== current.refNumber || before.source !== current.source || before.kind !== current.kind
    || Boolean(before.location) !== Boolean(current.location)
    || before.location?.lat !== current.location?.lat || before.location?.lng !== current.location?.lng
    || before.location?.name !== current.location?.name
    || before.syncRevision !== current.syncRevision || before.categoryOrigin !== current.categoryOrigin) {
    return { status: 'skip', reason: 'Transaction changed while categorization was running.' };
  }
  if (typeof output !== 'object' || output === null || Array.isArray(output)) {
    return { status: 'skip', reason: 'The model returned an invalid category.' };
  }
  const record = output as Record<string, unknown>;
  if (typeof record.categoryId !== 'string' || typeof record.subcategory !== 'string' || typeof record.uncertain !== 'boolean') {
    return { status: 'skip', reason: 'The model returned an invalid category.' };
  }
  const category = categories.find(item => item.id === record.categoryId);
  const categoryType = current.type === 'credit' ? 'income' : 'expense';
  if (!category || category.type !== categoryType || !category.subcategories.includes(record.subcategory)) {
    return { status: 'skip', reason: 'The model selected an unavailable category or subcategory.' };
  }
  const candidate = { ...current, category: category.name, subcategory: record.subcategory };
  if (inferTransactionKind(candidate) !== getTransactionKind(current)) {
    return { status: 'skip', reason: 'The category would change the transaction kind.' };
  }
  if (current.category === candidate.category && current.subcategory === candidate.subcategory) {
    return { status: 'skip', reason: 'The category is unchanged.' };
  }
  if (record.uncertain) {
    return { status: 'review', reason: 'The model is uncertain.', category: category.name, subcategory: record.subcategory };
  }
  if (input.rule && (input.rule.category !== category.name || input.rule.subcategory !== record.subcategory)) {
    return { status: 'review', reason: 'The model disagrees with a categorization rule.', category: category.name, subcategory: record.subcategory };
  }
  if (origin === 'user-edited' || (origin === 'assistant' && input.explicitlySelected)) {
    return { status: 'review', reason: 'This category was set by a user and requires confirmation.', category: category.name, subcategory: record.subcategory };
  }
  return { status: 'apply', transaction: candidate };
}

export function parseAssistantCategoryProposal(output: string): unknown {
  const trimmed = output.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

export function assistantCategoryPrompt(
  transaction: Pick<Transaction, 'type' | 'title' | 'category' | 'subcategory'>, categories: readonly Category[],
): string {
  const available = categories
    .filter(category => category.type === (transaction.type === 'credit' ? 'income' : 'expense'))
    .map((category, index) => ({ id: `c${index}`, name: category.name, subcategories: category.subcategories }));
  return [
    'Categorize this transaction using exactly one listed category ID and one of its listed subcategories.',
    'Return only JSON: {"categoryId":"...","subcategory":"...","uncertain":false}. Set uncertain=true if the evidence is weak. Never create a category.',
    `Direction: ${transaction.type}`,
    `Description: ${transaction.title}`,
    `Current category: ${transaction.category} / ${transaction.subcategory}`,
    `Available categories: ${JSON.stringify(available)}`,
  ].join('\n');
}

export function resolveAssistantCategoryProposal(
  output: unknown,
  transaction: Pick<Transaction, 'type'>,
  categories: readonly Category[],
): unknown {
  if (typeof output !== 'object' || output === null || Array.isArray(output)) return undefined;
  const record = output as Record<string, unknown>;
  if (typeof record.categoryId !== 'string' || !/^c(?:0|[1-9]\d*)$/.test(record.categoryId)
    || typeof record.subcategory !== 'string') return undefined;
  const available = categories.filter(category => category.type === (transaction.type === 'credit' ? 'income' : 'expense'));
  const category = available[Number(record.categoryId.slice(1))];
  if (!category) return undefined;
  const matches = category.subcategories.filter(subcategory => protectAssistantText(subcategory) === record.subcategory);
  if (matches.length !== 1) return undefined;
  return { ...record, categoryId: category.id, subcategory: matches[0] };
}
