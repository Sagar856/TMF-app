import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, ParsedNotification } from '../types/finance';
import { categorizeNotification } from '../services/notificationCategorization';
import { applyNotificationCategoryOverride } from './paymentTransaction';
import { suggestCategoryForTitle } from '../services/notification/CategoryClassifier';
import { notificationCategoryConfirmation } from './notificationCategoryFeedback';
import { notificationCategoryReviewText } from './notificationCategoryJobs';

async function assertDeferred(input: ParsedNotification, available: Category[]) {
  assert.deepEqual(await categorizeNotification(input, available), input);
  assert.ok(notificationCategoryReviewText(input, available));
}

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
    ['petrol', 'Transport & Fuel'], ['uber', 'Transport & Fuel'], ['cab', 'Transport & Fuel'], ['milk', 'Food & Dining'],
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
  const custom = [...categories, { id: 'grocery', name: 'Groceries', type: 'expense' as const, iconName: 'Tag', subcategories: ['General'] }];
  assert.equal(applyNotificationCategoryOverride({ ...notification, categoryOverride: 'milk' }, custom).category, 'Groceries');
  assert.equal(applyNotificationCategoryOverride({ ...notification, categoryOverride: 'cab' },
    [{ ...categories[1], name: 'Travel', subcategories: ['General'] }]).category, 'Travel');
  assert.equal(applyNotificationCategoryOverride({ ...notification, description: 'milk' }, categories).subcategory, 'Groceries');
});

test('Category takes priority over Description; Description precedes the original parser result', async () => {
  const explicit = await categorizeNotification({ ...notification, categoryOverride: 'petrol', description: 'lunch' }, categories);
  assert.equal(explicit.category, 'Transport & Fuel');
  const description = await categorizeNotification({ ...notification, description: 'Taxi home with uber' }, categories);
  assert.equal(description.category, 'Transport & Fuel');
  for (const [text, expected] of [['dinner', 'Food & Dining'], ['milk', 'Food & Dining'], ['cab', 'Transport & Fuel']]) {
    assert.equal((await categorizeNotification({ ...notification, categoryOverride: text }, categories)).category, expected);
    assert.equal((await categorizeNotification({ ...notification, description: text }, categories)).category, expected);
  }
  const custom = [...categories, { id: 'grocery', name: 'Groceries', type: 'expense' as const, iconName: 'Tag', subcategories: ['General'] }];
  for (const input of [{ categoryOverride: 'milk' }, { description: 'milk' }]) {
    assert.equal((await categorizeNotification({ ...notification, ...input }, custom)).category, 'Groceries');
  }
  const unknown = { ...notification, description: 'Unclear personal memo' };
  assert.deepEqual(await categorizeNotification(unknown, categories), unknown);
  await assertDeferred({ ...notification, categoryOverride: 'ambiguous memo', description: 'lunch' }, categories);
  await assertDeferred({ ...notification, categoryOverride: 'lunch and petrol' }, categories);
  await assertDeferred({ ...notification, type: 'credit', categoryOverride: 'lunch' }, categories);
  await assertDeferred({ ...notification, categoryOverride: 'lunch' }, categories.filter(category => category.id !== 'food'));
});

test('unclear notification text does not invoke MINA or delay saving', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let enabled = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: () => String(enabled) },
  });
  const input = { ...notification, categoryOverride: 'commuting costs' };
  try {
    await assertDeferred(input, categories);
    enabled = true;
    await assertDeferred(input, categories);
    const description = { ...notification, description: 'commuting costs' };
    assert.deepEqual(await categorizeNotification(description, categories), description);
    assert.equal((await categorizeNotification({ ...notification, categoryOverride: 'lunch' }, categories)).category, 'Food & Dining');
    await assertDeferred({ ...input, categoryOverride: 'password: synthetic-secret' }, categories);
    const atm = { ...input, paymentMethod: 'ATM Cash' };
    assert.deepEqual(await categorizeNotification(atm, categories), atm);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('category confirmation names the saved amount and category', () => {
  assert.equal(notificationCategoryConfirmation({ amount: 125, category: 'Food & Dining' }, { symbol: 'INR ' }),
    'INR 125.00 transaction moved under Food & Dining.');
});

test('Shopping and custom category replies match live names and subcategories, not a hard-coded destination', async () => {
  for (const category of [
    { id: 'custom', name: 'Shopping & Tech', type: 'expense' as const, iconName: 'Tag', subcategories: ['General'] },
    { id: 'custom', name: 'Personal Purchases', type: 'expense' as const, iconName: 'Tag', subcategories: ['Shopping'] },
    { id: 'custom', name: 'Office Supplies', type: 'expense' as const, iconName: 'Tag', subcategories: ['General'] },
  ]) {
    const text = category.name === 'Office Supplies' ? 'Office' : 'Shopping';
    const input = { ...notification, categoryOverride: text, description: undefined };
    const result = await categorizeNotification(input, [...categories, category]);
    assert.equal(result.category, category.name);
    assert.deepEqual(result, { ...input, category: category.name, subcategory: result.subcategory });
  }
  const custom = { id: 'shop', name: 'Shopping & Tech', type: 'expense' as const, iconName: 'Tag', subcategories: ['General'] };
  assert.equal((await categorizeNotification({ ...notification, categoryOverride: 'related to Shopping' }, [custom])).category, custom.name);
  await assertDeferred({ ...notification, categoryOverride: 'Shopping' },
    [custom, { ...custom, id: 'other', name: 'Shopping & Clothing' }]);
  await assertDeferred({ ...notification, categoryOverride: 'milk and petrol' },
    [...categories, { ...custom, id: 'grocery', name: 'Groceries' }]);
});

test('natural language can name a current custom category or subcategory without guessing between destinations', async () => {
  const stationery: Category = {
    id: 'stationery', name: 'Stationery', type: 'expense', iconName: 'Tag', subcategories: ['Pencils', 'General'],
  };
  const input = { ...notification, description: 'Bought pencils for school' };
  const result = await categorizeNotification(input, [stationery]);
  assert.equal(result.category, 'Stationery');
  assert.equal(result.subcategory, 'Pencils');
  assert.equal((await categorizeNotification({ ...notification, categoryOverride: 'Bought stationery yesterday' }, [stationery])).category, 'Stationery');
  const duplicate = { ...stationery, id: 'other', name: 'Office', subcategories: ['Pencils'] };
  await assertDeferred({ ...notification, categoryOverride: 'Bought pencils for school' }, [stationery, duplicate]);
  await assertDeferred({ ...notification, categoryOverride: 'Bought stationery and lunch' }, [stationery, ...categories]);
  await assertDeferred({ ...notification, categoryOverride: 'not stationery for school' }, [stationery]);
  await assertDeferred({ ...notification, type: 'credit', categoryOverride: 'Bought stationery yesterday' }, [stationery]);
});

test('negated notification text is not treated as positive keyword evidence', async () => {
  for (const text of ['not lunch', 'no petrol', "don't categorize as lunch", 'anything except dinner']) {
    await assertDeferred({ ...notification, categoryOverride: text }, categories);
    assert.deepEqual(await categorizeNotification({ ...notification, description: text }, categories),
      { ...notification, description: text });
  }
  const named: Category = { id: 'named', name: 'No Bills', type: 'expense', iconName: 'Tag', subcategories: ['General'] };
  assert.equal((await categorizeNotification({ ...notification, categoryOverride: 'No Bills' }, [named])).category, 'No Bills');
});
