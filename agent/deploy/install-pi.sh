#!/usr/bin/env bash
# Install or update the HK agent on a Raspberry Pi, in one go. Safe to re-run any time,
# including on a freshly flashed Pi (the only thing it needs there is SSH with your key).
#
#   agent/deploy/install-pi.sh [user@host]        default: volumio@volumio.local
#
# What it does, from this Mac:
#   1. builds the agent here
#   2. copies dist/, package.json and .env to ~/hk-agent on the Pi
#   3. picks a Node: a private one under ~/hk-agent/node when an official build runs on the
#      Pi's OS, otherwise the system Node if it is 14.13 or newer (Volumio's Node 14 on
#      Raspbian Buster, where no Node 18+ build runs)
#   4. installs a systemd unit so it starts at boot (asks the Pi's sudo password once)
#   5. checks the agent answers
# With TS_AUTHKEY set (in the environment or in agent/.env) it also installs Tailscale and
# opens a Funnel, which gives the agent its public HTTPS URL.
set -euo pipefail

HOST="${1:-volumio@volumio.local}"
NODE_MAJOR="${NODE_MAJOR:-22}"
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR='hk-agent'

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[ -f "$AGENT_DIR/.env" ] || { echo "Missing $AGENT_DIR/.env (copy .env.dist and fill it)"; exit 1; }

say "1/5 Building locally"
npm --prefix "$AGENT_DIR" install --no-audit --no-fund --silent
npm --prefix "$AGENT_DIR" run build --silent

say "2/5 Copying files to $HOST:~/$REMOTE_DIR"
ssh "$HOST" "mkdir -p ~/$REMOTE_DIR"
rsync -az --delete "$AGENT_DIR/dist/" "$HOST:$REMOTE_DIR/dist/"
rsync -az "$AGENT_DIR/package.json" "$AGENT_DIR/.env" "$HOST:$REMOTE_DIR/"

say "3/5 Picking a Node"
node_bin="$(ssh "$HOST" bash -s -- "$NODE_MAJOR" "$REMOTE_DIR" < "$AGENT_DIR/deploy/pick-node.sh")"
[ -n "$node_bin" ] || { echo "no Node, giving up"; exit 1; }

say "4/5 systemd unit (the Pi asks for its sudo password)"
remote_user="$(ssh "$HOST" 'id -un')"
remote_home="$(ssh "$HOST" 'echo "$HOME"')"
rendered_unit="$(mktemp)"
sed -e "s|__USER__|$remote_user|g" -e "s|__HOME__|$remote_home|g" -e "s|__NODE__|$node_bin|g" \
  "$AGENT_DIR/deploy/hk-agent.service" > "$rendered_unit"
rsync -az "$rendered_unit" "$HOST:$REMOTE_DIR/hk-agent.service"
rm -f "$rendered_unit"
ssh -t "$HOST" "sudo bash -c 'install -m 644 ~$remote_user/$REMOTE_DIR/hk-agent.service /etc/systemd/system/hk-agent.service && systemctl daemon-reload && systemctl enable --quiet hk-agent && systemctl restart hk-agent'"

say "5/5 Checking"
sleep 2
host_only="${HOST#*@}"
token="$(grep -E '^AGENT_TOKEN=' "$AGENT_DIR/.env" | cut -d= -f2-)"
ssh "$HOST" 'echo "service: $(systemctl is-enabled hk-agent), $(systemctl is-active hk-agent)"'
printf 'agent:   '
curl -fsS -H "Authorization: Bearer $token" "http://$host_only:8787/"
echo

ts_key="${TS_AUTHKEY:-$(grep -E '^TS_AUTHKEY=' "$AGENT_DIR/.env" | cut -d= -f2- || true)}"
if [ -n "$ts_key" ]; then
  say "Tailscale + Funnel"
  ssh -t "$HOST" "command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh; sudo tailscale up --authkey='$ts_key' && sudo tailscale funnel --bg 8787 && tailscale funnel status"
else
  say "Agent installed. It is only reachable on the LAN until it has a public HTTPS URL."
  cat <<'TXT'
To expose it with Tailscale Funnel, on the Pi:
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up                  # prints a login URL to open once
  sudo tailscale funnel --bg 8787    # public https://<name>.<tailnet>.ts.net
Or put a reusable auth key as TS_AUTHKEY in agent/.env and re-run this script to do it in one go.
TXT
fi
