# 🔈 HK

Phone remote for the living room: the Harman Kardon amp (HK3700) and the Hue lights.

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

## Layout

| Path     | What                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| `src/`   | The web app: Vite + React, no UI library. Deployed to Vercel.                              |
| `agent/` | The home service: Node 20+, zero runtime dependencies. Ignored by Vercel (`.vercelignore`) |

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

Keep it running: `agent/deploy/hk-agent.service` (Raspberry Pi, systemd) or `agent/deploy/dev.vumble.hk-agent.plist`
(Mac, launchd). Tests: `npm test` (a fake amp checks the TCP protocol, no hardware needed).

### Reaching it from outside

The web app is served over HTTPS, so the agent needs an HTTPS URL too. Easiest: [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
on the machine running the agent:

```bash
tailscale funnel --bg 8787
```

That gives a public `https://<machine>.<tailnet>.ts.net` URL, with a real certificate and no port forwarding. The token is
the only protection, keep it long. Any other tunnel works the same way (Cloudflare Tunnel, ngrok), the app only needs a URL.

## Web app

```bash
npm install
npm run dev        # http://localhost:5181
npm run build      # tsc + vite build into dist/
npm run format
```

On first open the app asks for the agent URL and the token and keeps them in `localStorage`. To set a phone up without
typing, open `https://hk.vumble.dev/#agent=https://<agent-url>&token=<token>`: the values are stored and removed from
the URL. The ⋯ button in the footer reopens that screen.

For local development point it at `http://localhost:8787` with the token `mock` while `npm run mock` runs in `agent/`.

### Deploy

Import the GitHub repo in Vercel (framework preset: Vite, root directory: `/`), attach `hk.vumble.dev`. There is no
server-side configuration: no environment variables on Vercel.

## Hue notes

- Recent bridge firmware only answers over HTTPS with a self-signed certificate. The agent accepts it. For an old bridge
  set `HUE_URL=http://<ip>`.
- Find the bridge IP: `curl https://discovery.meethue.com/`.
- Colours are sent as CIE `xy` (Wide RGB D65 matrix from the Hue docs); lights without colour just get `on` and brightness.

## HK notes

- The amp closes its API after a while in standby, and `on` only works when the amp is in network standby mode.
  `status` (heart-alive) is the only command that answers; the app uses it for the online dot.
- Sources are whatever the amp calls them: `Radio`, `TV`, `Cable Sat`, `Disc`, `Game`, `Aux`, `Network`, ...
