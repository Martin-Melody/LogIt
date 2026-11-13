# Production server

The hosted LogIt server: `api.getlogit.app` (the API) and `app.getlogit.app` (the dashboard).
The website (`getlogit.app`) is separate, on Cloudflare Pages (`deploy-web.yml`).

```
visitor ─▶ Cloudflare (proxy, "Full (strict)") ─▶ VPS :443 Caddy ─┬─▶ api:8080 ─▶ db (Postgres 17)
                                                                  └─▶ web:3000
```

- **VPS:** Hetzner Cloud CX23 `logit-prod`, Ubuntu 26.04, Germany, Hetzner backups on. Its IP is
  in the `DEPLOY_HOST` secret, not in this repo, because Cloudflare hides it.
- **Login:** user `deploy` with an SSH key only (root login and passwords are off). Passwordless
  sudo, in the `docker` group.
- **Updates:** unattended-upgrades installs security updates nightly and reboots at 04:30 when
  needed. Every container has `restart: unless-stopped`.

## Files on the server (`/opt/logit`)

| File | |
|---|---|
| `compose.yml`, `Caddyfile` | copies of this folder at the deployed commit (the deploy replaces them) |
| `.env` | secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_KEY`, `SMTP_*`) and `LOGIT_TAG`, the deployed commit. Mode 600. Not in git. |
| `.previous-tag` | the commit before the current one, for rollback |
| `certs/origin.pem`, `certs/origin.key` | Cloudflare Origin CA certificate for `getlogit.app` + `*.getlogit.app`, valid to 2041. The key was made on the server and has never left it. |
| `bin/deploy` | `deploy.sh` from this folder |

## Deploying

Merging to `main` anything under `services/api`, `apps/clients/logit-web`, `packages/core` or
this folder runs `.github/workflows/deploy-server.yml`:

1. API tests and the SQLite/Postgres migration-sync check.
2. Builds `ghcr.io/martin-melody/logit-api` and `logit-web`, tagged with the commit.
3. SSH to the server with a key that can only run `bin/deploy`, which fetches this folder's
   `compose.yml` and `Caddyfile` at that commit, pulls the images, restarts what changed and
   waits for `/health`. The API runs its database migrations when it starts.

Run it by hand from GitHub: **Actions → Deploy server → Run workflow**.

`bin/deploy` is installed by hand, so changes to `deploy.sh` need copying to the server:
`scp deploy/production/deploy.sh logit-prod:/opt/logit/bin/deploy`.

## Everyday commands (on the server, in `/opt/logit`)

```sh
docker compose ps                      # what's running
docker compose logs -f --tail 100 api  # API log, one line per request
docker compose restart api
docker compose exec db psql -U logit   # database shell
```

## Rollback

```sh
/opt/logit/bin/deploy deploy "$(cat /opt/logit/.previous-tag)" < /dev/null
```

With no registry token it uses the images already on the server, which are kept for 7 days.
For anything older, re-run that commit's "Deploy server" run in GitHub Actions. A rollback does not undo database migrations: a
migration that drops or renames something needs a fix forward instead.

## Changing a secret

Edit `/opt/logit/.env`, then `docker compose up -d`. Changing `JWT_SECRET` signs everyone out.
`ADMIN_KEY` is the key for the admin page (`https://api.getlogit.app/admin`).

## Backups

- Hetzner backups: a daily image of the whole server, kept 7 days.
- Nightly `pg_dump` to Cloudflare R2: **not set up yet** (`docs/launch-checklist.md`).
