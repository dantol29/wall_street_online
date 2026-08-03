import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MAX_PLAYERS, ROOM_NAME } from "@multiplayer/shared";
import { SocialRoom } from "./rooms/SocialRoom";
import { config } from "./config";

if (config.voice.enabled && (!config.voice.apiKey || !config.voice.apiSecret)) {
  throw new Error("VOICE_ENABLED=true requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET.");
}

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

if (config.nodeEnv === "production") {
  const clientDistDirectory =
    process.env.CLIENT_DIST_DIR || path.resolve(process.cwd(), "apps/client/dist");
  app.use(express.static(clientDistDirectory));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistDirectory, "index.html"));
  });
}

const httpServer = http.createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, SocialRoom);

gameServer.listen(config.port).then(() => {
  console.log(
    `[game-server] listening on ws://localhost:${config.port} ` +
      `(env: ${config.nodeEnv}, room max: ${MAX_PLAYERS})`,
  );
});
