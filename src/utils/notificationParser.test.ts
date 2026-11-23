import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWithKeywords } from '../services/notification/KeywordParser';
import { extractWithRegex } from '../services/notification/RegexParser';
import { parseUPIFormat } from '../services/notification/UPIParser';
import { parseBankTemplate } from '../services/notification/BankTemplateParser';
import { sanitizeMerchantCandidate } from '../services/notification/merchantSanitizer';
import { parseNotification } from '../services/notification/ParserManager';

test('direction: refunds, reversals and cashback are credits even when "paid"/"debited" appears', () => {
  assert.equal(extractWithKeywords('Refund of Rs 499 for your payment to Amazon has been processed').type, 'credit');
  assert.equal(extractWithKeywords('Rs 1,200 debited earlier has been reversed to your a/c').type, 'credit');
  assert.equal(extractWithKeywords('Cashback of Rs 50 credited for payment of Rs 500 to Swiggy').type, 'credit');
});

test('direction: ties resolve by the first primary verb (your account) and word boundaries are respected', () => {
  assert.equal(extractWithKeywords('Rs 500 debited from a/c XX1234 and credited to beneficiary Rahul').type, 'debit');
  assert.equal(extractWithKeywords('Rs 500 credited to a/c XX1234; debited from sender').type, 'credit');
  // "spent" inside "unspent" must not count
  assert.equal(extractWithKeywords('Rs 2,000 credited to your a/c. Unspent balance info').type, 'credit');
});

test('payment method: cc/dc only match as whole words', () => {
  assert.equal(extractWithKeywords('Paid Rs 300 to Soccer Club via UPI').paymentMethod, 'UPI');
  assert.equal(extractWithKeywords('Rs 300 spent on your CC XX1234 at Decathlon').paymentMethod, 'Credit Card');
  assert.equal(extractWithKeywords('Rs 300 spent using DC ending 9012').paymentMethod, 'Debit Card');
});

test('amount: picks the amount next to the transaction verb, never the available balance or limit', () => {
  const r1 = extractWithRegex('Rs 420.00 debited from A/c XX1234 on 10-Oct. Avl Bal: Rs 15,200.00');
  assert.equal(r1.amount, 420);
  assert.equal(r1.availableBalance, 15200);

  const r2 = extractWithRegex('Avl bal Rs 9,999.00. INR 1,250 paid to Zomato via UPI Ref 629104812345');
  assert.equal(r2.amount, 1250);
  assert.equal(r2.refNumber, '629104812345');

  const r3 = extractWithRegex('Your credit limit Rs 2,00,000. Rs 3,450 spent at Croma');
  assert.equal(r3.amount, 3450);
});

test('amount: currency inferred from the chosen amount', () => {
  assert.equal(extractWithRegex('$45.00 paid to Netflix').currency, 'USD');
  assert.equal(extractWithRegex('Paid ₹99 to Spotify').currency, 'INR');
});

test('reference: requires a label and digits, ignoring ordinary words', () => {
  assert.equal(extractWithRegex('Txn ID: P260809123456 completed').refNumber, 'P260809123456');
  assert.equal(extractWithRegex('Ref: Thankyouforbanking with us').refNumber, undefined);
});

test('merchant sanitiser rejects account/phone numbers and boilerplate', () => {
  assert.equal(sanitizeMerchantCandidate('919951860002 Axis Bank'), undefined);
  assert.equal(sanitizeMerchantCandidate('XX1234'), undefined);
  assert.equal(sanitizeMerchantCandidate('a/c'), undefined);
  assert.equal(sanitizeMerchantCandidate('Zomato via UPI'), 'Zomato');
  assert.equal(sanitizeMerchantCandidate('Big Bazaar.'), 'Big Bazaar');
});

test('UPI and bank parsers use the sanitiser', () => {
  const upi = parseUPIFormat('You paid Rs 250 to 9876543210 via PhonePe. Txn ID T2410');
  assert.equal(upi.appSource, 'PhonePe');
  assert.equal(upi.payeeOrPayer, undefined);

  const bank = parseBankTemplate('HDFC Bank: Rs 1,500 debited from a/c XX4411 to Big Bazaar ref 12345678');
  assert.equal(bank.payeeOrPayer, 'Big Bazaar');
  assert.equal(bank.accountLast4, '4411');
});

test('bank alerts extract account suffixes, merchant and transaction amount from varied formats', () => {
  const fee = parseNotification('IDBI Bank A/C NN12345 debited INR. 183.00 Det:ANNUAL_CARD_FEE', null, [], [], false);
  assert.equal(fee?.parsed.amount, 183);
  assert.equal(fee?.parsed.accountLast4, '2345');
  const incoming = parseNotification('Received Rs.6300.00 in your Kotak Bank AC 1234 from TEST PERSON on 07-11-26. UPI Ref:123456789012', null, [], [], false);
  assert.equal(incoming?.parsed.type, 'credit');
  assert.equal(incoming?.parsed.accountLast4, '1234');
  assert.equal(incoming?.parsed.payeeOrPayer, 'TEST PERSON');
  const outgoing = parseNotification('A/c X1234 debited INR 60.00 to SAMPLE STORE thru UPI:123456789012. Bal INR 3464.45 -PNB', null, [], [], false);
  assert.equal(outgoing?.parsed.payeeOrPayer, 'SAMPLE STORE');
  assert.equal(outgoing?.parsed.refNumber, '123456789012');
  assert.equal(outgoing?.parsed.amount, 60);
  const card = parseNotification('ICICI Bank Credit Card XX1234 debited for INR 595.00 on 22-Nov-26 for UPI-123456789012-TEST SHOP. To dispute call 1800000000', null, [], [], false);
  assert.equal(card?.parsed.accountLast4, '1234');
  assert.equal(card?.parsed.payeeOrPayer, 'TEST SHOP');
  assert.equal(card?.parsed.refNumber, '123456789012');
  const axis = parseNotification('INR 20050.00 debited A/c no. XX1234 09-11-26 UPI/P2A/123456789012/TEST PERSON. Not you? Axis Bank', null, [], [], false);
  assert.equal(axis?.parsed.payeeOrPayer, 'TEST PERSON');
  assert.equal(axis?.parsed.refNumber, '123456789012');
});
