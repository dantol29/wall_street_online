import { AccessToken, TrackSource } from "livekit-server-sdk";

export interface VoiceTokenConfig {
  apiKey: string;
  apiSecret: string;
}

export interface VoiceTokenIdentity {
  sessionId: string;
  displayName: string;
  roomId: string;
}

export function voiceRoomName(roomId: string): string {
  return `social:${roomId}`;
}

/** Creates a narrowly-scoped, short-lived join token for an authenticated game-room client. */
export async function createVoiceToken(
  config: VoiceTokenConfig,
  identity: VoiceTokenIdentity,
): Promise<string> {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("LiveKit credentials are not configured.");
  }

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: identity.sessionId,
    name: identity.displayName,
    ttl: "5m",
    metadata: JSON.stringify({ gameSessionId: identity.sessionId }),
  });
  token.addGrant({
    roomJoin: true,
    room: voiceRoomName(identity.roomId),
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}
