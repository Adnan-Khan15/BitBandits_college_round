# PATCHWORK — Project Plan (docs/PLAN.md)

> **OpenCode agents: start here.** This file is the team's single source of truth for PATCHWORK
> (GDG On Campus FRCRCE college round, Web/App Dev problem 3). Read this box, then your own section.

## Start here (every OpenCode agent)

1. **Find out who you work for.** Your human pastes your prompt from section 13:
   13.3 Vishwaa (Dev A), 13.4 Adnan (Dev B), 13.5 Kshant (Dev C), 13.6 Gaurav (Dev D).
   If you were started without one, ask: "Which developer am I working for?" Then treat that
   prompt in section 13 as your instructions. Never take work from another developer's prompt.
2. **Rules before any edit:** follow `AGENTS.md` (its proposed text is in section 13.1 if it is not in the
   repo yet). Check `git branch --show-current` and `git status --short`; stop and report anything unexpected.
3. **Timing:** only Vishwaa's agent works in the repo before CONTRACT FREEZE (about hour 1.5).
   Gaurav's agent drafts ShopLite outside the repo until then; Adnan's and Kshant's agents start after it.
4. **Binding parts:** section 11 (contracts) and your path ownership in section 12 are binding.
   The official problem statement is quoted verbatim in section 2.
5. **Branches:** feature PRs go into `integration`; never push to `main` or `integration` (section 14).
6. **Reporting:** end every task with the report format in `AGENTS.md`.

Map of this file: 0 launch · 1 summary · 2 requirements · 3 repo · 4 skills · 5 research · 6 signature feature ·
7 traceability · 8 stack · 9 architecture · 10 components · 11 contracts · 12 workstreams · 13 prompts ·
14 Git · 15 schedule · 16 tests · 17 run · 18 demo · 19 risks · 20 first actions · 21 go/no-go · 22 review.

Version 10 Oct 2026 · Kshant Carvalho with Claude (planning) · Status: approved for implementation; section 11 contracts freeze at hour 1.5

## 0. Team launch guide

Who does what, and how the team starts. Everything below refers to sections of this file.

### Who does what

Each person owns one whole workstream and pastes exactly one prompt from section 13; no workstream is split between people. Feature PRs land on `integration`; `main` only receives `integration` at hours 16 and 18.

| Person | Workstream | Prompt to paste |
| --- | --- | --- |
| Vishwaa | Dev A: validation, previews, merge/conflict workflow, audit, **integration owner** | §13.3 |
| Adnan | Dev B: core patch-processing engine, runtime, Drift Sentinel | §13.4 |
| Kshant | Dev C: gateway, verification, releases, rollback, regression E2E | §13.5 |
| Gaurav | Dev D: frontend, user workflow, demo site | §13.6 |

"Preview" is shared cleanly: Vishwaa creates previews and runs conflict and validation checks; Kshant's gateway serves them and his verifier tests them. If the team prefers Kshant as integrator, swap workstreams A and C whole.

### Read-only review stage

Claude only ever reads the repository. It uses an anonymous clone of the public repo, needs no credentials, and adds no collaborator. It will not push, open PRs, comment on GitHub or change settings.

- If the repo goes private, Vishwaa sends a zip of `integration` instead.
- Browser tests may not run in Claude's sandbox, so Vishwaa runs the evidence-pack commands in §22 and sends the outputs.
- Every review states exactly which tests Claude ran and which files it only read.

### Before the clock starts (everyone, about 45 minutes)

- [ ] **Adnan:** confirm Vishwaa, Kshant and Gaurav have Write access; create `integration` from `main` on GitHub; protect both branches (§14).
- [ ] **Everyone:** install Node 24, Git and OpenCode; run `npx playwright@1.64.0 install chromium`; run the read-only checks in §14.
- [ ] **Everyone:** save `~/.config/opencode/patchwork.json` from §13.2 with your own `edit` allow-list (below), then try one forbidden edit to confirm it is refused.
- [ ] **Vishwaa:** this file is `docs/PLAN.md`; commit it in the scaffold PR (prompt 13.3, step 6).

| Person | `edit` allow-list in `patchwork.json` |
| --- | --- |
| Vishwaa | `*` until the scaffold merges. Then only: root config files, `AGENTS.md`, `README.md`, `docs/*`, `scripts/*`, `packages/shared/*`, `apps/server/src/main.ts`, `apps/server/src/app.ts`, `apps/server/src/db/*`, `apps/server/src/core/*`. Also set `"npm install *": "ask"`. |
| Adnan | `packages/engine/*`, `packages/runtime/*`, `apps/server/src/drift/*`, `fixtures/drift-benchmark/dev/*` |
| Kshant | `apps/server/src/gateway/*`, `apps/server/src/snapshots/*`, `apps/server/src/verify/*`, `apps/server/src/releases/*`, `e2e/*`, `playwright.config.ts`; then `"e2e/ui/*": "deny"` as the last rule |
| Gaurav | `apps/web/*`, `fixtures/target-site/*`, `fixtures/drift-benchmark/heldout/*`, `e2e/ui/*`; then `"apps/web/package.json": "deny"` as the last rule |

Start OpenCode with `OPENCODE_CONFIG=~/.config/opencode/patchwork.json opencode` (PowerShell: `$env:OPENCODE_CONFIG="$HOME\.config\opencode\patchwork.json"; opencode`).

### Hour 0 onward

1. **Vishwaa:**
   - Clone, then `git switch -c ws/a-platform origin/integration`.
   - Start OpenCode with `OPENCODE_CONFIG` and paste §13.3 verbatim.
   - When the scaffold PR is open, someone else approves it and Vishwaa merges it into `integration`.
   - Post **CONTRACT FREEZE** with the SHA (target: hour 1.5).
2. **Gaurav:**
   - Clone, `git switch -c ws/d-editor origin/integration`, and paste §13.6 right away. It drafts ShopLite outside the repo until the freeze.
   - Copy the `frontend-design` and `web-design-guidelines` skill folders into `~/.config/opencode/skills/` by hand.
3. **Adnan and Kshant:**
   - Until the freeze, draft by hand outside the repo: Adnan the 15 dev benchmark cases, Kshant the E2E journeys.
   - After the freeze: `git fetch origin && git switch -c ws/b-engine origin/integration` (Kshant: `ws/c-delivery`), then paste §13.4 or §13.5.
4. **The loop, for everyone:**
   - The agent commits to its own branch, then asks you to push.
   - You open or update a PR into `integration`, pasting the agent's report.
   - Vishwaa merges at the windows (hours 2.5, 6, 9, 11, 14, 16) and posts the new SHA.
   - You tell your agent to merge `origin/integration`.
   - Never approve a push to `main` or `integration`, a force-push, a rebase or a reset.
5. **Hour 14:** Vishwaa posts `Review integration @ <sha>` in the Claude chat with the evidence files from §22. Claude returns findings, four agent feedback messages, a release checklist and a go/no-go. After fixes, post `Re-review integration @ <sha>` and Claude confirms each fix.

## 1. Executive summary

**Recommendation:** build PATCHWORK as a ₹0, offline-capable TypeScript monolith in which patches are declarative JSON, delivered to unchanged websites by a gateway that injects a small runtime, tracked by a multi-feature element resolver, reviewed with element-level conflict detection, verified in a real browser, released by moving a pointer, and logged in a hash-chained audit trail. The signature feature, **Drift Sentinel**, keeps fixes working when the original site redesigns itself, and proves it on a held-out benchmark against selector- and XPath-based baselines.

- **Brief coverage:** all 5 "must" statements and 7 key features in the PDF are treated as mandatory, each with an owner, a capability and tests (§2, §7).
- **Repository:** empty apart from a README skeleton and `.gitignore`, so the stack is chosen on the requirements (§3).
- **Team shape:** Dev A integrates and owns contracts and collaboration; Dev B the resolver, runtime and drift; Dev C gateway, verification and releases; Dev D the UI and the demo site. No two people edit the same file (§12, §14).
- **Time:** working end-to-end flow at hour 11, feature freeze at 14, two rehearsals, and hours 18–20 kept as contingency (§15).
- **Cost:** ₹0. No runtime LLM is needed. Your suggestion of a local model is included as an *optional*, measured "second look" for ambiguous element matches using Qwen3 on Ollama, off by default (§6).
- **Main risks:** integration timing, the cross-origin editor bridge, and resolver thresholds; each has a gate and a fallback (§19).

**Open questions for the organisers:** demo length and rubric, whether a hosted URL is required, and the rules on AI-assisted coding. **For the repo owner:** confirm all four collaborators have Write access.

The plan was approved on 10 Oct 2026. Launch steps per person are in section 0.

## 2. PATCHWORK requirements (from the PDF)

Source: `CRCE Round Problem Statements.pdf`, GDG On Campus FRCRCE, College Round, Web/App Dev track, problem 3 (13 pages, created 9 Oct 2026). The entry is quoted below exactly as written.

**Backstory (verbatim).** A critical button breaks after a deployment, a checkout flow stops working, or a website update invalidates an existing fix. Rebuilding and redeploying an entire application for a small change can be costly and risky, especially when the original developers are unavailable. Existing editing tools rarely provide a complete workflow for safely patching live websites, resolving conflicting changes, and recovering from failed releases.

**Problem statement (verbatim).** Build PATCHWORK, a platform that enables developers to modify existing websites through independently managed patches without rebuilding the original application. The system must intelligently track changes to website elements, detect conflicting or invalid patches, verify proposed changes in isolation, and support safe deployment and rollback when something goes wrong.

| ID | Source text (verbatim) | Status in source |
| --- | --- | --- |
| C1 | Modify existing websites through independently managed patches without rebuilding the original application | "must" (problem statement) |
| C2 | Intelligently track changes to website elements | "must" |
| C3 | Detect conflicting or invalid patches | "must" |
| C4 | Verify proposed changes in isolation | "must" |
| C5 | Support safe deployment and rollback when something goes wrong | "must" |
| F1 | **Visual Patching:** Modify website elements, layouts, content, and supported behaviour directly through a visual interface. | Key feature |
| F2 | **Smart Element Tracking:** Identify when website updates invalidate existing patches and locate moved elements using structural and semantic context. | Key feature |
| F3 | **Collaborative Editing:** Enable multiple developers to create, review, and merge patches while detecting conflicting changes. | Key feature |
| F4 | **Isolated Preview:** Test proposed patches without affecting the published website. | Key feature |
| F5 | **Automated Verification:** Execute browser interactions and visual checks to identify regressions before deployment. | Key feature |
| F6 | **Versioned Deployment and Rollback:** Track patch releases, detect failed changes, and restore a previously working state. | Key feature |
| F7 | **Audit Trail:** Maintain a history of modifications, deployments, conflicts, and reversions. | Key feature |

**How we treat status.** The PDF does not label anything "optional". We treat C1–C5 and all seven key features F1–F7 as mandatory and build a test for each. Everything else in this plan (the signature feature, the drift benchmark, the public tunnel) is our own enhancement and is labelled as such.

### Ambiguities and the interpretation we will use

| Ambiguity | Our interpretation | Blocks architecture? |
| --- | --- | --- |
| "Supported behaviour" is undefined | A fixed, declarative set of behaviour actions (navigate, prevent default, click another element, toggle attribute, submit form). No arbitrary JavaScript in patches. | No |
| How patches reach a site "without rebuilding" | Patches are applied at delivery time by a PATCHWORK gateway (reverse proxy that injects a small runtime), or by one script tag for sites the team owns. The original app's code is never touched. | No — decided in §8 |
| "Collaborative editing": real-time co-editing or review workflow? | Asynchronous, pull-request-style: create, review, approve, merge, with conflict detection at merge time. Real-time cursors are not required by the text. | No |
| "Intelligently" — is AI/ML required? | No. Multi-attribute similarity scoring over structural and semantic features meets the wording; no runtime LLM. | No |
| "Detect failed changes" after deploy | Post-deploy smoke run on the live channel plus runtime beacons that report patches that failed to apply. | No |
| Which websites may be patched | Only sites the team is authorised to modify (our demo shop, or a site that adds our snippet). Upstream origins are allowlisted. | No |
| Judging rubric, demo length, hosting or submission format | **Not in the PDF.** Open question for the organisers; plan defaults to a local live demo plus an optional free public tunnel. | No |
| Event rules on AI-assisted coding and disclosure | **Not in the PDF.** Open question; plan keeps accurate Git authorship and a disclosure note in the README. | No |

## 3. Repository inspection report

The repository is a blank starting point: one commit, two files, no code. There is nothing to preserve beyond the README headings and the `.gitignore`, so the stack is chosen on requirements alone (§8) and no rearchitecture is involved.

Inspected by a read-only shallow clone of `https://github.com/Adnan-Khan15/bitbandits_college_round` on 10 Oct 2026, 15:15 IST. Nothing was pushed, branched or changed.

### Verified facts

| Item | Finding |
| --- | --- |
| URL | Resolves; repository is **public**. Canonical clone URL is lower-case `bitbandits_college_round`; GitHub redirects either casing. |
| Branches | `main` only (default) |
| History | 1 commit: `b4dc792` "Initial commit: README and .gitignore", author `electrify18 <kshant.carvalho@gmail.com>`, 10 Oct 2026 12:56 IST |
| Files | `README.md`, `.gitignore` — nothing else |
| README | Title "BitBandits – College Round" and empty headings: Team, Problem Statement, Tech Stack, Setup, Usage |
| `.gitignore` | Python (`__pycache__`, `.venv`, `.pytest_cache`), Node (`node_modules`, `dist`, `.next`), `.vscode/`, `.env*` with `!.env.example`, OS junk |
| Manifests, lockfiles, entry points, frameworks, API, database, tests, lint, build, deploy config | **None exist** |
| Uncommitted changes | Not applicable (fresh clone; your local machines were not inspected) |

### Not inspectable from here

| Item | Why | What we need |
| --- | --- | --- |
| Collaborator list and each person's permission | GitHub API calls were not authorised in this session, and I did not request push credentials | Repo owner (Adnan-Khan15) confirms all four GitHub usernames have **Write** access |
| Branch protection / rulesets on `main` | Same | Owner checks Settings → Branches |
| Open issues, PRs, Actions settings | Same | None expected for a one-commit repo |

### Implications

- The `.gitignore` already covers Node and Python, so it accepts the Node/TypeScript stack in §8 unchanged. Add `test-results/`, `playwright-report/`, `data/*.db` and `artifacts/` at scaffold time.
- One author identity so far (`electrify18`). Whoever was not yet added as a collaborator must be invited **before** hour 0 (§14).
- Keep the README's existing headings and fill them in; do not replace the file.

## 4. Skill research and selection

We adopt three skills for the coding agents and two methods for planning; everything else is applied as plain engineering practice. Both named targets exist, but neither is worth installing into OpenCode: their useful parts are methods already applied in this plan.

OpenCode facts that shape this (verified in its docs): it discovers skills in `.opencode/skills/`, `.claude/skills/` or `.agents/skills/` (project) and `~/.config/opencode/skills/` (global), each a folder with a `SKILL.md` whose frontmatter needs `name` and `description`; it loads them on demand through its `skill` tool ([skills docs](https://opencode.ai/docs/skills)). It reads a root `AGENTS.md` and merges extra files listed under `instructions` in `opencode.json` ([rules docs](https://opencode.ai/docs/rules)). Bash and edit permissions can be set per pattern to `allow`, `ask` or `deny` ([permissions docs](https://opencode.ai/docs/permissions)), and `OPENCODE_CONFIG` points to a custom config file ([config docs](https://opencode.ai/docs/config)). We use the last two to enforce file ownership and Git safety on each PC (§14).

| Skill | Source | Inspected? | Licence | Purpose | Decision |
| --- | --- | --- | --- | --- | --- |
| `mvp-scoping` (Shawn Pang) | [shawnpang/startup-founder-skills/skills/mvp-scoping](https://github.com/shawnpang/startup-founder-skills) | Yes — read SKILL.md | MIT | MoSCoW, cut line, risk-first build order, >20% overrun forces a cut | **Applied by Claude** to §6, §15 and §19. Not installed for agents. |
| `founder` (Emerson Braun) | [EmersonBraun/skills/founder](https://github.com/EmersonBraun/skills) | Yes — read SKILL.md | MIT | Startup strategy across ideation, MVP, PMF, growth, fundraising | Only the MVP part (ICE scoring) is relevant; used once for feature ranking. Not installed. |
| `frontend-design` | [anthropics/skills/skills/frontend-design](https://github.com/anthropics/skills) | Yes — read SKILL.md | Apache-2.0 | Distinct visual direction, type scale, restraint, accessibility floor | **Install for Dev D** (global, copied by hand) |
| `web-design-guidelines` (Vercel) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Yes — read SKILL.md | MIT | Audits UI files against Vercel's interface guidelines (fetched live) | **Install for Dev D**; run once at feature freeze |
| `webapp-testing` | [anthropics/skills/skills/webapp-testing](https://github.com/anthropics/skills) | Yes — read SKILL.md | Apache-2.0 | Playwright testing of local apps; wait for network idle before inspecting DOM | Its tooling is Python; our stack is Node. **Practices applied** by Dev C (Playwright `webServer`, wait-for-idle); not installed. |
| Vercel React skills (`react-best-practices`, `composition-patterns`) | vercel-labs/agent-skills README | Listed only | MIT | React performance and component design | Optional for Dev D; low value at this scale |
| `software-architect`, `grill-me`, `senior-qa` (Emerson Braun) | EmersonBraun/skills README | Listed only, SKILL.md not read | MIT | Architecture, plan stress-testing, QA | Not adopted; §21 self-review covers the same ground |
| Community Playwright / e2e skills on skills.sh | several unvetted authors | No | varies | E2E testing | Not adopted; official Playwright docs are the reference |
| Skills for safe website patching, change isolation, conflict resolution, rollback | — | Searched, none found | — | — | None exist that we could verify; designed directly in §8–§11 |

**Install rule (Phase B only).** Copy a skill folder from its GitHub repo at a known commit into `~/.config/opencode/skills/<name>/` on the developer's own PC. Do not run `npx skills add` or any install script, and do not commit skills to the repository. The Docs skill in Claude's own environment was used only to write this plan.

## 5. Existing solutions and technical research

No single tool we found covers the whole PATCHWORK loop; each covers one step. Visual-editing tools apply selector-bound changes, self-healing locators live in test frameworks rather than in delivery, and rollback is a deploy-platform feature. PATCHWORK's value is joining these steps around one patch model. We do not claim that no product does this; we claim only that the tools reviewed below each cover part of it.

| Approach | How it applies or checks change | Strength | Weakness for PATCHWORK | What we take |
| --- | --- | --- | --- | --- |
| Client-side experimentation snippets, e.g. [Optimizely Web](https://docs.optimizely.com/web-experimentation/docs/snippet-order-of-activation) | A snippet on the page applies visual-editor changes by CSS selector, as soon as the selector is ready; custom code runs exactly as written | No rebuild of the site; visual editor | Docs describe no re-location when markup changes; custom code is unrestricted | Delivery-time patching through an injected runtime; **no** arbitrary code in patches |
| Edge HTML rewriting, [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/index.md) | Rewrites HTML in transit by selector | No client JS needed; free plan allows 100,000 requests/day, 10 ms CPU per request | Needs the site's traffic on Cloudflare; static selectors; no editor, review or verification | The gateway idea, but run locally in Node so it costs ₹0 and needs no account |
| Self-healing test locators, [Healenium](https://github.com/healenium/healenium-web) | Wraps Selenium; proposes healed locators above a `score-cap` match threshold | Proven idea of thresholded healing | Java + extra backend services; heals tests, not live patches | Confidence threshold and "propose, don't silently apply" |
| Similarity-based locating, [Similo](https://research.chalmers.se/publication/536319/file/536319_Fulltext.pdf) (Nass et al., [arXiv 2208.00677](https://arxiv.org/abs/2208.00677v1)) | Scores every candidate on 14 weighted attributes (tag, id, name, visible text, neighbour text, class, href, XPath, position, size…) and picks the best | On 598 elements from 40 sites it failed 72 times vs 146 for the baseline it compared against | Research algorithm, not a product; returns a best guess even when unsure | **Core of our Smart Element Tracking**, plus a runner-up margin so we can abstain |
| Visual regression, [Playwright snapshots](https://playwright.dev/docs/test-snapshots) | Screenshots compared with pixelmatch; `threshold` (default 0.2) and `maxDiffPixels` | Maintained, Apache-2.0, already our browser driver | Rendering differs by OS, so baselines must come from the same machine | Capture baseline and candidate in the **same run on the same machine**, compare with pixelmatch directly |
| BackstopJS / Lost Pixel (visual testing CLIs) | Scenario configs + screenshot diffs | Mature configs | Last npm publishes Sept 2024 and Nov 2024 respectively; another config format to learn | Not used |
| Deploy-pointer rollback, [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback) | Points domains back to an earlier, already-built deployment; no rebuild | Instant, low risk | Hobby plan can only roll back to the immediately previous deployment | Immutable releases + a live pointer; roll back to **any** earlier good release |

### Answers to the research questions

| Question | Answer used in this plan |
| --- | --- |
| Isolate changes safely | Live and preview are separate gateway ports; preview selection rides a cookie on the preview port only. The live port can only ever serve the active release. |
| Preview before publication | Preview = upstream page + (live release ∪ candidate patches), served by the same runtime the live site uses, so what you see is what ships. |
| Detect conflicting changes | Resolve every patch's anchors against one DOM snapshot; two patches on the same element and property, or one removing what another edits, conflict (§11). |
| Verify before vs after | Playwright loads baseline and candidate in one run; pixelmatch diff, with the patched elements masked, measures change **outside** the intended area. |
| Catch broken behaviour | Each patch carries scripted checks (click, fill, expect text/URL) run headless before deploy and again after deploy. |
| Promote and roll back | Immutable release records; deploy and rollback move one pointer and append audit events. |
| Stop changes to unintended origins | The gateway only forwards to the project's configured upstream origin; patches cannot contain scripts or `javascript:` URLs. |
| Browser automation | Playwright 1.64 (Apache-2.0), Chromium only for the MVP. |
| Zero cost | Everything runs locally; the only optional external service is a free Cloudflare quick tunnel (§17). |

## 6. Signature feature: Drift Sentinel

**Decision: Drift Sentinel** — when the upstream site changes, PATCHWORK detects it, re-anchors every live patch with evidence, quarantines the ones it cannot place safely, re-verifies, and ships a safe release. It wins because it answers the backstory's sharpest case ("a website update invalidates an existing fix"), reuses the resolver, verifier and release machinery we must build anyway, and its benefit can be measured against simple baselines.

### Candidates compared

Scores are 1 (poor) to 5 (strong), judged by us; "Risk to mandatory work" is scored so that 5 = low risk.

| Criterion | A. Drift Sentinel | B. Blast-radius check | C. Guarded release with auto-rollback | D. Three-way merge assistant |
| --- | --- | --- | --- | --- |
| What it is | Watch upstream, re-anchor patches with evidence, quarantine unsafe ones, re-verify, ship | Masked pixel diff proving a patch changed only its own elements | Post-deploy checks + runtime beacons trigger automatic rollback | Base/ours/theirs view with one-click resolutions |
| Relevance to brief | 5 — F2, F5, F6 and the backstory | 4 — F5 | 4 — F6 | 4 — F3 |
| User value | 5 | 4 | 4 | 3 |
| Technical substance | 5 | 3 | 3 | 3 |
| Differentiation | 4 | 3 | 2 — deploy platforms already do this | 2 |
| Feasible in our time | 4 | 5 | 4 | 4 |
| Live demo clarity | 5 — flip upstream v1→v2 on stage | 4 | 4 | 3 |
| Measurable | 5 — benchmark vs baselines | 3 | 3 | 2 |
| ₹0 compatible | 5 | 5 | 5 | 5 |
| Risk to mandatory work | 4 | 5 | 4 | 4 |
| **Total (of 45)** | **42** | **36** | **33** | **30** |

B, C and D are not discarded: a lean form of each is already required by F5, F6 and F3 and is built as core work (§11). A is the one we push past the brief.

### Mechanism

1. **Watch.** For each project path that has patches, the sentinel fetches the upstream page through Playwright every 60 s (and on "Check now") and stores a snapshot: rendered HTML, a SHA-256 of a normalised DOM, and element boxes.
2. **Detect drift.** A hash change opens a `DriftReport` against the live release.
3. **Re-anchor.** Every anchor of every live patch is resolved against the new snapshot with the resolver in §11 (Similo-style weighted score over up to 13 features, plus a runner-up margin). Each result records its per-feature evidence.
4. **Classify each patch.** `healthy` (all anchors exact), `healed` (some relocated, none ambiguous or missing), `at_risk` (any ambiguous), `broken` (any not found).
5. **Propose.** For `healed` patches, generate a new patch revision with refreshed fingerprints and send it to review. For `at_risk`/`broken` patches, propose a **quarantine release**: the live release minus those patches.
6. **Re-verify.** Run the automated verification (§11) on the quarantine release against the new upstream. If it passes, a release manager deploys it with one click (auto-deploy is a setting, off by default).
7. **Runtime safety net.** Independently, the browser runtime never applies a patch whose anchors are `ambiguous` or `not_found`, so a fix is never applied to the wrong element while humans review.

**Inputs:** live release, upstream URL paths, previous snapshot. **Outputs:** `DriftReport` (per-patch status, per-anchor `Resolution` with evidence and runner-up), proposed revisions, a quarantine release, a verification run.

### Success metric and baseline

A drift benchmark of **30 before/after HTML pairs** in `fixtures/drift-benchmark/`: renamed ids/classes, moved elements, wrapped elements, edited text, changed tags, removed elements, and look-alike decoys. 15 cases are written by Dev B for tuning; **15 held-out cases are written by Dev D** before the resolver is tuned and are never used for tuning.

| Metric | Definition |
| --- | --- |
| Re-anchor rate | Cases where the element still exists and the resolver returns it as `exact` or `relocated` |
| Wrong-target rate (critical) | Cases where the resolver returns a **different** element as `exact` or `relocated` |
| Correct-abstain rate | Removed or truly ambiguous cases returned as `not_found` or `ambiguous` |

Baselines run on the same cases: **B1** the stored CSS selector (how selector-bound editors behave), **B2** absolute XPath, **B3** Similo-style best match with no threshold or margin.

**Pass condition:** on the held-out set, our re-anchor rate is higher than B1 and B2, and our wrong-target rate is no higher than B1's and lower than B3's. Numbers are reported as measured, including any miss. We publish no target percentage in advance.

### Acceptance criteria

- Flipping the demo upstream from v1 to v2 produces a `DriftReport` within one poll (≤ 60 s) or immediately on "Check now".
- Each anchor shows its status, confidence, top contributing features and runner-up.
- A broken patch is excluded from the proposed quarantine release; that release passes verification and deploys; the live site keeps the healed fixes.
- `npm run bench` prints the metric table for ours vs B1–B3 and the dashboard shows the same numbers.
- The preview can be switched to "selector-only" mode (B1) to show the same patch failing without the resolver. This is a real mode of the runtime, not a mock.

### What it cannot reliably handle

- Elements whose text, attributes and position all change at once (a full redesign): expect `not_found`, which is the safe outcome.
- Two genuinely identical elements with identical context: expect `ambiguous`; a human must choose.
- Content rendered inside cross-origin iframes, canvas or closed shadow DOM: out of scope.
- Pages that need login or are heavily personalised: the snapshot may not match what users see.
- Thresholds are tuned on 15 cases; the held-out score is the honest estimate, and it is small-sample.

### Optional edge: LLM second look (local Qwen3, off by default)

A small local model adds value in exactly one place: breaking ties when the resolver says `ambiguous`. That is where deterministic scoring is weakest (look-alike decoys), and it is the use with published evidence: adding GPT-4 to choose among a Similo-style resolver's top candidates cut failed localisations from 70 to 40 on 804 element pairs ([Nass, Alégroth, Feldt, STVR 2024](https://research.chalmers.se/en/publication/542478)). Whether a 4B local model keeps any of that gain is unknown, so we **measure it** instead of claiming it.

| Aspect | Decision |
| --- | --- |
| Where it runs | Server only, inside drift analysis (B). Never in the browser runtime, never in conflict checks, never on the deploy path. |
| When it is called | Only for an anchor whose status is `ambiguous`; input is the stored fingerprint plus the top 3 candidates' compact features (tag, text, accessible name, neighbour text, ancestors). No full HTML, no secrets. |
| Output | JSON constrained by a schema `{ choice: 0..2 or null, reason }` via Ollama's `format` field ([docs](https://docs.ollama.com/capabilities/structured-outputs)), stored as `AssistSuggestion` (§11.9). |
| Authority | **Suggestion only.** A reviewer clicks "Accept", which creates a heal revision that still goes through review, verification and deploy. The runtime still refuses ambiguous anchors. |
| Default provider | [Ollama](https://github.com/ollama/ollama) (MIT; Windows, macOS, Linux) on the demo laptop with `qwen3:4b` (2.5 GB download; Apache-2.0 per its [model card](https://huggingface.co/Qwen/Qwen3-4B), which also documents a non-thinking mode for faster answers). Fallback tag `qwen3:1.7b` (1.4 GB) for low-RAM machines ([tags](https://ollama.com/library/qwen3)). ₹0, works offline. |
| Alternate provider | OpenRouter `:free` models. Verified limits: 20 requests/min and **50 requests/day** for accounts that have bought under 10 credits ([docs](https://openrouter.ai/docs/api/reference/limits)). Needs an account and API key; free-model availability changes; its data policy was not checked. Use only as a backup, never during the live demo. |
| Failure behaviour | Timeout 20 s or any error → no suggestion; the drift report is identical to the LLM-off case. |
| Measurement | `npm run bench -- --assist` adds a `patchwork_llm` row on the held-out set. It is shown in the demo only if it does not raise the wrong-target rate. |
| Scope and owner | *Could-have* (MoSCoW). Built by Dev B in hours 11–13 only if the hour-11 gate is green; Dev D adds one suggestion card (≈30 min). If it slips, it is cut with no effect on anything else. |

Not adopted: natural-language patch authoring ("make this button go to /checkout"). It is a generic chat feature, harder to verify, and duplicates the visual editor the brief asks for.

## 7. Requirements traceability matrix

Every mandatory requirement maps to one owner, one capability and at least one automated test; the `T-` test IDs are defined in §16. Owners: **A** Platform & Integration, **B** Patch Engine & Drift, **C** Delivery & Verification, **D** Editor UI & Demo Site. Times are build hours, not elapsed hours.

| ID | User-facing behaviour | Implementation | Acceptance criteria | Verification | Owner | Depends on | Est. | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 / F1 Visual Patching | Developer clicks an element in the preview and edits its text, attributes, style, visibility, position, inserted HTML or click/submit behaviour | Picker + inspector in the editor; postMessage bridge in runtime; declarative ops (§11) applied by the runtime via the gateway | Each of the 9 op kinds can be authored in the UI and is visible in preview without touching upstream files | T-E2E-1, T-ENG-APPLY (unit, per op) | D (UI), B (ops, bridge) | Contracts, gateway | 5 h | Med — cross-origin bridge |
| C2 / F2 Smart Element Tracking | Patch list shows each anchor as exact / relocated / ambiguous / not found with confidence | Fingerprint capture + weighted resolver with runner-up margin; runtime refuses ambiguous/not-found | Moved element in v2 is re-found; removed element is reported, not mis-applied | T-ENG-RESOLVE, T-BENCH, T-E2E-4 | B | Contracts | 4 h | Med — threshold tuning |
| C3 / F3 Collaborative Editing | Several users create patches, submit, review, approve and merge; merge shows conflicts and resolution choices | Patch revisions, reviews, role checks, merge gate calling `analyzeConflicts` on a snapshot | Two patches setting the same property block merge until resolved; author cannot approve own patch | T-API-MERGE, T-ENG-CONFLICT, T-E2E-2 | A (workflow), B (analyzer), D (UI) | Snapshots (C) | 4 h | Med |
| C3 invalid patches | Validate shows errors before submit | Zod schema + semantic rules + DOMPurify sanitiser | `javascript:` URL, `on*` attribute, script tag, unknown style property are rejected with a field path | T-VAL-1, T-API-VALIDATE | A | Contracts | 1.5 h | Low |
| C4 / F4 Isolated Preview | "Preview" opens the site with candidate patches while the live URL is unchanged | Preview gateway port + cookie-scoped manifest; live gateway serves only the active release | Same path on :4300 shows the change, on :4100 does not | T-GW-ISOLATION, T-E2E-1 | C (gateway), A (preview store) | Runtime | 2 h | Low |
| F5 Automated Verification | "Verify" runs scripted interactions and a visual diff and shows pass/warn/fail with screenshots | Playwright run: patch application status, per-patch checks, console-error diff, pixelmatch diff outside patched area | A broken check fails the run; an unrelated layout regression is flagged | T-VER-1..3, T-E2E-3 | C | Gateway, runtime | 4 h | Med — flaky screenshots |
| C5 / F6 Versioned Deployment & Rollback | Release list, deploy button, rollback to any earlier release; failed deploy auto-reverts | Immutable releases, live pointer, deploy gate (must be verified), post-deploy check + beacons, auto-rollback | Rollback restores the previous live behaviour within one page load; failed force-deploy auto-reverts | T-REL-1..3, T-E2E-3 | C | Verifier, store | 3 h | Med |
| F7 Audit Trail | Audit page lists every change, review, conflict, deploy and rollback; shows "chain intact" | Append-only, SHA-256 hash-chained `audit_events` table | Every state change writes one event; tampering a row makes chain check fail | T-AUD-1..2 | A (service, page data), D (page) | Store | 1.5 h | Low |
| SIG Drift Sentinel (enhancement) | Flip upstream v1→v2; dashboard shows healed / broken patches with evidence; quarantine release ships | Snapshot poller + `analyzeDrift` + heal proposals + quarantine release + bench harness | §6 acceptance criteria | T-DRIFT-1..2, T-BENCH | B (engine, server/drift), D (UI) | Resolver, releases, verifier | 4 h | Med |
| Demo site (support) | ShopLite v1/v2 with a real broken checkout button | Static fixture server with version switch | Bug reproducible in both versions; v2 moves and renames elements | T-E2E-4 | D | — | 1.5 h | Low |

## 8. Tech stack, cost and dependencies

One TypeScript modular monolith on Node 24 LTS, run locally, costs ₹0 and needs no accounts. TypeScript everywhere is the deciding factor: the element resolver must run identically in the browser runtime and on the server, and only one language does both.

### Decisions

| Concern | Choice | Practical alternative | Why ours |
| --- | --- | --- | --- |
| Language | TypeScript, npm workspaces | Python backend + JS frontend | Resolver code shared by browser and server; one toolchain for 4 agents |
| Backend | Fastify 5, one process, three listeners (:4000 control, :4100 live, :4300 preview) | Express; microservices | Schema-friendly, fast `inject()` tests; a monolith keeps integration simple |
| Patch delivery | Gateway reverse proxy (built-in `fetch`) injects one `<script>` into HTML responses | Server-side HTML rewriting only; Cloudflare Worker | Client runtime handles behaviour ops and re-rendered DOM; no account or DNS needed |
| Patch format | Declarative JSON ops validated by Zod; no arbitrary JS | Free-form JS/CSS snippets | Validatable, diffable, conflict-checkable, safe |
| Element tracking | Multi-feature weighted resolver (Similo-inspired) + margin + thresholds | CSS selector or XPath only | Survives renames and moves; can abstain (§6) |
| Server-side DOM | jsdom over rendered HTML captured by Playwright | Run all analysis inside Playwright | Fast, deterministic unit tests; same DOM API as browser |
| HTML sanitising | DOMPurify (with jsdom on server, native in browser) | Hand-written allowlist | Maintained, widely used |
| Persistence | SQLite via built-in `node:sqlite` (`DatabaseSync`), one file `data/patchwork.db` | Postgres; JSON files | Zero install, transactions, real history. **Caveat:** still flagged experimental in Node 24 (prints a warning); fallback is `better-sqlite3` (MIT), same SQL |
| Frontend | React 19 + Vite 8, plain CSS modules, no UI kit | Next.js; Tailwind + component kit | Single-page tool, no SSR needed; fewer deps and config files |
| Runtime bundle | esbuild → one IIFE file `patchwork-runtime.js` | Vite library mode | One command, no config |
| Browser automation | Playwright (Chromium) for snapshots, verification and E2E | Puppeteer; Selenium | One tool for three jobs; built-in test runner |
| Visual diff | pixelmatch + pngjs called directly | `toHaveScreenshot` only | We need masks computed from patched elements and our own ratios in the report |
| Live updates in UI | Polling every 2 s | SSE / WebSocket | Cloudflare quick tunnels do not support SSE; polling works everywhere |
| Runtime AI / LLM | **None in any mandatory path; optional "LLM second look" on ambiguous anchors via local Ollama + Qwen3 (§6)** | Hosted LLM writing patches or running in the page | Core stays deterministic and ₹0; the LLM is off by default, only suggests, and is measured on the benchmark |
| Auth | Seeded users picked from a menu; role checks on the server via `X-Patchwork-User` | OAuth | Brief does not require auth; stated as a limitation |

### Dependencies (latest versions on npm, checked 10 Oct 2026)

| Package | Version to pin | Licence | Used by |
| --- | --- | --- | --- |
| Node.js | 24.x LTS (24.21.0 or newer 24.x) | MIT | all |
| typescript | 5.9.3 | Apache-2.0 | all — **not** 7.0.2, released today; too new |
| fastify / @fastify/static | 5.12.5 / 10.1.6 | MIT | server |
| zod | 4.6.5 | MIT | shared |
| nanoid | 6.0.2 | MIT | shared IDs |
| jsdom | 29.1.1 | MIT | engine (node entry), server — 30.x needs Node ≥ 24.15 |
| dompurify | 3.4.16 | MPL-2.0 or Apache-2.0 | engine |
| playwright, @playwright/test | 1.64.0 | Apache-2.0 | server verify/snapshots, E2E |
| pixelmatch / pngjs | 8.0.0 / 7.0.0 | ISC / MIT | verify |
| react, react-dom | 19.3.0 | MIT | web |
| vite / @vitejs/plugin-react | 8.3.4 / 6.1.2 | MIT | web |
| esbuild | 0.28.2 | MIT | runtime build |
| tsx | 4.23.15 | MIT | running TS server in dev |
| vitest | 5.0.3 | MIT | unit + integration |
| concurrently | 10.0.6 | MIT | `npm run dev` |

All licences are permissive or weak-copyleft (DOMPurify's MPL-2.0 option applies only to its own files; we choose Apache-2.0). Any new dependency needs Dev A's approval (§14).

### Cost

| Item | Cost | Notes |
| --- | --- | --- |
| All software above | ₹0 | Open source |
| Hosting for the demo | ₹0 | Runs on one team laptop |
| Public URL (optional) | ₹0 | Cloudflare quick tunnel, no account; no uptime guarantee, 200 in-flight request cap, URL changes each start ([docs](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)) |
| Rejected: Render free web service | ₹0 but unsuitable | Spins down after 15 min idle, \~1 min cold start, local files lost on restart ([docs](https://render.com/docs/free)); RAM not stated, so Chromium may not fit |
| One-time downloads | ₹0, needs internet | `npm ci` and `npx playwright install chromium` on every PC **before** hour 0 |

## 9. System architecture

One Node process exposes three ports: the control plane (:4000) for people and tools, and two gateways that sit in front of the unchanged upstream site — :4300 serves whatever preview a cookie selects, :4100 serves only the live release.

```text
BROWSERS
  [Editor app (Gaurav, D)] <--postMessage--> [Preview iframe + runtime]     [Live site visitors + runtime]
   React SPA, :5173 dev                        picker bridge in editor mode    runtime applies the live release
          |  HTTP /api                                   |                                 |
          v                                              v                                 v
PATCHWORK SERVER (one Node process)
  [Control plane :4000 /api]                  [Preview gateway :4300 (C)]        [Live gateway :4100 (C)]
    core (A) | releases (C) | verify (C)        cookie selects the preview         serves only the live release
    snapshots (C) | drift (B) | engine lib (B)          |  proxy + inject runtime         |
          |              |             :                 v                                 v
          v              v             v (optional)   [ShopLite upstream :4200 - original app, never modified]
     [SQLite]   [Headless Chromium]  [Ollama :11434]          ^
     data/       snapshots + verify   drift only              |
     patchwork.db        |____________________________________|  snapshots read the upstream directly
```

The gateways ask the control plane (in-process, via the `ServiceRegistry`) for the manifest to inject; verification drives Chromium through the preview gateway, while snapshots read the upstream directly. Ollama is optional and only the drift module calls it.

## 10. Component responsibilities and data flow

Eight components, each owned by exactly one developer, talk only through the contracts in §11: HTTP for the browser apps, typed service interfaces inside the server, and `postMessage` between the editor and the preview.

### Repository layout and owners

```text
/                              A  package.json, package-lock.json, tsconfig.base.json, .nvmrc,
                                  .env.example, .gitignore, AGENTS.md, README.md, docs/
packages/shared/               A  types.ts, schemas.ts, api.ts, errors.ts, services.ts, constants.ts
packages/engine/               B  fingerprint, resolve, apply, conflicts, drift, bench/
packages/runtime/              B  browser runtime + editor bridge -> dist/patchwork-runtime.js
apps/server/src/main.ts        A  starts the 3 listeners, builds the ServiceRegistry
apps/server/src/app.ts         A  registers every route plugin (stubs created at scaffold)
apps/server/src/db/            A  sqlite.ts, schema.sql, migrate.ts
apps/server/src/core/          A  users, projects, patches, reviews, merge, previews, audit (+ routes)
apps/server/src/gateway/       C  proxy, HTML injection, manifest, beacons, preview cookie
apps/server/src/snapshots/     C  Playwright capture of upstream pages
apps/server/src/verify/        C  verification runner, visual diff, artifacts
apps/server/src/releases/      C  releases, deploy gate, health monitor, rollback
apps/server/src/drift/         B  sentinel poller, drift routes, quarantine proposal
apps/web/                      D  editor and dashboard SPA
fixtures/target-site/          D  ShopLite demo upstream, v1 and v2, version switch
fixtures/drift-benchmark/dev/  B  15 tuning cases
fixtures/drift-benchmark/heldout/ D 15 held-out cases
e2e/                           C  Playwright end-to-end specs (D adds e2e/ui/ only)
scripts/                       A  seed.ts, reset.ts, smoke-slice.ts, smoke-full.ts
```

### Components

| Component | Owner | Responsibility | Calls | Called by |
| --- | --- | --- | --- | --- |
| `shared` | A | Types, Zod schemas, API paths, error codes, service interfaces | — | everyone |
| `engine` | B | Capture fingerprints; resolve anchors; apply ops; detect conflicts; analyse drift | shared, jsdom (node entry only), DOMPurify | runtime, core, drift, verify |
| `runtime` | B | In the page: load manifest, resolve, apply each patch atomically, re-apply on DOM changes, report beacons, picker bridge in editor mode | engine (bundled) | gateway (served), editor (postMessage) |
| `core` | A | Users and roles, projects, patch CRUD and revisions, validation and sanitising, reviews, merge gate, previews, audit chain | shared, engine (validate, conflicts), snapshots | web, gateway, releases, drift |
| `gateway` | C | Proxy only to the configured upstream; inject runtime; serve manifest for live release or preview; record beacons | core (previews), releases (live) | browsers, verify |
| `snapshots` | C | Render upstream path in Chromium; store HTML, DOM hash, element boxes | Playwright | core (merge), drift, verify |
| `verify` | C | Baseline vs candidate runs, checks, console diff, masked pixel diff, artifacts | gateway, core (temporary previews) | releases, web |
| `releases` | C | Freeze head into a release; verify gate; deploy; post-deploy health; manual and auto rollback | verify, core (audit) | web, drift |
| `drift` | B | Poll snapshots, compute `DriftReport`, propose heals and quarantine release, serve bench results | engine, snapshots, releases | web |
| `web` | D | Editor, review, releases, drift, audit screens | HTTP API only | developers |
| `target-site` | D | Demo upstream with a real bug and a v2 redesign | — | gateway |

### Primary flow: from broken button to safe release

1. **Author.** Dev 1 opens the editor; the iframe loads `http://localhost:4300/cart` through the preview gateway with the editor bridge on. She picks the dead "Checkout" button. The runtime captures its fingerprint and sends it to the editor.
2. **Patch.** She adds `setBehavior(click → navigate /checkout, replace)` and a check (`click checkout → expectUrl /checkout`). The editor `POST`s a draft patch; core validates it with the engine and writes `patch.created` to the audit chain.
3. **Preview.** Core stores a preview (head + this draft); the iframe reloads; the gateway serves the preview manifest; the runtime resolves and applies it. The live port :4100 is untouched.
4. **Review and merge.** She submits; the reviewer approves. On merge, core asks snapshots for the latest `/cart` snapshot and runs `analyzeConflicts` against the head set. No blocking conflict → `patch.merged`.
5. **Release.** The release manager freezes head into release R3. Verify loads baseline (live R2) and candidate (R3) on the preview port, runs every patch check, diffs screenshots outside patched elements and compares console errors. Pass → R3 `verified`.
6. **Deploy.** The live pointer moves to R3; the post-deploy check runs on :4100; runtime beacons are watched for 30 s. Healthy → `deployment.healthy`. Failure → pointer moves back to R2 and `release.auto_rolled_back` is written.
7. **Drift.** Upstream switches to v2. The sentinel's next snapshot changes hash; `analyzeDrift` re-anchors R3's patches, proposes a quarantine release R4 without the broken one, verifies it, and the release manager deploys it.

## 11. Shared contracts (frozen at hour 1.5)

These definitions become `packages/shared/src/*.ts` and `apps/server/src/db/schema.sql`, written by Dev A at scaffold and frozen at hour 1.5. Nobody else edits them. A change request goes to Dev A in the team chat with the exact diff and the reason; Dev A applies it on `ws/a-platform`, merges to `integration`, and everyone merges `origin/integration` into their branch. Thresholds and limits marked *initial* may be tuned by their owner without a contract change.

### 11.1 Identity, projects, users

```ts
// packages/shared/src/types.ts  (owner: A)
export type Id = string;        // nanoid(12) with prefix: usr_ prj_ pat_ rev_ prv_ snp_ rel_ dep_ ver_ drf_ aud_
export type IsoTime = string;   // new Date().toISOString()
export type Role = 'developer' | 'reviewer' | 'release_manager';
export interface User { id: Id; name: string; role: Role }
export interface Project {
  id: Id; name: string;
  upstreamOrigin: string;       // must be listed in PW_ALLOWED_UPSTREAMS
  paths: string[];              // tracked paths, e.g. ['/', '/cart', '/checkout']
  liveReleaseId: Id | null;
  createdAt: IsoTime;
}
```

### 11.2 Element fingerprint and resolution

```ts
export interface Rect { x: number; y: number; width: number; height: number }
export interface ElementFingerprint {
  v: 1;
  tag: string;                       // lower-case
  id: string | null;
  testId: string | null;             // data-testid
  name: string | null;
  classes: string[];
  text: string;                      // normalised visible text, max 200 chars
  accessibleName: string | null;     // aria-label | aria-labelledby | label[for] | alt | title
  role: string | null;               // explicit or implicit (button, link, textbox...)
  attrs: Record<string, string>;     // allowlist: href, src, alt, title, type, placeholder, value
  cssPath: string;                   // unique selector at capture (prefers id, data-testid)
  xpath: string;                     // absolute
  ancestors: Array<{ tag: string; id: string | null; classes: string[] }>; // nearest first, max 5
  siblingIndex: number;
  neighborText: string;              // prev + next sibling text and parent label, max 200 chars
  rect: Rect | null;                 // null when captured without layout (jsdom)
  capturedAt: IsoTime;
  capturedFromHash: string;          // Snapshot.domHash, or 'runtime'
}
export type ResolutionStatus = 'exact' | 'relocated' | 'ambiguous' | 'not_found';
export interface FeatureEvidence { feature: string; weight: number; similarity: number } // similarity 0..1
export interface Resolution {
  anchorId: string;
  status: ResolutionStatus;
  confidence: number;                // 0..1 normalised weighted score of best candidate
  margin: number;                    // best minus runner-up
  elementPath: string | null;        // unique CSS path of the match in the resolved document
  evidence: FeatureEvidence[];       // best candidate, sorted by weight x similarity desc
  runnerUp: { elementPath: string; confidence: number } | null;
  mode: 'smart' | 'selector' | 'xpath';
}
```

**Resolver rule (engine, owner B).** Score = Σ(weight × similarity) ÷ Σ(weight of features present in the fingerprint). Weights adapt Similo: tag 1.5 (equal = 1, related such as `a`/`button` = 0.5), id 1.5, testId 1.5, name 1.5, text 1.5 (normalised Levenshtein), neighbourText 1.5 (word overlap), accessibleName 1.0, classes 0.5 (Jaccard), href/src 0.5, xpath 0.5, ancestors 0.5, siblingIndex 0.25, rect 0.5 (only when both sides have one). *Initial* thresholds: `exact` when the stored `cssPath` matches exactly one element and that element scores ≥ 0.90; `relocated` when best ≥ 0.65 and margin ≥ 0.15; `ambiguous` when best ≥ 0.65 and margin < 0.15; else `not_found`.

### 11.3 Patch format and lifecycle

```ts
export type TargetRef = { anchor: string };                 // key into PatchBody.anchors
export type StyleProperty = (typeof STYLE_ALLOWLIST)[number];      // constants.ts
export type AttributeName = (typeof ATTRIBUTE_ALLOWLIST)[number];  // constants.ts
export type BehaviorAction =
  | { type: 'navigate'; url: string }                      // relative or http(s) only
  | { type: 'preventDefault' }
  | { type: 'clickTarget'; target: TargetRef }
  | { type: 'toggleAttribute'; target: TargetRef; name: AttributeName }
  | { type: 'submitForm'; target: TargetRef };
export type PatchOp =                                       // 9 kinds
  | { kind: 'setText'; target: TargetRef; value: string }                             // <= 2,000 chars
  | { kind: 'setAttribute'; target: TargetRef; name: AttributeName; value: string }
  | { kind: 'removeAttribute'; target: TargetRef; name: AttributeName }
  | { kind: 'setStyle'; target: TargetRef; property: StyleProperty; value: string }
  | { kind: 'hide'; target: TargetRef }
  | { kind: 'show'; target: TargetRef }
  | { kind: 'move'; target: TargetRef; reference: TargetRef; position: 'before' | 'after' | 'prepend' | 'append' }
  | { kind: 'insertHTML'; target: TargetRef; position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend'; html: string } // sanitised, <= 10 KB
  | { kind: 'setBehavior'; target: TargetRef; event: 'click' | 'submit'; mode: 'replace' | 'before'; action: BehaviorAction };
// Property keys used by conflict detection:
// 'text' | `attr:${name}` | `style:${prop}` | 'visibility' | 'position' | `insert:${position}` | `behavior:${event}`
export interface PatchBody {
  urlPath: string;                               // '/cart' or prefix glob '/products/*'
  anchors: Record<string, ElementFingerprint>;   // 1..10, keys /^[a-z0-9_-]{1,32}$/
  ops: PatchOp[];                                // 1..50, applied in order
  checks: VerificationStep[];                    // 0..20
  baseSnapshotId: Id | null;                     // snapshot the author edited against
  baseValues: Record<number, string | null>;     // op index -> value before patching
}
export type PatchStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'merged' | 'rejected';
export interface Patch extends PatchBody {
  id: Id; projectId: Id; title: string; description: string; authorId: Id;
  status: PatchStatus;
  revision: number;               // +1 on every save; PUT must send expectedRevision
  mergedRevision: number | null;  // revision currently in head
  createdAt: IsoTime; updatedAt: IsoTime;
}
export interface Review { id: Id; patchId: Id; revision: number; reviewerId: Id; decision: 'approve' | 'request_changes' | 'comment'; comment: string; createdAt: IsoTime }
export interface FrozenPatch extends PatchBody { patchId: Id; revision: number; title: string } // carried by releases and previews
```

Lifecycle: `draft → in_review → (changes_requested → in_review)* → approved → merged`, or `rejected`. Editing a merged patch creates a new revision in `draft`; head keeps `mergedRevision` until the new revision is merged. **Roles:** developers create and edit their own patches; reviewers approve, request changes and merge, but never their own patch; release managers create, verify, deploy, force-deploy (reason required) and roll back. Everyone can preview and run verification.

### 11.4 Validation

```ts
export interface Issue { code: string; message: string; path: (string | number)[]; severity: 'error' | 'warning' }
export interface ValidationResult { valid: boolean; issues: Issue[]; sanitized: PatchBody | null } // non-null if the sanitiser changed HTML
```

Rejected with `error`: unknown op or field; anchor key referenced but missing; `on*` attributes; `srcdoc`, `style` or `formaction` via `setAttribute`; URLs that are not relative, `http(s):`, `mailto:` or `tel:`; style property not on the allowlist; style values containing `url(` (except `https:`), `expression(`, `@import`, `<` or `\`; HTML over 10 KB; text over 2,000 chars. `insertHTML` is passed through DOMPurify (no `script`, `iframe`, `object`, `embed`, event attributes); any change returns `warning` + `sanitized`.

### 11.5 Conflicts

```ts
export type ConflictType = 'SAME_PROPERTY' | 'TEXT_OVERWRITES_CHILD' | 'EDIT_HIDDEN' | 'MOVE_MOVE'
  | 'INSERT_ORDER' | 'STALE_BASE' | 'AMBIGUOUS_TARGET' | 'UNRESOLVED_TARGET';
export interface Conflict {
  id: string;                    // stable hash of type + patches + element + property
  type: ConflictType;
  severity: 'blocking' | 'warning';
  patchIds: [Id] | [Id, Id];     // candidate first
  elementPath: string | null;
  property: string | null;
  values: { base: string | null; candidate: string | null; existing: string | null } | null;
  message: string;
  resolutions: Array<'candidate_overrides' | 'withdraw_candidate_op' | 'reorder' | 'edit_patch'>;
}
export interface ConflictReport {
  projectId: Id; snapshotId: Id; checkedAt: IsoTime;
  candidateIds: Id[]; againstIds: Id[];
  resolutions: Record<Id, Resolution[]>;   // per patch
  conflicts: Conflict[];
  blocking: boolean;
}
export interface ConflictResolutionChoice { conflictId: string; choice: Conflict['resolutions'][number]; note: string }
```

| Type | Rule (same snapshot, anchors resolved to element identities) | Severity |
| --- | --- | --- |
| SAME\_PROPERTY | Same element and property key, different values | blocking |
| TEXT\_OVERWRITES\_CHILD | `setText` on an element whose descendant another patch targets | blocking |
| MOVE\_MOVE | Both patches move the same element | blocking |
| AMBIGUOUS\_TARGET / UNRESOLVED\_TARGET | An anchor of the candidate is `ambiguous` / `not_found` | blocking |
| EDIT\_HIDDEN | One patch hides an element another edits (or its ancestor) | warning |
| INSERT\_ORDER | Both insert at the same element and position | warning |
| STALE\_BASE | Candidate's `baseValues[i]` differs from the value after head is applied | warning |

A blocking conflict stops merge (`409 MERGE_BLOCKED`) unless the reviewer sends a `ConflictResolutionChoice` for it; `candidate_overrides` places the candidate after the existing patch in head order, so its value wins. Every detection and choice is audited.

### 11.6 Previews and the browser runtime

```ts
export interface PreviewSpec {
  base: 'head' | 'live' | { releaseId: Id };
  include: Id[]; exclude: Id[];
  draft: (PatchBody & { title: string }) | null;
  resolverMode: 'smart' | 'selector';            // 'selector' = baseline B1, for the demo contrast
}
export interface Preview { id: Id; projectId: Id; spec: PreviewSpec; createdBy: Id; createdAt: IsoTime; expiresAt: IsoTime }
export interface RuntimeManifest {
  channel: 'live' | 'preview';
  projectId: Id; releaseId: Id | null; previewId: Id | null;
  resolverMode: 'smart' | 'selector';
  patches: FrozenPatch[];                          // apply order
  editor: { enabled: boolean; allowedOrigin: string | null };
  beaconUrl: '/__patchwork/beacon';
  thresholds: { exact: number; relocate: number; margin: number };
}
export interface RuntimePatchStatus {
  patchId: Id; revision: number; applied: boolean;
  reason: 'ok' | 'path_mismatch' | 'anchor_ambiguous' | 'anchor_not_found' | 'op_error';
  resolutions: Resolution[]; affectedRects: Rect[]; error: string | null;
}
export interface RuntimeStatus { ready: boolean; manifestHash: string; patches: RuntimePatchStatus[] } // window.__PATCHWORK__.status
export type BeaconEvent =
  | { type: 'patch_applied' | 'patch_skipped'; patchId: Id; revision: number; reason: RuntimePatchStatus['reason'] }
  | { type: 'js_error'; message: string; source: string | null; patchwork: boolean };
export interface BeaconPayload { channel: 'live' | 'preview'; projectId: Id; releaseId: Id | null; previewId: Id | null; path: string; events: BeaconEvent[] }
// Editor bridge (postMessage). Runtime accepts messages only from manifest.editor.allowedOrigin;
// editor accepts messages only from the preview origin (PW_PREVIEW_ORIGIN).
export type EditorToRuntime =
  | { source: 'patchwork-editor'; type: 'pick:start' | 'pick:stop' }
  | { source: 'patchwork-editor'; type: 'highlight'; anchor: ElementFingerprint | null };
export type RuntimeToEditor =
  | { source: 'patchwork-runtime'; type: 'ready'; status: RuntimeStatus; path: string }
  | { source: 'patchwork-runtime'; type: 'picked'; fingerprint: ElementFingerprint; elementPath: string;
      current: { text: string; attrs: Record<string, string>; styles: Record<string, string> } };
```

Runtime rules: apply patches in manifest order; for each patch resolve **all** anchors first and apply only if none is `ambiguous` or `not_found` (atomic per patch); mark touched elements `data-pw-applied="<patchId>:<rev>"` so re-application is idempotent; re-apply on DOM mutation (debounced 50 ms, at most 20 times per page); set `window.__PATCHWORK__ = { status }` and dispatch `patchwork:ready`; anti-flicker style hides `body` until ready or 800 ms, whichever first.

### 11.7 Snapshots and verification

```ts
export interface Snapshot { id: Id; projectId: Id; path: string; domHash: string; html: string;
  boxes: Record<string, Rect>; capturedAt: IsoTime }        // boxes keyed by elementPath, visible elements only
export type VerificationStep =
  | { action: 'goto'; path: string }
  | { action: 'click'; target: string }                    // CSS selector, or 'anchor:<key>' resolved by the runtime
  | { action: 'fill'; target: string; value: string }
  | { action: 'expectText'; target: string; contains: string }
  | { action: 'expectVisible'; target: string }
  | { action: 'expectHidden'; target: string }
  | { action: 'expectUrl'; contains: string };
export interface StepResult { patchId: Id | null; index: number; step: VerificationStep; ok: boolean; error: string | null; screenshot: string | null; durationMs: number }
export interface VisualResult { path: string; baseline: string; candidate: string; diff: string;   // artifact file names
  diffPixels: number; totalPixels: number; outsideMaskRatio: number; layoutChanging: boolean; outcome: 'pass' | 'warn' | 'fail' }
export type VerificationSubject = { kind: 'preview'; previewId: Id } | { kind: 'release'; releaseId: Id } | { kind: 'live' };
export interface VerificationRun {
  id: Id; projectId: Id; subject: VerificationSubject;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  startedAt: IsoTime; finishedAt: IsoTime | null;
  patchApplication: RuntimePatchStatus[]; steps: StepResult[]; visual: VisualResult[];
  newConsoleErrors: string[]; summary: string;
}
```

A run **fails** if any step fails, any patch is not applied for a reason other than `path_mismatch`, the candidate has console errors the baseline lacks, or any visual result is `fail`. Visual outcome (*initial*): mask = patched elements' boxes + 8 px; `outsideMaskRatio` ≤ 0.002 → pass; above that → `warn` if the patch set contains a layout-changing op (`hide`, `show`, `move`, `insertHTML`, or `setStyle` on display/size/margin/padding/position), else `fail`. Baseline and candidate are captured in the same run on the same machine at 1280×800.

### 11.8 Releases, deployments, rollback

```ts
export type ReleaseStatus = 'candidate' | 'verifying' | 'verified' | 'verification_failed' | 'live' | 'superseded' | 'rolled_back';
export interface Release {
  id: Id; projectId: Id; number: number;           // R1, R2...
  patches: FrozenPatch[];                          // immutable after creation
  manifestHash: string;                            // sha256 of canonical JSON of patches
  status: ReleaseStatus; parentReleaseId: Id | null;
  origin: 'head' | 'quarantine' | 'manual'; note: string;
  createdBy: Id; createdAt: IsoTime; verificationRunId: Id | null;
}
export type DeploymentKind = 'deploy' | 'force_deploy' | 'rollback' | 'auto_rollback';
export interface Deployment {
  id: Id; projectId: Id; releaseId: Id; previousReleaseId: Id | null;   // rollback metadata
  kind: DeploymentKind; status: 'in_progress' | 'healthy' | 'failed' | 'rolled_back';
  reason: string; actorId: Id | 'system';
  startedAt: IsoTime; endedAt: IsoTime | null; healthRunId: Id | null;
}
```

Deploy = one SQL transaction moving `projects.live_release_id` and inserting the deployment. Only `verified` releases deploy unless `force: true` with a reason (release manager only). Health check (*initial*): post-deploy verification on :4100 plus a 30 s beacon window; failure if the run fails or ≥ 3 `patch_skipped`/`js_error (patchwork: true)` events arrive. On failure the pointer returns to `previousReleaseId` (`auto_rollback`). Manual rollback may target any earlier release that was ever `live` and `healthy`.

### 11.9 Drift and benchmark

```ts
export type PatchHealth = 'healthy' | 'healed' | 'at_risk' | 'broken';
export interface AssistSuggestion { anchorId: string; provider: 'ollama' | 'openrouter'; model: string;
  choice: string | null;            // elementPath of the suggested candidate, or null = "none of these"
  reason: string;                   // <= 300 chars, shown to the reviewer
  latencyMs: number }
export interface DriftPatchResult { patchId: Id; revision: number; health: PatchHealth; resolutions: Resolution[];
  proposedFingerprints: Record<string, ElementFingerprint> | null;
  assist: AssistSuggestion[] }      // empty unless PW_ASSIST_PROVIDER is set and an anchor was ambiguous
export interface DriftReport { id: Id; projectId: Id; releaseId: Id; path: string; previousSnapshotId: Id | null;
  snapshotId: Id; createdAt: IsoTime; results: DriftPatchResult[]; quarantineReleaseId: Id | null }
export interface BenchRow { method: 'patchwork' | 'patchwork_llm' | 'css_selector' | 'xpath' | 'best_match_no_threshold';
  set: 'dev' | 'heldout'; cases: number; reanchorRate: number; wrongTargetRate: number; correctAbstainRate: number }
```

### 11.10 Audit trail

```ts
export type AuditType = 'patch.created' | 'patch.updated' | 'patch.submitted' | 'patch.reviewed' | 'patch.merged'
  | 'patch.rejected' | 'conflict.detected' | 'conflict.resolved' | 'preview.created' | 'verification.finished'
  | 'release.created' | 'release.deployed' | 'release.force_deployed' | 'deployment.healthy' | 'deployment.failed'
  | 'release.rolled_back' | 'release.auto_rolled_back' | 'drift.detected' | 'patch.heal_proposed' | 'release.quarantine_proposed';
export interface AuditEvent {
  seq: number; id: Id; projectId: Id; type: AuditType; actorId: Id | 'system';
  subject: { type: 'patch' | 'release' | 'deployment' | 'preview' | 'verification' | 'drift'; id: Id };
  data: Record<string, unknown>; prevHash: string; hash: string; createdAt: IsoTime;
}
// hash = sha256hex(prevHash + '\n' + canonicalJson({seq,id,projectId,type,actorId,subject,data,createdAt}))
// first prevHash = '0'.repeat(64); events are only ever INSERTed.
```

### 11.11 Errors

```ts
export type ErrorCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'STALE_REVISION'
  | 'MERGE_BLOCKED' | 'VERIFICATION_REQUIRED' | 'UPSTREAM_UNREACHABLE' | 'NOT_IMPLEMENTED' | 'INTERNAL';
export interface ApiError { error: { code: ErrorCode; message: string; details?: unknown; requestId: string } }
// 400 VALIDATION_FAILED · 403 FORBIDDEN · 404 NOT_FOUND · 409 INVALID_STATE | STALE_REVISION | MERGE_BLOCKED | VERIFICATION_REQUIRED
// 502 UPSTREAM_UNREACHABLE · 501 NOT_IMPLEMENTED · 500 INTERNAL. Successful responses are the bare object or { items: T[] }.
```

### 11.12 HTTP API (control plane :4000, prefix `/api`, header `X-Patchwork-User: <userId>`)

| Method & path | Body | Returns | Owner |
| --- | --- | --- | --- |
| GET `/users` | — | `{items: User[]}` | A |
| GET `/projects`, GET `/projects/:pid` | — | `Project` | A |
| GET `/projects/:pid/patches?status=` | — | `{items: Patch[]}` | A |
| POST `/projects/:pid/patches` | `{title, description} & PatchBody` | `Patch` (draft) | A |
| GET / PUT `/patches/:id` | PUT: `{expectedRevision, title?, description?} & Partial<PatchBody>` | `Patch` | A |
| POST `/patches/:id/validate` | — | `ValidationResult` | A (calls B) |
| POST `/patches/:id/submit` | — | `Patch` | A |
| POST `/patches/:id/reviews` | `{decision, comment}` | `Review` | A |
| POST `/patches/:id/merge` | `{choices: ConflictResolutionChoice[]}` | `{patch, report: ConflictReport}` or 409 | A (calls B, C) |
| POST `/projects/:pid/conflicts` | `{candidateIds: Id[]}` | `ConflictReport` | A |
| POST `/projects/:pid/previews` | `PreviewSpec` | `{preview, url}` | A |
| PUT `/previews/:id` | `PreviewSpec` | `{preview, url}` | A |
| GET `/projects/:pid/audit?type=&limit=` | — | `{items: AuditEvent[]}` | A |
| GET `/projects/:pid/audit/verify` | — | `{valid, brokenAtSeq}` | A |
| POST `/projects/:pid/snapshots` | `{path}` | `Snapshot` (html omitted) | C |
| GET / POST `/projects/:pid/releases` | POST: `{note}` (freezes head) | `Release` | C |
| POST `/releases/:id/verify` | — | `VerificationRun` (queued) | C |
| POST `/releases/:id/deploy` | `{force, reason}` | `Deployment` | C |
| POST `/projects/:pid/rollback` | `{toReleaseId?, reason}` | `Deployment` | C |
| GET `/projects/:pid/deployments` | — | `{items: Deployment[]}` | C |
| POST `/projects/:pid/verifications`, GET `/verifications/:id` | `{subject}` | `VerificationRun` | C |
| GET `/artifacts/:file` | — | PNG | C |
| POST `/projects/:pid/drift/check`, GET `/projects/:pid/drift` | — | `{items: DriftReport[]}` | B |
| POST `/drift/:id/quarantine` | — | `Release` | B (calls C) |
| GET `/bench` | — | `{items: BenchRow[]}` | B |

One more B route (optional LLM feature): POST `/drift/:id/assist/accept` with `{patchId, anchorId}` returns the heal revision `Patch` created through `core.proposeHeal` from the suggested candidate.

Gateway routes on :4100 and :4300 (owner C): `GET /__patchwork/runtime.js`, `GET /__patchwork/manifest.json`, `POST /__patchwork/beacon`, `GET /__patchwork/preview/:id?path=/cart&editor=1` (preview port only: sets `pw_preview` cookie, HttpOnly, SameSite=Lax, then redirects), everything else proxied to `project.upstreamOrigin`. HTML responses get `<script src="/__patchwork/runtime.js" data-pw-project="…"></script>` before `</head>`; upstream is requested with `accept-encoding: identity`; `content-length` is recomputed.

### 11.13 Server service interfaces

```ts
// packages/shared/src/services.ts (owner A). main.ts builds one ServiceRegistry; modules receive it, never import each other's files.
export interface AuditService {
  append(e: Omit<AuditEvent, 'seq' | 'id' | 'prevHash' | 'hash' | 'createdAt'>): AuditEvent;
  list(projectId: Id, opts?: { type?: AuditType; limit?: number }): AuditEvent[];
  verifyChain(projectId: Id): { valid: boolean; brokenAtSeq: number | null };
}
export interface CoreService {
  getProject(id: Id): Project | null;
  getPatch(id: Id): Patch | null;
  listHead(projectId: Id): FrozenPatch[];                 // merged revisions, merge order
  createPreview(projectId: Id, spec: PreviewSpec, actorId: Id): Preview;
  getPreview(id: Id): Preview | null;
  manifestForPreview(previewId: Id): RuntimeManifest;
  // Drift heal: new revision of a merged patch with refreshed anchors, status 'in_review', audited
  proposeHeal(patchId: Id, anchors: Record<string, ElementFingerprint>, actorId: Id | 'system', note: string): Patch;
}
export interface SnapshotService {
  capture(projectId: Id, path: string): Promise<Snapshot>;
  latest(projectId: Id, path: string): Snapshot | null;
  get(id: Id): Snapshot | null;
}
export interface VerifyService {
  start(projectId: Id, subject: VerificationSubject, actorId: Id): VerificationRun;          // returns queued; runs async
  runToCompletion(projectId: Id, subject: VerificationSubject, actorId: Id): Promise<VerificationRun>;
  get(id: Id): VerificationRun | null;
}
export interface ReleaseService {
  create(projectId: Id, input: { origin: Release['origin']; patches?: FrozenPatch[]; note: string }, actorId: Id): Release;
  get(id: Id): Release | null; list(projectId: Id): Release[]; live(projectId: Id): Release | null;
  manifestForLive(projectId: Id): RuntimeManifest;
  deploy(releaseId: Id, actorId: Id, opts: { force: boolean; reason: string }): Promise<Deployment>;
  rollback(projectId: Id, toReleaseId: Id | null, actorId: Id, reason: string): Promise<Deployment>;
  recordBeacon(p: BeaconPayload): void;
}
export interface DriftService {
  check(projectId: Id, actorId: Id | 'system'): Promise<DriftReport[]>;
  list(projectId: Id): DriftReport[];
  proposeQuarantine(reportId: Id, actorId: Id): Promise<Release>;
  bench(): BenchRow[];
}
export interface ServiceRegistry { audit: AuditService; core: CoreService; snapshots: SnapshotService;
  verify: VerifyService; releases: ReleaseService; drift: DriftService }
```

### 11.14 Engine public API (owner B)

```ts
// packages/engine/src/index.ts  (browser-safe: no Node imports)
export function captureFingerprint(el: Element, opts?: { withRect?: boolean; capturedFromHash?: string }): ElementFingerprint;
export function uniqueCssPath(el: Element): string;
export function resolveAnchor(doc: Document, anchorId: string, fp: ElementFingerprint,
  opts?: { mode?: 'smart' | 'selector' | 'xpath'; thresholds?: RuntimeManifest['thresholds']; rects?: Record<string, Rect> }): Resolution;
export function applyPatch(doc: Document, patch: FrozenPatch, opts: { mode: 'smart' | 'selector'; thresholds: RuntimeManifest['thresholds'] }): RuntimePatchStatus;
// (patch validation is NOT in the engine; it lives in core, owner A, see below)
export function analyzeConflicts(doc: Document, against: FrozenPatch[], candidates: FrozenPatch[]):
  Pick<ConflictReport, 'candidateIds' | 'againstIds' | 'resolutions' | 'conflicts' | 'blocking'>;
export function analyzeDrift(doc: Document, patches: FrozenPatch[], rects?: Record<string, Rect>): DriftPatchResult[];
// packages/engine/src/node.ts  (Node only)
export function documentFromHtml(html: string, url: string): { document: Document; window: Window };
// apps/server/src/core/validate.ts  (owner A, uses zod schemas + DOMPurify on a jsdom window)
export function validatePatchBody(body: unknown): ValidationResult;
```

### 11.15 Database schema

```sql
-- apps/server/src/db/schema.sql (owner A). JSON columns are TEXT. Times are ISO strings.
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL);
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, upstream_origin TEXT NOT NULL,
  paths_json TEXT NOT NULL, live_release_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE patches (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  author_id TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, merged_revision INTEGER,
  merge_order INTEGER, body_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE patch_revisions (patch_id TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL,
  body_json TEXT NOT NULL, author_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (patch_id, revision));
CREATE TABLE reviews (id TEXT PRIMARY KEY, patch_id TEXT NOT NULL, revision INTEGER NOT NULL, reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL, comment TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE previews (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, spec_json TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE snapshots (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, dom_hash TEXT NOT NULL,
  html TEXT NOT NULL, boxes_json TEXT NOT NULL, captured_at TEXT NOT NULL);
CREATE TABLE releases (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, number INTEGER NOT NULL, patches_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL, status TEXT NOT NULL, parent_release_id TEXT, origin TEXT NOT NULL, note TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, verification_run_id TEXT, UNIQUE (project_id, number));
CREATE TABLE deployments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, release_id TEXT NOT NULL, previous_release_id TEXT,
  kind TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL, started_at TEXT NOT NULL,
  ended_at TEXT, health_run_id TEXT);
CREATE TABLE verification_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, subject_json TEXT NOT NULL, status TEXT NOT NULL,
  result_json TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE drift_reports (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, release_id TEXT NOT NULL, path TEXT NOT NULL,
  previous_snapshot_id TEXT, snapshot_id TEXT NOT NULL, results_json TEXT NOT NULL, quarantine_release_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE runtime_events (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, channel TEXT NOT NULL,
  release_id TEXT, preview_id TEXT, path TEXT NOT NULL, type TEXT NOT NULL, patch_id TEXT, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE audit_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL,
  type TEXT NOT NULL, actor_id TEXT NOT NULL, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, data_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL, hash TEXT NOT NULL, created_at TEXT NOT NULL);
```

Table owners for queries: A — users, projects, patches, patch\_revisions, reviews, previews, audit\_events; C — snapshots, releases, deployments, verification\_runs, runtime\_events; B — drift\_reports. Each owner writes its own small repository module in its own folder.

### 11.16 Fixtures and environment

```text
fixtures/drift-benchmark/<dev|heldout>/<case-id>/
  before.html   after.html
  case.json  {"id": "moved-into-footer", "category": "renamed|moved|wrapped|text|tag|removed|decoy",
              "targetBefore": "<CSS selector unique in before.html>",
              "expectedAfter": "<CSS selector unique in after.html>" | null, "notes": "..."}
```

```bash
# .env.example (owner A)
PW_CONTROL_PORT=4000
PW_LIVE_PORT=4100
PW_PREVIEW_PORT=4300
PW_TARGET_PORT=4200
PW_PROJECT_ID=prj_shoplite         # the one project the live/preview gateways serve (MVP)
PW_ALLOWED_UPSTREAMS=http://localhost:4200
PW_EDITOR_ORIGIN=http://localhost:5173
PW_PREVIEW_ORIGIN=http://localhost:4300
PW_DB_PATH=./data/patchwork.db
PW_ARTIFACTS_DIR=./data/artifacts
PW_DRIFT_POLL_SECONDS=60
PW_HEALTH_WINDOW_SECONDS=30
PW_SLICE_MODE=0                    # 1 only before hour 11: lets unverified releases deploy for the slice
PW_ASSIST_PROVIDER=none            # none | ollama | openrouter
PW_ASSIST_MODEL=qwen3:4b           # ollama tag, or an OpenRouter ':free' model id
PW_OLLAMA_URL=http://localhost:11434
PW_ASSIST_TIMEOUT_MS=20000
OPENROUTER_API_KEY=                # only if provider=openrouter; never commit
```

### 11.17 Module dependency rules

- `shared` imports nothing internal. `engine` imports only `shared`. `runtime` imports `engine` and `shared` and must not pull in jsdom or any Node module.
- Server modules import `shared`, `engine` and their own folder only; cross-module calls go through `ServiceRegistry`.
- `apps/web` imports `shared` types only and talks to the server over HTTP and to the preview over `postMessage`.
- Only Dev A edits any `package.json`, `package-lock.json`, `tsconfig*.json`, `apps/server/src/main.ts` or `app.ts`.

### 11.18 First integrated slice (gate at hour 6)

`npm run smoke:slice` must pass on Dev A's machine from a clean clone of `integration`: seeded project; a `setText` patch created by API appears on `:4300/cart` and not on `:4100/cart`; it is merged, frozen into R1, deployed (verification may still be a pass-through stub) and appears on `:4100`; rollback to "no release" removes it; the audit API returns the chain with `valid: true`.

## 12. Four workstreams

The split follows module boundaries so that no two people ever edit the same file. Dev A is the integration owner with about 8.5 h of feature work, leaving roughly 4 h for reviews, merges and integration runs. Assignments: **Dev A = Vishwaa** (validation, previews, merge/conflict workflow, audit, and integration owner), **Dev B = Adnan** (core patch-processing engine, runtime, Drift Sentinel), **Dev C = Kshant** (gateway, verification, release, rollback and regression E2E), **Dev D = Gaurav** (frontend, user workflow, demo site). Adnan owns the repository, so he does the one-time GitHub settings in §14 even though Vishwaa merges. If the team would rather Kshant integrate, swap workstreams A and C whole; never split one.

| Field | Dev A — Platform & Integration | Dev B — Patch Engine & Drift | Dev C — Delivery & Verification | Dev D — Editor UI & Demo Site |
| --- | --- | --- | --- | --- |
| Objective | Scaffold, contracts, data, collaboration workflow, audit; keep `integration` green | Element tracking, op application, conflicts, browser runtime, Drift Sentinel | Gateway, isolated preview delivery, verification, releases, rollback, E2E | Everything the developer sees, plus the demo upstream site |
| Requirements owned | C3 workflow + validation, F7, parts of C1/C4 | C2/F2, conflict analysis (F3), op application (F1), SIG | C4/F4, F5, C5/F6 | F1 UI, F3 UI, F6/F7 screens, SIG UI, demo site |
| Owns (paths) | root config files, `AGENTS.md`, `README.md`, `docs/`, `scripts/`, `packages/shared/`, `apps/server/src/{main.ts,app.ts,db/,core/}` | `packages/engine/`, `packages/runtime/`, `apps/server/src/drift/`, `fixtures/drift-benchmark/dev/` | `apps/server/src/{gateway,snapshots,verify,releases}/`, `e2e/` (except `e2e/ui/`), `playwright.config.ts` | `apps/web/`, `fixtures/target-site/`, `fixtures/drift-benchmark/heldout/`, `e2e/ui/` |
| Must not edit | Others' folders | Anything outside its paths, any `package.json` | Anything outside its paths, any `package.json` | Anything outside its paths, any `package.json` |
| Upstream dependencies | none | shared (H1.5) | shared (H1.5), runtime bundle (H4), core previews (H4) | shared (H1.5), API stubs (H1.5), runtime bridge (H5) |
| Key interfaces | `CoreService`, `AuditService`, HTTP §11.12 (A rows) | Engine API §11.14, runtime rules §11.6, `DriftService` | `SnapshotService`, `VerifyService`, `ReleaseService`, gateway routes | HTTP API §11.12, bridge messages §11.6 |
| First deliverable | Scaffold + frozen contracts + route stubs on `integration` (H1.5) | `resolveAnchor` + `applyPatch(setText)` + runtime bundle (H4) | Gateway live/preview serving a manifest (H4) | ShopLite v1/v2 (H1.5), held-out cases (H2.5), app shell (H4) |
| Unit tests | validation rules, audit hash chain, patch state machine | resolver per feature, thresholds, every op kind, conflict rules, drift classes | HTML injection, manifest choice, visual mask maths, deploy state machine | API client, op-form → op JSON mapping |
| Integration tests | `fastify.inject` on every A route; merge blocked by conflict | runtime bundle in Playwright against fixtures | gateway isolation, verify run on fixtures, deploy → health → auto-rollback | — |
| E2E | `smoke:slice`, `smoke:full` | `npm run bench` | `e2e/*.spec.ts` (journeys 1–4) | `e2e/ui/editor.spec.ts` |
| Build estimate | 8.5 h features + \~4 h integration | 11.5 h | 11.5 h | 12 h |
| Completion checkpoint | H6 slice gate; H11 full-flow gate | H6 slice; H11 conflicts + drift report | H6 slice; H11 verify + rollback | H6 shell + patch list; H11 all screens |
| Definition of done | Owned tests pass; PR merged by A after review; no edits outside paths; acceptance criteria in prompt met | same | same | same |
| Fallback if late | Drop audit UI filters; keep chain verify | Drop `move` and `insertHTML` positions other than `beforeend`; drift without heal proposals | Visual diff without mask (warn only); health = post-deploy run only | Inspector forms for text/attr/style/hide/behavior only; drift page as table |

**Unavoidable sequence.** Contracts (A) → engine resolve/apply (B) → runtime bundle (B) → gateway (C) → editor bridge (D) → verification (C) → releases (C) → drift (B). Everyone builds against stubs and fixtures until the real dependency lands; stubs are created by Dev A at scaffold and replaced only by their owner.

## 13. OpenCode prompts

Each developer pastes **only their own prompt** into OpenCode after finishing the setup in §14. All four prompts rely on two files Dev A commits at scaffold: `AGENTS.md` (13.1, read automatically by OpenCode) and `docs/PLAN.md` (this document exported to Markdown). Agents may commit to their own branch; pushing asks the human first; no agent ever merges.

### 13.1 Proposed `AGENTS.md` (committed by Dev A at scaffold)

```markdown
# PATCHWORK — rules for every coding agent

Product: PATCHWORK, a platform to patch existing websites through independently managed,
reviewed, verified and reversible patches. Source of truth: docs/PLAN.md (architecture,
contracts, schedule) and packages/shared (types). If they disagree, STOP and report.

## Before you edit anything
1. Run: git branch --show-current ; git status --short ; git fetch origin ; git log --oneline -5
2. You must be on YOUR branch (ws/a-platform | ws/b-engine | ws/c-delivery | ws/d-editor).
3. The working tree must be clean or contain only files inside YOUR paths.
4. Otherwise STOP and report the exact output. Do not "fix" Git state yourself.

## Ownership
- Edit only the paths your prompt lists. Everything else is read-only to you.
- Only Dev A edits: any package.json, package-lock.json, tsconfig*.json, .env.example,
  AGENTS.md, packages/shared/**, apps/server/src/main.ts, apps/server/src/app.ts, db/schema.sql.
- Need a dependency, a contract change, or a change in someone else's file? STOP and write
  a change request: file, exact diff, reason. Never work around a contract.

## Commands
- Allowed: npm test, npm run <script>, npx tsc, npx vitest, npx playwright test,
  git status/diff/log/fetch/add/commit.
- Ask the human first: git push origin <your-branch>, git merge origin/integration, long-running servers.
- NEVER: git push to main or integration, git push --force / -f, git reset --hard, git rebase, git clean -fd,
  git checkout -- on others' files, merging any other ws/* branch, npm install <pkg>, deleting files
  outside your paths, editing .git/, writing secrets to files.

## Quality bar
- TypeScript strict; no `any` in exported signatures; no stubs left in code you mark done.
- Every exported function has a unit test. Run `npm run typecheck && npm test` before reporting done.
- No mock data presented as real results. No fake API responses outside tests.
- Errors use the ApiError shape in packages/shared/src/errors.ts.

## Reporting (end of every task)
STATUS: done | blocked | partial
BRANCH: <name> @ <short sha>
CHANGED: <files>
TESTS: <command> -> <pass/fail counts>
ACCEPTANCE: <each criterion: met / not met>
OPEN ISSUES / CHANGE REQUESTS: <list or none>
```

### 13.2 Per-PC OpenCode permissions (not committed)

Each developer saves this as `~/.config/opencode/patchwork.json`, replaces the `edit` allow-list with their own paths from §12, and starts OpenCode with `OPENCODE_CONFIG=~/.config/opencode/patchwork.json opencode` (PowerShell: `$env:OPENCODE_CONFIG="$HOME\.config\opencode\patchwork.json"; opencode`). Syntax follows [OpenCode permissions](https://opencode.ai/docs/permissions); the last matching rule wins. **Test once at setup** that a denied edit is refused, because the docs do not state how `*` matches nested folders.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": {
      "*": "deny",
      "packages/engine/*": "allow",
      "packages/runtime/*": "allow",
      "apps/server/src/drift/*": "allow",
      "fixtures/drift-benchmark/dev/*": "allow"
    },
    "bash": {
      "*": "ask",
      "npm test*": "allow", "npm run *": "allow", "npx tsc*": "allow", "npx vitest*": "allow",
      "npx playwright test*": "allow",
      "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git fetch*": "allow",
      "git branch --show-current": "allow", "git add *": "allow", "git commit *": "allow",
      "git push *": "ask", "git merge *": "ask",
      "git push --force*": "deny", "git push -f*": "deny", "git push origin main*": "deny", "git push origin integration*": "deny",
      "git reset --hard*": "deny", "git rebase*": "deny", "git clean*": "deny",
      "npm install *": "deny", "npm i *": "deny", "rm -rf *": "deny"
    }
  }
}
```

The example is Dev B's allow-list. Dev A sets `npm install *` to `ask` and allows its own paths plus the scaffold stub paths until the scaffold PR merges.

### 13.3 Prompt for Vishwaa (Dev A) — Platform, validation, preview & conflict workflow, integration

```text
You are the coding agent for Dev A (Platform & Integration owner) on PATCHWORK, a platform that lets
developers modify existing websites through independently managed patches without rebuilding the
original application: visual patching, smart element tracking, collaborative review with conflict
detection, isolated preview, automated verification, versioned deployment with rollback, audit trail.

Repository: https://github.com/Adnan-Khan15/BitBandits_college_round
Base branch: integration (all PRs go here; main only receives integration at hours 16 and 18).
Your branch: ws/a-platform. Your human: Vishwaa.
Team: Dev A Vishwaa (you: platform, validation, previews, merge/conflict workflow, audit, integration),
Dev B Adnan (engine + drift), Dev C Kshant (gateway, verification, releases/rollback, regression E2E),
Dev D Gaurav (web UI + demo site).

STEP 0 - INSPECT (read-only). Run: git branch --show-current; git status --short; git fetch origin;
git log --oneline -5; ls -la. Read README.md, AGENTS.md and docs/PLAN.md if present (at first only
README.md exists; the human gives you docs/PLAN.md to commit). Expected: branch ws/a-platform, clean
tree, origin/integration = 1 commit with README.md and .gitignore. Anything else: STOP and report.

YOU OWN: package.json (root and every workspace), package-lock.json, tsconfig*.json, .nvmrc, .env.example,
.gitignore, AGENTS.md, README.md, docs/**, scripts/**, packages/shared/**, apps/server/src/main.ts,
apps/server/src/app.ts, apps/server/src/db/**, apps/server/src/core/**.
SCAFFOLD EXCEPTION: in Phase 1 only, you also create the STUB files listed below inside other owners'
folders. After the scaffold PR merges you never edit their folders again.
YOU MUST NOT EDIT after scaffold: packages/engine/**, packages/runtime/**,
apps/server/src/{gateway,snapshots,verify,releases,drift}/**, apps/web/**, fixtures/**, e2e/**,
playwright.config.ts.

CONTRACTS: docs/PLAN.md section 11 is the contract. Transcribe it exactly into packages/shared/src/
(types.ts; schemas.ts with a zod schema for PatchBody and every request body; api.ts with path
constants; errors.ts with ApiError, an AppError class and the HTTP mapping; services.ts; constants.ts;
index.ts) and apps/server/src/db/schema.sql. constants.ts must export:
STYLE_ALLOWLIST = ['color','background-color','font-size','font-weight','font-style','text-decoration',
'text-align','line-height','letter-spacing','display','visibility','opacity','width','max-width',
'min-width','height','max-height','min-height','margin','margin-top','margin-right','margin-bottom',
'margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','border',
'border-color','border-width','border-radius','gap','flex-direction','justify-content','align-items',
'order','position','top','right','bottom','left','z-index','cursor','pointer-events'] as const;
ATTRIBUTE_ALLOWLIST = ['href','src','alt','title','aria-label','aria-hidden','aria-disabled','disabled',
'placeholder','type','value','target','rel','role','tabindex','hidden','name'] as const;
DEFAULT_THRESHOLDS = { exact: 0.90, relocate: 0.65, margin: 0.15 };
LAYOUT_STYLE_PROPS = the display/size/margin/padding/position/top/right/bottom/left subset.

PHASE 1 - SCAFFOLD (PR open by elapsed hour 1.25, merged by 1.5)
1. npm workspaces: packages/shared, packages/engine, packages/runtime, apps/server, apps/web. ESM.
   Node 24 LTS (.nvmrc "24"; engines ">=24 <25"). tsconfig.base.json: strict, ES2022, module ESNext,
   moduleResolution Bundler, noUncheckedIndexedAccess, skipLibCheck.
2. Pin exactly (PLAN section 8): fastify 5.12.5, @fastify/static 10.1.6, zod 4.6.5, nanoid 6.0.2,
   jsdom 29.1.1, dompurify 3.4.16, playwright 1.64.0, @playwright/test 1.64.0, pixelmatch 8.0.0,
   pngjs 7.0.0, react 19.3.0, react-dom 19.3.0, vite 8.3.4, @vitejs/plugin-react 6.1.2, esbuild 0.28.2,
   tsx 4.23.15, vitest 5.0.3, typescript 5.9.3, concurrently 10.0.6, plus @types/jsdom, @types/pngjs,
   @types/react, @types/react-dom as npm resolves. Ask the human before npm install. If npm reports peer
   conflicts, STOP and report; never pick other versions silently.
3. Root scripts: dev (concurrently: target, build:runtime --watch, server via tsx watch, web via vite),
   start (built server, serving built web), build (runtime, web, typecheck), typecheck (tsc --noEmit per
   workspace), test (vitest run), test:e2e (playwright test), target (node fixtures/target-site/server.mjs),
   seed, reset, demo:setup, smoke:slice, smoke:full, bench (tsx packages/engine/bench/run.ts),
   build:runtime (node packages/runtime/build.mjs).
4. apps/server/src/main.ts: load env with defaults from .env.example; open SQLite with node:sqlite
   DatabaseSync at PW_DB_PATH (create data/ dirs); run schema.sql if tables are missing; build the
   ServiceRegistry from factories; start three Fastify instances: control (PW_CONTROL_PORT, /api routes,
   serves apps/web/dist in start mode), live (PW_LIVE_PORT) and preview (PW_PREVIEW_PORT); the last two
   get registerGatewayRoutes(app, registry, 'live' | 'preview'). Add a request-id hook and a global
   error handler turning AppError and zod errors into ApiError JSON.
5. STUBS (header comment "OWNER: Dev X - replace this stub"; functions throw AppError NOT_IMPLEMENTED,
   routes return 501):
   - apps/server/src/gateway/index.ts: registerGatewayRoutes (C)
   - apps/server/src/snapshots/index.ts: createSnapshotService, registerSnapshotRoutes (C)
   - apps/server/src/verify/index.ts: createVerifyService, registerVerifyRoutes (C)
   - apps/server/src/releases/index.ts: createReleaseService, registerReleaseRoutes (C)
   - apps/server/src/drift/index.ts: createDriftService, registerDriftRoutes (B)
   - packages/engine/src/index.ts and src/node.ts with the exact signatures in PLAN 11.14 (B)
   - packages/runtime/src/runtime.ts (empty IIFE), packages/runtime/build.mjs (esbuild bundle to
     packages/runtime/dist/patchwork-runtime.js) (B)
   - apps/web: index.html, src/main.tsx rendering "PATCHWORK", vite.config.ts proxying /api to :4000 (D)
   - fixtures/target-site/server.mjs serving "ShopLite placeholder" on PW_TARGET_PORT (D)
   - fixtures/drift-benchmark/dev/.gitkeep (B), fixtures/drift-benchmark/heldout/.gitkeep (D),
     e2e/.gitkeep (C), e2e/ui/.gitkeep (D), playwright.config.ts with testDir e2e (C)
6. Commit docs/PLAN.md (from the human), AGENTS.md (PLAN 13.1) and README.md (keep its headings; fill
   Team, Problem Statement, Tech Stack, Setup, Usage; add an "AI assistance" note: plan written with
   Claude, code written with OpenCode, all under human review).
7. .gitignore additions: data/, test-results/, playwright-report/, packages/runtime/dist/, apps/web/dist/.
   Add .gitattributes with "* text=auto eol=lf" so Windows checkouts do not change fixture line endings.
8. Verify: npm run typecheck; npm test (one trivial test per workspace); npm run dev starts all processes;
   GET http://localhost:4000/api/users answers.
9. Commit "chore: scaffold workspaces, contracts and stubs". Ask the human to push ws/a-platform and open
   a PR. STOP. The human announces CONTRACT FREEZE when it merges.

PHASE 2 - CORE (after freeze, on ws/a-platform)
10. core/validate.ts: validatePatchBody(body) per PLAN 11.4 - zod parse, semantic rules, DOMPurify on a
    jsdom window for insertHTML. A unit test per rejection rule and for sanitiser warnings (T-VAL-1).
11. core/audit.ts: AuditService with the SHA-256 chain of PLAN 11.10 (node:crypto); canonical JSON =
    keys sorted recursively; verifyChain recomputes every hash. Tests: append 3 and verify valid;
    tamper one row with SQL and verify reports brokenAtSeq (T-AUD-1, T-AUD-2).
12. core/patches.ts + routes: create, get, list, update (expectedRevision; mismatch -> 409
    STALE_REVISION; writes patch_revisions), submit, reviews (reviewer role, never own patch), merge.
    State machine per PLAN 11.3; illegal transition -> 409 INVALID_STATE. Roles via X-Patchwork-User;
    unknown user -> 403. Every state change appends one audit event.
13. Merge gate: snapshot = registry.snapshots.latest(project, patch.urlPath) ?? capture(); Document via
    engine documentFromHtml; report = engine.analyzeConflicts(doc, core.listHead(project), [candidate]);
    blocking conflict without a matching ConflictResolutionChoice -> 409 MERGE_BLOCKED with the report in
    details; else set merged, mergedRevision and merge_order (candidate_overrides => after the existing
    patch). Audit conflict.detected / conflict.resolved / patch.merged. Tests use stubbed SnapshotService
    and a stubbed engine (T-API-MERGE).
14. core/previews.ts + routes: createPreview stores the spec (expires in 2 h); manifestForPreview builds a
    RuntimeManifest from base patches (head, registry.releases.live(), or a release) + include - exclude
    + draft (FrozenPatch with patchId 'draft'); editor.allowedOrigin = PW_EDITOR_ORIGIN. Response url =
    `${PW_PREVIEW_ORIGIN}/__patchwork/preview/${id}?path=<first project path>`.
    Also implement CoreService.proposeHeal (PLAN 11.13): new revision with the given anchors, status
    in_review, audit patch.heal_proposed, actor may be 'system'.
15. Users, projects and audit routes per PLAN 11.12. scripts/seed.ts: users usr_dev1 "Developer 1"
    (developer), usr_dev2 "Developer 2" (developer), usr_rev "Reviewer" (reviewer), usr_rm "Release
    Manager" (release_manager); project prj_shoplite (upstream http://localhost:4200; paths /, /cart,
    /checkout). scripts/reset.ts deletes data/ and re-seeds.
    scripts/demo-setup.ts (npm run demo:setup, after hour 11): against RUNNING servers, through the real
    HTTP API only, creates P1 "Fix checkout button" (setBehavior click -> navigate /checkout, replace,
    check: click anchor -> expectUrl /checkout), P2 "Fix price typo" (setText) and P3 "Hide expired
    promo" (hide), with anchors captured by engine captureFingerprint on fixtures/target-site/v1 HTML
    loaded with documentFromHtml; submits, reviews, merges, creates R1, runs verification, deploys.
    It also creates P4 "Restyle checkout button" (setStyle pointer-events: none on the same button,
    a realistic regression) and leaves it APPROVED but not merged, for the demo's bad-release step.
    Exit 1 on any failure. This replaces any hand-inserted demo data.
16. scripts/smoke-slice.ts implements PLAN 11.18 against running servers, exit code 1 on failure.
    scripts/smoke-full.ts automates the PLAN 16 smoke checklist steps that can be automated.

INTEGRATION DUTIES (you alone merge into integration; at hours 16 and 18 you open a PR integration -> main)
- Per PR: git fetch; check out the branch; git diff origin/integration...HEAD --stat; reject any file outside
  the author's paths; run npm ci && npm run typecheck && npm test && npm run smoke:slice (plus
  npm run test:e2e after hour 11). Merge on GitHub with a merge commit only after one other human approves.
- After each merge post: "integration @ <sha> - merged <branch>; please git merge origin/integration".
- Integration windows: hours 6, 9, 11, 14, 16. Outside them merge only fixes for a broken main.
- Broken integration: revert the merge commit through a PR (git revert -m 1 <sha>). Never reset or force.

DEPENDENCIES: only you run npm install, only for a teammate change request the human approved; commit
package.json and package-lock.json together.

ACCEPTANCE: scaffold merged by hour 1.5; every A route returns contract shapes; all A unit tests pass;
smoke:slice passes at hour 6; a SAME_PROPERTY conflict blocks merge and a resolution choice unblocks it;
audit chain verification detects tampering.

STOP AND ASK when: Git state is unexpected; a contract looks wrong or incomplete; npm reports conflicts;
a teammate asks you to change shared files; a test needs Playwright and it is not installed; anything
would need force-push, reset, rebase or a direct push to main or integration.

REPORT in the AGENTS.md format after Phase 1, after each of steps 10-16, and at every integration window.
```

### 13.4 Prompt for Adnan (Dev B) — Core patch-processing engine & Drift

```text
You are the coding agent for Dev B (Patch Engine & Drift owner) on PATCHWORK, a platform that modifies
existing websites through independently managed patches without rebuilding them. You build the parts
that make patches land on the right element: fingerprints, the resolver, op application, the browser
runtime, conflict analysis, and the Drift Sentinel (the team's signature feature).

Repository: https://github.com/Adnan-Khan15/BitBandits_college_round
Base branch: integration (start only after the human announces CONTRACT FREEZE).
Your branch: ws/b-engine. Your human: Adnan. Integration owner: Vishwaa (Dev A).

STEP 0 - INSPECT (read-only). git branch --show-current; git status --short; git fetch origin;
git log --oneline -5. Read AGENTS.md, README.md, docs/PLAN.md sections 6, 10, 11 (all), 12, 16.
Read packages/shared/src/*.ts and the stubs in your folders. Expected: on ws/b-engine, clean tree,
stubs present. Otherwise STOP and report.

YOU OWN: packages/engine/**, packages/runtime/**, apps/server/src/drift/**,
fixtures/drift-benchmark/dev/**.
YOU MUST NOT EDIT: any package.json or lockfile, tsconfig files, packages/shared/**, apps/server/src/
{main.ts,app.ts,db,core,gateway,snapshots,verify,releases}/**, apps/web/**, fixtures/target-site/**,
fixtures/drift-benchmark/heldout/** (you may READ nothing in heldout/ until the human says tuning is
frozen; it is the honest test set), e2e/**.

CONTRACTS you implement exactly: engine API (PLAN 11.14), fingerprint/resolution (11.2), op semantics
(11.3), runtime rules and bridge messages (11.6), conflict rules (11.5), DriftService and drift types
(11.9, 11.13). You consume: SnapshotService, ReleaseService, VerifyService, CoreService, AuditService via
the ServiceRegistry passed to createDriftService(registry, db). Never import another module's files.

ORDER OF WORK
1. engine/src/fingerprint.ts: captureFingerprint, uniqueCssPath (prefer unique #id unless it looks
   generated - 4+ digits or hex-like; then unique [data-testid]; then tag.class:nth-of-type chain until
   unique), absolute xpath, normaliseText (collapse whitespace, trim, max 200), accessibleName (aria-label,
   aria-labelledby, label[for], alt, title), implicit role map (a[href] link, button and input
   submit/button button, input text textbox, select combobox, h1-h6 heading, img img).
2. engine/src/resolve.ts + features.ts: weights and thresholds from PLAN 11.2; similarity functions:
   equality, normalised Levenshtein (1 - d/maxLen, cap 200 chars), word-overlap (shared/max words),
   Jaccard for classes; tag related-groups {a, button, input[type=submit|button], [role=button]}.
   Candidates = all elements in body (cap 5,000). Modes: 'smart'; 'selector' (B1: cssPath unique ->
   exact, else not_found); 'xpath' (B2). Export resolveBestMatch (B3: top score, no thresholds) for the
   bench only. Evidence = per-feature list for the best candidate.
3. engine/src/apply.ts: applyPatch is ATOMIC per patch: resolve all anchors first; any ambiguous or
   not_found -> applied:false with that reason; else apply ops in order keeping an undo log (old text,
   attrs, inline styles, original parent/nextSibling, inserted nodes); any op error -> undo this patch's
   ops, reason 'op_error'. Idempotent: mark touched elements data-pw-applied="<patchId>:<rev>" and
   inserted nodes data-pw-inserted="<patchId>"; skip already-applied. hide = display:none !important;
   show = remove that and the hidden attribute. setBehavior: one document-level capture listener per
   event type that checks whether event.target is inside the patched element; 'replace' calls
   preventDefault + stopImmediatePropagation before running the action (this pre-empts the site's own
   handler on that element), 'before' runs the action then lets the event continue. navigate uses
   location.assign for relative or http(s) URLs only. affectedRects from getBoundingClientRect.
4. engine/src/node.ts: documentFromHtml(html, url) using jsdom WITHOUT running scripts.
5. packages/runtime/src/runtime.ts (+ bridge.ts, beacon.ts): follow PLAN 11.6 runtime rules: fetch
   /__patchwork/manifest.json, anti-flicker (hide body until ready or 800 ms), apply on
   DOMContentLoaded, window.__PATCHWORK__ = { status }, dispatch 'patchwork:ready', beacons with
   navigator.sendBeacon batched every 2 s, window error listener (patchwork:true if the stack mentions
   patchwork-runtime), MutationObserver re-apply (debounce 50 ms, max 20). On the preview channel show a
   small fixed badge "PATCHWORK preview - N patches". Editor bridge only when manifest.editor.enabled:
   accept messages only from editor.allowedOrigin; pick mode = hover outline overlay + click capture
   (preventDefault) -> post 'picked' {fingerprint (withRect), elementPath, current: text, allowlisted
   attrs, computed styles for STYLE_ALLOWLIST} with targetOrigin = allowedOrigin; 'highlight' outlines
   the resolved anchor; post 'ready' after each apply. build.mjs: esbuild IIFE, target es2020, no Node
   imports (import only engine/src/index.ts and shared).
   CHECKPOINT hour 4: bundle applies setText/setAttribute/setStyle/hide from a manifest. Tell the human
   so Dev C can serve it.
6. engine/src/conflicts.ts: analyzeConflicts per the PLAN 11.5 table. Property keys per 11.3. Values
   for STALE_BASE come from applying head patches to a cloned document, then reading the property.
7. engine/src/drift.ts: analyzeDrift -> DriftPatchResult[] (healthy/healed/at_risk/broken);
   proposedFingerprints = captureFingerprint of each relocated match; assist = [].
8. fixtures/drift-benchmark/dev/: 15 cases in the PLAN 11.16 format (renamed 3, moved 3, wrapped 2,
   text 2, tag 1, removed 2, decoy 2). Small realistic e-commerce HTML.
9. packages/engine/bench/run.ts: for each case: fp from before.html target, resolve in after.html with
   patchwork, css_selector, xpath, best_match_no_threshold; outcome = correct / wrong-target / abstain;
   print a table per set and write data/bench.json as BenchRow[]. --set dev|heldout|all.
10. apps/server/src/drift/: createDriftService(registry, db) per PLAN 6 mechanism and 11.13. check():
    for each project path with live patches, capture a snapshot, compare domHash with the previous
    snapshot of that path, run analyzeDrift on documentFromHtml(snapshot.html) with snapshot.boxes,
    store drift_reports, audit drift.detected when anything is not healthy, call
    registry.core.proposeHeal for healed patches. Manual check always writes a report; the poller
    (every PW_DRIFT_POLL_SECONDS, never overlapping) only when the hash changed. proposeQuarantine():
    live patches minus at_risk/broken -> registry.releases.create({origin:'quarantine', ...}) ->
    registry.verify.runToCompletion -> store quarantine_release_id, audit release.quarantine_proposed.
    Routes per PLAN 11.12 (drift and /bench). GET /bench reads data/bench.json.
    POST /drift/:id/assist/accept is built only with step 11.
11. OPTIONAL, only when the human says the hour-11 gate is green: drift/assist.ts per PLAN 6
    "LLM second look": provider from PW_ASSIST_PROVIDER (none|ollama|openrouter), fetch to Ollama
    /api/chat with stream:false and a JSON-schema `format`, timeout PW_ASSIST_TIMEOUT_MS, any failure ->
    no suggestion. Only for ambiguous anchors. bench --assist adds the patchwork_llm row.

TUNING RULE: tune weights/thresholds on dev/ only. When the human freezes tuning (by hour 12), run
npm run bench -- --set heldout once and report the numbers exactly as printed.

TESTS (vitest, jsdom for DOM): T-ENG-RESOLVE (each feature; renamed id; moved; decoy -> ambiguous;
removed -> not_found; selector mode), T-ENG-APPLY (every op kind, atomic undo on failure, idempotent
re-apply, behaviour replace vs before via dispatched click), T-ENG-CONFLICT (every rule in 11.5),
T-DRIFT-1 (health classes), T-DRIFT-2 (DriftService with stubbed registry), T-BENCH (bench runs and
writes valid BenchRow[]). One Playwright-library test (packages/runtime/test/) loads a local HTML page
with the built bundle and a manifest and asserts window.__PATCHWORK__.status.
Run: npm run typecheck && npm test && npm run build:runtime && npm run bench -- --set dev.

ACCEPTANCE: all tests pass; runtime bundle under 60 KB unminified with no Node imports; ambiguous or
missing anchors are never applied; dev-set bench beats css_selector and xpath on re-anchor rate; drift
check on ShopLite v2 produces the expected statuses (Dev D documents them in fixtures/target-site/README.md).

GIT: commit small and often to ws/b-engine ("feat(engine): ..."); ask the human to push; never merge
or push anything else. Merge origin/integration only when the human asks.

STOP AND ASK when: a contract type is missing a field you need; you need a dependency; a test needs a
file outside your paths; Git state is unexpected; anything in AGENTS.md NEVER list would be needed.
REPORT in the AGENTS.md format at hour 4, 6, 8, 11 and when done.
```

### 13.5 Prompt for Kshant (Dev C) — Delivery, verification, rollback & regression

```text
You are the coding agent for Dev C (Delivery & Verification owner) on PATCHWORK, a platform that
modifies existing websites through independently managed patches without rebuilding them. You build
how patches reach browsers (gateway with isolated preview), how they are checked before release
(automated browser + visual verification), and how releases go live and come back (deploy, health,
rollback), plus the end-to-end test suite.

Repository: https://github.com/Adnan-Khan15/BitBandits_college_round
Base branch: integration (start after CONTRACT FREEZE).
Your branch: ws/c-delivery. Your human: Kshant. Integration owner: Vishwaa (Dev A).

STEP 0 - INSPECT (read-only). git branch --show-current; git status --short; git fetch origin;
git log --oneline -5. Read AGENTS.md, README.md, docs/PLAN.md sections 5, 10, 11 (all), 12, 16, 17.
Read packages/shared/src/*.ts and the stubs in your folders. Run npx playwright --version and confirm
Chromium is installed (npx playwright install chromium was done at setup). Unexpected state: STOP.

YOU OWN: apps/server/src/gateway/**, apps/server/src/snapshots/**, apps/server/src/verify/**,
apps/server/src/releases/**, e2e/** except e2e/ui/**, playwright.config.ts.
YOU MUST NOT EDIT: any package.json or lockfile, tsconfig files, packages/**, apps/server/src/
{main.ts,app.ts,db,core,drift}/**, apps/web/**, fixtures/**, e2e/ui/**.

CONTRACTS: PLAN 11.6 (manifest, runtime status, beacons), 11.7 (snapshots, verification), 11.8
(releases, deployments, health, rollback), 11.12 (your routes and the gateway routes), 11.13
(SnapshotService, VerifyService, ReleaseService), 11.15 (tables you query: snapshots, releases,
deployments, verification_runs, runtime_events). You consume CoreService, AuditService and the engine's
documentFromHtml/uniqueCssPath through the registry and package imports only.

ORDER OF WORK
1. gateway/ (registerGatewayRoutes(app, registry, channel)): serves ONE project, PW_PROJECT_ID.
   - GET /__patchwork/runtime.js from packages/runtime/dist (Cache-Control: no-store).
   - GET /__patchwork/manifest.json: live -> registry.releases.manifestForLive(); preview -> requires
     the pw_preview cookie -> registry.core.manifestForPreview(id); no or unknown cookie -> 404. The
     preview port NEVER falls back to the live manifest, and the live port never reads the cookie.
   - GET /__patchwork/preview/:id?path=&editor= (preview port only): check the preview exists, set
     pw_preview (HttpOnly, SameSite=Lax, Path=/), redirect to path.
   - POST /__patchwork/beacon: zod-validate BeaconPayload (max 32 KB) -> registry.releases.recordBeacon.
   - Everything else: proxy to project.upstreamOrigin, which must be in PW_ALLOWED_UPSTREAMS. Reject
     request targets that are not origin-relative paths. Use built-in fetch, redirect:'manual',
     accept-encoding: identity; drop hop-by-hop headers, Host and the pw_preview cookie; rewrite
     Location headers that point at the upstream origin to relative. For text/html, insert
     <script src="/__patchwork/runtime.js" data-pw-project="<id>" data-pw-channel="<channel>"></script>
     before </head> (or at the start of <body> if no head); recompute content-length. Upstream down ->
     502 with a short HTML message.
   CHECKPOINT hour 4: :4100 and :4300 proxy ShopLite with injection (runtime may still be the stub).
2. releases/ minimal for the slice (hour 6): create (freeze registry.core.listHead, number = max+1,
   manifestHash = sha256 of canonical JSON), list/get, manifestForLive, deploy (pointer move in one
   transaction, previous live -> superseded), rollback(target = toReleaseId or the most recent earlier
   release that was live and healthy, or none), recordBeacon (insert runtime_events). Audit every change.
   Until verify exists, deploy accepts candidate releases ONLY when PW_SLICE_MODE=1; remove that path
   by hour 11.
3. snapshots/ (+ snapshots/browser.ts: one shared Chromium instance, also used by verify): capture()
   opens upstream directly (not via gateway) at 1280x800, waits for networkidle, tags every element
   with data-pw-idx in page, reads rects of visible elements, takes page.content(); in Node builds a
   jsdom document (engine documentFromHtml), maps idx -> uniqueCssPath -> rect into boxes, strips
   data-pw-idx, domHash = sha256 of whitespace-collapsed HTML. latest(), get(), route.
4. verify/ per PLAN 11.7: queue (one run at a time). Subject release/preview: create two temporary
   previews via registry.core.createPreview (baseline = live; candidate = the release or preview); two
   browser contexts; set the cookie via /__patchwork/preview/:id; for each exact urlPath in the patch
   set: reduced motion + CSS that disables animations and carets, goto, wait for
   window.__PATCHWORK__.status.ready (10 s), read statuses, full-page screenshots (pad the shorter PNG
   to equal height and mark layoutChanging), pixelmatch threshold 0.1, mask = candidate affectedRects
   + 8 px, outsideMaskRatio = diff pixels outside mask / pixels outside mask, outcome rules of 11.7.
   Then run each patch's checks in the candidate context ('anchor:<key>' -> the elementPath from that
   patch's resolutions), 5 s per step, screenshot on failure. Console errors: 'console' error + 'pageerror'
   in both contexts; newConsoleErrors = candidate minus baseline. Subject live: candidate = :4100,
   no baseline, no visual. Artifacts in PW_ARTIFACTS_DIR as <runId>-<slug>-{baseline|candidate|diff}.png,
   served by GET /api/artifacts/:file (reject any name with / or ..). Audit verification.finished.
5. releases/ full: POST /releases/:id/verify sets verifying -> verified | verification_failed. Deploy
   requires verified (409 VERIFICATION_REQUIRED) unless force:true by release_manager with a reason.
   After deploy, async health: verify.runToCompletion({kind:'live'}) + a PW_HEALTH_WINDOW_SECONDS window
   counting runtime_events for that release (patch_skipped, or js_error with patchwork:true); failure if
   the run fails or count >= 3 -> pointer back to previousReleaseId, kind auto_rollback, audit
   deployment.failed + release.auto_rolled_back; else deployment.healthy. A rollback also gets a health
   run but never triggers another automatic rollback.
6. e2e/ (Playwright Test, Chromium): playwright.config.ts webServer = [{command:'npm run target',
   port:4200}, {command:'npm run reset && npm run build && npm start', port:4000}], reuseExistingServer
   false in CI mode. Each spec first POSTs http://localhost:4200/__upstream/version {"version":"v1"}.
   j1-preview-isolation, j2-collab-conflict, j3-release-rollback (verified deploy; failing force-deploy
   auto-rolls back; manual rollback to R1), j4-drift (after Dev B lands drift): switch to v2, drift
   check, statuses, quarantine release verified and deployed, checkout works on :4100.

TESTS: T-GW-INJECT (unit), T-GW-ISOLATION (integration with a throwaway local upstream and stubbed
registry: live unchanged, preview with cookie applies, preview without cookie 404, non-allowlisted
upstream refused), T-VER-1 (mask maths and outcome rules), T-VER-2 (passing run on ShopLite),
T-VER-3 (failing check -> failed), T-REL-1 (deploy gate), T-REL-2 (rollback pointer + audit),
T-REL-3 (auto-rollback with a stubbed failing verify). Run: npm run typecheck && npm test &&
npm run test:e2e.

ACCEPTANCE: the same path differs on :4300 and :4100 exactly by the preview's patches; a verification
run produces baseline/candidate/diff PNGs and fails on a broken check; unverified deploy is refused;
forced bad deploy auto-rolls back within the health window; rollback restores the previous behaviour
on the next page load; E2E J1-J3 green by hour 11, J4 by hour 13.

GIT: commit to ws/c-delivery only ("feat(gateway): ..."); ask before pushing; never merge.

STOP AND ASK when: you need a field or method not in the contracts; Chromium is missing; you need a
dependency; Dev A's or Dev B's stub is still a stub at a checkpoint you depend on (report, then keep
building against a local test double inside your own folder); Git state is unexpected.
REPORT in the AGENTS.md format at hours 4, 6, 8, 11, 13 and when done.
```

### 13.6 Prompt for Gaurav (Dev D) — Frontend, user workflow & demo site

```text
You are the coding agent for Dev D (Editor UI & Demo Site owner) on PATCHWORK, a platform that lets
developers modify existing websites through independently managed patches without rebuilding them.
You build (1) ShopLite, the demo "upstream" website with a real bug and a redesigned v2, (2) the
held-out drift benchmark cases, and (3) the PATCHWORK web app: visual editor, review and merge,
releases, Drift Sentinel and audit screens.

Repository: https://github.com/Adnan-Khan15/BitBandits_college_round
Base branch: integration. Your branch: ws/d-editor. Your human: Gaurav.
Integration owner: Vishwaa (Dev A).
IMPORTANT: until the human announces CONTRACT FREEZE (about hour 1.5), do NOT create files in the repo:
draft ShopLite in a scratch folder OUTSIDE the repo, then copy it in after merging origin/integration,
because Dev A creates stub files in your folders at scaffold.

STEP 0 - INSPECT (read-only). git branch --show-current; git status --short; git fetch origin;
git log --oneline -5. Read AGENTS.md, README.md, docs/PLAN.md sections 2, 6, 10, 11 (11.3, 11.5,
11.6, 11.7, 11.8, 11.9, 11.10, 11.12), 12, 18. Read packages/shared/src/*.ts. Unexpected state: STOP.

YOU OWN: apps/web/** (except its package.json), fixtures/target-site/**,
fixtures/drift-benchmark/heldout/**, e2e/ui/**.
YOU MUST NOT EDIT: any package.json or lockfile, tsconfig files, packages/**, apps/server/**,
fixtures/drift-benchmark/dev/** (and do not read dev/ cases or packages/engine/src/resolve.ts before
your held-out cases are committed), e2e/ outside e2e/ui/, playwright.config.ts.

PART 1 - SHOPLITE (PR at hour 2.5; Dev A merges it early by agreement)
1. fixtures/target-site/server.mjs: plain Node http, no dependencies, binds 127.0.0.1:PW_TARGET_PORT
   (default 4200). Serves v1/ or v2/ (in-memory switch, default v1): / -> index.html, /cart ->
   cart.html, /checkout -> checkout.html, /order/success -> success.html, plus styles.css and app.js.
   GET/POST /__upstream/version {"version":"v1"|"v2"}; CORS for http://localhost:5173 and :4000 on
   that endpoint only. No external fonts, images or CDNs: the demo must work offline.
2. v1: home with 4 product cards and an expired promo banner ("Diwali sale - ends 31 Oct 2025");
   one price shown with a typo (Rs 12,99 instead of Rs 1,299, using the rupee sign); /cart with a cart
   table and <button id="checkout-btn" class="btn btn-primary">Proceed to checkout</button> whose
   handler in app.js calls an undefined function startChekout(), so clicking throws a ReferenceError and
   nothing happens (the real bug PATCHWORK fixes); /checkout with a name/address form and "Place
   order" that goes to /order/success.
3. v2 (the "upstream redeploy"): same bug; the cart is redesigned - the checkout button moves into a
   new <footer class="cart-bar">, its id becomes cta-checkout and its classes button button--primary;
   a look-alike decoy <button class="button button--secondary">Save cart for later</button> sits next to
   it; the promo banner is removed; the price element's class is renamed and wrapped in a new span.
4. fixtures/target-site/README.md: how to switch versions (curl examples) and, for the three demo
   patches (P1 fix checkout click -> navigate /checkout; P2 fix price text; P3 hide promo), what drift
   should report on v2 (P1 relocated/healed, P2 relocated or exact, P3 not_found/broken). The engine's
   actual output is the truth; this file states intent.

PART 2 - HELD-OUT BENCHMARK (same PR)
5. fixtures/drift-benchmark/heldout/: 15 cases in the PLAN 11.16 format, written WITHOUT looking at the
   resolver or the dev cases: renamed 3, moved 3, wrapped 2, text 2, tag 1, removed 2, decoy 2. Vary page
   types (blog, dashboard, form, shop). Each case.json selector must match exactly one element.

PART 3 - WEB APP (apps/web, React 19 + Vite, plain CSS modules, no extra libraries)
6. Foundations: src/api.ts (typed fetch for every PLAN 11.12 endpoint; sends X-Patchwork-User from the
   user switcher; parses ApiError into a typed error), src/usePoll.ts (2 s polling, paused when the tab is
   hidden), a tiny hash router, header with user switcher and role. VITE_PREVIEW_ORIGIN defaults to
   http://localhost:4300. Actions the current role cannot do are disabled with the reason shown.
   CHECKPOINT hour 4: shell + patch list working against Dev A's API.
7. Editor: iframe = preview url + &editor=1; accept postMessage only from VITE_PREVIEW_ORIGIN with
   source 'patchwork-runtime'; "Pick element" sends pick:start; on 'picked' add anchor a1, a2... and open
   the inspector with current values; forms for all 9 op kinds (text; attribute from ATTRIBUTE_ALLOWLIST;
   style from STYLE_ALLOWLIST; hide; show; move with a second pick for the reference; insert HTML;
   behaviour = event + mode + action); baseValues filled from current values; a checks builder for
   VerificationStep; Save draft (POST/PUT with expectedRevision; on 409 STALE_REVISION reload and say so);
   live preview (PUT /previews/:id with the draft, then reload the iframe); Validate (issues with field
   paths); Submit for review. Toggle "Resolver: smart / selector-only" sets PreviewSpec.resolverMode.
8. Review & merge: list in_review/approved patches; detail = op table (property, before -> after),
   validation, "Check conflicts" (cards: type, severity, element, values, message, resolution choice);
   Approve / Request changes (comment); Merge sends choices; on 409 MERGE_BLOCKED show the report.
9. Releases: head summary; Create release; release list with status; Verify (poll the run; show patch
   application, step results, console errors, and baseline / candidate / diff images side by side from
   /api/artifacts); Deploy (enabled only when verified; Force deploy for release managers with a
   required reason); deployment timeline (deploy, force, rollback, auto-rollback, health); Rollback to a
   chosen earlier release.
10. Drift Sentinel: upstream version control labelled "Demo control: simulate upstream redeploy"
    (calls :4200/__upstream/version); Check now; per-patch health chips; per-anchor confidence bar, top 3
    evidence features, runner-up and margin; heal proposals linked to review; "Propose quarantine
    release" with its verification status and a link to deploy; the benchmark table from GET /bench
    (methods as rows, held-out and dev sets); and, when present, LLM suggestion cards (model, reason,
    Accept -> POST /drift/:id/assist/accept) clearly marked "suggestion - needs review".
11. Audit: newest-first table (time, type, actor, subject, summary) with a type filter and a "chain
    intact / broken at #n" badge from GET /audit/verify.
12. e2e/ui/editor.spec.ts: open the editor, pick the checkout button inside the iframe (frameLocator),
    add a behaviour op, save; the preview applies it and :4100 does not.

DESIGN: install the frontend-design and web-design-guidelines skills as PLAN section 4 describes; follow
frontend-design for a distinct, calm tool aesthetic; system font stack only (offline demo); visible
keyboard focus; colour never the only status signal; works at 1280 px and 1024 px wide. At feature
freeze run web-design-guidelines over apps/web/src and fix high-impact findings only.

TESTS: unit tests for api.ts error parsing and for op-form -> PatchOp mapping (all 9 kinds);
e2e/ui/editor.spec.ts. Run: npm run typecheck && npm test && npx playwright test e2e/ui.

ACCEPTANCE: every mandatory feature is reachable in the UI with real data; no hard-coded results;
errors show the ApiError message; the PLAN section 18 demo script can be clicked through end to end.

FALLBACK ORDER if late: drop move and insertHTML forms; drift page as a plain table; audit without filter.

GIT: commit to ws/d-editor only ("feat(web): ..."); ask before pushing; never merge.
STOP AND ASK when: an endpoint is missing or returns a shape unlike the contract (write the exact
mismatch); you need a library; Git state is unexpected.
REPORT in the AGENTS.md format at hours 2.5, 4, 6, 8, 11 and when done.
```

## 14. Git branching and integration

Four clones, four feature branches, one integration branch, one integrator: every developer works in their own clone on `ws/<letter>-<name>`, pushes only that branch, and opens a pull request into `integration`; only Dev A (Vishwaa) merges, after one other human approves and the checks pass. `main` is the release branch: it only receives `integration` at the release candidate (hour 16) and the final freeze (hour 18). No two feature branches touch the same file, so merges should never conflict; if one does, that is a process bug to report, not something to resolve on the spot.

### Branches

| Branch | Owner | Starts from | Merged into | Merged by |
| --- | --- | --- | --- | --- |
| `main` | Dev A (Vishwaa) | existing `b4dc792` | — (release branch, protected) | — |
| `integration` | Dev A (Vishwaa) | `main` @ `b4dc792`, created before hour 0 | `main` at hours 16 and 18 via PR | Dev A after another human approves |
| `ws/a-platform` | Vishwaa | `integration` | `integration` | Dev A after another human approves |
| `ws/b-engine` | Adnan | `integration` after scaffold merge | `integration` | Dev A |
| `ws/c-delivery` | Kshant | `integration` after scaffold merge | `integration` | Dev A |
| `ws/d-editor` | Gaurav | `integration` @ `b4dc792` (no files until freeze) | `integration` | Dev A |
| `fix/<topic>` | whoever owns the files | `integration` | `integration` | Dev A — reverts and post-freeze fixes only |

### Before hour 0 (repo owner Adnan, \~10 min)

1. Settings → Collaborators: confirm Vishwaa, Kshant and Gaurav are listed with **Write** access (Adnan owns the repo). Invite anyone missing; they must accept. Do not add any bot, app or AI identity.
2. Create `integration` from `main`: on GitHub, branch menu → type `integration` → "Create branch from main".
3. Settings → Branches: add protection rules for both `main` and `integration`: require a pull request, require 1 approval, keep force pushes and deletions blocked (the default). Protected branches are available on public repos with GitHub Free ([GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)). Restricting who may push is not offered for personal repos, so "only Dev A merges" is a team rule.
4. Everyone signs in with their own credentials (GitHub CLI `gh auth login` or the Git Credential Manager). Never paste a token or password into OpenCode or Claude.

### Setup commands on each PC

Read-only checks first (change nothing):

```bash
node --version            # must print v24.x
npm --version
git --version
git config --get user.name ; git config --get user.email   # must be YOUR identity
git ls-remote https://github.com/Adnan-Khan15/BitBandits_college_round   # must list refs/heads/main and refs/heads/integration
opencode --version
```

Commands that create local state (clone and branch; nothing on GitHub):

```bash
git clone https://github.com/Adnan-Khan15/BitBandits_college_round patchwork
cd patchwork
git fetch origin
# Vishwaa and Gaurav, now:
git switch -c ws/a-platform origin/integration     # Gaurav: git switch -c ws/d-editor origin/integration
# Adnan and Kshant, after CONTRACT FREEZE is announced:
git fetch origin && git switch -c ws/b-engine origin/integration   # Kshant: ws/c-delivery
```

Command that changes GitHub (run by the human, first push of each branch):

```bash
git push -u origin ws/a-platform     # your own branch name only
```

After the scaffold merges, Gaurav runs `git merge origin/integration`; Adnan and Kshant are already based on it. Then every PC runs `npm ci` and `npx playwright install chromium`.

### The loop

1. The agent commits small, tested steps to its own branch.
2. The human pushes when the agent asks, then opens or updates a PR into `integration` on GitHub with the AGENTS.md report as the description.
3. At an integration window (hours 2.5 fixtures-only, 6, 9, 11, 14, 16), Vishwaa checks the diff touches only the author's paths, runs `npm ci && npm run typecheck && npm test && npm run smoke:slice` (plus `npm run test:e2e` from hour 11), gets one other human's approval, and merges with a merge commit.
4. Vishwaa posts `integration @ <sha>`; each developer runs `git fetch origin && git merge origin/integration` on their branch, then re-runs their tests.
5. At hours 16 and 18, Vishwaa opens a PR `integration → main`; after approval and a green `smoke:full`, it merges and is tagged `rc-1` / `demo-final`.

### When things go wrong

| Situation | Action |
| --- | --- |
| `git merge origin/integration` conflicts | Stop. `git merge --abort`. Tell Vishwaa which file; the file's owner fixes it on their branch. |
| A merge breaks `integration` | Vishwaa opens `fix/revert-<branch>` with `git revert -m 1 <merge-sha>`, PR, merge. Never reset or force-push. |
| Contract needs a change | Change request to Vishwaa, who edits `packages/shared` on `ws/a-platform`, merges in the next window (or immediately if it blocks someone); everyone merges `origin/integration`. |
| A developer falls behind | Apply that workstream's fallback list (§12). Partial work merges only if tests pass and unfinished UI is hidden. At hour 14 anything unmerged is cut. |
| Unexpected files in a diff | PR is rejected; the author removes them on their branch. |
| An agent proposes a forbidden command | The human declines it and restates the rule. |

### Never run (humans included, during the event)

`git push origin main`, `git push origin integration`, `git push --force` / `-f`, `git reset --hard` on a pushed branch, `git rebase` of a pushed branch, `git clean -fdx` in a clone with uncommitted work, merging another developer's `ws/*` branch into yours, editing `.git/`, `npm install <pkg>` by anyone but Vishwaa.

### Authorship and disclosure

Commits are authored by the human whose machine and credentials made them. The README states that planning and the final review used Claude (read-only) and coding used OpenCode under human review. The PDF has no AI-use rules, so ask the organisers at check-in and follow their answer.

## 15. 20-hour schedule

The plan reaches a full working flow at hour 11, freezes features at hour 14, and keeps hours 18–20 as pure contingency; about 6 of the 20 hours are deliberately not new-feature time. Hour 0 is when Dev A receives `docs/PLAN.md` after approval and prerequisites (§20 steps 1–6, about 45 minutes, done before the clock starts).

| Hours | Vishwaa (Dev A) | Adnan (Dev B) | Kshant (Dev C) | Gaurav (Dev D) |
| --- | --- | --- | --- | --- |
| 0–1.5 | Scaffold + contracts | Dev bench cases (outside repo) | E2E journeys (outside repo) | ShopLite v1/v2 + held-out cases (until 2.5) |
| 1.5–6 | Core API, roles, previews, seed | Resolver, apply, runtime bundle | Gateway + slice releases | App shell + patch list (from 2.5) |
| 6–9 | Validation, merge gate, audit chain (until 11) | All 9 ops + editor bridge | Snapshots + verification | Editor, review, releases screens (until 11) |
| 9–11 | (continues) | Conflicts + drift analysis | Health, rollback, E2E J1–J3 | (continues) |
| 11–14 | demo:setup, smoke, integration | Drift service, bench, LLM (optional) | E2E J4 + hardening | Drift + audit screens |
| 14–18 | Integrate, fix, rest, rehearse | Fix, rest, rehearse | Fix, rest, rehearse | UI audit, rest, rehearse |
| 18–20 | All: contingency, final smoke, submission | | | |

Gates: H1.5 contract freeze · H2.5 fixtures merged · H6 slice gate · H9 integration 2 · **H11 full-flow gate (go/no-go)** · H14 feature freeze · H16 release candidate · H18 final freeze.

Each lane is one developer's build; dashed lines are integration windows where Dev A merges and the whole team checks the result. Rest rotations: in hours 14–18 each developer takes one 30-minute break, staggered so two people are always working.

| Elapsed | Milestone | Owner | Depends on | Deliverable | Acceptance test | Go / no-go | Cut if missed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.5 h | Contract freeze | A | approval, collaborators | Scaffold, shared types, schema, stubs on `integration` | `npm ci && npm run typecheck && npm test` green on a second PC | No-go → B/C branch from `ws/a-platform` | Nothing; this cannot be cut |
| 2.5 h | Fixtures merged | D | freeze | ShopLite v1/v2, 15 held-out cases | `npm run target`; `/cart` bug reproduces; v2 switch works | No-go → B uses its dev cases only | Held-out cases move to hour 6 (bench is then reported as small-sample) |
| 4 h | Component checkpoints | B, C, A, D | freeze | Runtime applies 4 ops; gateway proxies with injection; core CRUD; app shell | Each owner's report | Any red → owner applies its fallback list now | — |
| 6 h | **Slice gate** | A | B, C runtime + gateway | §11.18 slice | `npm run smoke:slice` | No-go → all hands on the slice before new features | Visual diff, drift, LLM |
| 9 h | Integration 2 | A | slice | Editor bridge, verification run, merge gate | Pick → save → preview in UI; verify run produces 3 PNGs | No-go → editor uses fallback (§19 risk 2) | `move`/`insertHTML` forms |
| 11 h | **Full-flow gate** | A | all | F1–F7 working end to end | `npm run test:e2e` J1–J3 green; `demo:setup` passes | Go → LLM allowed (Could). No-go → no new scope; fix flow | LLM, bench UI, heal proposals |
| 12 h | Tuning freeze | B | drift | Thresholds fixed; held-out bench run once | `npm run bench -- --set heldout` recorded | — | — |
| 14 h | **Feature freeze** | A | full flow | J4 drift green; all screens | Full `test:e2e`; smoke checklist steps 1–12; evidence pack sent for Claude's read-only review (§22) | After this: only mandatory defects, crashes, security fixes | Anything not merged |
| 16 h | Release candidate | A | freeze | PR integration → main merged, tagged `rc-1`; second laptop set up | `smoke:full` on both laptops; Claude re-review shows no open BLOCKER | No-go → demo the last green tag | — |
| 16.5, 17.5 h | Rehearsals | all | RC | Timed run of §18 | Under 6 minutes, no manual workaround | Failures logged and fixed only if critical | 3-minute cut |
| 18 h | Final freeze | A | rehearsals | Final integration → main merge, tagged `demo-final`; rehearsal recording; README complete | Clean start (§17) on the demo laptop | — | — |
| 18–20 h | Contingency + submission | all | — | Buffer, final smoke, submission | Smoke checklist step 13 | — | — |

## 16. Testing, regression and security

Every mandatory requirement has at least one automated test and one step in the manual smoke checklist; nothing in the demo path is mocked. Tests use Vitest (unit and integration, jsdom for DOM) and Playwright Test (browser E2E), both free and already in the stack.

### Test catalogue

| ID | Level | What it proves | Owner | Requirement |
| --- | --- | --- | --- | --- |
| T-VAL-1, T-API-VALIDATE | unit, integration | Each forbidden input is rejected with a field path; sanitiser strips scripts and warns | A | C3 invalid |
| T-AUD-1, T-AUD-2 | unit | Hash chain verifies; a tampered row is detected at the right `seq` | A | F7 |
| T-API-MERGE | integration (`fastify.inject`) | Roles enforced; own-patch approval refused; SAME\_PROPERTY blocks merge; resolution choice unblocks; stale revision → 409 | A | F3 |
| T-ENG-RESOLVE | unit | Each feature scores as specified; renamed, moved, decoy → ambiguous, removed → not\_found; selector mode | B | F2 |
| T-ENG-APPLY | unit | All 9 op kinds; atomic undo on failure; idempotent re-apply; behaviour replace vs before | B | F1 |
| T-ENG-CONFLICT | unit | Every rule in §11.5 | B | F3 |
| T-DRIFT-1, T-DRIFT-2 | unit, integration | Health classes; drift service writes reports, heal proposals, quarantine release | B | SIG |
| T-BENCH | regression | Bench runs on both sets and writes valid rows; dev-set result does not regress after a change | B | SIG |
| runtime bundle test | browser (Playwright library) | Real bundle applies a manifest in Chromium and reports status | B | F1, F2 |
| T-GW-INJECT, T-GW-ISOLATION | unit, integration | Script injected once; live ignores preview cookie; preview without cookie is 404; non-allowlisted upstream refused | C | F4 |
| T-VER-1..3 | unit, integration | Mask maths and outcome rules; passing run; broken check fails run | C | F5 |
| T-REL-1..3 | integration | Deploy gate; rollback pointer + audit; auto-rollback after failed health | C | F6 |
| T-E2E-1 (j1 + ui/editor) | E2E | Author in editor, preview shows change, live does not | C, D | F1, F4 |
| T-E2E-2 (j2) | E2E | Two users, conflicting patches, blocked merge, resolution, merge | C | F3 |
| T-E2E-3 (j3) | E2E | Verify → deploy → force-deploy bad release → auto-rollback → manual rollback | C | F5, F6, F7 |
| T-E2E-4 (j4) | E2E | Upstream v2 → drift report → quarantine release → checkout still works live | C | F2, SIG |
| `smoke:slice`, `smoke:full` | deployment smoke | Running system answers end to end on the demo laptop | A | all |

**Regression rule.** From hour 11 every PR into `integration` must pass `npm run typecheck && npm test && npm run test:e2e`, and the bench numbers on the dev set must not drop. Flaky E2E: retry once (`retries: 1`); a test that fails twice blocks the merge.

### Security safeguards

| Risk | Safeguard | Test |
| --- | --- | --- |
| Patch runs arbitrary script | Declarative ops only; no `on*` attributes, no `javascript:` URLs; `insertHTML` sanitised by DOMPurify | T-VAL-1 |
| CSS injection | Style property allowlist; values reject `url(` (non-https), `expression(`, `@import`, `<`, `\` | T-VAL-1 |
| Gateway used to reach other hosts (SSRF) | Upstream fixed per project and listed in `PW_ALLOWED_UPSTREAMS`; only origin-relative request targets | T-GW-ISOLATION |
| Preview leaks into live | Separate port; live never reads the cookie; preview never falls back to live | T-GW-ISOLATION, T-E2E-1 |
| Cross-origin message spoofing | Runtime and editor check `event.origin` and `source` fields | runtime bundle test |
| Patch hits the wrong element | Runtime applies nothing when any anchor is ambiguous or missing | T-ENG-APPLY, T-E2E-4 |
| Half-applied patch | Per-patch atomic apply with undo log | T-ENG-APPLY |
| Bad release stays live | Verify gate, post-deploy health, auto-rollback | T-REL-1, T-REL-3 |
| History tampering | Append-only, hash-chained audit with verification endpoint | T-AUD-2 |
| Path traversal on artifacts | File names validated (no `/` or `..`) | T-VER-1 |
| Concurrent edits overwrite | `expectedRevision` optimistic locking | T-API-MERGE |

**Honest limits.** Identity is a user picker, not authentication; anyone on the network who reaches :4000 can act as any user. Sites with a strict Content-Security-Policy may block the injected script (snippet mode would be needed). The runtime patches after load, so a brief flash is possible (800 ms guard). Screenshots differ across operating systems, which is why baseline and candidate are always captured in one run on one machine. Passing tests do not prove the system is secure.

### Final smoke checklist (run on the demo laptop, about 10 minutes)

1. `npm run reset && npm run build`, then `npm run target` and `npm start` in two terminals, then `npm run demo:setup` (creates P1–P3 and a verified, deployed R1 through the real API). No errors.
2. Open `http://localhost:4000`; pick user "Developer 1". Overview shows ShopLite, live release R1.
3. `http://localhost:4200/cart` and `http://localhost:4100/cart`: on 4200 the checkout button does nothing (console error); on 4100 it works (R1 fix).
4. Editor: pick the price on `/`, change its text, save. Preview shows the new text; `http://localhost:4100/` does not.
5. Validate a patch with `javascript:alert(1)` as a link URL → error shown with its field.
6. As "Developer 2", edit the same price differently and submit both; as "Reviewer", merge one, then the other → merge blocked with SAME\_PROPERTY; choose a resolution → merged.
7. As "Release Manager": create release, Verify → passed, with three images per page; Deploy → healthy; 4100 shows the change.
8. Force-deploy a release containing a patch whose check fails → within 30 s the deployment shows auto-rollback and 4100 shows the previous behaviour.
9. Rollback to R1 manually → 4100 matches R1 after reload.
10. Drift: "Simulate upstream redeploy" → v2; Check now → checkout fix healed with evidence, promo patch broken; propose quarantine release → verified → deploy; on 4100 the redesigned cart's checkout button works.
11. Audit page lists every step above; badge says "chain intact".
12. `npm run bench -- --set heldout` prints the table; the Drift page shows the same numbers.
13. Set upstream back to v1 (`curl -X POST localhost:4200/__upstream/version -H 'content-type: application/json' -d '{"version":"v1"}'`) and `npm run reset` before the real demo.

## 17. Deployment and reproducibility

The demo runs entirely on one laptop with no internet, no accounts and no paid services; a free Cloudflare quick tunnel can optionally expose the patched live site (:4100) so judges can open it on their phones. The PDF gives no hosting or submission format, so this is a default to confirm with the organisers.

### Prerequisites (every PC, before hour 0, needs internet)

| Item | Command or source | Check |
| --- | --- | --- |
| Node.js 24 LTS + npm | nodejs.org installer or nvm | `node --version` → v24.x |
| Git | git-scm.com | `git --version` |
| OpenCode | its installer | `opencode --version` |
| Chromium for Playwright 1.64 | `npx playwright@1.64.0 install chromium` (cached per user, reused by the project) | `npx playwright@1.64.0 --version` |
| Optional: Ollama + model (demo laptop only) | ollama.com installer, then `ollama pull qwen3:4b` (2.5 GB) | `ollama list` |
| Optional: cloudflared (demo laptop only) | Cloudflare's release page | `cloudflared --version` |

### Commands (after the scaffold merges)

```bash
npm ci                          # exact install from package-lock.json
cp .env.example .env            # Windows: copy .env.example .env  (defaults work as-is)
npm run reset                   # fresh SQLite in data/, seeded users + ShopLite project
npm run dev                     # target :4200, API :4000, live :4100, preview :4300, editor :5173
npm run typecheck && npm test   # unit + integration
npm run test:e2e                # Playwright journeys (starts its own servers)
npm run build                   # runtime bundle, web build, typecheck
npm run target & npm start      # production-style run (two terminals on Windows)
npm run demo:setup              # P1–P3 + verified, deployed R1 via the real API
npm run bench -- --set heldout  # benchmark table
npm run smoke:full              # automated smoke steps
```

Optional public link for the live site, on the demo laptop: `cloudflared tunnel --url http://localhost:4100`. It prints a random `trycloudflare.com` URL; there is no uptime guarantee and a cap of 200 in-flight requests ([docs](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)). Do not tunnel the editor: the preview iframe and `postMessage` origins would all need re-configuring.

**Environment variables:** exactly those in §11.16. None is secret except `OPENROUTER_API_KEY`, which stays empty unless the team deliberately uses OpenRouter.

**Deterministic data:** `npm run reset` + `npm run demo:setup` always produce the same users, project, patches P1–P3 and release R1; ShopLite v1/v2 are static files; the benchmark cases are fixed files.

### Services with conditions

| Service | Status | Condition |
| --- | --- | --- |
| Cloudflare quick tunnel | Optional | No account; no SLA; URL changes on every start |
| Ollama + Qwen3 | Optional | Local, ₹0; speed depends on the laptop's CPU/GPU — measure at hour 0 |
| OpenRouter `:free` | Backup only | Account + key; 50 requests/day under 10 purchased credits; model list changes |
| GitHub | Required for collaboration | Free; protected branches available on public repos |

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `EADDRINUSE` on 4000/4100/4200/4300/5173 | Stop the old process (Task Manager on Windows, `lsof -i :4000` on macOS/Linux) or change the port in `.env` |
| `ExperimentalWarning: SQLite` | Expected on Node 24; harmless |
| `browserType.launch: Executable doesn't exist` | `npx playwright install chromium` inside the repo |
| Preview iframe blank | Preview cookie missing: open the editor's preview link again; check `PW_EDITOR_ORIGIN` matches the editor URL |
| Patch shows in preview but not live | Expected until it is merged, released, verified and deployed |
| Visual check flags everything | Baseline and candidate must come from the same run; re-run verify; check animations are disabled |
| E2E flaky on a slow PC | Run `npx playwright test --workers=1` |
| Fixture hashes differ on Windows | Re-clone after `.gitattributes` (LF) is on `main` |

### Clean start (any PC, about 5 minutes once prerequisites exist)

`git clone …` → `cd patchwork` → `npm ci` → `cp .env.example .env` → `npm run reset` → `npm run build` → `npm run target` + `npm start` → `npm run demo:setup` → open `http://localhost:4000`.

## 18. Demo script and judge narrative

The demo tells one story in about six minutes: a shop's checkout button is broken, nobody can redeploy the app, PATCHWORK fixes it safely, survives a bad release, and keeps the fix alive when the shop redesigns its page. The slot length and rubric are not in the PDF, so this is a default; a 3-minute cut is given below.

**Setup before going on stage:** steps 1 and 13 of the smoke checklist (§16); browser tabs open at `localhost:4200/cart` (raw site), `localhost:4100/cart` (live via PATCHWORK) and the editor at `localhost:5173`; DevTools console open on the 4200 tab. Dev A drives the laptop, Dev B narrates; C and D take questions.

| Time | Action on screen | What we say |
| --- | --- | --- |
| 0:00 | Raw site tab: click "Proceed to checkout" — nothing happens, console shows `ReferenceError` | "A deploy broke checkout. The original developers are gone and rebuilding is risky. That's the PATCHWORK problem." |
| 0:30 | Editor: pick the button in the preview, add behaviour "click → go to /checkout", add a check "click → URL contains /checkout", Save | "Patches are data, not code: nine declarative operations, validated, no scripts allowed." |
| 1:15 | Click the button inside the preview: it works. Switch to the live tab and reload: unchanged | "Isolated preview — the published site is untouched until release." |
| 1:40 | As Developer 2, a patch changing the same element's text differently; as Reviewer, merge → **blocked: SAME\_PROPERTY**; choose a resolution → merged | "Collaborative editing with conflict detection on the element, not on file lines." |
| 2:30 | As Release Manager: Create release, Verify → passed; show baseline / candidate / diff images and step results | "Playwright clicks through every patch's checks and diffs screenshots outside the patched area, so we catch side effects." |
| 3:10 | Deploy → healthy; live tab now checks out | "Shipped without rebuilding the shop." |
| 3:30 | Merge P4 "Restyle checkout button" (it sets `pointer-events: none`), create a release and force-deploy it → the health run's checkout check fails → **auto-rollback** appears in the timeline; live tab is back to good | "Even an override can't keep a broken release live." |
| 4:10 | Drift page: "Simulate upstream redeploy" → v2 (the shop's own redesign). Check now | "Now the hard case from the brief: the website itself changes and invalidates our fix." |
| 4:30 | Report: checkout fix **healed** (relocated; evidence: text, accessible name, neighbour text; runner-up = the "Save cart for later" decoy, lower score); promo patch **broken** (element gone) | "It found the moved button with evidence, and refused to guess where the promo went." |
| 5:00 | Toggle preview to selector-only: the same fix silently fails. Toggle back | "This is how selector-based tools behave." |
| 5:15 | Propose quarantine release → verified → deploy; live tab on v2 checks out | "Drift Sentinel builds a safe release and checks it against the new site." |
| 5:40 | Benchmark table (held-out set) and Audit page with "chain intact" | "Measured on cases our resolver author never saw, and every action is in a tamper-evident log." |

**3-minute cut:** 0:00 → 0:30 → 1:15 → 3:10 → 4:10 → 4:30 → 5:40.

**Before / after evidence:** raw vs live tabs; baseline vs candidate vs diff images; selector-only vs smart preview; benchmark rows for ours vs CSS selector vs XPath.

**Backups:** if a live step fails, say so and show that step's stored result from the smoke run done 30 minutes earlier, labelled as such. A screen recording of the full rehearsal is kept, and shown only if the laptop fails completely, labelled "recorded rehearsal".

### Likely judge questions

| Question | Answer |
| --- | --- |
| How is this different from visual editors like Optimizely? | They apply changes by selector; we track elements by 13 weighted features with an abstain margin, and add review with conflict detection, a verification gate, rollback and an audit chain. We show the selector-only failure live. |
| Isn't client-side patching a hack? | It is delivery-time patching, the layer CDNs and experimentation tools use. It needs no rebuild; the trade-offs (brief flash, strict CSP) are stated. Server-side apply of static ops is a natural next step. |
| What if the resolver picks the wrong element? | The runtime never applies an ambiguous match; the benchmark reports wrong-target rate as its key safety metric, on held-out cases. |
| How do you know the benchmark isn't tuned to pass? | Held-out cases were written by a different team member before tuning and run once after tuning froze. |
| Can a patch inject malware? | No scripts, no event attributes, no `javascript:` URLs; HTML is sanitised; style values are filtered. That is a set of safeguards, not a formal guarantee. |
| Where is the AI? | Deterministic scoring does the tracking. An optional local Qwen3 model only suggests a choice for ambiguous matches; we show its benchmark row only if it doesn't increase wrong targets. |
| What does it cost to run? | ₹0: open-source stack on a laptop. |
| What's missing for production? | Real authentication, a multi-project gateway, CSP handling, server-side apply, and a larger benchmark. |

## 19. Risks, mitigations and fallbacks

The biggest risk is integration timing, not any single feature: the slice gate at hour 6 and the full-flow gate at hour 11 exist to surface it early. Fallbacks are cut in the order below so that no mandatory requirement is ever the thing dropped.

| # | Risk | Likelihood | Impact | Mitigation | Fallback |
| --- | --- | --- | --- | --- | --- |
| 1 | Scaffold or contract freeze slips past hour 1.5, blocking B and C | Med | High | Dev A does only the scaffold first; contracts are already written here | B/C start on local branches from A's pushed `ws/a-platform` and merge `integration` later |
| 2 | Cross-origin editor bridge (iframe :4300 ↔ editor :5173) misbehaves | Med | High | Contract fixes message shapes and origins; B's runtime test covers it at hour 8 | Editor shows a URL + "Pick" via the preview's own badge, sending the fingerprint to the API instead of postMessage |
| 3 | Resolver thresholds give wrong targets on v2 | Med | High | Tune on dev set; runtime abstains on ambiguity; demo patches chosen in ShopLite README | Raise the margin; demo shows "ambiguous → needs review" which is still correct behaviour |
| 4 | Visual diff noisy (fonts, animation, scrollbars) | Med | Med | Same-run capture, animations off, threshold 0.1, mask + 8 px, system fonts | Visual outcome downgraded to `warn` only; checks and console diff still gate |
| 5 | Playwright/Chromium missing or slow on a PC | Low | Med | Installed before hour 0; verify queue runs one at a time | Run E2E only on the demo laptop |
| 6 | `node:sqlite` problem on someone's Node 24 build | Low | Med | All PCs on the same 24.x | Swap to `better-sqlite3` (same SQL), Dev A only |
| 7 | A Git accident (force push, wrong branch) | Low | High | Branch protection, OpenCode deny rules, human-approved pushes | `git revert` via PR; reflog on the affected PC; never rewrite `main` or integration |
| 8 | Agents edit outside their paths | Med | Med | OpenCode edit allow-lists; Dev A rejects off-path diffs | Author removes the files on their branch before merge |
| 9 | Dev D overloaded (site + cases + whole UI) | Med | High | Site and cases done by hour 2.5; strict UI fallback order | Dev A builds the Audit page after hour 14 if needed (it only reads one endpoint) |
| 10 | Laptop or venue Wi-Fi fails during the demo | Low | High | Everything runs offline on one laptop; second laptop prepared by hour 18 | Second laptop; labelled recording as last resort |
| 11 | Optional LLM slow or wrong | Med | Low | Off by default, only suggests, timeout 20 s | Leave it off; nothing else changes |
| 12 | Organisers forbid or restrict AI-assisted coding, or require hosting | Unknown | High | Ask at check-in | Disclosure in README; quick tunnel for a public URL |
| 13 | Team fatigue in a 20-hour push | High | Med | Two 30-minute rest rotations in the schedule; feature freeze at hour 14 | Cut Could-haves first |

### Cut order if behind (first cut first)

1. LLM second look and its UI card.
2. Benchmark display in the UI (keep `npm run bench` output).
3. `move` and non-`beforeend` `insertHTML` positions; then the `show` op.
4. Heal proposals (keep drift report + quarantine release).
5. Visual mask (whole-page diff as `warn`).
6. Audit filters and the conflict resolution UI beyond "candidate overrides".

Never cut: any of F1–F7 in a minimal working form, the isolation guarantee, the deploy gate, rollback, or the drift report itself.

## 20. First actions after approval

Nothing below starts until you approve this plan. Claude cannot see or steer the four OpenCode sessions; coordination runs through GitHub, the team chat and the reports in AGENTS.md format.

1. **Decide roles (5 min).** Done: Vishwaa = Dev A (integrator), Adnan = Dev B, Kshant = Dev C, Gaurav = Dev D.
2. **Ask the organisers (5 min, in parallel).** Demo length and rubric; whether a hosted URL is required; rules on AI-assisted coding and disclosure.
3. **Repo owner (10 min).** Adnan confirms the other three have Write access, creates `integration` from `main`, and protects both branches (§14).
4. **Every PC (20–30 min, needs internet).** Prerequisites in §17, including `npx playwright@1.64.0 install chromium`; on the demo laptop optionally `ollama pull qwen3:4b`. Run the read-only checks in §14.
5. **Every PC (5 min).** Create `~/.config/opencode/patchwork.json` with your allow-list (§13.2) and test that one forbidden edit is refused.
6. **Export this document** to Markdown and give it to Dev A as `docs/PLAN.md`. *Hour 0 starts here.*
7. **Dev A:** clone, `git switch -c ws/a-platform`, paste prompt 13.3, run Phase 1. **Dev D:** clone, `git switch -c ws/d-editor`, paste prompt 13.6 and start ShopLite **outside** the repo. **Dev B and C:** clone, read §6, §10, §11 and their prompts; B drafts the 15 dev benchmark cases outside the repo; C drafts the Playwright journeys outside the repo.
8. **Hour \~1.25:** Dev A's scaffold PR; one other human approves; Dev A merges. Announce **CONTRACT FREEZE** with the `integration` SHA.
9. **Hour 1.5:** B and C create their branches from `origin/integration` and paste prompts 13.4 and 13.5; D merges `origin/integration` and moves ShopLite in.
10. **Hour 2.5:** Dev D's fixtures PR (ShopLite + held-out cases) merged early so B and C can use it.
11. **Hour 6:** first integration window; `npm run smoke:slice` must pass on `integration`.

Approved on 10 Oct 2026. This file is that export; section 0 is the launch checklist.

## 21. Go/no-go assessment

**Verdict: GO, conditional on three things being true before hour 0** — all four developers have Write access, every PC has Node 24 and Playwright's Chromium installed, and the organisers do not forbid AI-assisted coding or require a hosted URL we cannot provide. If any of these fails, fix it before starting the clock; none of them requires changing the architecture.

### Self-review (sceptical principal engineer and judge)

| Check | Answer | Where |
| --- | --- | --- |
| Every mandatory requirement has an implementation and a test? | Yes: C1–C5 and F1–F7 each map to an owner, a capability and at least one automated test plus a smoke step | §7, §16 |
| Four workstreams feasible and complementary? | Yes; build estimates 8.5–12 h inside a 12.5–14 h build window; the tightest is Dev D, with a fallback order | §12, §15 |
| Can two agents edit the same file? | Not by design: path ownership, scaffold-only stubs, Dev D creates no files before freeze, OpenCode edit allow-lists, Dev A rejects off-path diffs | §12, §13.2, §14 |
| Shared interfaces fully defined? | Yes for types, API, services, schema, runtime messages, fixtures, env; thresholds marked *initial* may be tuned by their owner | §11 |
| Core works with every enhancement removed? | Yes: LLM off by default; bench UI, heal proposals and masks are in the cut order; F1–F7 never cut | §19 |
| Signature feature real and measurable? | Yes: real drift on a real v2 site, benchmark with three baselines and a held-out set written by another person | §6 |
| All dependencies ₹0? | Yes: open-source, local; optional quick tunnel and OpenRouter verified as free with stated limits | §8, §17 |
| Assumed rather than verified | OpenCode's glob matching for nested paths (test at setup); peer compatibility of the pinned versions (Dev A checks at `npm install`); Qwen3 4B speed on our laptops; whether vitest 5 + vite 8 need extra config | §13.2, §17 |
| Another developer can reproduce setup? | Yes: clean-start procedure, deterministic `reset` + `demo:setup` | §17 |
| Git permissions and human integration covered? | Yes, but collaborator access is **unverified** from here | §3, §14 |
| Deployment in the time budget? | Yes: local demo, release candidate at hour 16, final freeze at 18 | §15 |
| Differentiation and security claims defensible? | Claims are limited to "tools we reviewed each cover part of the loop" and "safeguards, not guarantees" | §5, §16 |
| Fits 20 hours with testing and rehearsal? | Yes: full flow at 11, freeze at 14, two rehearsals, 2 h of pure contingency | §15 |

### Assumptions that could invalidate the plan

| Assumption | If false | Response |
| --- | --- | --- |
| The team can read and review TypeScript | Reviews become rubber stamps | Keep code plain; Dev A reviews diffs for scope, tests for behaviour |
| OpenCode agents follow AGENTS.md and the prompts closely | Scope creep, contract drift | Permissions file, short report cadence, Dev A rejects off-path PRs |
| Venue has power and a laptop for the demo; internet not required | — | Already offline-capable |
| Judges accept a local demo | Need a public URL | Quick tunnel for the live site (§17) |
| The organisers allow AI-assisted development | Disqualification risk | Ask first (§20 step 2); disclosure in README |
| 20 hours means one continuous push | Breaks in the middle shift gates | Move gates by the break length; never shorten the contingency block |

## 22. Final stage: read-only full-repository review by Claude

Claude reviews the whole integrated tree on `integration` twice — at feature freeze (hour 14) and again before the release candidate (hour 16) — and never changes the repository. Humans keep all Git operations, code changes, test runs on their machines, and final acceptance.

### How Claude gets the code without becoming a collaborator

| Route | When | What it means |
| --- | --- | --- |
| Anonymous read-only clone of the public repo through this session's git proxy | Default (verified working on 10 Oct 2026) | No credentials, no GitHub identity, nothing appears in Collaborators, no pushes possible. The copy lives only in Claude's private sandbox. |
| Source archive from Vishwaa: `git archive --format=zip -o ../patchwork-<sha>.zip origin/integration` | If the repo becomes private or the clone fails | Attach the zip in this chat. Claude asks for nothing else. |

Claude will not: request write or push access, open PRs or issues, comment on GitHub, add files to the repo, or change settings.

### Evidence pack (Vishwaa runs on the demo laptop, files saved outside the repo)

```bash
git fetch origin && git switch --detach origin/integration && git rev-parse HEAD
npm ci                                   > ../review-install.txt 2>&1
npm run typecheck                        > ../review-typecheck.txt 2>&1
npm test                                 > ../review-unit.txt 2>&1
npm run test:e2e -- --reporter=list      > ../review-e2e.txt 2>&1
npm run bench -- --set all               > ../review-bench.txt 2>&1
npm run smoke:full                       > ../review-smoke.txt 2>&1
```

Claude may also run `npm ci`, typecheck and unit tests on its sandbox copy if the package registry is reachable; it will say exactly which ran there. Browser E2E needs Playwright's Chromium download, which may be blocked in Claude's sandbox, so E2E results come from the evidence pack. Claude never reports a test as run unless it ran it or received its output.

### Trigger and output

1. Vishwaa posts in this chat: `Review integration @ <sha>` and attaches the six `review-*.txt` files.
2. Claude reviews in this order: requirements completeness → integration correctness → functional journey → security → Drift Sentinel → reliability → frontend → tests → build and deployment → submission readiness.
3. Claude publishes a new doc, "PATCHWORK review @ \<sha>", with a findings table (priority BLOCKER/P1/P2/P3, file and line or symbol, defect, impact and reproduction, evidence, fix, owner, closing acceptance test), confirmed defects separated from items that need verification, four copy-paste feedback messages (one per agent, only tasks inside that agent's paths; contract changes routed to Vishwaa), a requirement-by-requirement release checklist and a go/no-go.
4. Agents fix on their own `ws/*` branches; Vishwaa merges; then posts `Re-review integration @ <new sha>` with a fresh evidence pack. Claude confirms each finding is closed and checks for regressions.

**Time box:** first review 45 minutes from receipt; re-review 30 minutes. If the review finds a BLOCKER after hour 16, the cut order in §19 applies before any new code.

## Sources

Pages opened for this plan (10 Oct 2026); package versions and licences were read from the npm registry the same day.

- [Similo paper (Chalmers full text)](https://research.chalmers.se/publication/536319/file/536319_Fulltext.pdf) and [arXiv abstract](https://arxiv.org/abs/2208.00677v1)
- [LLM-assisted web element localisation (STVR 2024)](https://research.chalmers.se/en/publication/542478)
- [Healenium](https://github.com/healenium/healenium-web)
- [Optimizely snippet order of activation](https://docs.optimizely.com/web-experimentation/docs/snippet-order-of-activation)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/index.md) · [Cloudflare quick tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
- [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
- [Render free tier](https://render.com/docs/free)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Node.js `node:sqlite`](https://r2.nodejs.org/docs/latest/api/sqlite.html) · [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [OpenCode skills](https://opencode.ai/docs/skills) · [rules](https://opencode.ai/docs/rules) · [permissions](https://opencode.ai/docs/permissions) · [config](https://opencode.ai/docs/config)
- [shawnpang/startup-founder-skills](https://github.com/shawnpang/startup-founder-skills) · [EmersonBraun/skills](https://github.com/EmersonBraun/skills) · [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) · [anthropics/skills](https://github.com/anthropics/skills)
- [Ollama](https://github.com/ollama/ollama) · [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) · [Qwen3 on Ollama](https://ollama.com/library/qwen3) · [Qwen3-4B model card](https://huggingface.co/Qwen/Qwen3-4B)
- [OpenRouter rate limits](https://openrouter.ai/docs/api/reference/limits)
