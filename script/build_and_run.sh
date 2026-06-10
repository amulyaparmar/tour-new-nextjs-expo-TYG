#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/mobile"

cd "$APP_DIR"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run        Start the Expo dev server
  --ios, ios        Start Expo and open iOS
  --android, android
                   Start Expo and open Android
  --web, web        Start Expo for web
  --dev-client, dev-client
                   Start Expo in development-client mode
  --tunnel, tunnel Start Expo using tunnel transport
  --export-web, export-web
                   Export the web build locally
  --doctor, doctor Run Expo diagnostics
  --help, help     Show this help
USAGE
}

resolve_expo_cmd() {
  if [[ -n "${EXPO_CLI:-}" ]]; then
    # shellcheck disable=SC2206
    EXPO_CMD=(${EXPO_CLI})
    return
  fi

  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    EXPO_CMD=(pnpm exec expo)
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    EXPO_CMD=(yarn expo)
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    EXPO_CMD=(bunx expo)
  elif command -v npx >/dev/null 2>&1; then
    EXPO_CMD=(npx expo)
  elif [[ -x ./node_modules/expo/bin/cli ]]; then
    EXPO_CMD=(node ./node_modules/expo/bin/cli)
  else
    echo "Expo CLI is unavailable. Run npm install, or set EXPO_CLI to a custom command." >&2
    exit 127
  fi
}

run_doctor() {
  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    pnpm exec expo-doctor
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    yarn expo-doctor
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    bunx expo-doctor
  elif command -v npx >/dev/null 2>&1; then
    npx expo-doctor
  else
    echo "expo-doctor is unavailable. Run npm install first." >&2
    exit 127
  fi
}

case "$MODE" in
  start|run)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --android|android)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start --android
    ;;
  --web|web)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start --web
    ;;
  --dev-client|dev-client)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start --dev-client
    ;;
  --tunnel|tunnel)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --export-web|export-web)
    resolve_expo_cmd
    exec "${EXPO_CMD[@]}" export --platform web
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --help|help|-h)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
