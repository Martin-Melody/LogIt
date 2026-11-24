# Logit Social — federation design

Status: **design, not built.** Phase 3 of `docs/cloud-social-roadmap.md`. This
document makes the roadmap's federation bullets concrete and records the
decisions, so the centralised redesign (Phase 2) doesn't paint us into a corner.

## The problem

Today there are separate social graphs:
- The hosted instance (`getlogit.app`) — free-tier and paid users post, follow, and
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

- Canonical handle: `@username@instance-domain` (e.g. `@martin@getlogit.app`,
  `@sam@gym.example`).
- Local users on this instance: `User.Origin == null`. Their bare `@username` is
  unambiguous *on this instance*.
- Remote users are **mirrored** as local `User` rows with `Origin = "<domain>"`
  and a cached profile snapshot (display name, bio, avatar URL, last refreshed
  timestamp). They have no credentials here. `Username` is unique **per Origin**,
  not globally — a `gym.example` `martin` and a `getlogit.app` `martin` coexist.
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

## Friends overhaul (decided 2026-11-24)

The friends overhaul (`docs/friends-overhaul.md`) adds stories, training now,
cheers, messages, groups with events, boards and photos. All of it fits the
model above: each is a few more activities, and the person's own instance stays
the one that applies their privacy choices and pushes to their phone.

| Feature | Activities | Who decides |
|---|---|---|
| Messages and requests | `Create(Message)`, `Read`, `Delete(Message)` to the recipient's instance | The recipient's instance applies their message controls (chats, requests, refuse) |
| Training now | `Presence(Training)`, `Presence(Done)` to instances with followers who may see it | Sent only while "Show when you're training" is on |
| Cheers | `Cheer` to the trainee's instance, which turns it into a push | The trainee's "Cheers and replies" setting |
| Stories | `Create(Story)` with `expiresAt` and the allowed viewers; `Delete(Story)` at expiry or on delete | The author's instance picks which instances get it (audience, Close friends, Hide story from) |
| Groups and events | The group lives on one home instance. `Join`, `Leave`, `Create(GroupMessage)`, `Rsvp` go to it; it sends page, event and chat updates to members' instances | The home instance owns the group; each member's instance owns their choices |
| Boards | `Summary(Week)`: done of planned, weeks kept, volume against their own usual | Sent only if the member is on boards (globally or for that group); never workouts or weights |
| Photos | The receiving instance copies the photo into its own photo store and serves its copy; deleted with what it belongs to | Replaces "no media federation" below |

Notifications and pushes need nothing new: a remote like, message or cheer
lands as an ordinary `Notification` on the recipient's own instance, and its
push dispatcher (or the relay, for self-hosters) sends it.

**Trust limit.** Close friends, Hide story from, the 24-hour expiry and read
receipts rely on the receiving instance honouring them once content has been
sent, as with email or Mastodon. This is why peering is registered, not open: an
instance that ignores the rules can be suspended or blocked. The story audience
picker says that close-friends stories reach friends on other servers too.

**Rules for building the friends features now**, so federation adds transport
and not rewrites:

1. **Photos from another instance are stored by absolute address**
   (`https://their-server/photos/…`, or the local copy's address). Local photos
   are saved as `/photos/…`, which the apps resolve against their own server
   (`photoSrc`); that is only right for local photos.
2. **Filter before sending, never after.** Anything a setting turns off is not
   sent anywhere: boards, training now, story audiences, read receipts.
3. **Every new item has a permanent id and a home instance**: stories, messages,
   groups, events, cheers, RSVPs. A group belongs to exactly one instance.
4. **Social writes go through one place on the server** (the activity point that
   federation will deliver from), not straight into each feature's tables.

## Open decisions for Martin

1. **Keypair algorithm** — Ed25519 (small, fast, modern) vs RSA-2048 (universal,
   ActivityPub-compatible if we ever bridge). Recommend Ed25519 now, add RSA only
   if bridging.
2. ~~**Protected accounts**~~ — answered: private accounts exist (approved
   followers), so `Accept(Follow)` is manual for a private account.
3. **Handle rendering in the UI** — always show `@user@instance`, or show bare
   `@user` for same-instance and full handle only for remote? (Familiar apps that
   federate, e.g. Mastodon, show bare locally.)
4. **Who can run a peer** — any self-hoster who asks, or a vetted allowlist to
   start? Ties into how loud the abuse story needs to be on day one.
5. **Free-tier hosted users and federation** — a free hosted account is
   "mobile social only" today. Do their posts federate out to peers, or is
   federation a Pro perk on the hosted instance? (Self-hosters always get it.)
6. ~~**DMs**~~ — answered (2026-11-24): messages between people ship in the
   friends overhaul before federation, so messages between instances are part of
   Phase 3.

## Not doing

- ActivityPub compliance / Mastodon interop — revisit only if there's real
  demand; the activity shapes above keep the door open.
- Cross-instance search / discovery of arbitrary handles — you can follow a
  handle you know; global remote search is later.
- ~~Media federation~~ — now needed: photo storage exists (2026-11-24) and
  stories and messages carry photos. See the Friends overhaul section.
