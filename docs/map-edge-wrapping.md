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
that is already visible in the coordinates: the four wrap edges span 631-662 of
the 800-wide viewBox, while the longest genuine edge on either board spans
144 (Northwest Territory ↔ Greenland; Outbreak's longest is Jakarta ↔ Sydney
at 133). A single threshold — "horizontal span greater than half the board
width", i.e. 400 here — sits in a gap with nothing in it between 144 and 631,
and needs no new data in either `board.ts`, nothing to keep in sync
when a board's coordinates are recalibrated, and no chance of a board
declaring a wrap edge its coordinates do not have.

The threshold is a documented default on the helper, not a magic number buried
in a component.

*Rejected:* a `WRAP_EDGES` list per board. It is more code, in two more
places, to express something the coordinates already say.

### 3.2 Draw it as one line cut by the map's edges

Treat the connection as the straight line it would be on a cylinder. For an
edge between `L` (the smaller `x`) and `R`:

- the **left stub** runs from `L` towards a ghost of `R` placed at `R.x - width`
  (i.e. just off the left edge), clipped at `x = 0`;
- the **right stub** runs from `R` towards a ghost of `L` placed at
  `L.x + width`, clipped at `x = width`.

The two stubs then meet the two edges at the *same* `y` — that falls out of the
maths, and is worth an assertion in the test, because it is what makes the pair
read as one line wrapping round rather than two unrelated spurs. It also gives
each stub the correct slope for free (the Los Angeles ↔ Sydney stubs slope
down, the San Francisco ↔ Tokyo pair is flat).

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
    stroke?: string;          // default '#fff'
    strokeWidth?: number;     // default 1
    strokeOpacity?: number;   // default 0.5 (Outbreak passes 0.35)
    labelFontSize?: number;   // default 6
}
```

`WorldDominationTerritoryDef` and `OutbreakCityDef` both already satisfy
`{ name, x, y }`, so neither board needs an adapter.

### 3.4 The geometry itself is a pure helper with a test

New `src/utils/ui/mapEdges.ts` (pure presentation helper, per AGENTS.md):

```ts
export interface MapEdgeSegment { x1: number; y1: number; x2: number; y2: number }

export interface MapEdgeGeometry {
    /** One segment normally; two — left stub then right stub — when it wraps. */
    segments: MapEdgeSegment[];
    /** Where the edge leaves and re-enters the map; only set when it wraps. */
    wrapY?: number;
}

/** @param wrapFraction span/width above which an edge is taken to go round the back. */
export function mapEdgeGeometry(
    a: { x: number; y: number },
    b: { x: number; y: number },
    width: number,
    wrapFraction = 0.5,
): MapEdgeGeometry;
```

Keeping the maths out of the component is what lets the **front-line
highlight** reuse it: `WorldDominationBoard` maps the same
`mapEdgeGeometry(...).segments` into its red `<line>`s and the highlight wraps
too, without `MapEdges` growing a "highlighted edge" prop.

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
`pointerEvents="none"` keeps them out of the way of the node tap targets.

Computed `wrapY` values, useful when eyeballing the result: Alaska ↔ Kamchatka
≈ 29.6; San Francisco ↔ Tokyo = 141; San Francisco ↔ Manila ≈ 182.2; Los
Angeles ↔ Sydney ≈ 278.9.

## 4. Implementation, by commit

### Commit 1 — the geometry helper

- Add `src/utils/ui/mapEdges.ts` (§3.4).
- Add `src/utils/ui/mapEdges.test.ts`:
  - a short edge returns exactly one segment, endpoint-to-endpoint, and no
    `wrapY`;
  - a wrapping edge returns two segments, one touching `x = 0` and one touching
    `x = width`, both starting at their own node;
  - both stubs leave the map at the same `y`, and that `y` is `wrapY`;
  - the result is the same whichever order the two nodes are passed in;
  - the four real edges of §1, fed from `TERRITORIES` / `CITIES`, wrap; a
    sampled set of ordinary edges on both boards does not (this is the
    regression guard on the threshold).
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
- Both boards keep their own node rendering — that stays two components on
  purpose (`docs/games/outbreak-gdd.md` §21.6 step 5 settled it).
- Gates: `npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.

### Commit 3 — calibration and the release note

Only after looking at both boards at fit width and zoomed in (`npm run dev`,
open a World Domination and an Outbreak game):

- Nudge any wrap label that collides with an existing city label. The known
  risk is the Outbreak right edge, where Tokyo (723, 141, `labelDir: 'e'`) and
  Osaka (724, 182, `labelDir: 'e'`) put their names at `x ≈ 733` on the same
  rows as the `San Francisco →` stubs at `wrapY` 141 and 182. Fix it by
  flipping those two cities' `labelDir` to `'n'` / `'s'` in
  `src/games/Outbreak/board.ts` — that field exists for exactly this — rather
  than by special-casing anything in `MapEdges`.
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
tests before any pixels move. Commit 3 must stay separate from 2 — it is the
one that needs a human to have looked at the board.

## 5. Verification

- `npm test` covers the geometry (commit 1's test file).
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
  its width would need `wrapFraction` passed explicitly. The helper takes it as
  a parameter for that reason; the test pins today's boards.
- **The art's seam.** The maths assumes the map art's left edge is
  geographically the same meridian as its right. Both boards' art is a standard
  Pacific-split world map, so this holds; and because both stubs leave at the
  same `y`, a small mismatch still reads as one deliberate line.
- **Not touching** the adjacency data, any API contract, `TrainTimeBoard`, or
  either board's node rendering. This is presentation only.
