# AFTERMATH — demo video script (~3 minutes)

A shot-by-shot plan for recording every major workflow in one take. Record at **1440×900 or larger** (the three-column workspace needs ≥1280 px width).

## Before you hit record

1. Use the deployed URL (or `npm run dev` → http://localhost:3100).
2. Start from a fresh browser window on the home page. Close other tabs.
3. Have this GitHub URL copied: `https://github.com/sindresorhus/ky` (a second import, fast, ~100 files).
4. Optional: if `ANTHROPIC_API_KEY` is configured, the Risks tab shows AI hypotheses; without it, the app clearly says it is showing graph-only guidance. Both are fine to show. Say which one you are showing.

## Shot list

| # | Time | Do this | Say this |
|---|------|---------|----------|
| 1 | 0:00 | Home page, cursor still. | "AFTERMATH lets you see what a code change touches before you write it. It works on JavaScript and TypeScript, and every dependency it shows comes from a real import statement." |
| 2 | 0:12 | Point at the three cards. | "You can import a public GitHub repo, upload a ZIP, or open the bundled sample. Uploaded code is treated as untrusted: it's parsed as text in memory and never executed." |
| 3 | 0:22 | Click **Open sample**. Let the loading line animate. | "The sample is a small storefront built with a deliberate dependency chain." |
| 4 | 0:30 | Workspace loads, `currency.ts › formatPrice` pre-selected and the graph lit up. Scroll-zoom the graph once. | "This graph is built with the TypeScript compiler's parser. Arrows point from a module to the files that import it, the direction impact travels. Picking `formatPrice` already shows a static preview: nine dependents." |
| 5 | 0:45 | Click **parseAmount** in the exports list, then back to **formatPrice**. | "It's symbol-precise: `parseAmount` reaches a completely different set of files, so you only see what actually uses the function you're changing." |
| 6 | 0:58 | Click the first suggested change chip ("Return a structured { amount, currency, display } object…"). Click **Simulate aftermath**. | "Now I describe the change in plain language and simulate it." |
| 7 | 1:08 | Results → **Overview**. Point at the stat cards and the "How to read this" box. | "Three direct dependents, six transitive, all confirmed. AFTERMATH keeps three things apart: *confirmed* dependencies proven by the parser, *possible* ones where usage couldn't be narrowed, and *hypotheses*, which are behavioral risks from the AI, never treated as fact." |
| 8 | 1:25 | **Paths** tab → expand `src/pages/checkout.tsx`. Hover it so the chain glows on the graph. | "Every file has an evidence chain. Checkout is reached through the `utils` barrel, then `orders.ts`, then `orderReceipt`. Each hop cites the import line and the function that uses it." |
| 9 | 1:42 | Click the `orderReceipt · L7` chip. The source panel opens at line 7. Close it (Esc). | "Clicking evidence jumps straight to the code." |
| 10 | 1:50 | **Excluded** tab. | "Equally important is what's *not* affected: `tax.ts` imports from the same module but only uses `parseAmount`. Excluded files come with the reason." |
| 11 | 2:00 | **Risks** tab, then **Checklist** (tick two boxes), then **Tests**. | "Risks are hypotheses tied to evidence lines. If the AI mentions a file outside the evidence, it's discarded. There's a migration checklist and suggested regression tests, starting with the tests already on the impact path." |
| 12 | 2:20 | Click **Edit proposal** → select **parseAmount** → choose "Throw instead of returning a fallback value…" → **Simulate aftermath**. | "Let's try an alternative change." |
| 13 | 2:30 | Header → **Investigations**. Tick both investigations → **Compare selected**. | "Every simulation is saved. Comparing the two shows which files are shared and which are unique to each change, with confidence and depth side by side." |
| 14 | 2:42 | Back to home (logo). Paste the ky URL → **Import repository**. When it opens, click **Folders**, then click a folder to drill in. | "It works on real repositories too. This is `ky` from GitHub. Larger repos get a folder map, and monorepo workspace packages and tsconfig path aliases are resolved." |
| 15 | 2:58 | Hold on the graph. | "That's AFTERMATH: evidence-backed impact analysis, with AI for explanation, never for inventing results." |

## Tips

- If the graph is too zoomed out, press the **fit view** button (bottom-left) or scroll-zoom.
- "Impact only" in the graph toolbar hides everything that isn't affected. Useful on larger repos.
- Keep the recording under 3:30. Cut shot 14 first if you need time.
