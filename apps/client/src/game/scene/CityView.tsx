import { useEffect, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial, useTexture } from "@playcanvas/react/hooks";
import { ADDRESS_REPEAT, CULLFACE_NONE, FILTER_LINEAR_MIPMAP_LINEAR, StandardMaterial, Texture, type Asset, type Texture as PcTexture } from "playcanvas";
import { VisualBox, VisualCylinder } from "./primitives";

type TowerVariant = "A" | "B" | "C" | "D";
interface BuildingSpec { variant: TowerVariant; x: number; z: number; width: number; depth: number; height: number; rotation: number }

const EXTERIOR_GRADE_Y = -55;
const BUILDINGS: BuildingSpec[] = [
  { variant: "A", x: -13.5, z: -38, width: 10.5, depth: 10, height: 132, rotation: -8 },
  { variant: "B", x: 13, z: -57, width: 12, depth: 11, height: 148, rotation: 11 },
  { variant: "C", x: -4, z: -82, width: 18, depth: 12, height: 126, rotation: -5 },
  { variant: "D", x: 25, z: -118, width: 9, depth: 9, height: 166, rotation: 13 },
];

function textureOf(asset: Asset | null): PcTexture | undefined {
  return (asset?.resource as PcTexture | undefined) ?? undefined;
}

/** Recreates the crisp blue-purple facade graphics from the supplied screenshot. */
function useGraphicFacadeMaterial(variant: TowerVariant): StandardMaterial | null {
  const app = useApp();
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return;

    const palettes: Record<TowerVariant, { body: string; grid: string; lit: string; dim: string }> = {
      A: { body: "#17152f", grid: "#292444", lit: "#c8b9aa", dim: "#706978" },
      B: { body: "#201c3a", grid: "#332d50", lit: "#cfc0ad", dim: "#777083" },
      C: { body: "#171932", grid: "#282b4a", lit: "#c3b8aa", dim: "#696a78" },
      D: { body: "#121329", grid: "#242440", lit: "#d1c1ad", dim: "#716979" },
    };
    const palette = palettes[variant];
    const columns = variant === "C" ? 10 : variant === "D" ? 7 : 8;
    const rows = variant === "B" ? 18 : 21;
    const cellWidth = canvas.width / columns;
    const cellHeight = canvas.height / rows;

    context.fillStyle = palette.grid;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row += 1) {
      const floorGroup = (row * 3 + variant.charCodeAt(0)) % 7;
      for (let column = 0; column < columns; column += 1) {
        const group = (Math.floor(column / 2) + floorGroup) % 6;
        context.fillStyle = group < 2 ? palette.lit : group === 2 ? palette.dim : palette.body;
        const insetX = variant === "D" ? 4 : 5;
        context.fillRect(
          column * cellWidth + insetX,
          row * cellHeight + 5,
          cellWidth - insetX * 2,
          cellHeight - 9,
        );
      }
    }

    const facadeTexture = new Texture(app.graphicsDevice, {
      name: `graphic-city-facade-${variant}`,
      width: canvas.width,
      height: canvas.height,
      mipmaps: true,
      minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
      addressU: ADDRESS_REPEAT,
      addressV: ADDRESS_REPEAT,
      srgb: true,
    });
    facadeTexture.setSource(canvas);
    facadeTexture.upload();

    const facadeMaterial = new StandardMaterial();
    facadeMaterial.name = `graphic-city-facade-${variant}`;
    facadeMaterial.diffuse.set(1, 1, 1);
    facadeMaterial.diffuseMap = facadeTexture;
    facadeMaterial.diffuseMapTiling.set(variant === "C" ? 2 : 1.5, variant === "B" ? 7 : 8);
    facadeMaterial.emissive.set(0.88, 0.82, 0.76);
    facadeMaterial.emissiveMap = facadeTexture;
    facadeMaterial.emissiveMapTiling.copy(facadeMaterial.diffuseMapTiling);
    facadeMaterial.emissiveIntensity = 0.32;
    facadeMaterial.metalness = 0.06;
    facadeMaterial.gloss = 0.32;
    facadeMaterial.update();
    setMaterial(facadeMaterial);

    return () => {
      setMaterial(null);
      facadeMaterial.destroy();
      facadeTexture.destroy();
    };
  }, [app, variant]);

  return material;
}

function Tower({ building, facade, trim, roof }: {
  building: BuildingSpec;
  facade: StandardMaterial;
  trim: ReturnType<typeof useMaterial>;
  roof: ReturnType<typeof useMaterial>;
}) {
  const setback = building.variant === "B";
  const mainHeight = setback ? building.height * 0.82 : building.height;
  const mainY = setback ? -building.height * 0.09 : 0;
  return (
    <Entity position={[building.x, EXTERIOR_GRADE_Y + building.height / 2, building.z]} rotation={[0, building.rotation, 0]}>
      <VisualBox position={[0, mainY, 0]} size={[building.width, mainHeight, building.depth]} material={facade} />
      {setback && <VisualBox position={[0, building.height * 0.41, 0]} size={[building.width * 0.72, building.height * 0.18, building.depth * 0.74]} material={facade} />}
      {[-0.42, 0, 0.42].map((factor) => (
        <VisualBox key={`${building.variant}-column-${factor}`} position={[building.width * factor, mainY, building.depth / 2 + 0.08]} size={[0.18, mainHeight, 0.18]} material={trim} />
      ))}
      <VisualBox position={[0, building.height / 2 + 0.5, 0]} size={[building.width * 0.76, 1, building.depth * 0.76]} material={roof} />
      <VisualBox position={[building.width * 0.14, building.height / 2 + 2, 0]} size={[building.width * 0.32, 3, building.depth * 0.34]} material={roof} />
      {building.variant === "D" && <VisualCylinder position={[0, building.height / 2 + 5, 0]} radius={0.08} height={8} material={roof} />}
    </Entity>
  );
}

export function CityView() {
  const facades = {
    A: useGraphicFacadeMaterial("A"),
    B: useGraphicFacadeMaterial("B"),
    C: useGraphicFacadeMaterial("C"),
    D: useGraphicFacadeMaterial("D"),
  };
  const { asset: skylineTexture } = useTexture("/assets/city/blue-hour-skyline.png");
  const skylineMaterial = useMaterial({ diffuseMap: textureOf(skylineTexture), emissiveMap: textureOf(skylineTexture), emissive: "#9daac0", emissiveIntensity: 0.72, diffuse: "#8291aa", gloss: 0, metalness: 0, cull: CULLFACE_NONE, twoSidedLighting: true });
  const trimMaterial = useMaterial({ diffuse: "#0d0e18", metalness: 0.28, gloss: 0.22 });
  const roofMaterial = useMaterial({ diffuse: "#111320", gloss: 0.12, metalness: 0.1 });

  return (
    <>
      <Entity position={[0, 28, -185]} rotation={[90, 0, 0]} scale={[420, 1, 168]}>
        <Render type="plane" material={skylineMaterial} />
      </Entity>
      {BUILDINGS.map((building) => {
        const facade = facades[building.variant];
        return facade ? <Tower key={building.variant} building={building} facade={facade} trim={trimMaterial} roof={roofMaterial} /> : null;
      })}
    </>
  );
}
