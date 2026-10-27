import { describe, it, expect } from "vitest";
import { summarizeCart, cartCount } from "../src/services/cart";

describe("cart", () => {
  it("summarizes", () => {
    const s = summarizeCart([{ sku: "m1", name: "Mug", unitCents: 1200, quantity: 2, currency: "USD" }]);
    expect(s.totalCents).toBe(2400);
  });
  it("counts", () => {
    expect(cartCount([])).toBe(0);
  });
});
