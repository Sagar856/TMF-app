import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCompletedPaymentText, isEligiblePaymentNotification, PAYMENT_PACKAGES, SMS_PACKAGES } from '../services/notification/transactionEligibility';
import { parseNotification } from '../services/notification/ParserManager';
import { resetDuplicateMemory } from '../services/notification/DuplicateDetector';
import fixtures from './notificationEligibility.fixtures.json';

for (const fixture of fixtures) {
  test(`eligibility: ${fixture.title} from ${fixture.packageName}`, () => {
    assert.equal(isEligiblePaymentNotification(fixture.packageName, fixture.title, fixture.text), fixture.accepted);
  });
}

test('parser refuses non-payments rather than manufacturing a debit', () => {
  for (const text of [
    'Get Rs 500 cashback offer when you pay!',
    'OTP 123456 for Rs 500 payment',
    'Rs 300 payment pending',
    'Available balance Rs 500',
    'Your account has been debited',
  ]) {
    assert.equal(isCompletedPaymentText(text), false);
    assert.equal(parseNotification(text), null);
  }
});

test('durable replay checks persisted text, not only process-local duplicate memory', () => {
  resetDuplicateMemory();
  const text = 'You paid Rs 250 to Rahul via PhonePe. UPI Ref 629104812345';
  const first = parseNotification(text, null, [], [], false);
  assert.ok(first && !first.isDuplicate);
  assert.equal(parseNotification(text, null, [], [], false)?.isDuplicate, false);
  assert.equal(parseNotification(text, null, [], [first.parsed], false)?.isDuplicate, true);
  const another = parseNotification(text.replace('629104812345', '629104812346'), null, [], [first.parsed], false);
  assert.ok(another && !another.isDuplicate);
  const withoutReference = 'Received Rs 800 from Priya via PhonePe';
  const original = parseNotification(withoutReference, null, [], [], false);
  assert.ok(original);
  assert.equal(parseNotification(withoutReference, null, [], [original.parsed], false)?.isDuplicate, false);
});

test('Android eligibility policy matches shared fixtures and exact source allowlists', () => {
  const source = readFileSync(new URL('../../native/notification-intercept-plugin/TransactionEligibility.java', import.meta.url), 'utf8');
  const strings = (name: string) => {
    const value = new RegExp(`${name} = \\{([\\s\\S]*?)\\};`).exec(source)?.[1];
    assert.ok(value);
    return Array.from(value.matchAll(/"([^"]+)"/g), match => match[1]);
  };
  assert.deepEqual(strings('PAYMENTS'), [...PAYMENT_PACKAGES]);
  assert.deepEqual(strings('SMS'), [...SMS_PACKAGES]);
  const pattern = (name: string) => {
    const value = new RegExp(`${name} = pattern\\(("(?:[^"\\\\]|\\\\.)*")\\)`).exec(source)?.[1];
    assert.ok(value);
    return new RegExp(JSON.parse(value), 'i');
  };
  const bank = pattern('BANK'), reject = pattern('REJECT'), completed = pattern('COMPLETED'), amount = pattern('AMOUNT');
  for (const fixture of fixtures) {
    const text = `${fixture.title} ${fixture.text}`;
    const match = amount.exec(text);
    const accepted = Boolean(match && Number((match[1] || match[2]).replace(/,/g, '')) > 0
      && !reject.test(text) && completed.test(text)
      && (strings('PAYMENTS').includes(fixture.packageName)
        || (strings('SMS').includes(fixture.packageName) && bank.test(fixture.title))));
    assert.equal(accepted, fixture.accepted, fixture.title);
  }
});
