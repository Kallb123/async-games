# Isometric animations

How the isometric battlefield plays out what an action did — the walks, the
shots, the bursts, the hit text — and what should change to make it feel
better and break less. Realm Arena is the only isometric board today, so
everything here is read off it, but the timeline and the frame loop in §4
belong to the board rather than to the game, and the next isometric board
should get them for free.

**Status: steps 1–3 of §6 built.** §3.1–§3.4 and §3.8 went in with
[#880](https://github.com/Kallb123/async-games/pull/880): bars and marks
wait for their blow, the fallen wait for theirs, the view stays on the
player's own action, hit text stacks in lanes (`TextCue.lane`) and reduced
motion times nothing it doesn't draw (`battleCues`' `still`). §5's timings,
bar the two camera rows, went in with [#881](https://github.com/Kallb123/async-games/pull/881): flights timed by distance,
capped arcs, walks paced by leg and eased, prioritised squeezing, a knock, a
lunge and a shake on impact, and a pop on a blow's text. The timeline (§4.1–§4.6),
which settles §3.6 and §3.7, went in with the PR after: one playback clock
and one frame loop setting SVG attributes, effects in an overlay SVG, walkers
in depth slots, and the page moving on when the board says it has played. §2
describes the code as it stands now. Still to do: §3.5, the camera rows of
§5, and the art; §6 orders them. Realm Arena's design
document keeps what the player should see (§26 of
[`games/realm-arena.md`](./games/realm-arena.md)); this keeps how the board
draws it.

---

## 1. Where it lives

| Piece | File | What it does |
|---|---|---|
| `battleCues` | `src/games/RealmArena/ui.ts` | Turns an action's told events into timed cues (`BattleCue`) on one timeline, squeezed to fit `PLAYBACK_MS`. Pure. |
| `reviewParts` | `src/games/RealmArena/ui.ts` | The same per review step and per part of a co-op End turn. |
| `flightAt`, `walkerAt`, `hitTextAt`, `burstAt`, `slashAt`, `fadeOutAt`, `fadeInAt`, `toldAt`, `shoveAt`, `shakeAt` | `src/games/RealmArena/ui.ts` | What each thing looks like at a moment of the playback. Pure, and tested at a moment (§4.6). |
| `PlaybackClock` | `src/utils/ui/playbackClock.ts` | The one clock a playback runs on: paused, resumed, sped up, skipped, over at its end. Pure. |
| `PlaybackProvider`, `usePlaybackFrame`, `usePlaybackValue` | `src/utils/hooks/usePlayback.tsx` | The one frame loop over that clock, and how whatever moves reads it. |
| `RealmArenaBoard` | `src/games/RealmArena/components/RealmArenaBoard.tsx` | Draws the battlefield in depth order, and inside it whatever plays *between* things: `WalkerSlot`, `Falling`, `blasting` (via `Fading`), `Appearing`, `Arriving`, `ToldFighterNode`. Runs the playback's clock, held while the view glides (`held`), and says when it has played (`onPlayed`). |
| `RealmArenaFx` | `src/games/RealmArena/components/RealmArenaFx.tsx` | Draws whatever plays *over* everything, in an overlay SVG: `Flight`, `HitText`, `Burst`, `Slash`. |
| `BoardZoom` | `src/components/ui/BoardZoom.tsx` | The glide to a `focus` (`GLIDE_MS`), and `onFocused` once it lands. |
| The page | `src/app/games/realmarena/[gameid]/page.tsx` | Builds the playback — the player's own action as it comes back (`ownPlayback`), or a review step's part — picks the focus, and lets go of the one or moves the review on when the board says it has played. |

## 2. How it works today

1. **Cues.** `battleCues` walks the events in order. Each thing that lands
   starts no sooner than `CUE_STEP_MS` (450ms) after the last landed (`beat`).
   A move walks its told path at `WALK_STEP_MS` (110ms) a straight square,
   more for a diagonal (`DIAGONAL_LEG`) or a climb (`CLIMB_LEG`; `legWeight`).
   A shot flies for `flightMs` — its missile's `FLIGHT_PACE`, longer the
   farther it goes, up to a cap — then its hit text (`HIT_TEXT_MS`, 1000ms)
   starts as it lands. A slash takes `SLASH_MS` before its blow; a burst lasts
   `BURST_MS`; blasted cover fades from 60% through its burst; a downed figure
   fades over `FALL_MS` from the moment its blow lands. If the whole lot runs
   past `PLAYBACK_MS` (4.5s), it is rebuilt squeezing walks first (down to
   70ms a square), then the gaps between landings (down to 200ms), then the
   text (down to 800ms), never a flight; only if that still overruns is every
   timing scaled by the same factor. `battleCues` takes the battlefield for
   the distances and the heights.
2. **One clock.** The board runs one `PlaybackClock` a playback, through
   `PlaybackProvider`'s single `requestAnimationFrame` loop, from 0 to the end
   of its last cue (`endOf`). It computes its `focus` and holds the clock
   (`held = playback && focus && landed !== focus.key`) until `BoardZoom`
   says it has landed there, however long that takes, and tells the page
   once it has played to its end (`onPlayed`).
3. **One way of moving.** Everything that moves reads that clock: each piece
   calls `usePlaybackFrame` and sets its own SVG attributes (`transform`,
   `opacity`, `visibility`, a bar's `width`) through a ref, a frame at a time,
   with no React render. What it draws at a moment is a pure function of the
   playback's time in `ui.ts`: `flightAt`, `hitTextAt` (the rise, and the pop
   on a blow), `burstAt`, `slashAt`, `fadeOutAt` and `fadeInAt` (the fallen
   and the blasted), `toldAt` (a bar tweening down, its chip draining),
   `shoveAt` (a knock, a lunge), `shakeAt` and `walkerAt` (a walker's time
   shared over its legs by their length on screen, eased in and out by
   `walkEase`, with a bob and a hop from `walkLift`). What changes now and then
   — a walker turning to its next leg, a figure's marks swapping as its first
   cue lands, a resting figure arriving — is `usePlaybackValue`, which renders
   again only when it changes. Nothing is keyframed.
4. **Depth.** Walkers, falls and blasted cover are pushed into the board's
   depth-sorted `items`, so walls hide them. A walker has a slot there for
   every square of its path (`walkSquares`), at that square's depth, and is
   drawn in the slot of the square it is nearest (`walkerAt`'s `at`). The
   flights, bursts, slashes and text are drawn in an overlay SVG over the
   board's, with the same viewBox, inside `BoardZoom`'s content, so they zoom,
   pan, turn and shake with it but their frames don't repaint the board.
5. **Ending.** Live, the page lets go of `ownPlayback` when the board says it
   has played, and on leaving live. In a review, a part that plays moves on
   `STEP_BEAT_MS` after the board says it has played, and a part with nothing
   to play after `STEP_MIN_MS`; once a step's last part has gone by,
   auto-play moves on through `useTurnNavigation`'s `stepEnded` (the page
   passes `awaitsStepEnd`). Nothing assumes how long the glide takes.

The careful part is worth keeping: nothing keyframes an opacity or a filter
inside the depth order, because a browser lifts such an element — and
everything drawn in front of it — into layers of its own, which a phone shows
as black flashes and stutter. Setting an SVG attribute lifts nothing, which is
why the frame loop is safe everywhere. Every proposal below keeps that rule.

---

## 3. What's wrong or gives the result away

Ranked: the first four are what a player notices most.

### 3.1 The HP bar drops before the blow lands — *built in [#880](https://github.com/Kallb123/async-games/pull/880)*

Every resting figure (`FighterNode`) draws its `HpBar` from the state *after*
the action. The target's bar is already short while the arrow is still in the
air. Its effect marks, its watch ring and its item are the after-state from the
first frame too.

**Fix.** While a playback runs, draw each figure's bar from the fighter as the
action found it. At that fighter's hit cue, tween the fill down to the new
value, with a pale "chip" segment that lags behind and drains over about 300ms
— the classic damage read. Effect marks swap at the cue that told them.

### 3.2 The fallen pose shows under the standing one — *built in [#880](https://github.com/Kallb123/async-games/pull/880)*

`Falling` fades the standing figure over the resting `FighterNode` — which is
already lying in its `fallen` pose. The lying sprite is wider, so it shows
round the standing one before the shot has even flown. For a mover downed by
overwatch, the resting node arrives as its walk ends, again before the blow.

**Fix.** Wrap the downed fighter's resting node in `Arriving` at `cue.start`,
so the body appears as the standing figure starts to go — better still, fade
the fallen figure in as the standing one fades out, with a unit or so of drop.

### 3.3 The camera leaves the action before playing it — *built in [#880](https://github.com/Kallb123/async-games/pull/880)*

Live, the focus that holds the playback is whatever the board would show
next, not the action:

- **A shot.** `pickKey` includes the selected unit's `ap` and `hp`, so as the
  shot comes back `picked` resets and the close-up framing of caster and
  target (`aimFocus`) is dropped. The focus falls back to the selected unit's
  reach — a new key — and the shot waits while the board zooms *out*, then
  plays small.
- **The unit's last AP.** It's deselected as the response comes back, so the
  board first glides all the way out to `home`.
- **A move.** `selected.square` changes, so the focus is the reach round where
  the unit *ended*. A long walk starts off the frame.

**Fix.** While a live playback runs, the focus is the action itself — the
move's frame (`moveFrame`), what it touched (`actionSquares`), or the target
already picked — and the selection's focus takes over once it's played (§4.1
gives the board the "played" to wait for).

### 3.4 Hit text lands on itself — *built in [#880](https://github.com/Kallb123/async-games/pull/880)*

A knock-out's "Down" starts `CUE_STEP_MS` after the damage that caused it, at
the same point over the same head, while the damage text still has 550ms to
run. Burning's damage and a blow on the same figure stack the same way.

**Fix.** In `battleCues`, give each fighter text lanes: a text that starts
while an earlier one on the same fighter is still showing goes one line
(about 6 units) higher. For "Down", the label under the number reads better
than a second number.

### 3.5 Shooters don't face their target

Facing is only set as a fighter walks (`rules.ts`, the move's
`mover.facing`). An archer that stepped away from its target shoots over its
shoulder.

**Fix.** Facing is only for the eye (§26.5 of the design document), so this
needs no rule: draw the shooter facing `facingTowards(from, to)` for its
flight cue, and through the rest of the playback.

### 3.6 Timers and frame clocks disagree — *built with the timeline (§4.1)*

The page's three timeouts all assume a 450ms glide, but `held` stops the clocks
for however long the glide really takes: the `setZoom`, the board laid out
afresh at the new zoom, then 380ms of glide, and a smooth `window.scrollTo`
that nobody waits for. On a slow phone the timeout wins, and a walk is cut off
mid-path and its figure snaps to the square. A focus change mid-playback (a tap
on a unit box) sets `held` again and freezes it mid-way, while the timer runs
on. And `FOLLOW_GLIDE_MS` (450, `ui.ts`) is kept in step with `GLIDE_MS` (380,
`BoardZoom.tsx`) by hand.

**Fix.** The board says when a playback has played (§4.1); the page advances on
that, not on a guess.

### 3.7 A walker stands over the walls it walks behind — *built with the timeline (§4.5)*

`Walker`'s depth is the front-most square of its *whole* path. The comment owns
up to it, and on a route that goes behind a tower and round in front of it, it
shows.

**Fix.** §4.5.

### 3.8 Reduced motion still waits out the walks — *built in [#880](https://github.com/Kallb123/async-games/pull/880)*

The walker isn't drawn, but the cues keep its time: the player looks at a still
board for up to three seconds before the text comes.

**Fix.** With reduced motion, build the timeline with every walk and flight at
nothing.

---

## 4. Architecture: one timeline

### 4.1 A playback clock, and an end

*Built.* Before it, every `Walker`, every `Fading` — one *per scorched square*, so a fireball
blasting nine runs nine loops — and `Flights` each run a
`requestAnimationFrame` loop that sets state every frame. Each is its own
React commit. Keyframes ran on the document's clock, and the page had
timeouts of its own. Four timebases, kept roughly in step.

They are replaced by one `PlaybackClock` per playback (`src/utils/ui/playbackClock.ts`),
made by the board's `PlaybackProvider` (`src/utils/hooks/usePlayback.tsx`):

- `start`, `pause` and `resume` — what `held` becomes.
- `setSpeed` — a review at 2×. On the clock, not yet offered to the player.
- `seek(ms)` — a tap to skip goes to the end. On the clock, not yet offered
  to the player either: each is now a prop on the board and a button.
- `onEnd` — the board's new `onPlayed(key)` prop. The page advances a review
  part, and drops `ownPlayback`, on it instead of on `setTimeout` (§3.6).
  `useTurnNavigation`'s auto-play does the same through the page
  (`awaitsStepEnd`, `stepEnded`), and `FOLLOW_GLIDE_MS`, `partDurationMs` and
  `reviewStepMs` are gone.

### 4.2 One frame loop, writing the SVG directly

*Built:* `usePlaybackFrame` for what moves every frame, `usePlaybackValue`
for what changes now and then. One `requestAnimationFrame` loop reads the clock and sets each moving
element's `transform` and `opacity` *attributes* through refs, with no React
render a frame. React renders the scene once, as the playback starts. The
positions are already pure functions of time (`walkerAt`, `flightAt`), so this
is mostly plumbing. Setting an SVG attribute doesn't lift a layer the way a
keyframed CSS property does, so §2's rule holds.

### 4.3 Keyframes onto the clock too

*Built:* `hitTextAt`, `burstAt` and `slashAt` play the old keyframes' values,
eased as CSS `ease-out` was, and the stylesheet has none left. Hit text, bursts and slashes move to the same loop. A pause is then one flag on
the clock rather than an `animation-play-state` rule, a skip lands everything at
once, and nothing drifts a frame against the walkers when the hold lets go.

### 4.4 Effects in an overlay SVG

*Built:* `.ag-ra-fx-layer`, positioned over the board inside
`BoardZoom`'s content; its `<use>`s point at the sprites defined in the
board's SVG. What's drawn over everything — flights, text, bursts, slashes — moves into a
second SVG stacked over the board inside `BoardZoom`'s content, with the same
`viewBox`. It still zooms, pans and turns with the board (the pinch and the
glide transform the content, not the SVG), but its frames no longer repaint
the board's SVG — which, at the deeper zoom steps, has hundreds of sprites
under every rectangle a moving arrow dirties. For a phone, the cheapest real
win here.

Walkers, falls and blasted cover stay in the board: they have to be hidden by
walls.

### 4.5 Walker depth by leg

Before the playback, put an empty `<g>` slot into `items` for each leg of each
walk, at that leg's depth. The walker draws into its current leg's slot with
`createPortal`. The depth order stays as React rendered it, and the walker is
hidden by exactly what's in front of the square it's crossing (§3.7).

*Built, a little differently:* a slot for each square of the path rather than
each leg (`walkSquares`), and the walker in the slot of the square it is
nearest — `from` for the first half of a leg, `to` for the second — so a wall
in front of where it's heading hides it as it gets there, and one in front of
where it left stops hiding it as it goes. Each slot draws the walker itself
while it is the current one (`WalkerSlot`), rather than a portal into it,
which keeps refs out of render.

### 4.6 Tests at a moment

*Built:* "the board at a moment" in `ui.test.ts`, with the three below and
the flights, the text, the bursts, the slashes, the fades and the walker's
slot; and the clock's own tests in `playbackClock.test.ts`.

`battleCues` was well tested; what the board shows at a given moment wasn't, which
is how §3.1 and §3.2 shipped. Export `walkerAt` and `flightAt` and test frames:
"at the hit cue the bar reads the before HP", "before the blow the fallen pose
isn't drawn", "a diagonal leg takes as long on screen as its length".

### 4.7 Canvas or WebGL?

Moving the battlefield to a canvas (PixiJS or similar) would make depth sorting
every frame trivial, particles cheap and 60fps steady, and the character sheet
and the isometric maths would carry over. It would also lose, or mean
rebuilding: the DOM tap targets and their titles (`ClickableMapNode`), the
tutorial's `data-tour` spotlights, `BoardZoom` (shared with every map board),
`MapLabelLayer`, accessibility and the tests that read the SVG. §4.1–§4.5 get
most of the smoothness for a fraction of that. If particles are wanted later —
embers, sparks, smoke — a `<canvas>` over the board for those alone fits the
same timeline without touching the board.

---

## 5. Feel and timings

Small changes, mostly constants and pure functions in `ui.ts` and
`RealmArenaFx.tsx`. All but the last two rows are built; the last column says
with what.

| What | Before | Proposed | Status |
|---|---|---|---|
| **Flight time** (`FLIGHT_MS`) | Fixed per missile: an arrow takes 400ms across two squares or twenty-five. | By distance: `clamp(base + k × squares)` — an arrow about `180 + 14ms` a square, capped near 650ms. Long shots stop teleporting and short ones stop crawling. | Built in [#881](https://github.com/Kallb123/async-games/pull/881): `FLIGHT_PACE` — arrow 180 + 14 a square up to 650ms, bolt 120 + 9 up to 420, acid 220 + 16 up to 650, a fireball or a throw 300 + 20 up to 800. |
| **Arc height** (`FLIGHT[missile].arc`) | A share of the distance, uncapped: a lob across the map rises 30% of it. | Capped at about three squares, so a cross-map fireball stays inside a close frame. | Built in [#881](https://github.com/Kallb123/async-games/pull/881): `MAX_ARC`, a peak of three squares' depth (30 units). |
| **Walk pace** (`walkerAt`) | `WALK_STEP_MS` a square, diagonal or not. On screen a diagonal step is 20 units across or 10 up, a straight one about 11, so the walker visibly surges and slows. | Each leg timed by its length on screen, plus a little for climbing. | Built in [#881](https://github.com/Kallb123/async-games/pull/881): the timeline weights a diagonal step `DIAGONAL_LEG`, about 1.34 (the average of its two lengths on screen over a straight one's, so it doesn't depend on the view's turn) and a climb 0.25 a quarter; the board shares the walk's time over its legs by their length on screen, pricing a climb by the same `CLIMB_LEG` (`legLengthOn`). |
| **Walk motion** | Constant speed; a step up a wall is a straight diagonal slide. | Ease in on the first leg and out on the last; a small hop over a change of height; a bob of about 0.6 units a step. | Built in [#881](https://github.com/Kallb123/async-games/pull/881): `walkEase` (a trapezoid of speed, its ramps the first and last legs), `WALK_HOP` 3 units, `WALK_BOB` 0.6; the figure alone moves, not its bar or shadow. |
| **Squeezing** (`scaled`) | Every timing by one factor, text and flights included. | Squeeze in order: walk steps down to about 70ms first, then the gaps between landings; text never under about 800ms, flights never shortened. | Built in [#881](https://github.com/Kallb123/async-games/pull/881), as proposed: walk step to 70ms, gaps to 200ms, text to 800ms; the old uniform scale is the last resort. |
| **Impact** | Nothing happens to whoever is hit. | A 120ms flash or nudge on the target; a melee striker lunging two or three units at its target through the slash; a 2px, 150ms shake of the frame for the fireball and the thunder flask (none with reduced motion). | Built in [#881](https://github.com/Kallb123/async-games/pull/881): `KNOCK` 1.5 units over `IMPACT_MS` (120), `LUNGE` 2.5 through the slash, `SHAKE` 2 units over `SHAKE_MS` (150). Not yet on a target that is walking (an overwatch shot). |
| **Hit text** | One fade-and-rise for every tone. | A short pop — scale 1.25 to 1 over 120ms — for a hit; none for a miss. The difference reads at a glance. | Built in [#881](https://github.com/Kallb123/async-games/pull/881), for a hit and a graze. |
| **Dead time** | Glide (380ms), then the action, then `STEP_BEAT_MS` (500ms). | A review step's first cue starts at about three-quarters through the glide, not after it. | Not yet: §6 step 4, with the camera. |
| **Framing a walk** | `moveFrame` frames the start and the end, zoomed to fit both. A route round a wall can leave that frame. | Frame the whole path; for a long walk, have the camera follow the walker instead of zooming out to fit it. | Not yet: §6 step 4, with the camera. |

Longer term, the biggest step in life is art rather than timing: an attack and
a hurt frame per character, in each of the eight facings, from the
`npm run ra-characters` pipeline. The lunge and the flash above stand in for
them until then.

---

## 6. Order of work

1. **What gives the result away** — §3.1–§3.5 and §3.8. Local to the board,
   the page and `battleCues`; the most noticeable gain. **Built in
   [#880](https://github.com/Kallb123/async-games/pull/880)**, all but §3.5.
2. **Timings** — §5's table, bar the camera rows. **Built in [#881](https://github.com/Kallb123/async-games/pull/881)**, bar
   the knock on a walking target.
3. **The timeline** — §4.1–§4.5, which also settles §3.6 and §3.7, and makes a
   skip and a 2× review a few lines each. §4.6's tests go in with it.
   **Built**, without the skip and the 2× themselves: the clock has both, and
   no button offers them yet.
4. **Camera** — §5's last two rows, on the timeline from 3.
5. **Art** — attack and hurt frames, whenever someone's in the character
   models.
