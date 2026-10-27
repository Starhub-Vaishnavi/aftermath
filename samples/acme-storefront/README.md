# acme-storefront (AFTERMATH sample)

A deliberately small codebase with a demonstrable dependency chain.

Try: select `src/utils/currency.ts` → `formatPrice` and propose
"Return a structured `{ amount, currency, display }` object instead of a string."

Expected (symbol mode):

- **Reached**: `lib/pricing.ts` → `services/cart.ts` (via `@/` alias) → `components/CartSummary.tsx` → `pages/checkout.tsx`,
  `utils/index.ts` (barrel `export *`) → `services/orders.ts`, `emails/receipt.js` (CommonJS),
  and the tests that exercise those paths.
- **Excluded with reasons**: `lib/tax.ts` (imports only `parseAmount`), `pages/admin.tsx`
  (namespace import, only uses `currency.parseAmount`), `components/CartBadge.tsx`
  (imports only `cartCount`).
