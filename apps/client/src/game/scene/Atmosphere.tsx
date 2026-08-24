import { useEffect } from "react";
import { useApp } from "@playcanvas/react/hooks";
import {
  CameraFrame,
  Color,
  SSAOTYPE_LIGHTING,
  TONEMAP_NEUTRAL,
  type CameraComponent,
} from "playcanvas";

/**
 * Configures the modern CameraFrame pipeline for a restrained trading floor.
 * The effect keeps faces, avatars, names, and market UI legible while adding just
 * enough contrast, bloom, and contact shadowing to make the room feel premium.
 */
export function TradingFloorCameraFrame({ camera }: { camera: CameraComponent }) {
  const app = useApp();

  useEffect(() => {
    const frame = new CameraFrame(app, camera);

    frame.rendering.toneMapping = TONEMAP_NEUTRAL;
    frame.rendering.samples = 2;
    frame.rendering.sharpness = 0.35;
    // Dynamic-refraction materials sample the already-rendered scene through
    // uSceneColorMap. CameraFrame replaces the legacy grab-pass script, but it
    // only creates that texture when this option is explicitly enabled.
    frame.rendering.sceneColorMap = true;

    frame.ssao.type = SSAOTYPE_LIGHTING;
    frame.ssao.intensity = 0.2;
    frame.ssao.radius = 9;
    frame.ssao.samples = 8;
    frame.ssao.power = 3;

    frame.bloom.intensity = 0.01;
    frame.bloom.blurLevel = 5;

    frame.grading.enabled = true;
    frame.grading.brightness = 1.02;
    frame.grading.contrast = 1.05;
    frame.grading.saturation = 1.01;
    frame.grading.tint = new Color(1, 0.99, 0.97);

    frame.colorEnhance.enabled = true;
    frame.colorEnhance.shadows = 0.15;
    frame.colorEnhance.highlights = -0.08;
    frame.colorEnhance.vibrance = 0.03;
    frame.colorEnhance.midtones = 0.01;
    frame.colorEnhance.dehaze = 0.04;

    frame.vignette.intensity = 0.08;
    frame.vignette.inner = 0.76;
    frame.vignette.outer = 1.1;
    frame.vignette.curvature = 1.15;
    frame.vignette.color = new Color(0.03, 0.04, 0.06);

    // Keep the image clean and spatially stable during first-person movement.
    frame.fringing.intensity = 0;
    frame.update();

    return () => frame.destroy();
  }, [app, camera]);

  return null;
}
