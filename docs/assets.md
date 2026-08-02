# Asset tracking

Every non-primitive asset bundled into the client, per `design.md` §14. Everything
else in the scene (walls, floor, ceiling, the trading-pit platform, plants,
and the market ticker
panels, window frame/mullions) is plain PlayCanvas primitive geometry
(`box`/`cylinder`/`sphere`/`cone`) declared directly in
`apps/client/src/game/scene/Environment.tsx` — no external model, so nothing
to track for those.

| Asset | Source | License | Author | Original URL | Local path |
|---|---|---|---|---|---|
| Business Man (character) | poly.pizza | CC0 | Quaternius | https://poly.pizza/m/JFrLIKqvCH | `apps/client/public/assets/BusinessMan.glb` |
| Analog clock (world clocks) | poly.pizza | **CC-BY 3.0** (attribution required — see README Credits) | Poly by Google | https://poly.pizza/m/5gAoMR2YHs3 | `apps/client/public/assets/AnalogClock.glb` |
| Low Poly Skyscrapers | Sketchfab | **CC-BY 4.0** (author attribution required) | exleute | https://sketchfab.com/3d-models/low-poly-skyscrapers-4d51f4281a8649528569021411820d28 | `apps/client/public/assets/low-poly-skyscrapers.glb` |
| Concrete Wall 009 (diffuse+normal) | Poly Haven | CC0 | Poly Haven | https://polyhaven.com/a/concrete_wall_009 | `apps/client/public/assets/textures/concrete_wall_diff_2k.jpg`, `concrete_wall_nor_2k.jpg` — smooth cast-concrete wall texture, genuinely grey (replaced the earlier "Painted Plaster Wall" texture, which required a heavy tint to fight its neutral-cream base color and still didn't read as plainly grey) |
| Granite Tile (diffuse+normal) | Poly Haven | CC0 | Poly Haven | https://polyhaven.com/a/granite_tile | `apps/client/public/assets/textures/granite_tile_diff_2k.jpg`, `granite_tile_nor_2k.jpg` — floor, dark blue-grey granite tile with neat grout lines, given a light near-neutral lift and a moderate polish (per explicit user request; replaced the earlier "Grey Tiles" texture) |
| Kloofendal 48d Partly Cloudy Pure Sky skybox (tonemapped equirectangular JPG) | Poly Haven | CC0 | Greg Zaal and Jarod Guest | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | `apps/client/public/assets/kloofendal-48d-partly-cloudy-puresky.jpg` |
| Ceiling grid (coffered drop-ceiling panel texture) | Generated for this project (Python/Pillow script, not a downloaded asset) — no suitable suspended-ceiling-tile texture was found on Poly Haven | N/A — original work, no attribution needed | — | — | `apps/client/public/assets/textures/ceiling_grid.jpg` |
| Office Pack selection (trading desk, computer screen, keyboard, mouse, desk light, chair, desk phone, filing cabinet, coat rack, trash bin, paper stacks, printer, water cooler) | User-supplied local `Office Pack-glb` directory | **License/provenance not included with the supplied folder; verify before public distribution** | Unknown | Local user asset | `apps/client/public/assets/office/*.glb` |

## Not sourced

Two `design.md`/earlier-request asset packs were identified but not downloaded,
since both gate their actual download behind a session/checkout flow rather
than a plain static link (scripting around either would mean impersonating a
browser session or a purchase flow):

- mastjie's "Low poly household goods" (itch.io) — would have covered
  filing cabinets, phones, calculators, folders, etc. (currently primitive
  box placeholders).
- RetroBlockStudio's "Retro Office Pack" (itch.io) — same category, "pay what
  you want, $0 allowed" checkout.

Download them manually in a browser and drop the files under
`apps/client/public/assets/` (updating `Environment.tsx` and this table) if
you want the real models in place of the placeholder boxes.

## Rejected source

`ShareTextures.com` (originally requested for the wall/floor textures) was
rejected: its license page explicitly prohibits bundling downloaded files into
an app/website, despite the textures themselves being described as CC0-based —
that's a platform distribution restriction, not a content license, and
shipping those files here would violate it. Poly Haven has no such
restriction, so its equivalents were used instead throughout.
