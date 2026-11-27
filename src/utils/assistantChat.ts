import type { AssistantChatMessage } from '../services/assistantRuntime';

const MINA_INSTRUCTIONS = `You are MINA, MINARTH's on-device assistant. Help with MINARTH and general personal finance. Answer the user's actual question directly and concisely. If you do not know, say so.

MINARTH help: Home shows financial overviews. Accounts, Transactions, Investments and Loans have their own views. Add records using the + button. Settings has Categories, Budgets, Accounts and Auto-categorise subpages. Settings > MINA AI Assistance controls the model. In MINA, select a month and choose Generate report for a financial report; reports can be exported as CSV or PDF.

MINARTH calculations: monthly budget usage is category operating spending minus refunds, floored at zero, divided by the positive budget; warning starts at 80% and critical at 100%. Operating spending excludes transfers, investment transactions and loan payments. Savings rate is (income minus expenses) divided by positive income, rounded to a whole percent. Reports use the selected month for transactions and budgets; account, investment, loan and savings-goal values are current snapshots, not month-end history.

You do not have the user's financial records in this chat. Never request passwords, verification codes, PINs, card details, tokens or other credentials. Never invent transactions, balances, totals, app actions or navigation. For questions about the user's finances, ask them to request a report. General financial information is not personalised financial advice.
You cannot browse or check live information. Never guess current prices, rates or news. If corrected, reassess instead of repeating an unsupported answer. Use plain text.`;

export function assistantChatPrompt(messages: { role: 'user' | 'assistant'; text: string; localData?: boolean }[]): AssistantChatMessage[] {
  return [
    { role: 'system', content: MINA_INSTRUCTIONS },
    ...messages.filter(message => !message.localData).slice(-8).map(message => ({
      role: message.role,
      content: message.role === 'user' && answerAssistantCredentialQuestion(message.text)
        ? '[Credential question omitted for safety.]'
        : message.text,
    })),
  ];
}

export function isAssistantReportRequest(question: string): boolean {
  const action = '(?:generate|create|make|prepare|show|give|provide|produce|display)';
  const report = '(?:reports?|cash\\s*flow|budget overview|transaction summary|spending summary)';
  if (new RegExp(`\\b(?:do not|don't|never|without|not)(?:\\s+to)?\\s+${action}\\b`, 'i').test(question)
    || /\b(?:how|what|why|when|where|whether)\b/i.test(question)) return false;
  if (/^(?:(?:a|my|the)\s+)?(?:(?:financial|monthly)\s+)?report(?:\s+for\s+[\w -]+?)?(?:\s+please)?[.!]?$/i.test(question.trim())) return true;
  const request = `(?:${action}|(?:can|could|would) you (?:please )?${action}|(?:can|could|may) i (?:have|get|see)|i (?:want|would like))`;
  return new RegExp(`^(?:(?:please|hey mina|mina)[, ]+)*${request}\\b[^.!?]{0,80}\\b${report}\\b`, 'i').test(question.trim());
}

export function answerAssistantCredentialQuestion(question: string): string | undefined {
  const mentionsCredential = /\b(?:passwords?|passcodes?|passphrases?|otps?|one[ -]time (?:passwords?|codes?)|verification codes?|cvv|cvc|security codes?|credentials?|access tokens?|refresh tokens?|api keys?|private keys?)\b/i.test(question)
    || /\bPINs?\b/.test(question)
    || /\b(?:my|your|account|bank|card|security|atm)\s+pins?\b/i.test(question);
  if (!mentionsCredential) return undefined;
  return 'MINA cannot retrieve passwords, PINs, verification codes or other credentials from your accounts, even with permission. Never share them with MINA.';
}

export function answerAssistantFinanceDefinition(question: string): string | undefined {
  const match = /^(?:what is|what's|define|explain(?: the purpose of)?)\s+(?:(?:a|an|the)\s+)?(budget|emergency fund|compound interest|savings rate)[?.!]*$/i.exec(question.trim());
  if (!match) return undefined;
  const definitions: Record<string, string> = {
    'budget': 'A budget is a plan for income and spending over a chosen period.',
    'emergency fund': 'An emergency fund is money set aside for unexpected expenses or loss of income.',
    'compound interest': 'Compound interest is interest calculated on both the original amount and previously accumulated interest.',
    'savings rate': 'In MINARTH, savings rate is income minus expenses, divided by positive income and multiplied by 100, then rounded to a whole percent.',
  };
  return definitions[match[1].toLowerCase()];
}

export function answerAssistantAppQuestion(question: string): string | undefined {
  if (/^(?:how (?:do you|does minarth|does mina) calculate (?:a |the )?budget usage(?: percentage)?|how is (?:a |the )?budget usage(?: percentage)? calculated|what is (?:a |the )?budget usage percentage)[?.!]*$/i.test(question.trim())) {
    return 'MINARTH calculates budget usage as operating spending minus refunds, floored at zero, divided by the positive monthly budget and multiplied by 100. Transfers, investment transactions and loan payments are excluded. The warning threshold is 80% and critical starts at 100%.';
  }
  if (/\breports?\b/i.test(question)
    && /\b(?:account|investment|loan|goal)s?\b/i.test(question)
    && /\b(?:month|monthly|month[- ]end|historical|current|snapshot|as of)\b/i.test(question)) {
    return 'Report transactions and budgets cover the selected month. Account, investment, loan and savings-goal values are current snapshots, not historical month-end values.';
  }
  if (!/\b(?:where|how (?:do|can) i (?:find|open|access)|how to (?:find|open|access))\b/i.test(question)) return undefined;
  const matches = [
    { pattern: /\bbudgets?\b/i, answer: 'Open Settings, scroll to Categories & Budgets, and select Budgets.' },
    { pattern: /\bcategories\b/i, answer: 'Open Settings, scroll to Categories & Budgets, and select Categories.' },
    { pattern: /\bauto[- ]categori[sz](?:e|ation)\b/i, answer: 'Open Settings, scroll to Categories & Budgets, and select Auto-categorise.' },
  ].filter(entry => entry.pattern.test(question));
  return matches.length === 1 ? matches[0].answer : undefined;
}
