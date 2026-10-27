import { cartCount } from "../services/cart";
import type { LineItem } from "../api/types";

export function CartBadge({ items }: { items: LineItem[] }) {
  return <span className="badge">{cartCount(items)}</span>;
}
