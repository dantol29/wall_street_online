import {
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import {
  type VoiceTokenResultMessage,
} from "@multiplayer/shared";
import {
  calculateProximityGain,
  type VoiceSpatialProvider,
} from "./spatialAudio";

export type VoiceConnectionState =
  | "disabled"
  | "requesting-permission"
  | "connecting"
  | "ready"
  | "reconnecting"
  | "error";

export interface VoiceParticipantState {
  sessionId: string;
  displayName: string;
  speaking: boolean;
  locallyMuted: boolean;
}

export interface VoiceAudioOutputDevice {
  deviceId: string;
  label: string;
}

export interface VoiceClientCallbacks {
  onStateChange: (state: VoiceConnectionState, message?: string) => void;
  onTalkingChange: (talking: boolean) => void;
  onMicrophoneLevelChange: (level: number) => void;
  onParticipantsChange: (participants: VoiceParticipantState[]) => void;
  onAudioOutputsChange: (
    devices: VoiceAudioOutputDevice[],
    selectedDeviceId: string,
    supported: boolean,
  ) => void;
}

interface RemoteAudioOutput {
  track: RemoteAudioTrack;
  element: HTMLAudioElement;
  proximityVolume: number;
}

export class VoiceClient {
  private readonly callbacks: VoiceClientCallbacks;
  private readonly spatialProvider: VoiceSpatialProvider;
  private readonly room: Room;
  private readonly outputs = new Map<string, RemoteAudioOutput>();
  private readonly locallyMutedIds = new Set<string>();
  private readonly speakingIds = new Set<string>();
  private talking = false;
  private desiredTalking = false;
  private talkingUpdate: Promise<void> = Promise.resolve();
  private microphoneLevel = 0;
  private lastMicrophoneLevelEmitAt = 0;
  private selectedAudioOutputId = "default";
  private intentionalDisconnect = false;
  private disposed = false;

  constructor(spatialProvider: VoiceSpatialProvider, callbacks: VoiceClientCallbacks) {
    this.spatialProvider = spatialProvider;
    this.callbacks = callbacks;
    this.room = new Room({
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.attachRoomHandlers();
  }

  /** Must be called from a click/tap so browsers allow remote audio playback. */
  prepareAudio(): void {
    if (this.disposed) return;
    void this.startAudioPlayback();
    this.callbacks.onStateChange("requesting-permission");
  }

  async connect(result: VoiceTokenResultMessage): Promise<void> {
    if (this.disposed) return;
    if (!result.enabled || !result.token || !result.serverUrl) {
      this.callbacks.onStateChange("error", result.message ?? "Voice chat is unavailable.");
      return;
    }

    try {
      this.callbacks.onStateChange("connecting");
      await this.room.connect(result.serverUrl, result.token, { autoSubscribe: true });
      const publication = await this.room.localParticipant.setMicrophoneEnabled(true, {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      });
      await publication?.mute();
      await this.startAudioPlayback();
      this.setTalkingState(false);
      this.callbacks.onStateChange("ready");
      this.emitParticipants();
      await this.refreshAudioOutputs();
    } catch (error) {
      await this.disconnect(false);
      this.callbacks.onStateChange("error", this.readableError(error));
    }
  }

  setTalking(talking: boolean): Promise<void> {
    if (talking) void this.startAudioPlayback();
    this.desiredTalking = talking;
    this.talkingUpdate = this.talkingUpdate.then(() => this.applyDesiredTalkingState());
    return this.talkingUpdate;
  }

  private async applyDesiredTalkingState(): Promise<void> {
    if (this.room.state !== "connected") {
      this.setTalkingState(false);
      return;
    }
    const publication = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!publication) return;

    try {
      if (this.desiredTalking) {
        await publication.unmute();
      } else {
        await publication.mute();
      }
      this.setTalkingState(this.desiredTalking);
    } catch {
      this.setTalkingState(false);
    }
  }

  setParticipantMuted(sessionId: string, muted: boolean): void {
    if (muted) this.locallyMutedIds.add(sessionId);
    else this.locallyMutedIds.delete(sessionId);
    const output = this.outputs.get(sessionId);
    if (output) {
      output.track.setVolume(muted ? 0 : output.proximityVolume);
    }
    this.emitParticipants();
  }

  async setAudioOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.supportsAudioOutputSelection()) return false;
    const switched = await this.room.switchActiveDevice("audiooutput", deviceId);
    if (switched) {
      this.selectedAudioOutputId = deviceId;
      await this.refreshAudioOutputs();
    }
    return switched;
  }

  updateSpatialAudio(): void {
    this.updateMicrophoneLevel();
    const listenerTransform = this.spatialProvider.getListenerTransform();
    if (!listenerTransform) return;

    for (const [sessionId, output] of this.outputs) {
      const position = this.spatialProvider.getRemotePosition(sessionId);
      if (!position) {
        // Keep newly joined players audible while their scene entity is still being created.
        output.proximityVolume = 1;
        output.track.setVolume(this.locallyMutedIds.has(sessionId) ? 0 : 1);
        continue;
      }
      const dx = position.x - listenerTransform.position.x;
      const dy = position.y - listenerTransform.position.y;
      const dz = position.z - listenerTransform.position.z;
      output.proximityVolume = calculateProximityGain(Math.hypot(dx, dy, dz));
      output.track.setVolume(
        this.locallyMutedIds.has(sessionId) ? 0 : output.proximityVolume,
      );
    }
  }

  async disconnect(_closeAudio = true): Promise<void> {
    this.intentionalDisconnect = true;
    this.desiredTalking = false;
    await this.setTalking(false);
    await this.room.disconnect();
    this.clearOutputs();
    this.speakingIds.clear();
    this.locallyMutedIds.clear();
    this.setMicrophoneLevel(0, true);
    this.callbacks.onAudioOutputsChange([], "default", this.supportsAudioOutputSelection());
    this.emitParticipants();
    this.intentionalDisconnect = false;
    if (!this.disposed) this.callbacks.onStateChange("disabled");
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.disconnect();
  }

  private attachRoomHandlers(): void {
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio || !(track instanceof RemoteAudioTrack)) return;
        this.addRemoteTrack(participant.identity, track);
        this.emitParticipants();
      },
    );
    this.room.on(
      RoomEvent.TrackUnsubscribed,
      (
        _track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        this.removeRemoteTrack(participant.identity);
      },
    );
    this.room.on(RoomEvent.ParticipantConnected, () => this.emitParticipants());
    this.room.on(RoomEvent.MediaDevicesChanged, () => {
      void this.refreshAudioOutputs();
    });
    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.removeRemoteTrack(participant.identity);
      this.locallyMutedIds.delete(participant.identity);
      this.speakingIds.delete(participant.identity);
      this.emitParticipants();
    });
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.speakingIds.clear();
      for (const participant of speakers) {
        if (participant.identity !== this.room.localParticipant.identity) {
          this.speakingIds.add(participant.identity);
        }
      }
      this.emitParticipants();
    });
    this.room.on(RoomEvent.Reconnecting, () => this.callbacks.onStateChange("reconnecting"));
    this.room.on(RoomEvent.Reconnected, () => this.callbacks.onStateChange("ready"));
    this.room.on(RoomEvent.AudioPlaybackStatusChanged, (playing: boolean) => {
      if (playing || this.room.state !== "connected") return;
      this.callbacks.onStateChange(
        "ready",
        "Audio playback is paused by the browser. Tap or click the game to resume it.",
      );
    });
    this.room.on(RoomEvent.Disconnected, () => {
      this.setTalkingState(false);
      if (!this.disposed && !this.intentionalDisconnect) {
        this.callbacks.onStateChange("error", "Voice connection was lost.");
      }
    });
  }

  private addRemoteTrack(sessionId: string, track: RemoteAudioTrack): void {
    this.removeRemoteTrack(sessionId);
    const element = document.createElement("audio");
    element.autoplay = true;
    element.hidden = true;
    track.attach(element);
    track.setVolume(this.locallyMutedIds.has(sessionId) ? 0 : 1);
    this.outputs.set(sessionId, { track, element, proximityVolume: 1 });
    void this.startAudioPlayback();
  }

  private removeRemoteTrack(sessionId: string): void {
    const output = this.outputs.get(sessionId);
    if (!output) return;
    output.track.detach(output.element);
    output.element.remove();
    this.outputs.delete(sessionId);
  }

  private clearOutputs(): void {
    for (const sessionId of [...this.outputs.keys()]) this.removeRemoteTrack(sessionId);
  }

  private async startAudioPlayback(): Promise<void> {
    try {
      await this.room.startAudio();
    } catch {
      // LiveKit emits AudioPlaybackStatusChanged when browser interaction is required.
    }
  }

  private supportsAudioOutputSelection(): boolean {
    return (
      typeof HTMLMediaElement !== "undefined" &&
      "setSinkId" in HTMLMediaElement.prototype
    );
  }

  private async refreshAudioOutputs(): Promise<void> {
    const supported = this.supportsAudioOutputSelection();
    if (!supported) {
      this.callbacks.onAudioOutputsChange([], "default", false);
      return;
    }
    try {
      const devices = await Room.getLocalDevices("audiooutput");
      const outputs = devices.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || (index === 0 ? "System default" : `Audio output ${index + 1}`),
      }));
      const activeDevice = this.room.getActiveDevice("audiooutput");
      if (activeDevice) this.selectedAudioOutputId = activeDevice;
      if (
        outputs.length > 0 &&
        !outputs.some((output) => output.deviceId === this.selectedAudioOutputId)
      ) {
        this.selectedAudioOutputId = outputs[0].deviceId;
      }
      this.callbacks.onAudioOutputsChange(outputs, this.selectedAudioOutputId, true);
    } catch {
      this.callbacks.onAudioOutputsChange([], this.selectedAudioOutputId, true);
    }
  }

  private updateMicrophoneLevel(): void {
    const rawLevel =
      this.talking && this.room.state === "connected"
        ? Math.max(0, Math.min(1, this.room.localParticipant.audioLevel || 0))
        : 0;
    const visibleLevel = Math.sqrt(rawLevel);
    const response = visibleLevel > this.microphoneLevel ? 0.42 : 0.16;
    const nextLevel = this.microphoneLevel + (visibleLevel - this.microphoneLevel) * response;
    this.setMicrophoneLevel(nextLevel);
  }

  private setMicrophoneLevel(level: number, force = false): void {
    const nextLevel = level < 0.005 ? 0 : level;
    const now = performance.now();
    if (!force && now - this.lastMicrophoneLevelEmitAt < 66) {
      this.microphoneLevel = nextLevel;
      return;
    }
    this.microphoneLevel = nextLevel;
    this.lastMicrophoneLevelEmitAt = now;
    this.callbacks.onMicrophoneLevelChange(nextLevel);
  }

  private emitParticipants(): void {
    const participants = [...this.room.remoteParticipants.values()]
      .map((participant) => ({
        sessionId: participant.identity,
        displayName: participant.name || participant.identity,
        speaking: this.speakingIds.has(participant.identity),
        locallyMuted: this.locallyMutedIds.has(participant.identity),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    this.callbacks.onParticipantsChange(participants);
  }

  private setTalkingState(talking: boolean): void {
    if (this.talking === talking) return;
    this.talking = talking;
    if (!talking) this.setMicrophoneLevel(0, true);
    this.callbacks.onTalkingChange(talking);
  }

  private readableError(error: unknown): string {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      return "Microphone permission was denied.";
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return "No microphone was found.";
    }
    return "Unable to connect to voice chat.";
  }
}
