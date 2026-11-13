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

- [ ] **Google Play Console account** ($25). Personal accounts need a **closed test with 12+ testers opted
      in for 14 days in a row** before production. Start lining up ~15 people now. (An organisation
      account skips this but needs a D-U-N-S number.)
- [ ] **Payments profile** in Play Console (needed to create subscriptions). EU rules show a seller's
      name, address, email and phone on the store listing: use a business/virtual address if you don't
      want your home address public.
- [ ] **Prices in euro** for Pro and Studio, monthly and maybe yearly. Google keeps 15% of subscriptions.
      Then put them in `apps/clients/website/src/lib/site.ts` (`PRICES`, shown as "€ TBC" until then).
- [ ] **Decide**: free trial on Pro? How many days to act on an emailed deletion request, and how long
      server backups are kept (the delete-account page says 30 and 30 for now).
- [x] **Cloudflare Pages project** `logit-website`: created by the first deploy 2026-11-13, live at
      https://logit-website.pages.dev. GitHub has `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, so pushes to main deploy it.
- [ ] **Have someone check the privacy policy and terms** (updated 2026-11-13 for Google Play billing,
      EU hosting, plugins and diagnostics; the hosting provider's name is still a TODO in the policy).
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
- [ ] **Upload keystore**: none on the lab. Find the September one (Windows PC?) or let Claude generate a
      new one. Store the `.jks` and its password in a password manager plus an offline copy.
- [ ] **Accountant**: registering as a sole trader / company, income tax on Google payouts. (Google
      collects VAT on Play sales to EU customers; confirm.)
- [ ] **Google Cloud project + service account** linked to Play Console (Claude will walk you through
      this when the billing code is ready): the API needs it to check purchases, and Pub/Sub for
      renewal/cancel notices.

## Claude: can build now (no accounts needed)

- [x] **Website** (2026-11-13, branch `feat/website`): `apps/clients/website` replaces `logit-marketing`
      and `docs-site`; real app screenshots; shared look in `packages/ui` (app pixel-identical, dashboard
      now uses Inter and the app's radius). Mockup: https://claude.ai/artifact/4f61FUPJXu4rpxdV3qq2Ud
- [ ] **Let Free users reach the dashboard's Account page** (`logit-web` sends them to /upgrade), so
      "delete your account on the web" works for everyone, not just Pro/Studio.
- [ ] **Launch plugins**: the registry only has samples. Write 5–8 useful ones (e.g. 5/3/1, GZCL,
      RPE-based progression, an RPE calculator card, a deload reminder, kettlebell/machine packs) so the
      marketplace the website sells isn't four demos.
- [ ] **App bugs seen while taking screenshots**: two rest timers at once when ticking sets quickly;
      exercise chart y-axis labels clipped and x-axis dates overlapping; PR card "200kg × 1 reps";
      "Why progressing?" sheet reads like debug output; a habit icon set to a Lucide name shows as text.
- [x] **Admin key hardening** (2026-11-13): constant-time check, 10 wrong keys from one address
      lock it out for 15 minutes, startup warning for keys under 24 characters. Applies to the hosted
      server too.
- [x] **Self-hosted sign-ups** (2026-11-13): server side (`REGISTRATION_MODE` open/invite, self-host
      default invite; invite codes with uses/expiry/note; admin API; `GET /auth/registration`; sign-up rate
      limit 10 per address per 10 min; migrations for both databases). Screens built to the approved mockup
      (https://claude.ai/artifact/4Yn1JX97tCfrvRwBAjWYQz): invite field in the app and dashboard sign-up,
      Invites panel on the admin page with a ready-to-send message; self-hosting guide updated.
- [x] **Admin page for self-hosters** (2026-11-13): plan editor and diagnostics counter hidden when
      `Deployment:SelfHosted` is on.
- [x] **Document the admin page** in the self-hosting guide and `.env.example` (2026-11-13).
- [ ] **Admin page styling** on the shared theme (cosmetic; it's HTML inside `AdminHtml.cs`).
- [ ] **Server billing**: plan source (google/stripe), purchase check with Google, renewal / cancel /
      grace-period / account-hold notices, Stripe checkout switched off. Tested against fake Google responses.
- [ ] **Android billing plugin**: list plans, buy (tied to the logged-in Logit account), restore,
      open Play's subscription page.
- [ ] **In-app Upgrade screen**: mockup first. Replace the "Manage your plan in a browser at getlogit.app" text
      (`settings/+page.svelte`, `clients/+page.svelte`).
- [ ] **logit-web `/upgrade`**: say "subscribe in the app" instead of going to Stripe.
- [x] **VPS deploy files** (2026-11-13, `deploy/production`): Caddy + API + Postgres 17 + logit-web,
      `deploy-server.yml` builds images to GHCR and deploys on push to main, forwarded headers
      (`Proxy:TrustForwardedHeaders`, Caddy trusts CF-Connecting-IP only from Cloudflare). Live and verified.
- [x] **Nightly off-site database backups** to Cloudflare R2 (2026-11-13): 03:30 UTC dump, weekly automatic
      restore test, failure emails to ALERT_EMAIL. Runbook in `deploy/production/README.md`.
- [x] **Email**: Resend SMTP on the server (2026-11-13); password-reset send succeeded, delivery to be confirmed by Martin.
- [ ] **Get CI green again (next up, before Play Billing).** 9 E2E tests fail on main since before the invites
      merge: auth-flow "Use getlogit.app instead"; progression analytics (assisted, bodyweight); sessions history
      (list, superset detail); splits start-session (Start button, replace confirm, circuit); tap-targets on /progress.
      Also 7 svelte-check errors in logit-web `routes/nutrition/goal/+page.svelte` (Promise type).
- [ ] `POST /auth/login` with a missing field returns 500 instead of 400 (seen 2026-11-13; other
      endpoints probably the same).

## After both halves are done

- [x] Point the app build at `https://api.getlogit.app` (done 2026-11-13; was: the default in `packages/core/src/api/client.ts`
      is an old AWS App Runner host that no longer exists).
- [ ] Create the subscriptions in Play Console; test buying with Play license testers.
- [ ] Merge `feat/sessions-overhaul` first: the website's Sessions screenshots show those pages.
- [ ] Play listing screenshots: reuse the website's (`apps/clients/website/scripts/screenshots`);
      update listing copy (goals, streak, circuits, sessions, plugins) and the Data safety / content
      rating answers (purchases now in the app; report/block exists; diagnostics can be sent on request).
- [ ] Release build smoke test on a real phone, upload to the closed test.
- [ ] Production once the 14 days are up.
