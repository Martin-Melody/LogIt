# Bugs: multi-profile account switching (`/accounts`)

**Reported:** 2026-09-04 (Martin, on-device smoke test, S23)
**Area:** `src/routes/accounts/+page.svelte` (profile switcher), `authStore.svelte.ts`,
local SQLite data isolation (`owner_id`)
**Status:** Not fixed yet. Root cause + file:line + suggested fix per item below.

---

## 1. Switching to a previously-online profile doesn't restore its server session

**Severity:** Medium — not data-unsafe, just defeats the point of "switching" (you still have
to go to Settings and log back in manually every time).

`authStore.loginOfflineAccount()` (`src/lib/api/authStore.svelte.ts:108-124`) **always** clears
online auth before activating the selected local profile:

```js
// Always clear online auth when entering local account mode. The local accounts tab
// means offline use — even if the account was previously linked, online auth must be
// re-established explicitly via the /auth screen.
user = null;
await apiClient.clearLocal();
```

That's true even when the target `LocalAccount` has a `serverUserId` set (i.e. it's a profile
that was previously signed in online, like Martin's free-tier test account) — there's no
attempt to restore that account's server session, only the local SQLite identity switches.

**Root cause, structurally:** `apiClient` only ever holds **one** global auth token in
`localStorage` (see `packages/core/src/api/client.ts`), not a token per local profile. So even
if the code wanted to silently restore the other account's session, there's nothing stored to
restore — the design has no per-profile persisted credential/refresh-token.

**Fix options:** (a) persist a refresh token per `LocalAccount` (needs secure storage on
native, and a decision about how long a stale refresh token stays valid), and have
`loginOfflineAccount` attempt to use it before falling back to "please sign in"; or (b) keep
the current explicit-re-auth behavior but make the switcher UI honest about it — e.g. show
"You'll need to sign back in to sync" on any profile with a `serverUserId`, instead of
implying `switchTo()` fully activates the profile.

---

## 2. New profiles can silently claim another profile's un-migrated local data

**Severity:** High — this is the one that actually leaked data: after switching profiles,
splits/workouts still showed the previous (Pro) account's data instead of the new profile's own.

`claimOrphanedData(ownerId)` (`src/lib/data/localAccountRepo.ts:162-166`) reassigns any row
still sitting at `owner_id IS NULL` to the given account:

```sql
UPDATE sessions  SET owner_id = ? WHERE owner_id IS NULL
UPDATE splits    SET owner_id = ? WHERE owner_id IS NULL
UPDATE exercises SET owner_id = ? WHERE owner_id IS NULL AND is_core = 0
```

It's meant to run **once**, for the very first account ever created on a device, to adopt
pre-multi-profile history. `repoProvider.ts`'s `ensureLocalAccount()` gets this right — it
only calls it inside `if (all.length === 0)` (`repoProvider.ts:112-121`, true first launch).

But `authStore.createOfflineAccount()` — the "Add another profile" flow
(`authStore.svelte.ts:132-158`) — calls `claimOrphanedData(account.id)` **unconditionally**,
with no check for whether other profiles already exist:

```js
const account = await createLocalAccount({ username: uniqueSlug, ... });
setActiveOwnerId(account.id);
await claimOrphanedData(account.id);   // <-- no `if (all.length === 0)` guard here
```

Every read query in the sqlite repos also falls back to unowned rows —
`WHERE owner_id = ? OR owner_id IS NULL` (`splitRepo.sqlite.ts:98,188`,
`workoutRepo.sqlite.ts:89,111,161`) — so between the moment a second profile is created and the
moment `claimOrphanedData` runs for it, any still-NULL rows are visible to **both** profiles;
and once the second profile's `claimOrphanedData` call fires, it reassigns those rows to
itself, pulling the first profile's un-migrated history over.

This matches Martin's repro exactly: a second (free-tier) profile ended up showing the first
(Pro) profile's splits and workouts.

**Fix:** gate `createOfflineAccount()`'s `claimOrphanedData` call the same way
`ensureLocalAccount()` does — only claim orphaned rows when this is genuinely the first
account on the device (`listLocalAccounts()` was empty *before* this create). For every
subsequent profile, it should start with a clean slate; there's no scenario where a second or
later profile should ever adopt another profile's history via an implicit NULL-owner sweep.
