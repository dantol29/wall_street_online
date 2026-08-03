import { cli, type Options } from "@colyseus/loadtest";
import { Client, type Room } from "colyseus.js";
import {
  MOVEMENT_SEND_RATE_HZ,
  WORLD_BOUNDS,
  type AnimationState,
  type PlayerInputMessage,
} from "@multiplayer/shared";

interface BotPlayerState {
  x: number;
  y: number;
  z: number;
}

interface LoadTestPong {
  sentAt: number;
}

const FLOOR_LIMITS = {
  minX: WORLD_BOUNDS.minX + 1.25,
  maxX: WORLD_BOUNDS.maxX - 1.25,
  minZ: WORLD_BOUNDS.minZ + 1.25,
  // Keep routine bot traffic on the main trading floor rather than in offices.
  maxZ: Math.min(10.5, WORLD_BOUNDS.maxZ - 1.25),
} as const;
const MOVEMENT_INTERVAL_MS = 1000 / MOVEMENT_SEND_RATE_HZ;
const REPORT_INTERVAL_MS = 5_000;
const PING_INTERVAL_MS = 1_000;
const CHAT_LINES = [
  "Watching the tape.",
  "Liquidity is picking up.",
  "Anyone following this move?",
  "Volume just came in.",
  "Market feels active.",
] as const;

const aggregate = {
  connected: 0,
  movementMessages: 0,
  stateChanges: 0,
  latencySamples: [] as number[],
  roomPopulation: new Map<string, number>(),
  reporterStarted: false,
};

// `pnpm loadtest -- --numClients ...` can leave a literal separator in argv
// after nested workspace scripts. Remove it so @colyseus/loadtest sees the
// options that follow on every supported pnpm invocation.
const argumentSeparatorIndex = process.argv.indexOf("--", 2);
if (argumentSeparatorIndex >= 0) process.argv.splice(argumentSeparatorIndex, 1);

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomTarget(): { x: number; z: number } {
  return {
    x: randomBetween(FLOOR_LIMITS.minX, FLOOR_LIMITS.maxX),
    z: randomBetween(FLOOR_LIMITS.minZ, FLOOR_LIMITS.maxZ),
  };
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction));
  return sortedValues[index] ?? 0;
}

function startReporter(): void {
  if (aggregate.reporterStarted) return;
  aggregate.reporterStarted = true;
  let previousMovementMessages = 0;
  let previousStateChanges = 0;

  setInterval(() => {
    const latencies = aggregate.latencySamples.splice(0).sort((a, b) => a - b);
    const movementRate = (aggregate.movementMessages - previousMovementMessages) / (REPORT_INTERVAL_MS / 1000);
    const stateRate = (aggregate.stateChanges - previousStateChanges) / (REPORT_INTERVAL_MS / 1000);
    previousMovementMessages = aggregate.movementMessages;
    previousStateChanges = aggregate.stateChanges;
    const rooms = [...aggregate.roomPopulation.entries()]
      .map(([roomId, population]) => `${roomId.slice(0, 8)}:${population}`)
      .join(", ");

    console.info(
      `[bots] connected=${aggregate.connected} rooms=[${rooms}] ` +
        `movement=${movementRate.toFixed(0)}/s patches=${stateRate.toFixed(0)}/s ` +
        `rtt-p50=${percentile(latencies, 0.5).toFixed(1)}ms ` +
        `rtt-p95=${percentile(latencies, 0.95).toFixed(1)}ms`,
    );
  }, REPORT_INTERVAL_MS);
}

function scheduleChat(room: Room, clientId: number): () => void {
  let timeout: NodeJS.Timeout;
  const send = (): void => {
    const line = CHAT_LINES[(clientId + Math.floor(Math.random() * CHAT_LINES.length)) % CHAT_LINES.length];
    if (line) room.send("chat", { text: line });
    timeout = setTimeout(send, randomBetween(25_000, 45_000));
  };
  timeout = setTimeout(send, randomBetween(8_000, 25_000));
  return () => clearTimeout(timeout);
}

async function main(options: Options): Promise<void> {
  startReporter();
  const client = new Client(options.endpoint);
  const displayName = `LoadBot-${String(options.clientId + 1).padStart(4, "0")}`;
  const room = options.roomId
    ? await client.joinById(options.roomId, { displayName })
    : await client.joinOrCreate(options.roomName, { displayName });

  aggregate.connected += 1;
  aggregate.roomPopulation.set(room.roomId, (aggregate.roomPopulation.get(room.roomId) ?? 0) + 1);

  const player = room.state.players?.get(room.sessionId) as BotPlayerState | undefined;
  let x = Number.isFinite(player?.x) ? player!.x : randomBetween(-6, 6);
  const y = Number.isFinite(player?.y) ? player!.y : 1;
  let z = Number.isFinite(player?.z) ? player!.z : randomBetween(-8, 8);
  let target = randomTarget();
  let sequence = 0;
  let previousTickAt = performance.now();
  let idleUntil = performance.now() + randomBetween(0, 2_000);
  let wavingUntil = 0;

  // Consume the same server messages as a real client. Registering handlers
  // also keeps the load-test dashboard focused on performance rather than
  // colyseus.js warnings about intentionally ignored payloads.
  room.onMessage("chat", () => {});
  room.onMessage("chat_history", () => {});
  room.onMessage("whiteboard_snapshot", () => {});
  room.onMessage("sticky_note_snapshot", () => {});
  room.onMessage("world_time_sync", () => {});

  room.send("chat_history_request");
  room.send("whiteboard_snapshot_request");
  room.send("sticky_note_snapshot_request");
  room.send("world_time_request");

  room.onStateChange(() => {
    aggregate.stateChanges += 1;
  });
  room.onMessage<LoadTestPong>("loadtest_pong", (message) => {
    if (!Number.isFinite(message?.sentAt)) return;
    aggregate.latencySamples.push(Math.max(0, Date.now() - message.sentAt));
  });

  const movementTimer = setInterval(() => {
    const now = performance.now();
    const elapsedSeconds = Math.min(0.15, Math.max(0, now - previousTickAt) / 1000);
    previousTickAt = now;
    const dx = target.x - x;
    const dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    let animation: AnimationState = "idle";
    let rotationY = Math.atan2(dx, dz);

    if (now >= idleUntil) {
      if (distance < 0.35) {
        target = randomTarget();
        idleUntil = now + randomBetween(500, 2_500);
        if (Math.random() < 0.18) wavingUntil = now + 1_800;
      } else {
        const running = Math.random() < 0.08;
        const speed = running ? 5 : 2.8;
        const step = Math.min(distance, speed * elapsedSeconds);
        x += (dx / distance) * step;
        z += (dz / distance) * step;
        animation = running ? "run" : "walk";
      }
    }
    if (now < wavingUntil) animation = "wave";

    sequence += 1;
    const message: PlayerInputMessage = { sequence, x, y, z, rotationY, animation };
    room.send("move", message);
    aggregate.movementMessages += 1;
  }, MOVEMENT_INTERVAL_MS);

  const pingTimer = setInterval(() => {
    room.send("loadtest_ping", { sentAt: Date.now() });
  }, PING_INTERVAL_MS);
  const cancelChat = scheduleChat(room, options.clientId);

  room.onError((code, message) => {
    console.error(`[${displayName}] room error ${code}: ${message}`);
  });
  room.onLeave((code) => {
    clearInterval(movementTimer);
    clearInterval(pingTimer);
    cancelChat();
    aggregate.connected = Math.max(0, aggregate.connected - 1);
    const population = Math.max(0, (aggregate.roomPopulation.get(room.roomId) ?? 1) - 1);
    if (population === 0) aggregate.roomPopulation.delete(room.roomId);
    else aggregate.roomPopulation.set(room.roomId, population);
    if (code !== 1000) console.warn(`[${displayName}] left with code ${code}`);
  });
}

cli(main);
