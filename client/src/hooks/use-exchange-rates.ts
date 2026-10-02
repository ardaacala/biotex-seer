import { useQuery } from '@tanstack/react-query';

export type Currency = 'TRY' | 'USD' | 'EUR';
export const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
export const CURRENCY_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€' };

type FrankfurterResponse = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

export type RateMap = {
  base: Currency;
  date: string;
  rates: Record<Currency, number>;
};

async function fetchRates(): Promise<RateMap> {
  const r = await fetch('https://api.frankfurter.app/latest?from=TRY&to=USD,EUR');
  if (!r.ok) throw new Error('Kur bilgileri alınamadı');
  const j: FrankfurterResponse = await r.json();
  return {
    base: 'TRY',
    date: j.date,
    rates: { TRY: 1, USD: j.rates.USD, EUR: j.rates.EUR },
  };
}

export function useExchangeRates() {
  return useQuery<RateMap>({
    queryKey: ['exchange-rates', 'frankfurter', 'TRY'],
    queryFn: fetchRates,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 6,
    retry: 1,
  });
}

export function convertAll(amount: number, fromCurrency: Currency, rates?: RateMap | null): Record<Currency, number> | null {
  if (!rates) return null;
  const inTry = fromCurrency === 'TRY' ? amount : amount / rates.rates[fromCurrency];
  return {
    TRY: inTry,
    USD: inTry * rates.rates.USD,
    EUR: inTry * rates.rates.EUR,
  };
}

export function formatMoney(amount: number, currency: Currency): string {
  return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + CURRENCY_SYMBOLS[currency];
}

export function formatAllCurrencies(amount: number, fromCurrency: Currency, rates?: RateMap | null, separator = ' • '): string {
  const all = convertAll(amount, fromCurrency, rates);
  if (!all) return formatMoney(amount, fromCurrency);
  return CURRENCIES.map(c => formatMoney(all[c], c)).join(separator);
}
