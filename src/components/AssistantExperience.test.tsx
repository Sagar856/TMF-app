import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantChatModal } from './AssistantChatModal';
import { AssistantSettingsSection } from './AssistantSettingsSection';
import { AssistantShortcut } from './AssistantShortcut';
import { AssistantRuntime } from '../services/assistantRuntime';
import { emptyMinaArchive, type MinaChatArchive } from '../utils/assistantChatHistory';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

function renderLoadedChat(element: React.ReactElement, archive: MinaChatArchive = { ...emptyMinaArchive(), consented: true }, navigationOpen = false, openChatOptions = ''): string {
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('./AssistantChatModal.tsx', import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'tsx', format: 'cjs' }).code;
  const module = { exports: {} as { AssistantChatModal?: typeof AssistantChatModal } };
  let stateIndex = 0;
  runInNewContext(code, {
    module, exports: module.exports,
    require: (name: string) => name === 'react' ? {
      ...React,
      useState: (initial: unknown) => {
        const index = stateIndex++;
        return React.useState(index === 0 ? navigationOpen : index === 6 ? openChatOptions : initial === null ? archive : initial === true ? false : initial);
      },
    } : require(name),
  });
  assert.ok(module.exports.AssistantChatModal);
  return renderToStaticMarkup(React.createElement(module.exports.AssistantChatModal, element.props));
}

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

test('consented assistant offers saved chats, clear controls and an explicit report action', () => {
  const element = <AssistantChatModal ownerId="synthetic-owner"
    runtime={new AssistantRuntime()} transactions={[]} categories={[]} accounts={[]} investments={[]} loans={[]}
    savingsGoals={[]} currencyCode="INR" marketSnapshot={null} onClose={() => {}}
  />;
  const closed = renderLoadedChat(element);
  assert.match(closed, /aria-label="Open MINA navigation" aria-expanded="false"/);
  assert.doesNotMatch(closed, /aria-label="MINA navigation"|Generate report|Previous chats/);
  const html = renderLoadedChat(element, { ...emptyMinaArchive(), consented: true }, true);
  assert.match(html, /aria-label="Open MINA navigation" aria-expanded="true"/);
  assert.match(html, /<nav id="mina-navigation" aria-label="MINA navigation"/);
  assert.match(html, /aria-label="Close MINA navigation"/);
  assert.match(html, /Your saved chats will appear here/);
  assert.match(html, /messages, generated reports and commentary stay on this device/);
  assert.match(html, /Generate report/);
  assert.match(html, /Last 5 chats saved on this device/);
  assert.match(html, /New chat/);
  assert.match(html, /Previous chats/);
  assert.match(html, /Clear chats/);
  assert.doesNotMatch(html, /temporary chat|discarded when you close/);
  assert.match(html, /id="assistant-title"[^>]*>MINA</);
  assert.match(html, /Message MINA/);
  assert.match(html, /The app still needs internet for its existing cloud sync/);
  assert.match(html, /it cannot check live internet prices/);
  assert.doesNotMatch(html, /MINARTH_Report_.*\.pdf/);
  assert.match(html, /role="log" aria-label="Conversation with MINA"/);
  assert.match(html, /aria-expanded="false" aria-controls="mina-report-tools"/);
  assert.match(html, /id="mina-report-tools" hidden=""/);
  assert.match(html, /What can I help you with\?/);
  assert.match(html, /What is a budget\?/);
  assert.match(html, /rows="1"/);
  assert.match(html, /Shift \+ Enter for a new line/);
  assert.match(html, /<summary tabindex="0"/);
  const archive: MinaChatArchive = {
    version: 1, consented: true, activeChatId: 'one',
    chats: [{ id: 'one', createdAt: 1, month: '2026-11', messages: [{ id: 1, role: 'user', text: 'Synthetic question' }] }],
  };
  const saved = renderLoadedChat(element, archive, true);
  assert.match(saved, /aria-label="Chat options: Synthetic question" aria-expanded="false"/);
  assert.doesNotMatch(saved, />Delete chat<\/button>/);
  assert.match(saved, /aria-current="page"/);
  assert.match(saved, /Clear chats/);
  const options = renderLoadedChat(element, archive, true, 'one');
  assert.match(options, /aria-label="Chat options: Synthetic question" aria-expanded="true"/);
  assert.match(options, /id="mina-chat-options-one" class="absolute bottom-full right-1[^"]*"[\s\S]*?>Delete chat<\/button>/);
});

test('assistant does not expose messages, reports or composer before loading consent', () => {
  const html = renderToStaticMarkup(<AssistantChatModal ownerId="synthetic-owner"
    runtime={new AssistantRuntime()} transactions={[]} categories={[]} accounts={[]} investments={[]} loans={[]}
    savingsGoals={[]} currencyCode="INR" marketSnapshot={null} onClose={() => {}} />);
  assert.match(html, /MINA privacy &amp; security consent/);
  assert.match(html, /Opening device-local chats/);
  assert.doesNotMatch(html, /id="assistant-message"|Generate report|role="log"/);
});

test('first-use consent is explicit, unchecked and required before showing any chat controls', () => {
  const html = renderLoadedChat(<AssistantChatModal ownerId="synthetic-owner"
    runtime={new AssistantRuntime()} transactions={[]} categories={[]} accounts={[]} investments={[]} loans={[]}
    savingsGoals={[]} currencyCode="INR" marketSnapshot={null} onClose={() => {}} />, emptyMinaArchive());
  assert.match(html, /messages, generated financial reports and report commentary/);
  assert.match(html, /Starting a sixth permanently deletes the oldest chat/);
  assert.match(html, /remain after sign-out/);
  assert.match(html, /not a separately encrypted vault/);
  assert.match(html, /type="checkbox"/);
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /disabled=""[^>]*>Agree and continue/);
  assert.doesNotMatch(html, /id="assistant-message"|Generate report|role="log"/);
});
