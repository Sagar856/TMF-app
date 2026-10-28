import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MoneyLocaleContext, useMoneyFormatter } from '../hooks/useMoneyFormatter';
import { formatMoney, getCurrencyLocale } from './money';

test('selected currencies use their locale and two decimal places', () => {
  for (const [code, symbol, expected] of [
    ['USD', '$', '$123,456.50'],
    ['INR', '\u20b9', '\u20b91,23,456.50'],
    ['EUR', '\u20ac', '\u20ac123.456,50'],
    ['GBP', '\u00a3', '\u00a3123,456.50'],
  ]) {
    assert.equal(formatMoney(123456.5, { symbol, locale: getCurrencyLocale(code) }), expected);
  }
  assert.equal(formatMoney(1234.5, { symbol: '$', locale: 'en-US' }), '$1,234.50');
  assert.equal(formatMoney(1234, { symbol: '$', locale: 'en-US' }), '$1,234.00');
  assert.equal(formatMoney(-1234.5, { symbol: '$', locale: 'en-US' }), '-$1,234.50');
});

test('empty amounts and explicit non-money precision remain supported', () => {
  assert.equal(formatMoney(undefined, { symbol: '$', locale: 'en-US' }), '$0.00');
  assert.equal(formatMoney(null, { locale: 'en-US' }), '0.00');
  assert.equal(formatMoney(NaN, { locale: 'en-US' }), '0.00');
  assert.equal(formatMoney(12.345, {
    locale: 'en-US',
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }), '12.345');
});

test('nested formatters follow the current settings locale', () => {
  function Amount() {
    const formatAmount = useMoneyFormatter();
    return createElement('span', null, formatAmount(123456.5, { symbol: '$' }));
  }
  const render = (locale: string) => renderToStaticMarkup(
    createElement(MoneyLocaleContext.Provider, { value: locale }, createElement(Amount))
  );
  assert.equal(render('en-US'), '<span>$123,456.50</span>');
  assert.equal(render('de-DE'), '<span>$123.456,50</span>');
  assert.equal(render('en-US'), '<span>$123,456.50</span>');
});
