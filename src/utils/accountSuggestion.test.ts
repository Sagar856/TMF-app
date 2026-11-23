import test from 'node:test';
import assert from 'node:assert/strict';
import { isAccountSuggestionAction } from '../services/notificationListener';

test('only valid owner-scoped account actions can open the account editor', () => {
  const action = { id: 'one', owner: 'user', last4: '1234', type: 'Bank', action: 'open' };
  assert.equal(isAccountSuggestionAction(action), true);
  assert.equal(isAccountSuggestionAction({ ...action, type: 'Credit Card', action: 'ignored' }), true);
  assert.equal(isAccountSuggestionAction({ ...action, owner: '' }), false);
  assert.equal(isAccountSuggestionAction({ ...action, last4: '123' }), false);
  assert.equal(isAccountSuggestionAction({ ...action, type: 'Cash' }), false);
  assert.equal(isAccountSuggestionAction({ ...action, action: 'add' }), false);
  assert.equal(isAccountSuggestionAction(null), false);
});
