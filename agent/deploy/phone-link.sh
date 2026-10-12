#!/usr/bin/env bash
# Copies a setup link to the clipboard (macOS): open it in the app and it configures itself.
#   agent/deploy/phone-link.sh [agent URL] [app URL]
# Defaults: AGENT_URL from agent/.env and the hosted app. Example for the dev app on the local network:
#   agent/deploy/phone-link.sh http://192.168.1.20:8787 http://127.0.0.1:5181
set -euo pipefail
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
setting() { { grep -E "^$1=" "$AGENT_DIR/.env" || true; } | cut -d= -f2- | tr -d '"'; }
AGENT_URL="${1:-$(setting AGENT_URL)}"
APP_URL="${2:-https://hk.vumble.dev}"
token="$(setting AGENT_TOKEN)"
[ -n "$AGENT_URL" ] || { echo "Pass the agent URL, or set AGENT_URL in $AGENT_DIR/.env"; exit 1; }
[ -n "$token" ] || { echo "AGENT_TOKEN missing in $AGENT_DIR/.env"; exit 1; }
printf '%s/#agent=%s&token=%s' "${APP_URL%/}" "${AGENT_URL%/}" "$token" | pbcopy
echo "Setup link copied to the clipboard: ${APP_URL%/} -> agent ${AGENT_URL%/}"
