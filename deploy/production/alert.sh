#!/usr/bin/env bash
# Emails ALERT_EMAIL (in /opt/logit/.env) through Resend's API with the key the server already
# uses for SMTP. Run by logit-alert@.service when a backup or restore test fails:
#   alert <unit name>
set -euo pipefail
. /opt/logit/bin/lib.sh
require_env SMTP_PASSWORD ALERT_EMAIL
unit=${1:?unit name}
log=$(journalctl -u "$unit" -n 40 --no-pager 2>&1 || true)
body=$(jq -n --arg to "$ALERT_EMAIL" --arg subject "LogIt server: $unit failed" \
  --arg text "$unit failed on $(hostname) at $(date -u '+%Y-%m-%d %H:%M UTC').

Last log lines:
$log

See deploy/production/README.md." \
  '{from: "LogIt server <alerts@getlogit.app>", to: [$to], subject: $subject, text: $text}')
curl -fsS https://api.resend.com/emails -H "Authorization: Bearer $SMTP_PASSWORD" \
  -H 'Content-Type: application/json' -d "$body" > /dev/null
echo "alert sent for $unit"
