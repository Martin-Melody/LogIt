#!/usr/bin/env bash
# Nightly database backup: pg_dump of the live database, uploaded to Cloudflare R2.
# Installed as /opt/logit/bin/backup and run by logit-backup.timer (03:30 UTC).
#
# R2 keeps each dump for 30 days (a lifecycle rule on the bucket, matching the delete-account
# page); the server keeps the last 3 in /opt/logit/backups for quick restores.
set -euo pipefail
. /opt/logit/bin/lib.sh
cd /opt/logit
require_env R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY

install -d -m 700 /opt/logit/backups
name=logit-$(date -u +%Y-%m-%dT%H%M%SZ).dump
file=/opt/logit/backups/$name

docker compose exec -T db pg_dump -U logit -d logit --format=custom --compress=9 > "$file.partial"
# A dump pg_restore can't read is worse than none: check before keeping it.
docker compose exec -T db pg_restore --list < "$file.partial" > /dev/null
mv "$file.partial" "$file"
size=$(stat -c %s "$file")

r2 copyto "/backups/$name" "r2:$R2_BUCKET/db/$name"
remote=$(r2 size --json "r2:$R2_BUCKET/db/$name" | grep -o '"bytes":[0-9]*' | cut -d: -f2)
if [[ "$remote" != "$size" ]]; then
  echo "uploaded size ($remote) does not match the dump ($size)" >&2
  exit 1
fi

ls -1t /opt/logit/backups/logit-*.dump | tail -n +4 | xargs -r rm -f
echo "backup ok: r2:$R2_BUCKET/db/$name ($size bytes)"
