# Realm Arena rendering: migration options

How Realm Arena's battlefield could be drawn more cheaply than it is today, and
the order to try it in. The board is slow, worst of all in Hold Out against a
full wave of around 30 warband enemies, even though only one of them moves at
a time. This weighs five options, from making the SVG we have cheaper to
handing the board to a game engine, and recommends a path.

**Status: proposal.** Nothing here is built. The game design document
([`games/realm-arena.md`](./games/realm-arena.md)) covers what the player sees.
[`isometric-animations.md`](./isometric-animations.md) covers how an action
plays over the board, and §4.7 there first raised canvas. This document covers
what the board is drawn *with*.

---

## 1. What the board costs today

### 1.1 What is drawn

`RealmArenaBoard` draws the whole battlefield as one SVG inside `BoardZoom`,
with a second SVG over it for what flies (`.ag-ra-fx-layer`). Read off the
current maps:

| Map | Squares | Raised squares |
|---|---:|---:|
| Ruined Fort | 36 × 48 = 1,728 | 238 |
| Ring / Four-Gate / Twin-Gate Fort | 48 × 48 = 2,304 | 188–288 |
| Three-Gate Fort | 64 × 48 = 3,072 | 368 |
| Sacked Fort (Hold Out) | 54 × 54 = 2,916 | 256 |

- **Flat ground** is cheap. It's the slab, a grass `<pattern>`, one grid path and
  one merged path per shade (`isoRuns`), so a few dozen elements.
- **Each raised square** is a `RaisedSquare`: a `<g>` holding a plinth (up to
  three polygons), the terrain art (a `<g transform>` with one clipped
  `<g clipPath>` and one `<use>` per art layer), and a polygon for each shade
  that covers it. Every raised square is a React element in the depth-sorted
  `items` list.
- **Each standing figure** is roughly 15 to 20 nodes. `ClickableMapNode` wraps a
  `<g>` and a `<title>`, then come the shadow ellipse, a ring and a marker, the
  body `<use>`, the team `<use>` *with an SVG filter* (`TintDefs`:
  `feFlood` + `feComposite`), the item `<use>` *with a CSS `drop-shadow`
  filter* (`.ag-ra-figure-mark`), the hit circle, four HP-bar rects, the
  effect marks and the AP pips. A fog ghost carries a CSS `grayscale` filter.
- **Every sprite** is a `<use>` of a `<symbol>` whose content is the *whole*
  sheet as an `<image>`, cropped by the symbol's `viewBox`. The character
  sheets are 1024 × 5120 each (body and team), which is about 20 MB apiece
  decoded.

So a Hold Out board with a full wave is about 2,000 to 3,000 SVG nodes, with
around 35 SVG filters and about as many CSS filters.

### 1.2 Where the time probably goes

These are hypotheses read from the code. **None of them has been measured
yet** (§2), and they're ranked by how likely they are to explain "slow with 30
enemies, though only one moves".

1. **The whole SVG is rasterised again every time the zoom changes.**
   `BoardZoom` glides as a CSS transform over a board it has *already laid out
   at the zoom it's heading for* (`setZoom` → a new content width). A new
   width means the browser rasterises the board again, at up to 600% of the
   column (`maxWidth={600}`). On a phone at DPR 3 that's a layer of tens of
   megapixels, tiled, holding every filter and sheet crop under the viewport.
   Hold Out's co-op End turn plays **one part per warband action**
   (`reviewParts`, `partFollow`), and each part brings its own focus, usually
   `exact` or `close`, which zooms to the width that just fits it. That is
   therefore one full re-raster per enemy, roughly 30 a round. It explains
   why the count of enemies matters even though only one moves at a time.
2. **An animation runs inside the SVG for as long as a wave is due.** Before
   the next wave lands (`waveDue`), `.ag-ra-pulse--wave` animates the opacity
   of the warbands' deployment zones, which run along whole map edges, with an
   infinite CSS animation. An element inside an SVG can't get a compositor
   layer of its own, so each frame repaints those zones' bounding boxes and
   everything under them. That bounding box is most of the board. It keeps
   repainting while nothing is playing, and it's specific to Hold Out.
   `.ag-ra-pulse--hp` does the same while an attack is lined up.
3. **Every figure carries filters.** An SVG filter is run again whenever
   anything repaints over its region. A walker crossing a crowd of tinted
   warband figures re-runs each tint filter it touches, every frame.
4. **Sprites are crops of very large images.** Every `<use>` is a nested
   viewport clipping a full sheet. Browsers cache the decoded image, but the
   clip and the sampling are paid per sprite per paint, and memory is paid
   for four big sheets.
5. **React does a lot of work for each part.** `RealmArenaBoard` isn't
   memoised and rebuilds and sorts every depth item on every render, which
   means every raised square and every figure, with `hidden()` scanning the
   board for each figure. The page rebuilds `battle` on every render, and
   reruns the fog sweep (`unseenSquares`) whenever `fighters` changes, which is
   every part. Each part also renders the board several times: the playback
   starts, `landed`, the hold is let go, `onPlayed`, `rested`.
6. **The per-frame fan-out is small but not free.** Every standing `HpBar`
   subscribes two frame callbacks even when the action doesn't touch it, and
   every square of a walker's path runs a `usePlaybackValue` each frame.

Points 1 and 2 cost the same however few things move: they scale with the
board and with how often the view changes. They're the first suspects.

---

## 2. Before choosing: measure

No option should be picked on the hypotheses alone. Step 0 of any path:

- **A bench.** A development-only page that shows `RealmArenaBoard` with a
  fixture: the Sacked Fort, fog on, a team of four against a 30-strong
  warband wave, `waveDue` set, and a recorded warband End turn played part by
  part. It should be built from `testFixtures.ts`, with no sign-in and no
  database, and must return `notFound()` in production. A Playwright script
  runs it in the pre-installed Chromium with 4× and 6× CPU throttling and
  records a performance trace.
- **What to record:** main-thread time per part (script, style and layout,
  paint, raster), frame times during a walk, long tasks over 50 ms, frames
  dropped during a glide and during idle with `waveDue`, and JS heap and image
  memory.
- **Targets to accept a change against** (a suggestion, to be agreed):
  - a walk at 50 fps or better at 4× throttling;
  - no long task over 100 ms between one part and the next;
  - zero frames painted while idle;
  - the same or less memory.
- Keep the bench and the traces. Every option below is accepted or rejected
  by the same run, and the results go into
  [`performance-checkpoints/`](./performance-checkpoints/).

---

## 3. What any option must keep

The board is wired into shared pieces that other boards and the tests depend
on. Whatever draws the board has to keep doing all of this:

- **`BoardZoom`'s contract.** The fit / in / deep pill, pinch and ctrl-wheel
  zoom anchored under the fingers, `focus` (with `exact` and `inset`),
  `onFocused` (the playback's hold), `pivot` (turning the view), and
  `useBoardCentre` (`WalkCamera`). AGENTS.md makes `BoardZoom` the one
  zooming board for the whole app.
- **One playback clock.** `PlaybackProvider` / `usePlaybackFrame` and the pure
  "at a moment" functions in `ui.ts` (`walkerAt`, `flightAt`, `toldAt`,
  `shoveAt`, `shakeAt`, `fadeOutAt`, …), tested in `ui.test.ts`. A renderer
  that brings its own ticker or tweens has to defer to this clock.
- **Correct depth.** A wall hides whoever is behind it, a walker is hidden by
  exactly what stands in front of the square it is crossing, and someone
  standing over a body is drawn over it.
- **Turning the view** a quarter at a time (`IsoRotation`), with `isometric.ts`
  as the one place the projection lives.
- **Taps.** A tap on the ground resolves through `isoSquareAt`, so a tap on a
  wall's face is the wall. A tap on a figure selects it, a hidden figure's
  ghost can still be tapped, and the hover or long-press title
  (`ClickableMapNode`) still shows.
- **What isn't drawn on the board:** the caption, the targets overlay, the
  turn buttons and the "?" mark, all of which are HTML outside the zoom. The
  tutorial's `board` anchor, which spotlights the frame as a whole.
- **Reduced motion, fog dimming, smoke, the centre's label (`MapLabelLayer`)
  and per-seat team colours.**
- **The art pipeline:** `npm run ra-characters` and `npm run ra-marks` keep
  producing the sheets in `public/art/realmarena/`.

---

## 4. The options

### Option 1: Make the SVG cheap (no migration)

Keep the SVG and remove what makes it expensive. Each item answers a
hypothesis in §1.2:

| # | Change | Answers |
|---|---|---|
| a | **Pan instead of zoom between parts.** If the next focus fits at the zoom already laid out, within a tolerance, `BoardZoom` glides by panning only, with no `setZoom` and no re-raster. This is an opt-in focus flag, so other boards are unchanged. A Hold Out round becomes one zoom and thirty pans. | 1 |
| b | **Take the pulses out of the board SVG.** Draw the wave zones and the HP-change flash in a small SVG of their own, stacked like `.ag-ra-fx-layer`, and animate the opacity of that *root* element. A root element can be composited, so the animation costs no repaint. | 2 |
| c | **Pre-tint the team sheet per seat.** Once per seat colour, multiply `characters-team.png` by the colour on an `OffscreenCanvas` and hand the board a blob URL. The figure then draws a plain `<use>` with no filter. `TintDefs` goes. | 3 |
| d | **Bake the remaining filters.** Put the item marks' drop shadow into `items.png` via `npm run ra-marks`, and give fog ghosts opacity only, with no `grayscale`. | 3 |
| e | **Smaller images per sprite.** Slice each sprite cell actually used into its own small bitmap at load (canvas → blob), or emit a tighter atlas from the art scripts, so a `<use>` no longer crops a 1024 × 5120 sheet. | 4 |
| f | **Memoise the static parts.** Put the raised squares in a memoised `TerrainLayer` keyed by the field, the rotation and the shades. Memoise `FighterNode`. Compute the fog sweep once per state the board actually shows, not once per render, and drop the per-`HpBar` frame subscriptions an action doesn't touch. | 5, 6 |

- **Pros.** It's small and local, and it keeps every behaviour in §3 for free:
  taps, titles, the DOM tests, the tutorial. Items a and b alone may fix Hold
  Out. All of it is still worth doing if a migration follows, because b, c
  and f carry straight over.
- **Cons.** SVG's ceiling stays. Paint cost still grows with the number of
  nodes and the zoomed area, and depth is still DOM order. It is the most a
  retained-mode vector renderer will give us, which may or may not be enough
  on a low-end phone.
- **Effort:** small, as three or four PRs. **Risk:** low.

### Option 2: A hybrid, with terrain on canvas and figures in SVG

Bake the terrain, which is most of the nodes and never moves during a
playback, into bitmaps per rotation. Keep everything that moves or is tapped
in SVG over it.

- **How depth survives.** A wall in front of a figure still has to hide it.
  Draw the terrain bitmap under the figures, then redraw over each figure only
  the few raised squares in front of it that overlap its box, as SVG blocks
  again. `hidden()` already computes this relation, and a walker re-picks its
  occluders as it changes slot. Shades on raised tops go in an SVG layer
  between the bitmap and the figures, and an occluder carries its own shade.
- **How sharp the bitmap needs to be.** At the deep step the board is about
  six columns wide, so one canvas at device pixels exceeds iOS's canvas area
  limit. Bake it in tiles of about 1024² as `<image>`s, or at 2× CSS pixels
  and accept slight softness at the deepest step. Re-bake one tile when cover
  is blasted, and bake each rotation lazily, on first turn.
- **Pros.** It removes about 90% of the nodes while figures, taps, titles and
  the frame loop stay as they are, and `BoardZoom` needs no change.
- **Cons.** There are two drawing systems to keep consistent. The occluder
  logic is the subtle part, so a wrong occluder shows as a figure poking
  through a wall. It still re-rasters on zoom (the bitmap tiles are cheaper to
  raster, but they are still rastered), so it needs Option 1a too. Memory goes
  up by up to four rotations of tiles.
- **Effort:** medium. **Risk:** medium.

### Option 3: A hand-rolled Canvas 2D renderer

One `<canvas>` the size of the *viewport* (DPR-scaled) draws the whole
battlefield every frame while something plays, and only when something
changes otherwise. An invisible DOM layer takes input and carries
accessibility.

- **The draw.** The ground is pre-baked per rotation into offscreen tiles.
  Each frame, the raised squares and figures are drawn in depth order with
  the painter's algorithm, a sort of about 300 items, which is trivial. Then
  shades, paths, odds and HP bars are drawn. Sprites are `drawImage` from
  `ImageBitmap`s cut from the existing sheets, with team colours pre-tinted
  as in 1c. About 400 `drawImage`s a frame is far inside what a phone's
  GPU-backed 2D canvas sustains at 60 fps.
- **The clock.** It doesn't change. One `usePlaybackFrame` callback calls the
  renderer with `ms`, and the renderer reads the same pure `*At` functions in
  `ui.ts`. The ref-per-element machinery (`usePlaybackRef`, `WalkerSlot`,
  `CueFade`, `Arriving`) reduces to plain conditions in one draw function.
  Walker depth becomes "sort the walker at the depth of the square it is
  nearest", which is the same rule `WalkerSlot` uses.
- **A scene list to sit between rules and pixels.** A pure
  `sceneOf(view, state, playback, ms)` returns the sorted draw list: each
  entry gives a sprite, a position, a depth, a tint and an opacity. The
  renderer only paints that list. The list is testable without a browser and
  replaces any test that read the SVG. It also leaves the backend replaceable:
  Option 4 would paint the same list.
- **`BoardZoom` in "camera" mode.** A canvas can't be laid out at 600% of the
  column, so `BoardZoom` gains an opt-in mode. It sizes an empty spacer to the
  zoomed content (so native scrolling, scroll bars and momentum are kept),
  pins the canvas to the pane (`position: sticky`), and publishes its view
  (zoom, scroll and the transient pinch or glide transform) through a
  `useBoardView()` subscription instead of transforming the content. `focus`,
  `pivot` and `useBoardCentre` already work in viewBox units, so their
  contract doesn't change. Other boards keep today's mode. This change is also
  what removes hypothesis 1: zooming becomes a scale in the draw call, with
  nothing to re-lay-out and nothing to re-raster.
- **Input.** Ground taps go through `isoSquareAt`, which already exists. Taps
  on figures are a front-to-back disc test against the scene list, ghosts
  included.
- **Accessibility.** One absolutely positioned, transparent `<button>` per
  visible figure, moved with the camera, carries the `title` and the label
  `ClickableMapNode` gives today. (That would also give the board keyboard
  access, which it doesn't have today.) The canvas keeps
  `role="img"` and the map's `aria-label`.
- **Text.** The hit text, odds and centre label are drawn with `fillText` in
  Bricolage Grotesque, after `document.fonts.ready`. Alternatively, keep the
  fx SVG over the canvas, its `viewBox` updated from the camera, which costs
  little because it holds only what flies.
- **Pros.** No dependency and no bundle cost. The cost is predictable, nothing
  is painted while idle, a pulse is one alpha in the draw, and the zoom is
  free. It's fully under our control and fits the house pieces in §3 rather
  than replacing them.
- **Cons.** It's the most code we own: DPR and resize, hit testing, the
  accessibility layer, text, and context restore after the tab is
  backgrounded. The browser's devtools can no longer inspect the board. The
  SVG's `<title>` tooltips become our own.
- **Effort:** large, as five or six PRs (§6). **Risk:** medium. The drawing is
  simple, and the `BoardZoom` camera mode is where the care goes.

### Option 4: PixiJS, a WebGL 2D renderer and not a full engine

The same architecture as Option 3 (camera-mode `BoardZoom`, a scene list,
the DOM input layer, the one clock), but with PixiJS v8 painting the list
instead of Canvas 2D.

- **What Pixi gives.** `Sprite`s on `Texture` frames cut from the existing
  sheets. A per-sprite `tint`, which multiplies on the GPU, so no pre-tinting
  is needed. `zIndex` sorting. A `Container` transform for the camera.
  `cacheAsTexture` for the static ground. Cheap `Graphics` for shades and
  bars. Batching that keeps thousands of sprites at 60 fps. Real particles and
  filters (embers, smoke, a glow on the selected unit), which
  `isometric-animations.md` §4.7 wants one day.
- **Keeping the one clock.** Create the application with the ticker stopped
  (`autoStart: false`) and call `renderer.render(stage)` from the playback
  frame and on change. Pixi never runs a loop of its own.
- **Loading.** A client-only component, `next/dynamic` with `ssr: false`, so
  Pixi loads only on a Realm Arena board and never on the dashboard. Measure
  the chunk. Pixi v8 tree-shakes, but expect a few hundred KB minified.
- **Pros.** It has the highest performance ceiling of the options. Tint,
  sorting and batching come for free, and it's a mature MIT library. Later
  visual ambitions get much cheaper.
- **Cons.** It adds a sizeable dependency and its upgrades. It must handle
  WebGL context loss (iOS drops contexts under memory pressure, and the two
  1024 × 5120 sheets are within the 8192 texture limit but take real GPU
  memory). Pixi's text rendering differs from the DOM's. It still needs all of
  Option 3's `BoardZoom`, input and accessibility work, which is most of the
  cost. Pixi's own accessibility module covers less than our button layer
  would.
- **Effort:** large, similar to Option 3, with a little less drawing code and
  some integration overhead. **Risk:** medium.

### Option 5: Phaser, a full game engine

Hand the board to Phaser (3.8x, or 4 when stable): a scene with its own
camera (zoom, pan, follow), tweens and timelines, input, depth sorting and
particles.

- **Pros.** Everything comes in the box: camera follow would replace
  `WalkCamera`, timelines would replace the clock, and input, particles and
  later sound are included. It's the right tool if Realm Arena ever became
  real-time.
- **Cons.**
  - Phaser expects to own the loop, the camera and the input, which are
    exactly the three things this repo has deliberately shared:
    - `BoardZoom` is shared with every map board;
    - `PlaybackProvider` belongs to every board that plays;
    - the tested `*At` timeline is in `ui.ts`.
    Either we fight Phaser to defer to them, or we duplicate them, against
    AGENTS.md's first rule.
  - About 1 MB minified, the heaviest option by far.
  - Scene lifecycle against React state and Next's SSR.
  - Heights, raised blocks and quarter turns stay custom code in any case,
    since Phaser's isometric tilemaps don't model them.
  - What we would gain over Option 4 is mostly what `isometric-animations.md`
    §4 has already built.
- **Effort:** very large, close to a rewrite of the board and its playback.
  **Risk:** high.

*Also considered:* three.js with an orthographic camera and real 3D blocks.
Depth would come from a z-buffer and any viewing angle would be free, but the
characters are pre-rendered 2D sprites at eight facings, so it means new art
as well as a new renderer. It isn't worth it for a quarter-turn board.

---

## 5. Comparison

| | 1 Cheap SVG | 2 Hybrid | 3 Canvas 2D | 4 PixiJS | 5 Phaser |
|---|---|---|---|---|---|
| Fixes re-raster on zoom (1) | With 1a, partly | With 1a, partly | Yes | Yes | Yes |
| Fixes idle repaint (2) | Yes | Yes | Yes | Yes | Yes |
| Fixes filter cost (3) | Yes | Yes | Yes | Yes (GPU tint) | Yes |
| Performance ceiling | Low–medium | Medium | High | Highest | Highest |
| Bundle | None | None | None | + a few hundred KB, lazy | + ~1 MB, lazy |
| Keeps `BoardZoom` as is | Yes | Yes | Camera mode (opt-in) | Camera mode (opt-in) | Replaced |
| Keeps the one clock and `ui.ts` | Yes | Yes | Yes | Yes (ticker off) | Fights it |
| Taps, titles, a11y | Unchanged | Unchanged | Rebuilt as a DOM layer | Rebuilt as a DOM layer | Rebuilt |
| New code we own | Little | Medium (occluders) | Most | Less drawing, more integration | Rewrite |
| Effort / risk | S / low | M / medium | L / medium | L / medium | XL / high |

---

## 6. Recommendation

1. **Measure first (§2).** Build the bench and take a baseline trace.
2. **Do Option 1 regardless.** Ship 1a and 1b first, then 1c, 1d and 1f, and
   measure after each. If hypotheses 1 and 2 are right, this may be enough for
   Hold Out on its own, and all of it carries into any later step.
3. **If the bench still misses its targets, migrate to Option 3,** built so
   Option 4 stays a drop-in. A board of a few hundred sprites doesn't need
   WebGL. Canvas 2D costs no bundle and no dependency, and it keeps every
   shared piece in §3, with `BoardZoom` gaining an opt-in mode instead of
   being replaced. Putting the pure scene list between the rules and the
   painter means that, if Canvas 2D falls short on the bench or particles
   become a goal, PixiJS replaces only the painter.
4. **Don't adopt Phaser.** It would replace exactly the pieces this repo has
   deliberately built to share.

Option 2 is the fallback if a full canvas board proves too much at once. It
removes most of the nodes without touching `BoardZoom`, but its occluders are
work that Option 3 would later throw away.

### 6.1 Order of work for the recommended path

Each step is its own PR and is measured on the bench before the next.

| # | PR | Notes |
|---|---|---|
| 0 | **Bench and baseline.** A dev-only bench page, a Playwright trace script and a checkpoint write-up. | `notFound()` in production. |
| 1 | **Pan, don't re-zoom (1a), and the pulses out of the SVG (1b).** | Opt-in `BoardZoom` flag, so other boards are unchanged. |
| 2 | **Filters out (1c, 1d), memoisation (1f).** | `npm run ra-marks` for the baked shadow. |
| 3 | **A scene list.** A pure `sceneOf`, with the SVG board rendering from it and nothing changing on screen. "At a moment" tests move onto the list. | Proves the abstraction while the SVG is still the reference. |
| 4 | **`BoardZoom` camera mode.** A spacer, a pinned slot and `useBoardView()`. | Gesture, focus, pivot and `useBoardCentre` tests run in both modes. |
| 5 | **The canvas painter behind a switch:** terrain, figures, walkers, shades, hit-testing and the DOM button layer. | The switch is a per-browser `useStoredValue`, so both renderers can be compared on one device. |
| 6 | **Effects, shake and text on canvas,** or the fx SVG driven by the camera. | |
| 7 | **Make canvas the default.** After a soak, delete the SVG path, `TintDefs`, `WalkerSlot` and friends. | Update AGENTS.md (the `isometric.ts` and `usePlayback` entries), `isometric-animations.md` §2 and §4, and add the one "What's new" line for the branch that a player would notice: the battlefield running smoothly. |

Each PR runs the review crew: `caveman` throughout, and `rulebook` for steps
4 and 7, which change shared pieces and their documentation.
