# TODO

- Enforce `scripts/check-migrations-sync.sh` automatically (git pre-commit hook and/or CI)
  instead of relying on remembering to run it manually. See `docs/deployment.md` /
  `infra/aws/README.md` for why the SQLite/Postgres migration split exists. Note: CI is Gitea
  (self-hosted), not GitHub — use Gitea Actions, not a GitHub Actions workflow.

- Set up continuous deploy for `logit-marketing` (and later `docs-site`) to Cloudflare Pages.
  Cloudflare's dashboard "connect to Git" flow only supports GitHub/GitLab.com natively, which
  doesn't work with self-hosted Gitea — instead, add a Gitea Actions workflow that runs
  `npm run build` + `wrangler pages deploy` on push to `main`, authenticated with a
  `CLOUDFLARE_API_TOKEN` repo secret (Pages:Edit permission). Currently deploys are manual via
  `wrangler pages deploy` from a local checkout (see `docs/deployment.md`).

- Attach the real custom domain (`logit.ie`) to the `logit-marketing` Cloudflare Pages project
  once ready to go live (DNS change — do deliberately, not as a side effect of other work).
  Same applies to `docs-site` (`docs.logit.ie` or the apex, per `docs/deployment.md`).
