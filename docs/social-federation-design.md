# Logit Social — federation design

Status: **design, not built.** Phase 3 of `docs/cloud-social-roadmap.md`. This
document makes the roadmap's federation bullets concrete and records the
decisions, so the centralised redesign (Phase 2) doesn't paint us into a corner.

## The problem

Today there are separate social graphs:
- The hosted instance (`logit.ie`) — free-tier and paid users post, follow, and
  see one feed.
- Each self-hosted instance — its users' posts and follows are local to that box.

Martin wants everyone — hosted and self-hosted — to eventually talk to each
other, without a central chokepoint owning every self-hoster's data and without
inheriting a full ActivityPub implementation before it's warranted.

## Model: instance-vouched federation

Each Logit instance is a **peer**. Instances — not individual users — authenticate
to each other. An instance vouches for its own users; a receiving instance never
authenticates a remote user directly.

### Identity

- Canonical handle: `@username@instance-domain` (e.g. `@martin@logit.ie`,
  `@sam@gym.example`).
- Local users on this instance: `User.Origin == null`. Their bare `@username` is
  unambiguous *on this instance*.
- Remote users are **mirrored** as local `User` rows with `Origin = "<domain>"`
  and a cached profile snapshot (display name, bio, avatar URL, last refreshed
  timestamp). They have no credentials here. `Username` is unique **per Origin**,
  not globally — a `gym.example` `martin` and a `logit.ie` `martin` coexist.
- `Post` and `Comment` get their origin transitively from `Author`. A mirrored
  remote post is a local row authored by a mirrored remote user, carrying the
  remote `Id` (so dedupe on re-delivery is trivial) and a `RemoteUrl`.

> **Schema state after the Phase 2 redesign:** `User.Origin` (nullable) exists.
> `Username` is still globally unique (single-column index) — the switch to a
> `(Username, Origin)` uniqueness rule is a Phase 3 migration, because a filtered
> unique index (`WHERE Origin IS NULL`) needs provider-specific SQL and wasn't
> worth doing before it's used. Everything else below is new build.

### Transport & auth: HTTP Signatures

- On self-host setup / first boot, `services/api` generates an **Ed25519 (or RSA)
  keypair** and persists it (a `InstanceKey` row or a config secret). The public
  key is served at a well-known URL: `GET /.well-known/logit-instance` returns
  `{ domain, publicKey, softwareVersion, registeredFederationOnly: bool }`.
- Every outbound federated request is signed: the instance signs the request
  (method, path, `Host`, `Date`, `Digest` of the body) with its private key and
  sends a `Signature` header naming its key URL.
- The receiver fetches the sender's public key (cached with a TTL) and verifies.
  A valid signature means "this request genuinely comes from `<domain>`."
- Clock skew tolerance ±5 min on `Date`; reject stale requests (replay guard).

### Registration: closed first

Federation is **registered, not open**, to start:

- An instance admin adds a peer: `POST /admin/api/federation/peers { domain }`.
  This instance fetches the peer's `/.well-known/logit-instance`, stores its
  domain + public key + status `Pending`.
- Peering is mutual — both sides must add each other before activities flow. A
  peer row has `Status ∈ { Pending, Active, Suspended, Blocked }`.
- `Blocked` = defederation: drop all inbound activities, hide already-mirrored
  content from that instance, stop outbound delivery. One switch.
- Open federation (auto-accept any instance that presents a valid signature) is a
  later config flag once abuse controls are proven.

### Activities: a small custom protocol

JSON documents `POST`ed to a peer's inbox (`POST /federation/inbox`, signed).
Deliberately a subset of ActivityPub's shape so a bridge stays possible later,
but not ActivityPub-compliant.

| Activity | Trigger | Payload |
|---|---|---|
| `Follow` | local user follows `@remote@peer` | actor handle, target handle |
| `Undo(Follow)` | unfollow | same |
| `Accept(Follow)` | peer accepts (auto, unless the target is protected) | follow ref |
| `Create(Post)` | local user posts and has remote followers | post id, type, body, payloadJson, createdAt, author handle |
| `Update(Post)` | edit | same |
| `Delete(Post)` | delete | post id |
| `Like` / `Undo(Like)` | like/unlike a remote post | post id, actor |
| `Create(Comment)` | comment on a remote post | comment id, post id, body, actor |
| `Flag` | a report is filed against remote content | target ref, reason (forwarded to the origin instance's moderators) |

Post `type` and `payloadJson` cross the wire unchanged — a peer that doesn't
understand a `payloadJson` shape just renders the `body` and a generic card.

### Delivery model

- **Outbound:** on a local write, look up which peer instances have at least one
  follower of the author; enqueue a signed activity per peer. Retry with backoff;
  drop after N failures and mark the peer `Suspended` if it's persistently down.
- **Inbound:** verify signature → check peer `Active` → apply. `Create(Post)`
  mirrors the post locally (creating/refreshing the remote author row).
- **Feed aggregation stays local.** Each instance builds its own users' feeds
  from its own DB (local posts + mirrored remote posts). No cross-instance
  fan-out-on-read.
- **Backfill:** when a local user first follows `@remote@peer`, pull that actor's
  recent posts once (`GET /federation/actors/{username}/outbox` on the peer,
  signed) so the feed isn't empty.

### Abuse controls (built alongside, not after)

- Per-peer inbound rate limits (activities/min), separate from the per-user
  limiter added in Phase 2.
- Instance block (defederation) — the `Blocked` status above.
- Instance reputation: track delivered-spam / valid-`Flag` ratio per peer; auto-
  `Suspend` past a threshold, admin review to restore.
- `Flag` forwarding: a report against remote content is both stored locally (so
  our admin can hide the mirror) and forwarded to the origin instance.
- Mirrored content honours the *local* block list — if a local user blocks a
  remote user, the Phase 2 block-aware queries already hide them.

## What the Phase 2 redesign already bought us

- `User.Origin` column — remote actors have a home for their rows.
- Opaque cursor pagination — federated feeds mix timelines from multiple sources;
  a `createdAt`-only cursor already tolerates that.
- `Block` / `Report` / block-aware queries — moderation works identically for
  local and (once mirrored) remote content; `Report` just needs a nullable
  `OriginInstance` column and the forward step.
- `Notification` — remote likes/comments/follows map onto the same table
  (`ActorId` points at the mirrored remote user row).

## Open decisions for Martin

1. **Keypair algorithm** — Ed25519 (small, fast, modern) vs RSA-2048 (universal,
   ActivityPub-compatible if we ever bridge). Recommend Ed25519 now, add RSA only
   if bridging.
2. **Protected accounts** — do we support "followers must be approved" at launch,
   or is every profile public? (Affects `Accept(Follow)` being automatic.)
3. **Handle rendering in the UI** — always show `@user@instance`, or show bare
   `@user` for same-instance and full handle only for remote? (Familiar apps that
   federate, e.g. Mastodon, show bare locally.)
4. **Who can run a peer** — any self-hoster who asks, or a vetted allowlist to
   start? Ties into how loud the abuse story needs to be on day one.
5. **Free-tier hosted users and federation** — a free hosted account is
   "mobile social only" today. Do their posts federate out to peers, or is
   federation a Pro perk on the hosted instance? (Self-hosters always get it.)
6. **DMs** — `project_unified_inbox` puts social DMs at "federation-era." In
   scope for Phase 3, or Phase 3.5?

## Not doing

- ActivityPub compliance / Mastodon interop — revisit only if there's real
  demand; the activity shapes above keep the door open.
- Cross-instance search / discovery of arbitrary handles — you can follow a
  handle you know; global remote search is later.
- Media federation — no image posts exist yet (see the Phase 2 scope).
