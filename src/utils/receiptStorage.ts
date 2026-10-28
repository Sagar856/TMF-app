export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const RECEIPT_DATABASE = 'tmf-local-receipts';
const RECEIPT_STORE = 'receipts';

export interface ReceiptAttachment {
  id: string;
  transactionId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  blob: Blob;
}

export type ReceiptMetadata = Omit<ReceiptAttachment, 'blob'>;

export function validateReceiptFile(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type.toLowerCase())) {
    return 'Choose a JPEG, PNG, or WebP image.';
  }
  if (file.size <= 0) return 'The selected image is empty.';
  if (file.size > MAX_RECEIPT_BYTES) return 'Receipt images must be 10 MB or smaller.';
  if (!file.name.trim()) return 'The selected image has no file name.';
  return null;
}

function openReceiptDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Local receipt storage is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECEIPT_DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECEIPT_STORE)) {
        const store = database.createObjectStore(RECEIPT_STORE, { keyPath: 'id' });
        store.createIndex('transactionId', 'transactionId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local receipt storage.'));
    request.onblocked = () => reject(new Error('Local receipt storage is blocked by another open app tab.'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openReceiptDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = database.transaction(RECEIPT_STORE, mode);
      request = operation(transaction.objectStore(RECEIPT_STORE));
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    request.onsuccess = () => {
      transaction.oncomplete = () => {
        const result = request.result;
        database.close();
        resolve(result);
      };
    };
    const fail = () => {
      const error = transaction.error || request.error || new Error('Could not access local receipt storage.');
      database.close();
      reject(error);
    };
    request.onerror = fail;
    transaction.onerror = fail;
    transaction.onabort = fail;
  }));
}

export function saveReceiptAttachment(attachment: ReceiptAttachment): Promise<void> {
  return withStore('readwrite', (store) => store.put(attachment)).then(() => undefined);
}

export function listReceiptAttachments(): Promise<ReceiptAttachment[]> {
  return withStore('readonly', (store) => store.getAll());
}

export function deleteReceiptAttachment(id: string): Promise<void> {
  return withStore('readwrite', (store) => store.delete(id)).then(() => undefined);
}

export async function deleteReceiptAttachmentsForTransaction(transactionId: string): Promise<void> {
  const database = await openReceiptDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECEIPT_STORE, 'readwrite');
    const request = transaction.objectStore(RECEIPT_STORE).index('transactionId').openCursor(IDBKeyRange.only(transactionId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete local receipt images.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local receipt deletion was cancelled.'));
  }).finally(() => database.close());
}

export async function deleteAllReceiptAttachments(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}
