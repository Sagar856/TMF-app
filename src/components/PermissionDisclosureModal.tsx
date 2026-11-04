import React from 'react';
import { Bell, MapPin, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

export type PermissionDisclosure = 'location' | 'notifications';

interface PermissionDisclosureModalProps {
  permission: PermissionDisclosure;
  busy?: boolean;
  onAllow: () => void;
  onCancel: () => void;
}

const DISCLOSURES: Record<PermissionDisclosure, { title: string; description: string; icon: typeof MapPin; action: string }> = {
  location: {
    title: 'Allow location access?',
    description: 'MINARTH uses your location only when you choose to add it to a transaction. Your location is saved with that transaction and is never tracked continuously.',
    icon: MapPin,
    action: 'Continue to location permission',
  },
  notifications: {
    title: 'Allow notifications?',
    description: 'MINARTH can notify you about detected payments and budget thresholds. You can turn these alerts off at any time in Settings.',
    icon: Bell,
    action: 'Continue to notification permission',
  },
};

export const PermissionDisclosureModal: React.FC<PermissionDisclosureModalProps> = ({
  permission,
  busy = false,
  onAllow,
  onCancel,
}) => {
  const disclosure = DISCLOSURES[permission];
  const Icon = disclosure.icon;
  const dialogRef = useDialog<HTMLElement>({ isOpen: true, onClose: () => { if (!busy) onCancel(); } });

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-4 backdrop-blur-md">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="permission-disclosure-title"
        className="finance-dialog-glass w-full max-w-sm rounded-3xl border p-5 text-content-1 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-xl border border-violet-300/25 bg-violet-500/15 p-2 text-violet-300">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="permission-disclosure-title" className="text-sm font-bold">{disclosure.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-content-2">{disclosure.description}</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close permission request" className="rounded-lg p-1 text-content-3 hover:text-content-1 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs font-semibold text-content-2 hover:text-content-1 disabled:opacity-50">
            Not now
          </button>
          <button type="button" onClick={onAllow} disabled={busy} className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {busy ? 'Please wait…' : disclosure.action}
          </button>
        </div>
      </section>
    </div>
  );
};
