import CartSummary from "../components/CartSummary";
import { CartBadge } from "../components/CartBadge";
import { orderReceipt } from "../services/orders";
import type { Order } from "../api/types";

export default function CheckoutPage({ order }: { order: Order }) {
  const onConfirm = async () => {
    const { track } = await import("../lib/analytics");
    track("checkout_confirmed", { receipt: orderReceipt(order) });
  };
  return (
    <main>
      <CartBadge items={order.items} />
      <CartSummary items={order.items} />
      <button onClick={onConfirm}>Confirm</button>
    </main>
  );
}
