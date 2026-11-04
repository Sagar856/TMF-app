import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityHistory } from './activityHistory';

test('back restores the previous activity before leaving the current page', () => {
  const history = new ActivityHistory();
  history.change('app.tab', 'settings');
  const menu = history.current.id;
  history.change('settings.group', 'privacy');
  const privacy = history.current.id;
  history.change('settings.group', 'appearance');
  assert.ok(history.restore(privacy));
  assert.equal(history.current.values['settings.group'], 'privacy');
  assert.equal(history.current.values['app.tab'], 'settings');
  assert.ok(history.restore(menu));
  assert.equal(history.current.values['settings.group'], undefined);
  assert.equal(history.current.values['app.tab'], 'settings');
  assert.ok(history.restore(0));
  assert.equal(history.canGoBack, false);
});

test('page changes preserve prior filters and details without changing data', () => {
  const history = new ActivityHistory();
  history.change('app.tab', 'loans');
  history.change('loans.person', 'Person A');
  history.change('loans.histories', ['loan-1']);
  const detail = history.current.id;
  history.change('app.tab', 'transactions');
  history.restore(detail);
  assert.equal(history.current.values['app.tab'], 'loans');
  assert.equal(history.current.values['loans.person'], 'Person A');
  assert.deepEqual(history.current.values['loans.histories'], ['loan-1']);
});

test('nested dialogs close top-first without skipping the underlying view', () => {
  const history = new ActivityHistory();
  history.change('app.tab', 'transactions');
  const page = history.current.id;
  const closed: string[] = [];
  const form = history.openOverlay(() => closed.push('form'));
  history.openOverlay(() => closed.push('permission'));
  history.restore(form);
  assert.deepEqual(closed, ['permission']);
  history.restore(page);
  assert.deepEqual(closed, ['permission', 'form']);
  assert.equal(history.current.values['app.tab'], 'transactions');
});

test('closed dialogs cannot replay saved actions and new activities discard forward history', () => {
  const history = new ActivityHistory();
  history.change('app.tab', 'accounts');
  const page = history.current.id;
  let closed = false;
  const form = history.openOverlay(() => { closed = true; });
  history.closeOverlay(form);
  assert.equal(history.isInactiveOverlay(form), true);
  history.restore(page);
  assert.equal(closed, false);
  history.change('accounts.type', 'Bank');
  assert.equal(history.entries.some(entry => entry.id === form), false);
});

test('multiple UI updates in one activity can share a single history entry', () => {
  const history = new ActivityHistory();
  history.change('customisations.section', 'budgets');
  history.change('customisations.menu', false, true);
  assert.equal(history.entries.length, 2);
  assert.equal(history.current.values['customisations.menu'], false);
  history.restore(0);
  assert.deepEqual(history.current.values, {});
});

test('sign-out clears UI selections and stale dialog callbacks', () => {
  const history = new ActivityHistory();
  history.change('loans.person', 'Person A');
  const oldEntry = history.current.id;
  let closed = false;
  history.openOverlay(() => { closed = true; });
  history.reset();
  assert.deepEqual(history.current.values, {});
  assert.equal(history.canGoBack, false);
  assert.equal(history.restore(oldEntry), false);
  assert.equal(closed, false);
});
