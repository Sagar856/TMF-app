import { isAssistantModelInstalled, removeAssistantModel, withAssistantModelLock } from './assistantModel';
import { protectAssistantPrompt, validateAssistantResponse } from '../utils/assistantPrivacy';

export interface AssistantChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type AssistantPrompt = string | AssistantChatMessage[];

interface WorkerReply {
  id: number;
  type: 'progress' | 'done' | 'error';
  loaded?: number;
  total?: number;
  text?: string;
  message?: string;
}

interface PendingRequest {
  resolve: (text: string | undefined) => void;
  reject: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
  timeout?: ReturnType<typeof setTimeout>;
}

export class AssistantRuntime {
  private worker: Worker | undefined;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private installation: { id: number; promise: Promise<void> } | undefined;

  installed(): Promise<boolean> {
    return isAssistantModelInstalled();
  }

  private getWorker(): Worker {
    if (typeof Worker === 'undefined') throw new Error('This device does not support local AI workers.');
    if (!this.worker) {
      this.worker = this.configureWorker(new Worker(new URL('./assistantWorker.ts', import.meta.url), { type: 'module' }));
    }
    return this.worker;
  }

  private configureWorker(worker: Worker): Worker {
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const request = this.pending.get(reply.id);
      if (!request) return;
      if (reply.type === 'progress') {
        if (typeof reply.loaded === 'number' && typeof reply.total === 'number') request.onProgress?.(reply.loaded, reply.total);
        return;
      }
      this.pending.delete(reply.id);
      clearTimeout(request.timeout);
      if (reply.type === 'error') request.reject(new Error(reply.message || 'Local AI failed.'));
      else request.resolve(reply.text);
    };
    worker.onerror = () => this.terminateWorker('Local AI worker could not start on this device.');
    worker.onmessageerror = () => this.terminateWorker('Local AI worker returned an invalid response.');
    return worker;
  }

  private request(type: 'install' | 'generate', prompt?: AssistantPrompt, onProgress?: (loaded: number, total: number) => void, priority: 'interactive' | 'background' = 'interactive'): Promise<string | undefined> {
    let worker: Worker;
    try {
      worker = this.getWorker();
    } catch (error) {
      return Promise.reject(error);
    }
    const id = ++this.nextId;
    return new Promise<string | undefined>((resolve, reject) => {
      const timeout = type === 'generate' ? setTimeout(() => {
        const message = 'MINA took too long on this device. Please retry, or use the app controls.';
        if (this.installation) {
          this.pending.delete(id);
          reject(new Error(message));
        } else this.terminateWorker(message);
      }, 60_000) : undefined;
      this.pending.set(id, { resolve, reject, onProgress, timeout });
      try {
        worker.postMessage(type === 'install' ? { id, type } : { id, type, prompt, priority });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Could not start local AI.'));
      }
    });
  }

  async install(onProgress: (loaded: number, total: number) => void): Promise<void> {
    if (this.installation) throw new Error('A model download is already in progress.');
    const promise = this.request('install', undefined, onProgress).then(() => {});
    const installation = { id: this.nextId, promise };
    this.installation = installation;
    try {
      await promise;
    } finally {
      if (this.installation === installation) this.installation = undefined;
    }
  }

  async cancelInstall(): Promise<void> {
    const installation = this.installation;
    if (!installation) return;
    this.worker?.postMessage({ id: installation.id, type: 'cancel-install' });
    try {
      await installation.promise;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Model download cancelled.') throw error;
    }
  }

  async generate(prompt: AssistantPrompt, priority: 'interactive' | 'background' = 'interactive'): Promise<string> {
    const text = await this.request('generate', protectAssistantPrompt(prompt), undefined, priority);
    if (!text) throw new Error('The local AI model returned an empty response.');
    return validateAssistantResponse(text);
  }

  private terminateWorker(message: string): void {
    if (this.installation) this.worker?.postMessage({ id: this.installation.id, type: 'cancel-install' });
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error(message));
    }
    this.pending.clear();
  }

  async stop(): Promise<void> {
    try {
      await this.cancelInstall();
    } finally {
      this.terminateWorker('Local AI was stopped.');
    }
  }

  async remove(): Promise<void> {
    await this.stop();
    await withAssistantModelLock('exclusive', removeAssistantModel);
  }
}
