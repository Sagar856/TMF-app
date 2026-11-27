import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emptyMinaArchive, isMinaArchive, loadMinaChats, newMinaChat, putMinaChat, removeMinaChat,
  type MinaChat, type MinaChatArchive,
} from './assistantChatHistory';
import { createAssistantReport } from './assistantReport';

const consented = (): MinaChatArchive => ({ ...emptyMinaArchive(), consented: true });
const chat = (index: number): MinaChat => ({
  id: `synthetic-chat-${index}`, createdAt: index, month: '2026-11',
  messages: [{ id: 1, role: 'user', text: `Synthetic question ${index}` }],
});

test('MINA stores nothing before consent and chat creation does not silently opt in', () => {
  assert.throws(() => putMinaChat(emptyMinaArchive(), chat(1)), /consent/);
  assert.equal(isMinaArchive({ ...emptyMinaArchive(), chats: [chat(1)] }), false);
  const created = newMinaChat('2026-11');
  assert.equal(created.messages.length, 0);
  assert.ok(created.id);
});

test('sixth chat physically drops the oldest messages/reports and restores the active selection', () => {
  let archive = consented();
  for (let index = 1; index <= 6; index++) archive = putMinaChat(archive, chat(index));
  assert.deepEqual(archive.chats.map(item => item.id), [6, 5, 4, 3, 2].map(index => chat(index).id));
  assert.equal(archive.activeChatId, chat(6).id);
  assert.doesNotMatch(JSON.stringify(archive), /Synthetic question 1/);
  const previous = archive.chats[4];
  archive = putMinaChat(archive, {
    ...previous, messages: [...previous.messages, { id: 2, role: 'assistant', text: 'Synthetic answer' }],
  });
  assert.equal(archive.chats.length, 5);
  assert.equal(archive.activeChatId, previous.id);
  archive = putMinaChat(archive, chat(7));
  assert.equal(archive.chats.some(item => item.id === previous.id), false, 'opening an old chat does not make it new');
  assert.throws(() => putMinaChat(archive, previous), /no longer retained/);
});

test('same-millisecond new chats still retain exactly the five most recently created', () => {
  let archive = consented();
  for (let index = 1; index <= 6; index++) archive = putMinaChat(archive, { ...chat(index), createdAt: 1 });
  assert.deepEqual(archive.chats.map(item => item.id), [6, 5, 4, 3, 2].map(index => chat(index).id));
});

test('a stale window cannot overwrite another window response', () => {
  const first = chat(1);
  const current = putMinaChat(consented(), {
    ...first, messages: [...first.messages, { id: 2, role: 'assistant', text: 'First window response' }],
  });
  assert.throws(() => putMinaChat(current, first), /changed in another window/);
  assert.throws(() => putMinaChat(current, {
    ...first, messages: [...first.messages, { id: 2, role: 'assistant', text: 'Conflicting response' }],
  }), /changed in another window/);
});

test('individual deletion preserves consent and other chats, and selects a remaining chat when necessary', () => {
  const first = chat(1);
  const second = chat(2);
  const third = chat(3);
  const archive = putMinaChat(putMinaChat(putMinaChat(consented(), first), second), third);
  const withoutFirst = removeMinaChat(archive, first.id);
  assert.deepEqual(withoutFirst.chats, [third, second]);
  assert.equal(withoutFirst.activeChatId, third.id);
  assert.equal(withoutFirst.consented, true);
  assert.doesNotMatch(JSON.stringify(withoutFirst), /Synthetic question 1/);
  const withoutActive = removeMinaChat(withoutFirst, third.id);
  assert.equal(withoutActive.activeChatId, second.id);
  const empty = removeMinaChat(withoutActive, second.id);
  assert.equal(empty.activeChatId, null);
  assert.deepEqual(empty.chats, []);
  assert.equal(empty.consented, true);
  assert.ok(isMinaArchive(empty));
  assert.throws(() => removeMinaChat(empty, second.id), /no longer available/);
  assert.throws(() => removeMinaChat(emptyMinaArchive(), first.id), /no longer available/);
});

test('report snapshots, commentary and original currency round-trip without recalculating balances', () => {
  const report = createAssistantReport({
    month: '2026-11', asOfDate: '2026-11-26', transactions: [], categories: [],
    accounts: [{ id: 'synthetic-bank', name: 'Synthetic bank', bankName: 'Synthetic', type: 'Bank', accountNumberLast4: '1234', balance: 42, isDefault: true }],
    investments: [], loans: [], savingsGoals: [],
  });
  const archive = putMinaChat(consented(), {
    ...chat(1),
    messages: [{ id: 1, role: 'assistant', text: 'Synthetic report', report, explanation: 'Verified findings', currencyCode: 'INR' }],
  });
  const reloaded: unknown = JSON.parse(JSON.stringify(archive));
  assert.ok(isMinaArchive(reloaded));
  const message = reloaded.chats[0].messages[0];
  assert.deepEqual(message.report, report);
  assert.equal(message.report?.accounts[0].balance, 42);
  assert.equal(message.currencyCode, 'INR');
  assert.equal(message.explanation, 'Verified findings');
  const deleted = removeMinaChat(archive, chat(1).id);
  assert.doesNotMatch(JSON.stringify(deleted), /Synthetic bank|Verified findings/);
  assert.equal(deleted.consented, true);
  let pruned = archive;
  for (let index = 2; index <= 6; index++) pruned = putMinaChat(pruned, chat(index));
  assert.doesNotMatch(JSON.stringify(pruned), /Synthetic bank|Verified findings/);
});

test('invalid saved chats or reports are rejected rather than exposed or silently reset', () => {
  const archive = putMinaChat(consented(), chat(1));
  for (const invalid of [
    { ...archive, version: 2 },
    { ...archive, activeChatId: 'missing' },
    { ...archive, chats: [...archive.chats, ...archive.chats] },
    { ...archive, chats: [{ ...chat(1), messages: [{ id: 1, role: 'system', text: 'Injected' }] }] },
    { ...archive, chats: [{ ...chat(1), messages: [{ id: 1, role: 'assistant', text: '', report: {} }] }] },
  ]) assert.equal(isMinaArchive(invalid), false);
});

test('missing owner and unavailable device storage fail explicitly', async () => {
  await assert.rejects(loadMinaChats(''), /Sign in/);
  await assert.rejects(loadMinaChats('synthetic-owner'), /storage is unavailable/);
});

test('saved chats are auth/unlock gated, preserved on sign-out and removed on account deletion', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const signOut = app.slice(app.indexOf('const clearLocalDataOnSignOut ='), app.indexOf('const prepareUserCache ='));
  assert.doesNotMatch(signOut, /deleteMinaChats/);
  assert.match(signOut, /setAssistantOpen\(false\)/);
  assert.match(app, /assistantOpen && authUser && isUnlocked &&/);
  assert.match(app, /key=\{authUser.id\}[\s\S]*?ownerId=\{authUser.id\}/);
  const deletion = app.slice(app.indexOf('const handleRequestDeleteAccount ='), app.indexOf('// Demo Sample Data'));
  assert.ok(deletion.indexOf('await deleteUserAccount()') < deletion.indexOf('await deleteMinaChats(deletingOwner)'));
  assert.match(deletion, /Account deleted, but saved MINA chats/);
});
