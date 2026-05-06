# Logit Cloud & Social Roadmap

## Architecture Overview

Three distinct pillars, kept separate by design:

| Pillar | What it is | Who runs it |
|---|---|---|
| **Logit Social** | Posts, follows, feed, likes, comments | You (central server) + federated self-hosters |
| **Logit Cloud** | Workout data sync, backup | You (managed) or self-hosters |
| **PT Studio** | Client management, programming, progress tracking | Self-hosters or paid Logit Cloud tier |

---

## Phase 1 — Logit Cloud (Data Sync)

Get paying customers before building the complex stuff.

- [ ] Conflict-resolution strategy for workout data (last-write-wins vs CRDT)
- [ ] Sync API: push/pull workout sessions, splits, exercises, personal records
- [ ] Cloud account tied to existing auth (already partially built)
- [ ] Subscription/billing (Stripe) — free tier with storage cap, paid tier for unlimited
- [ ] Background sync on native (Capacitor background task)
- [ ] Restore flow: new device install → log in → data appears

**Goal:** Paying users with a reason to create a Logit Cloud account.

---

## Phase 2 — Social Server (Centralised First)

Build it centralised and working before adding federation complexity.

- [ ] Post types already exist — wire them to a proper feed server
- [ ] Follow/unfollow, follower graph
- [ ] Feed endpoint (already partially built in the API)
- [ ] Notifications (likes, comments, follows)
- [ ] Content moderation basics (report, block user)
- [ ] Profile pages (public workout stats, active split, PRs)

**Goal:** Logit Cloud users can follow each other and share workouts. No federation yet.

---

## Phase 3 — Federation

Let self-hosted Logit instances participate in the social graph.

### How it works
- Each self-hosted instance gets a **keypair** on setup
- Requests from an instance to your social server are **signed with the instance's private key**
- Your social server fetches the instance's public key and verifies the signature
- Identity format: `username@their-instance.com` — no username collision with `username@logit.app`
- You never authenticate remote users directly — the **instance vouches for its users**

### Build order
- [ ] Instance keypair generation on self-host setup
- [ ] HTTP Signature signing on outbound federated requests
- [ ] Inbound signature verification on your social server
- [ ] Instance registration endpoint (self-hosters ping your server to enroll — not open federation to start)
- [ ] Cross-instance follow (follow `username@gym.example.com` from logit.app)
- [ ] Cross-instance feed aggregation
- [ ] User search by full handle (`@username@instance`)

### Decisions to make before building
- **Open vs registered federation**: recommend starting with **registered** (instances enroll with your server). Gives you leverage to defederate bad actors. Can open it later.
- **ActivityPub vs custom protocol**: ActivityPub gives free Mastodon interop but is complex. A lightweight custom protocol is faster and easier to control. Start custom, adopt ActivityPub later if demand exists.

### Abuse controls (build alongside federation, not after)
- [ ] Per-instance rate limiting
- [ ] Defederation (block an entire instance)
- [ ] Instance reputation / strike system
- [ ] Admin dashboard for federation management

---

## Phase 4 — PT Studio

A private layer — completely separate from the social/public feed.

### Model
- **Self-hosted**: PTs run their own Logit instance, clients connect to it. Free.
- **Logit Cloud**: PT pays for a managed Studio plan. You run the infra.

### Features
- [ ] PT account role on an instance
- [ ] Client onboarding (invite link → client installs app → connects to PT's instance)
- [ ] Programming: PT assigns splits/workouts to clients
- [ ] Progress visibility: PT can view client session history, PRs, compliance
- [ ] Messaging / notes between PT and client
- [ ] Client billing (optional — PT charges their own clients through the app)

### What PT Studio is NOT
- Not part of the social feed — client data never touches the federation layer
- Not a marketplace — you're not taking a cut of PT revenue (unless you want to)

---

## Key Principles to Keep in Mind

1. **Sync and social are independent** — a user can have cloud sync without social, or social without sync
2. **PT data never touches the social layer** — keep private data strictly private
3. **Self-host is always free** — Logit Cloud charges for convenience, not capability
4. **Start centralised, add federation later** — don't build the hard thing before the simple thing works
5. **Register before federate** — require instance enrollment before open federation to retain abuse controls
