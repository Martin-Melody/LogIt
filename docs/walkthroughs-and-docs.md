# Walkthroughs and user docs: keeping them current

The walkthroughs (web Guide, phone tours), the user docs at getlogit.app/docs and every
"what each plan can do" list come from one place: **`packages/core/src/guide/`**. Checks fail a
pull request when that list and the app disagree, so a feature can't be added, moved or removed
without the walkthroughs and docs following.

## The pieces

| File | What it is |
| --- | --- |
| `guide/features.ts` | Every feature: plan, web and phone pages, docs page, plan locks it owns, can / can't, plan-table row |
| `guide/walkthroughs.ts` | Every chapter and step. A step points at a `data-guide="…"` mark; a "do" step waits for a `guideSignal("…")` |
| `guide/planTable.ts` | "What each plan can do", worked out from the features (pricing page, docs) |
| `guide/sandbox.ts`, `sandboxDriver.ts` | The Studio sandbox's sample clients and what they do |
| `docs/generated/tier-gates.json` | Every Pro / Studio lock on the server, written by the API's `TierGateSnapshotTests` |
| `apps/clients/website/src/routes/(docs)/docs/**` | The docs pages. Facts, how-tos and can/can't come from the list; the prose around them is written by hand |

## What fails, and what to do

**`packages/core` tests (`guide/consistency.test.ts`)**

- *A web or phone page has no feature*: add the route to a feature's `web` / `phone` in
  `features.ts` (or to `NO_DOCS` for sign-in style pages).
- *A feature's docs page is missing*: write `apps/clients/website/src/routes/(docs)/<docs path>/+page.svx`
  with `<FeatureFacts id="…" />` (copy a neighbour).
- *A plan lock belongs to no feature / the plan differs*: add the server route to the feature's
  `server` list, or fix the feature's `plan` / `freeWhenCoached` so the docs say what the server does.
- *A step's mark doesn't exist*: the element lost its `data-guide`; put it back, or change the step.
- *A mark or signal no step uses*: remove it, or add the step that uses it.
- *A chapter's how-to isn't on its docs page*: add `<HowTo id="chapter.id" />` to that page.

**API tests (`TierGateSnapshotTests`)**: you added, removed or changed a `RequireTier`. If that's
on purpose, run `UPDATE_TIER_GATES=1 dotnet test --filter TierGateSnapshotTests` (with
`DOTNET_ROLL_FORWARD=Major` on a .NET 10 machine), commit `docs/generated/tier-gates.json`, then
fix `features.ts` as above.

**E2E (`apps/clients/logit-web/tests/walkthroughs.spec.ts`)**: a chapter no longer plays through.
Each "do" step's action is in `ACTIONS` (and `PREPARE` for steps whose target needs a change
first); a new "do" step needs one there. Run locally against an API:

```bash
cd apps/clients/logit-web
E2E_API_URL=http://localhost:5118 E2E_ADMIN_KEY=<the API's Admin:Key> npx playwright test
```

## Adding a feature

1. Add it to `features.ts` (its pages, plan, docs path, locks).
2. Write its docs page.
3. If it deserves a walkthrough chapter, add steps to `walkthroughs.ts`, `data-guide` marks on
   the page and `guideSignal` calls where a "do" step completes, and an action in the E2E test.
4. Phone: steps with `on: "phone"` in a phone chapter; marks rendered from data use a `guideMark`
   property (`data-guide={item.guideMark}`).

## Removing a feature

Delete its entry, chapters and docs page. The checks then list every mark, signal, page and plan
lock still pointing at it.

## Screenshots

The docs deploy (`.github/workflows/deploy-web.yml`) plays every walkthrough against a throwaway
API and saves a screenshot per step into `apps/clients/website/static/docs/shots` (git-ignored),
so the docs show the dashboard as it is on every deploy. To see them locally, run the E2E command
above with `DOCS_SCREENSHOTS_DIR=$(pwd)/../website/static/docs/shots`.
