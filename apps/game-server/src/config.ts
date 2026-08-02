import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ENOENT") throw error;
}

export const config = {
  port: Number(process.env.PORT) || 2567,
  nodeEnv: process.env.NODE_ENV || "development",
  voice: {
    enabled: process.env.VOICE_ENABLED === "true",
    serverUrl: process.env.LIVEKIT_URL || "ws://localhost:7880",
    apiKey: process.env.LIVEKIT_API_KEY || "",
    apiSecret: process.env.LIVEKIT_API_SECRET || "",
  },
  privy: {
    enabled: Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET),
    appId: process.env.PRIVY_APP_ID || "",
    appSecret: process.env.PRIVY_APP_SECRET || "",
  },
  db: {
    path: process.env.DB_PATH || "./data/offices.db",
  },
};
