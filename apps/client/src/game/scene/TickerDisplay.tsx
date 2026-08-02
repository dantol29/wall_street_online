import { useEffect, useRef, useState } from "react";
import { Entity } from "@playcanvas/react";
import { Render } from "@playcanvas/react/components";
import { useApp, useAppEvent, useMaterial } from "@playcanvas/react/hooks";
import { ADDRESS_REPEAT, FILTER_NEAREST, StandardMaterial, Texture } from "playcanvas";
import { TICKER_PANEL_POSITION, TICKER_SIZE, TICKER_TEXT } from "./tradingFloorLayout";

/**
 * Deliberately low-resolution canvas (a real dot-matrix board is maybe
 * 100-ish dots tall, not thousands of smooth-font pixels) combined with
 * `FILTER_NEAREST` (nearest-neighbor, not bilinear) magnification — the
 * texture gets blown up onto the sign with hard, blocky pixel edges instead
 * of smooth anti-aliased type, which is what actually reads as "80s LED
 * dot-matrix" rather than "modern LCD/OLED with a monospace font." Sized to
 * match TICKER_SIZE's 15:1 aspect (enlarged from the original brief's 6.5m
 * ticker per explicit follow-up feedback — "make it bigger").
 */
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 80;
const FONT = `bold 23px "Courier New", monospace`;
const SCROLL_SPEED_PX_PER_SEC = 120;
/** 30Hz keeps the brisk crawl smooth without uploading the canvas every render frame. */
const REDRAW_INTERVAL_SECONDS = 1 / 30;

/** 80s-exchange LED palette: near-black background, orange-red main text, green gains, red losses. No blue, no gradients. */
const BACKGROUND_COLOR = "#050505";
const TEXT_COLOR = "#ff5a1f";
const POSITIVE_COLOR = "#33ff33";
const NEGATIVE_COLOR = "#ff2020";

function colorForCharacter(character: string): string {
  if (character === "▲") return POSITIVE_COLOR;
  if (character === "▼") return NEGATIVE_COLOR;
  return TEXT_COLOR;
}

/**
 * The market ticker as a real in-scene asset with dynamic text, not an HTML
 * overlay: text is drawn onto an offscreen 2D canvas (scrolled by an
 * increasing x-offset, wrapping seamlessly once a full copy of the text has
 * passed) and that canvas is fed into PlayCanvas as a live `Texture` source
 * via `setSource`/`upload()`. The texture is used as the panel material's
 * `emissiveMap` (with a black diffuse) — per the brief, the ticker is the
 * *only* glowing element in this assembly (the clock panel below it is lit
 * normally, not emissive — see WorldClockDisplay).
 */
export function TickerDisplay() {
  const app = useApp();
  const casingMaterial = useMaterial({ diffuse: "#050505", gloss: 0.28, metalness: 0.45 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const scrollXRef = useRef(0);
  const textWidthRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const [material, setMaterial] = useState<StandardMaterial | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = FONT;
    textWidthRef.current = ctx.measureText(TICKER_TEXT).width;
    canvasRef.current = canvas;

    const texture = new Texture(app.graphicsDevice, {
      name: "ticker-canvas",
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      mipmaps: false,
      addressU: ADDRESS_REPEAT,
      addressV: ADDRESS_REPEAT,
      minFilter: FILTER_NEAREST,
      magFilter: FILTER_NEAREST,
    });
    texture.setSource(canvas);
    textureRef.current = texture;

    const ticketMaterial = new StandardMaterial();
    ticketMaterial.diffuse.set(0, 0, 0);
    ticketMaterial.emissiveMap = texture;
    ticketMaterial.emissive.set(1, 1, 1);
    ticketMaterial.emissiveIntensity = 1.2;
    ticketMaterial.update();
    setMaterial(ticketMaterial);

    return () => {
      ticketMaterial.destroy();
      texture.destroy();
      canvasRef.current = null;
      textureRef.current = null;
    };
  }, [app]);

  useAppEvent("update", (dt) => {
    elapsedSecondsRef.current += dt;
    if (elapsedSecondsRef.current < REDRAW_INTERVAL_SECONDS) return;
    const elapsed = elapsedSecondsRef.current;
    elapsedSecondsRef.current = 0;

    const canvas = canvasRef.current;
    const texture = textureRef.current;
    const textWidth = textWidthRef.current;
    if (!canvas || !texture || textWidth <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    scrollXRef.current = (scrollXRef.current + SCROLL_SPEED_PX_PER_SEC * elapsed) % textWidth;

    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    const y = canvas.height / 2;
    for (let start = -scrollXRef.current; start < canvas.width; start += textWidth) {
      // Drawn character-by-character (Courier New is monospace, so measuring
      // per character is exact) so the ▲/▼ arrows can be colored green/red
      // against the otherwise orange-red LED text.
      let x = start;
      for (const character of TICKER_TEXT) {
        ctx.fillStyle = colorForCharacter(character);
        ctx.fillText(character, x, y);
        x += ctx.measureText(character).width;
      }
    }

    texture.upload();
  });

  return (
    <Entity position={TICKER_PANEL_POSITION}>
      {/* Plain steel casing prevents the LED texture repeating onto the top, bottom, and ends. */}
      <Entity scale={TICKER_SIZE}>
        <Render type="box" material={casingMaterial} />
      </Entity>

      {/* Dedicated screens on the two vertical faces only. */}
      {material && (
        <>
          <Entity
            position={[0, 0, TICKER_SIZE[2] / 2 + 0.006]}
            rotation={[90, 0, 0]}
            scale={[TICKER_SIZE[0], 1, TICKER_SIZE[1]]}
          >
            <Render type="plane" material={material} />
          </Entity>
          <Entity
            position={[0, 0, -TICKER_SIZE[2] / 2 - 0.006]}
            rotation={[-90, 180, 0]}
            scale={[TICKER_SIZE[0], 1, TICKER_SIZE[1]]}
          >
            <Render type="plane" material={material} />
          </Entity>
        </>
      )}
    </Entity>
  );
}
