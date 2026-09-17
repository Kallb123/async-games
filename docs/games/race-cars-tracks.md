# Race Cars: how a track is structured

A companion to [`race-cars.md`](./race-cars.md) (the game design) and
[`admin-tools.md`](../admin-tools.md) (the editor's controls). This one is about
the *track data*: what each word means, where a row number comes from, and what
the shape of a circuit does and does not change about the race driven on it.

Code: [`src/games/RaceCars/tracks/sections.ts`](../../src/games/RaceCars/tracks/sections.ts)
(the authoring model and the derivation),
[`board.ts`](../../src/games/RaceCars/board.ts) (the runtime model),
[`tracks/anglet.ts`](../../src/games/RaceCars/tracks/anglet.ts) and
[`tracks/ashcombe.ts`](../../src/games/RaceCars/tracks/ashcombe.ts) (the two
circuits that ship).

---

## 1. Two models, one circuit

The single most important thing to know: **a circuit exists in two forms, and
only one of them has row numbers in it.**

```
   SECTIONS (authoring)                        RaceCarsTrack (runtime)
   ─────────────────────                       ───────────────────────
   sections: id, name, lanes, corner           rows:    <a count>
   tiles:    id, lane, x, y, exits[]     ──▶   spaces:  { row, lane, exits[], cornerId }[]
   grid / finish / oil as tile ids             corners: { id, from, to, stops }[]
   no rows anywhere                deriveTrack  grid / finish / oil as { row, lane }
```

- The **authoring model** is what a person draws in the editor and what a track
  file is written in. It is a list of sections, each holding tiles. A tile knows
  its lane, where it sits on the art, and which tiles it may be driven to. **It
  has no row number, and no row number is ever typed by hand.**
- The **runtime model** is `RaceCarsTrack` — what the rules, the board screen and
  the saved game all read. Here every space *is* addressed by `(row, lane)`.

`deriveTrack` turns the first into the second, once, at module load. So the
answer to "is it rows and lanes, or are rows calculated from exits?" is **both,
in that order**: rows are calculated from the exits, and the result is then used
as a coordinate system for the rest of the game's life.

This matters because it means **a row number is an output, not an input.** Change
the drawing and every row downstream of the change can shift. That is why the
grid, the finish line and the oil are all written in a track file as *tile ids*
resolved through `spacesOf` at load — a tile id cannot drift, and one the circuit
has not got throws on load rather than at the start line.

---

## 2. The vocabulary

| Term | What it is | Which model |
|---|---|---|
| **lane** | Which line of the road you are on, numbered 1–3 across its width and kept consistent all the way round the lap. A road is 2 or 3 lanes wide and can narrow into a corner. Note that lane 1 is **not** "the inside" — which lane runs the short way round depends on which way that corner turns (on Anglet, lane 3 is the inside of Corner 2 and lane 1 the inside of Corner 4). | both |
| **tile** | One drawn square of road, with an `id`, a lane, a point on the art, and the tiles it steps to. The authoring unit. | authoring |
| **section** | A stretch of road drawn as one piece — a straight, an esse, a corner. Carries a lane count and, for a corner, a stop count. A **corner is a section**, not a paint colour. | authoring |
| **sync line** | A section boundary: a line across the road where every lane is *meant* to be level with every other. Rows restart their alignment at each one. | authoring (an intent, not a check — see §6) |
| **step** / **exit** | A move a car may make from one tile to another. Either drawn by hand (`exits`) or filled in by §5.1's default rule — "the next tile along, this lane or either beside it". The only movement primitive in the game. | both |
| **row** | A **rank round the lap**, derived from the step graph. Says how far round the circuit a space is, and nothing else. Wraps: the row after `rows - 1` is row 0. | runtime |
| **space** | One `(row, lane)` pair that has road on it, plus its exits and its corner. The runtime unit. | runtime |
| **corner** | A section with a stop count, carried on each of its spaces as `cornerId` and summarised as a row band `{ from, to }` for the map label. | both |
| **grid** | The spaces cars are dealt onto, P1 first (§5.2). | both |
| **finish line** | The spaces the line is painted across. May sit on several rows. §15 counts the lap at the **earliest** of them. | both |
| **oil** | Spaces with a permanent greasy patch. Authoring data only — nothing in a race reads it yet. | both |
| **geometry** | Where each space is drawn on the art and which way the car faces there. Purely presentational. | runtime |

Two more that come up constantly:

- **In step** — a section whose lanes hold the same number of tiles. Only such a
  section can use the default step rule, because "the tile beside me, one along"
  is only a statement about a road where the lanes run in step. A section whose
  lanes run out of step must name every exit, and `deriveTrack` refuses it
  otherwise.
- **Spaces vs rows as a currency.** Everything a rule *charges* — how far a roll
  carries you, an overshoot past a corner, the slipstream gap — is counted in
  **spaces** (steps along the road). Rows are only ever used to **order** things.
  This split is deliberate and it is what makes §5 below come out the way it
  does.

---

## 3. Where a row number comes from

Per section, `deriveTrack`:

1. Builds the step graph from the tiles' exits, keeping only the steps that stay
   inside the section.
2. `fromEntry(tile)` — the **longest** path into the tile from the section's
   entry, in steps.
3. `toExit(tile)` — the longest path out of it to the section's exit.
4. The section is `max(fromEntry + toExit) + 1` rows deep — its longest line
   through.
5. Each tile is **centred** in the band it could occupy:
   `row = sectionStart + round((fromEntry + (length - 1 - toExit)) / 2)`.

Sections are then laid end to end, so row numbers run continuously round the lap
and row 0 is the first row of the first section.

Two properties fall out of this, and the whole design leans on them:

- **Every step advances at least one row.** An exit's earliest is at least one
  past its source's, and so is its latest, so the midpoints cannot meet. A
  sideways step — one that changes lane without moving the car forward — is
  therefore impossible to derive, and `assembleSpaces` rejects one if it ever
  appears.
- **A lane that takes the short way round skips the rows it saved**, spread
  evenly, rather than falling out of step with the lane beside it for the rest
  of the lap. This is the bug the whole derivation exists to prevent: numbering
  tiles by counting along a lane meant a corner whose inside took four tiles to
  the outside's eight left the two lanes permanently out of register.

---

## 4. What a row is actually used for

Worth being precise, because it is a short list.

**Rows decide:**

- **Track order each round** (§15) — `recomputeRoundOrder` sorts by laps
  completed, then row, then last round's order.
- **The classification** (§4.2) — the same sort, for the result page.
- **Lap counting** (§15) — `crossesFinishLine` asks whether a step passed the
  circuit's lap boundary row, walking forward.
- **The "rows behind leader" readout** and the result page's `rowsCovered` /
  `rowsPerTurn` chart.
- **Where a corner's name label is drawn** — the midpoint of its `{ from, to }`
  band, and nothing else.
- **Addressing.** `(row, lane)` is the key a car's position, a slick and the grid
  are all saved under.

**Rows do not decide:**

- **How far a roll carries a car.** A move of N is N *steps* through the exit
  graph, not N rows.
- **Corner membership.** `cornerAt` reads the space's own `cornerId`, so two cars
  level on one row can be one inside the corner and one already out of it.
- **Overshoot.** `cornerExits` charges in spaces past the corner, read off the
  path.
- **The slipstream gap** (§12) or the reach band (§9) — both walks in spaces.

---

## 5. Anglet's middle lane: does the stagger affect gameplay?

**The observation.** Anglet Chambre D'Amour derives **182 rows** over 300 spaces.
78 of those rows hold a single lane, 90 hold two, and only 14 hold all three —
and all fourteen are inside its seven corners. Down every straight the rows
alternate:

```
row:  0     1      2     3      4     5      6     7
     [2]  [1,3]   [2]  [1,3]   [2]  [1,3]   [2]  [1,3]
```

Ashcombe, by contrast, is 78 rows over 214 spaces, and **every one of its rows
holds the full width of the road at that point**: 58 rows hold all three lanes,
and the 20 that hold two are exactly the rows inside its two-lane corners.

**Why.** Projecting every Anglet tile onto its own section's direction of travel
shows what was drawn. On a plain straight, with tiles about 56 art units apart:

```
lane 1:  30   85  142  198  254  310  365  422  476
lane 2:   0   56  112  168  226  282  338  395  450
lane 3: -27   28   85  142  198  255  312  369  426
```

Lanes 1 and 3 are **dead level** with each other (`lane1[i] ≈ lane3[i+1]`; lane
3's run just starts one tile further back). **Lane 2 alone sits exactly halfway
between them**, at +28 on a 56 spacing. The tile centres were clicked in a
brickwork stagger — each middle-lane tile nestled *between* the two outer ones
rather than beside them — which is a perfectly ordinary way to trace a curving
road, and it is what doubles the row count. The road is not out of line; the
middle lane's tile centres are.

The derivation reports that faithfully. A lane-2 tile steps *sideways* into the
lane 1 and lane 3 tiles beside it rather than the ones one further along, so the
rank alternates lane-2, lanes-1-and-3, all the way down the straight.

### Does it change the race?

**Movement, charges and every rule: no.** All of them are counted in spaces. One
step from `1:1` on Anglet reaches `3:1` or `2:2` — it skips a row, and nothing
notices, because nothing is measuring rows. A gear-3 roll covers the same amount
of road in lane 2 as in lane 1.

**Two places it does show, both minor:**

1. **Turn order within a round.** Order is laps, then row. On Ashcombe three cars
   abreast tie on row and fall through to last round's order. On Anglet a
   middle-lane car can never tie with an outer-lane car — it is always exactly
   one row ahead of or behind them. That is not wrong: the trace really does put
   the lane-2 car half a tile up the road. It is arguably *finer* ordering than
   Ashcombe's, not coarser.
2. **The "rows behind leader" number.** An Anglet row is about half the road
   distance of an Ashcombe row, so the same gap reads as roughly twice the
   number. It is coherent within a race — every car is measured the same way —
   but the figure is not comparable between circuits.

**And one thing the stagger did genuinely break, now fixed:** the grid. Anglet
originally took the shared six-slot grid of rows 0–2, lanes 1 and 3 — a
statement about a straight whose lanes sit level. Anglet's rows 0 and 2 hold
lane 2 alone, so four of six drivers were dealt onto coordinates with no road at
them: `spaceAt` null, `stepsFrom` empty, "boxed in" every turn of the race.
Naming grid slots as *tile ids* fixed it, and `board.test.ts` now asserts over
every track that a car is never dealt onto a space the circuit hasn't got.

**Should Anglet be re-traced level?** It would roughly halve the row count and
tidy the two effects above, but it changes every row number on the circuit — and
rows are persisted: a car's `(row, lane)`, every slick, and the `rowsCovered` /
`rowsPerTurn` stats on finished matches. Re-tracing invalidates any race in
flight and rewrites the charts of finished ones, to fix something the rules do
not read. Not worth it on its own; worth folding in if Anglet's art is ever
re-traced for another reason.

---

## 6. Sections that don't start level: does that affect gameplay?

**The observation.** `sections.ts` defines a section boundary as a **sync line**
— "a line across the road where every lane is level with every other". Ashcombe
honours that: rows 9 and 15 either side of the Hairpin both hold the full width.
Anglet honours it **nowhere**. Its seven corner-entry rows are 11, 48, 60, 84,
108, 128 and 149, and *every one of them holds exactly one lane*.

**Nothing enforces it.** `deriveTrack` does not check that a boundary is level.
It derives each section's rows independently and lays them end to end, so a
skewed boundary simply produces a staircase of rows there instead of a clean
line. Anglet loads, validates and drives fine.

### Does it change the race?

**At runtime, essentially not at all — because the runtime has no sections.** A
finished `RaceCarsTrack` carries no section table. Sections are the authoring
model; what survives into the game is spaces (each carrying its own `cornerId`),
a row number, and a per-corner row band. Specifically:

- **Corner membership is exact regardless.** `cornerAt` reads the space's
  `cornerId`, which is the section it was *drawn* in. A skewed entry does not put
  anyone in the wrong corner.
- **Overshoot is charged in spaces past the corner**, off the path, so it is
  unaffected.
- **The corner row band `{ from, to }` is only used to place the corner's name
  label** on the art. A skewed band moves a label by a few pixels.
- **Lap counting** is unaffected. The lap boundary is one row for the whole
  circuit, and `crossesFinishLine` asks whether a step *passed* it walking
  forward rather than landed on it — so a lane with no space on the boundary row
  still completes its lap by stepping clean over it. This is exactly the case the
  rule was written for.

**Where it does cost something** is the thing §5 already covers: a boundary that
is not level is the same drawing decision that staggers the rows, so it inflates
the row count and feeds the two minor effects above. It is a tidiness problem in
the authoring model, not a rules problem in the race.

**Worth knowing if you are drawing a circuit:** the invariant is real guidance
even though nothing checks it. A section whose entry is level across all its
lanes derives one row per tile and stays legible; one that isn't derives a
staircase. If you want a cheap guard, `deriveTrack` could warn when a boundary
row does not hold every lane the road has there — it would have surfaced Anglet's
shape in the editor rather than in a race.

---

## 7. Notes for an author

- **Never write a row number.** Not in a track file, not in a grid slot, not in a
  finish line. Name tiles; `spacesOf` resolves them at load and throws on one the
  circuit hasn't got.
- **A section boundary should be level across every lane.** Nothing checks it,
  but the rows come out clean when it is true and staircased when it isn't.
- **Lanes that run out of step must name every exit.** `deriveTrack` refuses the
  section otherwise, because the default rule is not a statement about that road.
- **A finish line may span rows; the lap is counted at the earliest of them.**
  One row for the whole circuit, deliberately: per-lane boundaries would let a
  car crossing in an early lane and changing into a later one bank two laps a few
  spaces apart, and would hand the early lanes a free head start every lap.
- **A grid drawn behind the line needs the toggle, and the toggle needs a line.**
  `gridBehindFinishLine` seats the field a lap short, so the first crossing
  starts lap 1 rather than ending it. Without it, every car banks a lap within a
  few spaces of the flag dropping. Ticked without a line painted it does nothing
  — "behind the finish line" is only a statement about a circuit that has one,
  and `startingLaps` refuses to seat a field a lap short of the derivation's row
  0. Every grid slot must also be behind the line's **earliest** painted row, not
  merely behind the line in its own lane: a slot between the earliest and latest
  painted rows is past the boundary already, and seated a lap short it would
  drive the whole circuit before banking anything. `board.test.ts` asserts this
  per track.
- **Never paint a line onto a circuit that is already in play.** The boundary is
  read live off the track module and a saved game stores only the `trackId`, so
  adding a `finish:` to a shipped circuit moves the line under every race in
  flight: a car between the old boundary and the new one has banked its lap at
  row 0 and banks a second on reaching the new line — a free lap, possibly the
  win. This is the same hazard as re-tracing (§5), and the same answer: ship the
  change as a new track id.
- **Check the editor's derived rows before exporting.** The canvas prints each
  tile's derived row, which is the fastest way to see a skewed section — that is
  what it is there for.
