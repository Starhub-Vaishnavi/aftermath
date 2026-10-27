import type { CurrencyCode } from "../utils/currency";

export interface LineItem {
  sku: string;
  name: string;
  unitCents: number;
  quantity: number;
  currency: CurrencyCode;
}

export interface Order {
  id: string;
  placedAt: Date;
  items: LineItem[];
}
