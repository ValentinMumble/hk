# 🔈 HK

Phone remote for the living room: the Harman Kardon amp (HK3700), Spotify and the Hue lights.

```
phone ──HTTPS──▶ hk.vumble.dev (Vercel, static)
                      │
                      │ fetch + bearer token
                      ▼
            agent URL (Tailscale Funnel, or any HTTPS tunnel)
                      │
                      ▼
          agent/ (Node, at home) ──TCP 10025──▶ HK3700
                                 ──HTTPS─────▶ Hue bridge
```

The amp only speaks a raw TCP protocol on the LAN and the Hue bridge only answers on the LAN, so one small
process has to run at home. Everything else is static.

## Quickstart

Everything is deployed: the web app at https://hk.vumble.dev, the agent on the Volumio Pi, reachable at
`https://hk.tailccebb8.ts.net` through Tailscale Funnel.

**New phone**

1. On the Mac: `agent/deploy/phone-link.sh` (copies the setup link, with the agent URL and the token, to the clipboard).
2. On the phone: paste it in Safari (Universal Clipboard works from the Mac). The app configures itself and keeps the
   settings.
3. Share → Add to Home Screen, from that same page. The home-screen app starts configured too. If it ever asks again,
   paste the same link into its URL field: it fills both fields.

**Change the agent** (code, `.env`, or after a reflash): `agent/deploy/install-pi.sh volumio@volumio.local`, details
below.

**Change the web app**: push to `main`, Vercel deploys it.

**Hack locally**: `npm run dev` here and `npm run mock` in `agent/`, then open
`http://127.0.0.1:5181/#agent=http://localhost:8787&token=mock` (the dev server is on `127.0.0.1`, not `localhost`,
because Spotify only accepts that loopback form as a redirect host).

## Layout

| Path     | What                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| `src/`   | The web app: Vite + React, no UI library. Deployed to Vercel.                                 |
| `agent/` | The home service: Node 14.13+, zero runtime dependencies. Ignored by Vercel (`.vercelignore`) |

## Agent (runs at home)

```bash
cd agent
cp .env.dist .env     # fill AGENT_TOKEN (openssl rand -hex 24), HK_IP, HUE_URL, HUE_USERNAME
npm install
npm run build
npm start
```

Try it without any device: `npm run mock` (token is `mock`).

Routes, all behind `Authorization: Bearer <AGENT_TOKEN>`:

| Method | Path                      | Body                                              | Does                                                                                          |
| ------ | ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/`                       |                                                   | `{ok, mock, sources}`                                                                         |
| POST   | `/hk/<command>`           |                                                   | `on` `off` `sleep` `volume-up` `volume-down` `mute` `play` `pause` `next` `previous` `status` |
| POST   | `/hk/source`              | `{"source": "TV"}`                                | Select an input                                                                               |
| GET    | `/hue/lights`             |                                                   | `[{id, name, on, reachable, brightness, hasColor}]`                                           |
| POST   | `/hue/all`                | `{"on"?, "color"?: "#hex", "brightness"?: 0-100}` | Every light at once (group 0)                                                                 |
| POST   | `/hue/lights/<id>`        | same                                              | One light                                                                                     |
| POST   | `/hue/lights/<id>/toggle` |                                                   | Flip one light, returns `{on}`                                                                |

Tests: `npm test` (a fake amp checks the TCP protocol, no hardware needed).

### On the Raspberry Pi, in one go

The agent lives on the Volumio Pi (`volumio.local`, 192.168.1.13) as the systemd service `hk-agent`, started at boot
and restarted after a crash. Install or update it from the Mac:

```bash
agent/deploy/install-pi.sh volumio@volumio.local
```

Safe to re-run after any change. It builds here, copies `dist/` and `.env` to `~/hk-agent`, picks a Node
(`agent/deploy/pick-node.sh`: a private one under `~/hk-agent/node` when an official build runs on the Pi's OS, otherwise
the system Node; on Volumio 3 that is Volumio's own Node 14, since Raspbian Buster cannot run any Node 18+ build and 14 is
enough), installs the systemd unit from `agent/deploy/hk-agent.service` (asks the Pi's sudo password once) and checks the
agent answers.

On the Pi: `systemctl status hk-agent`, `journalctl -u hk-agent -f`.

#### After a fresh flash of the Pi

1. Flash Volumio, boot it, finish its setup wizard.
2. Put your SSH key on it once: `ssh-copy-id volumio@volumio.local`.
3. Make sure `agent/.env` is on the Mac. It is git-ignored here and lives in papyrus like the other `.env` files:
   `agent/.env` is a symlink to `~/dev/papyrus/hk/agent/.env` (recreate it with
   `ln -s $HOME/dev/papyrus/hk/agent/.env agent/.env`). It holds the amp IP, the Hue key, the token and `TS_AUTHKEY`.
4. Run `agent/deploy/install-pi.sh volumio@volumio.local`.

With `TS_AUTHKEY` set, step 4 also installs Tailscale and opens the Funnel, so nothing else is needed.

On a Mac, `agent/deploy/dev.vumble.hk-agent.plist` is a launchd equivalent of the service.

### Reaching it from outside

The web app is served over HTTPS, so the agent needs an HTTPS URL too (a page on `https://` cannot call
`http://192.168.1.13:8787`, browsers block it as mixed content). Easiest: [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
on the Pi, which gives a public URL with a real certificate and no port forwarding. Ours is
`https://hk.tailccebb8.ts.net`.
The token is the only protection, keep it long.

By hand, on the Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                  # prints a login URL, open it once
sudo tailscale funnel --bg 8787    # the first time it prints a link to enable Funnel on the tailnet
tailscale funnel status            # shows the public URL
```

In one go: create a reusable auth key in the Tailscale admin console (Settings → Keys), add it to `agent/.env` as
`TS_AUTHKEY=tskey-auth-…` and run `agent/deploy/install-pi.sh`. Enabling Funnel on the tailnet is a one-time setting
that survives reinstalls. The node is named `hk` in Tailscale (`TS_HOSTNAME` in `agent/.env`, passed to `tailscale up` by the install script;
the Pi's own hostname stays `volumio`). After a reflash, remove the old `hk` machine in the admin console first and set the
hostname again, otherwise the new one is named `hk-1` and the URL changes.

Then enter the Funnel URL and the token in the app, or open
`https://hk.vumble.dev/#agent=https://hk.tailccebb8.ts.net&token=<token>` on the phone.

Any other tunnel works the same way (Cloudflare Tunnel, ngrok), the app only needs a URL.

## Web app

```bash
npm install
npm run dev        # http://127.0.0.1:5181
npm run build      # tsc + vite build into dist/
npm run format
```

On first open the app asks for the agent URL and the token and keeps them in `localStorage`. To set a phone up without
typing, open `https://hk.vumble.dev/#agent=https://<agent-url>&token=<token>`: the values are stored and removed from
the URL. The ⋯ button in the footer reopens that screen.

For local development the dev server runs on plain HTTP, so it can talk to an agent on the LAN directly:

- fake devices: `npm run mock` in `agent/`, then open `http://127.0.0.1:5181/#agent=http://localhost:8787&token=mock`
- the real Pi: `http://127.0.0.1:5181/#agent=http://192.168.1.13:8787&token=<token from agent/.env>`

### Deploy

The Vercel project `hk` is Git-connected to `ValentinMumble/hk`: every push to `main` deploys to
`https://hk.vumble.dev`. There is no server-side configuration and no environment variable on Vercel. To redo it from
scratch: import the repo in Vercel (framework preset: Vite, root directory `/`) and attach the domain, the wildcard
`*.vumble.dev` already points to Vercel.

## Spotify

Like the old server, the agent holds one Spotify session for every client (tokens in `spotify.json` next to `dist/`
on the Pi, refreshed automatically). That matters on iOS: the home-screen app cannot finish an OAuth redirect itself,
so the login happens in any browser once and every client just polls the agent.

Setup, once:

1. In the [Spotify developer dashboard](https://developer.spotify.com/dashboard), the app needs the redirect URIs
   `https://hk.vumble.dev/` and `http://127.0.0.1:5181/` (dev). Its client id and secret go in `agent/.env` as
   `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, then `agent/deploy/install-pi.sh`.
2. Tap "Connect Spotify" in the app and approve. After a reflash of the Pi, tap it again.

`SPOTIFY_DEFAULT_DEVICE` (default `Volumio`) is the Spotify Connect device the agent wakes up when a command fails
because nothing is playing anywhere.

Routes (behind the token): `GET /spotify/state`, `devices`, `playlists`, `search?q=`, `auth-url?redirect=&state=`;
`POST /spotify/play {uri?|contextUri?}`, `pause`, `next`, `previous`, `seek {positionMs}`, `volume {percent}`,
`shuffle {state}`, `repeat {state}`, `transfer {deviceId, play}`, `authorize {code, redirectUri}`, `logout`.

## Hue notes

- Recent bridge firmware only answers over HTTPS with a self-signed certificate. The agent accepts it. For an old bridge
  set `HUE_URL=http://<ip>`.
- Find the bridge IP: `curl https://discovery.meethue.com/`.
- Colours are sent as CIE `xy` (Wide RGB D65 matrix from the Hue docs); lights without colour just get `on` and brightness.

## HK notes

- The amp closes its API after a while in standby, and `on` only works when the amp is in network standby mode.
  `status` (heart-alive) is the only command that answers; the app uses it for the online dot.
- Sources are whatever the amp calls them: `Radio`, `TV`, `Cable Sat`, `Disc`, `Game`, `Aux`, `Network`, ...
