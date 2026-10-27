import { it, expect } from "vitest";
import { taxFor } from "../src/lib/tax";

it("taxes CA", () => {
  expect(taxFor("CA", "100.00")).toBe(725);
});
