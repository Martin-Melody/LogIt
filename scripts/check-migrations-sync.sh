#!/usr/bin/env bash
# Fails if the EF Core model has changed without a migration being generated for
# BOTH AppDbContext (SQLite) and PostgresAppDbContext. See infra/aws/README.md's
# Database section and docs/deployment.md for why two migration histories exist.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../services/api/src/Logit.Api"

status=0

for context in AppDbContext PostgresAppDbContext; do
    echo "Checking $context for pending model changes..."
    if ! dotnet ef migrations has-pending-model-changes --context "$context"; then
        echo "FAIL: $context has model changes not yet captured in a migration."
        status=1
    fi
done

if [ "$status" -ne 0 ]; then
    echo
    echo "Run for each context that failed above:"
    echo "  dotnet ef migrations add <Name> --context AppDbContext -o Migrations"
    echo "  dotnet ef migrations add <Name> --context PostgresAppDbContext -o Migrations/Postgres"
    exit 1
fi

echo "OK: both migration histories are in sync with the current model."
