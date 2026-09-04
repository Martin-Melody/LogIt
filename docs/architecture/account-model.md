# Account & profile model — design doc

**Status:** Draft, not yet implemented. Written 2026-09-04 after an on-device smoke test of
`feat/social-redesign` + `feat/store-readiness` surfaced 5 bugs in `docs/bugs/social-smoke-test-
findings.md` and `docs/bugs/account-switching.md`, all in the same subsystem. That's a "the
model is undocumented and nobody can reason about it" signal, not five unrelated bugs — this
doc is the reset: name the entities, enumerate every transition, decide the storage/security
model once, then fix everything against it instead of patching each symptom.

**Decisions Martin made for this doc (2026-09-04):**
1. Switching to a previously-linked profile should **silently restore its server session** —
   worth the complexity of per-profile secure token storage.
2. Multiple different server accounts linked on one device is **testing-only, not a real
   product feature**. Production is 0 or 1 server-linked profile per device, plus any number of
   purely-local profiles. This simplifies the matrix a lot — most of today's bugs stop being
   "which of N linked accounts wins" problems.
3. On tier downgrade (Pro/Studio → Free, e.g. lapsed subscription), already-synced server data
   is **frozen, not deleted** — stays visible on the web dashboard, stops accepting new pushes
   until re-subscribed. (This is already the server's de facto behavior — see §5 — just needed
   to be named as intentional.)

---

## 1. Terms

- **Profile** — a row in local SQLite `local_accounts`. Always device-local. Owns a partition
  of every other local table via `owner_id`. Exists independent of any server account —
  created at first launch and via "Add another profile." A device can have any number of these.
- **Session** — a live authenticated link from a Profile to a server account (`serverUserId` +
  a token). Optional. A Profile without one is **local-only**. Only one Session is *active* at
  a time (the one behind the currently-active Profile), but per decision #1, a Profile that
  *had* a Session before should be able to silently re-establish it on switch — meaning the
  credential needs to persist **per-profile**, not just globally.
- **Tier** — `Free` / `Pro` / `Studio`, a property of the *server account*, not the Profile. A
  Profile only has a Tier while it has an active Session (read live from the server / cached
  from the last successful auth response — never a separate source of truth).

## 2. The model (target state)

- **Per device:** 0 or 1 Profile has an active Session at a time (matches decision #2 — the
  device doesn't need to reason about N simultaneous server identities). Any number of
  additional Profiles may exist, each either local-only or itself linked to *its own* server
  account (so switching between them each restores a different Session) — but a given server
  account should only ever be linked to **one** Profile per device; logging into the same
  server account from a different Profile re-links rather than duplicating.
- **Every local-partitioned table row has a non-null `owner_id`, always.** No code path writes
  or reads with an "or unowned" fallback except the one-time historical migration (§6).
- **Server session credentials are per-Profile, not global.** `apiClient` today holds one
  token in plain storage; it needs to become "the token store" that's keyed by profile id and
  backed by secure storage (§5), with an in-memory "currently hydrated" pointer for the active
  Profile.
- **Tier-gated capabilities are read from the server, never inferred client-side** from e.g.
  "has a `serverUserId`" (§7's capability matrix already exists server-side via
  `RequireTier`; the client bugs today come from re-deriving weaker versions of that check, or
  not checking at all — `Sync now` — or checking the wrong thing — `serverUserId ? "Synced" :
  ...` conflating "has an online identity" with "is entitled to sync").

## 3. Full transition matrix

| # | Action | Precondition | Expected result |
|---|---|---|---|
| 1 | Fresh install, first launch | No `local_accounts` rows | One local-only Profile auto-created (`ensureLocalAccount`), becomes active. Any pre-existing DB rows with `owner_id IS NULL` (upgrade-from-old-version case only) are claimed by it — **the only legitimate use of the orphan sweep.** |
| 2 | Add another profile (Settings → Profiles → Add) | ≥1 Profile exists | New **local-only** Profile created, becomes active. **Must not** run the orphan sweep (today's bug — `createOfflineAccount` does, unconditionally). Previously-active Profile's data is untouched and not visible. |
| 3 | Register a new server account while active Profile is local-only | Active Profile has no Session | Server account created; active Profile gets linked (`serverUserId` set) rather than a new Profile being created — one Profile, now with a Session. Token persisted to that Profile's secure-storage slot. `pushAllLocalData()` uploads the Profile's existing local history (already implemented). |
| 4 | Register/log into a server account while active Profile **already has a different Session** | Active Profile linked to server account A, user authenticates as account B | Per decision #2 this is off the golden path — but must degrade safely: create/switch to **a different Profile** for B (never silently overwrite A's link), and never let the orphan sweep touch A's already-owned rows. This is the path that needs a live DB dump to confirm is currently doing the right thing — see §8. |
| 5 | Log into a server account that's already linked to an existing local Profile on this device (re-install, or previously logged out) | A Profile row has `serverUserId` = this account | Reuse that Profile (`getLocalAccountByServerUserId` — already correct), don't create a duplicate. |
| 6 | Switch to a **local-only** Profile (`/accounts`) | Target has no Session | `owner_id` flips, repos reset/reinit, no server auth involved — already broadly correct once §4's `owner_id` bugs are fixed. |
| 7 | Switch to a **previously-linked** Profile (`/accounts`) | Target has `serverUserId` + a persisted token | Per decision #1: look up that Profile's secure-storage token, attempt silent session restore (refresh if needed); only fall back to "please sign in" if the token is missing/irrecoverably expired. **Today this always force-clears and demands manual re-login** — the biggest gap vs. the decided model. |
| 8 | Log out | Active Profile has a Session | Session cleared (token removed from memory, *not* deleted from that Profile's secure-storage slot — logging out ≠ unlinking), routed to `/accounts` if other Profiles exist else `/auth`. Local data untouched. |
| 9 | Unlink / "sign out of this profile's account" (doesn't exist as a distinct action today — worth adding once §5 lands, so a user can deliberately drop a Profile back to local-only) | — | Clears the Profile's persisted token + `serverUserId`; local data stays. |
| 10 | Delete account | Active Profile has a Session | Server-side delete (password-gated, already implemented) → wipe this Profile's local data + row + its secure-storage slot. Already correct. |
| 11 | Tier upgrade (Free → Pro/Studio, via web billing) | Active Profile has a Session | Next `Sync now` / background sync starts succeeding (server-side gate just opens — no client change needed beyond §4's honest success/failure reporting). |
| 12 | Tier downgrade (lapse / cancel) | Active Profile has a Session | Server already blocks further `/sync/*` writes via `RequireTier` — decision #3 confirms this *is* the desired "freeze" behavior. Client must **stop pretending it succeeded** (§4) and should show a clear "sync paused — resubscribe to continue" state rather than silently looping forever. |
| 13 | Uninstall / reinstall | — | All Profiles + secure-storage tokens gone (device-local by design). Re-login via §5 restores server data for a linked account through the normal pull. Out of scope to preserve across reinstall — matches every other local-first app. |

## 4. What's already broken, mapped to this model

| Today's bug (doc) | Which part of the model it violates |
|---|---|
| `docs/bugs/account-switching.md` #2 — new profile claims orphaned data | Row 2 of §3 — orphan sweep isn't a one-time migration, it's callable on every "add profile." |
| `docs/bugs/account-switching.md` #1 — switch forces re-login | Row 7 of §3 — no per-profile token storage exists at all yet (§5 is net-new work, not a bug fix). |
| "Synced account" label shown for a Free-tier linked Profile | §2's rule that capability must come from the server's Tier, not from "has a `serverUserId`." `serverUserId != null` means "has a Session," not "is entitled to sync" — the label conflates the two. Same root cause as the Settings "Sync now" bug below. |
| `docs/bugs/social-smoke-test-findings.md` #3 — "Sync now" not tier-gated + silently reports success | §2 — capability must be read from the server; `syncAll()` must only report success on actual success (row 12 of §3). |
| `docs/bugs/social-smoke-test-findings.md` #4 — connected dot implies sync is active | Same root cause — a reachability signal is standing in for an entitlement signal. |
| Pro account missing from the `/accounts` list entirely | Doesn't map cleanly to any row above as a *design* violation — this looks like a genuine data-loss/overwrite bug in row 4's path, or something outside this model (e.g. `deleteAccount` triggered accidentally). **Needs a live DB dump, not more static reading** — see §8. |

## 5. Storage & security model

- **`local_accounts` (existing, keep as-is)** — device-local identity registry: username,
  display name, avatar, local password hash, `serverUserId` (nullable link), tier is **not**
  stored here redundantly (fetch/cache from the last auth response only for display, always
  treat the server as truth).
- **New: per-profile credential store.** Needs to hold `{ profileId, accessToken,
  refreshToken, expiresAt }`. Must be encrypted-at-rest on-device — this is now storing
  multiple live credentials simultaneously (one per linked Profile), which plain
  `localStorage`/Preferences doesn't give you. The Android release build's ProGuard rules
  already keep a `secure-storage` plugin's classes (see `project_store_release` memory) —
  confirm this is `capacitor-secure-storage-plugin` or equivalent and reuse it rather than
  introducing a second secure-storage dependency.
- **`apiClient` becomes profile-aware.** Today it's a singleton with one token
  (`packages/core/src/api/client.ts`). It needs an explicit `hydrateForProfile(profileId)` /
  `persistForProfile(profileId)` pair: on Profile switch, look up that profile's stored
  credential, attempt to hydrate (refresh if near-expiry), and only surface "please sign in" if
  that fails. This is the one piece of real new engineering in this doc — everything else is
  fixing an existing path to match a rule that's already implicit in the code.
- **`owner_id` discipline.** Audit every sqlite repo (`workoutRepo.sqlite.ts`,
  `splitRepo.sqlite.ts`, `nutritionRepo.sqlite.ts`, `habitRepo.sqlite.ts`, etc.) for the
  `OR owner_id IS NULL` read fallback and remove it once the one-time migration (row 1 of §3)
  has run — track completion with a persisted flag (e.g. `logit:owner_migration_done`) so it's
  structurally impossible for a later code path to re-trigger the sweep, rather than relying on
  every call site remembering to guard it (which is exactly how today's bug happened).

## 6. Tier capability matrix (already true server-side — client should mirror it, never re-derive it)

| Capability | Free | Pro | Studio |
|---|---|---|---|
| Local workouts/splits/nutrition/habits (offline) | ✅ | ✅ | ✅ |
| Social feed (post/like/comment/follow, mobile-only) | ✅ | ✅ | ✅ |
| Cross-device sync (workouts/splits/nutrition/habits/profile) | ❌ (`RequireTier(Pro)`) | ✅ | ✅ |
| Web analytics dashboard | ❌ | ✅ | ✅ |
| Receive + accept coaching invites | ✅ | ✅ | ✅ |
| Send coaching invites / manage clients | ❌ | ❌ | ✅ (`RequireTier(Studio)`) |
| `orActivelyCoached` sync exception (sessions/checkins/nutrition while an active client of a Studio coach) | ✅ if actively coached | ✅ | ✅ |

This table is the reference for every "should this UI element be visible/enabled" decision —
Settings' Sync row, the connection dot, the Coaching row's copy, `/clients`' Studio gate all
already implement pieces of it correctly in isolation; the bugs are the places that didn't.

## 7. Open item needing a device, not more code reading

**Pro account vanished from the `/accounts` list.** Nothing in `logout()`/`deleteAccount()`
should remove a Profile row just from switching or signing out, and `deleteAccount()` requires
an explicit password confirmation — so this isn't an obvious "accidentally deleted" path.
Next session, before writing more fixes here: pull the actual `local_accounts` table off the
device —

```
adb shell run-as ie.logit.app cat /data/data/ie.logit.app/databases/<db-file> > /tmp/logit.db
sqlite3 /tmp/logit.db "SELECT id, username, server_user_id, created_at_ms FROM local_accounts;"
```

— to see whether the Pro row still exists (mislabeled/hidden) or is genuinely gone, before
guessing further at the code.

## 8. Phased build plan

- **P0 — blocks release, small/contained fixes:**
  - Guard the orphan-claim sweep to true first-launch only (§3 row 1 vs row 2) — closes the
    data-leak bug.
  - `syncAll()` only reports success on actual success; Settings hides/relabels "Sync now" for
    Free tier instead of showing a working-looking button that silently no-ops.
  - Fix the "Synced account" label to reflect Tier, not just `serverUserId != null`.
  - Coaching row: add subtext per `docs/bugs/social-smoke-test-findings.md` #5 (cheap, no
    model change needed — already correct by design).
  - Pull-to-refresh + notification badge staleness (unrelated to this doc, already scoped in
    the social findings doc).
  - Diagnose §7 on-device before deciding whether it needs a fix or was a one-off.
- **P1 — the real feature, needed for decision #1 to be true:**
  - Per-profile secure credential storage + `apiClient` profile-awareness (§5).
  - `/accounts` switch flow uses it: silent restore, honest fallback to re-auth.
- **P2 — polish / follow-through:**
  - Downgrade UX: a visible "sync paused, resubscribe" state instead of an infinite silent
    retry loop (server behavior already correct per decision #3).
  - Add the explicit "unlink this profile" action (§3 row 9) so users aren't stuck choosing
    only between "stay linked" and "delete everything."
- **P3 — coverage:**
  - This whole matrix has **zero automated test coverage** today — `tests/onboarding.spec.ts` /
    `tests/auth-flow.spec.ts` cover single-profile onboarding/auth only (per
    `project_auth_app_first_redo` memory). Add Playwright coverage for at least: add-profile
    doesn't leak data, switch-to-linked-profile restores session, tier-gated UI matches §6.

## 9. Explicitly out of scope

- Supporting N simultaneous server-linked Profiles gracefully as a *product* feature — decision
  #2 makes this test-only; row 4 of §3 just needs to degrade safely, not be a polished flow.
  Revisit if this stops being testing-only.
  This doesn't preclude self-hosters switching between different self-hosted servers — that's
  a different axis (`serverMode`, connect-to-a-different-server flow) not touched by this doc.
- Preserving Profiles/tokens across uninstall/reinstall (row 13 of §3) — not how any of the
  comparable apps behave either.
