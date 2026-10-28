import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileImage, ImagePlus, Trash2, X } from 'lucide-react';
import { Transaction } from '../types/finance';
import { newId } from '../utils/ids';
import {
  deleteReceiptAttachment,
  listReceiptAttachments,
  ReceiptAttachment,
  saveReceiptAttachment,
  validateReceiptFile,
} from '../utils/receiptStorage';

interface ReceiptAttachmentModalProps {
  transactions: Transaction[];
  initialTransactionId: string;
  onClose: () => void;
}

function localDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const ReceiptAttachmentModal: React.FC<ReceiptAttachmentModalProps> = ({
  transactions,
  initialTransactionId,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(initialTransactionId);
  const [attachments, setAttachments] = useState<ReceiptAttachment[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [viewingUrl, setViewingUrl] = useState('');
  const [viewingAttachmentId, setViewingAttachmentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedTransaction = transactions.find((transaction) => transaction.id === selectedTransactionId);
  const selectedAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.transactionId === selectedTransactionId),
    [attachments, selectedTransactionId]
  );
  const viewingAttachment = attachments.find((attachment) => attachment.id === viewingAttachmentId);

  useEffect(() => {
    let active = true;
    listReceiptAttachments()
      .then((storedAttachments) => {
        if (active) setAttachments(storedAttachments);
      })
      .catch((storageError: unknown) => {
        if (active) setError(storageError instanceof Error ? storageError.message : 'Could not load local receipt images.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  useEffect(() => {
    if (!viewingAttachment) {
      setViewingUrl('');
      return;
    }
    const url = URL.createObjectURL(viewingAttachment.blob);
    setViewingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [viewingAttachment]);

  const handleFileSelection = (file?: File) => {
    if (!file) return;
    const validationError = validateReceiptFile(file);
    if (validationError) {
      setSelectedFile(null);
      setError(validationError);
      return;
    }
    setError('');
    setNotice('');
    setSelectedFile(file);
  };

  const handleSave = async () => {
    if (!selectedTransaction || !selectedFile) {
      setError('Choose an image and the transaction it belongs to.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const attachment: ReceiptAttachment = {
        id: newId('receipt'),
        transactionId: selectedTransaction.id,
        name: selectedFile.name,
        mimeType: selectedFile.type,
        size: selectedFile.size,
        createdAt: new Date().toISOString(),
        blob: selectedFile,
      };
      await saveReceiptAttachment(attachment);
      setAttachments((current) => [...current, attachment]);
      setSelectedFile(null);
      setNotice(`Receipt saved locally and matched to ${selectedTransaction.title}.`);
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : 'Could not save this receipt image.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (attachment: ReceiptAttachment) => {
    setError('');
    try {
      await deleteReceiptAttachment(attachment.id);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
      if (viewingAttachmentId === attachment.id) setViewingAttachmentId(null);
      setNotice('Receipt image deleted from this device.');
    } catch (storageError) {
      setError(storageError instanceof Error ? storageError.message : 'Could not delete this receipt image.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-backdrop p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-modal-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface-1 p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="receipt-modal-title" className="text-sm font-bold text-content-1">Receipt capture & matching</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-content-2">
              Images stay in this browser on this device. They are not uploaded to cloud sync or included in JSON backups.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close receipt manager" className="rounded-lg p-1.5 text-content-2 hover:bg-surface-3 hover:text-content-1">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <label className="mt-4 block text-[10px] font-bold text-content-2">
          Match receipt to transaction
          <select
            value={selectedTransactionId}
            onChange={(event) => {
              setSelectedTransactionId(event.target.value);
              setNotice('');
              setError('');
            }}
            className="mt-1.5 w-full rounded-lg border border-line bg-black px-3 py-2.5 text-xs text-content-1"
          >
            {transactions.map((transaction) => (
              <option key={transaction.id} value={transaction.id}>
                {localDate(transaction.date)} · {transaction.title} · {transaction.amount.toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          aria-label="Choose or capture receipt image"
          onChange={(event) => {
            handleFileSelection(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={transactions.length === 0}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Choose or capture image
          </button>
          {selectedFile && (
            <span className="max-w-full truncate text-[10px] text-content-2">
              {selectedFile.name} · {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          )}
        </div>

        {previewUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-black">
            <img src={previewUrl} alt={`Preview of ${selectedFile?.name || 'selected receipt'}`} className="max-h-60 w-full object-contain" />
          </div>
        )}

        {selectedFile && (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !selectedTransaction}
            className="mt-3 w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {isSaving ? 'Saving locally…' : `Save and match to ${selectedTransaction?.title || 'transaction'}`}
          </button>
        )}

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-2.5 text-[10px] text-red-700 dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{error}
          </p>
        )}
        {notice && <p role="status" className="mt-3 text-[10px] text-emerald-700 dark:text-emerald-300">{notice}</p>}

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-content-2">
            Matched receipts {isLoading ? '(loading)' : `(${selectedAttachments.length})`}
          </h3>
          {!isLoading && selectedAttachments.length === 0 && (
            <p className="mt-2 text-[10px] text-content-3">No receipts are matched to this transaction.</p>
          )}
          <div className="mt-2 space-y-2">
            {selectedAttachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-backdrop p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <FileImage className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-bold text-content-1">{attachment.name}</div>
                    <div className="text-[9px] text-content-3">{(attachment.size / 1024).toFixed(0)} KB · {new Date(attachment.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setViewingAttachmentId(attachment.id)} className="rounded border border-line px-2 py-1 text-[9px] text-content-2 hover:text-content-1">
                    View
                  </button>
                  <button type="button" onClick={() => handleDelete(attachment)} aria-label={`Delete receipt ${attachment.name}`} className="rounded p-1.5 text-red-400 hover:bg-red-950/40">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {viewingAttachment && (
          <div role="dialog" aria-modal="true" aria-label={`Receipt image ${viewingAttachment.name}`} className="fixed inset-0 z-[130] flex items-center justify-center bg-backdrop p-3" onClick={() => setViewingAttachmentId(null)}>
            <button type="button" onClick={() => setViewingAttachmentId(null)} aria-label="Close receipt image" className="absolute right-4 top-4 rounded-lg bg-surface-2 p-2 text-content-1">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <img
              src={viewingUrl}
              alt={viewingAttachment.name}
              className="max-h-[85vh] max-w-full object-contain"
            />
          </div>
        )}
      </section>
    </div>
  );
};
