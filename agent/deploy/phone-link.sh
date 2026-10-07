#!/usr/bin/env bash
# Copies the setup link for a phone to the clipboard: open it there and the app configures itself.
#   agent/deploy/phone-link.sh [agent public URL]     default: the Pi's Tailscale Funnel URL
set -euo pipefail
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_URL="${1:-https://volumio.tailccebb8.ts.net}"
token="$(grep -E '^AGENT_TOKEN=' "$AGENT_DIR/.env" | cut -d= -f2-)"
[ -n "$token" ] || { echo "AGENT_TOKEN missing in $AGENT_DIR/.env"; exit 1; }
printf 'https://hk.vumble.dev/#agent=%s&token=%s' "${PUBLIC_URL%/}" "$token" | pbcopy
echo "Setup link copied to the clipboard (agent $PUBLIC_URL). Paste it in Safari on the phone."
