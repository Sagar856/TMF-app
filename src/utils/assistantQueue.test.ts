import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistantQueue } from '../services/assistantQueue';

test('interactive inference runs ahead of queued categorization but not a running task or install barrier', async () => {
  const queue = new AssistantQueue();
  const order: string[] = [];
  let release!: () => void;
  const running = queue.enqueue('background', () => new Promise<void>(resolve => {
    order.push('running');
    release = resolve;
  }));
  const first = queue.enqueue('background', async () => { order.push('background 1'); });
  const chat = queue.enqueue('interactive', async () => { order.push('chat'); });
  const second = queue.enqueue('background', async () => { order.push('background 2'); });
  const install = queue.enqueue('barrier', async () => { order.push('install'); });
  const afterInstall = queue.enqueue('interactive', async () => { order.push('after install'); });
  assert.deepEqual(order, ['running']);
  release();
  await Promise.all([running, first, chat, second, install, afterInstall]);
  assert.deepEqual(order, ['running', 'chat', 'background 1', 'background 2', 'install', 'after install']);
});

test('a failed task does not prevent later requests from running', async () => {
  const queue = new AssistantQueue();
  const failure = queue.enqueue('background', async () => { throw new Error('test failure'); });
  const next = queue.enqueue('interactive', async () => 'ok');
  await assert.rejects(failure, /test failure/);
  assert.equal(await next, 'ok');
});
