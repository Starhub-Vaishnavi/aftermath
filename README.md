# AFTERMATH

**Explore the consequences of a code change before you make it.**

AFTERMATH imports a JavaScript/TypeScript repository, builds a real dependency graph with the TypeScript compiler's parser, and lets you pick a file or exported symbol, describe a change in plain language, and see what it touches. Every impacted file comes with evidence: the import statement, the line, and the declarations that reference the changed symbol. An LLM then explains *possible* behavioral consequences, drafts a migration checklist, and suggests regression tests. It never decides what depends on what.

```
import ─▶ parse ─▶ graph ─▶ select target ─▶ describe change ─▶ trace impact ─▶ explain ─▶ save / compare
           (TS parser)                                          (deterministic)   (LLM, grounded)
```

## Links

| | |
| --- | --- |
| Source | https://github.com/Starhub-Vaishnavi/aftermath |
| Live app | https://aftermath-taupe.vercel.app |
| Demo video | _added after recording_ (shot list: [DEMO.md](DEMO.md)) |

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3100
```

Click **Open sample** on the home page. The bundled `acme-storefront` repo is pre-selected on `src/utils/currency.ts › formatPrice`; pick a suggested change and press **Simulate aftermath**.

Optional configuration (`.env.local`, see `.env.example`):

| Variable | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables AI explanations (default model `claude-opus-5-5`). Without it, AFTERMATH produces graph-derived guidance and says so in the UI. |
| `AFTERMATH_MODEL` | Override the model id. |
| `DATABASE_URL` | Store projects and investigations in PostgreSQL (tables are created automatically). Without it, a JSON file store in `./.data` is used. |

```bash
npm test             # vitest: parser, resolver, monorepos, graph, impact, ingestion, LLM grounding, PostgreSQL store
npm run lint         # ESLint (next/core-web-vitals + typescript)
npm run typecheck
npm run build && npm start
```

The PostgreSQL store test runs against [PGlite](https://pglite.dev) (Postgres compiled to WASM) over a real TCP socket, so the `pg` driver, JSONB columns and foreign keys are exercised without installing a database.

## Deployment (Vercel)

1. Import the GitHub repo in Vercel (framework preset: Next.js; no build settings needed).
2. Add environment variables:
   - `DATABASE_URL`: any PostgreSQL (Neon, Supabase, RDS…). **Recommended.** Serverless instances don't share a disk, so without it saved projects and investigations live in each instance's `/tmp` and can disappear. The bundled sample always works because it is rebuilt on demand.
   - `ANTHROPIC_API_KEY` (optional) for AI explanations.
   - `GITHUB_TOKEN`: not needed. Imports download `github.com/<owner>/<repo>/archive/HEAD.zip` directly, so they don't use the rate-limited REST API.
3. Deploy. Route handlers run on the Node.js runtime; imports of large repositories are bounded by `maxDuration` (120 s).

Any Node host (Render, Railway, Fly, a VM) also works with `npm run build && npm start`; there the JSON file store persists in `./.data` (or `AFTERMATH_DATA_DIR`).

---

## The demo path (sample repository)

`samples/acme-storefront` is a 17-file storefront built to show off every kind of edge the analyzer understands:

| Edge type | Where |
| --- | --- |
| Named import | `lib/pricing.ts` → `utils/currency.ts` |
| tsconfig `paths` alias | `services/cart.ts` imports `@/lib/pricing` |
| Barrel `export *` | `utils/index.ts` re-exports `currency.ts`; `services/orders.ts` imports through it |
| CommonJS `require` + destructuring | `emails/receipt.js` |
| Namespace import + member access | `pages/admin.tsx` uses `currency.parseAmount` |
| Dynamic `import()` | `pages/checkout.tsx` lazy-loads analytics |
| `import type` | `api/types.ts` and its consumers |

Changing **`formatPrice`** reaches 9 files over three levels: `pricing.ts → cart.ts → CartSummary.tsx`, `index.ts → orders.ts → checkout.tsx`, `receipt.js`, and two test files. It **excludes**, with reasons, `lib/tax.ts` (imports only `parseAmount`), `pages/admin.tsx` (namespace import, only touches `currency.parseAmount`) and `components/CartBadge.tsx` (imports `cartCount` from an impacted file, not `summarizeCart`). Switch to **File-level** mode to see the noisier conservative superset.

---

## Architecture

```
src/
  lib/analysis/        deterministic core (no I/O, no LLM)
    parser.ts          ts.createSourceFile → imports, exports, per-declaration references
    resolver.ts        relative, index, ESM ".js"→".ts", nested tsconfig paths/extends, workspace packages + exports maps
    graph.ts           files → nodes + evidence-carrying edges + unresolved/external report
    impact.ts          symbol-aware reverse traversal with evidence chains
  lib/ingest/          untrusted-input handling: ZIP (in memory), GitHub archive, sample loader
  lib/llm/             evidence pack → Claude (structured output) → grounding filter; deterministic fallback
  lib/store/           Store interface; PostgreSQL (JSONB) and JSON-file implementations
  app/api/...          Next.js route handlers (Node runtime)
  components/          workspace UI: React Flow graph, inspector, results, compare
samples/acme-storefront
tests/
```

### 1. Parsing

`parser.ts` uses `ts.createSourceFile`, the TypeScript compiler's **syntax-only** parser. No `Program`, no type checker, no module loading. It is fast, tolerates syntax errors (they are counted, not fatal), and works the same for `.ts/.tsx/.js/.jsx/.mjs/.cjs`. For each module it records:

- **Imports**: static, side-effect, `import type` (whole and per-specifier), `import x = require()`, `require()` (including destructured bindings), dynamic `import()`, `export … from`, `export * from`, `export * as ns from`. Non-literal `require(x)`/`import(x)` are recorded as unresolvable instead of being dropped silently.
- **Exports**: declarations, `export { a as b }`, defaults, re-exports, `module.exports = {…}`, `exports.x = …`.
- **References per top-level declaration**: which identifiers each function/class/const references, with `ns.member` recorded for namespace access. This is what makes symbol-level tracing possible.

### 2. Resolution and graph construction

A specifier becomes an edge **only if it resolves to a file in the uploaded set**. Resolution order mirrors TypeScript's:

1. Relative/absolute paths: exact, ESM-style `.js`→`.ts`, extensions, `index.*`.
2. `compilerOptions.paths` from the **nearest** `tsconfig.json`/`jsconfig.json`, following relative `extends` chains (parsed with the compiler's JSONC reader; `paths` resolve against `baseUrl` when set, otherwise the declaring config, as in TypeScript).
3. **Workspace packages** declared by `package.json#workspaces`, `pnpm-workspace.yaml` or `lerna.json`: `exports` maps (subpaths, `*` patterns, nested conditions, preferring `source`/`types`), then `source`/`module`/`main`/`types`. Build output is usually absent from source, so a target under `dist/`, `build/`, `lib/`… is also tried at the mirrored `src/` path. These edges are labeled `workspace-package`. `exports` is authoritative: unlisted subpaths are reported, not resolved.
4. `baseUrl`-relative bare specifiers.

Everything else is classified as `external-package`, `builtin`, `not-found`, `non-literal` or `non-js-asset` (`.vue`, `.svelte`, `.css`, images…) and shown to the user. Each edge carries the import kind, imported names, type-only flag, line, statement text and how it was resolved.

### 3. Impact traversal

`analyzeImpact(graph, { file, symbol }, { mode })` walks reverse edges breadth-first, carrying a **set of affected export names** per file:

1. An importer is reached only if one of its bindings names an affected export, or a namespace binding is accessed as `ns.<affected>`.
2. Inside the importer, a fixed-point over declaration references finds which local declarations (including private helpers) reach that binding.
3. Exports backed by those declarations, plus matching re-exports (`export {x} from`, `export *`), become the importer's affected set and propagate further.
4. Importers that bind the module but not an affected symbol are listed as **excluded**, with the reason and line.

Each impacted file has a **depth**, the **shortest evidence chain** from the change, the affected exports that propagate onward, and a **confidence**:

- **confirmed**: every hop is a syntactically verified reference to an affected symbol.
- **possible**: the import is real, but usage could not be narrowed (dynamic `import()`, bare `require()`, a namespace object passed around whole, file-level mode).

Cycles terminate because affected sets only grow. `file` mode is classic reverse reachability, offered as a conservative cross-check.

### 4. AI explanation, with an evidence boundary

`lib/llm/context.ts` builds an evidence pack: the target source, the proposed change, and for each impacted file its chain, import statement, and the code around the referencing lines. Claude (`claude-opus-5-5`, structured output via a Zod schema, server-side refusal fallback enabled) returns a summary, per-file behavioral **hypotheses** with likelihood/severity, a checklist, test sketches and stated assumptions.

`groundModelOutput` then enforces the boundary:

- Risks about files **not in the static impact set are discarded**, and the UI lists the discarded claims.
- The `dependency` status (confirmed/possible), depth and evidence lines on each risk are **copied from the analyzer**, never taken from the model.
- Checklist file links that point outside the evidence are removed.

The UI keeps three labels visually distinct: **confirmed** dependency, **possible** dependency, and **hypothesis** (AI). If the API key is missing, rate-limited, refused or unparseable, a deterministic explanation is produced from the graph and a notice says why.

### 5. Untrusted input

- Imported code is **never executed, installed, built or written to disk**. ZIPs are read in memory with `fflate`; entries are filtered by path *before* decompression.
- Path traversal (`../`, absolute, drive letters, NUL) is rejected; `node_modules`, build output and vendored dirs are skipped; binary files masquerading as source are dropped.
- Limits: 60 MB archive, 512 KB per file, 4,000 files, 40 MB of source (`lib/ingest/limits.ts`). Skipped counts are reported.
- GitHub import only contacts `github.com` and `codeload.github.com` (redirects elsewhere are refused) with a URL built from a validated `owner/repo/ref`. Private repos return 404 to anonymous archive requests and are rejected. Downloads are streamed with a hard size cap and timeouts.
- Source shown in the UI is rendered as text, never as HTML.

### 6. Persistence

`Store` has two implementations chosen at startup: `PgStore` (tables `aftermath_projects`, `aftermath_investigations`, JSONB columns, created on first use) when `DATABASE_URL` is set, otherwise `FileStore` (atomic JSON writes under `.data/`). Investigations are saved automatically and can be reopened (`/p/<id>?inv=<inv>`) or compared side by side (`/p/<id>/compare?a=…&b=…`), showing shared files, files unique to each change, and confidence/depth per file.

---

## Technical decisions

- **Syntax parser, not the type checker.** A full `ts.Program` would need dependency type declarations we deliberately don't install, is slow on arbitrary repos, and would tempt us toward module loading. Syntax plus lexical resolution gives exact import/export facts; the trade-off is described under Limitations.
- **Symbol-level propagation by default.** File-level reachability over-reports (every importer of a barrel lights up). Tracking affected export names through declaration references cuts noise while staying evidence-based; file mode remains available.
- **The LLM is downstream of the facts.** It receives evidence, returns hypotheses, and its output is filtered against the evidence. Deterministic results are useful on their own, and tests cover them independently.
- **Zero-config by default.** The JSON store and deterministic fallback mean `npm install && npm run dev` gives a working demo; PostgreSQL and the API key are upgrades, not prerequisites.
- **Layout on the client with dagre (LR)**, with edges drawn from a module to its importers, so impact visibly flows left to right. A folder projection reuses the same layout and rendering for large repositories.
- **Serverless-aware storage.** The file store writes to the OS temp dir on Vercel/Lambda and the sample project self-heals, but PostgreSQL is the supported production store.

## Limitations

- **JavaScript/TypeScript only.** Other files are ignored rather than pretended to be analyzed.
- **Name-based references.** Shadowing a binding with a local variable of the same name can cause a false positive (conservative); aliasing a value through runtime structures (`const fns = { formatPrice }; fns[key]()`) is tracked only as far as the declaration that contains it.
- **No type-level inference.** A change to an interface reaches files that name it, not files that only receive values of that type structurally.
- **Runtime-only coupling is invisible:** string-based lookups, DI containers, `require(variable)`, framework file-system routing, and HTTP boundaries. Non-literal specifiers are reported so you know where the blind spots are.
- **Module resolution** covers relative paths, index files, ESM `.js` specifiers, nested tsconfig `paths`/`baseUrl`/`extends`, and workspace packages with `exports` maps. Not resolved: webpack/vite/babel aliases, `imports` (`#internal`) maps, `extends` from npm packages, and Vue/Svelte single-file components (their imports are listed as `non-js-asset`).
- **Large graphs**: verified on `sindresorhus/ky` (98 files, 190 edges, ~2.5 s import) and the `TanStack/store` pnpm monorepo (200 files, 235 edges incl. 36 cross-package, ~2 s). Repos over 120 files open in the **Folders** view (one node per directory, aggregated edges, worst impact state per folder); click a folder to see its files and their neighbors. Thousands of files will lay out slowly.
- Side-effect imports (`import "./x"`) are not treated as dependents of a specific symbol in symbol mode.

## Roadmap

Bundler alias configs, `package.json#imports`, streaming the LLM explanation into the UI, git-diff mode (analyze an actual patch), and more languages via tree-sitter, each with its own honest capability matrix.
