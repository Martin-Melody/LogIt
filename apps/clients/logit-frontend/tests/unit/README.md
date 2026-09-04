# Unit/integration tests

Separate tier from the Playwright specs in `tests/*.spec.ts`. Run with:

```
npm run test:unit --workspace=apps/clients/logit-frontend
# or, from this directory:
npm run test:unit
```

## Why this tier exists

Playwright drives the **web build** — `isNativePlatform()` is always false there, so anything
gated on native (the whole multi-profile `/accounts` switcher, the SQLite-backed repos, secure
per-profile token storage) is structurally unreachable from `tests/*.spec.ts`. That's the gap
that let `docs/bugs/account-switching.md`'s bugs ship unnoticed — see
`docs/architecture/account-model.md` for the full design this test tier is meant to cover.

This tier runs the **real** sqlite repo code (`src/lib/data/**/*.sqlite.ts`) and the real schema
(`createSchemaAndSeed` in `src/lib/data/db/sqlite.ts`) against Node's built-in `node:sqlite`
module instead of the Capacitor plugin — see `support/nodeSqliteDb.ts`. No device, no Capacitor
runtime, no new dependencies (Node 22.5+'s sqlite module is already used by
`scripts/build-food-db`).

## What it deliberately does NOT cover

Tests here go through repo functions directly (`createLocalAccount`, `claimOrphanedData`,
`createSqliteSplitRepo()`, …), not through `authStore.svelte.ts`'s orchestration functions
(`createOfflineAccount`, `loginOfflineAccount`, …) — those pull in the full
`repoProvider`/`appInit` import graph (nutrition, habits, plugins, the network client, Svelte
stores), which assumes a browser-like environment this tier doesn't set up. So a test here can
prove a *mechanism* is buggy (e.g. "claiming orphaned data when it shouldn't leaks data across
profiles") without proving the real call site (`createOfflineAccount`) is calling it correctly —
each test file says explicitly which it's doing.

**Still needs a device / can't be covered here at all:** real Capacitor plugin behavior (secure
storage actually persisting a token across an app kill, the native `FileSaver`/camera/file-picker
plugins), and the full `/accounts` UI flow. Keep using the manual on-device smoke-test checklist
for those (see `docs/bugs/*.md` for the checklist this tier grew out of).

## Adding tests for a bug fix

1. Write the test asserting the **correct** behavior first — it should fail (red) against
   today's code if the bug is real.
2. Fix the code.
3. Confirm it goes green. Don't skip or delete a red test while a fix is pending — a failing
   test that's clearly commented (see `ownerIdIsolation.test.ts`) is more useful than no test,
   because `npm run test:unit`'s pass count becomes a live signal of how many documented bugs
   are still open.
