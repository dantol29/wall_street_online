import { useEffect, useRef } from "react";
import { useAppEvent } from "@playcanvas/react/hooks";

interface AudioRuntime {
  context: AudioContext;
  master: GainNode;
  reverb: ConvolverNode;
  reverbGain: GainNode;
  loopingSources: AudioScheduledSourceNode[];
  nextTerminalNoiseAt: number;
  machinery: HTMLAudioElement;
}

function playAsset(path: string, volume: number, playbackRate = 1): void {
  const audio = new Audio(path);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.playbackRate = playbackRate;
  void audio.play().catch(() => undefined);
}

function createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function createRoomImpulse(context: AudioContext): AudioBuffer {
  const duration = 1.05;
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * duration), context.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const progress = index / data.length;
      data[index] = (Math.random() * 2 - 1) * (1 - progress) ** 3.4;
    }
  }
  return buffer;
}

function connectAmbientNoise(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  filterType: BiquadFilterType,
  frequency: number,
  gainValue: number,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = 0.45;
  const gain = context.createGain();
  gain.gain.value = gainValue;
  source.connect(filter).connect(gain).connect(destination);
  source.start();
  return source;
}

function createAudioRuntime(): AudioRuntime {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.58;
  master.connect(context.destination);

  const reverb = context.createConvolver();
  reverb.buffer = createRoomImpulse(context);
  const reverbGain = context.createGain();
  reverbGain.gain.value = 0.13;
  reverb.connect(reverbGain).connect(master);

  const ambienceNoise = createNoiseBuffer(context, 3.5);
  const hvac = connectAmbientNoise(context, master, ambienceNoise, "lowpass", 190, 0.024);

  const hum = context.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 50;
  const humGain = context.createGain();
  humGain.gain.value = 0.0042;
  hum.connect(humGain).connect(master);
  hum.start();

  const harmonic = context.createOscillator();
  harmonic.type = "sine";
  harmonic.frequency.value = 100;
  const harmonicGain = context.createGain();
  harmonicGain.gain.value = 0.0014;
  harmonic.connect(harmonicGain).connect(master);
  harmonic.start();

  const machinery = new Audio("/assets/audio/ambience/machinery-loop.mp3");
  machinery.loop = true;
  machinery.volume = 0.018;
  void machinery.play().catch(() => undefined);

  return {
    context,
    master,
    reverb,
    reverbGain,
    loopingSources: [hvac, hum, harmonic],
    nextTerminalNoiseAt: context.currentTime + 22 + Math.random() * 23,
    machinery,
  };
}

function playTerminalNoise(runtime: AudioRuntime): void {
  playAsset("/assets/audio/terminal/transaction-click.wav", 0.024, 0.98 + Math.random() * 0.04);
  runtime.nextTerminalNoiseAt = runtime.context.currentTime + 22 + Math.random() * 23;
}

/** Browser-unlocked, procedural room tone and local gameplay sounds. */
export function ExchangeAmbience({ launchPhase }: { launchPhase: "idle" | "editing" | "approved" | "countdown" | "live" }) {
  const runtimeRef = useRef<AudioRuntime | null>(null);
  const lastLaunchPhaseRef = useRef(launchPhase);

  useEffect(() => {
    const unlock = () => {
      if (!runtimeRef.current) runtimeRef.current = createAudioRuntime();
      void runtimeRef.current.context.resume();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (runtime) {
        runtime.machinery.pause();
        runtime.loopingSources.forEach((source) => {
          try { source.stop(); } catch { /* already stopped */ }
        });
        void runtime.context.close();
      }
    };
  }, []);

  useEffect(() => {
    const previous = lastLaunchPhaseRef.current;
    lastLaunchPhaseRef.current = launchPhase;
    if (previous === launchPhase || !runtimeRef.current) return;
    if (launchPhase === "approved") playAsset("/assets/audio/exchange/launch-button.mp3", 0.34);
    if (launchPhase === "countdown") playAsset("/assets/audio/terminal/confirmation-beep.wav", 0.055);
    if (launchPhase === "live") playAsset("/assets/audio/exchange/listing-bell.mp3", 0.48);
  }, [launchPhase]);

  useAppEvent("update", () => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.context.state !== "running") return;
    if (runtime.context.currentTime >= runtime.nextTerminalNoiseAt) playTerminalNoise(runtime);

  });

  return null;
}
