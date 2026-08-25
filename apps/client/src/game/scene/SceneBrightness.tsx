import { useEffect } from "react";
import { useApp } from "@playcanvas/react/hooks";

export function SceneBrightness({ exposure }: { exposure: number }) {
  const app = useApp();

  useEffect(() => {
    app.scene.exposure = exposure;
  }, [app, exposure]);

  return null;
}

