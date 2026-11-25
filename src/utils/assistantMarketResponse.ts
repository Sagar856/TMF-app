import type { MarketSnapshot, MetalKind } from './marketData';
import { metalRatePerGram } from './marketData';

const METAL_RATE_TERMS = /\b(?:rate|price|quote|worth|value|cost|today|current|latest|live)\b/i;
const LIVE_DATA_TERMS = /\b(?:today|right now|currently|current|latest|live|exact|price|rate|quote|exchange rate|market data)\b/i;
const EXTERNAL_LOOKUP_TERMS = /\b(?:check|search|look up|browse|verify)\b.{0,30}\b(?:internet|online|web)\b|\b(?:internet|online|web)\b.{0,30}\b(?:check|search|look up|verify)\b/i;
const FINANCIAL_DATA_TERMS = /\b(?:gold|silver|stock|stocks|share|shares|crypto|bitcoin|forex|currency|exchange|market|weather|news)\b/i;

const GOLD_PURITY_BY_KARAT: Record<string, number> = {
  '24': 999,
  '22': 916,
  '20': 833,
  '18': 750,
  '14': 585,
};

function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function marketDataUnavailable(metal: MetalKind): string {
  return `MINA can't access the internet or verify live market prices. No saved ${metal} benchmark is available on this device, so I won't guess. Check a current trusted source.`;
}

export function answerAssistantMarketQuestion(
  message: string,
  previousUserMessages: readonly string[],
  snapshot: MarketSnapshot | null,
): string | null {
  const metalIn = (text: string): MetalKind | undefined => /\bgold\b/i.test(text)
    ? 'gold'
    : /\bsilver\b/i.test(text) ? 'silver' : undefined;
  const currentMetal = metalIn(message);
  const currentMetalRateRequest = Boolean(currentMetal && METAL_RATE_TERMS.test(message));
  const asksExternalLookup = EXTERNAL_LOOKUP_TERMS.test(message);
  const asksOtherLiveData = LIVE_DATA_TERMS.test(message) && FINANCIAL_DATA_TERMS.test(message);
  const priorMetalQuestion = asksExternalLookup
    ? [...previousUserMessages].reverse().find(previous =>
      metalIn(previous) && METAL_RATE_TERMS.test(previous))
    : undefined;
  const query = currentMetalRateRequest ? message : priorMetalQuestion && `${priorMetalQuestion} ${message}`;
  const metal = query ? metalIn(query) : undefined;
  const asksMetalRate = Boolean(query && metal);
  if (asksMetalRate && metal) {
    const karat = metal === 'gold' ? /\b(24|22|20|18|14)\s*(?:k|kt|karat(?:s)?)\b/i.exec(query)?.[1] : undefined;
    const silverPurity = metal === 'silver' && /\b925\b|\bsterling\b/i.test(query) ? 925 : 999;
    const purity = karat ? GOLD_PURITY_BY_KARAT[karat] : silverPurity;
    const weight = /\b(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams)\b/i.exec(query)?.[1];
    const weightGrams = weight ? Number(weight) : undefined;
    const entry = snapshot?.metals[metal];
    const rate = metalRatePerGram(entry, purity);
    if (!entry || !rate || !entry.asOf || !Number.isFinite(rate)
      || (weightGrams !== undefined && (!Number.isFinite(weightGrams) || weightGrams <= 0))) {
      return marketDataUnavailable(metal);
    }

    const purityLabel = metal === 'gold' ? `${karat || '24'}K (${purity} purity)` : `${purity} purity silver`;
    const priceLines = weightGrams === undefined
      ? `${formatRupees(rate)} per gram; ${formatRupees(rate * 10)} per 10 grams`
      : `${formatRupees(rate * weightGrams)} for ${weightGrams} grams (${formatRupees(rate)} per gram)`;
    return `The last saved ${entry.source} benchmark for ${purityLabel} is ${priceLines}, dated ${entry.asOf}. This is cached market data, not a live internet check or a guaranteed retail quote; taxes and making charges may differ.`;
  }

  if (asksExternalLookup || asksOtherLiveData) {
    return 'I can’t browse the internet or verify live information. I won’t guess current prices, rates, or other changing facts. MINARTH may show cached market data in Investments with its source and date.';
  }
  return null;
}
