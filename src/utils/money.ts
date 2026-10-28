export interface FormatMoneyOptions {
  symbol?: string;
  currencySymbol?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const DEFAULT_LOCALE = ['en', 'IN'].join('-');

export function getCurrencyLocale(currencyCode: string): string {
  const locales: Record<string, string> = {
    INR: DEFAULT_LOCALE,
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
  };
  return locales[currencyCode] || DEFAULT_LOCALE;
}

export function formatMoney(
  amount: number | null | undefined,
  options?: FormatMoneyOptions
): string {
  const sym = options?.symbol ?? options?.currencySymbol ?? '';
  const locale = options?.locale || DEFAULT_LOCALE;

  const value = amount == null || isNaN(amount) ? 0 : amount;
  const isNeg = value < 0;
  const absAmount = Math.abs(value);
  const minDigits = options?.minimumFractionDigits ?? 2;
  const maxDigits = options?.maximumFractionDigits ?? 2;

  const formatted = absAmount.toLocaleString(locale, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });

  if (sym) {
    return isNeg ? `-${sym}${formatted}` : `${sym}${formatted}`;
  }

  return isNeg ? `-${formatted}` : formatted;
}
