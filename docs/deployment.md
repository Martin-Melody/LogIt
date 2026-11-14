# Deployment

Logit has two hosting stories, Bitwarden-style: self-host it yourself for free, or let Logit
host it for you and pay for the convenience. Same Docker images either way — only where they
run differs.

## Self-hosting (free)

Everything you need is `docker-compose.yml` at the repo root:

```bash
cp .env.example .env   # fill in JWT_SECRET and ADMIN_KEY
docker compose up -d
```

Runs the API (SQLite storage, persisted in a named volume) and the analytics web app
(`logit-web`) on your own machine or server. See the root `README`/`.env.example` for the two
required secrets. This is the whole self-host story — no AWS or Cloudflare account needed.

## Logs and diagnostics

**Server.** The API writes one line per request to stdout (`docker compose logs -f api`):

```
2026-11-12 15:59:13.458Z INFO  Logit.Requests req=76ac8caa85c1 POST /auth/login 401 590ms user=-
```

`req=` is the request id. The app sends one with every call (`X-Request-Id`) and keeps it in its
own log, so an app entry like `POST /sync/sessions 500 {"requestId":"76ac8caa85c1"}` can be found
with `grep 76ac8caa85c1`. A 500 also returns the id to the app ("Reference: …"). Anything logged
while handling the request (auth failures, billing webhooks, unreadable stored data, exceptions
with their stack trace) carries the same `req=`. For structured output (e.g. CloudWatch queries)
set `Logging__Console__FormatterName=json`; the id is then a `RequestId` field. Levels are set
under `Logging:LogLevel` as usual (`Logging__LogLevel__Default=Debug` for more detail).

**App.** Settings → Diagnostics shows the app's own log (newest 1,000 entries, kept on the
device): failed and slow requests, sync steps that failed, crashes. Users can copy it or save it
as a file. "Detailed logging" also records every request and sync step. On the hosted service a
signed-in user can also **Send to Logit**: the report is stored in `DiagnosticReports`, shown on
`/admin` under "Diagnostics", deleted after 30 days and with the account. Self-hosted servers
refuse reports (404) and the app doesn't offer the button, so self-hosted and offline logs never
leave the device.

## Logit-hosted (paid) — what actually runs where

| Piece | What it is | Runs on | Example URL |
|---|---|---|---|
| `services/api` | Auth, sync, social, billing | Hetzner VPS (Docker: Caddy + API + Postgres 17) — see `deploy/production/README.md` | `api.getlogit.app` |
| `apps/clients/logit-web` | Analytics dashboard | Same VPS, behind the same Caddy | `app.getlogit.app` |
| `apps/clients/website` | The website: home, pricing, legal pages, self-hosting guide, plugin docs | Cloudflare Pages (static SvelteKit, `adapter-cloudflare`) | `getlogit.app` |

Since 2026-11-13 the API and dashboard run on a single VPS instead of AWS
(`deploy/production/README.md`); the AWS notes below describe the earlier setup.

**Important: `logit-web` on AWS is one shared, multi-tenant deployment — not one instance per
paying customer.** A customer who buys hosting doesn't get their own server; they get an account
inside the one `app.getlogit.app` deployment, the same way every Bitwarden Cloud customer logs into
the same shared `vault.bitwarden.com`. Their data is isolated by the API scoping everything to
their user id, not by separate infrastructure. Spinning up per-customer infrastructure was never
built and isn't the plan — that doesn't happen anywhere in this codebase.

Self-hosters are the only ones who get a genuinely separate instance, because they're running
their own copy of the whole stack (`docker-compose.yml`) on their own infrastructure — that part
really is "one deployment per self-hoster," but it's also entirely their own to place wherever
they like, nothing Logit-run is involved.

The mobile app (`apps/clients/logit-frontend`) isn't "hosted" anywhere — it's a Capacitor build
distributed through app stores, and talks to whichever API URL the user configures (the managed
one by default, or their own self-hosted URL via the connect flow).

### Cloudflare Pages (website)

`apps/clients/website` replaced `logit-marketing` and `docs-site` on 2026-11-13. Every page is
pre-rendered, so the build output is static files:

```bash
cd apps/clients/website
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name logit-website
```

`.github/workflows/deploy-web.yml` does the same on every push to `main` that touches
`apps/clients/website/**` or `packages/ui/**` (it needs the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets). The site doesn't call the API. Links, prices and contact
addresses live in `apps/clients/website/src/lib/site.ts`; the app screenshots in `static/screens`
are regenerated with `apps/clients/website/scripts/screenshots/`.

The look (colours, Inter, radius) comes from `packages/ui`, shared with the phone app and the
dashboard. Change it there, not in an app.

### AWS (services/api + logit-web)

See `infra/aws/README.md` — Terraform for VPC + RDS Postgres + ECR + two App Runner services
(API and the shared `logit-web` dashboard), plus the deploy loop (`docker build && push`) for
every release after the first `terraform apply`.

**The one thing to know before touching the database in production:** SQLite (self-host) and
Postgres (AWS) each have their own EF Core migration history now, because migrations bake in
provider-specific column types and can't be safely shared. Any schema change needs generating
twice — see the "Database" section of `infra/aws/README.md` for the exact commands. This isn't
a hypothetical: it was a real bug (wrong column type, broke on first write) caught by actually
running the API against a local Postgres container while building this.

## Billing

Three tiers: **Free**, **Pro** (individual: sync, dashboard, analytics) and **Studio** (personal
trainers: everything in Pro plus clients). Self-hosted servers have no billing; every account
gets everything.

**Where plans come from.** Every paid subscription is a row in `BillingSubscriptions` with a
source (`google`, `apple` or `stripe`), a plan, a state and an end date. `User.Tier` is worked
out from those rows plus `User.ManualTier` (a plan given by hand in the admin page), in
`Features/Billing/Entitlements.cs`: the higher of the two counts. Active, cancelled-but-paid-up
and grace-period subscriptions give access; on hold, paused, expired, refunded and replaced ones
don't. Nothing should set `User.Tier` directly; call `Entitlements.RecomputeAsync`.

**At launch only the Android app sells** (Google Play Billing). Web checkout through Stripe is in
the code but answers 403 `web_checkout_disabled` unless `Billing:WebCheckout` is `true`. The
Stripe portal and webhook still work for anyone who pays through Stripe. The App Store (iOS) is
planned: the source already exists, and a store plugs into the hourly sweep through
`ISubscriptionRefresher`.

### Google Play

1. The app buys with Play Billing, passing the Logit user id as `obfuscatedAccountId`, then sends
   the purchase token to `POST /billing/google/verify`. The server reads the purchase from the
   Google Play Developer API (never trusting the app), saves it, works out the tier, and then
   acknowledges it (Google refunds purchases not acknowledged within 3 days). The app calls the
   same endpoint for every purchase Play reports on start-up, which covers restores and crashes.
   Answers: 200 with the billing status, 400 `invalid_purchase`, 409 `other_account` (bought for or
   already owned by another Logit account), 502 `store_unavailable`, 503 `store_not_configured`.
2. Google sends Real-time developer notifications (renewal, cancel, grace period, account hold,
   pause, expiry, refund) through Pub/Sub to `POST /billing/google/notifications?token=…`. The
   notice only names a purchase token; the server reads the real state from Google again. A
   notice that can't be handled because Google is unreachable gets a 503, so Pub/Sub retries.
3. `SubscriptionSweeper` runs hourly: it re-reads any live subscription whose paid period has
   ended or that hasn't been checked for a day (which also retries acknowledgements), and ends
   access for stores it can't ask once the paid period is over.
4. An upgrade, downgrade or resubscribe gives a new token with `linkedPurchaseToken`; the old row
   becomes `Replaced`.

Config (production `.env` names in brackets):

- `GooglePlay:PackageName`: default `ie.logit.app`.
- `GooglePlay:ProProductId` / `GooglePlay:StudioProductId`: Play Console subscription ids,
  default `logit_pro` / `logit_studio` (monthly and yearly are base plans of the same product).
- `GooglePlay:ServiceAccountJson` (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, the key on one line:
  `jq -c . key.json`) or `GooglePlay:ServiceAccountKeyFile` (a path). The service account needs
  "View financial data" and "Manage orders and subscriptions" in Play Console → Users and
  permissions, and the Google Play Android Developer API enabled in its Cloud project.
- `GooglePlay:NotificationToken` (`GOOGLE_PLAY_NOTIFICATION_TOKEN`): a long random string. Create
  a Pub/Sub topic, grant `google-play-developer-notifications@system.gserviceaccount.com` the
  Publisher role on it, add a **push** subscription to
  `https://api.getlogit.app/billing/google/notifications?token=<it>`, and put the topic name in
  Play Console → Monetization setup → Real-time developer notifications. Its "Send test
  notification" button should log "Google Play test notification received". Without the token
  the endpoint answers 404.

### Stripe (off)

`Stripe:SecretKey`, `Stripe:WebhookSecret` (webhook at `https://<api-url>/billing/webhook`, events
`checkout.session.completed` and `customer.subscription.created/updated/deleted`),
`Stripe:ProPriceId`, `Stripe:StudioPriceId`, plus `Billing:WebCheckout=true` to sell on the web.
Never tested with real keys. Checkout refuses (409 `already_subscribed`) anyone who already has
a plan from another store.

### Status for the app and dashboard

`GET /billing/status` → `{ tier, subscriptionActive, manualTier, subscription, webCheckout }`,
where `subscription` is the one giving access (else the latest) with `source`, `plan`, `state`
(`active`, `canceled`, `gracePeriod`, `onHold`, …), `expiresAt`, `autoRenewing`, `grantsAccess`
and `manageUrl` (Google Play's or the App Store's subscription page; null for Stripe, which uses
`POST /billing/portal`).

## PT Studio — coach/client consent flow

A Studio-tier account can invite another account (any tier) to become a client, by username.
Nothing is visible to the coach until the client explicitly accepts — this is enforced
server-side (`Features/Coach/CoachEndpoints.cs`), not just hidden in the UI. Once active, the
`/sync/*` GET endpoints accept an optional `?clientId=` that's authorized against an Active
`CoachClientRelationship` before returning anything; the POST (write) endpoints never accept it
— a coach can only ever read, never modify, a client's data. Either party can revoke access at
any time. In `logit-web`, a Studio-tier account with active clients gets a switcher to view the
existing analytics screens scoped to a client instead of themselves — same screens, same
usecases, just pointed at a different `RemoteWorkoutRepo`.

Verified with a full live authorization sequence (register coach + client + an unrelated third
account, invite while Free-tier → 403, invite as Studio → 201, read client data while still
Pending → 403, accept, read succeeds with real data, unrelated third party → 403, revoke, read
→ 403 again) — this is consent/privacy-sensitive code, so it was checked end-to-end, not just
type-checked.

## Signup flow (getlogit.app): removed for launch

**Since 2026-11-13 the website sells nothing.** Plans are bought in the Android app through
Google Play Billing, and the old `/signup`, `/success` and `/pt` pages went with
`logit-marketing`. The API's Stripe endpoints are still there, unused, for selling on the web
later. The rest of this section describes how that flow worked; the tier enforcement part still
applies.

`/` → `/pricing` (Free / Pro / Studio) → `/signup?plan=pro|studio` (register, immediately
redirected to Stripe Checkout for the chosen plan) → `/success` (post-payment landing, polls
`/billing/status` until the webhook flips the account to the right tier). `/pt` is a redirect
alias to `/pricing`, kept from an earlier "logit.com/pt" naming idea.

`/signup` with no `plan` param registers a genuine **Free**-tier hosted account instead — no
Stripe involved. This is a real, separate offering from self-host: it's for someone who wants
the mobile app's social feed (posts, comments, follows) without running their own server, but
doesn't want to pay for sync/dashboard/analytics either. Reached via the "Sign up free" link on
the pricing page's Free card (`apps/clients/logit-marketing/src/routes/pricing/+page.svelte`).

**Enforcement, not just copy:** Free-tier accounts are blocked from cross-device sync at the API
(`services/api/.../Features/Sync/SyncEndpoints.cs` group-gated with
`.RequireTier(UserTier.Pro)`, see `Features/EndpointTierExtensions.cs`) and from the whole
`logit-web` dashboard (its root `+layout.svelte` redirects an authenticated Free-tier user to
`/upgrade` instead of rendering the dashboard shell) — but **only when `logit-web` is in cloud
mode**. Self-hosted `logit-web` instances skip this check entirely: self-host has no billing, so
every local account defaults to `Tier = Free` in the DB regardless, and none of them should be
gated. Social endpoints (`Features/Social/SocialEndpoints.cs`) are intentionally left ungated —
Free tier is exactly the tier the social feed is meant for.

Verified live: registered a Free-tier account, confirmed `POST /sync/sessions` → 403 and
`POST /posts/` → 201 (social still works); flipped the same account to `Pro` in the DB, confirmed
sync → 204. Also drove `logit-web` in a real browser in cloud mode: Free-tier login lands on
`/upgrade`, Pro-tier login lands on the normal dashboard.
