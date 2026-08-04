import { describe, expect, it } from "vitest";
import { collectReferencedEditorAssetIds } from "./editorSceneAssets";

describe("collectReferencedEditorAssetIds", () => {
  it("includes scene assets and transitive dependencies but excludes unused exports", () => {
    const assets = {
      "10": { id: "10", type: "container", data: { material: 20 } },
      "20": { id: "20", type: "material", data: { diffuseMap: 30 } },
      "30": { id: "30", type: "texture" },
      "40": { id: "40", type: "texture", name: "unused 4K panorama" },
    };
    const scene = {
      entities: {
        desk: { components: { render: { asset: 10 } } },
      },
    };

    expect([...collectReferencedEditorAssetIds(scene, assets)].sort()).toEqual([
      10, 20, 30,
    ]);
  });
});
