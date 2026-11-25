import test from 'node:test';
import assert from 'node:assert/strict';
import type { MarketSnapshot } from './marketData';
import { answerAssistantMarketQuestion } from './assistantMarketResponse';

const snapshot: MarketSnapshot = {
  schemaVersion: 1,
  generatedAt: '2026-11-24T08:00:00.000Z',
  stocks: {},
  fx: {},
  metals: {
    gold: {
      ratesPerGram: { '999': 14000, '916': 12824 },
      asOf: '2026-11-24',
      source: 'IBJA benchmark rate',
    },
  },
};

test('answers 22K gold questions only from saved benchmark data and labels date and limitations', () => {
  const answer = answerAssistantMarketQuestion(
    'what is exact gold rate today for 22k gold for 10gm',
    ['tell me gold rate in Indian terms'],
    snapshot,
  );
  assert.ok(answer);
  assert.match(answer, /₹1,28,240\.00 for 10 grams/);
  assert.match(answer, /₹12,824\.00 per gram/);
  assert.match(answer, /IBJA benchmark rate/);
  assert.match(answer, /2026-11-24/);
  assert.match(answer, /not a live internet check/);
  assert.doesNotMatch(answer, /2500/);
});

test('a follow-up asking to check the internet reuses prior context without inventing a quote', () => {
  const answer = answerAssistantMarketQuestion(
    'this is wrong rate, check on internet',
    ['what is gold price today for 22k 10gm'],
    snapshot,
  );
  assert.ok(answer);
  assert.match(answer, /₹1,28,240\.00 for 10 grams/);
  assert.match(answer, /dated 2026-11-24/);
});

test('missing cached market data and unsupported live-data requests are declined without numbers', () => {
  const gold = answerAssistantMarketQuestion('gold rate today 22k', [], null);
  assert.match(gold || '', /No saved gold benchmark/);
  assert.doesNotMatch(gold || '', /\d{3,}/);

  const stock = answerAssistantMarketQuestion('what is the exact current price of this stock?', [], snapshot);
  assert.match(stock || '', /I can’t browse the internet/);
  assert.doesNotMatch(stock || '', /₹|2500/);
});

test('ordinary general questions continue to the local model', () => {
  assert.equal(answerAssistantMarketQuestion('How do I build a budget?', [], snapshot), null);
  assert.equal(answerAssistantMarketQuestion('How do I build a budget?', ['What is the gold rate?'], snapshot), null);
});
