import { describe, it, expect } from "vitest";
import { priceLabel, applyDiscount } from "../src/lib/pricing";

describe("pricing", () => {
  it("labels a line item", () => {
    expect(priceLabel({ sku: "m1", name: "Mug", unitCents: 1200, quantity: 2, currency: "USD" })).toBe("2 × Mug — $24.00");
  });
  it("applies a discount", () => {
    expect(applyDiscount(1000, 10)).toBe(900);
  });
});
