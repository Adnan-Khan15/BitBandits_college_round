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
