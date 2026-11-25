import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import wasmModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import {
  ASSISTANT_MODEL_CACHE, ASSISTANT_MODEL_ID, ASSISTANT_MODEL_REVISION,
  assistantRuntimeUrl, createAssistantModelCache, installAssistantModel, isAssistantModelInstalled, withAssistantModelLock,
} from './assistantModel';
import type { AssistantPrompt } from './assistantRuntime';
import { AssistantQueue } from './assistantQueue';

type WorkerRequest =
  | { id: number; type: 'install' }
  | { id: number; type: 'generate'; prompt: AssistantPrompt; priority: 'interactive' | 'background' }
  | { id: number; type: 'cancel-install' };

let generator: TextGenerationPipeline | undefined;
let runtimeModuleUrl: string | undefined;
const installations = new Map<number, AbortController>();

async function loadGenerator(): Promise<TextGenerationPipeline> {
  if (!(await isAssistantModelInstalled())) throw new Error('The local AI model is not installed.');
  if (generator) return generator;
  const cache = await caches.open(ASSISTANT_MODEL_CACHE);
  const wasm = await cache.match(assistantRuntimeUrl('runtime.wasm'));
  const module = await cache.match(assistantRuntimeUrl('runtime.mjs'));
  if (!wasm || !module || !env.backends.onnx.wasm) throw new Error('The local AI runtime is unavailable.');

  runtimeModuleUrl = URL.createObjectURL(await module.blob());
  env.logLevel = 50;
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = createAssistantModelCache(cache);
  env.useWasmCache = false;
  env.fetch = async () => { throw new Error('Network access is disabled for local inference.'); };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmBinary = new Uint8Array(await wasm.arrayBuffer());
  env.backends.onnx.wasm.wasmPaths = { mjs: runtimeModuleUrl };
  try {
    generator = await pipeline('text-generation', ASSISTANT_MODEL_ID, {
      revision: ASSISTANT_MODEL_REVISION,
      local_files_only: true,
      dtype: 'q8',
      device: 'wasm',
    });
    return generator;
  } catch {
    URL.revokeObjectURL(runtimeModuleUrl);
    runtimeModuleUrl = undefined;
    throw new Error('This device could not load the local AI model.');
  }
}

function safeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Model download cancelled.';
  if (!(error instanceof Error)) return 'Local AI failed. Please retry.';
  const safeMessages = [
    'This device does not support local AI storage or inference.',
    'This device does not support safe local AI model access.',
    'Not enough device storage is available for the model.',
    'Model download failed. Check your connection and retry.',
    'Downloaded model file has an invalid size.',
    'Model integrity verification failed. Delete the download and retry.',
    'Could not prepare the offline AI runtime.',
    'Could not remove the incomplete model download.',
    'The local AI model is not installed.',
    'The local AI runtime is unavailable.',
    'This device could not load the local AI model.',
  ];
  return safeMessages.includes(error.message) ? error.message : 'Local AI failed. Check device storage and retry.';
}

const queue = new AssistantQueue();
self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel-install') {
    installations.get(request.id)?.abort();
    return;
  }
  const controller = request.type === 'install' ? new AbortController() : undefined;
  if (controller) installations.set(request.id, controller);
  void queue.enqueue(request.type === 'install' ? 'barrier' : request.priority, async () => {
    try {
      if (request.type === 'install') {
        await withAssistantModelLock('exclusive', () =>
          installAssistantModel({ wasm: wasmUrl, mjs: wasmModuleUrl }, (loaded, total) =>
            self.postMessage({ id: request.id, type: 'progress', loaded, total }), controller?.signal), controller?.signal);
        self.postMessage({ id: request.id, type: 'done' });
      } else {
        const text = await withAssistantModelLock('shared', async () => {
          const model = await loadGenerator();
          const messages = typeof request.prompt === 'string'
            ? [{ role: 'user' as const, content: request.prompt }]
            : request.prompt;
          const result = await model(messages, { max_new_tokens: 192, do_sample: false });
          return result[0]?.generated_text.at(-1)?.content;
        });
        if (typeof text !== 'string' || !text.trim()) throw new Error('Empty model response.');
        self.postMessage({ id: request.id, type: 'done', text });
      }
    } catch (error) {
      self.postMessage({ id: request.id, type: 'error', message: safeError(error) });
    } finally {
      if (controller) installations.delete(request.id);
    }
  });
});
