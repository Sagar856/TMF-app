import type { AssistantPrompt } from '../services/assistantRuntime';

const SECRET_WITH_VALUE = /\b(?:password|passcode|passphrase|pin|otp|one[ -]time (?:password|code)|cvv|cvc|security code|access token|refresh token|api key|private key)\b\s*(?::|=|\bis\b|\bare\b|\s)\s*\S+/i;
const PRIVATE_DETAIL_WITH_VALUE = /\b(?:demat(?: account)?|account aggregator consent|aggregator consent)\b\s*(?::|=|\bis\b|\bare\b)\s*\S+/i;
const SECRET_REQUEST = /\b(?:provide|share|enter|send|give|tell)\b[\s\S]{0,100}\b(?:password|passcode|passphrase|pin|otp|one[ -]time (?:password|code)|cvv|cvc|security code|access token|refresh token|api key|private key)\b/i;

export function protectAssistantText(text: string): string {
  if (SECRET_WITH_VALUE.test(text) || PRIVATE_DETAIL_WITH_VALUE.test(text)) {
    throw new Error('Remove passwords, verification codes, tokens, demat details and consent information before using MINA.');
  }
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b\d(?:[ -]?\d){4,}\b/g, value => {
      const digits = value.replace(/\D/g, '');
      return `[number ending ${digits.slice(-4)}]`;
    });
}

export function protectAssistantPrompt(prompt: AssistantPrompt): AssistantPrompt {
  return typeof prompt === 'string'
    ? protectAssistantText(prompt)
    : prompt.map(message => ({ ...message, content: protectAssistantText(message.content) }));
}

export function validateAssistantResponse(text: string): string {
  if (SECRET_REQUEST.test(text) || SECRET_WITH_VALUE.test(text) || PRIVATE_DETAIL_WITH_VALUE.test(text)) {
    throw new Error('MINA returned an unsafe response. Do not share passwords or verification codes.');
  }
  return protectAssistantText(text);
}
