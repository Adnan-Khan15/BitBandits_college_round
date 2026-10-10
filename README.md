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

## Run the demo

One command does everything below (fresh data, build, all services, demo seed) and opens the UI:

```bash
./demo.sh            # start; Ctrl+C stops everything
./demo.sh --keep     # start again without resetting the data
./demo.sh stop       # stop everything from another terminal
```

Logs go to `data/logs/`. The same steps by hand:

```bash
npm ci && npx playwright install chromium && cp .env.example .env
npm run reset && npm run build          # fresh database, runtime bundle, web app, typecheck
npm run bench -- --set all              # benchmark table shown on the Drift & audit screen
npm run target                          # terminal 1: ShopLite upstream on :4200
npm start                               # terminal 2: control :4000, live :4100, preview :4300
npm run demo:setup                      # terminal 3: P1-P3 merged, R1 verified + deployed, P4 approved
npm run dev:web                         # terminal 4: the UI on :5173 (proxies /api to :4000)
```

Then open `http://localhost:5173` and follow the demo script in `docs/PLAN.md` section 18. Use
:5173 for the whole demo: the preview runtime accepts element picks only from `PW_EDITOR_ORIGIN`
(`http://localhost:5173` in `.env.example`). The built UI on :4000 works for everything except
picking; to pick from :4000 instead, set `PW_EDITOR_ORIGIN=http://localhost:4000` in `.env`.

Screens: Review & merge (merge P4, or a conflicting patch to see `SAME_PROPERTY`), Releases (create R2,
force-deploy it and watch the automatic rollback to R1), Drift & audit (simulate the v2 redeploy,
check now, propose a quarantine release, verify and deploy it, read the audit chain).

Checks without a browser: `npm run smoke:slice` on a fresh `npm run reset` drives the whole slice
over HTTP (preview isolation, review, merge conflict, verified deploy, rollback, audit chain).
Before a real demo, set the upstream back to v1 and reset:
`curl -X POST localhost:4200/__upstream/version -H 'content-type: application/json' -d '{"version":"v1"}' && npm run reset`.

### Deliberate cuts in this build

| Planned | This build |
| --- | --- |
| Snapshots with Playwright element boxes | `fetch` of the upstream HTML, no element boxes (ShopLite is static) |
| Visual diff masked around patched elements | Whole-page pixel diff, reported as a warning; checks and new console errors decide pass/fail |
| Health = post-deploy run + 30 s beacon window | Post-deploy live verification run only; failure rolls back automatically |
| Separate Review, Releases, Drift, Audit screens | Three screens: Review & merge, Releases, Drift & audit |
| Heal proposals in the UI | Drift report + quarantine release only |
| Playwright E2E journeys | `smoke:slice`, `demo:setup` and a manual click-through |
| `patchwork_llm` benchmark row | Removed: no model is called, so it only repeated the `patchwork` numbers |

Known result on v2: the checkout fix (P1) is reported **broken**, not relocated. The redesigned
button changes id, classes, neighbours and position at once, so its best match scores 0.41, under
the 0.65 relocate threshold; the resolver abstains instead of guessing (the "Save cart for later"
decoy is the runner-up at 0.26). The quarantine release therefore leaves P1 out.

## AI assistance

Planning and the final read-only repository review were written with Claude; the code was
written with OpenCode under human review. All commits are authored by the human whose machine
and credentials made them.
