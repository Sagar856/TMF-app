import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantChatModal } from './AssistantChatModal';
import { AssistantSettingsSection } from './AssistantSettingsSection';
import { AssistantShortcut } from './AssistantShortcut';
import { AssistantRuntime } from '../services/assistantRuntime';
import type { AssistantCategoryReview } from '../utils/assistantCategory';

test('assistant entry UI explains local model storage and keeps a shortcut above the add action', () => {
  const runtime = new AssistantRuntime();
  const settings = renderToStaticMarkup(<AssistantSettingsSection assistant={{
    runtime, enabled: false, installed: false, supported: true, ready: true, busy: false, error: '', progress: null,
    setEnabled: () => {}, install: async () => {}, cancelInstall: async () => {}, remove: async () => {},
    storageBytes: 533425675,
  }} />);
  assert.match(settings, /Download and install/);
  assert.match(settings, />MINA</);
  assert.match(settings, /Use MINA/);
  assert.match(settings, /533 MB/);
  assert.match(settings, /does not make the rest of MINARTH work offline/);
  assert.match(settings, /Financial records—including any categories you apply—continue to sync/);

  const shortcut = renderToStaticMarkup(<AssistantShortcut visible onClick={() => {}} />);
  assert.match(shortcut, /bottom-\[calc\(8\.5rem/);
  assert.match(shortcut, /Open MINA on-device assistant/);
  assert.match(shortcut, />MINA<\/span>/);
  assert.match(shortcut, /h-11 w-11 sm:h-13 sm:w-13/);
});

test('assistant starts with ephemeral-chat disclosure and an explicit report action', () => {
  const html = renderToStaticMarkup(<AssistantChatModal
    runtime={new AssistantRuntime()} transactions={[]} categories={[]} accounts={[]} investments={[]} loans={[]}
    savingsGoals={[]} currencyCode="INR" marketSnapshot={null} onClose={() => {}}
  />);
  assert.match(html, /Prompts and this temporary chat stay on this device/);
  assert.match(html, /Generate report/);
  assert.match(html, /Chat history is temporary and is discarded when you close MINA/);
  assert.match(html, /id="assistant-title"[^>]*>MINA</);
  assert.match(html, /Message MINA/);
  assert.match(html, /The app still needs internet for its existing cloud sync/);
  assert.match(html, /it cannot check live internet prices/);
  assert.doesNotMatch(html, /MINARTH_Report_.*\.pdf/);
});

test('cloud-conflicted category suggestions require an explicit reload instead of retrying a stale write', () => {
  const review: AssistantCategoryReview = {
    transactionId: 'tx',
    before: {
      id: 'tx', title: 'Market', amount: 25, type: 'debit', category: 'Food',
      subcategory: 'Groceries', date: '2026-10-10', time: '12:00', source: 'UPI',
      syncRevision: 3, categoryOrigin: 'eligible',
    },
    categoryId: 'travel',
    category: 'Travel',
    subcategory: 'Bus',
    reason: 'The transaction changed on another device.',
    cloudConflict: true,
  };
  const html = renderToStaticMarkup(<AssistantChatModal
    runtime={new AssistantRuntime()} transactions={[]} categories={[]} accounts={[]} investments={[]} loans={[]}
    savingsGoals={[]} currencyCode="INR" marketSnapshot={null} categoryReviews={[review]} onClose={() => {}}
  />);
  assert.match(html, /Reload cloud version/);
  assert.match(html, /Keep local version/);
  assert.doesNotMatch(html, /Apply category/);
});
