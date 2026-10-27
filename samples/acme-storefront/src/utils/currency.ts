export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const ZERO_DECIMAL: CurrencyCode[] = ["JPY"];

/** Formats an integer amount of minor units (cents) as a display string. */
export function formatPrice(cents: number, currency: CurrencyCode = "USD"): string {
  const digits = ZERO_DECIMAL.includes(currency) ? 0 : 2;
  const value = digits === 0 ? cents : cents / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits }).format(value);
}

/** Parses user input like "12.50" into integer cents. */
export function parseAmount(input: string): number {
  const n = Number(input.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) throw new Error(`Invalid amount: ${input}`);
  return Math.round(n * 100);
}
