import { priceLabel, lineTotal } from "@/lib/pricing";
import type { LineItem } from "@/api/types";

export interface CartSummaryData {
  lines: string[];
  totalCents: number;
}

export function summarizeCart(items: LineItem[]): CartSummaryData {
  return {
    lines: items.map(priceLabel),
    totalCents: items.reduce((sum, i) => sum + lineTotal(i), 0),
  };
}

export function cartCount(items: LineItem[]): number {
  return items.reduce((n, i) => n + i.quantity, 0);
}
