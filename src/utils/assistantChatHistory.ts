import type { AssistantReport } from './assistantReport';

const DATABASE = 'tmf-mina-chats';
const STORE = 'owners';
export const MAX_MINA_CHATS = 5;

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  report?: AssistantReport;
  explanation?: string;
  currencyCode?: string;
  localData?: boolean;
}

export interface MinaChat {
  id: string;
  createdAt: number;
  month: string;
  messages: AssistantMessage[];
}

export interface MinaChatArchive {
  version: 1;
  consented: boolean;
  activeChatId: string | null;
  chats: MinaChat[];
}

export const emptyMinaArchive = (): MinaChatArchive => ({
  version: 1, consented: false, activeChatId: null, chats: [],
});

export function newMinaChat(month: string): MinaChat {
  return { id: crypto.randomUUID(), createdAt: Date.now(), month, messages: [] };
}

export function putMinaChat(archive: MinaChatArchive, chat: MinaChat): MinaChatArchive {
  if (!archive.consented) throw new Error('Accept MINA privacy and storage consent before chatting.');
  const existing = archive.chats.find(item => item.id === chat.id);
  if (existing && (existing.createdAt !== chat.createdAt || existing.messages.some((message, index) =>
    JSON.stringify(message) !== JSON.stringify(chat.messages[index])))) {
    throw new Error('This chat changed in another window. Reopen MINA before continuing.');
  }
  const chats = existing
    ? archive.chats.map(item => item.id === chat.id ? chat : item)
    : [chat, ...archive.chats];
  chats.sort((left, right) => right.createdAt - left.createdAt);
  const retained = chats.slice(0, MAX_MINA_CHATS);
  if (!retained.some(item => item.id === chat.id)) {
    throw new Error('This chat is no longer retained. Open a current chat or start a new one.');
  }
  return { ...archive, activeChatId: chat.id, chats: retained };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => typeof value[field] === 'string');
}

function numberFields(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => typeof value[field] === 'number' && Number.isFinite(value[field]));
}

function rows(value: unknown, strings: string[], numbers: string[]): boolean {
  return Array.isArray(value) && value.every(row => isRecord(row)
    && stringFields(row, strings) && numberFields(row, numbers));
}

function isReport(value: unknown): value is AssistantReport {
  return isRecord(value) && stringFields(value, ['month', 'asOfDate'])
    && numberFields(value, ['transactionCount', 'operatingIncome', 'operatingExpense'])
    && rows(value.categorySpending, ['category'], ['amount'])
    && rows(value.accounts, ['name', 'type'], ['balance'])
    && rows(value.investments, ['name', 'type', 'status'], ['currentValue'])
    && rows(value.loans, ['title', 'type', 'status'], ['remainingAmount'])
    && rows(value.savingsGoals, ['title'], ['savedAmount', 'targetAmount', 'progress'])
    && Array.isArray(value.budgets) && value.budgets.every(row => isRecord(row)
      && numberFields(row, ['budget', 'spent', 'percent', 'remaining', 'overBudget', 'txCount'])
      && ['safe', 'warning', 'critical'].includes(String(row.status))
      && isRecord(row.category) && stringFields(row.category, ['id', 'name', 'type', 'iconName'])
      && Array.isArray(row.category.subcategories) && row.category.subcategories.every(item => typeof item === 'string'))
    && Array.isArray(value.limitations) && value.limitations.every(item => typeof item === 'string');
}

export function isMinaArchive(value: unknown): value is MinaChatArchive {
  if (!isRecord(value) || value.version !== 1 || typeof value.consented !== 'boolean'
    || !Array.isArray(value.chats) || value.chats.length > MAX_MINA_CHATS) return false;
  const valid = value.chats.every(chat => isRecord(chat) && typeof chat.id === 'string'
    && typeof chat.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(chat.month)
    && numberFields(chat, ['createdAt']) && Array.isArray(chat.messages)
    && chat.messages.every(message => isRecord(message) && numberFields(message, ['id'])
      && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string'
      && (message.explanation === undefined || typeof message.explanation === 'string')
      && (message.currencyCode === undefined || typeof message.currencyCode === 'string')
      && (message.localData === undefined || typeof message.localData === 'boolean')
      && (message.report === undefined || (isReport(message.report) && typeof message.currencyCode === 'string'))));
  return valid && new Set(value.chats.map(chat => chat.id)).size === value.chats.length
    && (value.activeChatId === null || value.chats.some(chat => chat.id === value.activeChatId))
    && (value.consented || (value.chats.length === 0 && value.activeChatId === null));
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Device-local MINA chat storage is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new Error('Could not open device-local MINA chats.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other MINARTH tabs and retry opening MINA chats.'));
    };
  });
}

// One owner-scoped IndexedDB row keeps consent, selection and pruning atomic.
// It is intentionally outside financial caches, sync and backup exports.
async function accessArchive(
  owner: string, change?: (archive: MinaChatArchive) => MinaChatArchive,
): Promise<MinaChatArchive> {
  if (!owner.trim()) throw new Error('Sign in before opening saved MINA chats.');
  const database = await openDatabase();
  return new Promise<MinaChatArchive>((resolve, reject) => {
    const transaction = database.transaction(STORE, change ? 'readwrite' : 'readonly');
    const store = transaction.objectStore(STORE);
    const request = store.get(owner);
    let result = emptyMinaArchive();
    let failure = 'Could not access device-local MINA chats. Check available device storage and retry.';
    request.onsuccess = () => {
      try {
        const value: unknown = request.result;
        if (value === undefined) result = emptyMinaArchive();
        else if (isMinaArchive(value)) result = value;
        else throw new Error('Saved MINA chats could not be read. Clear saved chats to start again.');
        if (change) {
          const next = change(result);
          if (!isMinaArchive(next)) throw new Error('MINA chat data is invalid and could not be saved.');
          store.put(next, owner);
          result = next;
        }
      } catch (reason) {
        failure = reason instanceof Error ? reason.message : failure;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(new Error(failure)); };
  });
}

export const loadMinaChats = (owner: string) => accessArchive(owner);
export const consentToMinaChats = (owner: string) => accessArchive(owner, archive => ({ ...archive, consented: true }));
export const startMinaChat = (owner: string, month: string, messages: AssistantMessage[] = []) => accessArchive(owner, archive => {
  const chat = newMinaChat(month);
  chat.messages = messages;
  chat.createdAt = archive.chats.reduce((newest, item) => Math.max(newest, item.createdAt + 1), chat.createdAt);
  return putMinaChat(archive, chat);
});
export const saveMinaChat = (owner: string, chat: MinaChat) => accessArchive(owner, archive => {
  if (!archive.chats.some(item => item.id === chat.id)) {
    throw new Error('This chat was deleted or is no longer retained. Reopen MINA before continuing.');
  }
  return putMinaChat(archive, chat);
});
export const selectMinaChat = (owner: string, id: string) => accessArchive(owner, archive => {
  if (!archive.consented || !archive.chats.some(chat => chat.id === id)) throw new Error('This saved MINA chat is no longer available.');
  return { ...archive, activeChatId: id };
});

export function removeMinaChat(archive: MinaChatArchive, id: string): MinaChatArchive {
  if (!archive.consented || !archive.chats.some(chat => chat.id === id)) {
    throw new Error('This saved MINA chat is no longer available.');
  }
  const chats = archive.chats.filter(chat => chat.id !== id);
  return {
    ...archive,
    chats,
    activeChatId: archive.activeChatId === id ? chats[0]?.id ?? null : archive.activeChatId,
  };
}

export const deleteMinaChat = (owner: string, id: string) => accessArchive(owner, archive => removeMinaChat(archive, id));

export async function deleteMinaChats(owner: string): Promise<void> {
  if (!owner.trim()) throw new Error('Sign in before clearing saved MINA chats.');
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(owner);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(new Error('Could not remove saved MINA chats from this device.'));
  }).finally(() => database.close());
}
