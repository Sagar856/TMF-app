import React, { useEffect, useRef, useState } from 'react';
import { Brain, Send, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import type { Category, FinancialAccount, InvestmentRecord, LoanRecord, SavingsGoal, Transaction } from '../types/finance';
import type { AssistantRuntime } from '../services/assistantRuntime';
import { todayLocalISO } from '../utils/dates';
import { createAssistantReport, type AssistantReport } from '../utils/assistantReport';
import { stringifyAssistantReportCsv } from '../utils/assistantReportCsv';
import { assistantReportInsights, assistantReportPrompt, resolveAssistantReportExplanation } from '../utils/assistantReportExplanation';
import { createAssistantReportPdf } from '../utils/assistantReportPdf';
import type { AssistantCategoryReview } from '../utils/assistantCategory';
import { answerAssistantMarketQuestion } from '../utils/assistantMarketResponse';
import { answerAssistantAppQuestion, answerAssistantCredentialQuestion, answerAssistantFinanceDefinition, assistantChatPrompt, isAssistantReportRequest } from '../utils/assistantChat';
import type { MarketSnapshot } from '../utils/marketData';
import { AssistantReportView } from './AssistantReportView';

interface AssistantChatModalProps {
  runtime: AssistantRuntime;
  transactions: Transaction[];
  categories: Category[];
  accounts: FinancialAccount[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  savingsGoals: SavingsGoal[];
  currencyCode: string;
  marketSnapshot: MarketSnapshot | null;
  categoryReviews?: AssistantCategoryReview[];
  existingUncategorizedCount?: number;
  onCategorizeExisting?: () => void;
  onApproveCategory?: (review: AssistantCategoryReview) => void;
  onDismissCategory?: (review: AssistantCategoryReview) => void;
  onReloadConflict?: (review: AssistantCategoryReview) => void;
  onClose: () => void;
}

interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  report?: AssistantReport;
  explanation?: string;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export const AssistantChatModal: React.FC<AssistantChatModalProps> = ({
  runtime, transactions, categories, accounts, investments, loans, savingsGoals, currencyCode,
  marketSnapshot,
  categoryReviews = [], existingUncategorizedCount = 0, onCategorizeExisting,
  onApproveCategory, onDismissCategory, onReloadConflict, onClose,
}) => {
  const dialogRef = useDialog<HTMLElement>({ isOpen: true, onClose });
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [month, setMonth] = useState(todayLocalISO().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);

  const send = async (value: string, reportRequested: boolean) => {
    const prompt = value.trim();
    if (!prompt || prompt.length > 4000 || busy) return;
    const userMessage: AssistantMessage = { id: ++nextId.current, role: 'user', text: prompt };
    setMessages(previous => [...previous, userMessage]);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const credentialResponse = answerAssistantCredentialQuestion(prompt);
      if (credentialResponse) {
        setMessages(previous => [...previous, { id: ++nextId.current, role: 'assistant', text: credentialResponse }]);
      } else if (reportRequested) {
        const asOfDate = todayLocalISO();
        const report = createAssistantReport({
          month, asOfDate, transactions, categories, accounts, investments, loans, savingsGoals,
        });
        let explanation = '';
        let explanationError = '';
        try {
          const insights = assistantReportInsights(report);
          const output = await runtime.generate(assistantReportPrompt(insights));
          explanation = resolveAssistantReportExplanation(output, insights);
        } catch (reason) {
          explanationError = reason instanceof Error ? reason.message : 'Local AI explanation failed.';
        }
        setMessages(previous => [...previous, {
          id: ++nextId.current, role: 'assistant',
          text: `Here is your report for ${month}. The figures below are calculated from your records; any AI summary only selects verified findings.${explanationError ? ` The local AI explanation is unavailable: ${explanationError}` : ''}`,
          report, explanation,
        }]);
      } else {
        const cachedMarketResponse = answerAssistantMarketQuestion(
          prompt,
          messages.filter(message => message.role === 'user').map(message => message.text),
          marketSnapshot,
        );
        const response = cachedMarketResponse || answerAssistantAppQuestion(prompt) || answerAssistantFinanceDefinition(prompt)
          || await runtime.generate(assistantChatPrompt([...messages, userMessage]));
        setMessages(previous => [...previous, { id: ++nextId.current, role: 'assistant', text: response.trim() }]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Local AI failed. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const requested = isAssistantReportRequest(input);
    void send(input, requested);
  };

  const exportCsv = (report: AssistantReport, explanation: string) => {
    try {
      const csv = stringifyAssistantReportCsv(report, currencyCode, explanation);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `MINARTH_Report_${report.month}.csv`);
    } catch {
      setError('Could not export this report as CSV.');
    }
  };

  const exportPdf = async (report: AssistantReport, explanation: string) => {
    try {
      const blob = await createAssistantReportPdf(report, currencyCode, explanation);
      downloadBlob(blob, `MINARTH_Report_${report.month}.pdf`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not export this report as PDF.');
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-2 backdrop-blur-md sm:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabIndex={-1}
        className="flex max-h-[min(92dvh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface-1 text-content-1 shadow-2xl outline-none">
        <header className="flex items-center justify-between border-b border-line p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-500" />
            <div><h2 id="assistant-title" className="text-sm font-bold">MINA</h2>
              <p className="text-[10px] text-content-3">Prompts and this temporary chat stay on this device.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close MINA" className="rounded-xl p-2 hover:bg-surface-2"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
          <label className="text-[10px] text-content-3">Report month
            <input type="month" value={month} onChange={event => setMonth(event.target.value)}
              className="mt-1 block rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-content-1" />
          </label>
          <button type="button" disabled={busy} onClick={() => void send(`Generate a financial report for ${month}.`, true)}
            className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            Generate report
          </button>
          <span className="text-[10px] text-content-3">Reports run only when you request one. Exported files are under your control.</span>
        </div>
        {(categoryReviews.length > 0 || existingUncategorizedCount > 0) && (
          <section aria-label="MINA transaction categories" className="space-y-2 border-b border-line px-4 py-3">
            {existingUncategorizedCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-content-3">
                  Existing uncategorized records are left unchanged unless you explicitly request processing.
                </p>
                <button type="button" onClick={onCategorizeExisting}
                  className="rounded-lg border border-violet-400 px-3 py-2 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                  Categorize existing uncategorized ({existingUncategorizedCount})
                </button>
              </div>
            )}
            {categoryReviews.length > 0 && (
              <div className="space-y-2" aria-live="polite">
                <h3 className="text-xs font-bold">Category suggestions to review</h3>
                {categoryReviews.map(review => (
                  <article key={review.transactionId} className="rounded-xl border border-line bg-surface-2 p-3">
                    <p className="text-xs font-semibold">{review.before.title}</p>
                    <p className="mt-1 text-[10px] text-content-2">
                      {review.before.category} / {review.before.subcategory}
                      {' → '}
                      {review.category} / {review.subcategory}
                    </p>
                    <p className="mt-1 text-[10px] text-content-3">{review.reason}</p>
                    <div className="mt-2 flex gap-2">
                      {review.cloudConflict ? (
                        <button type="button" onClick={() => onReloadConflict?.(review)}
                          className="rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-bold text-white">
                          Reload cloud version
                        </button>
                      ) : (
                        <button type="button" onClick={() => onApproveCategory?.(review)}
                          className="rounded-lg bg-violet-700 px-3 py-2 text-[10px] font-bold text-white">
                          Apply category
                        </button>
                      )}
                      <button type="button" onClick={() => onDismissCategory?.(review)}
                        className="rounded-lg border border-line px-3 py-2 text-[10px] font-bold">
                        {review.cloudConflict ? 'Keep local version' : 'Keep current'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && (
            <p className="rounded-xl bg-surface-2 p-3 text-xs text-content-2">
              Ask a general question, or request a report for a month. Financial figures are calculated by MINARTH; AI only selects verified findings. For metal rates, MINA uses only saved market data and shows its source/date; it cannot check live internet prices. The app still needs internet for its existing cloud sync and other online features.
            </p>
          )}
          {messages.map(message => (
            <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-2xl bg-violet-700 p-3 text-xs text-white' : 'max-w-full space-y-3'}>
              {message.text && <p className={message.role === 'user' ? 'whitespace-pre-wrap' : 'rounded-2xl bg-surface-2 p-3 text-xs text-content-1'}>{message.text}</p>}
              {message.report && <AssistantReportView report={message.report} currencyCode={currencyCode}
                explanation={message.explanation || ''}
                onExportCsv={() => exportCsv(message.report!, message.explanation || '')}
                onExportPdf={() => void exportPdf(message.report!, message.explanation || '')} />}
            </div>
          ))}
          {busy && <p role="status" className="text-xs text-content-3">Running locally…</p>}
          <div ref={endRef} />
        </div>
        {error && <p role="alert" className="border-t border-line px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
          <label className="sr-only" htmlFor="assistant-message">Message MINA</label>
          <textarea id="assistant-message" value={input} maxLength={4000} rows={2} disabled={busy}
            onChange={event => setInput(event.target.value)} placeholder="Ask a general question or request a financial report…"
            className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-line bg-surface-2 p-3 text-xs text-content-1 placeholder:text-content-3" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="px-4 pb-3 text-[9px] text-content-3">Chat history is temporary and is discarded when you close MINA.</p>
        <p className="px-4 pb-3 text-[9px] text-content-3">Do not enter passwords, codes, account numbers or other private details. Automatic masking is not guaranteed.</p>
      </section>
    </div>
  );
};
