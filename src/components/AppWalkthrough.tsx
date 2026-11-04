import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Wallet } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { useDialog } from '../hooks/useDialog';
import { safeGetItem, safeSetItem } from '../utils/storage';
import { useActivityState } from '../hooks/useActivityState';

export const WALKTHROUGH_STEPS = [
  { tab: 'dashboard', title: 'Welcome to MINARTH', description: 'See your net worth, cash flow, budgets and spending trends in one place.' },
  { tab: 'accounts', title: 'Start with your accounts', description: 'Add your bank accounts, wallets and credit cards to keep balances and payments connected.' },
  { tab: 'transactions', title: 'Record money in seconds', description: 'Use the + button to add a transaction. Search and filters help you find earlier payments.' },
  { tab: 'investments', title: 'Follow your investments', description: 'Add assets using the + button and follow purchases, current values and returns.' },
  { tab: 'loans', title: 'Manage loans and lends', description: 'Track the people you borrow from or lend to, repayment schedules and upcoming installments.' },
  { tab: 'settings', title: 'Make it yours', description: 'Choose your theme, categories and budgets. Enable optional location tagging, notifications or app lock in Settings; device access is requested only with your consent.' },
] as const;

export const AppWalkthrough: React.FC<{ userId: string; onNavigate: (tab: string) => void }> = ({ userId, onNavigate }) => {
  const key = `tmf_walkthrough_v1_${userId}`;
  const [open, setOpen] = useState(() => safeGetItem(key) !== 'complete');
  const [step, setStep] = useActivityState(`walkthrough.${userId}.step`, 0);
  const [error, setError] = useState('');
  const finish = () => {
    if (!safeSetItem(key, 'complete')) {
      setError('Could not save your walkthrough preference. Please try again.');
      return;
    }
    setOpen(false);
    onNavigate('dashboard');
  };
  const ref = useDialog<HTMLElement>({ isOpen: open, onClose: () => {
    if (safeSetItem(key, 'complete')) setOpen(false);
    else setError('Could not save your walkthrough preference. Please try again.');
  } });
  if (!open) return null;
  const current = WALKTHROUGH_STEPS[step];
  const move = (next: number) => {
    setStep(next);
    onNavigate(WALKTHROUGH_STEPS[next].tab);
  };
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-4 backdrop-blur-md">
      <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-description"
        className="finance-dialog-glass w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl border p-6 text-content-1 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <BrandMark className="w-14 h-14" />
          <button type="button" onClick={finish} className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-xs text-content-2">Skip</button>
        </div>
        <p role="status" aria-live="polite" className="mt-5 text-xs text-content-3">Step {step + 1} of {WALKTHROUGH_STEPS.length}</p>
        <div className="my-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-300/25 bg-violet-500/15 text-violet-400"><Wallet aria-hidden="true" /></div>
        <h2 id="walkthrough-title" className="text-xl font-bold">{current.title}</h2>
        <p id="walkthrough-description" className="mt-3 text-sm leading-relaxed text-content-2">{current.description}</p>
        <div aria-hidden="true" className="mt-6 flex gap-2">
          {WALKTHROUGH_STEPS.map((item, index) => <span key={item.tab} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-violet-400' : 'bg-surface-2'}`} />)}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-content-1">{error}</p>}
        <div className="mt-6 flex justify-between gap-3">
          <button type="button" disabled={step === 0} onClick={() => move(step - 1)} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs disabled:opacity-40"><ArrowLeft className="h-4 w-4" />Back</button>
          <button type="button" onClick={() => step === WALKTHROUGH_STEPS.length - 1 ? finish() : move(step + 1)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 px-5 py-3 text-xs font-bold text-white">
            {step === WALKTHROUGH_STEPS.length - 1 ? <>Get started<Check className="h-4 w-4" /></> : <>Next<ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
      </section>
    </div>
  );
};
