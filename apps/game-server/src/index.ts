import http from "node:http";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@multiplayer/shared";
import { SocialRoom } from "./rooms/SocialRoom";
import { config } from "./config";

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
