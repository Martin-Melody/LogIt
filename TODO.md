# TODO

- Enforce `scripts/check-migrations-sync.sh` automatically (git pre-commit hook and/or CI)
  instead of relying on remembering to run it manually. See `docs/deployment.md` /
  `infra/aws/README.md` for why the SQLite/Postgres migration split exists. Note: CI is Gitea
  (self-hosted), not GitHub — use Gitea Actions, not a GitHub Actions workflow.

- Continuous deploy for the website (`apps/clients/website`) to Cloudflare Pages.
  Cloudflare's dashboard "connect to Git" flow only supports GitHub/GitLab.com natively, which
  doesn't work with self-hosted Gitea — instead, add a Gitea Actions workflow that runs
  `npm run build` + `wrangler pages deploy` on push to `main`, authenticated with a
  `CLOUDFLARE_API_TOKEN` repo secret (Pages:Edit permission). Currently deploys are manual via
  `wrangler pages deploy` from a local checkout (see `docs/deployment.md`).

- Attach the real custom domain (`getlogit.app`) to the `logit-website` Cloudflare Pages project
  once ready to go live (DNS change — do deliberately, not as a side effect of other work).

- Insights (dashboard phase 5) left these out on purpose, to do sometime (Martin, 2026-11-16):
  - "Turn into a plugin widget": open a saved Insights chart in the plugin builder as a widget
    plugin (the chart recipe becomes the widget's `compute`).
  - "Share as a post": share a saved chart (or a question's answer) to Social as its own post type.
