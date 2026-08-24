import { memo, useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useMaterial } from "@playcanvas/react/hooks";
import Konva from "konva";
import {
  FILTER_LINEAR,
  StandardMaterial,
  Texture,
} from "playcanvas";
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_POSITION,
  WHITEBOARD_WIDTH,
  WHITEBOARD_WORLD_HEIGHT,
  WHITEBOARD_WORLD_WIDTH,
  type WhiteboardSnapshot,
} from "@multiplayer/shared";
import { renderWhiteboardLayer } from "../whiteboard/whiteboardRendering";

const BOARD_SIZE: [number, number] = [WHITEBOARD_WORLD_WIDTH, WHITEBOARD_WORLD_HEIGHT];

const WhiteboardFrame = memo(function WhiteboardFrame() {
  const frameMaterial = useMaterial({ diffuse: "#9da39f", metalness: 0.72, gloss: 0.48 });
  const trayMaterial = useMaterial({ diffuse: "#b8bdb9", metalness: 0.78, gloss: 0.52 });
  const blackMarkerMaterial = useMaterial({ diffuse: "#171b19", gloss: 0.28 });
  const blueMarkerMaterial = useMaterial({ diffuse: "#1769aa", gloss: 0.28 });
  const redMarkerMaterial = useMaterial({ diffuse: "#c7352e", gloss: 0.28 });
  const greenMarkerMaterial = useMaterial({ diffuse: "#218653", gloss: 0.28 });
  const purpleMarkerMaterial = useMaterial({ diffuse: "#8b4aa0", gloss: 0.28 });
  const eraserMaterial = useMaterial({ diffuse: "#303734", gloss: 0.12 });

  return (
    <>
      <Entity scale={[0.16, BOARD_SIZE[1] + 0.28, BOARD_SIZE[0] + 0.28]}>
        <Render type="box" material={frameMaterial} />
      </Entity>
      <Entity position={[0.29, -2.08, 0]} scale={[0.42, 0.1, BOARD_SIZE[0] - 0.2]}>
        <Render type="box" material={trayMaterial} />
      </Entity>
      {[
        { z: -1.1, material: blackMarkerMaterial },
        { z: -0.55, material: blueMarkerMaterial },
        { z: 0, material: redMarkerMaterial },
        { z: 0.55, material: greenMarkerMaterial },
        { z: 1.1, material: purpleMarkerMaterial },
      ].map(({ z, material }) => (
        <Entity
          key={z}
          position={[0.31, -2.005, z]}
          rotation={[90, 0, 0]}
          scale={[0.045, 0.34, 0.045]}
        >
          <Render type="cylinder" material={material} />
        </Entity>
      ))}
      <Entity position={[0.31, -1.97, 1.75]} scale={[0.14, 0.12, 0.34]}>
        <Render type="box" material={eraserMaterial} />
      </Entity>
    </>
  );
});

export function CollaborativeWhiteboardDisplay({ snapshot }: { snapshot: WhiteboardSnapshot }) {
  const app = useApp();
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const [screenMaterial, setScreenMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    document.body.appendChild(container);

    const stage = new Konva.Stage({ container, width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
    const layer = new Konva.Layer({ listening: false });
    stage.add(layer);
    stageRef.current = stage;
    layerRef.current = layer;

    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = WHITEBOARD_HEIGHT;
    rotatedCanvas.height = WHITEBOARD_WIDTH;
    rotatedCanvasRef.current = rotatedCanvas;

    const texture = new Texture(app.graphicsDevice, {
      name: "collaborative-analysis-board",
      width: WHITEBOARD_HEIGHT,
      height: WHITEBOARD_WIDTH,
      mipmaps: false,
      minFilter: FILTER_LINEAR,
      magFilter: FILTER_LINEAR,
    });
    texture.setSource(rotatedCanvas);
    textureRef.current = texture;

    const material = new StandardMaterial();
    material.diffuse.set(1, 1, 1);
    material.emissive.set(1, 1, 1);
    material.emissiveIntensity = 0.18;
    material.diffuseMap = texture;
    material.emissiveMap = texture;
    material.depthBias = -0.1;
    material.update();
    setScreenMaterial(material);

    return () => {
      setScreenMaterial(null);
      material.destroy();
      texture.destroy();
      stage.destroy();
      container.remove();
      stageRef.current = null;
      layerRef.current = null;
      rotatedCanvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  useEffect(() => {
    const stage = stageRef.current;
    const layer = layerRef.current;
    const rotatedCanvas = rotatedCanvasRef.current;
    const texture = textureRef.current;
    if (!stage || !layer || !rotatedCanvas || !texture) return;

    renderWhiteboardLayer(layer, snapshot.shapes);
    const landscapeCanvas = stage.toCanvas({ pixelRatio: 1 });
    const context = rotatedCanvas.getContext("2d");
    if (!context) return;
    context.resetTransform();
    context.clearRect(0, 0, rotatedCanvas.width, rotatedCanvas.height);
    context.translate(0, WHITEBOARD_WIDTH);
    context.rotate(-Math.PI / 2);
    context.drawImage(landscapeCanvas, 0, 0);
    texture.upload();
  }, [snapshot]);

  return (
    <Entity position={[WHITEBOARD_POSITION.x, WHITEBOARD_POSITION.y, WHITEBOARD_POSITION.z]}>
      <WhiteboardFrame />
      {screenMaterial && (
        <Entity
          position={[0.13, 0, 0]}
          rotation={[0, 0, -90]}
          scale={[BOARD_SIZE[1], 1, BOARD_SIZE[0]]}
        >
          <Render type="plane" material={screenMaterial} />
        </Entity>
      )}
    </Entity>
  );
}
