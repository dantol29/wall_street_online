import { useEffect, useState } from "react";
import {
  WORLD_DAY_DURATION_MS,
  WORLD_START_HOUR,
  normalizeWorldPhase,
  type WorldTimeSyncMessage,
} from "@multiplayer/shared";

export interface WorldTimeAnchor extends WorldTimeSyncMessage {
  receivedAtClientTimeMs: number;
}

export interface DayNightProfile {
  phase: number;
  hour: number;
  daylight: number;
  night: number;
  twilight: number;
  sunDirection: [number, number, number];
  moonDirection: [number, number, number];
  skyTop: [number, number, number];
  skyHorizon: [number, number, number];
  skyBottom: [number, number, number];
  ambient: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  moonIntensity: number;
  fixtureIntensity: number;
  fixtureEmissiveIntensity: number;
  environmentIntensity: number;
}

type Rgb = [number, number, number];
interface SkyKeyframe {
  hour: number;
  top: Rgb;
  horizon: Rgb;
  bottom: Rgb;
}

const SKY_KEYFRAMES: SkyKeyframe[] = [
  { hour: 0, top: [0.004, 0.008, 0.025], horizon: [0.018, 0.027, 0.065], bottom: [0.01, 0.014, 0.03] },
  { hour: 4.8, top: [0.018, 0.03, 0.075], horizon: [0.13, 0.09, 0.12], bottom: [0.035, 0.035, 0.06] },
  { hour: 5.8, top: [0.075, 0.14, 0.27], horizon: [0.9, 0.29, 0.13], bottom: [0.22, 0.12, 0.12] },
  { hour: 7, top: [0.18, 0.39, 0.72], horizon: [1, 0.62, 0.29], bottom: [0.47, 0.55, 0.64] },
  { hour: 8.4, top: [0.14, 0.41, 0.8], horizon: [0.62, 0.79, 0.94], bottom: [0.54, 0.65, 0.74] },
  { hour: 10, top: [0.12, 0.42, 0.82], horizon: [0.64, 0.82, 0.96], bottom: [0.59, 0.7, 0.78] },
  { hour: 15.5, top: [0.13, 0.4, 0.75], horizon: [0.68, 0.8, 0.91], bottom: [0.55, 0.64, 0.71] },
  { hour: 18, top: [0.1, 0.2, 0.4], horizon: [1, 0.32, 0.08], bottom: [0.3, 0.14, 0.12] },
  { hour: 19.2, top: [0.025, 0.045, 0.13], horizon: [0.38, 0.12, 0.16], bottom: [0.07, 0.045, 0.075] },
  { hour: 21, top: [0.005, 0.011, 0.04], horizon: [0.025, 0.035, 0.08], bottom: [0.012, 0.017, 0.035] },
  { hour: 24, top: [0.004, 0.008, 0.025], horizon: [0.018, 0.027, 0.065], bottom: [0.01, 0.014, 0.03] },
];

export function createInitialWorldTimeAnchor(nowMs = Date.now()): WorldTimeAnchor {
  return {
    phase: WORLD_START_HOUR / 24,
    dayDurationMs: WORLD_DAY_DURATION_MS,
    serverTimeMs: nowMs,
    receivedAtClientTimeMs: nowMs,
  };
}

export function anchorWorldTime(message: WorldTimeSyncMessage, receivedAtClientTimeMs = Date.now()): WorldTimeAnchor {
  return { ...message, phase: normalizeWorldPhase(message.phase), receivedAtClientTimeMs };
}

export function worldPhaseFromAnchor(anchor: WorldTimeAnchor, nowMs = Date.now()): number {
  return normalizeWorldPhase(
    anchor.phase + (nowMs - anchor.receivedAtClientTimeMs) / anchor.dayDurationMs,
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function mixRgb(a: Rgb, b: Rgb, amount: number): Rgb {
  return [mix(a[0], b[0], amount), mix(a[1], b[1], amount), mix(a[2], b[2], amount)];
}

function skyColorsAtHour(hour: number): Pick<DayNightProfile, "skyTop" | "skyHorizon" | "skyBottom"> {
  const nextIndex = SKY_KEYFRAMES.findIndex((keyframe) => hour <= keyframe.hour);
  const upperIndex = Math.max(1, nextIndex);
  const before = SKY_KEYFRAMES[upperIndex - 1];
  const after = SKY_KEYFRAMES[upperIndex];
  const amount = smoothstep(before.hour, after.hour, hour);
  return {
    skyTop: mixRgb(before.top, after.top, amount),
    skyHorizon: mixRgb(before.horizon, after.horizon, amount),
    skyBottom: mixRgb(before.bottom, after.bottom, amount),
  };
}

export function getDayNightProfile(phase: number): DayNightProfile {
  const normalizedPhase = normalizeWorldPhase(phase);
  const hour = normalizedPhase * 24;
  const solarAngle = (normalizedPhase - 0.25) * Math.PI * 2;
  const rawSun: Rgb = [Math.cos(solarAngle), Math.sin(solarAngle), -0.42];
  const length = Math.hypot(...rawSun);
  const sunDirection = rawSun.map((component) => component / length) as Rgb;
  const moonDirection = sunDirection.map((component) => -component) as Rgb;
  const daylight = smoothstep(-0.08, 0.16, sunDirection[1]);
  const night = 1 - smoothstep(-0.22, 0.04, sunDirection[1]);
  const twilight = clamp01(1 - Math.abs(sunDirection[1]) / 0.34);
  const sunriseWarmth = twilight * (1 - night * 0.65);
  const ambientNight: Rgb = [0.025, 0.035, 0.07];
  const ambientDay: Rgb = [0.29, 0.28, 0.25];
  const ambient = mixRgb(ambientNight, ambientDay, daylight);
  ambient[0] += sunriseWarmth * 0.08;
  ambient[1] += sunriseWarmth * 0.025;

  return {
    phase: normalizedPhase,
    hour,
    daylight,
    night,
    twilight,
    sunDirection,
    moonDirection,
    ...skyColorsAtHour(hour),
    ambient,
    sunColor: sunriseWarmth > 0.25 ? "#ff9a55" : "#fff1d2",
    sunIntensity: daylight * mix(0.38, 1.15, smoothstep(0.05, 0.62, sunDirection[1])),
    moonIntensity: night * 0.14,
    fixtureIntensity: mix(2.25, 1.25, daylight),
    fixtureEmissiveIntensity: mix(5.5, 3.2, daylight),
    environmentIntensity: mix(0.075, 0.72, daylight),
  };
}

export function useDayNightProfile(anchor: WorldTimeAnchor, overridePhase: number | null): DayNightProfile {
  const calculate = () => getDayNightProfile(overridePhase ?? worldPhaseFromAnchor(anchor));
  const [profile, setProfile] = useState<DayNightProfile>(calculate);

  useEffect(() => {
    setProfile(calculate());
    const timer = window.setInterval(() => setProfile(calculate()), 250);
    return () => window.clearInterval(timer);
  }, [anchor, overridePhase]);

  return profile;
}

export function formatWorldTime(hour: number): string {
  const hours = Math.floor(hour) % 24;
  const minutes = Math.floor((hour - Math.floor(hour)) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
