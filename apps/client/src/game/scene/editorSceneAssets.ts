interface EditorAssetEntry {
  id?: string | number;
  [key: string]: unknown;
}

function collectKnownAssetReferences(
  value: unknown,
  knownAssetIds: ReadonlySet<number>,
  output: Set<number>,
): void {
  if (typeof value === "number") {
    if (knownAssetIds.has(value)) output.add(value);
    return;
  }
  if (typeof value === "string") {
    const numericId = /^\d+$/.test(value) ? Number(value) : NaN;
    if (knownAssetIds.has(numericId)) output.add(numericId);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKnownAssetReferences(item, knownAssetIds, output);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) {
    collectKnownAssetReferences(nested, knownAssetIds, output);
  }
}

/**
 * Finds assets used by the hierarchy/settings, then follows asset-to-asset
 * references (materials → textures, templates → containers, cubemaps →
 * faces). Editor exports often mark every source file as preload, including
 * large panoramas that are not actually present in the scene. The caller can
 * then avoid registering those exports altogether, preventing AssetRegistry
 * from starting their preload implicitly when they are added.
 */
export function collectReferencedEditorAssetIds(
  sceneData: unknown,
  assetMap: Record<string, EditorAssetEntry>,
): Set<number> {
  const knownAssetIds = new Set(
    Object.keys(assetMap)
      .map(Number)
      .filter(Number.isFinite),
  );
  const referenced = new Set<number>();
  collectKnownAssetReferences(sceneData, knownAssetIds, referenced);

  const pending = [...referenced];
  while (pending.length > 0) {
    const assetId = pending.pop()!;
    const dependencies = new Set<number>();
    collectKnownAssetReferences(assetMap[String(assetId)], knownAssetIds, dependencies);
    for (const dependencyId of dependencies) {
      if (referenced.has(dependencyId)) continue;
      referenced.add(dependencyId);
      pending.push(dependencyId);
    }
  }

  return referenced;
}
