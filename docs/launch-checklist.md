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
- [ ] **Cloudflare Pages project** named `logit-website` (or change `--project-name` in
      `.github/workflows/deploy-web.yml`), plus `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.
- [ ] **Have someone check the privacy policy and terms** (updated 2026-11-13 for Google Play billing,
      EU hosting, plugins and diagnostics; the hosting provider's name is still a TODO in the policy).
- [ ] **VPS**: buy one (Hetzner CX22-ish, ~€5/month, EU) and give Claude SSH access.
- [ ] **Off-site backup storage** for the database (e.g. Hetzner Storage Box or Backblaze B2, a few €/month).
- [x] **Domain**: `getlogit.app`, bought on Cloudflare Registrar 2026-11-13 (logit.ie is owned by
      Grandstream Holdings Limited since 2018, renewal due 2026-12-05). DNS is already on Cloudflare.
      Website at `getlogit.app`, dashboard `app.getlogit.app`, API `api.getlogit.app`. .app is HTTPS-only.
- [ ] **Attach `getlogit.app` to the Cloudflare Pages project** and add the `app` / `api` records once
      the VPS exists.
- [ ] **hello@getlogit.app and privacy@getlogit.app mailboxes** (or forwarding to your inbox, e.g. Cloudflare
      Email Routing). The site, privacy policy and Play listing use them.
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
- [ ] **Server billing**: plan source (google/stripe), purchase check with Google, renewal / cancel /
      grace-period / account-hold notices, Stripe checkout switched off. Tested against fake Google responses.
- [ ] **Android billing plugin**: list plans, buy (tied to the logged-in Logit account), restore,
      open Play's subscription page.
- [ ] **In-app Upgrade screen**: mockup first. Replace the "Manage your plan in a browser at getlogit.app" text
      (`settings/+page.svelte`, `clients/+page.svelte`).
- [ ] **logit-web `/upgrade`**: say "subscribe in the app" instead of going to Stripe.
- [ ] **VPS deploy files**: production compose (API + Postgres + logit-web behind Caddy for HTTPS),
      nightly off-site backups, a written restore test.

## After both halves are done

- [ ] Point the app build at `https://api.getlogit.app` (the default in `packages/core/src/api/client.ts`
      is an old AWS App Runner host that no longer exists).
- [ ] Create the subscriptions in Play Console; test buying with Play license testers.
- [ ] Merge `feat/sessions-overhaul` first: the website's Sessions screenshots show those pages.
- [ ] Play listing screenshots: reuse the website's (`apps/clients/website/scripts/screenshots`);
      update listing copy (goals, streak, circuits, sessions, plugins) and the Data safety / content
      rating answers (purchases now in the app; report/block exists; diagnostics can be sent on request).
- [ ] Release build smoke test on a real phone, upload to the closed test.
- [ ] Production once the 14 days are up.
