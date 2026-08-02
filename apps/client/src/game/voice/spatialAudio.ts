import {
  VOICE_FULL_VOLUME_DISTANCE_METERS,
  VOICE_MAX_DISTANCE_METERS,
} from "@multiplayer/shared";

export interface VoiceVector {
  x: number;
  y: number;
  z: number;
}

export interface VoiceListenerTransform {
  position: VoiceVector;
  forward: VoiceVector;
  up: VoiceVector;
}

export interface VoiceSpatialProvider {
  getListenerTransform: () => VoiceListenerTransform | null;
  getRemotePosition: (sessionId: string) => VoiceVector | null;
}

export function calculateProximityGain(distanceMeters: number): number {
  if (distanceMeters <= VOICE_FULL_VOLUME_DISTANCE_METERS) return 1;
  if (distanceMeters >= VOICE_MAX_DISTANCE_METERS) return 0;
  return (
    1 -
    (distanceMeters - VOICE_FULL_VOLUME_DISTANCE_METERS) /
      (VOICE_MAX_DISTANCE_METERS - VOICE_FULL_VOLUME_DISTANCE_METERS)
  );
}

export function setAudioParam(param: AudioParam, value: number, now: number): void {
  param.setTargetAtTime(value, now, 0.025);
}
