# Multiplayer Trading Floor

A browser-based social multiplayer trading-floor game built with PlayCanvas,
React, Colyseus, and LiveKit. Players can walk around the floor, chat, use
proximity voice, sit at desks, and create trading plans.

## Prerequisites

Install:

- [Node.js](https://nodejs.org/) 20.19 or newer.
- [pnpm](https://pnpm.io/) 10.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) for local
  LiveKit voice chat.

If pnpm is not installed:

```sh
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

## First-time setup

From the repository root:

```sh
pnpm install
cp apps/client/.env.example apps/client/.env
cp apps/game-server/.env.example apps/game-server/.env
```

For the complete game, including voice chat, make sure
`apps/game-server/.env` contains:

```text
PORT=2567
NODE_ENV=development
VOICE_ENABLED=true
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

The client environment should contain:

```text
VITE_GAME_SERVER_URL=ws://localhost:2567
```

These are local development credentials only. Never use `devkey` and `secret`
in production.

## Start the full game

### 1. Start LiveKit

For the first run, create the local voice server:

```sh
docker run -d \
  --name multiplayer-livekit-dev \
  --restart unless-stopped \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  livekit/livekit-server:v1.13.1 \
  --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

On later runs, if the container is stopped:

```sh
docker start multiplayer-livekit-dev
```

Confirm it is running:

```sh
docker ps --filter name=multiplayer-livekit-dev
```

### 2. Start the game server and client

In a terminal at the repository root:

```sh
pnpm dev
```

This starts:

| Service | Address | Purpose |
| --- | --- | --- |
| Vite client | <http://localhost:5173> | PlayCanvas game and React UI |
| Colyseus server | <http://localhost:2567> | Multiplayer state, chat, desks, and voice tokens |
| LiveKit | <http://localhost:7880> | WebRTC voice transport |

Open <http://localhost:5173>, click **Click to enter**, then click
**Enable Voice** and grant microphone permission.

To test multiplayer locally, open a second private/incognito browser window at
the same address.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look around |
| `W` `A` `S` `D` | Move |
| `Shift` | Run |
| `Space` | Jump |
| `E` | Sit at a nearby desk |
| `V` | Hold to speak |
| `Enter` | Open or send text chat |
| `Escape` | Cancel chat or leave the trading-plan editor |

Voice is positional: nearby players are heard at full volume within 2 metres
and fade to silence at 10 metres. The voice panel also allows individual
players to be muted locally. Your own microphone is not played back to you;
testing voice requires at least two players with voice enabled.

## Running without voice

Set this in `apps/game-server/.env`:

```text
VOICE_ENABLED=false
```

Restart `pnpm dev`. The rest of the game works without Docker or LiveKit.

## Wallet login (optional)

Players can always join and play as an anonymous guest. If you want to let
them additionally link a crypto wallet to their session (via
[Privy](https://www.privy.io)), create an app in the Privy dashboard and set:

```text
# apps/game-server/.env
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...

# apps/client/.env
VITE_PRIVY_APP_ID=...   # same App ID as above
```

Restart `pnpm dev`. A **Connect Wallet** button appears once entered; linking
a wallet replaces the player's guest name with their (shortened) address.
Leaving these unset disables the button entirely — nothing else changes.

## Verification commands

From the repository root:

```sh
pnpm test
pnpm typecheck
pnpm build
```

The production client is written to `apps/client/dist`, and the bundled game
server is written to `apps/game-server/dist`.

## Stopping the game

Press `Ctrl+C` in the terminal running `pnpm dev`.

To stop local voice:

```sh
docker stop multiplayer-livekit-dev
```

Docker will preserve the container so it can be restarted later.

## Troubleshooting

### “Voice chat is not enabled on this server”

Check that `apps/game-server/.env` has `VOICE_ENABLED=true`, then restart
`pnpm dev`. The game server loads this file when it starts.

### Voice does not connect

Check LiveKit:

```sh
docker ps --filter name=multiplayer-livekit-dev
docker logs --tail 50 multiplayer-livekit-dev
```

If it is stopped, run:

```sh
docker start multiplayer-livekit-dev
```

Also verify that ports `7880`, `7881`, and UDP `7882` are not being used by
another process.

### Microphone permission was denied

Allow microphone access for `localhost` in the browser’s site settings, reload
the page, and click **Enable Voice** again.

### Port already in use

The expected local ports are:

- `5173` — browser client.
- `2567` — Colyseus game server.
- `7880`, `7881`, and `7882/udp` — LiveKit.

Stop the conflicting process or change the corresponding environment and
Docker port configuration.

## Project layout

```text
apps/client       React and PlayCanvas browser game
apps/game-server  Colyseus multiplayer and LiveKit token server
packages/shared   Shared constants and network message types
infra/livekit     Same-VM production LiveKit and Caddy templates
```

Production voice deployment instructions are in
[`infra/livekit/README.md`](infra/livekit/README.md).
