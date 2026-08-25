# TODO

- Enforce `scripts/check-migrations-sync.sh` automatically (git pre-commit hook and/or a
  GitHub Actions workflow) instead of relying on remembering to run it manually. See
  `docs/deployment.md` / `infra/aws/README.md` for why the SQLite/Postgres migration split
  exists.
