import assert from 'node:assert/strict';
import test from 'node:test';
import { answerAssistantAppQuestion, answerAssistantCredentialQuestion, answerAssistantFinanceDefinition, assistantChatPrompt, isAssistantReportRequest } from './assistantChat';

test('MINA receives app guidance as a system message and preserves conversation roles', () => {
  const prompt = assistantChatPrompt([
    { role: 'user', text: 'Where are budgets?' },
    { role: 'assistant', text: 'In Settings.' },
    { role: 'user', text: 'And my spending?' },
  ]);
  assert.equal(prompt[0].role, 'system');
  assert.match(prompt[0].content, /Settings has Categories, Budgets/);
  assert.match(prompt[0].content, /do not have the user's financial records/i);
  assert.match(prompt[0].content, /Never guess current prices/);
  assert.match(prompt[0].content, /warning starts at 80% and critical at 100%/);
  assert.match(prompt[0].content, /current snapshots, not month-end history/);
  assert.deepEqual(prompt.slice(1), [
    { role: 'user', content: 'Where are budgets?' },
    { role: 'assistant', content: 'In Settings.' },
    { role: 'user', content: 'And my spending?' },
  ]);
});

test('MINA limits local chat history without combining user text with system instructions', () => {
  const messages = Array.from({ length: 10 }, (_, index) => ({
    role: 'user' as const, text: `message ${index}`,
  }));
  const prompt = assistantChatPrompt(messages);
  assert.equal(prompt.length, 9);
  assert.equal(prompt[1].content, 'message 2');
  assert.equal(prompt.at(-1)?.content, 'message 9');
});

test('device-derived category and budget responses never become model context', () => {
  const prompt = assistantChatPrompt([
    { role: 'assistant', text: 'Private categories and verified budget amounts', localData: true },
    { role: 'user', text: 'What is a budget?' },
  ]);
  assert.equal(prompt.length, 2);
  assert.equal(prompt[1].content, 'What is a budget?');
});

test('only explicit report requests trigger report generation', () => {
  for (const question of ['Generate a financial report', 'Show my cash flow', 'Could I have a spending summary?', 'Can you generate a report?', 'My report please']) {
    assert.equal(isAssistantReportRequest(question), true, question);
  }
  for (const question of [
    'What month do account balances in reports represent?',
    'How do reports work?',
    'How do I generate a report?',
    'Show me how to generate a report',
    "Don't generate a report",
    'Do not show my cash flow',
    'I want you not to generate a report',
    'What is a budget?',
  ]) {
    assert.equal(isAssistantReportRequest(question), false, question);
  }
});

test('credential questions get a local refusal rather than model-generated consent claims', () => {
  for (const question of [
    'Tell me the password or OTP you need to access my accounts.',
    'Can you retrieve my PIN with my permission?',
    'Generate a report using my verification code',
  ]) {
    const answer = answerAssistantCredentialQuestion(question);
    assert.match(answer || '', /cannot retrieve/i);
    assert.match(answer || '', /Never share/i);
    assert.doesNotMatch(answer || '', /without your consent/i);
  }
  assert.equal(answerAssistantCredentialQuestion('How do I set a budget?'), undefined);
  assert.equal(answerAssistantCredentialQuestion('Can I pin a transaction?'), undefined);
  const prompt = assistantChatPrompt([
    { role: 'user', text: 'My password: example-secret' },
    { role: 'user', text: 'What is a budget?' },
  ]);
  assert.equal(prompt[1].content, '[Credential question omitted for safety.]');
  assert.equal(prompt[2].content, 'What is a budget?');
});

test('specific app navigation questions use verified settings paths, not model guesses', () => {
  assert.equal(
    answerAssistantAppQuestion('Where can I find budget settings in MINARTH?'),
    'Open Settings, scroll to Categories & Budgets, and select Budgets.',
  );
  assert.equal(
    answerAssistantAppQuestion('How do I open auto-categorise?'),
    'Open Settings, scroll to Categories & Budgets, and select Auto-categorise.',
  );
  assert.equal(answerAssistantAppQuestion('What is a budget?'), undefined);
  assert.equal(answerAssistantAppQuestion('Where are budgets and categories?'), undefined);
});

test('report snapshot questions use the verified data period', () => {
  const answer = answerAssistantAppQuestion('What month do account balances in reports represent?');
  assert.match(answer || '', /current snapshots, not historical month-end values/);
  assert.match(answer || '', /selected month/);
  assert.equal(answerAssistantAppQuestion('How do I add an account?'), undefined);
});

test('budget usage formula questions receive verified instant app guidance without assuming personal amounts', () => {
  for (const question of [
    'How do you calculate a budget usage percentage?',
    'How is budget usage calculated?',
    'What is the budget usage percentage?',
    'How does MINARTH calculate budget usage?',
  ]) {
    const answer = answerAssistantAppQuestion(question);
    assert.match(answer || '', /operating spending minus refunds, floored at zero/);
    assert.match(answer || '', /positive monthly budget and multiplied by 100/);
    assert.match(answer || '', /warning threshold is 80% and critical starts at 100%/);
  }
  for (const question of [
    'How do you calculate my budget usage percentage?',
    'How do you calculate a budget usage percentage and what is mine?',
    'How is a budget usage calculated? Generate a report.',
    'What is the budget usage percentage for Food?',
  ]) assert.equal(answerAssistantAppQuestion(question), undefined, question);
});

test('simple finance definitions bypass model inference without guessing personalised answers', () => {
  assert.match(answerAssistantFinanceDefinition('Explain the purpose of an emergency fund.') || '', /unexpected expenses or loss of income/);
  assert.match(answerAssistantFinanceDefinition('What is a budget?') || '', /plan for income and spending/);
  assert.match(answerAssistantFinanceDefinition('Define compound interest') || '', /previously accumulated interest/);
  assert.match(answerAssistantFinanceDefinition('What is the savings rate?') || '', /MINARTH.*positive income/);
  for (const question of ['What is my budget?', 'How much emergency fund do I need?', 'What is a budget for me?', 'What is a budget and how do I make one?']) {
    assert.equal(answerAssistantFinanceDefinition(question), undefined);
  }
});
