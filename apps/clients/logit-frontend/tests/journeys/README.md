# Account journeys

Every way into and out of an account, run as the **phone app** against **real APIs**:
offline use, signing up, buying Pro or Studio, plans ending, signing out, moving to a
self-hosted server, deleting the account, and several accounts or profiles on one phone.

```
./scripts/journey-apis.sh                 # from the repo root: builds + starts both APIs
npm run test:journeys                     # from apps/clients/logit-frontend
```

`journey-apis.sh` starts two APIs on fresh SQLite databases and leaves them running:

| Port | Plays | Plans |
|---|---|---|
| 5219 | getlogit.app (the app's built-in server in these tests) | enforced: Free / Pro / Studio, set through the admin API |
| 5218 | someone's self-hosted server | everything for everyone |

They don't touch the dev API on 5118. Stop them with `kill $(cat "$JOURNEY_API_DIR"/*.pid)`
(the script prints the folder). Override the URLs with `JOURNEY_CLOUD_URL` /
`JOURNEY_SELF_HOST_URL`. CI runs this as the **Account journeys** job.

## How it works

`support/device.ts` is a simulated Android phone running the app's real code: startup
(`appInit`), the auth store, the local profiles, the SQLite repos and the sync service. Only
the device itself is faked (`support/setup.ts`):

- the Capacitor SQLite plugin → `node:sqlite` (the real schema and repos run on it)
- the secure token store, localStorage → in-memory, kept on the phone across restarts
- every other Capacitor plugin → does nothing
- the network → only the two test APIs; anything else fails as if blocked

`phone.launch()` is a cold start: every module is thrown away and the app boots again on the
same database and storage. A full page load in the app (`window.location.href = …`, which
sign-out and delete do) restarts it the same way. `phone.settle()` waits for background
syncs to finish.

The user actions (`register`, `signIn`, `signOut`, `switchProfile`, `addProfile`,
`finishOnboarding`, `deleteAccount`) make the same calls as the screens that offer them;
each says which screen. Where the app sends someone on launch comes from
`src/lib/platform/launchRedirect.ts`, which the root layout uses too.

**Not covered here:** the screens themselves (Playwright's `tests/*.spec.ts` covers the web
ones), real Google Play purchases (the plan is set through the admin API, which changes the
same server state a purchase does), and real Android storage. Those still need a phone.

## The list → the tests

| Journey | File |
|---|---|
| Offline, fully | `onboarding` › first launch, fully offline |
| Offline → buys Pro / Studio later | `offline-to-online` › offline → account on getlogit.app |
| Offline → self-host | `offline-to-online` › offline → own server |
| Pro → Studio, Studio → Pro, plan ends, resubscribe | `plan-changes` |
| Pro / Studio → offline | `leaving` › Pro/Studio → offline |
| Pro / Studio → self-host | `leaving` › Pro/Studio → self-host |
| Delete account (online and offline) | `leaving` › deleting the account |
| Sign out → a different account on a different plan; settings and privacy | `switching` |
| Self-host → getlogit.app, an expired login, two phones on one account | `edge-cases` |

## Known bugs (`it.fails`)

None open. An `it.fails` test passes while its bug is open and fails once the bug is fixed;
then change it to `it`. (Layout settings per account was the first one, fixed 2026-11-17.)

## Open questions (`it.todo`)

- **Moving from getlogit.app to a self-hosted server brings the data along** (decided
  2026-11-17; phase 1 step 8 of the accounts plan). Until it's built, the self-hosted account
  starts empty and the getlogit.app profile stays on the phone untouched.
