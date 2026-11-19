# Admin console

The plan for replacing the admin page (`AdminHtml.cs`, unlocked with `ADMIN_KEY`) with an admin
console inside the web dashboard. Decided with Martin on 2026-11-19; sketches and the reasoning are
on the planning page.

## Decisions

- **Who it's for.** Self-hosters of every size (friends and family, a gym or coach with members,
  homelabbers) and the operator of getlogit.app.
- **One console.** getlogit.app uses the same console with extra hosted-only pages. The API refuses
  those pages' endpoints on self-hosted servers (`Deployment:SelfHosted`), so hiding them is not
  only cosmetic. The code is open source either way, so a second console would not hide how
  getlogit.app works; what protects it is listed under Security.
- **Where it lives.** An `/admin` section of `logit-web`, built with the dashboard's components and
  `packages/ui` theme. The API keeps `/admin/api`.
- **Sign-in.** Admins sign in with their own Logit account (`User.IsAdmin`). `ADMIN_KEY` is only used
  to claim admin ("Make this account the admin") and to recover. Every admin action is logged with
  who did it.
- **Layout.** The dashboard's sidebar. Overview leads with "Needs you" (each row has its own
  buttons), then a 14-day grid of the server's days (sign-ups, workouts, errors; backups and email
  once the server knows them) beside a few numbers. Queue pages (Reports, Plugin reviews) and
  People use a list with the selected item open beside it.

## Security on getlogit.app

- Cloudflare Access in front of `/admin` and `/admin/api` (sign in with Google or an email code
  before the API is reached).
- Remove `ADMIN_KEY` from the server's `.env` after claiming admin, so the key can't be tried.
- Two-factor or a passkey on admin accounts (later; Cloudflare Access covers it until then).
- An email to existing admins whenever an account becomes or stops being an admin.

## Steps

Each step with visible screens gets mockups approved before it is built. Steps 1 to 3 are built
(branch feat/admin-accounts); step 2's approved mockups:

1. **Admin accounts (server).** `User.IsAdmin`; `AdminActions` log; `/admin/api` accepts a signed-in
   admin as well as the key (the old page and the end-to-end tests keep using the key);
   `GET /admin/me` and `POST /admin/claim`; make or remove admins (never the last one); every admin
   action logged; email to admins when the admin list changes. Admin works with no `ADMIN_KEY` set
   as long as an admin account exists.
2. **The console in logit-web.** Claim prompt, Overview with "Needs you", People with a full
   person page (reset password, sign out everywhere, delete, make admin, the action log), Invites,
   Reports, Plugin reviews. Server additions: `GET /admin/api/overview`, extending an invite, an
   admin password reset signs the person out everywhere, and claiming with a wrong key answers 403
   (a 401 made the app refresh its session and send the key twice).
3. **Server page.** Who can sign up (saved on the server, wins over `REGISTRATION_MODE`), the
   addresses (with a warning when `WEB_ORIGIN` isn't where the dashboard is used), email with a test
   send, server errors per day and route (`ServerErrorCounts`, also a row on the Overview grid),
   version (`LOGIT_COMMIT`, build date), database size, backups. A self-hosted dashboard now finds
   its own API (`API_URL` in .env, default ":8080" = same host). No update check yet: there are no
   releases to compare with.
4. **getlogit.app pages.** Plan and billing on the person page, Subscriptions, Growth (the
   privacy-first anonymous counts from onboarding), Diagnostics, Discover tests. Cloudflare Access.
5. **Remove the old page.** Delete `AdminHtml.cs`; update the self-hosting guide, `.env.example`
   and the website docs.

## Backups (decided 2026-11-19)

Logit doesn't back self-hosted servers up. The Server page says so plainly and offers "Download a
backup" (SQLite: a consistent copy via `VACUUM INTO`; Postgres: a `pg_dump` command), plus a cron
line that fetches the backup with the admin key, so people keep copies somewhere else themselves.
