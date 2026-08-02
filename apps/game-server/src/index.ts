import http from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@multiplayer/shared";
import { SocialRoom } from "./rooms/SocialRoom";
import { config } from "./config";

if (config.voice.enabled && (!config.voice.apiKey || !config.voice.apiSecret)) {
  throw new Error("VOICE_ENABLED=true requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET.");
}

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, SocialRoom);

gameServer.listen(config.port).then(() => {
  console.log(`[game-server] listening on ws://localhost:${config.port} (env: ${config.nodeEnv})`);
});
