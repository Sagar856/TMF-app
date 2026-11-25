import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const ASSISTANT_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
export const ASSISTANT_MODEL_REVISION = '516c8d04add8a80c5228f32102b57953b8d421a9';
export const ASSISTANT_MODEL_CACHE = 'minarth-assistant-qwen05-v2';
const ASSISTANT_MODEL_LOCK = 'minarth-assistant-model-v2';

const MODEL_BASE = `https://huggingface.co/${ASSISTANT_MODEL_ID}/resolve/${ASSISTANT_MODEL_REVISION}/`;
const MODEL_FILES = [
  { path: 'config.json', size: 678, sha256: '777e01f0fbb3346eb229cb6fb278ed6533c1e4dcb9ebf4bed0f6e94ef17fa1b5' },
  { path: 'tokenizer.json', size: 7031673, sha256: 'a8506e7111b80c6d8635951a02eab0f4e1a8e4e5772da83846579e97b16f61bf' },
  { path: 'tokenizer_config.json', size: 7306, sha256: '7e88129d9769a0b14b1587a7d5e829fe93ac0e1511636471fdfc0811951418e6' },
  { path: 'generation_config.json', size: 242, sha256: 'f7e7ce458658b2d40d9eb213b91b77a8bf698845ab89360976722d7ac46928a3' },
  { path: 'onnx/model_quantized.onnx', size: 512096557, sha256: '41834041ab1b29eff9fc592f1a29a1844133aea35832ea9fa91682be13016100' },
] as const;
const MODEL_WEIGHTS = MODEL_FILES[MODEL_FILES.length - 1];
const MODEL_CHUNK_BYTES = 8 * 1024 * 1024;
export const ASSISTANT_WEIGHTS_URL = MODEL_BASE + MODEL_WEIGHTS.path;
export const ASSISTANT_MODEL_BYTES = MODEL_FILES.reduce((total, file) => total + file.size, 0);
export const ASSISTANT_STORAGE_BYTES = ASSISTANT_MODEL_BYTES + 14289219;

const markerUrl = () => new URL('/__minarth-assistant-installed', self.location.origin).href;
export const assistantRuntimeUrl = (file: 'runtime.wasm' | 'runtime.mjs') =>
  new URL(`/__minarth-assistant-${file}`, self.location.origin).href;

function chunkUrl(url: string, index: number): string {
  const key = new URL(url);
  key.searchParams.set('minarth-chunk', String(index));
  return key.href;
}

function requireStorage(): CacheStorage {
  if (typeof caches === 'undefined' || typeof ReadableStream === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('This device does not support local AI storage or inference.');
  }
  return caches;
}

export function isAssistantModelSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof caches !== 'undefined'
    && typeof ReadableStream !== 'undefined' && typeof WebAssembly !== 'undefined'
    && typeof navigator !== 'undefined' && Boolean(navigator.locks);
}

export async function withAssistantModelLock<T>(
  mode: 'shared' | 'exclusive',
  action: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    throw new Error('This device does not support safe local AI model access.');
  }
  return navigator.locks.request(ASSISTANT_MODEL_LOCK, { mode, signal }, action);
}

export async function isAssistantModelInstalled(): Promise<boolean> {
  const storage = requireStorage();
  if (!(await storage.has(ASSISTANT_MODEL_CACHE))) return false;
  const cache = await storage.open(ASSISTANT_MODEL_CACHE);
  const keys = [markerUrl(), ...MODEL_FILES.slice(0, -1).map(file => MODEL_BASE + file.path),
    ...Array.from({ length: Math.ceil(MODEL_WEIGHTS.size / MODEL_CHUNK_BYTES) },
      (_, index) => chunkUrl(ASSISTANT_WEIGHTS_URL, index)),
    assistantRuntimeUrl('runtime.wasm'), assistantRuntimeUrl('runtime.mjs')];
  for (const key of keys) {
    if (!(await cache.match(key))) return false;
  }
  return true;
}

export async function removeAssistantModel(): Promise<void> {
  const storage = requireStorage();
  if (await storage.has(ASSISTANT_MODEL_CACHE) && !(await storage.delete(ASSISTANT_MODEL_CACHE))) {
    throw new Error('Could not remove the downloaded model.');
  }
}

export async function cacheVerifiedAssistantResponse(
  cache: Pick<Cache, 'put'>,
  url: string,
  response: Response,
  file: { size: number; sha256: string },
  onBytes: (bytes: number) => void,
): Promise<void> {
  if (!response.ok || !response.body) throw new Error('Model download failed. Check your connection and retry.');
  const reader = response.body.getReader();
  const hash = sha256.create();
  let total = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        total += value.byteLength;
        if (total > file.size) throw new Error('Downloaded model file has an invalid size.');
        hash.update(value);
        onBytes(value.byteLength);
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader.cancel();
    },
  });
  await cache.put(url, new Response(stream, { headers: { 'Content-Type': 'application/octet-stream' } }));
  if (total !== file.size || bytesToHex(hash.digest()) !== file.sha256) {
    throw new Error('Model integrity verification failed. Delete the download and retry.');
  }
}

export async function cacheVerifiedAssistantChunks(
  cache: Pick<Cache, 'put'>,
  url: string,
  response: Response,
  file: { size: number; sha256: string },
  onBytes: (bytes: number) => void,
  chunkSize = MODEL_CHUNK_BYTES,
): Promise<void> {
  if (!response.ok || !response.body) throw new Error('Model download failed. Check your connection and retry.');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error('Invalid model chunk size.');
  const reader = response.body.getReader();
  const hash = sha256.create();
  let chunk = new Uint8Array(chunkSize);
  let used = 0;
  let index = 0;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > file.size) throw new Error('Downloaded model file has an invalid size.');
      hash.update(value);
      onBytes(value.byteLength);
      let offset = 0;
      while (offset < value.length) {
        const count = Math.min(chunkSize - used, value.length - offset);
        chunk.set(value.subarray(offset, offset + count), used);
        used += count;
        offset += count;
        if (used === chunkSize) {
          await cache.put(chunkUrl(url, index++), new Response(chunk));
          chunk = new Uint8Array(chunkSize);
          used = 0;
        }
      }
    }
    if (total !== file.size || bytesToHex(hash.digest()) !== file.sha256) {
      throw new Error('Model integrity verification failed. Delete the download and retry.');
    }
    if (used) await cache.put(chunkUrl(url, index), new Response(chunk.subarray(0, used)));
  } catch (error) {
    await reader.cancel();
    throw error;
  }
}

export async function readAssistantChunks(
  cache: Pick<Cache, 'match'>,
  url: string,
  size: number = MODEL_WEIGHTS.size,
  chunkSize: number = MODEL_CHUNK_BYTES,
): Promise<Response> {
  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const count = Math.ceil(size / chunkSize);
  return new Response(new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (index < count) {
          if (!reader) {
            const response = await cache.match(chunkUrl(url, index));
            if (!response?.body) throw new Error('The local AI model is incomplete.');
            reader = response.body.getReader();
          }
          const next = await reader.read();
          if (!next.done) {
            controller.enqueue(next.value);
            return;
          }
          reader.releaseLock();
          reader = undefined;
          index++;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await reader?.cancel();
    },
  }), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) } });
}

export function createAssistantModelCache(cache: Pick<Cache, 'match' | 'put'>) {
  const defaultRevisionBase = `https://huggingface.co/${ASSISTANT_MODEL_ID}/resolve/main/`;
  return {
    match(key: string): Promise<Response | undefined> {
      // Transformers.js preflights pipeline files at "main" even when the
      // requested model revision is pinned.
      const pinnedKey = key.startsWith(defaultRevisionBase)
        ? MODEL_BASE + key.slice(defaultRevisionBase.length) : key;
      return pinnedKey === ASSISTANT_WEIGHTS_URL
        ? readAssistantChunks(cache, pinnedKey)
        : cache.match(pinnedKey);
    },
    put(): Promise<void> {
      return Promise.reject(new Error('The local AI model cache is read-only during inference.'));
    },
  };
}

export async function installAssistantModel(
  runtimeAssets: { wasm: string; mjs: string },
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const storage = requireStorage();
  signal?.throwIfAborted();
  if (await isAssistantModelInstalled()) return;
  const estimate = typeof navigator !== 'undefined' ? await navigator.storage?.estimate?.() : undefined;
  signal?.throwIfAborted();
  if (estimate?.quota !== undefined && estimate.usage !== undefined
    && estimate.quota - estimate.usage < ASSISTANT_STORAGE_BYTES) {
    throw new Error('Not enough device storage is available for the model.');
  }
  await storage.delete(ASSISTANT_MODEL_CACHE);
  const cache = await storage.open(ASSISTANT_MODEL_CACHE);
  let loaded = 0;
  try {
    for (const file of MODEL_FILES) {
      signal?.throwIfAborted();
      const url = MODEL_BASE + file.path;
      const response = await fetch(url, {
        credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal,
      });
      const save = file.path === MODEL_WEIGHTS.path ? cacheVerifiedAssistantChunks : cacheVerifiedAssistantResponse;
      await save(cache, url, response, file, bytes => {
        loaded += bytes;
        onProgress(loaded, ASSISTANT_MODEL_BYTES);
      });
    }
    for (const [file, url] of [['runtime.wasm', runtimeAssets.wasm], ['runtime.mjs', runtimeAssets.mjs]] as const) {
      signal?.throwIfAborted();
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('Could not prepare the offline AI runtime.');
      await cache.put(assistantRuntimeUrl(file), response);
    }
    signal?.throwIfAborted();
    await cache.put(markerUrl(), new Response(ASSISTANT_MODEL_REVISION));
  } catch (error) {
    if (!(await storage.delete(ASSISTANT_MODEL_CACHE)) && await storage.has(ASSISTANT_MODEL_CACHE)) {
      throw new Error('Could not remove the incomplete model download.');
    }
    throw error;
  }
}
