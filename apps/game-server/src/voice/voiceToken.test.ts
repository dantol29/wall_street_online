import { describe, expect, it } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { createVoiceToken, voiceRoomName } from "./voiceToken";

const API_KEY = "test-key";
const API_SECRET = "test-secret-that-is-long-enough-for-hs256";

describe("voice token generation", () => {
  it("maps a Colyseus room to a stable LiveKit room", () => {
    expect(voiceRoomName("room-123")).toBe("social:room-123");
  });

  it("issues microphone-only room grants for the game session", async () => {
    const jwt = await createVoiceToken(
      { apiKey: API_KEY, apiSecret: API_SECRET },
      { sessionId: "session-1", displayName: "Trader One", roomId: "room-123" },
    );
    const claims = await new TokenVerifier(API_KEY, API_SECRET).verify(jwt);

    expect(claims.sub).toBe("session-1");
    expect(claims.name).toBe("Trader One");
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: "social:room-123",
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      canPublishSources: ["microphone"],
    });
  });

  it("rejects missing credentials", async () => {
    await expect(
      createVoiceToken(
        { apiKey: "", apiSecret: "" },
        { sessionId: "session-1", displayName: "Trader One", roomId: "room-123" },
      ),
    ).rejects.toThrow("credentials");
  });
});
