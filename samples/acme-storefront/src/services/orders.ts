import { formatPrice, formatDate } from "../utils";
import type { Order } from "../api/types";

export function orderReceipt(order: Order): string {
  const total = order.items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  const currency = order.items[0]?.currency ?? "USD";
  return `Order ${order.id} (${formatDate(order.placedAt)}): ${formatPrice(total, currency)}`;
}
