import type { Category, ParsedNotification, Transaction } from '../types/finance';
import type { AssistantCategoryReview } from './assistantCategory';
import { protectAssistantText } from './assistantPrivacy';
import { isTransaction } from './backup';
import { isCashWithdrawalNotification, matchNotificationCategoryText } from './paymentTransaction';
import { safeGetItem, safeGetJson, safeSetItem } from './storage';

export const CATEGORY_JOBS_CHANGED = 'tmf-category-jobs-changed';
const PREFIX = 'tmf_category_job_';

export interface NotificationCategoryJob {
  owner: string;
  before: Transaction;
  text: string;
  status: 'pending' | 'review' | 'done';
  review?: AssistantCategoryReview;
}

const keyFor = (owner: string, id: string) => `${PREFIX}${encodeURIComponent(owner)}:${encodeURIComponent(id)}`;

export function notificationCategoryReviewText(notification: ParsedNotification, categories: Category[]): string | undefined {
  if (isCashWithdrawalNotification(notification)) return undefined;
  const text = notification.categoryOverride?.trim() || notification.description?.trim();
  return text && matchNotificationCategoryText(text, notification.type, categories).status !== 'match' ? text : undefined;
}

export function readCategoryJobs(owner: string): NotificationCategoryJob[] {
  const prefix = `${PREFIX}${encodeURIComponent(owner)}:`;
  return Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key =>
    safeGetJson<NotificationCategoryJob | null>(key, null, (value): value is NotificationCategoryJob => {
      if (!value || typeof value !== 'object') return false;
      const job = value as NotificationCategoryJob;
      return job.owner === owner && isTransaction(job.before) && typeof job.text === 'string'
        && ['pending', 'review', 'done'].includes(job.status)
        && (!job.review || (job.review.transactionId === job.before.id && isTransaction(job.review.before)));
    })).filter((job): job is NotificationCategoryJob => job !== null);
}

export function writeCategoryJob(job: NotificationCategoryJob): void {
  if (safeGetItem('tmf_cache_owner') !== job.owner) throw new Error('Account changed; category review was not updated.');
  if (!safeSetItem(keyFor(job.owner, job.before.id), JSON.stringify(job))) {
    throw new Error('Could not retain the category review on this device. Please retry.');
  }
  window.dispatchEvent(new Event(CATEGORY_JOBS_CHANGED));
}

export function enqueueCategoryJob(owner: string, before: Transaction, text: string): void {
  if (safeGetItem(keyFor(owner, before.id)) !== null) return;
  let protectedText = '';
  let review: AssistantCategoryReview | undefined;
  try {
    protectedText = protectAssistantText(text.slice(0, 200));
  } catch {
    review = { transactionId: before.id, before, categoryId: '', category: before.category, subcategory: before.subcategory,
      manualOnly: true, reason: 'This category reply could contain private information and was not sent to MINA. Select a category manually.' };
  }
  writeCategoryJob({ owner, before, text: protectedText, status: review ? 'review' : 'pending', review });
}

export function finishCategoryJob(job: NotificationCategoryJob): void {
  writeCategoryJob({ ...job, text: '', status: 'done', review: undefined });
}

export function clearCategoryJobs(owner: string): void {
  if (safeGetItem('tmf_cache_owner') !== owner) throw new Error('Account changed; category requests were not cleared.');
  const prefix = `${PREFIX}${encodeURIComponent(owner)}:`;
  for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
  window.dispatchEvent(new Event(CATEGORY_JOBS_CHANGED));
}
