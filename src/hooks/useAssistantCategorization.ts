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
import type { FormatMoneyOptions } from '../utils/money';
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
    runtime, enabled, installed, supported, canProcess, transactions, categories, cloudReady, cloudHydrated, setTransactions,
  } = options;
  const [reviews, setReviews] = useState<AssistantCategoryReview[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const processing = useRef(new Set<string>());
  const transactionsRef = useRef(transactions);
  const categoriesRef = useRef(categories);
  const notifyRef = useRef(options.notify);
  const moneyOptionsRef = useRef(options.moneyOptions);
  const confirmations = useRef(new Map<string, { category: string; subcategory: string; amount: number }>());
  transactionsRef.current = transactions;
  categoriesRef.current = categories;
  notifyRef.current = options.notify;
  moneyOptionsRef.current = options.moneyOptions;

  useEffect(() => {
    for (const [id, expected] of confirmations.current) {
      const saved = transactions.find(transaction => transaction.id === id);
      if (saved?.categoryOrigin === 'assistant' && saved.category === expected.category
        && saved.subcategory === expected.subcategory && saved.amount === expected.amount) {
        notifyRef.current(notificationCategoryConfirmation(saved, moneyOptionsRef.current), 'success');
      }
      confirmations.current.delete(id);
    }
  }, [transactions]);

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
      const result = await syncTransactionsToSupabase([candidate]);
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

  const processTransaction = useCallback(async (transaction: Transaction, explicitlySelected = false) => {
    if (!enabled || !installed || !supported || !canProcess || navigator.onLine === false || processing.current.has(transaction.id)) return;
    if (isCloudBackendConfigured() && (!cloudReady || !cloudHydrated)) return;
    if (isCloudBackendConfigured() && transaction.syncRevision === undefined) return;
    processing.current.add(transaction.id);
    const origin = transaction.categoryOrigin || 'unknown';
    const rule = matchingRule(transaction)
      || (origin === 'rule' ? { category: transaction.category, subcategory: transaction.subcategory } : undefined);
    try {
      const categoriesAtRequest = categoriesRef.current;
      const output = resolveAssistantCategoryProposal(
        parseAssistantCategoryProposal(await runtime.generate(
          assistantCategoryPrompt(transaction, categoriesAtRequest), 'background',
        )),
        transaction,
        categoriesAtRequest,
      );
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
      } else if (result.status === 'skip' && /invalid category|unavailable category/i.test(result.reason)) {
        notifyRef.current(`No valid category was selected for "${transaction.title}". It was left unchanged.`, 'warning');
      }
    } catch (error) {
      processing.current.delete(transaction.id);
      notifyRef.current(
        `Could not categorize "${transaction.title}" locally: ${error instanceof Error ? error.message : 'Please retry.'}`,
        'error',
      );
    }
  }, [appendReview, canProcess, cloudHydrated, cloudReady, enabled, installed, persistProposal, runtime, supported]);

  useEffect(() => {
    if (!enabled || !installed || !supported || !canProcess || !online) return;
    if (isCloudBackendConfigured() && (!cloudReady || !cloudHydrated)) return;
    transactions
      .filter(transaction => transaction.categoryOrigin === 'eligible'
        || transaction.categoryOrigin === 'imported' || transaction.categoryOrigin === 'rule')
      .forEach(transaction => { void processTransaction(transaction); });
  }, [canProcess, cloudHydrated, cloudReady, enabled, installed, online, processTransaction, supported, transactions]);

  const categorizeExisting = useCallback(() => {
    transactionsRef.current
      .filter(transaction => (!transaction.categoryOrigin || transaction.categoryOrigin === 'unknown')
        && transaction.category.toLowerCase() === 'uncategorized')
      .forEach(transaction => { void processTransaction(transaction, true); });
  }, [processTransaction]);

  const approveReview = useCallback(async (review: AssistantCategoryReview) => {
    await persistProposal(
      review.before, review.categoryId, review.category, review.subcategory,
      review.before.categoryOrigin || 'unknown', true,
    );
  }, [persistProposal]);

  const dismissReview = useCallback((review: AssistantCategoryReview) => {
    if (navigator.onLine === false) {
      notifyRef.current('Connect to the internet to change transaction categories.', 'warning');
      return;
    }
    setTransactions(previous => previous.map(transaction => transaction.id === review.transactionId
      ? { ...transaction, categoryOrigin: 'user-edited' }
      : transaction));
    setReviews(previous => previous.filter(item => item.transactionId !== review.transactionId));
  }, [setTransactions]);

  const reloadConflict = useCallback(async (review: AssistantCategoryReview) => {
    const cloudTransactions = await fetchTransactionsFromSupabase();
    const cloudTransaction = cloudTransactions?.find(transaction => transaction.id === review.transactionId);
    if (!cloudTransaction) {
      notifyRef.current('The cloud version could not be loaded. The local transaction was not changed.', 'error');
      return;
    }
    setTransactions(previous => previous.map(transaction =>
      transaction.id === review.transactionId ? cloudTransaction : transaction));
    setReviews(previous => previous.filter(item => item.transactionId !== review.transactionId));
    notifyRef.current(`Reloaded "${cloudTransaction.title}" from the cloud. The local category suggestion was discarded.`, 'success');
  }, [setTransactions]);

  const existingUncategorizedCount = transactions.filter(transaction =>
    (!transaction.categoryOrigin || transaction.categoryOrigin === 'unknown')
    && transaction.category.toLowerCase() === 'uncategorized').length;

  return { reviews, categorizeExisting, approveReview, dismissReview, reloadConflict, existingUncategorizedCount };
}
