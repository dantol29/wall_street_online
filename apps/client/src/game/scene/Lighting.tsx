import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Environment as SceneEnvironment, Light, Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import {
  ADDRESS_CLAMP_TO_EDGE,
  Color,
  CULLFACE_FRONT,
  FILTER_LINEAR,
  LIGHTFALLOFF_LINEAR,
  Quat,
  SEMANTIC_POSITION,
  ShaderMaterial,
  Texture,
  Vec3,
  type Entity as PcEntity,
} from "playcanvas";
import type { DayNightProfile } from "./dayNight";
import { useDayNight } from "./DayNightContext";
import { ROOM_HEIGHT } from "./roomConstants";

// Six downlights cover the terminal grid in pairs. This replaces the old 15
// overlapping 25m omni lights, which illuminated almost every surface evenly.
const TERMINAL_DOWNLIGHTS = [-10, 0, 10].flatMap((z) => [
  { x: -7.75, z, shadows: z === 0 },
  { x: 7.75, z, shadows: z === 0 },
]);
const REFLECTION_FACE_SIZE = 64;

const SKY_VERTEX_SHADER = `
attribute vec3 aPosition;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vWorldDirection;

void main(void) {
  vec4 worldPosition = matrix_model * vec4(aPosition, 1.0);
  vWorldDirection = normalize(worldPosition.xyz);
  gl_Position = matrix_viewProjection * worldPosition;
  gl_Position.z = gl_Position.w * 0.99999;
}
`;

const SKY_FRAGMENT_SHADER = `
precision highp float;

varying vec3 vWorldDirection;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyBottom;
uniform vec3 uSunDirection;
uniform vec3 uMoonDirection;
uniform float uDaylight;
uniform float uNight;
uniform float uTwilight;
uniform float uTime;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(vec3(i, 0.0)), hash(vec3(i + vec2(1.0, 0.0), 0.0)), f.x),
             mix(hash(vec3(i + vec2(0.0, 1.0), 0.0)), hash(vec3(i + 1.0, 0.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  value += noise(p) * 0.55;
  value += noise(p * 2.03 + 7.1) * 0.28;
  value += noise(p * 4.11 + 19.7) * 0.17;
  return value;
}

void main(void) {
  vec3 direction = normalize(vWorldDirection);
  float horizon = smoothstep(-0.13, 0.34, direction.y);
  vec3 sky = mix(uSkyBottom, uSkyHorizon, smoothstep(-0.38, 0.03, direction.y));
  sky = mix(sky, uSkyTop, horizon);

  float sunDot = dot(direction, normalize(uSunDirection));
  float sunDisc = smoothstep(0.99945, 0.99982, sunDot);
  float sunGlow = pow(max(sunDot, 0.0), 70.0);
  vec3 sunColor = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.94, 0.72), uDaylight);
  sky += sunColor * (sunDisc * 2.2 + sunGlow * (0.25 + uTwilight * 0.9)) * (1.0 - uNight);

  float moonDot = dot(direction, normalize(uMoonDirection));
  float moonDisc = smoothstep(0.99955, 0.99982, moonDot);
  float moonCutout = smoothstep(0.99948, 0.99976, dot(direction, normalize(uMoonDirection + vec3(0.013, 0.006, 0.0))));
  float crescent = max(0.0, moonDisc - moonCutout * 0.68);
  sky += vec3(0.73, 0.82, 1.0) * crescent * 1.8 * uNight;

  vec3 starCell = floor(direction * 720.0);
  float starSeed = hash(starCell);
  float star = step(0.9972, starSeed) * pow(max(hash(starCell.yzx + 5.2), 0.15), 3.0);
  star *= smoothstep(-0.05, 0.25, direction.y) * uNight;
  sky += vec3(0.72, 0.84, 1.0) * star * 2.4;

  vec2 cloudUv = direction.xz / max(0.16, direction.y + 0.72);
  cloudUv = cloudUv * 1.7 + vec2(uTime * 0.0025, 0.0);
  float cloudNoise = fbm(cloudUv);
  float cloud = smoothstep(0.57, 0.74, cloudNoise);
  cloud *= smoothstep(-0.03, 0.2, direction.y) * smoothstep(0.95, 0.42, direction.y);
  vec3 cloudColor = mix(vec3(0.055, 0.065, 0.1), vec3(0.88, 0.9, 0.91), uDaylight);
  cloudColor = mix(cloudColor, vec3(0.9, 0.32, 0.12), uTwilight * 0.42);
  sky = mix(sky, cloudColor, cloud * (0.28 + uDaylight * 0.2));

  gl_FragColor = vec4(sky, 1.0);
}
`;

function ProceduralSky({
  profile,
}: {
  profile: DayNightProfile;
}) {
  const material = useMemo(() => {
    const skyMaterial = new ShaderMaterial({
      uniqueName: "trading-floor-day-night-sky",
      attributes: { aPosition: SEMANTIC_POSITION },
      vertexGLSL: SKY_VERTEX_SHADER,
      fragmentGLSL: SKY_FRAGMENT_SHADER,
    });
    skyMaterial.cull = CULLFACE_FRONT;
    skyMaterial.depthWrite = false;
    skyMaterial.update();
    return skyMaterial;
  }, []);

  useEffect(() => () => material.destroy(), [material]);

  useEffect(() => {
    material.setParameter("uSkyTop", profile.skyTop);
    material.setParameter("uSkyHorizon", profile.skyHorizon);
    material.setParameter("uSkyBottom", profile.skyBottom);
    material.setParameter("uSunDirection", profile.sunDirection);
    material.setParameter("uMoonDirection", profile.moonDirection);
    material.setParameter("uDaylight", profile.daylight);
    material.setParameter("uNight", profile.night);
    material.setParameter("uTwilight", profile.twilight);
    material.setParameter("uTime", profile.phase * 24 * 60);
  }, [material, profile]);

  return (
    <Entity scale={[95, 95, 95]}>
      <Render type="sphere" material={material} />
    </Entity>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function cubeDirection(face: number, x: number, y: number): [number, number, number] {
  const u = (2 * (x + 0.5)) / REFLECTION_FACE_SIZE - 1;
  const v = (2 * (y + 0.5)) / REFLECTION_FACE_SIZE - 1;
  const direction: [number, number, number] =
    face === 0
      ? [1, -v, -u]
      : face === 1
        ? [-1, -v, u]
        : face === 2
          ? [u, 1, v]
          : face === 3
            ? [u, -1, -v]
            : face === 4
              ? [u, -v, 1]
              : [-u, -v, -1];
  const length = Math.hypot(...direction);
  return direction.map((component) => component / length) as [number, number, number];
}

function linearToSrgbByte(value: number): number {
  const linear = Math.max(0, value);
  const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(srgb) * 255);
}

/**
 * A tiny dynamic cubemap used only by reflective materials. Unlike the old
 * daytime HDR, its colors follow the same sun and sky state as the visible
 * procedural sky, so skyscraper glass cannot reflect permanent daylight.
 */
function DynamicReflectionEnvironment({ profile }: { profile: DayNightProfile }) {
  const app = useApp();
  const resource = useMemo(() => {
    const faces = Array.from({ length: 6 }, () => {
      const canvas = document.createElement("canvas");
      canvas.width = REFLECTION_FACE_SIZE;
      canvas.height = REFLECTION_FACE_SIZE;
      return canvas;
    });
    const texture = new Texture(app.graphicsDevice, {
      name: "dynamic-day-night-reflections",
      cubemap: true,
      width: REFLECTION_FACE_SIZE,
      height: REFLECTION_FACE_SIZE,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
      addressU: ADDRESS_CLAMP_TO_EDGE,
      addressV: ADDRESS_CLAMP_TO_EDGE,
      srgb: true,
    });
    return { faces, texture };
  }, [app]);

  useLayoutEffect(() => {
    resource.faces.forEach((canvas, face) => {
      const context = canvas.getContext("2d");
      if (!context) return;
      const image = context.createImageData(REFLECTION_FACE_SIZE, REFLECTION_FACE_SIZE);

      for (let y = 0; y < REFLECTION_FACE_SIZE; y += 1) {
        for (let x = 0; x < REFLECTION_FACE_SIZE; x += 1) {
          const direction = cubeDirection(face, x, y);
          const lowerBlend = smoothstep(-0.38, 0.03, direction[1]);
          const upperBlend = smoothstep(-0.13, 0.34, direction[1]);
          const color = profile.skyBottom.map(
            (channel, index) => channel + (profile.skyHorizon[index] - channel) * lowerBlend,
          );
          for (let channel = 0; channel < 3; channel += 1) {
            color[channel] += (profile.skyTop[channel] - color[channel]) * upperBlend;
          }

          const sunDot =
            direction[0] * profile.sunDirection[0] +
            direction[1] * profile.sunDirection[1] +
            direction[2] * profile.sunDirection[2];
          const sunGlow = Math.max(0, sunDot) ** 70 * (1 - profile.night);
          color[0] += sunGlow * 0.7;
          color[1] += sunGlow * (0.25 + profile.daylight * 0.38);
          color[2] += sunGlow * profile.daylight * 0.35;

          const offset = (y * REFLECTION_FACE_SIZE + x) * 4;
          image.data[offset] = linearToSrgbByte(color[0]);
          image.data[offset + 1] = linearToSrgbByte(color[1]);
          image.data[offset + 2] = linearToSrgbByte(color[2]);
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    });
    resource.texture.setSource(resource.faces);
  }, [profile, resource]);

  useEffect(() => {
    app.scene.skybox = resource.texture;
    return () => {
      if (app.scene.skybox === resource.texture) app.scene.skybox = null;
      resource.texture.destroy();
    };
  }, [app, resource]);

  return null;
}

export function Lighting() {
  const profile = useDayNight();
  const sunRef = useRef<PcEntity | null>(null);
  const moonRef = useRef<PcEntity | null>(null);
  const fixtureMaterial = useMaterial({
    diffuse: "#20252b",
    emissive: "#fff0cf",
    emissiveIntensity: profile.fixtureEmissiveIntensity,
  });
  const ambientLight = useMemo(
    () => new Color(profile.ambient[0], profile.ambient[1], profile.ambient[2]),
    [profile.ambient],
  );

  useEffect(() => {
    const setLightDirection = (entity: PcEntity | null, direction: [number, number, number]) => {
      if (!entity) return;
      const target = new Vec3(...direction).normalize();
      entity.setRotation(new Quat().setFromDirections(Vec3.UP, target));
    };
    setLightDirection(sunRef.current, profile.sunDirection);
    setLightDirection(moonRef.current, profile.moonDirection);
  }, [profile.moonDirection, profile.sunDirection]);

  return (
    <>
      <SceneEnvironment
        ambientLight={ambientLight}
        showSkybox={false}
        skyboxIntensity={profile.environmentIntensity}
        rotation={[0, 160, 0]}
        type="infinite"
      />
      <DynamicReflectionEnvironment profile={profile} />
      <ProceduralSky profile={profile} />

      <Entity ref={sunRef}>
        <Light
          type="directional"
          color={profile.sunColor}
          intensity={profile.sunIntensity}
          castShadows
          shadowResolution={1024}
        />
      </Entity>
      <Entity ref={moonRef}>
        <Light
          type="directional"
          color="#8ca9d8"
          intensity={profile.moonIntensity}
          castShadows={false}
        />
      </Entity>

      {TERMINAL_DOWNLIGHTS.map(({ x, z, shadows }) => (
        <Entity
          key={`terminal-downlight-${x}-${z}`}
          position={[x, ROOM_HEIGHT - 0.18, z]}
        >
          <Entity scale={[1.15, 0.08, 0.42]}>
            <Render type="box" material={fixtureMaterial} />
          </Entity>
          <Light
            type="spot"
            color="#ffe1c2"
            intensity={profile.fixtureIntensity}
            range={15.5}
            innerConeAngle={24}
            outerConeAngle={48}
            falloffMode={LIGHTFALLOFF_LINEAR}
            castShadows={shadows}
            shadowResolution={512}
            shadowBias={0.18}
            normalOffsetBias={0.08}
          />
        </Entity>
      ))}

      {/* Restrained warm wash for the collaborative west wall. */}
      <Entity position={[-11.8, 5.8, -0.8]} rotation={[0, 0, -90]}>
        <Light
          type="spot"
          color="#ffddbd"
          intensity={1.15}
          range={8.5}
          innerConeAngle={28}
          outerConeAngle={52}
          falloffMode={LIGHTFALLOFF_LINEAR}
          castShadows={false}
        />
      </Entity>
    </>
  );
}
