import { useEffect } from "react";
import { useApp } from "@playcanvas/react/hooks";
import {
  CameraFrame,
  Color,
  SSAOTYPE_NONE,
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
    const previousExposure = app.scene.exposure;

    // Neutral mapping keeps the authored lighting levels readable without the
    // stronger midtone compression introduced by ACES.
    frame.rendering.toneMapping = TONEMAP_NEUTRAL;
    frame.rendering.samples = 2;
    frame.rendering.sharpness = 0;
    frame.rendering.sceneColorMap = false;
    app.scene.exposure = 1.05;

    frame.ssao.type = SSAOTYPE_NONE;

    frame.bloom.intensity = 0.008;
    frame.bloom.blurLevel = 4;

    frame.grading.enabled = true;
    frame.grading.brightness = 1;
    frame.grading.contrast = 1.025;
    frame.grading.saturation = 0.93;
    frame.grading.tint = new Color(1, 0.995, 0.975);

    frame.colorEnhance.enabled = true;
    frame.colorEnhance.shadows = 0.08;
    frame.colorEnhance.highlights = -0.03;
    frame.colorEnhance.vibrance = 0.015;
    frame.colorEnhance.midtones = 0;
    frame.colorEnhance.dehaze = 0;

    frame.vignette.intensity = 0;

    // Keep the image clean and spatially stable during first-person movement.
    frame.fringing.intensity = 0;
    frame.update();

    return () => {
      app.scene.exposure = previousExposure;
      frame.destroy();
    };
  }, [app, camera]);

  return null;
}
