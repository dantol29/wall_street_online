import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Entity } from "@playcanvas/react";
import { Environment as SceneEnvironment, Light, Render } from "@playcanvas/react/components";
import { useApp } from "@playcanvas/react/hooks";
import {
  ADDRESS_CLAMP_TO_EDGE,
  Color,
  CULLFACE_FRONT,
  FILTER_LINEAR,
  FOG_LINEAR,
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

const REFLECTION_FACE_SIZE = 64;

// Three separated pools per cardinal aisle. The final fixture sits just inside
// the concealed perimeter, so fog turns it into a faint long-distance marker.
const WALKWAY_LIGHT_POOLS = [
  { id: "north-inner", x: 0, z: -8, intensity: 2.2, outerCone: 15 },
  { id: "north-middle", x: 0, z: -14.5, intensity: 1.85, outerCone: 14.5 },
  { id: "north-outer", x: 0, z: -21, intensity: 1.55, outerCone: 14 },
  { id: "north-far", x: 0, z: -27.5, intensity: 1.25, outerCone: 13.5 },
  { id: "north-horizon", x: 0, z: -34, intensity: 1.05, outerCone: 13 },
  { id: "east-inner", x: 8, z: 0, intensity: 2.05, outerCone: 14.5 },
  { id: "east-middle", x: 14.5, z: 0, intensity: 1.75, outerCone: 14 },
  { id: "east-outer", x: 21, z: 0, intensity: 1.45, outerCone: 13.5 },
  { id: "east-far", x: 27.5, z: 0, intensity: 1.2, outerCone: 13.5 },
  { id: "east-horizon", x: 34, z: 0, intensity: 1, outerCone: 13 },
  { id: "south-inner", x: 0, z: 8, intensity: 2.15, outerCone: 15 },
  { id: "south-middle", x: 0, z: 14.5, intensity: 1.8, outerCone: 14.5 },
  { id: "south-outer", x: 0, z: 21, intensity: 1.5, outerCone: 14 },
  { id: "south-far", x: 0, z: 27.5, intensity: 1.22, outerCone: 13.5 },
  { id: "south-horizon", x: 0, z: 34, intensity: 1.02, outerCone: 13 },
  { id: "west-inner", x: -8, z: 0, intensity: 2, outerCone: 14.5 },
  { id: "west-middle", x: -14.5, z: 0, intensity: 1.7, outerCone: 14 },
  { id: "west-outer", x: -21, z: 0, intensity: 1.4, outerCone: 13.5 },
  { id: "west-far", x: -27.5, z: 0, intensity: 1.15, outerCone: 13.5 },
  { id: "west-horizon", x: -34, z: 0, intensity: 0.98, outerCone: 13 },
] as const;

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

function LaunchStageLight({
  position,
  target,
}: {
  position: [number, number, number];
  target: [number, number, number];
}) {
  const fixtureRef = useRef<PcEntity | null>(null);

  useLayoutEffect(() => {
    const fixture = fixtureRef.current;
    if (!fixture) return;
    const direction = new Vec3(
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ).normalize();
    fixture.setRotation(new Quat().setFromDirections(new Vec3(0, -1, 0), direction));
  }, [position, target]);

  return (
    <Entity ref={fixtureRef} position={position}>
      <Light
        type="spot"
        color="#ffe0c2"
        intensity={1.35}
        range={14}
        innerConeAngle={14}
        outerConeAngle={29}
        falloffMode={LIGHTFALLOFF_LINEAR}
        castShadows={false}
      />
    </Entity>
  );
}

export function Lighting() {
  const app = useApp();
  const profile = useDayNight();
  const sunRef = useRef<PcEntity | null>(null);
  const moonRef = useRef<PcEntity | null>(null);
  const ambientLight = useMemo(
    () => new Color(profile.ambient[0], profile.ambient[1], profile.ambient[2]),
    [profile.ambient],
  );

  useEffect(() => {
    const scene = app.scene;
    const previous = {
      type: scene.fog.type,
      color: scene.fogColor.clone(),
      start: scene.fogStart,
      end: scene.fogEnd,
    };
    scene.fog.type = FOG_LINEAR;
    scene.fogColor.set(0.006, 0.009, 0.014);
    // Keep the complete first ring readable from spawn. The haze begins just
    // beyond it, then progressively consumes the outer market and perimeter.
    scene.fogStart = 11;
    scene.fogEnd = 38;
    return () => {
      scene.fog.type = previous.type;
      scene.fogColor.copy(previous.color);
      scene.fogStart = previous.start;
      scene.fogEnd = previous.end;
    };
  }, [app]);

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

      {/* Starting-value stage-style lighting: four focused, invisible sources.
          Pass when the platform reads as the focal
          point without washing out the monitor or creating hard light rings. */}
      {[
        { position: [-1.8, ROOM_HEIGHT - 0.2, -0.9], target: [-0.5, 0.25, -0.35] },
        { position: [1.8, ROOM_HEIGHT - 0.2, -0.9], target: [0.5, 0.25, -0.35] },
        { position: [0, ROOM_HEIGHT - 0.2, 1.55], target: [0, 0.25, 0.15] },
      ].map(({ position, target }) => (
        <LaunchStageLight
          key={`launch-stage-${position.join("-")}`}
          position={position as [number, number, number]}
          target={target as [number, number, number]}
        />
      ))}

      {/* A single cheap fill source carries enough warm light from the launch
          island to reveal Ring 1 without flattening the outer market. */}
      <Entity position={[0, 3.6, 0]}>
        <Light
          type="omni"
          color="#f4d5b7"
          intensity={0.38}
          range={12.5}
          falloffMode={LIGHTFALLOFF_LINEAR}
          castShadows={false}
        />
      </Entity>

      {/* Navigation light and market activity remain separate systems. These
          narrow, soft-edged spots touch only short stretches of the four main
          radial aisles; terminal screens continue to provide their own glow. */}
      {WALKWAY_LIGHT_POOLS.map(({ id, x, z, intensity, outerCone }) => (
        <Entity key={id} position={[x, ROOM_HEIGHT - 0.18, z]}>
          <Light
            type="spot"
            color="#f0d6bd"
            intensity={intensity}
            range={15.5}
            innerConeAngle={8}
            outerConeAngle={outerCone}
            falloffMode={LIGHTFALLOFF_LINEAR}
            castShadows={false}
          />
        </Entity>
      ))}

      {/* Restrained warm wash for the collaborative west wall. */}
      <Entity position={[-20.2, 5.8, -0.8]} rotation={[0, 0, -90]}>
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
