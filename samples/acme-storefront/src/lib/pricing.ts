import { formatPrice } from "../utils/currency";
import type { LineItem } from "../api/types";

export function lineTotal(item: LineItem): number {
  return item.unitCents * item.quantity;
}

/** Human readable label, e.g. "2 × Mug — $24.00". */
export function priceLabel(item: LineItem): string {
  return `${item.quantity} × ${item.name} — ${formatPrice(lineTotal(item), item.currency)}`;
}

export function applyDiscount(cents: number, percent: number): number {
  return Math.round(cents * (1 - percent / 100));
}
