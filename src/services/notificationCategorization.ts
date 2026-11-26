import type { Category, ParsedNotification } from '../types/finance';
import { AssistantRuntime } from './assistantRuntime';
import { isAssistantModelSupported } from './assistantModel';
import { safeGetItem } from '../utils/storage';
import { isCashWithdrawalNotification, matchNotificationCategoryText } from '../utils/paymentTransaction';
import { assistantCategoryPrompt, parseAssistantCategoryProposal, resolveAssistantCategoryProposal } from '../utils/assistantCategory';
import { protectAssistantText } from '../utils/assistantPrivacy';

interface CategorizationOptions {
  generate?: (prompt: string) => Promise<string>;
  onWarning: (message: string) => void;
}

async function generateLocally(prompt: string): Promise<string> {
  if (!isAssistantModelSupported()) throw new Error('Local inference is unsupported.');
  const runtime = new AssistantRuntime();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!await runtime.installed()) throw new Error('The local model is not installed.');
    return await Promise.race([
      runtime.generate(prompt, 'background'),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Local categorisation timed out.')), 20000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    await runtime.stop();
  }
}

export async function categorizeNotification(
  notification: ParsedNotification, categories: Category[], options: CategorizationOptions,
): Promise<ParsedNotification> {
  if (isCashWithdrawalNotification(notification)) return notification;
  const explicit = notification.categoryOverride?.trim();
  const text = explicit || notification.description?.trim();
  if (!text) return notification;
  const match = matchNotificationCategoryText(text, notification.type, categories);
  if (match.status === 'match') {
    return { ...notification, category: match.category.name, subcategory: match.subcategory };
  }
  // Never let a model break a known tie between available categories.
  if (match.status === 'none' && safeGetItem('tmf_local_assistant_enabled') === 'true') {
    try {
      const description = protectAssistantText(text);
      const transaction = {
        type: notification.type, title: description,
        category: notification.category, subcategory: notification.subcategory,
      };
      const output = resolveAssistantCategoryProposal(
        parseAssistantCategoryProposal(await (options.generate || generateLocally)(assistantCategoryPrompt(transaction, categories))),
        transaction, categories,
      );
      if (safeGetItem('tmf_local_assistant_enabled') !== 'true') throw new Error('MINA was disabled.');
      if (typeof output === 'object' && output !== null && 'categoryId' in output
        && 'subcategory' in output && 'uncertain' in output && output.uncertain === false) {
        const category = categories.find(item => item.id === output.categoryId
          && item.type === (notification.type === 'credit' ? 'income' : 'expense'));
        if (category && typeof output.subcategory === 'string' && category.subcategories.includes(output.subcategory)) {
          return { ...notification, category: category.name, subcategory: output.subcategory };
        }
      }
      options.onWarning('MINA did not find a confident category. The local classifier was used instead.');
    } catch {
      options.onWarning('MINA could not categorise this payment locally. The local classifier was used instead.');
    }
  }
  if (explicit) throw new Error('Category was not found or matched ambiguously. Choose an existing category or edit this payment in the app.');
  return notification;
}
