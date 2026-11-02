import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../hooks/useDialog';

export function PremiumComingSoon() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const ref = useDialog({ isOpen: open, onClose: () => setOpen(false) });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs text-content-1">
        Real-time tracking · Coming soon
      </button>
      {open && createPortal(
        <div className="identity-glass fixed inset-0 z-modal flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="identity-glass-panel w-full max-w-md rounded-3xl border border-line bg-surface-1 p-6 text-content-1 space-y-4">
            <h2 id={titleId} className="text-lg font-bold">Premium · Coming soon</h2>
            <p className="text-sm text-content-2">Real-time bank balances and real-time investment tracking are planned paid features. They are not active yet.</p>
            <p className="text-sm text-content-2">Free: transaction logging, loans, manual investments and on-device notification-based spending tracking.</p>
            <p className="text-xs text-content-3">No subscription is available and no payment will be collected. Your manually saved balances and valuations remain available.</p>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-violet-600 px-4 py-2 text-sm text-white">Got it</button>
          </div>
        </div>, document.body
      )}
    </>
  );
}
