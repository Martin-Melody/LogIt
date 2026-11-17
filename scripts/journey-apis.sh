#!/usr/bin/env bash
# Starts the two local APIs the account-journey tests talk to
# (apps/clients/logit-frontend/tests/journeys):
#
#   :5219  "cloud"      — stands in for getlogit.app: plans are enforced (Free/Pro/Studio)
#   :5218  "self-host"  — Deployment:SelfHosted=true, so every account has everything
#
# Each gets a fresh SQLite file under $JOURNEY_API_DIR (default: a temp dir). Waits until both
# answer /health, then leaves them running in the background and prints their PIDs.
# Stop them with:  kill $(cat "$JOURNEY_API_DIR"/*.pid)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/services/api/src/Logit.Api"
OUT="${JOURNEY_API_DIR:-$(mktemp -d -t logit-journey-apis-XXXXXX)}"
mkdir -p "$OUT"

dotnet build "$API_DIR" -c Debug --nologo -v quiet > "$OUT/build.log" 2>&1 || { cat "$OUT/build.log"; exit 1; }

start() {
  local name=$1 port=$2 selfhosted=$3
  rm -f "$OUT/$name.db"
  (
    cd "$API_DIR"
    ASPNETCORE_ENVIRONMENT=Development \
    DOTNET_ROLL_FORWARD="${DOTNET_ROLL_FORWARD:-Major}" \
    ASPNETCORE_URLS="http://127.0.0.1:$port" \
    Deployment__SelfHosted="$selfhosted" \
    ConnectionStrings__Default="Data Source=$OUT/$name.db" \
    Jwt__Secret="journey-tests-secret-at-least-32-characters" \
    Registration__SignupsPer10Minutes=100000 \
    nohup dotnet run --no-build --no-launch-profile > "$OUT/$name.log" 2>&1 &
    echo $! > "$OUT/$name.pid"
  )
}

start cloud 5219 false
start selfhost 5218 true

for port in 5219 5218; do
  for _ in $(seq 1 90); do
    curl -sf "http://127.0.0.1:$port/health" > /dev/null && break
    sleep 1
  done
  curl -sf "http://127.0.0.1:$port/health" > /dev/null || { echo "API on :$port did not start (logs in $OUT)"; exit 1; }
done

echo "Journey APIs up: cloud http://127.0.0.1:5219, self-host http://127.0.0.1:5218 (logs + pids in $OUT)"
