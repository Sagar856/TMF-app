import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, ParsedNotification } from '../types/finance';
import { categorizeNotification } from '../services/notificationCategorization';
import { applyNotificationCategoryOverride } from './paymentTransaction';
import { suggestCategoryForTitle } from '../services/notification/CategoryClassifier';
import { notificationCategoryConfirmation } from './notificationCategoryFeedback';

const categories: Category[] = [
  { id: 'food', name: 'Food & Dining', type: 'expense', iconName: 'Tag', subcategories: ['Restaurants', 'Delivery', 'Groceries'] },
  { id: 'travel', name: 'Transport & Fuel', type: 'expense', iconName: 'Tag', subcategories: ['Fuel', 'Cab Services'] },
  { id: 'health', name: 'Health & Fitness', type: 'expense', iconName: 'Tag', subcategories: ['Medicines'] },
  { id: 'bills', name: 'Bills & Utilities', type: 'expense', iconName: 'Tag', subcategories: ['Electricity', 'Internet'] },
  { id: 'salary', name: 'Salary', type: 'income', iconName: 'Tag', subcategories: ['Primary Job'] },
];
const notification: ParsedNotification = {
  id: 'native_category', amount: 125, type: 'debit', date: '2026-11-26', time: '12:00',
  payeeOrPayer: 'Private merchant', rawText: 'Private original SMS', category: 'Food & Dining', subcategory: 'Restaurants',
  status: 'pending', appSource: 'Other UPI', confidenceScore: 1, requiresManualVerification: false,
};
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
before(() => Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, value: { getItem: () => null },
}));
after(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('notification rules map everyday words to valid categories and preserve all payment details', () => {
  for (const [text, category] of [
    ['lunch', 'Food & Dining'], ['dinner', 'Food & Dining'], ['breakfast', 'Food & Dining'],
    ['zomato', 'Food & Dining'], ['swiggy', 'Food & Dining'], ['lunch/dinner/breakfast', 'Food & Dining'],
    ['petrol', 'Transport & Fuel'], ['uber', 'Transport & Fuel'],
    ['pharmacy', 'Health & Fitness'], ['electricity', 'Bills & Utilities'],
  ]) {
    const input = { ...notification, categoryOverride: text };
    const result = applyNotificationCategoryOverride(input, categories);
    assert.equal(result.category, category, text);
    assert.ok(categories.find(item => item.name === category)?.subcategories.includes(result.subcategory));
    assert.deepEqual(result, { ...input, category: result.category, subcategory: result.subcategory });
    assert.equal(suggestCategoryForTitle(text)?.category, category, text);
  }
  const renamed = categories.map(category => category.id === 'food' ? { ...category, name: 'Food&Dinning' } : category);
  assert.equal(applyNotificationCategoryOverride({ ...notification, categoryOverride: 'lunch' }, renamed).category, 'Food&Dinning');
  const shortName = [{ ...categories[0], name: 'Food', subcategories: ['General'] }];
  assert.equal(applyNotificationCategoryOverride({ ...notification, categoryOverride: 'dinner' }, shortName).category, 'Food');
  const fuelName = [{ ...categories[1], name: 'Fuel Costs', subcategories: ['Vehicle'] }];
  assert.equal(applyNotificationCategoryOverride({ ...notification, categoryOverride: 'petrol' }, fuelName).category, 'Fuel Costs');
});

test('Category takes priority over Description; Description precedes the original parser result', async () => {
  const options = { onWarning: () => assert.fail('Unexpected warning') };
  const explicit = await categorizeNotification({ ...notification, categoryOverride: 'petrol', description: 'lunch' }, categories, options);
  assert.equal(explicit.category, 'Transport & Fuel');
  const description = await categorizeNotification({ ...notification, description: 'Taxi home with uber' }, categories, options);
  assert.equal(description.category, 'Transport & Fuel');
  const unknown = { ...notification, description: 'Unclear personal memo' };
  assert.deepEqual(await categorizeNotification(unknown, categories, options), unknown);
  await assert.rejects(categorizeNotification({ ...notification, categoryOverride: 'ambiguous memo', description: 'lunch' }, categories, options), /not found or matched ambiguously/);
  await assert.rejects(categorizeNotification({ ...notification, categoryOverride: 'lunch and petrol' }, categories, options), /ambiguously/);
  await assert.rejects(categorizeNotification({ ...notification, type: 'credit', categoryOverride: 'lunch' }, categories, options), /not found/);
  await assert.rejects(categorizeNotification({ ...notification, categoryOverride: 'lunch' }, categories.filter(category => category.id !== 'food'), options), /not found/);
});

test('MINA handles unfamiliar wording locally only when enabled, and rejects unsafe or uncertain results', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let enabled = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => String(enabled) },
  });
  let calls = 0;
  const warnings: string[] = [];
  let output = '{"categoryId":"c1","subcategory":"Fuel","uncertain":false}';
  const options = {
    onWarning: (message: string) => warnings.push(message),
    generate: async (prompt: string) => {
      calls++;
      assert.match(prompt, /commuting costs/);
      assert.doesNotMatch(prompt, /Private merchant|Private original SMS|native_category|"travel"/);
      return output;
    },
  };
  const input = { ...notification, categoryOverride: 'commuting costs' };
  try {
    await assert.rejects(categorizeNotification(input, categories, options), /not found/);
    assert.equal(calls, 0);
    enabled = true;
    assert.equal((await categorizeNotification(input, categories, options)).category, 'Transport & Fuel');
    for (const invalid of [
      '{"categoryId":"c1","subcategory":"Fuel","uncertain":true}',
      '{"categoryId":"c99","subcategory":"Fuel","uncertain":false}',
      '{"categoryId":"c1","subcategory":"Invented","uncertain":false}',
      'not JSON',
    ]) {
      output = invalid;
      await assert.rejects(categorizeNotification(input, categories, options), /not found/);
    }
    const failed = { ...options, generate: async () => { throw new Error('Synthetic device failure'); } };
    const description = { ...notification, description: 'commuting costs' };
    assert.deepEqual(await categorizeNotification(description, categories, failed), description);
    assert.ok(warnings.length >= 5);
    assert.equal((await categorizeNotification({ ...notification, categoryOverride: 'lunch' }, categories, failed)).category, 'Food & Dining');
    await assert.rejects(categorizeNotification({ ...input, categoryOverride: 'password: synthetic-secret' }, categories, options), /not found/);
    assert.equal(calls, 5);
    const atm = { ...input, paymentMethod: 'ATM Cash' };
    assert.deepEqual(await categorizeNotification(atm, categories, options), atm);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('category confirmation names the saved amount and category', () => {
  assert.equal(notificationCategoryConfirmation({ amount: 125, category: 'Food & Dining' }, { symbol: 'INR ' }),
    'INR 125.00 transaction moved under Food & Dining.');
});
