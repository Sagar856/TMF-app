import test from 'node:test';
import assert from 'node:assert/strict';
import type { Category, Transaction } from '../types/finance';
import { assistantCategoryPrompt, evaluateAssistantCategory, parseAssistantCategoryProposal, resolveAssistantCategoryProposal } from './assistantCategory';

const transaction: Transaction = {
  id: 'tx', title: 'Market', amount: 125, type: 'debit', kind: 'expense',
  category: 'Uncategorized', subcategory: 'General', date: '2026-10-10', time: '10:00',
  source: 'UPI', accountId: 'account', note: 'note', rawText: 'original',
};
const categories: Category[] = [
  { id: 'food', name: 'Food', type: 'expense', iconName: 'Tag', subcategories: ['Groceries'] },
  { id: 'salary', name: 'Salary', type: 'income', iconName: 'Tag', subcategories: ['Pay'] },
  { id: 'transfer', name: 'Transfer', type: 'expense', iconName: 'Tag', subcategories: ['General'] },
];
const output = { categoryId: 'food', subcategory: 'Groceries', uncertain: false };
const input = { before: transaction, current: transaction, categories, origin: 'eligible' as const, explicitlySelected: false, output };

test('valid category proposal preserves all unrelated transaction fields', () => {
  const result = evaluateAssistantCategory(input);
  assert.deepEqual(result, { status: 'apply', transaction: { ...transaction, category: 'Food', subcategory: 'Groceries' } });
  assert.equal(transaction.category, 'Uncategorized');
});

test('user edits, changed records and unknown-origin categories are protected', () => {
  assert.equal(evaluateAssistantCategory({ ...input, origin: 'user-edited', explicitlySelected: true }).status, 'review');
  assert.equal(evaluateAssistantCategory({ ...input, origin: 'unknown' }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, origin: 'unknown', explicitlySelected: true }).status, 'apply');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, category: 'Manual choice' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, title: 'Edited title' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, rawText: 'Changed' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, amount: 130 } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, toAccountId: 'other-account' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, refNumber: 'new-reference' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, source: 'SMS' } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: { ...transaction, location: { lat: 1, lng: 2, name: 'Place' } } }).status, 'skip');
  const withLocation = { ...transaction, location: { lat: 1, lng: 2, name: 'Place' } };
  assert.equal(evaluateAssistantCategory({ ...input, before: withLocation, current: { ...withLocation, location: { ...withLocation.location, lng: 3 } } }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, current: undefined }).status, 'skip');
  assert.equal(evaluateAssistantCategory({ ...input, origin: 'imported' }).status, 'apply');
});

test('uncertainty and rule disagreements require review', () => {
  assert.equal(evaluateAssistantCategory({ ...input, output: { ...output, uncertain: true } }).status, 'review');
  assert.equal(evaluateAssistantCategory({ ...input, rule: { category: 'Travel', subcategory: 'Bus' } }).status, 'review');
  assert.equal(evaluateAssistantCategory({ ...input, rule: { category: 'Food', subcategory: 'Groceries' } }).status, 'apply');
});

test('unavailable, malformed, wrong-direction and kind-changing categories cannot be applied', () => {
  for (const invalid of [
    null,
    { categoryId: 'invented', subcategory: 'Groceries', uncertain: false },
    { categoryId: 'food', subcategory: 'Invented', uncertain: false },
    { categoryId: 'salary', subcategory: 'Pay', uncertain: false },
    { categoryId: 'transfer', subcategory: 'General', uncertain: false },
    { categoryId: 'food', subcategory: 'Groceries' },
  ]) {
    assert.equal(evaluateAssistantCategory({ ...input, output: invalid }).status, 'skip');
  }
});

test('category prompts restrict choices and parse plain or fenced JSON', () => {
  const prompt = assistantCategoryPrompt(transaction, categories);
  assert.match(prompt, /"id":"c0"/);
  assert.doesNotMatch(prompt, /"id":"food"/);
  assert.match(prompt, /"subcategories":\["Groceries"\]/);
  assert.doesNotMatch(prompt, /rawText|raw_text/);
  assert.doesNotMatch(prompt, /Merchant or person:|Note: note/);
  assert.deepEqual(parseAssistantCategoryProposal('{"categoryId":"food","subcategory":"Groceries","uncertain":false}'), output);
  assert.deepEqual(parseAssistantCategoryProposal('```json\n{"categoryId":"food","subcategory":"Groceries","uncertain":false}\n```'), output);
  assert.equal(parseAssistantCategoryProposal('No valid category'), undefined);
});

test('model category aliases resolve to original IDs and masked subcategory labels without ambiguity', () => {
  const choices = [
    { ...categories[0], id: 'cat_1234567890123456', subcategories: ['Account 123456789'] },
    categories[1],
  ];
  assert.doesNotMatch(assistantCategoryPrompt(transaction, choices), /cat_1234567890123456/);
  assert.deepEqual(
    resolveAssistantCategoryProposal({ categoryId: 'c0', subcategory: 'Account [number ending 6789]', uncertain: false }, transaction, choices),
    { categoryId: 'cat_1234567890123456', subcategory: 'Account 123456789', uncertain: false },
  );
  const ambiguous = [{ ...choices[0], subcategories: ['Account 123456789', 'Account 987656789'] }];
  assert.equal(resolveAssistantCategoryProposal({ categoryId: 'c0', subcategory: 'Account [number ending 6789]', uncertain: false }, transaction, ambiguous), undefined);
  assert.equal(resolveAssistantCategoryProposal({ categoryId: 'cat_1234567890123456', subcategory: 'Account 123456789', uncertain: false }, transaction, choices), undefined);
});
