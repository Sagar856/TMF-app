import { createContext, useCallback, useContext } from 'react';
import { formatMoney, FormatMoneyOptions } from '../utils/money';

export const MoneyLocaleContext = createContext<string | undefined>(undefined);

export function useMoneyFormatter() {
  const locale = useContext(MoneyLocaleContext);
  return useCallback(
    (amount: number | null | undefined, options?: FormatMoneyOptions) =>
      formatMoney(amount, { locale, ...options }),
    [locale]
  );
}
