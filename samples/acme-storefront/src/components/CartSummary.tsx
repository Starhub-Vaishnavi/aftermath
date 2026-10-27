import { summarizeCart } from "../services/cart";
import type { LineItem } from "../api/types";

export default function CartSummary({ items }: { items: LineItem[] }) {
  const summary = summarizeCart(items);
  return (
    <ul className="cart-summary">
      {summary.lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
