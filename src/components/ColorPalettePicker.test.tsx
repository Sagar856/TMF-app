import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColorPalettePicker } from './settings/ColorPalettePicker';

test('color selection shows an illustrative Home preview above a horizontal tile strip', () => {
  const markup = renderToStaticMarkup(<ColorPalettePicker value="blue" currencySymbol="$" onChange={() => {}} />);
  assert.match(markup, /Home page preview in Celestial Blue/);
  assert.match(markup, /Illustrative balances, not your financial data/);
  for (const title of ['FINANCIAL METRICS', 'CASH IN ACCOUNTS', 'RECENT ACTIVITY', 'CASH FLOW TREND TRAJECTORY', 'MONITOR BUDGET', '7-DAY SPENDING']) {
    assert.ok(markup.includes(title));
  }
  assert.match(markup, /NET WORTH: \$0.00/);
  assert.match(markup, /palette-tiles[^"]*flex[^"]*overflow-x-auto/);
  assert.match(markup, /role="radio" aria-checked="true" tabindex="0" aria-label="Celestial Blue"/);
  assert.equal((markup.match(/role="radio"/g) || []).length, 5);
  assert.ok(markup.indexOf('palette-home-preview') < markup.indexOf('palette-tiles'));
  assert.match(markup, /Celestial Blue applied/);
  assert.match(markup, /class="brand-mark /, 'Draft preview must recolor the shared logo');
  assert.match(markup, /logo shape stay the same/);
  assert.doesNotMatch(markup, /<input|<select|<a /, 'Preview must not allow editing financial data');
});
