# Realm Arena rendering: migration options

How Realm Arena's battlefield could be drawn more cheaply than it is today, and
the order to try it in. The board is slow, worst of all in Hold Out against a
full wave of around 30 warband enemies, even though only one of them moves at
a time. This weighs five options, from making the SVG we have cheaper to
handing the board to a game engine, and recommends a path.

**Status: proposal, with its bench built (§2).** Nothing else here is built.
§7 reconsiders the options for a bigger game of 8,000 tiles and more, and
revises the recommendation in §6: PixiJS, with renderer-independent
groundwork first. The game design document
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
board and with how often the view changes. They were the first suspects. The
bench has since measured them (§2.4), and the frames during a playback cost
more than either.

---

## 2. Before choosing: measure

No option should be picked on the hypotheses alone, and none should be taken
without the same measurement before and after it. That measurement is built:
`npm run ra-bench`.

### 2.1 The bench

It draws the real `RealmArenaBoard` on a throttled phone in headless Chromium,
plays scripted scenarios over it, and reports what each cost. It needs nothing
but the checkout: no Next build, no Clerk, no database. An agent in a bare
container can run it as it stands.

- **`bench/realmarena/BenchApp.tsx`** is the page. It mounts the board on its
  own, wired as `src/app/games/realmarena/[gameid]/page.tsx` wires it for a
  co-op battle: the owners, the colours, the fog sweep, and the viewer's own
  End turn coming back one part per warband action, each part with its own
  playback and focus and a `STEP_BEAT_MS` rest between. It exposes
  `window.bench.ready` and `window.bench.run(scenario)`. **Keep it in step
  with the page**: if the page starts handing the board something new, the
  bench should too, or it measures less than a player gets.
- **`bench/realmarena/fixtures/`** holds the battle it draws, frozen as JSON so
  every run plays exactly the same thing whatever the rules have done since.
  `bench/realmarena/fixture.ts` (`npm run ra-bench:fixture`) wrote it from
  the engine's own command pipeline (`testFixtures.ts`) with seeded rolls. The
  battle is three players in Hold Out on the Sacked Fort, large and hard,
  moved on to the last wave, and the fixture is the End turn after it lands.
  - `holdout` (the default) is played in the open: 42 figures, 27 of them
    warband, and a 15-part enemy turn.
  - `holdout-fog` is the same battle in fog of war: 31 figures in sight, 13
    parts, the dimming and the page's sight-line sweep each part.
  - `holdout-8k` and `holdout-16k` are the open battle on a Sacked Fort grown
    to 92 and 128 squares across, 8,464 and 16,384 tiles
    (`bench/realmarena/scaledMap.ts`). They stand in for a bigger game's map
    (§7). The bench registers the bigger fort under the Sacked Fort's own id,
    both while the battle is played and before the board draws, so no code in
    the game knows.

  Generating them is reproducible: the rolls come from a seed, and the clock
  stands still, so the warbands' two-second planning guard never cuts a turn
  short on a busy machine. The same rules therefore write the same bytes.
  Regenerate them only on purpose, since numbers taken against one fixture
  don't compare with numbers taken against another.
- **`bench/realmarena/run.ts`** is the runner. It bundles the page with
  esbuild against a checkout's `src/` (React DOM's profiling build, so
  `<Profiler>` reports commits) and serves it with that checkout's
  `public/art`. It opens each scenario in a fresh Pixel 7 context with the CPU
  slowed 4×, records a Chrome trace, and writes a Markdown summary (also
  printed) and the JSON of every run to `bench-results/realmarena/`, which
  git ignores.

| Scenario | What it does | What it's for |
|---|---|---|
| `load` | Opens the page, until the board is drawn and every art sheet decoded. | First draw. |
| `idle` | Leaves the board alone for 5s. | What the board costs doing nothing; should be next to zero. |
| `wave` | The same with the next wave due, so the warbands' zones pulse. | Hypothesis 2. |
| `pan` | Sends the view round the corners and the middle, alternately just fitted and at the deepest step, a glide every 1.5s. | Hypothesis 1: every glide zooms. |
| `turn` | Turns the view a quarter four times with its own buttons. | The whole board laid out again. |
| `select` | Selects four of the viewer's characters in turn, then none. | The reach search, its shading and the glide to it. |
| `enemy-turn` | Plays the warbands' turn as the page does, part by part. | The complaint itself. |

For each scenario it reports:

- **Frames,** from the page's own animation frames: fps, the 95th-percentile
  and longest gap, and frames over 50ms. `idle` and `wave` are timed by the
  trace alone, because a frame counter would itself ask for a frame every
  vsync.
- **Long tasks** (and the blocking time over 50ms each), React commits and
  their render time, and the elements under the board's frame.
- **For `enemy-turn`,** how long past its own cues each part took to say it
  had played (the glide to it, plus whatever held it up), and any part that
  never did.
- **From the trace:** the main thread's busy time, split by self time into
  script, GC, style, layout, paint and other; frames committed and paints;
  raster on every thread; image decoding; and the JS heap.

### 2.2 Running it

```sh
npm run ra-bench                                    # every scenario, 3 runs (~7 min)
npm run ra-bench -- --against main                  # and main's src/, interleaved (~14 min)
npm run ra-bench -- --scenarios enemy-turn --runs 1 # one quick look (~1 min)
npm run ra-bench -- --scenarios enemy-turn,pan --fixture holdout-fog --label fog
```

- **`--against <ref>`** builds the same page against another commit's `src/`
  and `public/` (a temporary git worktree outside the repo, removed
  afterwards) and runs the two interleaved, alternating which goes first. Any
  slowdown on the machine during the run then hits both alike, and the
  report adds a change column. **This is the way to judge a change**:
  absolute numbers move from one container to the next, while a comparison
  made in one run doesn't.
- `--runs` sets how many medians are taken (default 3). Each cell shows ±
  half the range the runs spanned. A change smaller than that is noise.
- `--trace` keeps each scenario's first Chrome trace in `bench-results/`, for
  DevTools' Performance panel. `--cpu` changes the slowdown, `--parts` plays
  only the enemy turn's first few parts, and `--label` names the report.
- It exits non-zero if the page threw, and lists the errors in the report.
- **Measuring the rendering change of the moment:** commit (or leave
  uncommitted, since the working tree is what "current" measures), then run
  `--against main`. Paste the summary into the PR. A measured change worth
  keeping goes into a checkpoint in
  [`performance-checkpoints/`](./performance-checkpoints/).

### 2.3 What it can't tell you

- **The container has no GPU.** Chromium rasters in software, on worker
  threads the CPU slowdown doesn't touch. A phone rasters on its GPU. Raster
  time is therefore a relative measure only. Main-thread style, layout and
  paint are the numbers that carry over best.
- **It's headless Chromium.** iOS Safari, where `<use>` and filters behave
  differently, isn't measured, and a real phone's thermal throttling isn't
  either. A change the bench calls a win still wants a look on a real phone.
- **Text** is set in the bundled Bricolage Grotesque, as in the app. Nothing
  else of the app's chrome is there: no top bar, dock or turn sheet.
- **The bench measures itself a little:** the frame counter's callback is in
  "script" for every scenario but `idle` and `wave`.

### 2.4 First baseline

Taken 2026-10-14 at `cad4bd1`: `npm run ra-bench`, the `holdout` fixture,
three runs, in a 4-core cloud container. These are the medians. Main-thread
time is self time at the 4× slowdown, and raster is off the main thread,
in software.

| Scenario | Wall | fps | Long tasks (blocking) | Main thread busy | · script | · style | · paint | Raster | React render |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `load` | 1.1s to first frame | – | – | 1.36s | 0.70s | 0.33s | 0.10s | 0.09s | 0.31s (mount) |
| `idle` | 5.5s | – | 0 | 0.01s | – | – | – | – | – |
| `wave` | 5.5s | – | 2 (19ms) | 0.32s | 0.15s | 0.02s | 0.05s | 0.14s | 0.07s |
| `pan` | 9.5s | 46 | 17 (0.65s) | 4.4s | 0.99s | 0.74s | 1.63s | 3.0s | 0.42s |
| `turn` | 6.5s | 46 | 5 (1.12s) | 2.0s | 0.79s | 0.64s | 0.25s | 0.36s | 0.32s |
| `select` | 8.0s | 49 | 13 (0.45s) | 3.5s | 0.86s | 0.61s | 1.36s | 0.95s | 0.40s |
| `enemy-turn` | 45.8s | **30** | **191 (10.1s)** | **39.1s** | 5.2s | **12.0s** | **14.1s** | 25.2s | 1.6s |

The board is 2,865 elements. The enemy turn's 15 parts each took on average
720ms more than their own cues, which is the glide to each one plus whatever
held it up. No part ever failed to finish.

**What it says about §1.2.**

- **The complaint reproduces.** Playing the warbands' turn keeps the main
  thread busy for 85% of the turn, at 30 fps, with 191 long tasks.
- **The cost is per frame while something moves, not per zoom.** Over the
  turn's 1,367 committed frames, each pays about 9ms of style recalc and 10ms
  of paint on the main thread (at the 4× slowdown), across about two paints a
  frame.
  - **React is not it.** It renders for 1.6s of the 39s.
  - **The zoom between parts (hypothesis 1) is real but smaller.** `pan`,
    which zooms at every glide, costs about 1.6s of paint for six glides.
  - **What's left points at the size of the SVG.** Every frame, a walker, a
    flight or an HP bar sets an attribute somewhere in a 2,865-element SVG
    full of `<use>`s and filters (hypotheses 3 and 4), and the browser
    re-styles and re-paints far more of it than moved.
- **The wave pulse (hypothesis 2) is cheap here.** With the wave due, Chromium
  restyles and commits 22 frames in 5.5s and paints 4 times, about 0.3s of
  main thread. Idle without it costs nothing. So Option 1b is worth little,
  on Chromium at least.
- **Turning the view** stalls once per quarter for the relayout: its longest
  task is several hundred ms.

So the order in §6 still holds, but Option 1's first item should be what cuts
the per-frame style and paint cost, rather than 1a or 1b:

- fewer elements re-styled per frame (1f, and the filters out, 1c and 1d);
- or a renderer whose frames don't touch the DOM at all (Options 3 and 4).

The bench will tell which.

**How much to trust a difference.** An A/A run, `--against HEAD` on the same
code, put the two checkouts within 5% of each other on every `enemy-turn`
total: main-thread busy and its split, raster, fps, long tasks, blocking and
part overrun. Each run strayed ±1–5% from the median. The figures that ride
on one outlier are much looser and need more runs before reading anything
into them: the longest task, the largest frame gap, the JS heap, and anything
in the short `pan` and `select` scenarios (±10–80%).

### 2.5 Targets

These are a suggestion, to be agreed, and each is read off the bench.

- `enemy-turn`: 50 fps or better, no long task over 100ms, and a part
  overrun no more than the glide (about 300ms).
- `idle` and `wave`: next to no main-thread time, and no paints in `idle`.
- `pan`, `turn` and `select`: no long task over 100ms.
- The JS heap no larger.

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

*For today's maps. §7.5 revises this for a bigger game.*

1. **Measure first (§2).** The bench is built and the baseline is in §2.4.
   Every step after this is judged by `npm run ra-bench -- --against main`.
2. **Do Option 1 regardless,** led by what the baseline (§2.4) says costs
   most. That's the per-frame style and paint during a playback, so start
   with the filters out (1c, 1d) and fewer elements re-styled a frame (1f),
   then 1a. 1b measured cheap on Chromium. Measure after each step. This may
   be enough for Hold Out on its own, and all of it carries into any later
   step.
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
| 0 | **Bench and baseline.** *Built (§2):* `npm run ra-bench`, the fixtures it plays and the first baseline (§2.4). | Standalone, outside Next, so it never ships. |
| 1 | **Filters out (1c, 1d), memoisation (1f).** | The per-frame cost the baseline found (§2.4). `npm run ra-marks` for the baked shadow. |
| 2 | **Pan, don't re-zoom (1a).** 1b only if a real phone (Safari) shows the pulse costing what Chromium doesn't. | Opt-in `BoardZoom` flag, so other boards are unchanged. |
| 3 | **A scene list.** A pure `sceneOf`, with the SVG board rendering from it and nothing changing on screen. "At a moment" tests move onto the list. | Proves the abstraction while the SVG is still the reference. |
| 4 | **`BoardZoom` camera mode.** A spacer, a pinned slot and `useBoardView()`. | Gesture, focus, pivot and `useBoardCentre` tests run in both modes. |
| 5 | **The canvas painter behind a switch:** terrain, figures, walkers, shades, hit-testing and the DOM button layer. | The switch is a per-browser `useStoredValue`, so both renderers can be compared on one device. |
| 6 | **Effects, shake and text on canvas,** or the fx SVG driven by the camera. | |
| 7 | **Make canvas the default.** After a soak, delete the SVG path, `TintDefs`, `WalkerSlot` and friends. | Update AGENTS.md (the `isometric.ts` and `usePlayback` entries), `isometric-animations.md` §2 and §4, and add the one "What's new" line for the branch that a player would notice: the battlefield running smoothly. |

Each PR runs the review crew: `caveman` throughout, and `rulebook` for steps
4 and 7, which change shared pieces and their documentation.

---

## 7. Reconsidered for a bigger game: 8,000 tiles and more

Realm Arena is also the test bed for a bigger game, whose maps could hold
8,000 ground tiles or more, against today's 1,728–3,072. §4–§6 were weighed
for today's maps. This section weighs them again at that scale, from the bench
rather than from first principles.

### 7.1 What the bench says at scale

The scale fixtures (`holdout-8k`, `holdout-16k`, §2.1) play the same battle
on a Sacked Fort grown to 92 and 128 squares across. The fort sits in the
middle, ringed by its own terrain (`bench/realmarena/scaledMap.ts`). The team,
the warbands and the 15-part enemy turn are the same; there is just more
ground. Medians of two runs each, taken 2026-10-14 at the commit before this
section:

| | 2,916 tiles | 8,464 tiles | 16,384 tiles |
|---|---:|---:|---:|
| Board elements | 2,865 | 5,401 | 7,609 |
| `load`: first frame / mount render | 1.17s / 335ms | 1.52s / 367ms | 1.96s / 524ms |
| `load`: JS heap | 7.0 MB | 9.1 MB | 13.8 MB |
| `enemy-turn`: fps | 31 | 17 | 12 |
| `enemy-turn`: style + paint per committed frame | 18ms | 40ms | 57ms |
| `enemy-turn`: blocking time | 9.4s | 19.2s | 27.0s |
| `enemy-turn`: part overrun | 680ms | 989ms | 1,131ms |
| `turn`: fps / longest task | 47 / 0.39s | 28 / 0.81s | 13 / 1.26s |
| `pan`: fps / long tasks | 48 / 13 | 31 / 35 | 30 / 45 |
| `select`: fps / long tasks | 48 / 11 | 32 / 30 | 24 / 48 |

**The SVG's cost per frame grows with the whole board, not with what
moves.** Every column plays the same actions over the same few squares, yet
the style and paint of each frame rose 3.2× as the board grew 2.7× in
elements. A board
four times the area plays its enemy turn at 12 fps and freezes for over a
second each time the view turns.

**These maps flatter the SVG.** Their ground is flat grass merged into one
pattern, and their terrain is no denser than the Sacked Fort's (9% raised).
The elements therefore grew only 2.7× for 5.6× the tiles. A bigger game with
varied ground drawn tile by tile, or more figures, would add elements in
proportion to the tiles, and the cost with them.

### 7.2 What grows with the map whatever draws it

Some of the work scales with the tiles and has nothing to do with the
renderer. It has to be fixed on every path, so it's the first work for a
bigger game:

- **Finding the square under a point is a scan of every square.**
  `isoSquareAt` loops over the whole board. `hidden()` calls it twice per
  standing figure whenever the figures change, so the cost is figures × tiles.
  A tap goes through it too.
  - Fix: invert the projection to the column under the point, and test only
    the few squares a height could lift into it. The cost is then the tallest
    height, not the tile count.
- **The fog sweep** (`unseenSquares`) traces sight from every friendly
  character to every square, every part of every turn: tiles × eyes × range.
  - Fix: sweep only to each eye's range. Update it incrementally as figures
    move, or move it off the main thread to a worker.
- **The reach search behind a selection** (`reachFocus`) searches the whole
  map. Bound it by the character's AP.
- **Laying out the ground** (`isoRuns`, the grid lines, the plinths, the
  depth sort) is redone for the whole board on every turn of the view.
  Chunk it, so a change rebuilds only the chunks it touches.
- **`BoardZoom`'s three fixed steps are set against the column, not the
  map.** At 92 across, the deepest step (600%) leaves a square 27px across
  where today's map gets 46px. That's too small to tap, so the board would
  want about 1,000%. A content layer 1,000% of the column wide is exactly the
  size the browser can't lay out and raster quickly. A bigger map needs
  `BoardZoom` to be a camera (§4, Option 3), with a deeper zoom range set by
  the map.
- **Fitted to a phone, the whole map is an overview.** At 92 across, a square
  is under 5px wide. Drawing every sprite at that size is wasted work. At the
  fit, the board wants a level of detail: a pre-drawn overview of the ground,
  with full detail drawn only past a zoom threshold.

### 7.3 What a bigger map asks of the renderer

- **Work in proportion to the screen, not the map.** Draw only what's in the
  viewport (culling). At the deepest zoom that's a few hundred squares,
  however big the map.
- **Zooming that doesn't re-raster.** Any approach that caches the board as
  pixels (the SVG's layer, Option 2's bitmaps, Option 3's chunk caches) has to
  draw them again at each new zoom. A GPU that draws every visible sprite at
  any scale, every frame, doesn't.
- **Static ground cached in chunks**, rebuilt only where cover is blasted,
  for the overview, where thousands of tiles are on screen at once.
- **Depth across thousands of items.** A painter's sort of what's visible is
  cheap. Resolving it for the whole map, or the per-figure occluder trick of
  Option 2, isn't.
- **Fog as a texture.** Today the fog is a shade path per run of unseen
  squares, which grows with the map. Drawn as a one-texel-per-square
  visibility texture sampled under the ground, its cost stays flat.

### 7.4 The options again

1. **The cheaper SVG (Option 1)** is not a way to reach 8,000 tiles. Its frame
   cost grows with the board's element count (§7.1), and turning the view is
   a full relayout. Virtualising it (rendering only the chunks in view) would
   bound the elements, but React would reconcile a new set on every pan and
   pinch. That fights `BoardZoom`'s native scrolling, and depth across chunk
   edges needs the occluder trick. Keep only what carries over: memoising
   the page's derived data, and the §7.2 fixes. Pre-tinting, baking the
   filters and the pan-not-zoom flag serve only the SVG. They are worth one
   short PR only if today's players need relief before a migration lands.
2. **The hybrid (Option 2)** turns, at this scale, into a tile cache of
   terrain bitmaps for every rotation and every zoom. In other words, it
   becomes half of a canvas renderer, with the SVG figures and their occluders
   still beside it. Dropped.
3. **Canvas 2D (Option 3)** can reach 8,000 tiles with culling, chunk caches
   and a level of detail. Its chunk caches have to be drawn again at every
   zoom, though, and with no GPU batching, the overview and any later effects
   (light, particles, fog edges) cost CPU. It was the right size for today's
   maps. For a bigger game it's the second choice.
4. **PixiJS (Option 4)** becomes the recommendation. It batches every
   visible tile and figure on the GPU each frame, at any zoom, with no
   re-raster. It also brings:
   - culling (`cullable`, `cullArea`);
   - cached static chunks for the overview (`cacheAsTexture`, render groups);
   - free per-sprite `tint` for team colours, so no pre-tinted sheets;
   - fog as a texture, and particles when they're wanted.
   The whole library bundled with esbuild is about 160 KB gzipped (550 KB
   minified, measured), loaded only on a board that needs it. It keeps every
   shared piece in §3: the one clock (ticker off, rendered from
   `usePlaybackFrame`), `BoardZoom` as a camera, the scene list, and the DOM
   button layer for taps and titles.
5. **Phaser (Option 5)** is still a no. Its tilemap culling and camera matter
   more at this scale, but it still wants the loop, the camera and the input
   the repo shares. It's the heaviest at about 360 KB gzipped (measured,
   Phaser 4). And heights, quarter turns and the depth of raised blocks
   remain custom work in it.

**Newly worth weighing: three.js, real geometry.** A minimal import is about
131 KB gzipped (measured). It would use:

- an orthographic camera at the isometric angle;
- instanced boxes for raised ground and walls, one draw call for thousands;
- the depth buffer for occlusion.

The depth buffer is the big one: no painter's sort, no walker depth slots and
no occluder tricks, because a wall hides whoever is behind it by being
geometry. Heights become real, and the view can turn to any angle, not just a
quarter. The characters are already modelled in code
(`art-masters/realmarena/characters`, rendered to sprites by
`npm run ra-characters`), so they could stand as camera-facing sprites with a
depth test at first, and as live models later.

The cost is the terrain art: today it's isometric tile sprites, which would
become textures or models on real geometry. That's a change of look as well
as of renderer, and a bigger rewrite than Pixi. **Choose it only if the bigger
game wants a free camera, real elevation or lighting.** That's a design
decision, best made before the renderer is built rather than after.

### 7.5 The recommendation, revised

1. **Settle the camera first.** Fixed quarter turns of a 2D isometric board
   lead to PixiJS. A free camera with real elevation and lighting leads to
   three.js. Everything below holds for both.
2. **The renderer-independent groundwork, measured as it goes:**
   - the §7.2 fixes: picking, `hidden()`, the fog sweep, the reach search and
     chunked layout;
   - the pure scene list, culled to the viewport, with a `sceneOf(view,
     state, playback, ms, viewport)` that returns only what's visible;
   - `BoardZoom`'s camera mode, with a zoom range set by the map rather than
     the column.

   The SVG board can render from the scene list in the meantime, which proves
   it before anything replaces the SVG, and the culling helps the SVG too.
3. **Go straight to the GPU renderer,** skipping Canvas 2D. Build culling and
   chunked static ground in from the start, plus a level of detail at the fit.
4. **Gate it on the bench at scale.** `holdout-16k` is the acceptance test:
   - `enemy-turn` at 50 fps or better, with no long task over 100ms;
   - `turn` without a visible freeze;
   - `load` no slower than today's 2,916-tile board;
   - all of it judged by `npm run ra-bench -- --fixture holdout-16k --against main`.
5. **Today's players** get one short SVG PR (memoising, and the filters out)
   only if the migration is more than a few weeks away. Otherwise, nothing
   more is spent on the SVG.

**Since then:** the camera was settled as the isometric angle turning a
quarter at a time, drawn in three.js as real geometry, with the characters as
their own 3D models. It's being tried in
[`realm-arena-3d.md`](./realm-arena-3d.md). On the bench (`--renderers
svg,three`), its own CPU cost through the enemy turn is about 2s at 2,916 tiles
and at 16,384 alike, against 37–48s for the SVG. Its GPU side waits on a phone
to measure.

The order of work in §6.1 changes to match: steps 1 and 2 there (the SVG
fixes) give way to the §7.2 groundwork, and step 5's painter is PixiJS (or
three.js) rather than Canvas 2D.
