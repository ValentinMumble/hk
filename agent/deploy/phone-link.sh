#!/usr/bin/env bash
# Copies a setup link to the clipboard: open it in the app and it configures itself.
#   agent/deploy/phone-link.sh [agent URL] [app URL]
# Defaults: the Pi's Funnel URL and the production app. Examples:
#   agent/deploy/phone-link.sh                                            # phone, from anywhere
#   agent/deploy/phone-link.sh http://192.168.1.13:8787 http://127.0.0.1:5181   # dev app on the LAN
set -euo pipefail
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_URL="${1:-https://hk.tailccebb8.ts.net}"
APP_URL="${2:-https://hk.vumble.dev}"
token="$(grep -E '^AGENT_TOKEN=' "$AGENT_DIR/.env" | cut -d= -f2-)"
[ -n "$token" ] || { echo "AGENT_TOKEN missing in $AGENT_DIR/.env"; exit 1; }
printf '%s/#agent=%s&token=%s' "${APP_URL%/}" "${AGENT_URL%/}" "$token" | pbcopy
echo "Setup link copied to the clipboard: ${APP_URL%/} -> agent ${AGENT_URL%/}"
