#!/usr/bin/env bash
# Proves the backups work: downloads the newest dump from R2, restores it into a throwaway
# Postgres and compares row counts with the live database. Installed as
# /opt/logit/bin/restore-test, run weekly by logit-restore-test.timer and by hand any time.
#
# Counts can differ a little if people used the app since the dump; the test fails only if
# the restore errors or a table that has rows live is empty in the backup.
set -euo pipefail
. /opt/logit/bin/lib.sh
cd /opt/logit
require_env R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

latest=$(r2 lsf "r2:$R2_BUCKET/db/" | grep '^logit-.*\.dump$' | sort | tail -1)
[[ -n "$latest" ]] || { echo "no backups in r2:$R2_BUCKET/db/" >&2; exit 1; }
echo "==> restoring $latest"
install -d -m 700 /opt/logit/backups
r2 copyto "r2:$R2_BUCKET/db/$latest" "/backups/restore-test.dump"

name=logit-restore-test
docker rm -f "$name" >/dev/null 2>&1 || true
trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -f /opt/logit/backups/restore-test.dump' EXIT
docker run -d --name "$name" -e POSTGRES_PASSWORD=restore-test -e POSTGRES_USER=logit -e POSTGRES_DB=logit \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$name" pg_isready -U logit -d logit >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker exec -i "$name" pg_restore -U logit -d logit --no-owner --exit-on-error < /opt/logit/backups/restore-test.dump

count_sql="SELECT relname || ' ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname"
exact_sql="SELECT string_agg(format('SELECT %L || '' '' || count(*) FROM %I', tablename, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname = 'public'"
counts() { # $1 = how to run psql
  local q; q=$($1 -tAc "$exact_sql"); $1 -tAc "$q" | sort
}
live=$(counts "docker compose exec -T db psql -U logit -d logit")
restored=$(counts "docker exec -i $name psql -U logit -d logit")

fail=0
printf '%-40s %8s %8s\n' table live backup
while read -r table n; do
  b=$(awk -v t="$table" '$1==t{print $2}' <<<"$restored")
  printf '%-40s %8s %8s\n' "$table" "$n" "${b:-MISSING}"
  if [[ -z "$b" ]] || { [[ "$n" -gt 0 ]] && [[ "$b" -eq 0 ]]; }; then fail=1; fi
done <<<"$live"
[[ $fail -eq 0 ]] || { echo "restore test FAILED: a table is missing or empty in the backup" >&2; exit 1; }
echo "restore test ok: $latest"
