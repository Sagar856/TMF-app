import type { Category } from '../types/finance';
import { newId } from './ids';

type CategoryType = Category['type'];
export type CategoryActionDraft =
  | { kind: 'category'; name?: string; type?: CategoryType }
  | { kind: 'subcategory'; name?: string; target?: string }
  | { kind: 'budget'; target?: string; amount?: number };

export type CategoryAction =
  | { kind: 'category'; name: string; type: CategoryType }
  | { kind: 'subcategory'; name: string; before: Category }
  | { kind: 'budget'; amount: number; before: Category };

export type CategoryActionStep =
  | { status: 'question'; draft: CategoryActionDraft; text: string }
  | { status: 'ready'; action: CategoryAction; text: string }
  | { status: 'error'; text: string };

function cleanName(value: string | undefined): string | undefined {
  const name = value?.trim().replace(/^["“']|["”']$/g, '').trim();
  return name && name.length <= 80 && !/[\r\n\x00-\x1f]/.test(name) ? name : undefined;
}

function amountValue(value: string | undefined): number | undefined {
  if (!value || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return undefined;
  const amount = Number(value.replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000_000 ? amount : undefined;
}

function findTarget(name: string, categories: readonly Category[], expenseOnly = false): Category[] {
  return categories.filter(category => (!expenseOnly || category.type === 'expense')
    && category.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
}

function prepare(draft: CategoryActionDraft, categories: readonly Category[]): CategoryActionStep {
  if (draft.kind === 'category') {
    if (!draft.name) return { status: 'question', draft, text: 'What should the new category be called?' };
    if (!draft.type) return { status: 'question', draft, text: 'Should this category be expense, income or investment?' };
    if (findTarget(draft.name, categories).some(category => category.type === draft.type)) {
      return { status: 'error', text: `A ${draft.type} category named "${draft.name}" already exists. Nothing was changed.` };
    }
    return { status: 'ready', action: { kind: 'category', name: draft.name, type: draft.type },
      text: `Create ${draft.type} category "${draft.name}" with a General subcategory and no budget?` };
  }
  if (draft.kind === 'subcategory' && !draft.name) {
    return { status: 'question', draft, text: 'What should the new subcategory be called?' };
  }
  if (!draft.target) return { status: 'question', draft, text: 'Which existing category should I use? Enter its exact name.' };
  const matches = findTarget(draft.target, categories, draft.kind === 'budget');
  if (matches.length !== 1) return {
    status: 'question', draft: { ...draft, target: undefined },
    text: matches.length ? 'More than one category has that name. Please use Categories in Settings to make this change.'
      : 'I could not find a matching category. Please enter an existing category name.',
  };
  const before = matches[0];
  if (draft.kind === 'subcategory') {
    if (before.subcategories.some(item => item.trim().toLocaleLowerCase() === draft.name!.toLocaleLowerCase())) {
      return { status: 'error', text: 'That subcategory already exists. Nothing was changed.' };
    }
    return { status: 'ready', action: { kind: 'subcategory', name: draft.name!, before },
      text: `Add subcategory "${draft.name}" to ${before.type} category "${before.name}"?` };
  }
  if (draft.amount === undefined) return { status: 'question', draft, text: `What positive monthly budget should I set for "${before.name}"?` };
  return { status: 'ready', action: { kind: 'budget', before, amount: draft.amount },
    text: `Set the monthly budget for "${before.name}" to ${draft.amount} in your app currency${before.budgetLimit ? ` (currently ${before.budgetLimit})` : ''}?` };
}

export function advanceCategoryAction(
  input: string, pending: CategoryActionDraft | null, categories: readonly Category[],
): CategoryActionStep | null {
  const text = input.trim().replace(/[?.!]$/, '').trim();
  if (/^(?:cancel|never mind|nevermind)$/i.test(text) && pending) return { status: 'error', text: 'Cancelled. Nothing was changed.' };
  if (/\b(?:and|then)\s+(?:add|create|set|change|update|delete|remove)\b/i.test(text)) {
    return { status: 'error', text: 'Please request one change at a time. Nothing was changed.' };
  }
  const category = /^(?:please\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?category(?:\s+(?:as|named|called))?(?:\s+(.+?))?(?:\s+(?:in|as|under|of type)\s+(expense|income|investment))?$/i.exec(text);
  const subcategory = /^(?:please\s+)?(?:add|create)\s+(?:a\s+)?(?:new\s+)?subcategory(?:\s+(?:as|named|called))?(?:\s+(.+?))?(?:\s+(?:in|to|under|for)\s+(.+))?$/i.exec(text);
  const budget = /^(?:please\s+)?(?:set|change|update)\s+(?:the\s+)?(?:monthly\s+)?budget(?:\s+for\s+(.+?))?(?:\s+to\s+(?:₹|rs\.?\s*|inr\s*)?([\d,.]+))?$/i.exec(text);
  let draft: CategoryActionDraft;
  if (category) {
    let name = cleanName(category[1]);
    let type = category[2]?.toLowerCase() as CategoryType | undefined;
    if (name && /^(expense|income|investment)$/i.test(name) && !type) { type = name.toLowerCase() as CategoryType; name = undefined; }
    draft = { kind: 'category', name, type };
  } else if (subcategory) {
    draft = { kind: 'subcategory', name: cleanName(subcategory[1]), target: cleanName(subcategory[2]) };
  } else if (budget) {
    const amount = amountValue(budget[2]);
    if (budget[2] && amount === undefined) return { status: 'error', text: 'Enter a positive budget amount with at most two decimal places. Nothing was changed.' };
    draft = { kind: 'budget', target: cleanName(budget[1]), amount };
  } else if (pending) {
    if (text.length > 80 || /[?.!]/.test(text)) return { status: 'question', draft: pending, text: 'Please answer the last question, or type cancel.' };
    if (pending.kind === 'category') {
      if (!pending.name) draft = { ...pending, name: cleanName(text) };
      else if (!pending.type && /^(expense|income|investment)$/i.test(text)) draft = { ...pending, type: text.toLowerCase() as CategoryType };
      else return { status: 'question', draft: pending, text: 'Please choose expense, income or investment, or type cancel.' };
    } else if (pending.kind === 'subcategory') {
      draft = !pending.name ? { ...pending, name: cleanName(text) } : { ...pending, target: cleanName(text) };
    } else if (!pending.target) {
      draft = { ...pending, target: cleanName(text) };
    } else {
      const amount = amountValue(text.replace(/^(?:₹|rs\.?\s*|inr\s*)/i, ''));
      if (amount === undefined) return { status: 'question', draft: pending, text: 'Please enter a positive amount with at most two decimal places, or type cancel.' };
      draft = { ...pending, amount };
    }
  } else return null;
  return prepare(draft, categories);
}

export function applyCategoryAction(action: CategoryAction, categories: Category[]): Category[] {
  if (action.kind === 'category') {
    if (!cleanName(action.name) || findTarget(action.name, categories).some(category => category.type === action.type)) {
      throw new Error('That category already exists or its name is invalid. Nothing was changed.');
    }
    return [...categories, { id: newId('cat'), name: action.name, type: action.type, iconName: 'Tag', subcategories: ['General'] }];
  }
  const current = categories.find(category => category.id === action.before.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(action.before)) {
    throw new Error('The category changed while you were reviewing this action. Nothing was changed; please ask again.');
  }
  if (action.kind === 'subcategory') {
    if (!cleanName(action.name) || current.subcategories.some(item => item.trim().toLocaleLowerCase() === action.name.toLocaleLowerCase())) {
      throw new Error('That subcategory already exists or its name is invalid. Nothing was changed.');
    }
    return categories.map(category => category.id === current.id
      ? { ...category, subcategories: [...category.subcategories, action.name] } : category);
  }
  if (current.type !== 'expense' || !Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 1_000_000_000_000) {
    throw new Error('That budget is invalid. Nothing was changed.');
  }
  return categories.map(category => category.id === current.id ? { ...category, budgetLimit: action.amount } : category);
}
