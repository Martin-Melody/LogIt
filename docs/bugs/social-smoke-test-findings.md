# Bugs: social + account smoke-test findings (2026-09-04)

**Reported:** 2026-09-04 (Martin, on-device smoke test of `feat/social-redesign` +
`feat/store-readiness` post-merge, S23 release build)
**Area:** `/social` feed, notifications badge, Settings (Sync/Coaching/connection status)
**Status:** Not fixed yet. Root cause + file:line + suggested fix per item below.

---

## 1. Pull-to-refresh doesn't work — because it was never wired up

**Severity:** Low/Medium — infinite scroll still works, feed still loads on entry; refreshing
is just dead.

`apps/clients/logit-frontend/src/routes/social/+page.svelte` has a `refreshing` state var
(`~line 16`) and a spinner block gated on it (`~line 120`), plainly scaffolded for pull-to-
refresh — matches the original plan's "keep pull-to-refresh". But `load("refresh")` is never
called from anywhere in the file: no touch/gesture handler exists at all, only `load("initial")`
on mount (`~line 52`) and `load("more")` from the infinite-scroll `IntersectionObserver`
(`~line 59`). The `refreshing` UI is unreachable dead code.

**Fix:** wire an actual pull-down gesture (touch handlers on the scroll container, or a small
library) that calls `load("refresh")` past a pull threshold, or drop the dead `refreshing`
state/UI if pull-to-refresh is deprioritized.

---

## 2. Notification bell/nav badge doesn't update while you're in the app

**Severity:** Medium — notifications work (they show up on the notifications page), but the
whole point of the badge is to tell you *before* you go looking.

`src/lib/stores/notifications.store.ts`'s `unreadNotifications` only refreshes on:
- `start()` (once, from `appInit`'s `finally`, on cold launch)
- a 60s `setInterval`
- `document.visibilitychange` firing to `"visible"` — which requires the **app itself** being
  backgrounded/foregrounded (native app switch), not in-app SPA navigation between routes.

Nothing calls `unreadNotifications.refresh()` when navigating **into** `/social`
(`src/routes/social/+page.svelte` imports the store only to read `$unreadNotifications` for the
bell, `~line 79-82`) or into any other screen. So if a notification is created while you're
already in the app, the bell/nav dot stays stale until the next 60s poll tick — which is exactly
what Martin saw: notifications existed on `/social/notifications` (that page calls `.clear()` on
load, `notifications/+page.svelte:37`) but no badge had appeared yet anywhere.

**Fix:** call `unreadNotifications.refresh()` on mount of `/social/+page.svelte` (and ideally
anywhere the bell/dot is visible), not just rely on the interval + visibilitychange.

---

## 3. "Sync now" isn't tier-gated, and silently reports success even when every push is rejected

**Severity:** High — actively misleads Free-tier users into believing their data is safely
synced when it never left the device.

`src/routes/settings/+page.svelte` renders the "Sync now" button (`~line 411`) for **any**
authenticated user — no `authStore.user.tier` check, only `disabled={syncing || serverMode ===
"offline"}`. But server-side, almost every `/sync/*` endpoint is
`.RequireTier(UserTier.Pro, ...)` (`services/api/.../Features/Sync/SyncEndpoints.cs:20-48`) — a
Free-tier account gets 403s on essentially everything.

Those 403s are invisible: every push/pull in `src/lib/sync/syncService.ts` wraps its call in a
bare `catch {}` or `catch(() => enqueue(...))` (e.g. `~line 89`, `~106`, `~134`, `~159`, `~188`,
`~216`, `~244`, and on through nutrition/habits). Worse, `syncAll()` (`~line 921-941`)
unconditionally stamps `lastSyncedAt = Date.now()` **after** `Promise.all([...])` resolves,
regardless of whether any individual pull/push actually succeeded. So a Free-tier user tapping
"Sync now" sees the spin, "Syncing…" → "Just now" — a clean success state — while every request
was rejected and nothing happened.

This is the same shape of problem as the settings copy already anticipates elsewhere: `/clients`
(`src/routes/clients/+page.svelte:111-114`) correctly shows a Studio-tier gate message instead
of pretending the feature works. `Sync now` doesn't do the equivalent for Pro-gating.

**Fix:**
- Hide or disable "Sync now" for `tier === "Free"`, with the same pattern used for Coaching's
  Studio gate (a short explanatory line instead of a dead button).
- Separately (real bug regardless of gating): `syncAll()` should only stamp `lastSyncedAt` based
  on actual success, and the individual `catch {}`s should distinguish "queued for retry" from
  "server rejected this — not a network blip" so failures aren't silently treated as delivered.

---

## 4. The green "Connected" dot next to "Sync now" implies sync is active — it only means the API is reachable

**Severity:** Low — cosmetic/labeling, but compounds #3's misleading effect.

`src/lib/components/ConnectionDot.svelte` reflects `connectionStatus.state` — literally just
"can the app reach the server" (green/red/grey), unrelated to sync entitlement or tier. It's
placed directly beside "Sync now" and the last-synced timestamp
(`src/routes/settings/+page.svelte:417-420`), which reads as "sync is working" to a Free-tier
user who is in fact never able to sync anything. The dot is accurate for what it measures; the
placement/framing is what's misleading.

**Fix:** once #3's gating is fixed, this mostly resolves itself (Free tier wouldn't see the
sync row at all). If the dot needs to stay visible outside that row too, consider a distinct
label ("Server reachable") rather than implying sync status.

---

## 5. "Coaching" label reads as "become a coach", not "your coaching relationships"

**Severity:** Low — this part is *not* a gating bug. By design (`project_pt_studio` /
`src/routes/clients/+page.svelte:111-114`), any tier can view + accept/decline received coach
invites; only Studio tier can send invites / manage clients ("My clients" section is Studio-
gated with a clear message, `~line 111`). So a Free or Pro account correctly sees the
"Coaching" settings row — that's intentional, matching the web client-invite behavior.

The actual issue is copy: the row just says "Coaching" (`settings/+page.svelte:429-431`) with a
`Users` icon and no subtext, so it reads like a coach-signup entry point rather than "manage
invites you've received / relationships you're part of." Martin's read on first use: "it seems
like this is where you'd go to be a coach instead."

**Fix:** rename the row or add a one-line subtext (matching the pattern already used for the
Plan row's informational copy, `~line 401-407`) — e.g. "Coaching" → "Coaching invites" or add
"View invites, or manage clients on a Studio plan" beneath it.
