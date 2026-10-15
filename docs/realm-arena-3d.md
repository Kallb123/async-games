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
| `iso3d.ts` | The pure geometry, with no three.js objects, so it's tested without a GPU (`iso3d.test.ts`). It covers: world units (a square's side; a quarter of height is `QUARTER` = √(2/3)/4, so a full height is half a square tall on screen, as in every sheet of the art); the camera's basis at each quarter turn; a figure's instance matrix (facing, fallen); and the frame the whole battlefield lies in as the camera sees it (`boardFrame`, §2.1), with the maths that moves a point of it across a quarter turn (`turnedPoint`) and sets the camera from a view of it (`cameraFor`). |
| `characterModels.ts` | Builds each character's master into one merged geometry. The masters aren't deployed, so it fetches them as data from `public/art/realmarena/characters.json`, which `npm run ra-characters` writes beside the sprite sheets. A test fails if that file falls behind the masters or misses a character. Box, ball, capsule and taper become three.js solids, transformed as `scripts/lib/isoRender.mjs` places them. Each vertex carries its material's colour and flags: team, glow and shine. The served file holds the solids rather than triangles: the triangle count is set where they're built (`SEGMENTS`). |
| `solidMaterial.ts` | One shader for every solid, reproducing the sprite renderer's `shade`: a sky ambient brighter on what faces up, a diffuse light from the upper left that turns with the camera, a highlight on what shines, and glow drawn unlit. It works in the colours as written (sRGB), as the sprites did, and tints the team-flagged parts with each instance's owner colour. |
| `terrain3d.ts` | The ground texture: each square's grass, or scorched ground, unwarped from its diamond on the sheet, with the grid over it. Raised squares are instanced boxes, one draw per terrain. Trees are instanced. An overlay holds one texel per square for everything shaded on the ground, laid on the flat ground and on each raised square's top, with a second overlay for the wave. `buildCover` builds the blocks of just a few squares, for cover an action blasted away to fade from (§2.2). |
| `board3d.ts` | `Board3D`, the imperative scene. It owns the renderer, the camera, the figures (`FigurePools`), the layers drawn over them (§2.2), the quarter turn and picking. It sets its camera from the view `BoardZoom` tells it (§2.1), and takes no gesture of its own but a tap. It draws only when something changes, or once a frame while something moves. |
| `figurePools.ts`, `figureCues.ts` | The figures, one instanced draw per character and kind: solid; faint (a per-instance opacity, for a figure fading as it falls, the sealed squad and the fog's stale sightings); hidden (drawn again through a wall, §2.2); and an outline, off (§3). `figureCues.ts` is the pure part, tested: how far a fall has faded, a knock or a lunge (`shoveAt`) as a move across the ground, and whether anything could stand between a figure and the camera. |
| `billboards.ts` | Quads that face the camera, hung from a point in the world and laid out across the frame in the isometric board's units, so that board's sizes carry over unchanged (§2.2). One `Billboards` is one draw, from an art sheet or a `CanvasAtlas` drawn into as it's needed (text, pills, dots, shields). |
| `marks3d.ts`, `rings3d.ts` | Each figure's effect and watch marks, AP pips and item, and the rings and dashed markers lying on the ground round its feet. |
| `bars3d.ts` | The HP bars, as billboards: the fill, the pale chip a blow takes off draining past it, the dark edge, and a lined-up action's change to it, flashing. |
| `previews3d.ts`, `previewGeometry.ts`, `canvasShapes.ts` | A lined-up action's path over the ground, the odds over its targets and the cover shields where a move ends, and the centre's name: one draw. `canvasShapes.ts` draws text and shapes into an atlas for every layer that needs it. |
| `fx3d.ts`, `fxLayout.ts` | What an action plays (§26): hit text, slashes, bursts, missiles in flight, and the smoke pot's cloud standing on the ground. The layout is `fxLayout.ts`'s, pure and tested, on the isometric board's constants. |
| `shading3d.ts` | Lays what's shaded on a square over one another in the isometric board's order — zones, the centre, fog, smoke, a reach, a range, a blast, where a pick may be placed — into the one texel a square has. |
| `cssColour.ts` | Resolves a player's CSS colour (a token, `oklch()`) to the sRGB the isometric board shows. |
| `RealmArenaBoard3D.tsx` | The React board. It takes exactly the isometric board's props and shares what decides what to show: where the view goes (`boardFocus`, now in `ui.ts`), the stored turn of the view and its pivot (`useBoardRotation`), the turn buttons (`TurnButtons`), the playback clock (`PlaybackProvider`) and every timing an action plays by (`walkerAt`, `toldAt`, `shakeAt` and the cues). It wraps the canvas in `BoardZoom`'s camera mode with the isometric board's own `BOARD_ZOOM`. |

### 2.1 `BoardZoom` is the camera

A WebGL canvas can't be laid out at 600% of the column, so `RealmArenaBoard3D`
wears `<BoardZoom camera …>` (AGENTS.md; the design is the plan's §4 Option 3).
The pill, the pinch and ctrl-wheel under the fingers, native scrolling and
momentum, `focus` glides with `onFocused`, `pivot` and `useBoardCentre` are
all `BoardZoom`'s, as on the isometric board, in `BOARD_ZOOM`'s steps. What
differs is where the board goes. `BoardZoom` scrolls an empty spacer the shape
of the viewBox at the zoom; the canvas's box is pinned over it (`sticky`),
filling what the pane shows, and is never transformed or laid out bigger. It
publishes the part of the viewBox in the pane (`useBoardView`) — from the
scroll, or from the transient pinch, glide or follow, whichever is drawing —
and `Board3D.setView` draws that, at once, in the frame it arrives in.

- **The frame is the viewBox.** `boardFrame` lays the battlefield out in the
  camera's own screen-plane units (a square's side to the unit at the fit):
  the ground and its tallest tops, room over the back for a figure and its HP
  bar, at least `MIN_ASPECT` as tall as wide (shared with the isometric board),
  the ground in the middle across. It is **the same size at every quarter
  turn** — a turn swaps a map's sides round, but the diamond they make is as
  wide and as tall either way, as the isometric board's `view.size` is — so
  `viewBox` never changes with the turn, which is what `pivot` needs ("a board
  drawn the same size either way"). A turn only moves things about inside it.
- **The camera from the view.** The view's middle, taken through the frame at
  the turn it is laid out at, is a point across the camera's plane; the
  ground that point shows is where the camera looks (`cameraFor`), and the
  pixels a world unit takes up are the pane's width over the view's.
- **The quarter turn.** `pivot` maps the point in the middle of the pane from
  the old frame to the new one by way of the ground it shows (`turnedPoint`),
  so the ground in the middle of the frame stays there at the same zoom.
  `Board3D` still draws the turn itself, 320ms about that ground: the board
  is told the new turn first (`BoardCamera` is a child of `BoardZoom`, so its
  layout effect runs before `BoardZoom`'s pivot lands), notes the ground it
  was showing, and then eases from that ground to the one the new view shows
  while the azimuth turns. The two are the same ground, so it is a pure
  rotation and ends with no jump, unless `BoardZoom` had to clamp the pivot at
  the edge of the board (zoomed into a corner), when it glides to where the pane
  could actually go.
- **Taps.** The pane takes the drag and the pinch (`touch-action` is the
  pane's, and the canvas sets none), so the canvas hears only a `click`. A tap
  is a click that ended where it began, with one finger down: a drag ends in
  `pointercancel`, a press that stopped a fling is the browser's, and a second
  finger makes the press a pinch. Picking is as it was (the nearest figure
  along the view through the tap, else the front-most square).
- **Following a long walk.** `Board3D` finds the walker's place in the frame
  each frame it is laid out and hands it to `useBoardCentre`, as
  `WalkCamera` does on the isometric board: it gives way to a glide, a pinch
  or the player, and lets go once the walk is over.
- **A deeper range,** set by the map and not the column (the plan's §7.2), is
  a bigger `maxWidth`: the spacer is empty, so nothing here lays out or
  rasters the zoomed board. It isn't built.
- **No drag with a mouse.** The isometric board doesn't pan on a mouse drag
  either: a pane scrolls with a wheel, a trackpad, its scroll bars and a
  finger. The old 3D board did, on its own.

**Depth comes from the depth buffer.** A wall hides whoever is behind it by
being in the way. None of the isometric board's machinery for this is needed:
no depth sort and no walker depth slots. A standing figure a wall hides is
still drawn again faintly through it, as on the isometric board (§2.2).

**The draw calls are few and don't grow with the map:** one for the ground,
one per terrain kind, one per character kind, and one per layer drawn over the
figures (§2.2) that has anything in it. The bench's enemy turn draws about 25 a
frame.

### 2.2 What's drawn over the figures

Whatever the isometric board draws as a sprite or a label in its SVG — a
figure's marks, its HP bar, the odds, a cover shield, the hit text, a slash, a
burst, a missile, a smoke cloud — the 3D board draws as a **billboard**
(`billboards.ts`): a quad that always faces the camera, hung from a point in
the world (a figure's feet, a square's top, the edge of a square) and laid out
across the frame from there in the isometric board's own units. So:

- **The sizes and offsets are that board's,** imported from `ui.ts`
  (`EFFECT_MARK_*`, `AP_PIP_*`, `ODDS_*`, `HIT_*`, …), and both boards place
  things by the same numbers. A `BOARD_UNIT` turns them into the world's.
- **It moves with the camera for nothing:** a quad hangs from its point, so a
  pan, a zoom, a turn of the view and the shake carry it along, and a mark
  follows a walker because it hangs from where the walker is drawn.
- **One draw a layer, not one a thing.** Each `Billboards` draws every quad
  from one texture: an art sheet's sprites (`sheetTexture`), or a
  `CanvasAtlas` that text, pills, pips, rings and shields are drawn into once,
  under a key, as they're first needed. Text waits for the board's font
  (`--ag-font`) and is drawn again once it has loaded.
- **What shows through walls is a choice a layer makes:** the effects of an
  action, the odds, the path and the shields are drawn over everything, as on
  the isometric board's effects layer; a figure's marks, its bar and a smoke
  cloud are hidden by what stands in front, as they are in that board's depth
  order.
- **Colours are the design tokens,** resolved under the board (`cssColour`),
  or read off the isometric board's own classes where a token alone doesn't
  give the look (the hit text's tones).

The rings round a figure's feet lie flat on the ground instead, one instanced
draw. What's shaded on the ground is the ground overlay's (`shading3d.ts`),
which shades a square's colour but can't draw an area's outline.

How figures come and go in an action is the figures' own (`figurePools.ts`):
one downed stands as it was until the blow lands and then fades, while its
fallen figure fades in; one struck is knocked and one striking lunges, its bar,
marks and ring staying put; cover blasted away stands on its scorched ground
until the burst fades, then fades itself. A standing figure that something in
front hides is drawn again through it at half strength in its owner's colour,
as the isometric board's `ghosts` are: a turn of the view would show it, but a
player shouldn't have to turn the view to know it's there. Only figures that
something could stand in front of go into that draw.

## 3. Not yet drawn

Everything the isometric board shows is drawn (§2.2), but for:

- **Outlines on the figures,** which the sprites have. An inverted hull is
  built (`OUTLINES` in `figurePools.ts`) but off: on the bench's enemy turn it
  took the draw calls from 20 to 27 a frame and the triangles from 95k to
  182k, for no CPU cost the container could measure. Turn it on once the
  renderer lab has shown what it costs a phone.
- **An area's outline:** a blast, the squares a pick may be placed on and the
  centre are shaded, but without the stroke round their edge the isometric
  board draws, since the ground overlay holds a colour a square.
- **The centre's name keeps off the area,** but not off figures standing
  there, as the isometric board's `MapLabelLayer` keeps it.
- **The marks' drop shadow** (`.ag-ra-figure-mark`).

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
device opens it. By default it plays each scenario on both boards, one after
the other, and sets their numbers side by side. It copies its results as
Markdown, with the device's GPU named.

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

### 5.1 On a phone

Taken 2026-10-14 with the renderer lab (§4) on an Android phone with a Mali-G78
GPU (the Pixel 6 and Galaxy S21 class), its screen about 485×1000 CSS pixels
at 2.2× and refreshing at 90Hz. The enemy turn on today's map was a second
session on the same phone. Each figure is the latest run on each board, and only for the scenarios that
were played on both boards. The rest are in the lab's *Every run* list.

| | SVG | 3D |
|---|---:|---:|
| **Enemy turn, today's map:** fps | 29 | **90** |
| **Enemy turn, today's map:** frames over 50ms / long tasks | 236 / 12 | **0 / 0** |
| **Enemy turn, today's map:** worst frame / main thread blocked | 465ms / 0.24s | **35ms / 0** |
| **Enemy turn, today's map:** how late each part ends, on average | 562ms | **337ms** |
| **Enemy turn, 16k tiles:** fps | 31 | **90** |
| **Enemy turn, 16k tiles:** frames over 50ms / long tasks | 266 / 86 | **0 / 0** |
| **Enemy turn, 16k tiles:** worst frame / main thread blocked | 369ms / 1.5s | **35ms / 0** |
| **Enemy turn, 16k tiles:** how late each part ends, on average | 590ms | **343ms** |
| **Pan, in fog:** fps / worst frame | 61 / 598ms | **89 / 34ms** |
| **Select, in fog:** fps / worst frame | 75 / 177ms | **89 / 44ms** |
| **Turn the view, in fog:** fps / worst frame | 79 / 189ms | **89 / 55ms** |
| **Wave due and idle, in fog:** long tasks | 0 | 0 |

**What it says.**

- **The GPU question is answered for this phone.** The 3D board holds the
  screen's 90Hz through every scenario with movement in it, on today's map,
  at 16k tiles and in fog: an 11.2ms frame at the 95th percentile. Across all of them it had
  one frame over 50ms and one long task, both while turning the view. Its
  71–115k triangles a frame cost the Mali-G78 nothing visible.
- **The SVG board is sluggish on today's map, the complaint the plan began
  with.** It manages 29 fps through the enemy turn, with 236 frames over 50ms.
  Yet it has only 12 long tasks there, so the slow frames are the browser
  drawing the board rather than script. Tuning the SVG board's code wouldn't
  have cured them. At 16k tiles it manages 31 fps, with 86 long tasks
  blocking for 1.5s. On the fog battle it drops frames of 0.2–0.6s while
  panning, selecting and turning.
- **The enemy turn finishes sooner on the 3D board.** Each of its 15 parts
  ends about 0.23s nearer to when it was meant to, so the whole turn is
  3.4–3.7s shorter (40.0s against 43.4s on today's map).
- **One fault, not a cost, since fixed:** on the 3D board's quarter turn, the
  camera swung away to somewhere off the map. The isometric board keeps the
  middle of the frame where it was (`BoardZoom`'s `pivot`), and now so does
  this one, through the same `pivot` (§2.1): the view turns about the ground at
  the middle of the frame. The one slow frame and long task while turning the
  view most likely went with that fault; the phone numbers above predate the
  fix, and the move to `BoardZoom`'s camera mode that followed it.
- **Not measured:** a cheaper phone, and an iPhone, where WebGL runs in
  Safari. One phone was enough to decide; they're worth a look before
  launch, not before building. The 3D board also still draws less than the
  isometric one (§3), though most of what's missing is overlay, not
  geometry.

## 6. Next

1. **Measure on a phone.** Done (§5.1), and it settles it: the 3D board is the
   way forward. Use the lab (`/admin/realmarena-renderer`) to check a cheaper
   phone and an iPhone before launch. On a desktop with a GPU,
   `npm run ra-bench -- --renderers svg,three --headed` gives the same
   comparison with the trace as well.
2. **The remaining work before a player sees it:**
   - the last of §3, and outlines on or off from a phone's numbers;
   - a zoom range set by the map (§2.1);
   - culling and a level of detail for maps of 8,000+ tiles. Today it draws
     the whole map every frame, which costs little at 16k tiles and only grows
     with what stands on it.
3. **Cheaper figures, if the phone wants them.** Fewer segments on the round
   solids, which would also pay for the outlines (§3). Measure on the bench.
