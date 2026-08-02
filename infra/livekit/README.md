# Self-hosted LiveKit

This profile runs a single-node LiveKit SFU and Caddy on the same public Linux
VM as the game server. It is suitable for the current 20-player room cap.

## Configure

1. Point a DNS record such as `voice.example.com` at the VM.
2. Copy `.env.example` to `.env` and replace all values. Use the same API key
   and secret in the game server environment.
3. Set the game server environment:

   ```text
   VOICE_ENABLED=true
   LIVEKIT_URL=wss://voice.example.com
   LIVEKIT_API_KEY=<same key>
   LIVEKIT_API_SECRET=<same secret>
   ```

4. Ensure the game client itself is served over HTTPS; browsers do not grant
   microphone access to insecure production origins.

## Firewall

Allow inbound traffic to:

- `80/tcp` and `443/tcp` for certificate issuance and LiveKit signaling.
- `7881/tcp` for WebRTC ICE over TCP.
- `3478/udp` for embedded TURN/STUN.
- `50000-60000/udp` for WebRTC media.

Then start the services from this directory:

```sh
docker compose up -d
```

Caddy obtains and renews the signaling certificate automatically. The included
TURN/UDP path covers most NAT traversal. Before a wider launch, add TURN/TLS on
port 5349 with a dedicated TURN certificate if users behind restrictive
corporate firewalls must be supported.

For local development, run LiveKit directly:

```sh
docker run --rm -p 7880:7880 -p 7881:7881 \
  -p 7882:7882/udp livekit/livekit-server:v1.13.1 \
  --dev --bind 0.0.0.0 --node-ip 127.0.0.1
```

Then set the game server values to `VOICE_ENABLED=true`,
`LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, and
`LIVEKIT_API_SECRET=secret`.
