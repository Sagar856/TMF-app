import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSISTANT_MODEL_ID, ASSISTANT_MODEL_REVISION, assistantRuntimeUrl,
  cacheVerifiedAssistantChunks, cacheVerifiedAssistantResponse, createAssistantModelCache, installAssistantModel,
  readAssistantChunks, withAssistantModelLock,
} from '../services/assistantModel';
import { AssistantRuntime } from '../services/assistantRuntime';
import { assistantChatPrompt } from './assistantChat';

const expected = {
  size: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};

test('downloaded model bytes are streamed, counted and verified before installation', async () => {
  let stored = '';
  let progress = 0;
  const cache = { put: async (_key: RequestInfo | URL, response: Response) => { stored = await response.text(); } };
  await cacheVerifiedAssistantResponse(cache, 'https://example.test/model', new Response('abc'), expected, count => { progress += count; });
  assert.equal(stored, 'abc');
  assert.equal(progress, 3);
});

test('corrupt, truncated and oversized model files fail verification', async () => {
  const cache = { put: async (_key: RequestInfo | URL, response: Response) => { await response.arrayBuffer(); } };
  for (const body of ['abd', 'ab', 'abcd']) {
    await assert.rejects(cacheVerifiedAssistantResponse(cache, 'https://example.test/model', new Response(body), expected, () => {}), /invalid size|integrity verification/);
  }
  await assert.rejects(cacheVerifiedAssistantResponse(cache, 'https://example.test/model', new Response('', { status: 503 }), expected, () => {}), /download failed/);
});

test('model chunks are verified and reconstructed in order without one large cache entry', async () => {
  const entries = new Map<string, Response>();
  const cache = {
    put: async (key: RequestInfo | URL, response: Response) => { entries.set(String(key), response); },
    match: async (key: RequestInfo | URL) => entries.get(String(key))?.clone(),
  };
  const url = 'https://example.test/model';
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('a'));
      controller.enqueue(new TextEncoder().encode('bc'));
      controller.close();
    },
  }));
  let progress = 0;
  await cacheVerifiedAssistantChunks(cache, url, response, expected, bytes => { progress += bytes; }, 2);
  assert.equal(entries.size, 2);
  assert.equal(progress, 3);
  assert.equal(await (await readAssistantChunks(cache, url, 3, 2)).text(), 'abc');
  entries.delete(`${url}?minarth-chunk=1`);
  await assert.rejects((await readAssistantChunks(cache, url, 3, 2)).text(), /incomplete/);
  await assert.rejects(
    cacheVerifiedAssistantChunks(cache, url, new Response('abd'), expected, () => {}, 2),
    /integrity verification/,
  );
});

test('model preflight uses the pinned revision and inference cannot write to the cache', async () => {
  const requested: string[] = [];
  const cache = createAssistantModelCache({
    match: async key => { requested.push(String(key)); return new Response('config'); },
    put: async () => { throw new Error('unexpected write'); },
  });
  const url = `https://huggingface.co/${ASSISTANT_MODEL_ID}/resolve/main/config.json`;
  assert.equal(await (await cache.match(url))?.text(), 'config');
  assert.deepEqual(requested, [`https://huggingface.co/${ASSISTANT_MODEL_ID}/resolve/${ASSISTANT_MODEL_REVISION}/config.json`]);
  await assert.rejects(cache.put(), /read-only/);
});

test('model access fails explicitly when cross-tab locks are unavailable', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    await assert.rejects(withAssistantModelLock('exclusive', async () => {}), /safe local AI model access/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('runtime cache keys are shared between the app and its worker', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'self');
  try {
    Object.defineProperty(globalThis, 'self', {
      configurable: true,
      value: { location: new URL('https://example.test/app/index.html') },
    });
    const appKey = assistantRuntimeUrl('runtime.wasm');
    Object.defineProperty(globalThis, 'self', {
      configurable: true,
      value: { location: new URL('https://example.test/app/assets/worker.js') },
    });
    assert.equal(assistantRuntimeUrl('runtime.wasm'), appKey);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'self', previous);
    else Reflect.deleteProperty(globalThis, 'self');
  }
});

test('cancelling an active download removes the incomplete cache', async () => {
  const previousCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const previousFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let present = false;
  let started!: () => void;
  const fetchStarted = new Promise<void>(resolve => { started = resolve; });
  const controller = new AbortController();
  try {
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        has: async () => present,
        open: async () => { present = true; return {}; },
        delete: async () => { const existed = present; present = false; return existed; },
      },
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (_url: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        started();
      }),
    });
    const installation = installAssistantModel({ wasm: '', mjs: '' }, () => {}, controller.signal);
    await fetchStarted;
    assert.equal(present, true);
    controller.abort();
    await assert.rejects(installation, { name: 'AbortError' });
    assert.equal(present, false);
  } finally {
    if (previousCaches) Object.defineProperty(globalThis, 'caches', previousCaches);
    else Reflect.deleteProperty(globalThis, 'caches');
    if (previousFetch) Object.defineProperty(globalThis, 'fetch', previousFetch);
  }
});

test('runtime waits for download cleanup when cancelling', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    onmessageerror?: () => void;
    messages: { id: number; type: string }[] = [];
    postMessage(message: { id: number; type: string }) { this.messages.push(message); }
    terminate() {}
  }
  let worker!: FakeWorker;
  try {
    Object.defineProperty(globalThis, 'Worker', {
      configurable: true,
      value: class extends FakeWorker { constructor() { super(); worker = this; } },
    });

    const runtime = new AssistantRuntime();
    const installation = runtime.install(() => {});
    const rejected = assert.rejects(installation, /cancelled/);
    await assert.rejects(runtime.install(() => {}), /already in progress/);
    let cancelled = false;
    const cancellation = runtime.cancelInstall().then(() => { cancelled = true; });
    assert.deepEqual(worker.messages.map(message => message.type), ['install', 'cancel-install']);
    await Promise.resolve();
    assert.equal(cancelled, false);
    worker.onmessage?.(new MessageEvent('message', {
      data: { id: worker.messages[0].id, type: 'error', message: 'Model download cancelled.' },
    }));
    await Promise.all([rejected, cancellation]);
    assert.equal(cancelled, true);

    const retry = runtime.install(() => {});
    const failed = assert.rejects(retry, /incomplete model download/);
    const failedCancellation = assert.rejects(runtime.cancelInstall(), /incomplete model download/);
    const id = worker.messages[2].id;
    worker.onmessage?.(new MessageEvent('message', {
      data: { id, type: 'error', message: 'Could not remove the incomplete model download.' },
    }));
    await Promise.all([failed, failedCancellation]);
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('runtime passes structured chat and existing string prompts to the worker unchanged', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    postMessage(message: { id: number; type: string; prompt: unknown; priority: string }) {
      sent.push(message);
      this.onmessage?.(new MessageEvent('message', { data: { id: message.id, type: 'done', text: 'reply' } }));
    }
    terminate() {}
  }
  const sent: { id: number; type: string; prompt: unknown; priority: string }[] = [];
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    const runtime = new AssistantRuntime();
    const messages = assistantChatPrompt([{ role: 'user', text: 'What is a budget?' }]);
    assert.equal(await runtime.generate(messages), 'reply');
    assert.equal(await runtime.generate('categorization prompt', 'background'), 'reply');
    assert.deepEqual(sent.map(message => message.prompt), [messages, 'categorization prompt']);
    assert.deepEqual(sent.map(message => message.priority), ['interactive', 'background']);
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('runtime masks detected identifiers and rejects sensitive values before reaching the worker', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const sent: { id: number; prompt: unknown }[] = [];
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    postMessage(message: { id: number; prompt: unknown }) {
      sent.push(message);
      this.onmessage?.(new MessageEvent('message', { data: { id: message.id, type: 'done', text: 'reply' } }));
    }
    terminate() {}
  }
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    const runtime = new AssistantRuntime();
    await runtime.generate([{ role: 'user', content: 'Card 4111 1111 1111 1234; email user@example.test' }]);
    assert.deepEqual(sent[0].prompt, [{ role: 'user', content: 'Card [number ending 1234]; email [email removed]' }]);
    await assert.rejects(runtime.generate('OTP: 123456'), /Remove passwords/);
    await assert.rejects(runtime.generate('demat account: secret123'), /demat details/);
    assert.equal(sent.length, 1);
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('runtime rejects model requests for credentials', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    postMessage(message: { id: number }) {
      this.onmessage?.(new MessageEvent('message', {
        data: { id: message.id, type: 'done', text: 'Please provide your username and password.' },
      }));
    }
    terminate() {}
  }
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    await assert.rejects(new AssistantRuntime().generate('Can you see my balance?'), /unsafe response/);
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('a stalled generation stops its worker, rejects queued requests and permits retry', async context => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const workers: { stopped: boolean }[] = [];
  class FakeWorker {
    onmessage?: (event: MessageEvent) => void;
    stopped = false;
    constructor() { workers.push(this); }
    postMessage() {}
    terminate() { this.stopped = true; }
  }
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FakeWorker });
    const runtime = new AssistantRuntime();
    const stalled = assert.rejects(runtime.generate('Question'), /took too long/);
    const queued = assert.rejects(runtime.generate('Other question'), /took too long/);
    context.mock.timers.tick(60_000);
    await Promise.all([stalled, queued]);
    assert.equal(workers[0].stopped, true);
    const retry = assert.rejects(runtime.generate('Retry'), /stopped/);
    await runtime.stop();
    await retry;
    assert.equal(workers.length, 2);
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
