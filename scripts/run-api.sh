#!/usr/bin/env bash
# run-api.sh — start the Logit API for different development scenarios
#
# Usage:
#   ./scripts/run-api.sh            # local dev (localhost only)
#   ./scripts/run-api.sh usb        # phone via USB + ADB reverse tunnel
#   ./scripts/run-api.sh wifi       # phone via Wi-Fi (binds 0.0.0.0)
#   ./scripts/run-api.sh docker     # Docker container (binds 0.0.0.0)

set -euo pipefail

API_DIR="$(cd "$(dirname "$0")/../services/api/src/Logit.Api" && pwd)"
PORT=5118
MODE="${1:-local}"

lan_ip() {
  ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "<your-lan-ip>"
}

case "$MODE" in

  local)
    echo "▶  Local dev — http://localhost:$PORT"
    echo "   Swagger: http://localhost:$PORT/swagger"
    echo ""
    cd "$API_DIR"
    exec dotnet run --launch-profile http
    ;;

  usb)
    echo "▶  USB mode — forwarding port $PORT from phone to this machine via ADB"
    echo ""
    if ! command -v adb &>/dev/null; then
      echo "✗  adb not found. Install android-tools / platform-tools and try again." >&2
      exit 1
    fi
    if ! adb devices | grep -q "device$"; then
      echo "✗  No ADB device found. Connect your phone and enable USB debugging." >&2
      exit 1
    fi
    # reverse: phone:PORT → host:PORT
    adb reverse tcp:$PORT tcp:$PORT
    echo "✓  ADB reverse tunnel active: phone:$PORT → host:$PORT"
    echo "   Set the API URL in the app to: http://localhost:$PORT"
    echo ""
    cd "$API_DIR"
    exec dotnet run --launch-profile http
    ;;

  wifi)
    IP="$(lan_ip)"
    echo "▶  Wi-Fi mode — binding to 0.0.0.0:$PORT"
    echo "   Set the API URL in the app to: http://$IP:$PORT"
    echo "   Swagger: http://$IP:$PORT/swagger"
    echo ""
    cd "$API_DIR"
    exec dotnet run --urls "http://0.0.0.0:$PORT"
    ;;

  docker)
    REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    IP="$(lan_ip)"
    IMAGE="logit-api"
    echo "▶  Docker mode — building and running on 0.0.0.0:$PORT"
    echo "   Set the API URL in the app to: http://$IP:$PORT"
    echo ""
    docker build -t "$IMAGE" "$REPO_ROOT/services/api"
    exec docker run --rm \
      -p "$PORT:8080" \
      -e "ASPNETCORE_ENVIRONMENT=Development" \
      -e "Jwt__Secret=${JWT_SECRET:-dev-secret-change-in-production}" \
      -v "$REPO_ROOT/services/api/logit.db:/app/logit.db" \
      "$IMAGE"
    ;;

  *)
    echo "Unknown mode: $MODE"
    echo "Usage: $0 [local|usb|wifi|docker]"
    exit 1
    ;;

esac
