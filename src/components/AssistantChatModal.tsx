import React, { useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, FileText, History, LockKeyhole, Menu, MoreVertical, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import type { Category, FinancialAccount, InvestmentRecord, LoanRecord, SavingsGoal, Transaction } from '../types/finance';
import type { AssistantRuntime } from '../services/assistantRuntime';
import { todayLocalISO } from '../utils/dates';
import { createAssistantReport, type AssistantReport } from '../utils/assistantReport';
import { stringifyAssistantReportCsv } from '../utils/assistantReportCsv';
import { assistantReportInsights, assistantReportPrompt, resolveAssistantReportExplanation } from '../utils/assistantReportExplanation';
import { createAssistantReportPdf } from '../utils/assistantReportPdf';
import { answerAssistantMarketQuestion } from '../utils/assistantMarketResponse';
import { answerAssistantAppQuestion, answerAssistantCredentialQuestion, answerAssistantFinanceDefinition, assistantChatPrompt, isAssistantReportRequest } from '../utils/assistantChat';
import type { MarketSnapshot } from '../utils/marketData';
import { AssistantReportView } from './AssistantReportView';
import {
  consentToMinaChats, deleteMinaChat, deleteMinaChats, loadMinaChats, saveMinaChat, selectMinaChat, startMinaChat,
  type AssistantMessage, type MinaChat, type MinaChatArchive,
} from '../utils/assistantChatHistory';
import { protectAssistantText } from '../utils/assistantPrivacy';
import { advanceCategoryAction, type CategoryAction, type CategoryActionDraft } from '../utils/assistantCategoryActions';
import { answerAssistantCategoryOverview } from '../utils/assistantCategoryOverview';

interface AssistantChatModalProps {
  ownerId: string;
  runtime: AssistantRuntime;
  transactions: Transaction[];
  categories: Category[];
  accounts: FinancialAccount[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  savingsGoals: SavingsGoal[];
  currencyCode: string;
  marketSnapshot: MarketSnapshot | null;
  onApplyCategoryAction?: (action: CategoryAction) => void;
  onClose: () => void;
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
  ownerId,
  runtime, transactions, categories, accounts, investments, loans, savingsGoals, currencyCode,
  marketSnapshot,
  onApplyCategoryAction, onClose,
}) => {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationCloseRef = useRef<HTMLButtonElement>(null);
  const chatOptionsTriggerRef = useRef<HTMLButtonElement>(null);
  const chatOptionsRef = useRef<HTMLDivElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = () => {
    setNavigationOpen(false);
    setConfirmDelete('');
    setOpenChatOptions('');
    navigationTriggerRef.current?.focus();
  };
  const dialogRef = useDialog<HTMLElement>({
    isOpen: true,
    onClose: () => {
      if (openChatOptions) {
        setOpenChatOptions('');
        chatOptionsTriggerRef.current?.focus();
      } else if (navigationOpen) closeNavigation();
      else onClose();
    },
  });
  const [archive, setArchive] = useState<MinaChatArchive | null>(null);
  const [storageBusy, setStorageBusy] = useState(true);
  const [consentChecked, setConsentChecked] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [openChatOptions, setOpenChatOptions] = useState('');
  const chat = archive?.chats.find(item => item.id === archive.activeChatId);
  const messages = chat?.messages || [];
  const [input, setInput] = useState('');
  const [month, setMonth] = useState(todayLocalISO().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportToolsOpen, setReportToolsOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState<CategoryActionDraft | null>(null);
  const [proposedAction, setProposedAction] = useState<CategoryAction | null>(null);
  const [actionPreview, setActionPreview] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const operation = useRef(false);

  useEffect(() => {
    if (navigationOpen) navigationCloseRef.current?.focus();
  }, [navigationOpen]);

  useEffect(() => {
    if (confirmDelete) confirmDeleteRef.current?.focus();
  }, [confirmDelete]);

  useEffect(() => {
    if (openChatOptions) chatOptionsRef.current?.scrollIntoView({ block: 'nearest' });
  }, [openChatOptions]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadMinaChats(ownerId).then(saved => {
      if (!active) return;
      setArchive(saved);
      setMonth(saved.chats.find(item => item.id === saved.activeChatId)?.month || todayLocalISO().slice(0, 7));
    }).catch(() => {
      if (active) setError('Could not read saved MINA chats. Reopen MINA to retry, or clear saved chats on this device.');
    }).finally(() => { if (active) setStorageBusy(false); });
    return () => { active = false; mounted.current = false; };
  }, [ownerId]);

  const storeChat = async (value: MinaChat) => {
    const saved = await saveMinaChat(ownerId, value);
    if (mounted.current) setArchive(saved);
  };

  const navigateChat = async (id?: string) => {
    if (operation.current) return;
    operation.current = true;
    setStorageBusy(true);
    setError('');
    try {
      const saved = id ? await selectMinaChat(ownerId, id)
        : await startMinaChat(ownerId, todayLocalISO().slice(0, 7));
      if (!mounted.current) return;
      setArchive(saved);
      setMonth(saved.chats.find(item => item.id === saved.activeChatId)!.month);
      setInput('');
      setReportToolsOpen(false);
      setActionDraft(null);
      setProposedAction(null);
      setActionPreview('');
      setActionNotice('');
    } catch {
      if (mounted.current) setError('Could not open or save this chat. Check device storage and retry.');
    } finally {
      operation.current = false;
      if (mounted.current) setStorageBusy(false);
    }
  };

  const acceptConsent = async () => {
    if (!consentChecked || operation.current) return;
    operation.current = true;
    setStorageBusy(true);
    setError('');
    try {
      const saved = await consentToMinaChats(ownerId);
      if (mounted.current) setArchive(saved);
    } catch {
      if (mounted.current) setError('Could not save your consent on this device. Chat remains unavailable; please retry.');
    } finally {
      operation.current = false;
      if (mounted.current) setStorageBusy(false);
    }
  };

  const clearChats = async () => {
    if (operation.current) return;
    operation.current = true;
    setStorageBusy(true);
    try {
      await deleteMinaChats(ownerId);
      if (!mounted.current) return;
      setArchive({ version: 1, consented: false, activeChatId: null, chats: [] });
      setConsentChecked(false);
      setConfirmClear(false);
      setConfirmDelete('');
      setOpenChatOptions('');
      setInput('');
      setMonth(todayLocalISO().slice(0, 7));
      setReportToolsOpen(false);
      setActionDraft(null);
      setProposedAction(null);
      setActionPreview('');
      setActionNotice('');
      setNavigationOpen(false);
      setError('');
    } catch {
      if (mounted.current) setError('Could not clear MINA chats on this device. Please retry.');
    } finally {
      operation.current = false;
      if (mounted.current) setStorageBusy(false);
    }
  };

  const deleteChat = async (id: string) => {
    if (operation.current) return;
    operation.current = true;
    setStorageBusy(true);
    setError('');
    try {
      const saved = await deleteMinaChat(ownerId, id);
      if (!mounted.current) return;
      setArchive(saved);
      if (saved.activeChatId !== chat?.id) {
        setInput('');
        setMonth(saved.chats.find(item => item.id === saved.activeChatId)?.month || todayLocalISO().slice(0, 7));
        setReportToolsOpen(false);
        setActionDraft(null);
        setProposedAction(null);
        setActionPreview('');
        setActionNotice('');
      }
      setConfirmDelete('');
      navigationCloseRef.current?.focus();
    } catch {
      if (mounted.current) setError('Could not delete this MINA chat. It may have changed in another window; reopen MINA and retry.');
    } finally {
      operation.current = false;
      if (mounted.current) setStorageBusy(false);
    }
  };

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy]);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [input]);

  const send = async (value: string, reportRequested: boolean) => {
    const prompt = value.trim();
    if (!prompt || prompt.length > 4000 || operation.current || !archive?.consented || storageBusy) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const credentialResponse = answerAssistantCredentialQuestion(prompt);
      const generatedReportRequest = reportRequested && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        && prompt === `Generate a financial report for ${month}.`;
      const safePrompt = credentialResponse ? '[Credential question omitted for safety.]'
        : generatedReportRequest ? prompt : protectAssistantText(prompt);
      const actionStep = !credentialResponse && !reportRequested && !proposedAction
        ? advanceCategoryAction(prompt, actionDraft, categories) : null;
      const previousMessages = chat?.messages || [];
      nextId.current = previousMessages.reduce((max, message) => Math.max(max, message.id), nextId.current);
      const userMessage: AssistantMessage = { id: ++nextId.current, role: 'user', text: safePrompt };
      const conversation = [...previousMessages, userMessage];
      const saved = chat ? await saveMinaChat(ownerId, { ...chat, month, messages: conversation })
        : await startMinaChat(ownerId, month, conversation);
      if (!mounted.current) return;
      setArchive(saved);
      const activeChat = saved.chats.find(item => item.id === saved.activeChatId)!;
      setInput('');
      const reply = async (message: AssistantMessage) => {
        if (mounted.current) await storeChat({ ...activeChat, messages: [...conversation, message] });
      };
      if (credentialResponse) {
        await reply({ id: ++nextId.current, role: 'assistant', text: credentialResponse });
      } else if (proposedAction) {
        await reply({ id: ++nextId.current, role: 'assistant', text: 'Please confirm or cancel the pending action using the buttons below.' });
      } else if (actionStep) {
        await reply({ id: ++nextId.current, role: 'assistant', text: protectAssistantText(actionStep.text)
          + (actionStep.status === 'ready' ? ' This proposal is available only in the current session.' : '') });
        if (mounted.current) {
          setActionDraft(actionStep.status === 'question' ? actionStep.draft : null);
          setProposedAction(actionStep.status === 'ready' ? actionStep.action : null);
          setActionPreview(actionStep.status === 'ready' ? actionStep.text : '');
          setActionNotice('');
        }
      } else if (reportRequested) {
        setActionDraft(null);
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
        } catch {
          explanationError = 'Local AI explanation failed.';
        }
        await reply({
          id: ++nextId.current, role: 'assistant',
          text: `Here is your report for ${month}. The figures below are calculated from your records; any AI summary only selects verified findings.${explanationError ? ` The local AI explanation is unavailable: ${explanationError}` : ''}`,
          report, explanation, currencyCode,
        });
      } else {
        const categoryOverview = answerAssistantCategoryOverview(safePrompt, categories, transactions, todayLocalISO(), currencyCode);
        if (categoryOverview) {
          await reply({ id: ++nextId.current, role: 'assistant', text: categoryOverview, localData: true });
          return;
        }
        const cachedMarketResponse = answerAssistantMarketQuestion(
          safePrompt,
          previousMessages.filter(message => message.role === 'user').map(message => message.text),
          marketSnapshot,
        );
        const unsupportedAction = /^(?:please\s+)?(?:add|create|set|change|update|delete|remove)\b/i.test(prompt)
          ? 'I can prepare category, subcategory and monthly budget changes for confirmation. I cannot perform that request as written. Try a more specific request or use the app controls.' : undefined;
        const response = unsupportedAction || cachedMarketResponse || answerAssistantAppQuestion(safePrompt) || answerAssistantFinanceDefinition(safePrompt)
          || await runtime.generate(assistantChatPrompt(conversation));
        await reply({ id: ++nextId.current, role: 'assistant', text: protectAssistantText(response.trim()) });
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'MINA could not complete or save this response. Check device storage and retry. Any saved messages remain in this chat.');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const confirmCategoryAction = async () => {
    if (!proposedAction || !chat || !onApplyCategoryAction || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      try {
        onApplyCategoryAction(proposedAction);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save this category change. Nothing was changed.');
        return;
      }
      setProposedAction(null);
      setActionPreview('');
      setActionNotice('Saved on this device. Cloud sync is separate.');
      const message: AssistantMessage = { id: ++nextId.current, role: 'assistant', text: 'Saved on this device. Cloud sync is separate.' };
      try {
        await storeChat({ ...chat, messages: [...chat.messages, message] });
      } catch {
        if (mounted.current) setError('The category change was saved on this device, but its chat confirmation could not be saved.');
      }
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const requested = isAssistantReportRequest(input);
    void send(input, requested);
  };

  const exportCsv = (report: AssistantReport, explanation: string, reportCurrency: string) => {
    try {
      const csv = stringifyAssistantReportCsv(report, reportCurrency, explanation);
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `MINARTH_Report_${report.month}.csv`);
    } catch {
      setError('Could not export this report as CSV.');
    }
  };

  const exportPdf = async (report: AssistantReport, explanation: string, reportCurrency: string) => {
    try {
      const blob = await createAssistantReportPdf(report, reportCurrency, explanation);
      downloadBlob(blob, `MINARTH_Report_${report.month}.pdf`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not export this report as PDF.');
    }
  };

  if (!archive?.consented) return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-4 backdrop-blur-md">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mina-consent-title" tabIndex={-1}
        className="mina-chat max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-line bg-surface-1 p-5 text-content-1">
        <h2 id="mina-consent-title" className="text-lg font-bold">MINA privacy &amp; security consent</h2>
        {storageBusy ? <p role="status">Opening device-local chats...</p> : <>
          <p className="text-sm">Before chatting, please confirm that MINA may save your messages, generated financial reports and report commentary on this device.</p>
          <ul className="list-disc space-y-2 pl-5 text-xs text-content-2">
            <li>Only the last 5 chats are retained. Starting a sixth permanently deletes the oldest chat, including its reports.</li>
            <li>Closing MINA restores the last-open chat next time. Chats remain after sign-out and are shown only when the same app account signs in and unlocks the app.</li>
            <li>Chats and reports are not sent to Supabase, analytics or an external AI service, and are not included in app backup exports. Financial records and applied categories still sync normally.</li>
            <li>Saved reports contain financial information and are snapshots, not live balances. Device/browser storage is not a separately encrypted vault; someone with access to your device or browser data may read it.</li>
            <li>Do not enter passwords, OTPs, full account/card numbers or other private details. Automatic masking is not guaranteed. You can clear saved chats and withdraw consent here.</li>
          </ul>
          {archive && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consentChecked}
            onChange={event => setConsentChecked(event.target.checked)} className="mt-1" />
            I consent to device-local storage of my last 5 chats, including generated reports and commentary.</label>}
          {archive && <button type="button" onClick={() => void acceptConsent()} disabled={!consentChecked}
            className="mina-primary min-h-11 rounded-xl px-4 text-sm text-white disabled:opacity-40">Agree and continue</button>}
        </>}
        {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!archive && !storageBusy && <button type="button" onClick={() => setConfirmClear(true)} className="block text-xs underline">Clear unreadable saved chats</button>}
        {confirmClear && <button type="button" disabled={storageBusy} onClick={() => void clearChats()} className="block text-xs text-red-600">Confirm permanently clear chats</button>}
        <button type="button" onClick={onClose} className="block min-h-11 text-sm underline">Close MINA</button>
      </section>
    </div>
  );

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-backdrop/80 p-2 backdrop-blur-md sm:p-4">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="assistant-title" tabIndex={-1}
        className="mina-chat relative flex h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface-1 text-content-1 shadow-2xl outline-none">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={navigationTriggerRef} type="button" aria-label="Open MINA navigation"
              aria-expanded={navigationOpen} aria-controls="mina-navigation"
              onClick={() => setNavigationOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-content-2 hover:bg-surface-2">
              <Menu className="h-5 w-5" />
            </button>
            <span className="mina-avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"><Brain className="h-6 w-6" /></span>
            <div><h2 id="assistant-title" className="text-base font-bold tracking-wide">MINA</h2>
              <p className="flex items-center gap-1.5 text-xs text-content-2"><LockKeyhole className="h-3 w-3" /> Your on-device assistant</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close MINA" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-content-2 hover:bg-surface-2"><X className="h-5 w-5" /></button>
        </header>
        {navigationOpen && <div className="absolute inset-0 z-10">
          <button type="button" aria-label="Close MINA navigation backdrop" onClick={closeNavigation}
            className="absolute inset-0 h-full w-full bg-black/50" tabIndex={-1} />
          <nav id="mina-navigation" aria-label="MINA navigation"
            onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
              if (event.key !== 'Tab') return;
              const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled])',
              )].filter(element => element.offsetParent !== null);
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            className="mina-navigation relative flex h-full w-[min(85%,300px)] flex-col overflow-y-auto overscroll-contain border-r border-line p-4 text-sm shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h3 className="text-base font-bold">Your MINA</h3>
                <p className="text-xs text-content-3">Chats and reports</p></div>
              <button ref={navigationCloseRef} type="button" onClick={closeNavigation} aria-label="Close MINA navigation"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-content-2 hover:bg-surface-2"><X className="h-5 w-5" /></button>
            </div>
          <button type="button" disabled={busy || storageBusy} onClick={() => { closeNavigation(); void navigateChat(); }}
            className="mina-primary flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 font-semibold text-white disabled:opacity-40">
            <Plus className="h-4 w-4" />New chat
          </button>
          <div className="mt-4 border-b border-line pb-4">
          <button type="button" aria-expanded={reportToolsOpen} aria-controls="mina-report-tools"
            onClick={() => setReportToolsOpen(previous => !previous)}
            className="mina-nav-item flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left font-semibold text-content-1">
            <FileText className="mina-accent h-4 w-4" />
            Monthly report
            <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${reportToolsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div id="mina-report-tools" hidden={!reportToolsOpen} className="px-1 pt-2">
            <label className="block text-xs text-content-2">Report month
              <input type="month" value={month} onChange={event => setMonth(event.target.value)}
                className="mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-sm text-content-1" />
            </label>
            <button type="button" disabled={busy || storageBusy || !/^\d{4}-\d{2}$/.test(month)}
              onClick={() => { closeNavigation(); setReportToolsOpen(false); void send(`Generate a financial report for ${month}.`, true); }}
              className="mina-primary mt-2 min-h-11 w-full rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50">
              Generate report
            </button>
            <p className="mt-2 text-[10px] leading-relaxed text-content-3">Reports run only when you request one. Exported files are under your control.</p>
          </div>
          </div>
          <div className="min-h-0 flex-1 pt-4">
            <h4 className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold text-content-2">
              <History className="mina-accent h-4 w-4" /> Previous chats <span className="ml-auto text-content-3">{archive.chats.length}/5</span>
            </h4>
            {archive.chats.length === 0 && <p className="px-2 py-3 text-xs leading-relaxed text-content-3">Your saved chats will appear here.</p>}
            <ul className="space-y-1">
              {archive.chats.map(item => <li key={item.id} className="relative">
                <div className="flex items-center gap-1">
                <button type="button" disabled={busy || storageBusy}
                aria-current={item.id === chat?.id ? 'page' : undefined} onClick={() => { closeNavigation(); void navigateChat(item.id); }}
                className="mina-nav-item min-h-11 min-w-0 flex-1 rounded-xl px-3 py-2 text-left disabled:opacity-40">
                <span className="block truncate">{item.messages.find(message => message.role === 'user')?.text.slice(0, 60) || 'New chat'}</span>
                <span className="text-[10px] text-content-3">{new Date(item.createdAt).toLocaleString()}</span>
                </button>
                <button type="button" disabled={busy || storageBusy}
                  aria-label={`Chat options: ${item.messages.find(message => message.role === 'user')?.text.slice(0, 60) || 'New chat'}`}
                  aria-expanded={openChatOptions === item.id}
                  aria-controls={`mina-chat-options-${item.id}`}
                  onClick={event => {
                    chatOptionsTriggerRef.current = event.currentTarget;
                    setOpenChatOptions(previous => previous === item.id ? '' : item.id);
                    setConfirmDelete('');
                    setConfirmClear(false);
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-content-3 hover:bg-surface-2 disabled:opacity-40">
                  <MoreVertical className="h-5 w-5" aria-hidden="true" />
                </button>
                </div>
                {openChatOptions === item.id && <div ref={chatOptionsRef} id={`mina-chat-options-${item.id}`} className="absolute bottom-full right-1 z-20 mb-1 w-max rounded-xl border border-line bg-surface-1 p-1 shadow-xl">
                  <button type="button" disabled={busy || storageBusy}
                    onClick={() => { setOpenChatOptions(''); setConfirmDelete(item.id); }}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-red-600 hover:bg-surface-2 disabled:opacity-40 dark:text-red-400">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />Delete chat
                  </button>
                </div>}
                {confirmDelete === item.id && <div role="group" aria-label="Confirm deleting chat" className="mt-1 rounded-xl border border-line p-3 text-xs">
                  <p>Permanently delete this chat and its saved reports?</p>
                  <div className="flex flex-wrap gap-3">
                    <button ref={confirmDeleteRef} type="button" disabled={busy || storageBusy} onClick={() => void deleteChat(item.id)} className="min-h-11 text-red-600 underline disabled:opacity-40">Delete chat</button>
                    <button type="button" disabled={storageBusy} onClick={() => { setConfirmDelete(''); chatOptionsTriggerRef.current?.focus(); }} className="min-h-11 underline">Cancel</button>
                  </div>
                </div>}
              </li>)}
            </ul>
          </div>
          <div className="mt-4 border-t border-line pt-3">
          {error && <p role="alert" className="px-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button type="button" disabled={busy || storageBusy} onClick={() => { setOpenChatOptions(''); setConfirmDelete(''); setConfirmClear(previous => !previous); }}
            className="min-h-11 px-2 text-xs text-content-2 underline disabled:opacity-40">Clear chats</button>
          {confirmClear && <div role="group" aria-label="Confirm clearing MINA chats" className="space-y-1 rounded-xl border border-line p-3 text-xs">
            <p>Permanently delete all saved chats and withdraw consent?</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busy || storageBusy} onClick={() => void clearChats()} className="min-h-11 text-red-600 underline">Delete all chats</button>
              <button type="button" onClick={() => setConfirmClear(false)} className="min-h-11 underline">Cancel</button>
            </div>
          </div>}
          </div>
        </nav>
        </div>}
        <div className="flex min-h-0 flex-1 flex-col" inert={navigationOpen || undefined}>
        <div className="mina-conversation min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          {messages.length === 0 && (
            <div className="mx-auto flex max-w-sm flex-col items-center py-4 text-center sm:py-8">
              <span className="mina-avatar mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"><Sparkles className="h-7 w-7" /></span>
              <h3 className="text-xl font-semibold tracking-tight">What can I help you with?</h3>
              <p className="mt-2 text-sm leading-relaxed text-content-2">Ask a finance question, find your way around MINARTH, or explore a monthly report.</p>
              <div className="mt-5 grid w-full gap-2 text-left">
                {['What is a budget?', 'Where can I manage my categories?', 'What does savings rate mean?'].map(prompt => (
                  <button key={prompt} type="button" disabled={busy} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="mina-suggestion min-h-11 rounded-2xl border border-line px-4 py-3 text-left text-xs leading-relaxed text-content-2">
                    {prompt}<span aria-hidden="true" className="mina-accent float-right ml-2">↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div role="log" aria-label="Conversation with MINA" aria-live="polite" aria-relevant="additions text" className="space-y-5">
          {messages.map(message => (
            <article key={message.id} aria-label={message.role === 'user' ? 'You' : 'MINA'}
              className={message.role === 'user' ? 'ml-auto w-fit min-w-0 max-w-[88%]' : 'min-w-0 max-w-full'}>
              <div className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-content-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
                {message.role === 'assistant' && <Brain className="mina-accent h-3.5 w-3.5" />}
                {message.role === 'user' ? 'You' : 'MINA'}
              </div>
              {message.text && <p className={message.role === 'user'
                ? 'mina-primary whitespace-pre-wrap break-words rounded-2xl rounded-tr-md px-4 py-3 text-sm leading-relaxed text-white [overflow-wrap:anywhere]'
                : 'mina-reply whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-line px-4 py-3 text-sm leading-relaxed text-content-1 [overflow-wrap:anywhere]'}>{message.text}</p>}
              {message.report && <div className="mt-3 min-w-0 overflow-x-auto"><AssistantReportView report={message.report} currencyCode={message.currencyCode || currencyCode}
                explanation={message.explanation || ''}
                onExportCsv={() => exportCsv(message.report!, message.explanation || '', message.currencyCode || currencyCode)}
                onExportPdf={() => void exportPdf(message.report!, message.explanation || '', message.currencyCode || currencyCode)} /></div>}
            </article>
          ))}
          </div>
          {proposedAction && <div role="group" aria-label="Confirm MINA category change" className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-xs">
            <p>{actionPreview}</p>
            <div className="mt-2 flex gap-3">
              <button type="button" disabled={busy || storageBusy || !onApplyCategoryAction} onClick={() => void confirmCategoryAction()}
                className="mina-primary min-h-11 rounded-xl px-4 font-bold text-white disabled:opacity-40">Confirm change</button>
              <button type="button" disabled={busy || storageBusy} onClick={() => { setProposedAction(null); setActionPreview(''); setActionNotice('Cancelled. Nothing was changed.'); }}
                className="min-h-11 rounded-xl border border-line px-4">Cancel</button>
            </div>
          </div>}
          {actionNotice && <p role="status" className="mt-3 text-xs text-content-2">{actionNotice}</p>}
          {busy && <div role="status" className="mt-4 flex items-center gap-2 text-xs text-content-2">
            <span className="mina-avatar flex h-8 w-8 items-center justify-center rounded-xl"><Brain className="h-4 w-4 motion-safe:animate-pulse" /></span>
            MINA is thinking<span aria-hidden="true">…</span><span className="sr-only"> Running locally…</span>
          </div>}
          <div ref={endRef} />
        </div>
        {error && <p role="alert" className="border-t border-line px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <footer className="shrink-0 border-t border-line px-3 pb-3 pt-3 sm:px-5 sm:pb-4">
        <form onSubmit={submit} className="mina-composer flex items-end gap-2 rounded-2xl border border-line p-1.5">
          <label className="sr-only" htmlFor="assistant-message">Message MINA</label>
          <textarea ref={inputRef} id="assistant-message" value={input} maxLength={4000} rows={1} disabled={busy || storageBusy}
            onChange={event => setInput(event.target.value)} placeholder="Message MINA…"
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (input.trim() && !busy) event.currentTarget.form?.requestSubmit();
              }
            }}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-base leading-5 text-content-1 outline-none placeholder:text-content-3 sm:text-sm" />
          <button type="submit" disabled={busy || storageBusy || !input.trim()} aria-label="Send message"
            className="mina-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
        <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[10px] text-content-3">
          <span className="flex items-center gap-1"><LockKeyhole className="h-3 w-3" /> Last 5 chats saved on this device</span>
          <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
        </div>
        <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-content-3">Do not share passwords, codes or private account details.</p>
        <details className="mina-privacy mt-1 px-1 text-[10px] leading-relaxed text-content-3">
          <summary tabIndex={0} className="w-fit cursor-pointer py-1">Privacy &amp; how MINA works</summary>
          <div className="max-h-24 space-y-2 overflow-y-auto py-2">
            <p>With your consent, messages, generated reports and commentary stay on this device in your last 5 chats, including after sign-out. The oldest chat is deleted when a sixth starts. Clear chats to delete them and withdraw consent. Saved reports are snapshots from their displayed dates, not current balances.</p>
            <p>Financial figures are calculated by MINARTH; AI only selects verified findings. For metal rates, MINA uses only saved market data and shows its source/date; it cannot check live internet prices. The app still needs internet for its existing cloud sync and other online features.</p>
            <p>Do not enter passwords, codes, account numbers or other private details. Automatic masking is not guaranteed.</p>
          </div>
        </details>
        </footer>
        </div>
      </section>
    </div>
  );
};
