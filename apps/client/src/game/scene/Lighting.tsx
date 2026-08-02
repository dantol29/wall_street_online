import { Entity } from "@playcanvas/react";
import { Environment as SceneEnvironment, Light, Render } from "@playcanvas/react/components";
import { useMaterial, useTexture } from "@playcanvas/react/hooks";
import { Color, LIGHTFALLOFF_LINEAR } from "playcanvas";

const CEILING_Y = 7.5;
const LIGHT_ROW_X = [-8, -4, 0, 4, 8];

/**
 * A muted, warm base tone — design.md calls for "warm indoor light... avoid
 * green/purple lighting, avoid pitch-black corners" for the 1980s trading-floor
 * mood. This alone can't shade geometry (PlayCanvas's `ambientLight` is a flat,
 * direction-less fill — every surface gets the exact same tint regardless of
 * its normal), so it's intentionally dim; the directional fill light below is
 * what actually gives walls/floor/character a light-to-dark gradient instead
 * of looking like flat-shaded cardboard.
 */
const AMBIENT_LIGHT_COLOR = new Color().fromString("#4a4238");

/**
 * Five rectangular light fixtures hanging near the ceiling, each casting a warm
 * omni light, plus one dim directional "skylight" fill for actual normal-based
 * shading gradient, and a muted ambient floor so nothing goes fully black. This
 * combination is kept alongside the daytime HDR skybox so the room remains
 * readable with post effects disabled while the exterior still supplies a
 * clear New York daytime atmosphere. The same soft directional fill and local practical lights are
 * PlayCanvas's own recommended baseline (per the lighting docs) for a scene that
 * isn't relying on lightmaps or an environment/IBL probe.
 */
export function Lighting() {
  const fixtureMaterial = useMaterial({ diffuse: "#20252b", emissive: "#fff0cf", emissiveIntensity: 4.5 });
  // Use a tonemapped equirectangular JPG for browser compatibility. The
  // daytime sky is paired with the NYC panorama backdrop rendered through the
  // windows in RoomEnvironment.
  const { asset: daytimeSkybox } = useTexture("/assets/kloofendal-48d-partly-cloudy-puresky.jpg");

  return (
    <>
      <SceneEnvironment
        ambientLight={AMBIENT_LIGHT_COLOR}
        skybox={daytimeSkybox}
        skyboxIntensity={0.85}
        rotation={[0, 160, 0]}
        type="infinite"
      />

      {/*
        Warm, low-angle "golden hour" directional light standing in for late-
        afternoon sun pouring through the north-wall windows. PlayCanvas
        directional lights shine along the entity's local -Y axis (confirmed in
        engine source: `forward-renderer.js` builds `light._direction` from
        `wtm.getY(...).mulScalar(-1)`, NOT the more commonly-assumed -Z/"forward"
        axis) — this rotation was chosen so that direction vector points mostly
        toward +Z (from the windows at z=-12.5 toward the entrance at z=+12.5)
        with a ~22° downward tilt, so light visibly travels from the windows,
        across the central pit, toward the entrance: bright near the windows,
        long soft shadows trailing south, naturally drawing the eye toward the
        pit along the way. The only shadow-casting light in the scene (well
        under the "max 2 dynamic shadow-casting lights" budget).
      */}
      <Entity rotation={[68, 165, 0]}>
        <Light type="directional" color="#ffb870" intensity={0.65} castShadows shadowResolution={1024} />
      </Entity>

      {LIGHT_ROW_X.map((x) => (
        <Entity key={`light-fixture-${x}`} position={[x, CEILING_Y - 0.15, 0]}>
          <Entity scale={[1.5, 0.1, 0.5]}>
            <Render type="box" material={fixtureMaterial} />
          </Entity>
          {/*
            Range covers the room's full ~16m center-to-corner distance with
            headroom. Falloff is LINEAR rather than the engine default
            (inverse-squared) — inverse-squared piles up into a very harsh, tiny
            hotspot directly under each fixture with a steep drop to darkness a
            few meters out; linear spreads the same light more evenly across the
            room, which reads much better with only 5 fixtures over 500m².
          */}
          <Light type="omni" color="#ffe0ad" intensity={1.8} range={25} falloffMode={LIGHTFALLOFF_LINEAR} castShadows={false} />
        </Entity>
      ))}
    </>
  );
}
