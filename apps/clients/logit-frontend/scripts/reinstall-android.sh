#!/usr/bin/env bash
# Build the app, sync into the Capacitor Android project, build a debug APK, then do a
# clean uninstall + reinstall on a connected device — not just `adb install -r`, an actual
# uninstall first, so leftover local SQLite state from a previous build never carries over
# (useful when what you're testing is data-layer behavior, e.g. account switching).
#
#   ./scripts/reinstall-android.sh
#
# Requires: a device reachable via `adb devices` (USB or `adb connect host:port` for
# wireless debugging), and static/assets/databases/food.zip present (see
# scripts/build-food-db if missing — ~20 MB, gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="ie.logit.app"

if ! command -v adb >/dev/null; then
  echo "adb not found on PATH." >&2
  exit 1
fi

device_count=$(adb devices | tail -n +2 | grep -c "device$" || true)
if [ "$device_count" -eq 0 ]; then
  echo "No device visible to adb. Plug in / connect one, check 'adb devices'." >&2
  exit 1
fi

echo "==> npm run build"
npm run build

echo "==> npx cap sync android"
npx cap sync android

echo "==> ./gradlew assembleDebug"
(cd android && ./gradlew assembleDebug)

APK=android/app/build/outputs/apk/debug/app-debug.apk
if [ ! -f "$APK" ]; then
  echo "Expected APK not found at $APK" >&2
  exit 1
fi

echo "==> adb uninstall $APP_ID (ignore 'not installed' — fine on a first run)"
adb uninstall "$APP_ID" || true

echo "==> adb install $APK"
adb install "$APK"

echo "Done — LogIt reinstalled fresh on the connected device."
