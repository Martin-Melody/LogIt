#!/usr/bin/env bash
# Deploys one commit of LogIt to this server. Installed as /opt/logit/bin/deploy.
#
# GitHub Actions runs it over SSH with a key that is forced to this script (authorized_keys
# command=...), so that key can do nothing else. It sends "deploy <commit sha>" as the SSH
# command and a short-lived GHCR token on stdin. By hand (rollback): /opt/logit/bin/deploy
# deploy <sha> < /dev/null, which uses the images already on the server (kept 7 days).
#
# Steps: fetch compose.yml + Caddyfile at that commit, pull the images tagged with the commit,
# restart what changed, wait for the API's /health, keep the previous tag for rollback.
set -euo pipefail

REPO_RAW=https://raw.githubusercontent.com/Martin-Melody/LogIt
cd /opt/logit

read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-$*}"
if [[ "${args[0]:-}" != deploy || ! "${args[1]:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: deploy <40-character commit sha>" >&2
  exit 2
fi
sha=${args[1]}
token=$(cat || true)

exec 9>/opt/logit/.deploy.lock
flock -n 9 || { echo "another deploy is running" >&2; exit 1; }

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; docker logout ghcr.io >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> fetching deploy files at $sha"
for f in compose.yml Caddyfile; do
  curl -fsSL --retry 3 "$REPO_RAW/$sha/deploy/production/$f" -o "$tmp/$f"
done

if [[ -n "$token" ]]; then
  echo "$token" | docker login ghcr.io -u github-actions --password-stdin >/dev/null
fi

previous=$(sed -n 's/^LOGIT_TAG=//p' .env)
install -m 644 "$tmp/compose.yml" "$tmp/Caddyfile" /opt/logit/
sed -i "s/^LOGIT_TAG=.*/LOGIT_TAG=$sha/" .env
[[ -n "$previous" && "$previous" != "$sha" ]] && echo "$previous" > .previous-tag

if [[ -n "$token" ]]; then
  echo "==> pulling images"
  docker compose pull --quiet
else
  echo "==> no registry token: using images already on this server"
fi
echo "==> starting"
docker compose up -d --remove-orphans --pull never
# Caddy only rereads its config on restart or reload.
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null

echo "==> waiting for the API"
for _ in $(seq 1 60); do
  if docker compose exec -T caddy wget -qO- http://api:8080/health >/dev/null 2>&1; then
    echo "==> deployed $sha"
    docker image prune -af --filter "until=168h" >/dev/null
    exit 0
  fi
  sleep 2
done
echo "API did not become healthy; last log lines:" >&2
docker compose logs --tail 40 api >&2
echo "Roll back with: /opt/logit/bin/deploy deploy $(cat .previous-tag 2>/dev/null || echo '<previous sha>') < /dev/null" >&2
exit 1
