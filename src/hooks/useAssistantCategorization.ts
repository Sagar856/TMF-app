import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Category, Transaction } from '../types/finance';
import type { AssistantRuntime } from '../services/assistantRuntime';
import {
  fetchTransactionsFromSupabase,
  isCloudBackendConfigured,
  syncTransactionsToSupabase,
} from '../services/supabaseClient';
import { safeGetJson } from '../utils/storage';
import { notificationCategoryConfirmation } from '../utils/notificationCategoryFeedback';
import { formatMoney, type FormatMoneyOptions } from '../utils/money';
import { matchNotificationCategoryText } from '../utils/paymentTransaction';
import { CATEGORY_JOBS_CHANGED, readCategoryJobs, writeCategoryJob, finishCategoryJob, type NotificationCategoryJob } from '../utils/notificationCategoryJobs';
import { syncCategoryReviewNotification } from '../services/notificationListener';
import {
  assistantCategoryPrompt,
  evaluateAssistantCategory,
  parseAssistantCategoryProposal,
  resolveAssistantCategoryProposal,
  type AssistantCategoryReview,
  type CategoryOrigin,
} from '../utils/assistantCategory';

interface AssistantCategorizationOptions {
  runtime: AssistantRuntime;
  enabled: boolean;
  installed: boolean;
  supported: boolean;
  canProcess: boolean;
  owner: string | undefined;
  financialEpoch?: number;
  transactions: Transaction[];
  categories: Category[];
  cloudReady: boolean;
  cloudHydrated: boolean;
  setTransactions: Dispatch<SetStateAction<Transaction[]>>;
  notify: (message: string, type: 'success' | 'warning' | 'error') => void;
  moneyOptions?: FormatMoneyOptions;
}

interface SmartRule {
  keyword: string;
  category: string;
  subcategory: string;
}

function isSmartRule(value: unknown): value is SmartRule {
  return typeof value === 'object' && value !== null
    && 'keyword' in value && typeof value.keyword === 'string'
    && 'category' in value && typeof value.category === 'string'
    && 'subcategory' in value && typeof value.subcategory === 'string';
}

function matchingRule(transaction: Transaction): SmartRule | undefined {
  const rules = safeGetJson<unknown>('tmf_smart_rules', []);
  if (!Array.isArray(rules)) return undefined;
  const text = `${transaction.title} ${transaction.payeeOrPayer || ''} ${transaction.note || ''}`.toLowerCase();
  return rules.find((value): value is SmartRule => isSmartRule(value)
    && Boolean(value.keyword.trim()) && text.includes(value.keyword.trim().toLowerCase()));
}

export function useAssistantCategorization(options: AssistantCategorizationOptions) {
  const {
    runtime, enabled, installed, supported, canProcess, owner, transactions, categories, cloudReady, cloudHydrated, setTransactions,
  } = options;
  const [reviews, setReviews] = useState<AssistantCategoryReview[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [jobs, setJobs] = useState<NotificationCategoryJob[]>([]);
  const notificationStates = useRef(new Set<string>());
  const processing = useRef(new Set<string>());
  const transactionsRef = useRef(transactions);
  const categoriesRef = useRef(categories);
  const notifyRef = useRef(options.notify);
  const moneyOptionsRef = useRef(options.moneyOptions);
  const confirmations = useRef(new Map<string, { category: string; subcategory: string; amount: number }>());
  const reviewsOwner = useRef(owner);
  const modelState = `${enabled}:${installed}:${supported}:${options.financialEpoch}`;
  const context = useRef({ owner, canProcess, modelState, generation: 0 });
  if (context.current.owner !== owner || context.current.canProcess !== canProcess || context.current.modelState !== modelState) {
    context.current = { owner, canProcess, modelState, generation: context.current.generation + 1 };
  }
  transactionsRef.current = transactions;
  categoriesRef.current = categories;
  notifyRef.current = options.notify;
  moneyOptionsRef.current = options.moneyOptions;

  useEffect(() => {
    const reload = () => setJobs(owner && canProcess ? readCategoryJobs(owner) : []);
    reload();
    window.addEventListener(CATEGORY_JOBS_CHANGED, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(CATEGORY_JOBS_CHANGED, reload);
      window.removeEventListener('storage', reload);
    };
  }, [owner, canProcess]);

  const finishJob = useCallback((id: string) => {
    const currentOwner = context.current.owner;
    const job = currentOwner && readCategoryJobs(currentOwner).find(item => item.before.id === id);
    if (job && job.status !== 'done') finishCategoryJob(job);
  }, []);

  useEffect(() => {
    reviewsOwner.current = owner;
    confirmations.current.clear();
    setReviews([]);
  }, [owner]);

  useEffect(() => {
    processing.current.clear();
    if (!canProcess) confirmations.current.clear();
  }, [owner, canProcess]);

  useEffect(() => {
    for (const [id, expected] of confirmations.current) {
      const saved = transactions.find(transaction => transaction.id === id);
      if (saved?.categoryOrigin === 'assistant' && saved.category === expected.category
        && saved.subcategory === expected.subcategory && saved.amount === expected.amount) {
        notifyRef.current(notificationCategoryConfirmation(saved, moneyOptionsRef.current), 'success');
        finishJob(id);
      }
      confirmations.current.delete(id);
    }
  }, [transactions, finishJob]);

  useEffect(() => {
    if (!canProcess || !owner) return;
    for (const job of jobs) {
      const state = `${owner}:${job.before.id}:${job.status === 'done'}`;
      if (notificationStates.current.has(state)) continue;
      notificationStates.current.add(state);
      void syncCategoryReviewNotification(owner, job.before.id, job.status === 'done',
        `Saved transaction: ${formatMoney(job.before.amount, moneyOptionsRef.current)}`).then(displayed => {
        if (!displayed && context.current.owner === owner && context.current.canProcess) {
          notifyRef.current('A saved transaction needs a category. Android notifications are unavailable; open Pending review in the notification bell.', 'warning');
        }
      }).catch(() => {
        notificationStates.current.delete(state);
        if (context.current.owner === owner && context.current.canProcess) {
          notifyRef.current('Could not update the Android category notification. The saved transaction remains in Pending review.', 'error');
        }
      });
    }
  }, [canProcess, owner, jobs]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const appendReview = useCallback((review: AssistantCategoryReview) => {
    const currentOwner = context.current.owner;
    const job = currentOwner && readCategoryJobs(currentOwner).find(item => item.before.id === review.transactionId);
    if (job && job.status !== 'done') writeCategoryJob({ ...job, status: 'review', review: { ...review, postSave: true } });
    setReviews(previous => previous.some(item => item.transactionId === review.transactionId)
      ? previous.map(item => item.transactionId === review.transactionId ? review : item)
      : [...previous, review]);
  }, []);

  const persistProposal = useCallback(async (
    before: Transaction,
    categoryId: string,
    categoryName: string,
    subcategory: string,
    origin: CategoryOrigin,
    explicitlySelected: boolean,
    rule?: { category: string; subcategory: string },
  ) => {
    const requestContext = context.current;
    const isCurrent = () => context.current === requestContext && context.current.canProcess;
    if (!isCurrent()) return;
    if (navigator.onLine === false) {
      processing.current.delete(before.id);
      notifyRef.current('Connect to the internet to change transaction categories.', 'warning');
      return;
    }
    const category = categoriesRef.current.find(item => item.id === categoryId
      && item.name === categoryName && item.subcategories.includes(subcategory));
    if (!category) {
      notifyRef.current('The proposed category is no longer available. Nothing was changed.', 'warning');
      return;
    }

    const proposal = { categoryId, subcategory, uncertain: false };
    const current = transactionsRef.current.find(item => item.id === before.id);
    const checked = evaluateAssistantCategory({
      before, current, categories: categoriesRef.current, origin, explicitlySelected, rule, output: proposal,
    });
    if (checked.status === 'skip') {
      notifyRef.current('This transaction changed while its category was being reviewed. Nothing was changed.', 'warning');
      return;
    }
    const candidate: Transaction = {
      ...(checked.status === 'apply' ? checked.transaction : current!),
      category: categoryName,
      subcategory,
      categoryOrigin: 'assistant',
    };

    let revision: number | undefined;
    if (isCloudBackendConfigured()) {
      if (!cloudReady || !cloudHydrated) {
        processing.current.delete(before.id);
        notifyRef.current('Wait for cloud transaction sync to finish before applying a category.', 'warning');
        return;
      }
      if (!requestContext.owner) {
        notifyRef.current('Sign in before applying a category.', 'warning');
        return;
      }
      const result = await syncTransactionsToSupabase([candidate], requestContext.owner);
      if (!isCurrent()) return;
      if (result.success) {
        revision = result.transactionRevisions?.[candidate.id];
        if (!revision) {
          processing.current.delete(before.id);
          notifyRef.current('The cloud did not confirm the category update. Nothing was changed.', 'error');
          return;
        }
      } else if (result.conflict) {
        appendReview({
          transactionId: before.id, before, categoryId, category: categoryName, subcategory,
          reason: result.error || 'The transaction changed on another device.',
          cloudConflict: true,
        });
        notifyRef.current(`Category suggestion for "${before.title}" needs review because the cloud transaction changed.`, 'warning');
        return;
      } else {
        processing.current.delete(before.id);
        notifyRef.current(result.error || 'The category could not be synced. Nothing was changed.', 'error');
        return;
      }
    }

    confirmations.current.set(before.id, { category: categoryName, subcategory, amount: before.amount });
    setTransactions(previous => previous.map(item => {
      if (!isCurrent()) return item;
      if (item.id !== before.id) return item;
      const latest = evaluateAssistantCategory({
        before, current: item, categories: categoriesRef.current, origin, explicitlySelected, rule, output: proposal,
      });
      if (latest.status === 'apply' || (explicitlySelected && latest.status === 'review')) {
        return {
          ...item,
          category: categoryName,
          subcategory,
          categoryOrigin: 'assistant',
          ...(revision ? { syncRevision: revision } : {}),
        };
      }
      return revision ? { ...item, syncRevision: revision } : item;
    }));
    setReviews(previous => previous.filter(item => item.transactionId !== before.id));
  }, [appendReview, cloudHydrated, cloudReady, setTransactions]);

  const processTransaction = useCallback(async (transaction: Transaction, explicitlySelected = false, job?: NotificationCategoryJob) => {
    if (context.current.modelState !== `${enabled}:${installed}:${supported}:${options.financialEpoch}`) return;
    if (!enabled || !installed || !supported || !canProcess || navigator.onLine === false || processing.current.has(transaction.id)) return;
    if (isCloudBackendConfigured() && (!cloudReady || !cloudHydrated)) return;
    if (isCloudBackendConfigured() && transaction.syncRevision === undefined) return;
    const requestContext = context.current;
    const isCurrent = () => context.current === requestContext && context.current.canProcess
      && (!job || readCategoryJobs(job.owner).some(item => item.before.id === transaction.id && item.status !== 'done'));
    processing.current.add(transaction.id);
    const origin = transaction.categoryOrigin || 'unknown';
    const rule = matchingRule(transaction)
      || (!job && origin === 'rule' ? { category: transaction.category, subcategory: transaction.subcategory } : undefined);
    try {
      const categoriesAtRequest = categoriesRef.current;
      const text = job ? job.text : transaction.title;
      const localMatch = matchNotificationCategoryText(text, transaction.type, categoriesAtRequest);
      let output = localMatch.status === 'match'
        ? { categoryId: localMatch.category.id, subcategory: localMatch.subcategory, uncertain: false }
        : resolveAssistantCategoryProposal(
        parseAssistantCategoryProposal(await runtime.generate(
          assistantCategoryPrompt({ ...transaction, title: text }, categoriesAtRequest), 'background',
        )),
        transaction,
        categoriesAtRequest,
      );
      if (!isCurrent()) return;
      if (localMatch.status === 'ambiguous' && typeof output === 'object' && output !== null) {
        output = { ...output, uncertain: true };
      }
      const result = evaluateAssistantCategory({
        before: transaction,
        current: transactionsRef.current.find(item => item.id === transaction.id),
        categories: categoriesRef.current,
        origin,
        explicitlySelected,
        rule,
        output,
      });
      if (result.status === 'apply') {
        if (job) appendReview({
          transactionId: transaction.id, before: transaction,
          categoryId: categoriesRef.current.find(category => category.name === result.transaction.category)?.id || '',
          category: result.transaction.category, subcategory: result.transaction.subcategory,
          reason: 'Category update awaiting confirmation. Retry Save if the previous update was interrupted.',
        });
        if (typeof output === 'object' && output !== null && 'categoryId' in output && typeof output.categoryId === 'string') {
          const category = categoriesRef.current.find(item => item.name === result.transaction.category
            && item.subcategories.includes(result.transaction.subcategory));
          if (category) await persistProposal(
            transaction, output.categoryId, category.name, result.transaction.subcategory,
            origin, explicitlySelected, rule,
          );
        }
      } else if (result.status === 'review' && typeof output === 'object' && output !== null
        && 'categoryId' in output && typeof output.categoryId === 'string') {
        appendReview({
          transactionId: transaction.id, before: transaction, categoryId: output.categoryId,
          category: result.category, subcategory: result.subcategory, reason: result.reason,
        });
        notifyRef.current(`Category suggestion for "${transaction.title}" needs your review.`, 'warning');
      } else if (result.status === 'skip' && result.reason === 'The category is unchanged.') {
        if (job) finishJob(transaction.id);
      } else if (result.status === 'skip' && /invalid category|unavailable category/i.test(result.reason)) {
        appendReview({
          transactionId: transaction.id, before: transaction, categoryId: '', category: transaction.category,
          subcategory: transaction.subcategory, manualOnly: true,
          reason: 'MINA did not select a valid category. The transaction is unchanged; view it to edit its category, or keep the current one.',
        });
        notifyRef.current(`MINA could not match "${transaction.title}". Review it in notifications or keep its current category.`, 'warning');
      } else if (job && result.status === 'skip') {
        appendReview({ transactionId: transaction.id, before: transaction, categoryId: '', category: transaction.category,
          subcategory: transaction.subcategory, manualOnly: true, reason: result.reason });
      }
    } catch (error) {
      if (!isCurrent()) return;
      appendReview({
        transactionId: transaction.id, before: transaction, categoryId: '', category: transaction.category,
        subcategory: transaction.subcategory, manualOnly: true,
        reason: 'Local categorisation failed. The transaction is unchanged; view it to edit its category, or keep the current one.',
      });
      notifyRef.current(
        `Could not categorize "${transaction.title}" locally: ${error instanceof Error ? error.message : 'Please retry.'}`,
        'error',
      );
    }
  }, [appendReview, canProcess, cloudHydrated, cloudReady, enabled, installed, persistProposal, runtime, supported, finishJob, options.financialEpoch]);

  useEffect(() => {
    if (!canProcess || !owner || !online || (isCloudBackendConfigured() && (!cloudReady || !cloudHydrated))) return;
    const currentTransactions = new Map(transactions.map(transaction => [transaction.id, transaction]));
    for (const job of jobs) {
      const current = currentTransactions.get(job.before.id);
      if (job.status === 'done') continue;
      if (!current) {
        if (job.before.syncRevision !== undefined) finishJob(job.before.id);
        continue;
      }
      if (isCloudBackendConfigured() && !current.syncRevision) continue;
      if (job.review && current.categoryOrigin === 'assistant'
        && current.category === job.review.category && current.subcategory === job.review.subcategory) {
        const category = categories.find(item => item.name === current.category && item.subcategories.includes(current.subcategory));
        if (category) {
          const expected = { ...job.before, category: current.category, subcategory: current.subcategory,
            categoryOrigin: current.categoryOrigin, syncRevision: current.syncRevision };
          const recovered = evaluateAssistantCategory({ before: expected, current, categories, origin: 'assistant',
            explicitlySelected: true, output: { categoryId: category.id, subcategory: current.subcategory, uncertain: false } });
          if (recovered.status === 'skip' && recovered.reason === 'The category is unchanged.') {
            finishJob(current.id);
            continue;
          }
        }
      }
      if (job.status !== 'pending') continue;
      const before = { ...job.before, syncRevision: job.before.syncRevision ?? current.syncRevision };
      const check = evaluateAssistantCategory({
        before, current, categories, origin: before.categoryOrigin || 'eligible',
        explicitlySelected: false, output: undefined,
      });
      if (check.status === 'skip' && /changed|protected|unknown origin/.test(check.reason)) {
        appendReview({ transactionId: before.id, before, categoryId: '', category: before.category,
          subcategory: before.subcategory, manualOnly: true, cloudConflict: true,
          reason: 'This saved transaction changed. View the current transaction; automatic categorisation was not applied.' });
        continue;
      }
      if (!enabled || !installed || !supported || !job.text) continue;
      if (processing.current.has(before.id)) continue;
      if (!navigator.locks) {
        appendReview({ transactionId: before.id, before, categoryId: '', category: before.category,
          subcategory: before.subcategory, manualOnly: true, reason: 'Safe local processing is unavailable. Select a category manually.' });
        continue;
      }
      void navigator.locks.request(`minarth-category-${owner}-${before.id}`, async () => {
        if (context.current.owner !== owner || !context.current.canProcess
          || processing.current.has(before.id)
          || readCategoryJobs(owner).find(item => item.before.id === before.id)?.status !== 'pending') return;
        if (job.before.syncRevision !== before.syncRevision) writeCategoryJob({ ...job, before });
        await processTransaction(before, false, job);
      }).catch(() => notifyRef.current('Could not process the saved category request. It remains in Pending review.', 'error'));
    }
  }, [jobs, transactions, categories, canProcess, owner, online, enabled, installed, supported, cloudReady, cloudHydrated, appendReview, processTransaction, finishJob]);

  useEffect(() => {
    if (!enabled || !installed || !supported || !canProcess || !online) return;
    if (isCloudBackendConfigured() && (!cloudReady || !cloudHydrated)) return;
    const jobIds = new Set(owner ? readCategoryJobs(owner).map(job => job.before.id) : []);
    transactions
      .filter(transaction => !jobIds.has(transaction.id)
        && (transaction.categoryOrigin === 'eligible'
        || transaction.categoryOrigin === 'imported' || transaction.categoryOrigin === 'rule'))
      .forEach(transaction => { void processTransaction(transaction); });
  }, [canProcess, cloudHydrated, cloudReady, enabled, installed, online, processTransaction, supported, transactions, jobs, owner]);

  const categorizeExisting = useCallback(() => {
    const currentOwner = context.current.owner;
    const jobIds = new Set(currentOwner ? readCategoryJobs(currentOwner).map(job => job.before.id) : []);
    transactionsRef.current
      .filter(transaction => !jobIds.has(transaction.id) && (!transaction.categoryOrigin || transaction.categoryOrigin === 'unknown')
        && transaction.category.toLowerCase() === 'uncategorized')
      .forEach(transaction => { void processTransaction(transaction, true); });
  }, [processTransaction]);

  const approveReview = useCallback(async (review: AssistantCategoryReview) => {
    if (review.manualOnly) return;
    const before = review.before.syncRevision === undefined
      ? { ...review.before, syncRevision: transactionsRef.current.find(item => item.id === review.transactionId)?.syncRevision }
      : review.before;
    const currentOwner = context.current.owner;
    const job = currentOwner && readCategoryJobs(currentOwner).find(item => item.before.id === review.transactionId);
    const apply = async () => {
      if (job) {
        if (context.current.owner !== currentOwner || !context.current.canProcess
          || readCategoryJobs(job.owner).find(item => item.before.id === before.id)?.status === 'done') return;
        writeCategoryJob({ ...job, before, review: { ...review, before }, status: 'review' });
      }
      await persistProposal(
        before, review.categoryId, review.category, review.subcategory,
        before.categoryOrigin || 'unknown', true,
      );
    };
    if (job) {
      if (!navigator.locks) throw new Error('Update your browser or Android System WebView to save category reviews safely.');
      await navigator.locks.request(`minarth-category-${job.owner}-${before.id}`, apply);
    } else await apply();
  }, [persistProposal]);

  const dismissReview = useCallback(async (review: AssistantCategoryReview) => {
    if (navigator.onLine === false) {
      notifyRef.current('Connect to the internet to change transaction categories.', 'warning');
      return;
    }
    if (!context.current.canProcess) return;
    const jobOwner = context.current.owner;
    if (jobOwner && readCategoryJobs(jobOwner).some(job => job.before.id === review.transactionId)) {
      if (!navigator.locks) {
        notifyRef.current('Update your browser or Android System WebView to dismiss category reviews safely.', 'warning');
        return;
      }
      await navigator.locks.request(`minarth-category-${jobOwner}-${review.transactionId}`, async () => {
        if (context.current.owner !== jobOwner || !context.current.canProcess) return;
        finishJob(review.transactionId);
        setReviews(previous => previous.filter(item => item.transactionId !== review.transactionId));
      });
      return;
    }
    finishJob(review.transactionId);
    setTransactions(previous => previous.map(transaction => transaction.id === review.transactionId
      ? { ...transaction, categoryOrigin: 'user-edited' }
      : transaction));
    setReviews(previous => previous.filter(item => item.transactionId !== review.transactionId));
  }, [setTransactions, finishJob]);

  const reloadConflict = useCallback(async (review: AssistantCategoryReview) => {
    const requestContext = context.current;
    const cloudTransactions = await fetchTransactionsFromSupabase();
    if (context.current !== requestContext || !context.current.canProcess) return;
    const cloudTransaction = cloudTransactions?.find(transaction => transaction.id === review.transactionId);
    if (!cloudTransaction) {
      notifyRef.current('The cloud version could not be loaded. The local transaction was not changed.', 'error');
      return;
    }
    setTransactions(previous => previous.map(transaction =>
      transaction.id === review.transactionId ? cloudTransaction : transaction));
    setReviews(previous => previous.filter(item => item.transactionId !== review.transactionId));
    finishJob(review.transactionId);
    notifyRef.current(`Reloaded "${cloudTransaction.title}" from the cloud. The local category suggestion was discarded.`, 'success');
  }, [setTransactions, finishJob]);

  const existingUncategorizedCount = transactions.filter(transaction =>
    (!transaction.categoryOrigin || transaction.categoryOrigin === 'unknown')
    && transaction.category.toLowerCase() === 'uncategorized').length;

  const transactionIds = new Set(transactions.map(transaction => transaction.id));
  const jobIds = new Set(jobs.map(job => job.before.id));
  const jobReviews = jobs.filter(job => job.status !== 'done' && transactionIds.has(job.before.id)).map(job => job.review || {
    transactionId: job.before.id, before: job.before, categoryId: '', category: job.before.category,
    subcategory: job.before.subcategory, manualOnly: true,
    reason: enabled && installed ? 'Saved. MINA will process this category when unlocked and sync is ready; you can also select it now.'
      : 'Saved with the parser category. MINA is unavailable or disabled; select a category or keep the current one.',
  });
  return { reviews: reviewsOwner.current === owner && canProcess
    ? [...reviews.filter(review => !jobIds.has(review.transactionId)), ...jobReviews] : [],
    categorizeExisting, approveReview, dismissReview, reloadConflict, existingUncategorizedCount };
}
