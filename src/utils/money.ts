export interface FormatMoneyOptions {
  symbol?: string;
  currencySymbol?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

const DEFAULT_LOCALE = ['en', 'IN'].join('-');

export function formatMoney(
  amount: number | null | undefined,
  options?: FormatMoneyOptions | { locale?: string; currencySymbol?: string; symbol?: string }
): string {
  const sym = options?.symbol ?? options?.currencySymbol ?? '';
  const locale = options?.locale || DEFAULT_LOCALE;

  if (amount === null || amount === undefined || isNaN(amount)) {
    return sym ? `${sym}0` : '0';
  }

  const isNeg = amount < 0;
  const absAmount = Math.abs(amount);

  const minDigits = options?.minimumFractionDigits !== undefined
    ? options.minimumFractionDigits
    : (absAmount % 1 !== 0 ? 2 : 0);

  const maxDigits = options?.maximumFractionDigits !== undefined
    ? options.maximumFractionDigits
    : (absAmount % 1 !== 0 ? 2 : 0);

  const formatted = absAmount.toLocaleString(locale, {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  });

  if (sym) {
    return isNeg ? `-${sym}${formatted}` : `${sym}${formatted}`;
  }

  return isNeg ? `-${formatted}` : formatted;
}
