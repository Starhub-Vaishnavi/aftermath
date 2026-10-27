import { parseAmount } from "../utils/currency";

const RATES: Record<string, number> = { CA: 0.0725, NY: 0.04, TX: 0.0625 };

export function taxFor(region: string, subtotalInput: string): number {
  return Math.round(parseAmount(subtotalInput) * (RATES[region] ?? 0));
}
