# CI / CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every PR + push to `main` | API build/test + migration-sync check; core/frontend/website builds + unit tests; Playwright social E2E against a real API |
| `deploy-web.yml` | push to `main` touching `apps/clients/website` or `packages/ui` (or manual) | `wrangler pages deploy` of getlogit.app to Cloudflare Pages |
| `android-release.yml` | push a `v*` tag, or manual | signed release AAB/APK artifact; uploads to the Play `internal` track when a Play service account is set |
| `deploy-server.yml` | push to `main` touching the API, dashboard, `packages/core` or `deploy/production` (or manual) | API tests + migration-sync gate, builds `logit-api` / `logit-web` images to GHCR, deploys that commit to the production VPS (`deploy/production/README.md`) |

## `npm run check` is not blocking yet

The frontend `svelte-check` step runs but is `continue-on-error` — there are ~38 pre-existing
type errors tracked separately. Once they're at zero, drop `continue-on-error` in `ci.yml` to
make it a hard gate.

## Required secrets / variables

Set under **Settings → Secrets and variables → Actions**.

### Cloudflare Pages (`deploy-web.yml`)
| Secret | |
|---|---|
| `CLOUDFLARE_API_TOKEN` | token with the *Cloudflare Pages: Edit* permission |
| `CLOUDFLARE_ACCOUNT_ID` | from `npx wrangler whoami` |

### Android / Play (`android-release.yml`)
| Secret | |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 ~/.keystores/logit-upload.jks` — **regenerate the keystore with a strong password first** |
| `ANDROID_KEYSTORE_PASSWORD` | keystore store password |
| `ANDROID_KEY_ALIAS` | e.g. `logit-upload` |
| `ANDROID_KEY_PASSWORD` | key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | *(optional)* Google Play service-account JSON with release permissions; omit to build-only |

| Variable | |
|---|---|
| `MARKETING_URL` | *(optional)* baked into the app build; defaults to `https://getlogit.app` |

Without the keystore secrets the workflow still builds a debug-signed artifact for smoke testing.

### Production server (`deploy-server.yml`)
| Secret | |
|---|---|
| `DEPLOY_HOST` | the VPS's IP (a secret so the repo doesn't reveal the address Cloudflare hides) |
| `DEPLOY_KNOWN_HOSTS` | its host key line, `ssh-keyscan -t ed25519 <ip>` |
| `DEPLOY_SSH_KEY` | private key; its public half is in the server's `authorized_keys` forced to `/opt/logit/bin/deploy` |

Images are pushed with the workflow's own `GITHUB_TOKEN`, which is also passed to the server for
the pull, so no registry credentials are stored anywhere.

## First-time Play upload

The Play Console upload needs the app to already exist and have had **one manual AAB upload**
(Play won't accept the very first bundle via API). After that, `android-release.yml` handles it.
