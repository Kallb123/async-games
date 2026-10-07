# Isometric animations

How the isometric battlefield plays out what an action did — the walks, the
shots, the bursts, the hit text — and what should change to make it feel
better and break less. Realm Arena is the only isometric board today, so
everything here is read off it, but the timeline and the frame loop in §4
belong to the board rather than to the game, and the next isometric board
should get them for free.

**Status: first fixes built.** §3.1–§3.4 and §3.8 are in: bars and marks
wait for their blow, the fallen wait for theirs, the view stays on the
player's own action, hit text stacks in lanes (`TextCue.lane`) and reduced
motion times nothing it doesn't draw (`battleCues`' `still`). §2 still
describes the rest of the code as it stood; §3.5–§3.7, §4 and §5 are
proposals, ranked; §6 orders them into PRs. Realm Arena's design
document keeps what the player should see (§26 of
[`games/realm-arena.md`](./games/realm-arena.md)); this keeps how the board
draws it.

---

## 1. Where it lives

| Piece | File | What it does |
|---|---|---|
| `battleCues` | `src/games/RealmArena/ui.ts` | Turns an action's told events into timed cues (`BattleCue`) on one timeline, squeezed to fit `PLAYBACK_MS`. Pure. |
| `reviewParts`, `partDurationMs` | `src/games/RealmArena/ui.ts` | The same per review step and per part of a co-op End turn, and how long the review rests on each. |
| `RealmArenaBoard` | `src/games/RealmArena/components/RealmArenaBoard.tsx` | Draws the battlefield in depth order, and inside it whatever plays *between* things: `Walker`, `Falling`, `blasting` (via `Fading`), `Arriving`. Holds playback while the view glides (`held`). |
| `RealmArenaFx` | `src/games/RealmArena/components/RealmArenaFx.tsx` | Draws whatever plays *over* everything: `Flights` (frame by frame), `HitText`, `Burst`, `Slash` (CSS keyframes). Owns `useElapsed`. |
| `ag-ra-hit`, `ag-ra-burst`, `ag-ra-slash`, `ag-ra-arriving`, `ag-ra-held` | `src/app/ag-theme.css` | The keyframes, the pause while held, and the reduced-motion rules. |
| `BoardZoom` | `src/components/ui/BoardZoom.tsx` | The glide to a `focus` (`GLIDE_MS`), and `onFocused` once it lands. |
| The page | `src/app/games/realmarena/[gameid]/page.tsx` | Builds the playback — the player's own action as it comes back (`ownPlayback`), or a review step's part — picks the focus, and clears or advances both on `setTimeout`. |

## 2. How it works today

1. **Cues.** `battleCues` walks the events in order. Each thing that lands
   starts no sooner than `CUE_STEP_MS` (450ms) after the last landed (`beat`).
   A move walks its told path at `WALK_STEP_MS` (110ms) a square. A shot flies
   for its missile's `FLIGHT_MS`, then its hit text (`HIT_TEXT_MS`, 1000ms)
   starts as it lands. A slash takes `SLASH_MS` before its blow; a burst lasts
   `BURST_MS`; blasted cover fades from 60% through its burst; a downed figure
   fades over `FALL_MS` from the moment its blow lands. If the whole lot runs
   past `PLAYBACK_MS` (4.5s), every timing is scaled by the same factor.
2. **Hold.** The board computes its `focus` and holds the playback
   (`held = playback && focus && landed !== focus.key`) until `BoardZoom` says
   it has landed there. Held, the frame clocks stand still and `.ag-ra-held`
   pauses the keyframes.
3. **Two ways of moving.** What moves along a path — flights, walkers, and
   the fades of the fallen and the blasted — is redrawn a frame at a time,
   each by its own `useElapsed` clock: a `requestAnimationFrame` loop that sets
   React state every frame. What stays put — hit text, bursts, slashes, and
   `Arriving`'s reveal — is CSS keyframes with an inline `animation-delay` and
   `animation-duration` (`cueTiming`).
4. **Depth.** Walkers, falls and blasted cover are pushed into the board's
   depth-sorted `items`, so walls hide them. The rest is drawn after
   everything, inside the same SVG.
5. **Ending.** Nothing tells the page a playback finished. Live, it drops
   `ownPlayback` after `FOLLOW_GLIDE_MS + PLAYBACK_MS`; in a review, it moves
   to the next part after `durationMs`, and `useTurnNavigation` to the next
   step after `reviewStepMs`. All three assume the glide takes
   `FOLLOW_GLIDE_MS` (450ms).

The careful part is worth keeping: nothing keyframes an opacity or a filter
inside the depth order, because a browser lifts such an element — and
everything drawn in front of it — into layers of its own, which a phone shows
as black flashes and stutter. Every proposal below keeps that rule.

---

## 3. What's wrong or gives the result away

Ranked: the first four are what a player notices most.

### 3.1 The HP bar drops before the blow lands — *built*

Every resting figure (`FighterNode`) draws its `HpBar` from the state *after*
the action. The target's bar is already short while the arrow is still in the
air. Its effect marks, its watch ring and its item are the after-state from the
first frame too.

**Fix.** While a playback runs, draw each figure's bar from the fighter as the
action found it. At that fighter's hit cue, tween the fill down to the new
value, with a pale "chip" segment that lags behind and drains over about 300ms
— the classic damage read. Effect marks swap at the cue that told them.

### 3.2 The fallen pose shows under the standing one — *built*

`Falling` fades the standing figure over the resting `FighterNode` — which is
already lying in its `fallen` pose. The lying sprite is wider, so it shows
round the standing one before the shot has even flown. For a mover downed by
overwatch, the resting node arrives as its walk ends, again before the blow.

**Fix.** Wrap the downed fighter's resting node in `Arriving` at `cue.start`,
so the body appears as the standing figure starts to go — better still, fade
the fallen figure in as the standing one fades out, with a unit or so of drop.

### 3.3 The camera leaves the action before playing it — *built*

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

### 3.4 Hit text lands on itself — *built*

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

### 3.6 Timers and frame clocks disagree

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

### 3.7 A walker stands over the walls it walks behind

`Walker`'s depth is the front-most square of its *whole* path. The comment owns
up to it, and on a route that goes behind a tower and round in front of it, it
shows.

**Fix.** §4.5.

### 3.8 Reduced motion still waits out the walks — *built*

The walker isn't drawn, but the cues keep its time: the player looks at a still
board for up to three seconds before the text comes.

**Fix.** With reduced motion, build the timeline with every walk and flight at
nothing.

---

## 4. Architecture: one timeline

### 4.1 A playback clock, and an end

Today every `Walker`, every `Fading` — one *per scorched square*, so a fireball
blasting nine runs nine loops — and `Flights` each run a
`requestAnimationFrame` loop that sets state every frame. Each is its own
React commit. Keyframes run on the document's clock, and the page has
timeouts of its own. Four timebases, kept roughly in step.

Replace them with one `PlaybackClock` per playback, made by the board:

- `start`, `pause` and `resume` — what `held` becomes.
- `speed` — a review at 2×.
- `seek(ms)` — a tap to skip goes to the end.
- `onEnd` — the board's new `onPlayed(key)` prop. The page advances a review
  part, and drops `ownPlayback`, on it instead of on `setTimeout` (§3.6).
  `useTurnNavigation`'s auto-play does the same through the page.

### 4.2 One frame loop, writing the SVG directly

One `requestAnimationFrame` loop reads the clock and sets each moving
element's `transform` and `opacity` *attributes* through refs, with no React
render a frame. React renders the scene once, as the playback starts. The
positions are already pure functions of time (`walkerAt`, `flightAt`), so this
is mostly plumbing. Setting an SVG attribute doesn't lift a layer the way a
keyframed CSS property does, so §2's rule holds.

### 4.3 Keyframes onto the clock too

Hit text, bursts and slashes move to the same loop. A pause is then one flag on
the clock rather than an `animation-play-state` rule, a skip lands everything at
once, and nothing drifts a frame against the walkers when the hold lets go.

### 4.4 Effects in an overlay SVG

What's drawn over everything — flights, text, bursts, slashes — moves into a
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

### 4.6 Tests at a moment

`battleCues` is well tested; what the board shows at a given moment isn't, which
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
`RealmArenaFx.tsx`.

| What | Today | Proposed |
|---|---|---|
| **Flight time** (`FLIGHT_MS`) | Fixed per missile: an arrow takes 400ms across two squares or twenty-five. | By distance: `clamp(base + k × squares)` — an arrow about `180 + 14ms` a square, capped near 650ms. Long shots stop teleporting and short ones stop crawling. |
| **Arc height** (`FLIGHT[missile].arc`) | A share of the distance, uncapped: a lob across the map rises 30% of it. | Capped at about three squares, so a cross-map fireball stays inside a close frame. |
| **Walk pace** (`walkerAt`) | `WALK_STEP_MS` a square, diagonal or not. On screen a diagonal step is 20 units across or 10 up, a straight one about 11, so the walker visibly surges and slows. | Each leg timed by its length on screen, plus a little for climbing. |
| **Walk motion** | Constant speed; a step up a wall is a straight diagonal slide. | Ease in on the first leg and out on the last; a small hop over a change of height; a bob of about 0.6 units a step. |
| **Squeezing** (`scaled`) | Every timing by one factor, text and flights included. | Squeeze in order: walk steps down to about 70ms first, then the gaps between landings; text never under about 800ms, flights never shortened. |
| **Impact** | Nothing happens to whoever is hit. | A 120ms flash or nudge on the target; a melee striker lunging two or three units at its target through the slash; a 2px, 150ms shake of the frame for the fireball and the thunder flask (none with reduced motion). |
| **Hit text** | One fade-and-rise for every tone. | A short pop — scale 1.25 to 1 over 120ms — for a hit; none for a miss. The difference reads at a glance. |
| **Dead time** | Glide (380ms), then the action, then `STEP_BEAT_MS` (500ms). | A review step's first cue starts at about three-quarters through the glide, not after it. |
| **Framing a walk** | `moveFrame` frames the start and the end, zoomed to fit both. A route round a wall can leave that frame. | Frame the whole path; for a long walk, have the camera follow the walker instead of zooming out to fit it. |

Longer term, the biggest step in life is art rather than timing: an attack and
a hurt frame per character, in each of the eight facings, from the
`npm run ra-characters` pipeline. The lunge and the flash above stand in for
them until then.

---

## 6. Order of work

1. **What gives the result away** — §3.1–§3.5 and §3.8. Local to the board,
   the page and `battleCues`; the most noticeable gain. All but §3.5 built.
2. **Timings** — §5's table, bar the camera rows.
3. **The timeline** — §4.1–§4.5, which also settles §3.6 and §3.7, and makes a
   skip and a 2× review a few lines each. §4.6's tests go in with it.
4. **Camera** — §5's last two rows, on the timeline from 3.
5. **Art** — attack and hurt frames, whenever someone's in the character
   models.
