# CI / CD

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every PR + push to `main` | API build/test + migration-sync check; core/frontend/marketing/docs builds + unit tests; Playwright social E2E against a real API |
| `deploy-web.yml` | push to `main` touching `logit-marketing`, `docs-site`, or `packages/core` (or manual) | `wrangler pages deploy` for the affected Cloudflare Pages site(s) |
| `android-release.yml` | push a `v*` tag, or manual | signed release AAB/APK artifact; uploads to the Play `internal` track when a Play service account is set |
| `deploy-api.yml` | manual only | migration-sync gate, then `scripts/deploy.sh` → ECR → App Runner auto-deploys |

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
| `MARKETING_URL` | *(optional)* baked into the app build; defaults to `https://logit-marketing.pages.dev` |

Without the keystore secrets the workflow still builds a debug-signed artifact for smoke testing.

### AWS (`deploy-api.yml`)
Preferred — GitHub OIDC:
| Secret | |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | IAM role trusting this repo via OIDC; needs ECR push + `apprunner:StartDeployment` |

Fallback — static keys (set variable `AWS_AUTH=keys`):
| Secret | |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | deploy user credentials |

| Variable | |
|---|---|
| `AWS_REGION` | *(optional)* defaults to `eu-west-1` |
| `AWS_AUTH` | set to `keys` to use static keys instead of OIDC |

## First-time Play upload

The Play Console upload needs the app to already exist and have had **one manual AAB upload**
(Play won't accept the very first bundle via API). After that, `android-release.yml` handles it.
