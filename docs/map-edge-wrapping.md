# Map edge wrapping — plan

How the node-and-edge map boards (World Domination, Outbreak) should draw the
handful of adjacencies that go *around the back of the globe* instead of
across the middle of it.

## 1. The problem

Both boards draw one straight `<line>` per adjacency between two node centres.
That is right for every edge except the ones whose two ends sit on opposite
sides of the world map, which the rulebook means as "these are neighbours the
short way round the globe", not "there is a route straight across the Atlantic,
Europe, Asia and the Pacific". Today they are drawn as full-width lines that
slash across the whole board, cross dozens of unrelated nodes, and read as
routes that do not exist.

The four edges, with their node coordinates in the shared `0-800 × 0-460`
viewBox:

| Game | Edge | Left node | Right node | Span |
|---|---|---|---|---|
| World Domination | Alaska ↔ Kamchatka | Alaska (56, 38) | Kamchatka (710, 16) | 654 |
| Outbreak | San Francisco ↔ Tokyo | San Francisco (61, 141) | Tokyo (723, 141) | 662 |
| Outbreak | San Francisco ↔ Manila | San Francisco (61, 141) | Manila (692, 255) | 631 |
| Outbreak | Los Angeles ↔ Sydney | Los Angeles (80, 192) | Sydney (729, 356) | 649 |

**Wanted instead:** each of these renders as two stubs — one leaving its left
node towards the left edge of the map, one leaving its right node towards the
right edge — each labelled with the name of the node at the far end, so a
player can see "San Francisco connects off the left edge to Tokyo" and find the
matching "→ San Francisco" stub on the right edge.

## 2. What exists today

- `src/games/WorldDomination/components/WorldDominationBoard.tsx` — `EDGE_LIST`
  from `edgeListFrom(ADJACENCY)`, drawn as one `<g stroke="#fff" strokeWidth={1}
  strokeOpacity={0.5}>` of `<line>`s. Also draws a **front-line highlight**: a
  single red `<line>` between the last battle's two territories, which has the
  same problem when the last battle was Alaska ↔ Kamchatka.
- `src/games/Outbreak/components/OutbreakBoard.tsx` — the same `<g>` + `<line>`
  block, byte-for-byte apart from the stroke opacity (`0.35`) and the node
  array it indexes (`CITIES` vs `TERRITORIES`).
- `src/utils/games/adjacencyGraph.ts` — `edgeListFrom` already dedupes the
  symmetric adjacency into one pair per edge (extracted from exactly this
  duplication once before; see `docs/games/outbreak-gdd.md` §21.6 step 5).
- `src/components/ui/MapLabel.tsx` — the outlined-text label both boards
  already use for on-art names. The wrap labels are one more caller of it.
- `src/components/ui/ClickableMapNode.tsx`, `BoardZoom.tsx` — the rest of the
  shared map kit; untouched by this work.
- `src/games/TrainTime/components/TrainTimeBoard.tsx` draws curved `<path>`
  routes from its own `ROUTE_GEOMETRY` and has no map art or wrapping edges.
  **Out of scope** — do not try to fold it in.

Note that the two `<g>`-of-`<line>`s blocks are already a second copy of the
same code. Fixing the wrap in both boards separately would make it a third and
fourth; this plan removes the duplicate as the vehicle for the fix.

## 3. The approach

### 3.1 Detect a wrapping edge from geometry, not a per-board list

An edge wraps exactly when its two ends are on opposite sides of the map, and
that is already visible in the coordinates: the four wrap edges span 78.9-82.8%
of the 800-wide viewBox, while the longest genuine edge on either board spans
18.0% (144 — Northwest Territory ↔ Greenland; Outbreak's longest is Jakarta ↔
Sydney at 133). A single threshold — "horizontal span greater than half the
board width" — sits in a gap with nothing in it between 144 and 631, so it is
not a knife-edge: anything from ~20% to ~78% picks the same four edges. It
needs no new data in either `board.ts`, nothing to keep in sync when a board's
coordinates are recalibrated, and gives a board no way to declare a wrap edge
its coordinates do not have.

The threshold is a named module constant in the helper, not a magic number
buried in a component, and not a parameter — no caller would pass it. Promote
it to one the day a board needs a different value.

*Rejected:* a `WRAP_EDGES` list per board. It is new data in two `board.ts`
files, plus a prop, plus a lookup, to say something the coordinates already
say.

### 3.2 Draw it as one line the map's own edges cut in half

Treat the connection as the straight line it would be on a cylinder, and draw
each half as a line running off the board towards the other end's *ghost* — a
copy of that node one board-width away:

- the **left stub** runs from `L` (the smaller `x`) to `(R.x - width, R.y)`;
- the **right stub** runs from `R` to `(L.x + width, L.y)`.

Nothing computes where those lines leave the map, because the browser already
does: both boards draw into a root `<svg viewBox="0 0 800 460">`, which clips to
its viewport by default, and nothing in `ag-theme.css` sets `overflow: visible`
on an svg (`:1354` and `:1358` set `display`, `width`, `border-radius` and
nothing else). The off-board part of each ghost line simply is not painted, at
fit width and zoomed alike.

That also gives each stub the correct slope for free — the Los Angeles ↔ Sydney
stubs slope down, the San Francisco ↔ Tokyo pair is flat — and, because the two
ghost lines are the same line shifted by exactly one board width, both halves
leave the map at the same `y`. That shared `y` is what makes the pair read as
one line wrapping round rather than two unrelated spurs, and it is the one
number the labels need:

```ts
wrapY = L.y + (L.x / (L.x + width - R.x)) * (R.y - L.y)
```

*Rejected:* short fixed-length horizontal stubs. Simpler to compute, but every
stub then has the same angle, so a player cannot tell which of San Francisco's
two wrap stubs heads for Tokyo and which for Manila without reading the label.

### 3.3 Put it in one shared component both boards use

New `src/components/ui/MapEdges.tsx` renders a board's whole adjacency layer:
the straight lines, the wrap stubs and the wrap labels. Both boards replace
their `<g>` block with one element, and the wrap behaviour exists once.

```tsx
// src/components/ui/MapEdges.tsx
interface MapEdgesProps {
    /** Board nodes in id order — only their name and position is used. */
    nodes: { name: string; x: number; y: number }[];
    /** Deduped pairs, from adjacencyGraph's edgeListFrom. */
    edges: [number, number][];
    /** The board viewBox width the map wraps at. */
    width: number;
    /** Default 0.5; Outbreak's busier map passes 0.35. */
    strokeOpacity?: number;
}
```

That is the only prop the two call sites disagree on — both pass
`stroke="#fff"` and `strokeWidth={1}` today — so the stroke colour, width and
the label font size are hardcoded inside. Add a prop back when a third board
actually wants a different one.

`WorldDominationTerritoryDef` and `OutbreakCityDef` both already satisfy
`{ name, x, y }`, so neither board needs an adapter.

### 3.4 The geometry itself is a pure helper with a test

New `src/utils/ui/mapEdges.ts` (pure presentation helper, per AGENTS.md):

```ts
export interface MapEdgeSegment { x1: number; y1: number; x2: number; y2: number }

export interface MapEdgeGeometry {
    /** One segment normally; two — left stub then right stub — when it wraps. */
    segments: MapEdgeSegment[];
    /** Where both halves leave the map; only set when it wraps (see §3.2). */
    wrapY?: number;
}

export function mapEdgeGeometry(
    a: { x: number; y: number },
    b: { x: number; y: number },
    width: number,
): MapEdgeGeometry;
```

Keeping the maths out of the component is what lets the **front-line
highlight** reuse it: `WorldDominationBoard` maps the same
`mapEdgeGeometry(...).segments` into its red `<line>`s and the highlight wraps
too, without `MapEdges` growing a "highlighted edge" prop and a second job.

It lives in `src/utils/ui/` rather than `src/utils/games/adjacencyGraph.ts`
because it is screen geometry, not graph structure — `adjacencyGraph.ts` knows
nothing about pixels and should keep it that way.

### 3.5 Labels

Each wrap stub gets one `MapLabel` at the map edge, naming the node at the
*other* end, with an arrow pointing off-board so the direction is unambiguous:

- left edge: `← Tokyo` at `x = 3`, `textAnchor="start"`, `y = wrapY - 3`
- right edge: `San Francisco →` at `x = width - 3`, `textAnchor="end"`,
  `y = wrapY - 3`

`MapLabel`'s outline stroke already makes them readable over the art, and its
hardcoded `pointerEvents="none"` keeps them off the node tap targets.

Computed `wrapY` values, useful when eyeballing the result: Alaska ↔ Kamchatka
≈ 29.6; San Francisco ↔ Tokyo = 141; San Francisco ↔ Manila ≈ 182.2; Los
Angeles ↔ Sydney ≈ 278.9.

## 4. Implementation, by commit

### Commit 1 — the geometry helper

- Add `src/utils/ui/mapEdges.ts` (§3.4).
- Add `src/utils/ui/mapEdges.test.ts`:
  - a short edge returns exactly one segment, endpoint-to-endpoint, and no
    `wrapY`;
  - a wrapping edge returns two segments, each starting at its own node and
    ending one board-width away past the opposite map edge;
  - `wrapY` is where *both* halves cross the map edge — solve each segment for
    `x = 0` and `x = width` and check they agree with it and each other. One
    test, and the one that would catch a sign slip putting the two labels on
    different rows;
  - the result is the same whichever order the two nodes are passed in;
  - the four real edges of §1, fed from `TERRITORIES` / `CITIES`, wrap; every
    other edge on both boards does not (loop the two `EDGE_LIST`s — this is the
    regression guard on the threshold, and it is cheap to check exhaustively).
- No visual change yet. Gates: `npx tsc --noEmit`, `npm run lint`, `npm test`.

### Commit 2 — the shared edge layer, both boards ported

- Add `src/components/ui/MapEdges.tsx` (§3.3), rendering straight lines, wrap
  stubs and wrap labels off `mapEdgeGeometry`.
- `WorldDominationBoard.tsx`: replace the `<g>`-of-`<line>`s with `<MapEdges
  nodes={TERRITORIES} edges={EDGE_LIST} width={BOARD_VIEWBOX.width} />`, and
  render the front-line highlight through `mapEdgeGeometry` (§3.4) so it wraps
  too.
- `OutbreakBoard.tsx`: the same, with `nodes={CITIES}` and
  `strokeOpacity={0.35}`.
- Flip Tokyo (`723, 141`) and Osaka (`724, 182`) from `labelDir: 'e'` to `'n'`
  and `'s'` in `src/games/Outbreak/board.ts`. Their names sit at `x ≈ 733` on
  rows 141 and 182 — exactly the `wrapY` of the two `San Francisco →` stubs, so
  without the flip this commit knowingly ships overlapping labels. That field
  exists for precisely this; do not special-case it in `MapEdges`.
- Both boards keep their own node rendering — that stays two components on
  purpose (`docs/games/outbreak-gdd.md` §21.6 step 5 settled it).
- Gates: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

### Commit 3 — release note and doc upkeep

After looking at both boards at fit width and zoomed in (`npm run dev`, open a
World Domination and an Outbreak game):

- Nudge any *further* label collision the eye finds — the Tokyo/Osaka one is
  already handled in commit 2 because it was worked out on paper, not
  discovered by looking.
- Add the note to `src/utils/ui/whatsNew.ts` under **Bug fixes**, in the
  player's language: the long lines that used to cut across the map are now
  drawn heading off each edge with the name of what they connect to. Drop the
  oldest line in that group if it now runs past five.
- Document the new primitive: one line in `ARCHITECTURE.md`'s
  `src/components/ui/` list, one in `AGENTS.md`'s "where the shared pieces
  live", and a short note in `docs/games/outbreak-gdd.md` §21.6 step 5 next to
  the existing `ClickableMapNode` / `edgeListFrom` extraction notes.
- Gates: all four again.

Commits 1 and 2 could land as one; they are split so the geometry is proven by
tests before any pixels move.

## 5. Verification

- `npm test` covers the geometry (commit 1's test file), including the
  exhaustive "only these four edges wrap" check.
- Visual check, both games, fit width and zoomed: no line crosses the middle of
  the map any more; each wrap stub has a readable label; the label pairs match
  up left-to-right; nothing overlaps a city or continent name; the front-line
  highlight after an Alaska ↔ Kamchatka battle draws as two red stubs.
- `npm run build`, `npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`) and
  `npm test` all pass before each commit.
- Review with `caveman` (UI/component change) and `rulebook` (new shared
  primitive + player-visible change + release note) before pushing.

## 6. Risks and non-goals

- **Threshold misfire.** A future board whose real edges span more than half
  its width would need `WRAP_FRACTION` promoted to a parameter. Today's boards
  are pinned by the exhaustive test in commit 1.
- **The art's seam.** The maths assumes the map art's left edge is
  geographically the same meridian as its right. Both boards' art is a standard
  Pacific-split world map, so this holds; and because both halves leave at the
  same `y`, a small mismatch still reads as one deliberate line.
- **Not touching** the adjacency data, any API contract, `TrainTimeBoard`, or
  either board's node rendering. This is presentation only.
- **Leaving alone:** the front-line highlight's hardcoded `stroke="#cf3b32"`.
  Commit 2 rewrites that line anyway, but `var(--ag-danger)` is a different red
  (`#c0392b`), so swapping it would be a visual change smuggled into a
  structural commit.

## 7. Review

Reviewed by `caveman` before implementation. Findings applied above: the
clipping maths in §3.2 was reimplementing the SVG renderer and is gone; three
of `MapEdges`' four style props had no caller that differed and are gone; the
threshold went from a parameter to a constant; and the Tokyo/Osaka `labelDir`
flip moved from commit 3 to commit 2, because a collision computed on paper is
not a discovery that needs a human to look first. Its two numeric corrections
(longest genuine span is 144, not ~130; Alaska ↔ Kamchatka `wrapY` is 29.6, not
~36) are folded in.
