# World Map Kit — instructions for an AI assistant

You are receiving a kit of pre-rendered tiles, icons and the source that produced them. Use it to assemble a strategy-game world map (Rise of Kingdoms–like: soft painted greens, low-poly 3D peaks and trees, viewed like a map on a table at ~45°), or to regenerate / extend the assets.

## 1. Contents

```
manifest.json                  machine-readable summary (types, dims, pairs, icons)
tiles/base/{type}_v{0,1,2}.png 3 feature variants per terrain (same seamless ground)
tiles/base/mountain_summit.png tall snow-capped mountain (use when fully surrounded by mountain)
tiles/blend/{a}__{b}/NN.png    16 corner-blend tiles for every terrain pair (28 pairs)
tiles/river/grass_river_NN.png 16 river connection tiles on grassland
tiles/river/grass_river_05_bridge.png, _10_bridge.png  straight river + stone bridge
icons/*.png|svg                3D map markers: barbarian, forest (lumber camp), quarry, iron, plot, village1–5
preview/map_seed7.png          example 12×8 map built from the kit
source/terrain-tiles.js        generator for all tiles + map composer (browser JS, canvas)
source/iso-kit-45.js           small 3D scene kit used by the icons (SVG output)
source/map-icons-45.js         icon scenes (needs iso-kit-45.js)
```

## 2. Terrain types (index = draw priority, low → high)

| idx | key | name |
|---|---|---|
| 0 | sea | Sea |
| 1 | lake | Lake |
| 2 | coast | Coast (sand beach) |
| 3 | grass | Grassland |
| 4 | wheat | Wheat fields |
| 5 | hills | Hills |
| 6 | forest | Forest |
| 7 | mountain | Mountains |

Higher index always layers over lower. Land meeting water automatically gets a shallow rim, white surf line and sand edge.

## 3. Grid model — corners, not tiles

The map is a grid of **W×H tiles** with **(W+1)×(H+1) corner values**, each corner holding a terrain index. A tile's look is fully determined by its 4 corners `[TL, TR, BR, BL]`. This is what makes blending seamless: two tiles sharing an edge share those two corners.

* Tile uses 1 type → `tiles/base/{type}_v{n}.png` (pick n = hash(i,j) % 3 to avoid repetition).
* Tile uses exactly 2 types a<b (by index) → `tiles/blend/{a}__{b}/NN.png` where
  `NN = TL·8 + TR·4 + BR·2 + BL·1`, bit = 1 if that corner is **b** (the higher-index type).
  `00` = pure a, `15` = pure b.
* Tile uses 3–4 types → not pre-rendered; generate it with `source/terrain-tiles.js`: `TerrainTiles.render([TL,TR,BR,BL], 128, {variant})`.
* Mountain tile whose 4 edge-neighbours are also fully mountain → use `mountain_summit.png`.

## 4. Projection and layout (important)

Straight horizontal grid, oblique ~45° view. At the shipped resolution (T = 128):

* Ground footprint of one tile on screen: **Wt = 160 px wide × Ht = 113 px tall**.
* Each tile PNG is **218 × 234 px**: the ground rect sits at offset **(PX = 29, HR = 107)** inside it. The extra space above/left/right holds tall features (trees, peaks) that overhang neighbours; BP = 14 px padding below.
* Place tile (i, j) so its PNG top-left is at **(i·Wt, j·Ht)** on the map canvas. Canvas size = `W·Wt + 2·PX` × `H·Ht + HR + BP`.
* Draw order matters: draw row j = 0 first (back), then down to the front row. The source composer goes further: it draws every tile's **ground layer** first and then every tile's **feature layer**, so overhanging trees are never covered by a neighbour's ground. If you only have the flat PNGs, the row-by-row order is good enough.
* Point on the map from grid coords (u, v) (0..W, 0..H): `x = PX + u·Wt`, `y = HR + v·Ht`.

## 5. Rivers

Rivers live on tile **edges**: each tile gets a 4-bit mask `N·8 + E·4 + S·2 + W·1`, and a river always crosses an edge at its midpoint, so adjacent river tiles join. The shipped river PNGs are on grassland; for other terrains call `render(corners, 128, {river: mask})`. Masks 5 (E–W) and 10 (N–S) also have a `bridge: true` variant. One-exit tiles end in a pool; tiles touching water drop the pool so rivers flow into lakes/sea.

## 6. Icons

Square transparent 512 px PNG (and SVG) markers drawn in the same 45° view. Intended footprint ≈ **1/6 of a tile's area**: draw each icon **≈ 0.48 × Wt wide**, anchored bottom-centre (translate −50%, −78%) at any map point. They can go anywhere, not only on tile centres. Village levels 1–5 show one house per level with progressively stronger defences (fence → palisade → watchtower → gatehouse → stone walls + towers).

## 7. Regenerating or extending

All assets come from the JS in `source/`. Load it in a browser page (or any canvas-capable JS runtime):

```html
<script src="terrain-tiles.js"></script>
<script>
  const TT = window.TerrainTiles;
  // one tile → HTMLCanvasElement
  const c = TT.render([3, 3, 6, 6], 128, { variant: 0, river: 0, bridge: false, summit: false, grid: false, effects: true });
  // random map data: { corners[(H+1)][(W+1)], ns[(H+1)][W], ew[H][(W+1)] }  (ns/ew = river edge flags)
  const m = TT.genMap(12, 8, 7);
  // compose a whole map → { canvas, Wt, Ht, PX, HR, BP }
  const out = TT.compose(128, 12, 8, (i, j) => [
    [m.corners[j][i], m.corners[j][i+1], m.corners[j+1][i+1], m.corners[j+1][i]], // corners
    (i * 7 + j * 13) % 3,                                                        // variant
    (m.ns[j][i]?8:0) | (m.ew[j][i+1]?4:0) | (m.ns[j+1][i]?2:0) | (m.ew[j][i]?1:0), // river mask
    false,                                                                        // summit
    false                                                                         // bridge
  ], { grid: false });
  document.body.appendChild(out.canvas);
</script>
```

Icons: load `iso-kit-45.js` then `map-icons-45.js`; `MapIcons45.build(key, { size: 512 })` returns an SVG string. Keys: `barbarian, forest, quarry, iron, plot, village1…village5` (legacy `village` also exists).

Key knobs in `terrain-tiles.js` if you need to restyle:
* `ground()` — per-terrain base colours / noise (soft greens, dirt patches, wheat swirl, water crests).
* `feats()` — feature placement per terrain and variant (pines/oaks, hills, peaks, wheat clumps, lilies…).
* `drawUp()` — upright 3D feature drawing (faceted pines, ball-canopy oaks, low-poly peaks with snow, hills, wheat, reeds, stone bridge).
* `LIGHT` (from upper-left) and `VIEW` (camera from +y at 45°) drive all facet shading and back-face culling.
* `dims(T)` — tile footprint and padding; change `Ht` / `Z` ratios to alter the view angle.
* `genMap()` — elevation/moisture noise → terrain thresholds, plus a river traced from the highest land tile to the nearest water.

## 8. Style rules to keep new assets consistent

* Top-left light; soft, low-contrast ground; no hard outlines on terrain.
* 3D objects are faceted low-poly (flat-shaded facets), trees and peaks cast soft shadows down-right.
* Mountains: purple-grey rock (#544a6a → #bdb3d0) with grass creeping up the base; snow only on summit tiles.
* Palette anchors: grass #88b04c–#a9cb66, forest floor #3f6d34, wheat #c4a646–#e8c96a, sea #3574b6–#4a90cf, sand #d6be86–#ecdcaa.
* Keep every tile seamless: textures are periodic in the tile, and features stay inside the tile or only overhang upward/sideways into the padding.
