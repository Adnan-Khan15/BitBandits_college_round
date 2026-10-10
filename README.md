# BitBandits – College Round

**PATCHWORK** — a platform that lets developers modify existing websites through independently
managed patches without rebuilding the original application: visual patching, smart element
tracking, collaborative review with conflict detection, isolated preview, automated
verification, versioned deployment with rollback, and a tamper-evident audit trail.

## Team

| Member | Role |
| --- | --- |
| Vishwaa | Dev A — Platform & Integration (contracts, validation, previews, merge/conflict workflow, audit) |
| Adnan | Dev B — Patch Engine & Drift (fingerprints, resolver, ops, runtime, Drift Sentinel) |
| Kshant | Dev C — Delivery & Verification (gateway, snapshots, verification, releases, rollback, E2E) |
| Gaurav | Dev D — Editor UI & Demo Site (ShopLite, web app, drift/audit screens) |

## Problem Statement

A deploy broke a shop's checkout button; the original developers are gone and rebuilding the
whole app to fix one button is costly and risky. PATCHWORK delivers independently managed,
reviewed, verified and reversible patches to a live site through a gateway that injects a small
runtime — the original application is never modified. Patches are declarative JSON (nine
operation kinds, no arbitrary scripts), tracked to their elements by a multi-feature resolver,
conflict-checked at merge time, verified in a real browser before release, and rolled back with
one click. **Drift Sentinel** keeps fixes working when the upstream site redesigns itself.

See `docs/PLAN.md` for the full plan: requirements traceability (section 7), architecture
(section 9), frozen contracts (section 11) and the demo script (section 18).

## Tech Stack

- **Runtime:** Node 24 LTS, TypeScript 5.9 (strict), npm workspaces, ESM
- **Server:** one Fastify process on three ports — control `:4000`, live gateway `:4100`,
  preview gateway `:4300`; SQLite via built-in `node:sqlite`
- **Engine & runtime:** DOM resolver (Similo-inspired weighted scoring), jsdom for server-side
  analysis, esbuild-bundled browser runtime
- **Web:** React 19 + Vite 8, plain CSS modules
- **Testing:** Vitest (unit/integration), Playwright (browser E2E + verification), pixelmatch
  (visual diff)
- **Cost:** ₹0 — everything runs locally, no accounts, no runtime LLM

## Setup

Prerequisites: Node 24 (`node --version`), Git, and Playwright's Chromium
(`npx playwright@1.64.0 install chromium`).

```bash
npm ci                        # after the scaffold merges; first checkout: npm install
copy .env.example .env        # Windows; defaults work as-is (cp on macOS/Linux)
npm run reset                 # fresh SQLite in data/ + seeded users and ShopLite project
npm run dev                   # target :4200, API :4000, live :4100, preview :4300, editor :5173
```

Checks: `npm run typecheck && npm test` (unit + integration), `npm run test:e2e` (Playwright),
`npm run smoke:slice` (end-to-end slice). Production-style run: `npm run build`, then
`npm run target` and `npm start` in two terminals, then `npm run demo:setup`.

## Usage

Open `http://localhost:4000`, pick a user (identity is a picker, not auth), and:

1. `http://localhost:4200/cart` is the raw site (broken checkout button);
   `http://localhost:4100/cart` is the same site served through PATCHWORK.
2. In the editor, pick an element inside the preview, author a patch (text, attributes, style,
   visibility, position, HTML, or click/submit behaviour), validate and save it.
3. Preview applies candidate patches on `:4300`; the live port stays unchanged.
4. Submit → review → merge (conflicts block the merge until resolved) → create a release →
   Verify → Deploy. Roll back any time; the audit page shows every step with a "chain intact" badge.
5. On the Drift page, "Simulate upstream redeploy" flips ShopLite to v2; Drift Sentinel
   re-anchors the live patches with evidence and proposes a safe quarantine release.

## AI assistance

Planning and the final read-only repository review were written with Claude; the code was
written with OpenCode under human review. All commits are authored by the human whose machine
and credentials made them.
