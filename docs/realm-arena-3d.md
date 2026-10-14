# Realm Arena in 3D: the three.js experiment

An experiment in drawing Realm Arena's battlefield with three.js, as real
geometry rather than isometric sprites. It follows
[`realm-arena-rendering.md`](./realm-arena-rendering.md) §7, which pointed to
a GPU renderer for a bigger game of 8,000+ tiles, and to three.js should that
game want real 3D.

**Status: experiment.** The 3D board draws the bench's battles and plays their
enemy turns, and the rendering bench measures it beside the isometric board
(§4, §5). No screen a player sees uses it yet.

---

## 1. What was decided

| Question | Decision |
|---|---|
| Camera | Orthographic, at the isometric board's own angle: looking down at 30°, turned 45° to the grid, turning a quarter at a time. It reads as the board it would replace. |
| Terrain | The ground is the existing tile art, unwarped onto one texture. Raised squares are shaded boxes coloured from their own sprites. Trees are built from primitives. |
| Characters | The real models, not the sprites. Each master in `art-masters/realmarena/characters` is built as three.js solids. |
| First scope | A board for the rendering bench, measured against the isometric one, before anything a player sees. |

## 2. How it's built

Everything lives in `src/games/RealmArena/three/` and
`components/RealmArenaBoard3D.tsx`.

| File | What it does |
|---|---|
| `iso3d.ts` | The pure geometry, with no three.js objects, so it's tested without a GPU (`iso3d.test.ts`). It covers: world units (a square's side; a quarter of height is `QUARTER` = √(2/3)/4, so a full height is half a square tall on screen, as in every sheet of the art); the camera's basis at each quarter turn; a figure's instance matrix (facing, fallen); and fitting a region into the frame. |
| `characterModels.ts` | Builds each character's master into one merged geometry. Box, ball, capsule and taper become three.js solids, transformed as `scripts/lib/isoRender.mjs` places them. Each vertex carries its material's colour and flags: team, glow and shine. A `Record` of every `CharacterId` makes a character without a model fail to compile. |
| `solidMaterial.ts` | One shader for every solid, reproducing the sprite renderer's `shade`: a sky ambient brighter on what faces up, a diffuse light from the upper left that turns with the camera, a highlight on what shines, and glow drawn unlit. It works in the colours as written (sRGB), as the sprites did, and tints the team-flagged parts with each instance's owner colour. |
| `terrain3d.ts` | The ground texture: each square's grass, or scorched ground, unwarped from its diamond on the sheet, with the grid over it. Raised squares are instanced boxes, one draw per terrain. Trees are instanced. An overlay holds one texel per square for zones, fog, reach and range, with a second overlay for the wave. |
| `board3d.ts` | `Board3D`, the imperative scene. It owns the renderer, the camera, figure pools (one instanced draw per character), HP bars, missiles, bursts, the glide to a focus, the quarter turn, panning and pinching, and picking. It draws only when something changes, or once a frame while something moves. |
| `cssColour.ts` | Resolves a player's CSS colour (a token, `oklch()`) to the sRGB the isometric board shows. |
| `RealmArenaBoard3D.tsx` | The React board. It takes exactly the isometric board's props and shares what decides what to show: where the view goes (`boardFocus`, now in `ui.ts`), the stored turn of the view (`useBoardRotation`), the turn buttons (`TurnButtons`), the playback clock (`PlaybackProvider`) and every timing an action plays by (`walkerAt`, `toldAt`, `shakeAt` and the cues). |

**Depth comes from the depth buffer.** A wall hides whoever is behind it by
being in the way. None of the isometric board's machinery for this is needed:
no depth sort, no walker depth slots, no figure drawn again over a wall.

**The draw calls are few and don't grow with the map:** one for the ground,
one per terrain kind, one per character kind, and two for the HP bars.

## 3. Not yet drawn

These are things the isometric board shows that the 3D one doesn't yet:

- the muster: the sealed squad and placing it;
- a lined-up action's path, odds, cover shields and HP preview;
- the effect marks, AP pips and carried items;
- hit text, slashes and the caption pill;
- smoke clouds, the centre's name, and fading on a fall;
- the faint figure a wall hides: is it needed, now that a turn of the view
  shows round the wall?
- outlines on the figures, which the sprites have;
- `BoardZoom`'s pill. The 3D board pans, pinches and ctrl-wheels on its own,
  which AGENTS.md reserves for `BoardZoom`. That's acceptable in an
  experiment, but it would be the camera mode §7.2 of the plan asks for
  before a player sees it.

## 4. Measuring it

```sh
npm run ra-bench -- --renderers svg,three                         # today's map, both boards
npm run ra-bench -- --renderers svg,three --fixture holdout-16k   # the bigger game's scale
npm run ra-bench -- --renderers svg,three --scenarios load --runs 1 --screenshot   # see what's drawn
```

For the 3D board the bench also reports the WebGL frames it drew, and the
draw calls and triangles per frame. For every board it reports the GPU
process's time and the main thread's commit time.

**Read the GPU numbers with care.** A cloud container has no GPU, so Chromium
draws WebGL in software (SwiftShader) on the CPU, and the page's main thread
waits for it at each commit. That cost is the container's, not a phone's. In
the container, the 3D board's main-thread time is almost all that wait: the
first trace showed 9.6s of commit against 0.35s of the board's own
JavaScript. The figures are about 150,000 triangles a frame (3,000–4,500 per
character), which a phone's GPU draws in a millisecond or two. So in the
container:

- **CPU-side, comparable:** script, style, layout, paint, raster and React
  render, plus the draw calls and triangles per frame.
- **GPU-side, not comparable:** the commit time, the GPU process's time, and
  therefore the 3D board's fps.

A real verdict on the GPU side needs a phone. The admin tools' **Realm
Arena renderer lab** (`/admin/realmarena-renderer`,
[`admin-tools.md`](./admin-tools.md)) runs these same scenarios on whatever
device opens it, either board, any battle, and copies its results as
Markdown with the device's GPU named.

## 5. Results

Taken 2026-10-14 at the commit before this section, in the 4-core cloud
container: `npm run ra-bench -- --renderers svg,three --runs 2`, on the open
Hold Out battle (`holdout`, 2,916 tiles) and the bigger game's scale
(`holdout-16k`, 16,384 tiles). These are medians.

- **"The board's own CPU"** is the main thread's script, GC, style, layout,
  paint and other time. It leaves out the commit, which for WebGL here is the
  wait on the software GPU.
- **Raster** is the isometric board's, off the main thread.
- **"GPU (software)"** is the GPU process drawing WebGL in SwiftShader: the
  container's cost, not a phone's (§4).

| | SVG 2.9k | 3D 2.9k | SVG 16k | 3D 16k |
|---|---:|---:|---:|---:|
| **Enemy turn:** the board's own CPU | 37.4s | **2.0s** | 48.2s | **1.9s** |
| **Enemy turn:** raster | 25.0s | – | 10.1s | – |
| **Enemy turn:** React render | 1.56s | 0.02s | 3.76s | 0.02s |
| **Enemy turn:** GPU (software) | – | 44.2s | – | 48.3s |
| **Enemy turn:** fps | 31 | 10 | 12 | 8 |
| **Turn the view:** fps / longest task | 46 / 381ms | 36 / 243ms | 9.5 / 1,292ms | **35 / 260ms** |
| **Pan:** fps / the board's own CPU | 49 / 4.0s | 35 / 0.5s | 30 / 6.3s | **35 / 0.5s** |
| **Select:** fps / the board's own CPU | 48 / 3.2s | 34 / 0.4s | 23 / 5.5s | **35 / 0.5s** |
| **Load:** board drawn / JS heap | 0.89s / 6.9 MB | 1.64s / 4.9 MB | 1.99s / 13.9 MB | 2.77s / 5.5 MB |
| **Draw calls / triangles per frame** | – | 20 / 90k | – | 20 / 115k |
| **Elements in the board** | 2,865 | 5 | 7,609 | 5 |

**What it says.**

- **The CPU cost is flat with the map.** The 3D board's own CPU through the
  enemy turn is about 2s whether the map has 2,916 tiles or 16,384, against
  37–48s plus raster for the SVG. Its draw calls hold at about 20 a frame at
  both sizes. The triangles grow only with what stands on the map: 90k to
  115k, mostly the figures, which are about 3,500 triangles each.
- **At the bigger game's scale it wins even here.** At 16k tiles, with its GPU
  in software on a 4× slowed CPU, the 3D board still turns the view at 35
  fps where the SVG drops to 9.5 and freezes for 1.3s, and it pans and
  selects faster.
- **The enemy turn is the one place it loses here,** and only on the GPU:
  software WebGL takes about 160ms a frame for the 90k triangles at the
  phone's 2.6× pixel density with antialiasing. Turning antialiasing off took
  a quick run from 10 to 12 fps, and pixel density 1 to 21 fps. A phone's GPU
  draws that frame in a millisecond or two, so on a real phone the 3D board's
  frame should be set by its CPU, which is about 5% of the SVG's.
- **It loads a little slower:** 0.75s more to the first full frame at 2.9k
  tiles. Most of that is building the ground's texture and uploading it, plus
  compiling the shaders, and that cost is paid once.
- **React all but drops out:** 31 commits a turn instead of 305, because what
  moves is set on the GPU's instances rather than rendered.

## 6. Next

1. **Measure on a phone.** This decides it. Open the renderer lab
   (`/admin/realmarena-renderer`) on the phones people play on, play each
   scenario on both boards, and paste the copied results into this
   document. On a desktop with a GPU,
   `npm run ra-bench -- --renderers svg,three --headed` gives the same
   comparison with the trace as well.
2. **If the phone agrees,** the remaining work before a player sees it:
   - §3's missing pieces;
   - `BoardZoom` as a camera (plan §7.2), in place of the 3D board's own
     gestures;
   - culling and a level of detail for maps of 8,000+ tiles. Today it draws
     the whole map every frame, which costs little at 16k tiles and only grows
     with what stands on it.
3. **Cheaper figures, if the phone wants them.** Fewer segments on the round
   solids, or outlines with an inverted hull to give back the sprites' look.
   Measure both on the bench.
