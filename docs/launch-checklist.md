# Android launch checklist

Started 2026-11-13. Decisions so far:

- **Android first, with paid plans from day one.**
- **Paid hosting on a cheap VPS** (e.g. Hetzner, EU region) until we need more.
- **Google Play Billing in the app**, built ourselves (own Capacitor plugin + the API checks purchases
  with Google). No RevenueCat.
- **Only the app sells at launch.** Website Stripe checkout stays in the code but is switched off; the
  website says "subscribe in the app". The server still records where each plan came from (Google or
  Stripe) so web sales can come back later.

`docs/store-submission.md` (Sept) is the older runbook. Parts of it are out of date: report/block for
the social feed **is** built, and the placeholder URLs/prices no longer apply.

---

## Martin: things only you can do

- [x] **Google Play Console account** ($25). Made 2026-11-19 (developer name "LogIt"); identity
      verified 2026-11-21 (personal account 7644235236860831014). App created 2026-11-21 (`ie.logit.app`, "LogIt: Gym &
      Workout Tracker"); AAB versionCode 1 (1.0.0.0) released on **internal testing**, en-GB listing has icon, feature
      graphic and 6 phone screenshots. No closed (alpha) release yet. Personal accounts
      need a **closed test with 12+ testers opted in for 14 days in a row** before production. Start lining
      up ~15 people now. (An organisation account skips this but needs a D-U-N-S number.)
- [ ] **Payments profile** in Play Console (needed to create subscriptions). EU rules show a seller's
      name, address, email and phone on the store listing: use a business/virtual address if you don't
      want your home address public.
- [x] **Prices in euro** (decided 2026-11-19, in `apps/clients/website/src/lib/site.ts` `PRICES`): Pro €2.99/month or
      €24.99/year with a 7-day free trial; Studio €14.99/month or €149/year with a 14-day free trial, no client limit.
      In Play Console: one base plan per period, the trial as a free-trial offer on each, and check the
      converted GBP/USD prices come out round.
- [ ] **Decide**: how many days to act on an emailed deletion request, and how long
      server backups are kept (the delete-account page says 30 and 30 for now).
- [x] **getlogit.app links open the app directly** (App Links, 2026-11-26): `apps/clients/website/static/.well-known/assetlinks.json`
      lists the Play app signing key's SHA-256 (read from the Play API, `generatedApks`). Covers /a, /f, /g, /@name,
      /forum/… and /t/… for Play-installed builds (`ie.logit.app`); lab debug builds (`ie.logit.app.dev`) still open the browser.
- [x] **Cloudflare Pages project** `logit-website`: created by the first deploy 2026-11-13, live at
      https://logit-website.pages.dev. GitHub has `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, so pushes to main deploy it.
- [ ] **Stripe for coach payments** (built 2026-11-16, off until this is done; not needed for launch):
      1. Stripe account for LogIt (Ireland), turn on **Connect** and fill in the platform profile (coaches
         run their own businesses; LogIt doesn't take a fee).
      Done 2026-11-19: Stripe account made, test mode rehearsed end to end on the lab (Stripe CLI
      forwarding, test key in `~/.keystores/stripe-test.key`); fixes from it are live. Left: steps 2–4 on production.
      2. Try it in a **sandbox** first: a restricted key there + a Connect webhook endpoint to
         `https://api.getlogit.app/coach/payments/webhook` (events listed in `docs/deployment.md`,
         "Coach payments"), then on the VPS put `STRIPE_SECRET_KEY` and `STRIPE_CONNECT_WEBHOOK_SECRET`
         in `.env` and redeploy. Connect a test coach, make a package, pay with a test card.
      3. Then the same with live keys.
      4. ~~Privacy policy/terms: say coach payments go to the coach through Stripe~~ (done 2026-11-19).
- [ ] **Have someone check the privacy policy and terms** (updated 2026-11-13 for Google Play billing,
      EU hosting, plugins and diagnostics; 2026-11-19: names Hetzner, Cloudflare, Resend and Stripe, and
      covers paying a coach).
- [ ] **Play Console › App content › Target audience: 16 and over** (decided 2026-11-23: the whole app is 16+,
      because of the social features).
- [x] **VPS**: Hetzner CX23 `logit-prod` (Germany), bought 2026-11-13 with Hetzner backups on. Claude set
      it up: `deploy` user, key-only SSH, auto security updates, Docker, swap. Hetzner firewall: 22 open, 80/443 only from
      Cloudflare's ranges (2026-11-13; update it and the Caddyfile if Cloudflare adds ranges).
- [x] **Off-site backup storage**: R2 bucket `logit-backups` (location hint Western Europe, not the EU jurisdiction),
      lifecycle rule deletes objects after 30 days (checked 2026-11-13).
- [x] **Domain**: `getlogit.app`, bought on Cloudflare Registrar 2026-11-13 (logit.ie is owned by
      Grandstream Holdings Limited since 2018, renewal due 2026-12-05). DNS is already on Cloudflare.
      Website at `getlogit.app`, dashboard `app.getlogit.app`, API `api.getlogit.app`. .app is HTTPS-only.
- [x] **`getlogit.app` on the Pages project** and proxied `api` / `app` records to the VPS (2026-11-13). SSL mode
      Full (strict) with a Cloudflare Origin CA certificate on the server. `www.getlogit.app` serves the site
      (checked 2026-11-13; canonical tag points at getlogit.app). Redirect rule sends www to getlogit.app (301, keeps path and query).
- [x] **hello@getlogit.app and privacy@getlogit.app** (2026-11-13): getlogit.app added to the existing Zoho Mail
      org (EU), both are aliases on Martin's mailbox. MX/SPF/DKIM (`zmail`) verified, DMARC `p=none` with reports
      to hello@. Server alerts go to hello@. Tighten DMARC to `p=quarantine` after a few clean weeks.
- [x] **Upload keystore**: made 2026-11-19 (`~/.keystores/logit-upload.jks` on the lab, password beside it,
      `android/keystore.properties` points at it; signed release AAB builds). **Still to do: back the `.jks`
      and its password up** to a password manager plus an offline copy (Play App Signing can reset a lost
      upload key, but it takes days).
- [ ] **Accountant**: registering as a sole trader / company, income tax on Google payouts. (Google
      collects VAT on Play sales to EU customers; confirm.)
- [x] **Google Cloud project + service account** (done 2026-11-19: project `logit-play`, service account
      `logit-billing`, key in production `.env`, Pub/Sub topic `play-billing` pushing to the API, test
      message received). Service accounts `logit-billing` and `play-publisher` invited in Play Console
      2026-11-21 (API access checked). **Still to do:** set
      Monetization setup's topic to `projects/logit-play/topics/play-billing`. Originally: linked to Play Console: the API needs it to check
      purchases, and Pub/Sub for renewal/cancel notices. Steps in docs/deployment.md "Billing → Google Play";
      the results go in the server's `.env` as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` and
      `GOOGLE_PLAY_NOTIFICATION_TOKEN`. Subscription ids in Play Console: `logit_pro` and `logit_studio`
      (monthly/yearly as base plans), or tell Claude other names.

## Claude: can build now (no accounts needed)

- [x] **Website** (2026-11-13, branch `feat/website`): `apps/clients/website` replaces `logit-marketing`
      and `docs-site`; real app screenshots; shared look in `packages/ui` (app pixel-identical, dashboard
      now uses Inter and the app's radius).
- [x] **Free users can reach the dashboard's Account page** (2026-11-14), so "delete your account on the web"
      works for everyone, not just Pro/Studio.
- [x] **Launch plugins** (2026-11-19, live in the community registry, Martin-Melody/logit-plugin-registry):
      5/3/1 Waves, GZCLP, RIR Auto (progression), Estimated Maxes and Deload Reminder (home widgets),
      Kettlebell Pack (14) and Dumbbell & Home Gym Pack (15). Linted with logit-plugin-lint (sandbox runs)
      and simulated session by session. Not yet installed on a phone: try one from Plugins › Browse.
      (Machines pack skipped: the core library already has nearly every machine.)
- [x] **App bugs seen while taking screenshots** (2026-11-14): one rest at a time (ticking the next set ends the
      previous rest); exercise chart labels fit; PR cards say "200 kg × 1 rep"; the "Why?" sheet leads with plain
      sentences (numbers behind "Show the numbers", app and dashboard); habit icons given as Lucide names draw the icon.
- [x] **Admin key hardening** (2026-11-13): constant-time check, 10 wrong keys from one address
      lock it out for 15 minutes, startup warning for keys under 24 characters. Applies to the hosted
      server too.
- [x] **Self-hosted sign-ups** (2026-11-13): server side (`REGISTRATION_MODE` open/invite, self-host
      default invite; invite codes with uses/expiry/note; admin API; `GET /auth/registration`; sign-up rate
      limit 10 per address per 10 min; migrations for both databases). Screens built to the approved mockup: invite field in the app and dashboard sign-up,
      Invites panel on the admin page with a ready-to-send message; self-hosting guide updated.
- [x] **Admin page for self-hosters** (2026-11-13): plan editor and diagnostics counter hidden when
      `Deployment:SelfHosted` is on.
- [x] **Document the admin page** in the self-hosting guide and `.env.example` (2026-11-13).
- [x] **Admin console** (2026-11-19, branch `feat/admin-accounts`, docs/admin-console.md): replaces the
      `AdminHtml.cs` page with an admin space in the web dashboard; admin accounts, action log, Server
      page, getlogit.app pages behind Cloudflare Access (app "Logit admin" created 2026-11-19).
- [x] **Login rate limit** (2026-11-19): 30 sign-ins per address per 10 minutes, and 10 wrong
      passwords lock that account out from that address for 15 minutes.
- [x] **Server billing** (2026-11-14, branch `feat/play-billing`): `BillingSubscriptions` table (source
      google/apple/stripe, plan, state, end date); `User.Tier` worked out from those plus an admin-given plan
      (`ManualTier`; today's plans carried over as that). `POST /billing/google/verify` checks a purchase with
      Google, ties it to one Logit account and acknowledges it; Pub/Sub notifications at
      `/billing/google/notifications`; hourly sweep for missed notices; upgrades/downgrades replace the old
      subscription; richer `/billing/status` for the app and dashboard; Stripe checkout off
      (`Billing:WebCheckout`). 45 new tests against fake Google responses; migrations checked on SQLite and
      Postgres 17. Setup steps: docs/deployment.md "Billing".
- [ ] **iOS later**: Apple requires In-App Purchase (StoreKit) for subscriptions. The server is ready for an
      `apple` source; still to build: App Store Server API check + App Store Server Notifications v2.
- [x] **Android billing plugin** (2026-11-14, `PlayBillingPlugin.java`, Play Billing Library 8.3.0): products,
      buy (obfuscatedAccountId = Logit user id; Pro <-> Studio replaces the old token), owned purchases, Play's
      subscription page, `purchasesUpdated` event. Every token goes to `/billing/google/verify`, after buying
      and on every start (restore, purchases finished while closed).
- [x] **In-app plan screens** (2026-11-14):
      `/plans`, plan card in Settings › Account (every state, self-hosted too), Studio lock card on Coaching,
      delete-account warning while a Play subscription renews. Checked on the lab emulator against a local API
      (no Play Store there, so the "couldn't load prices" path); real purchases need Play Console + license testers.
      Billing Library 9.x exists; moving to it is a later job (the plan-change call is deprecated in 8.1+).
- [x] **logit-web `/upgrade`** (2026-11-14): says "subscribe in the app" (Stripe buttons only if `Billing:WebCheckout`).
      Account shows the same plan card as the app (`@logit/core/api/planCard`), with Google Play / Stripe portal
      buttons and the "deleting doesn't cancel it" warning. Stopgap until the dashboard redesign.
- [x] **VPS deploy files** (2026-11-13, `deploy/production`): Caddy + API + Postgres 17 + logit-web,
      `deploy-server.yml` builds images to GHCR and deploys on push to main, forwarded headers
      (`Proxy:TrustForwardedHeaders`, Caddy trusts CF-Connecting-IP only from Cloudflare). Live and verified.
- [x] **Nightly off-site database backups** to Cloudflare R2 (2026-11-13): 03:30 UTC dump, weekly automatic
      restore test, failure emails to ALERT_EMAIL. Runbook in `deploy/production/README.md`.
- [x] **Email**: Resend SMTP on the server (2026-11-13); password-reset send succeeded, delivery to be confirmed by Martin.
- [x] **CI green again** (2026-11-14). The 9 E2E failures were tests left behind by the sessions, goals and
      splits redesigns, plus 36px streak/goal buttons on /progress (now 40px). The dashboard's goal preview now
      handles async nutrition algorithms (the 7 svelte-check errors), and CI builds and checks the dashboard too.
- [x] Failed sign-in shows a message again (2026-11-14). A wrong username/password got a bare 401, which over
      HTTP/2 has no status text, so the app showed an empty (hidden) error. Login now answers
      `{ error, code: "invalid_credentials" }`, the app falls back to a message per status when a server sends
      none, and any endpoint given a body missing a required text field answers 400 (`missing_field`), not 500.
- [ ] **16+ in the terms and at sign-up** (decided 2026-11-23): an age line in the terms, and an
      "I'm 16 or over" tick when an account is made.

## After both halves are done

- [x] Point the app build at `https://api.getlogit.app` (done 2026-11-13; was: the default in `packages/core/src/api/client.ts`
      is an old AWS App Runner host that no longer exists).
- [ ] Create the subscriptions in Play Console; test buying with Play license testers.
- [x] Merge `feat/sessions-overhaul` first (merged 2026-11-13).
- [x] Play listing material (2026-11-19, `apps/clients/logit-frontend/store/play/`): copy, 6 captioned
      screenshots, new feature graphic, Data safety, content rating and the other App content answers.
      Still yours: a reviewer account for "App access" (see data-safety.md).
- [ ] Release build smoke test on a real phone, upload to the closed test. 2026-11-19: passed on the
      emulator (onboarding, workout, rest notification, sign-up and account deletion against production);
      Martin's phone still has an old release build signed with another key, so it needs uninstalling
      (and its data exporting) first. The four findings (welcome mark, exact-alarm settings page,
      "Fu B" chips, back on welcome) were fixed 2026-11-20 (57ea692, merged 347777f).
- [ ] Production once the 14 days are up.
