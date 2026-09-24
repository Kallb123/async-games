# Kingdom Builder — Game Design Document

**Status:** In build. Time model (§5.5) and combat model (§7.6) decided;
Milestone A's prototype (PRs 1–5), the world map and multiple settlements
(PR 6), worlds on the dashboard (PR 7), more than one player in a world
(PR 8), the area registry and generated ground (PR 9), the overlay
vocabulary (PR 12), barracks and units (PR 13), ending a world (PR 14), the
map-shape overhaul (PR 15, §3.7), travel over the tiles (PR 16, §3.8),
building costs (PR 17, §4.5), wheat with land-driven production (PR 18,
§4.6), army dispatch and movement (PR 19, §6.2), fog of war (PR 20, §6.3),
automatic siege on arrival (PR 21, §8), combat resolution (PR 22, §7.6),
barbarian villages (PR 23, §3.4), settlers (PR 24, §4.4) and the market,
trade and caravans (PR 25, §4.7) are shipped. PR 26 (seasons) comes next;
§11.3 is the plan
for the rest, including two presentation PRs for the ground — transparent-backed tiles
(PR 29, §3.5.7) and animated tiles (PR 30, §3.5.8) — which can land whenever
their art is ready.
**Genre:** Asynchronous 4X / persistent-world empire builder
**Players:** up to 10 per world, competitive, no elimination-by-turn-order
**Session shape:** a long-running "world" spanning days to weeks, checked in on
repeatedly, not a single sitting

This document lays out the concept and works through the two design
questions that most affect everything downstream of them: how time passes
(turns vs. a real-time tick), and how combat is resolved. Both sections still
weigh several concrete approaches, because the trade-offs are what justify the
choice, but both are now **decided**: a fixed real-time tick (§5.5) and
deterministic multi-round combat with unit counters (§7.6). Later sections —
sieges, barbarian villages, terrain movement cost, and fog of war on army
movement — build on those two decisions rather than re-opening them.

---

## Table of contents

1. [High concept](#1-high-concept)
2. [Design pillars](#2-design-pillars)
3. [The world map](#3-the-world-map)
   - 3.1 [Representation](#31-representation)
   - 3.2 [Procedural generation](#32-procedural-generation)
   - 3.3 [Balance constraints](#33-balance-constraints)
   - 3.4 [Barbarian villages](#34-barbarian-villages)
   - 3.5 [Terrain areas, overlays and the tiled map](#35-terrain-areas-overlays-and-the-tiled-map)
   - 3.6 [World size](#36-world-size)
   - 3.7 [Map shape: ranges, not a central massif](#37-map-shape-ranges-not-a-central-massif)
   - 3.8 [The tiles are the roads: travel over the grid](#38-the-tiles-are-the-roads-travel-over-the-grid)
4. [Settlements](#4-settlements)
   - 4.1 [Layout](#41-layout)
   - 4.2 [Buildings](#42-buildings)
   - 4.3 [The economy loop](#43-the-economy-loop)
   - 4.4 [Founding new settlements](#44-founding-new-settlements)
   - 4.5 [Building costs and the starting stockpile](#45-building-costs-and-the-starting-stockpile)
   - 4.6 [Wheat, and the land around a settlement](#46-wheat-and-the-land-around-a-settlement)
   - 4.7 [The market, trade and caravans](#47-the-market-trade-and-caravans)
5. [Time model: turns vs. ticks](#5-time-model-turns-vs-ticks)
   - 5.1 [Option A — strict sequential turns](#51-option-a--strict-sequential-turns)
   - 5.2 [Option B — simultaneous ("WEGO") turns](#52-option-b--simultaneous-wego-turns)
   - 5.3 [Option C — fixed real-time ticks](#53-option-c--fixed-real-time-ticks)
   - 5.4 [Comparison](#54-comparison)
   - 5.5 [Decision](#55-decision)
6. [Armies and movement](#6-armies-and-movement)
   - 6.1 [Unit types](#61-unit-types)
   - 6.2 [Dispatch and travel time](#62-dispatch-and-travel-time)
   - 6.3 [Visibility and scouting](#63-visibility-and-scouting)
   - 6.4 [Arrival: siege begins automatically](#64-arrival-siege-begins-automatically)
7. [Combat resolution](#7-combat-resolution)
   - 7.1 [Option 1 — deterministic power comparison](#71-option-1--deterministic-power-comparison)
   - 7.2 [Option 2 — randomised dice/CRT resolution](#72-option-2--randomised-dicecrt-resolution)
   - 7.3 [Option 3 — multi-round attrition with unit counters](#73-option-3--multi-round-attrition-with-unit-counters)
   - 7.4 [Option 4 — deterministic core with bounded variance](#74-option-4--deterministic-core-with-bounded-variance)
   - 7.5 [Comparison](#75-comparison)
   - 7.6 [Decision, and future scope](#76-decision-and-future-scope)
8. [Sieges in detail](#8-sieges-in-detail)
9. [Victory, seasons, and catch-up](#9-victory-seasons-and-catch-up)
   - 9.1 [Ending a world early](#91-ending-a-world-early)
10. [Fit with the existing engine](#10-fit-with-the-existing-engine)
11. [Implementation plan](#11-implementation-plan)
    - 11.1 [Principles](#111-principles)
    - 11.2 [Milestone A — a working prototype](#112-milestone-a--a-working-prototype)
    - 11.3 [Milestone B — expanding functionality](#113-milestone-b--expanding-functionality)
    - 11.4 [Ordering constraints](#114-ordering-constraints)
12. [Open questions](#12-open-questions)

---

## 1. High concept

Ten kingdoms wake up on a continent none of them have seen before. Each
starts as a single town, three tiles wide, sitting on ground the map
generator promised would be no better and no worse than anyone else's. From
there, players fell timber, quarry stone, and dig iron to grow their town,
train soldiers to protect it, and — sooner or later — march on someone
else's.

Kingdom Builder is not a sit-down-and-finish match like the rest of this
app's catalogue. It is a **world**: a single persistent map shared by up to
ten players that runs for days or weeks, where a player's meaningful unit of
play is "check in, queue some things, see what happened while I was away,"
not "take my turn and pass." That shape is the reason sections 5 and 7 spend
as long as they do on options — the choice of time model and combat
resolution has to hold up over a game that outlives any single session,
between players who are never both looking at the screen at once.

**One-line pitch:** *Your town keeps building while you're at work. So does
theirs.*

---

## 2. Design pillars

| Pillar | Description | How it manifests |
|---|---|---|
| **Nobody blocks anybody** | No player's turn should require another player to act first. | No sequential turn order; every player can queue actions independently at any time |
| **Distance is the defence** | A settlement's safety comes from where it sits, not from a die roll. | Travel time scales with map distance and terrain (§6.2); scouting and forward bases matter more than raw army size |
| **You don't see it coming — you see it arrive** | Enemy armies march unseen; the siege they open with is the signal, not their departure. | Fog of war on troop movement (§6.3); a scout unit/upgrade is the only way to see further |
| **Losing is visible, not sudden** | A player should see a threat coming and have time to respond, even offline. | Siege begins automatically and does no damage on its own (§8); push notifications on siege onset |
| **The map made the terms, not the players** | Starting position should feel fair even though it's procedurally rolled. | Balance constraints on generation (§3.3), not hand-authored symmetric maps |
| **Depth from composition, not from bookkeeping** | Strategic choices should live in what you build and send, not in remembering to log in every hour | Resource/build queues run unattended; ticks/turns process automatically |

---

## 3. The world map

### 3.1 Representation

> **Superseded for movement by §3.8.** The graph below is how the map was first
> built and how it is drawn through PR 13. From PR 16 on, places are nodes that
> sit *on* a tile of the §3.5 grid, and armies travel over the tiles rather
> than along edges; edges survive only as derived, drawn routes. The rest of
> this section is kept because the reasoning — uneven resources, reuse of the
> map components — still holds.

A **node-and-edge graph**, not a hex or square grid: each settlement site and
each notable terrain feature (a forest, a mountain pass, a river crossing) is
a node, and travel routes between them are edges with an associated
**movement cost**, not just a fixed distance — an edge crossing a mountain
pass costs far more travel time than one across open plains, independent of
how many edges separate two points (§6.2 has the concrete multipliers). This
is a deliberate departure from a uniform grid for two reasons:

- It lets the generator place resource-rich terrain unevenly (a "wood belt,"
  an isolated mountain rich in iron) without those irregularities also
  distorting movement — an edge's travel cost is authored/generated
  independently of how the nodes are laid out visually.
- It matches this app's existing map tooling. World Domination and Outbreak
  already render node-and-edge boards through `ClickableMapNode`, `MapEdges`
  and `MapLabelLayer`, and pan/zoom through `BoardZoom`. A Kingdom Builder
  world map — inherently larger than either of those boards, since it has to
  seat up to ten settlements with breathing room between them — is exactly
  the kind of board `BoardZoom`'s deeper zoom step and `focus` prop (e.g.
  snapping to a settlement the instant it's attacked) were built for. This is
  a downstream implementation note, not a constraint on the design below, but
  it's worth flagging early because it argues for the graph representation
  over a hex grid the app has no components for.

Settlements themselves (§4) are a small, fixed 3×3 arrangement of building
tiles local to a node — the world graph is the strategic layer; the
settlement grid is the tactical/economic layer nested inside a single node.

### 3.2 Procedural generation

A world is generated once, before any player joins, in roughly this order:

1. **Seed the landmass.** Generate a rough continental outline (e.g. Perlin/
   Simplex noise thresholded to land vs. water), which constrains where nodes
   can exist and, with a second moisture field, becomes the tiled terrain
   areas of §3.5 — so the noise is also what the map is painted from, not only
   a generation-time constraint.
2. **Place terrain nodes.** Scatter forest, quarry, and ore nodes using
   Poisson-disc sampling (even-ish spacing, no two nodes on top of each
   other), each on ground of its own kind — a forest node in woodland, a
   quarry in hills, ore in mountains, read off the terrain field per §3.5.4.
3. **Place settlement sites.** Reserve a fixed number of sites (more than
   the player cap, so a world doesn't look emptied-out with fewer than ten
   joiners) far enough apart that a full world doesn't crowd anyone's
   starting radius, per the constraints below. Sites are typed at this
   point: **player start** (the ones the fairness band in §3.3 qualifies),
   **open expansion** (unclaimed, for §4.4 settlers), and **barbarian**
   (§3.4) — pre-populated with an NPC garrison from the moment the world is
   generated.
4. **Connect the graph.** Run a routine that guarantees connectivity (a
   minimum spanning tree first, so nothing is an island) and then adds extra
   edges for redundancy and chokepoints, echoing the "topological chokepoint"
   design already used in World Domination — a mountain pass or river
   crossing that funnels an army is more interesting than an open field.
   Assign each edge a **terrain type** (plains, forest, hill, mountain,
   river crossing) from the ground it actually crosses (§3.5.4), which §6.2
   turns into its movement-cost multiplier.
5. **Assign starting sites to players** at world-join time (not at
   generation time), by the fairness rule in §3.3.

### 3.3 Balance constraints

"Procedural" and "fair" are in tension — the generator has to be constrained,
not merely random, or some player spawns next to three iron nodes and another
spawns in a resource desert. Concrete constraints:

- **Resource parity radius.** Every candidate starting site is scored on the
  total resource yield of its land — from PR 18, the sum of its catchment's
  yield tiers (§4.6), and every start must yield all four resources.
  Only sites within a tight band of the map's median score are eligible to
  be starting sites at all; everything outside the band becomes a
  contestable neutral/expansion site instead.
- **Minimum starting separation.** No two starting sites may be closer than
  a fixed number of edges — this is what makes "scattered far across the
  world map" in the brief a hard rule, not a hope, and it's what makes
  travel time (§6.2) a real strategic layer instead of a formality.
- **No cornering.** A starting site can't have more than two other starting
  sites among its three nearest neighbours — otherwise one player ends up
  boxed in by rivals on all sides while another has an open, undefended
  frontier.
- **Symmetric-enough, not identical.** Full bilateral symmetry (mirrored
  maps) is the easy way to guarantee fairness, but it also makes the map
  memorisable and a little dull once players know the pattern. Preferred
  approach: don't mirror the map; instead re-roll/reject generation until
  every eligible starting site's resource-parity score and neighbour count
  fall inside tolerance. This costs generation time (rejection sampling can
  loop), not runtime complexity.
- **A deterministic seed per world**, stored, so a generated map can be
  regenerated for debugging or verified for fairness after the fact without
  re-deriving it from RNG state.
- **Parity is on total value, not on flavour.** A settlement site's adjacent
  terrain also decides *which* resource it's naturally good at (§4.2) — one
  site sits in the wood belt, another borders a mountain rich in iron. The
  resource-parity radius above only constrains the *total* reachable yield,
  not its composition, so two starting sites can be equally strong while
  pushing their players toward different early buildings. That's a feature —
  it gives ten simultaneous starts some texture — but it's also why the
  parity check has to be measured on aggregate value, never on a specific
  resource type, or "fair" quietly collapses into "identical."

### 3.4 Barbarian villages

> As shipped in PR 23: a quarter of the open expansion sites — 16 on a new
> world — are barbarian villages, chosen once the starts are fixed. Their
> garrisons are ranked by distance from the nearest player start rather than
> from the map centre, which §3.7's ranges no longer make meaningful: the
> nearest third hold 4 militia, the middle third 6 militia and 3 infantry, the
> farthest 8 militia, 6 infantry and 2 cavalry. An army camped at a standing
> village fights it on the tick it arrives, the village fortified as a town is,
> and — since a stand-off isn't a siege either — again every tick until one
> side is gone or the army is ordered away. Won, the village becomes the
> winner's settlement: a fresh town centre on the site's own land, garrisoned by
> the survivors. A player already holding two settlements burns it instead, and
> the site is open ground anyone can found on. The villages are public; what is
> left of a garrison is not, and shows only to a scouting army in sight (§6.3).
> First-pass numbers (§12).

Scattered across the map alongside player and expansion sites are
**barbarian villages**: NPC-held settlements that exist from world
generation, each with a fixed garrison that never queues buildings, trains
no reinforcements, and doesn't retaliate beyond defending itself. They exist
to give the map something worth fighting over before players are fighting
each other:

- **A softer path to a second settlement.** Conquering a barbarian village is
  an alternative to founding one via a settler (§4.4) — faster (no travel
  time spent walking a settler to open ground, just marching an army to a
  known, fixed location) but not free, since it costs an army instead of
  resources and settler time.
- **No siege phase.** A barbarian garrison doesn't get scared into
  surrendering and doesn't have production worth debuffing, so an army
  arriving at a barbarian village resolves combat (§7) immediately rather
  than opening a siege per §8 — that distinction only makes sense between
  players. Winning converts the village to the attacker's settlement,
  garrison and terrain bonus intact.
- **Garrison scales with distance from the map centre** (or with a village
  "age" if the world reseeds them over time), so the villages ringing the
  starting sites are a viable early target while ones deeper in
  contested/late-game territory are a real commitment — they're a graduated
  on-ramp to combat, not a single difficulty tier.
- **They inherit the same terrain-bonus rule as any other site** (see above),
  so a captured village is never just "another settlement" — it's a
  specific, scouted reason to go there.

### 3.5 Terrain areas, overlays and the tiled map

§3.1 settles what the *strategic* layer is — nodes and edges — and says nothing
about what the ground between them looks like. This section is the ground: the
generated **areas** the graph is drawn on top of (grass, fields, woodland,
hills, mountains, water — an open list, not a fixed one), the **overlays** that
sit on them (bridges, piers, roads, the landmarks that make a map feel like a
place), where their movement costs come from, and how the whole lot is painted
from hand-drawn tilesheets — including sheets whose edges are transparent
rather than grass-backed (§3.5.7), and tiles that animate (§3.5.8).

Both lists are registries rather than enums, because an overworld map is never
finished: the thing this section is most concerned with is that the tenth area
and the twentieth landmark cost one entry each, not a pass through the
generator, the cost walk, the renderer and the legend.

#### 3.5.1 What exists today, and what's missing

Worth stating exactly, because the gap is narrower than it looks:

- The generator already produces and stores a **scalar noise field** —
  `landmass.values`, a 48×48 grid of 0–1 elevation-ish values over the world's
  100×70 coordinate space, with a `landThreshold` splitting land from water. It
  is used twice: to reject node placements that fall in the sea, and to bias a
  terrain node toward ore at high values.
- The map screen renders that field as **one flat silhouette** — every
  above-threshold cell emitted as a rectangle into a single `<path>`, in one
  colour — with `MapEdges`, the terrain and settlement nodes and
  `MapLabelLayer` drawn over it.
- An edge's `terrain` and `movementCost` are assigned in `connectWorldGraph`
  from **the nearest terrain node to the edge's midpoint**, plus a synthetic
  central river: a vertical line at the mean node x with two hard-coded
  latitude bands as its bridges.

So there is a field, and there is a renderer, and neither knows what the other
is doing. Two consequences, and the second is the one that matters:

- **There are no areas.** Nothing anywhere says "this region is woodland". A
  forest node is a dot on blank ground rather than the middle of a wood, and
  the map reads as a silhouette with pins in it.
- **Movement cost is invented rather than observed.** An edge is a mountain
  pass because a node with ore happens to be nearest its midpoint, and it is a
  river crossing because of a line the map never draws. A player looking at the
  map cannot see why a route is slow, and the one piece of terrain the
  generator treats as impassable — that river — is invisible. §6.2 promises
  that "an edge's cost is fixed and known to every player who can see the map";
  today the map is not enough to know it from.

#### 3.5.2 Areas: an open registry

An **area** is the ground itself: exactly one per tile, mutually exclusive,
tiling and autotiling, carrying a movement weight. The grid is square, over the
same 100×70 coordinate space the map already uses — square matters, because the
existing 48×48 field has cells 2.08 × 1.46 world units and art drawn for a
square tile stretches visibly on those. A tile of 2 × 2 world units gives a
50 × 35 grid: 1,750 tiles, a sane amount of art to author against and a small
amount of data to ship. (The world has since grown to 200×140 — see §3.6 — so
a new world's grid is 100 × 70, 7,000 tiles, at the same 2 × 2 tile.)

The set of areas is **a registry, not a fixed list**. This is the part to get
right, because a fantasy overworld accretes ground types forever — a desert
arrives, then snow, then a blighted waste around whatever the late game turns
out to be — and each one should be an entry, not an edit to the generator, the
cost walk, the renderer and the legend.

One entry per area, in `AREAS`:

| Field | What it's for |
|---|---|
| `code` | One character. This is the persisted format — see the storage rule below |
| `name` | What the legend calls it |
| `weight` | Its §6.2 movement multiplier, or `impassable` |
| `priority` | Paint order, which is also border-overlay order (§3.5.5) |
| `fallbackColour` | The flat fill used when there is no art yet, or the sheet fails |
| `placement` | How the generator decides a tile is this area (below) |

**Nothing outside the registry may branch on an area by name.** The generator
walks `placement`, the cost walk reads `weight`, the renderer reads `priority`
and the manifest, and the legend lists the whole registry. That is what makes
"add a desert" one entry plus one block of art, and it is the rule a reviewer
should fail a PR over — a `switch` on area is how this ends up back where it
started.

The launch set, which is the brief's list plus what a map needs to make it
read as a place:

| Area | Weight | Placement |
|---|---|---|
| Ocean | Impassable | Water (below the land threshold) connected to the map border |
| Lake | Impassable except at a crossing | Water not connected to the border |
| River | Impassable except at a crossing | Traced downhill from high ground to the sea, one tile wide |
| Beach | ×1 | The land band where the map meets ocean — derived, not noise |
| Grass | ×1 | The baseline: middling elevation, middling moisture |
| Fields | ×1 | Grass within a short radius of an occupied or barbarian site |
| Woodland | ×1.5 | Middling elevation, high moisture |
| Hills | ×2 | Upper-middle elevation |
| Mountains | ×3.5 | High elevation |
| Marsh | ×2.5 | Low elevation, very high moisture, near water |

Later, each one entry and one block of art: desert and dunes, tundra and snow,
orchard, jungle, volcanic waste, whatever a season's theme wants. Nothing below
this line needs to know they arrived.

`placement` covers the two shapes those rules come in, which is the whole
reason it is a field rather than one big lookup:

- **A window on the noise** — an elevation range and a moisture range. Ocean,
  grass, woodland, hills, mountains, marsh are all this, and a new area of this
  kind is genuinely one entry.
- **A pass** — a small function run after the windows, for the areas that are
  about *relationships* rather than values: the border flood fill that tells
  ocean from lake, the downhill trace that carves rivers, the shore band that
  lays beach where land meets ocean, and the radius that paints fields around
  inhabited sites. Each is a named function the registry points at, tested on
  its own.

So generation order gains a step: noise → windows → passes → smoothing, and
**fields run after settlement sites are placed**, because "someone farms here"
is a fact about the sites, not about the noise. A couple of rounds of
majority-of-neighbours smoothing finishes, since one stray mountain tile in a
field is noise rather than terrain, and every stray tile is also a tile the
border art has to make sense of.

**Storage, and the one rule that matters.** The grid is stored on the world
document as one character per tile in a single string (`"gggwwhh…"`, row-major,
1,750 characters) — smaller on the wire than 1,750 numbers, compresses well,
and legible in a shell when a generated world looks wrong. Which makes those
codes a persisted wire format, so:

- **Codes are append-only. Never reused, never renamed.** Reusing a retired
  area's letter silently rewrites the ground under every world already stored.
  A retired area keeps its code reserved in the registry with a note.
- **An unknown code must never throw.** During a rolling deploy an older
  instance can read a world a newer one generated, so an unrecognised character
  renders as neutral ground at grass weight and logs once. A map that draws
  something slightly wrong for a minute beats a map that 500s.
- Single characters cap the registry at the printable ASCII range, which is far
  more areas than this game will ever have. If it were ever reached the format
  would go to two characters per tile, which is a migration — which is the real
  reason for the append-only discipline.

#### 3.5.3 The overlay layer: what sits on the ground

Bridges and piers are not areas. A bridge is *over* a river, a pier sticks out
*into* a lake, and a road runs *along* grass — each one is a thing on top of
ground that still exists underneath it, and forcing them into the area grid
would mean an area per combination ("river with a bridge", "grass with a road
and a signpost") which is the combinatorial mess §3.5.5 avoids for borders.

So there is a second, **sparse overlay layer**: a list of
`{ tile, code, orientation? }`, not a full grid, because overlays are rare —
tens of entries against 1,750 tiles. It has its own registry, `OVERLAYS`, with
the same "nothing branches on it by name" rule, and two things an area entry
doesn't have:

- **A movement effect, stated explicitly**: `passable` (a bridge makes an
  impassable tile crossable at a stated weight), `weight` (a road is faster
  than the ground it runs on), or `none`. Most overlays are `none`, and saying
  so in the entry is the point — a decorative ruin that quietly changed a
  travel time would be a genuinely nasty bug to find.
- **A placement source**, because overlays arrive two ways: *derived*, from
  something the generator already worked out, or *scattered*, by a seeded pass
  with rules.

The launch vocabulary:

| Overlay | Movement | Where it comes from |
|---|---|---|
| Bridge | Makes river/lake tiles passable at ×2.5 | Derived: the crossing tiles §3.5.4's connectivity pass already found |
| Ford | Passable at ×2 | Derived: a crossing at a shallow, narrow point instead of a bridge |
| Pier | None — it is a landmark, not a route | Derived: a shore tile beside a settlement site on the coast |
| Road | ×1 whatever the ground beneath it, and never more than that ground alone would cost | Derived: the tiles under an edge between two occupied settlements |
| Ruins | None | Scattered: grass or woodland, away from sites |
| Standing stones | None | Scattered: hills, away from fields |
| Shipwreck | None | Scattered: ocean tiles near the shore |
| Signpost | None | Derived: a tile where three or more edges meet |
| Watchtower | None | Scattered: a high tile with a wide view |

Later, the same way: windmills, farmsteads beside fields, a lighthouse on a
headland, mine heads at ore nodes, a wizard's tower where the season's theme
wants one. Each is one registry entry, one art entry, and — if it is scattered
rather than derived — one small placement rule.

Two properties worth stating because they are what keep this layer honest:

- **Derived overlays are not a second source of truth.** A bridge exists
  *because* connectivity made a river crossing there; it is written in the same
  generation pass, from the same decision, so the map cannot show a bridge
  where an army cannot cross, or a crossing with no bridge drawn.
- **Overlays are generated once and stored, not recomputed per render.** The
  client draws what it is given. If player-built roads or bridges ever arrive
  (§4.4's expansion is the obvious hook), they are new entries appended to this
  same list, which is why it is a list and not a derived function.

#### 3.5.4 Areas and overlays decide movement cost

This is the point of the field, not a side effect of drawing it. §6.2's
multipliers stop being a label on an edge and become **weights on the ground
the edge crosses**:

- An edge's cost is a walk of the tiles its straight line passes through
  (a supercover line, so no diagonal slips between two tiles), summing each
  tile's weight — the area's, or the overlay's where one overrides it — by the
  length of line inside the tile. A short edge over mountains can cost more
  than a long one over grass, which is exactly the "three hops is never three
  hours" claim §6.2 makes.
- `EdgeTerrain` survives as a **derived label** — the most expensive area the
  edge crosses a meaningful share of — so `MapEdges`, the edge's UI copy and
  `chokepoint` all keep working unchanged, and a "mountain pass" edge is now
  one the player can see crossing mountains.
- **Water is impassable, and that is where crossings come from.** An edge whose
  walk touches ocean is rejected outright during connectivity; an edge clipping
  a river or a lake at a narrow point becomes a `river-crossing`, keeping its
  higher multiplier and its `chokepoint` flag, and gets a bridge or ford
  overlay written on those tiles in the same pass (§3.5.3). The synthetic
  centre-line river and its two hard-coded bridge bands go away entirely — the
  funnels become real water in a real place, with something drawn across it,
  rather than an invisible rule.
- **Terrain nodes sit on matching ground.** A forest node is placed on a
  woodland tile, a quarry on hills, ore on mountains — read off the field
  instead of `terrainFor`'s elevation-and-a-die-roll, which today can put a
  forest on bare grass. §3.3's fairness scoring doesn't change shape (it still
  scores reachable yield), but it is now measured over ground a player can look
  at and understand.

One consequence to be deliberate about: the same three-hop route can cost
differently in two different worlds, more so than today. That is the intent —
the map is information — but it means §3.3's parity band is doing more work, so
the fairness test that generates 20 worlds needs to assert on *time-weighted*
reachability once cost comes from terrain, not just on hop-count reachability.

#### 3.5.5 The tilesheets and their manifest

Art is **a list of sheets, not one sheet.** Each is a grid of equal tiles, and
each declares its own tile size, because art arrives in batches over months and
the batch that brings a desert has no reason to match the pixel grid of the
batch that brought the sea. Sheets live at
`art-masters/kingdombuilder/<name>.png` with the served copy at
`public/art/kingdombuilder/<name>.png`, per the art pipeline in AGENTS.md —
save both, run `npm run optimise-art`, commit what it writes.

**Borders are autotiled, not authored per pair.** Each tile asks which of its
four neighbours are the *same* area as itself; those four yes/nos are a 4-bit
mask, 0–15, and the mask picks which of that area's 16 variants to draw. The
alternative — a bespoke transition strip for every pair of areas that can meet
— is 45 pairs for ten areas and grows as the square of the registry, which is
how a hand-drawn tileset turns into a year of work. Instead each area draws its
own edge over the area beneath it, in the registry's `priority` order, so a new
area costs 16 tiles and no new pairings at all.

**Where the art has inner corners, it can ask about eight neighbours instead
of four.** A 4-bit mask cannot describe the square where two arms of woodland
close around one square of grass: all four sides match, so it is mask 15, the
plain interior tile, and the grass sits in it as a hard square. Asking about
the four diagonals as well fixes that. It does not cost 256 tiles: a diagonal
only changes what a square looks like where *both* the sides beside it already
match — with a side open, that corner of the tile is drawn as an edge and what
lies past it is hidden — which collapses the 256 raw combinations onto 47
distinct tiles, the shape a "blob" tilesheet is drawn in. So there are two mask
layouts and the art decides between them: a 3×3 nine-slice, which is what most
hand-drawn sheets arrive as, fills a `mask16` (nine real squares and seven
aliases, see the mapper below); a sheet drawn with its inner corners fills a
`mask47`. Neither is the "right" one — `mask47` looks strictly better and costs
strictly more drawing.

**Which square is which is declared, not guessed.** The manifest —
`tileset.ts`, beside the game's `meta.ts` — is the single source of truth, and
has two halves:

- **The sheets.** Per sheet: its path, its **tile width and height in pixels**,
  and its `margin` and `spacing` (the outer border and inter-tile gutter that
  real tilesheets usually have). Columns and rows are derived from the image's
  own dimensions, so they cannot disagree with the file.
- **The tiles each registry entry uses**, as `{ sheet, index }` references. The
  shape of that reference is one of five **layouts**, and the same five serve
  areas and overlays both:
  - `mask16` — sixteen variants picked by the 4-bit neighbour mask. Areas use
    this, and so does anything that connects to itself, like roads — an
    overlay masks against the other overlays around it, not against the ground
    under it, so a road reads its own run and not the grass it crosses.
  - `mask47` — the same, asking about all eight neighbours, for art drawn with
    inner corners.
  - `orientation` — variants picked by the direction of the thing the tile sits
    on: a bridge across a river runs the way the crossing runs.
  - `variants` — a handful of interchangeable tiles, picked by a seeded hash of
    the tile's coordinates, so a big field of grass doesn't visibly repeat and
    the pick is stable across renders and across players.
  - `single` — one tile, for a landmark that only looks one way.

  Any slot of a `mask16`/`mask47` entry may itself hold several
  interchangeable tiles instead of one — the same seeded pick a `variants`
  area uses, nested one level down. That is the escape hatch for the slot a
  big filled area leans on hardest: mask16's fully-interior slot (mask 15),
  where a single square of grass repeating across a whole field of it reads
  as an obvious tile rather than a texture.

**A reference may be a piece several squares across.** A walled town, a church,
a two-square cliff face: art that no single square of ground can hold. So a
`{ sheet, index }` may also carry a `width` and `height` in sheet squares, with
`index` as the piece's top-left, and an anchor saying which square *of the
piece* sits on the square of map it was placed on. The anchor is what makes the
common case work: a building stands on one square of ground and rises over the
squares behind it, so it defaults to the piece's bottom-left corner and the art
hangs above and to the right of the placement. A piece is drawn one square at a
time rather than as one blit, so a sheet with a gutter between its squares can
hold pieces at all.

Only an overlay may be a piece, and only on its non-mask layouts. An area is a
ground fill — exactly one square of art per square of map — and a mask tile is
picked per square whoever declares it, so a road that autotiles is still laid
one square at a time. The guard says all of this rather than leaving it to be
remembered.

Nothing else goes in the manifest: no weight, no placement rule, no cost. The
manifest describes the art; the registries (§3.5.2, §3.5.3) are the game. An
area with no manifest entry yet is drawn in its fallback colour, which is what
lets a registry entry land before its art does.

**The mapper.** Writing down a few hundred sheet coordinates by counting
squares in an image viewer is not a job for a human, so the manifest is
authored at `/admin/kingdombuilder-tiles`, in the spirit of the Race Cars track
editor (`docs/admin-tools.md`):

- **Load a sheet**, either from `public/art` if it is already committed or
  straight off the disk with a file picker, so a sheet can be mapped the
  minute it arrives and before anything is committed anywhere.
- **Pick the tile size in pixels** — width and height independently, plus
  margin and spacing — with the grid overlay redrawing live so misalignment is
  obvious rather than discovered later. It offers the sizes that divide the
  image evenly in the usual range as one-tap suggestions, warns when the
  current numbers leave a partial row or column (the classic sign that the
  sheet has a gutter you haven't told it about), and remembers the last values
  through `useStoredValue` so a second sheet from the same artist starts where
  the first left off.
- **Assign squares**: click a tile, say which registry entry it belongs to and
  which role it plays in that entry's layout (which mask index, which
  orientation, or "another variant"). A `mask47` role is the same four "matches"
  checkboxes plus the four diagonals, each greyed out unless both the sides
  beside it are ticked, so a role no square of map could ever ask for can't be
  entered. A piece states its size in squares and where its anchor sits, on the
  layouts allowed to be one. A mask role that already has a tile offers its own
  "add as another variant for this slot" checkbox — ticking it before the next
  click folds that square into the slot's tile instead of replacing it, growing
  a plain slot into a variant array exactly the way a `variants` entry's list
  grows one click at a time.
- **Import a nine-slice**: most hand-drawn sheets come as 3×3 blocks — corner,
  edge, centre — which is nine of the sixteen neighbourhoods a `mask16` wants.
  One click on the block's top-left square fills all sixteen: the nine it has
  from the block, and the seven a nine-slice never draws (an isolated square,
  the end of a peninsula, a one-square-wide strip) aliased onto the closest it
  does have. "Closest" weighs the two ways a substitute is wrong differently —
  art showing open ground where there should be an edge is a hard seam and
  costs double; art drawing an edge where the patch continues is a stray line
  that reads as texture. Ties break low, so re-importing the same block prints
  the same file.
- **Copy out the finished `tileset.ts`.** Like the track editor it is a
  build-time authoring aid behind `AdminPage`'s client-only gate — it persists
  nothing, there is no `/api/admin` route behind it, and what it produces is a
  file a human commits.

Worth separating two things that both call themselves a tile size: a **world
tile** is 2 × 2 world units of ground (§3.5.2) and never changes; a **sheet
tile** is however many pixels of art the artist drew, per sheet. The pixel size
decides only how the sheet is cut and how large the composite is drawn — art at
16px and art at 64px describe the same patch of ground. Where sheets disagree,
the composite is rendered at the largest declared tile size, so a later, more
detailed sheet is never downsampled to match the first one that arrived — and
the smaller sheet is upscaled with smoothing off, because this is pixel art and
a bilinear blur is the one thing it must never be put through.

A guard test keeps the manifest honest: every referenced sheet exists, every
piece lands wholly inside the sheet's derived bounds (a 3-wide piece two squares
from the right edge would otherwise wrap onto the next row and quietly draw
someone else's art), every `mask16` entry declares all sixteen and every
`mask47` all forty-seven, no mask slot declares a variant array with nothing in
it, no area or mask entry declares a piece, no anchor sits outside its own
piece, every registry code is unique and every retired code stays reserved.
That is the same "registry-and-its-test" shape the repo already uses for game
guides and themes.


#### 3.5.6 Rendering beneath the node graph

The interactive layer does not change. `MapEdges`, `ClickableMapNode`,
`MapLabelLayer` and `BoardZoom` stay exactly as they are, and the tiles go
*under* them — "beneath the node graph" both visually and in the DOM.

The draw is three passes over one surface, in this order: every area's fill in
`priority` order, then every area's border-overlay tiles in that same order,
then the sparse overlay list (§3.5.3). All three iterate the registries, so an
area or an overlay added later is drawn without this code being touched.
(§3.5.7 changes what pass one starts a square from when its art is
transparent-backed; §3.5.8 adds a separate animated layer over the result, and
leaves the composite itself static.) Three
ways to put the result on screen:

| Approach | Verdict |
|---|---|
| One `<image>` or `<use>` per tile inside the existing `<svg>` | Simplest, and 1,750 extra SVG nodes on the one screen this game always has open — all of them repainted as `BoardZoom` resizes the map |
| An SVG `<pattern>` per area | Cheap, and cannot express borders or variants — it tiles one image, which is the thing we specifically don't want |
| Composite the tiles into an offscreen `<canvas>` once, and place the result in the `<svg>` as a single `<image>` | One raster, one DOM node, and the tile loop runs once per world rather than once per paint |

**Decision: the third.** An offscreen canvas is the compositor, not a layer on
screen: the three passes draw into it once, and what goes into the map is one
`<image href={…} width={100} height={70}>` as the first child of the existing
`<svg>`, before `MapEdges`. That is the same single-`<image>` board World
Domination and Outbreak already draw, which matters more than it sounds:
`BoardZoom` zooms by setting the `<svg>`'s width
(`.ag-board-scroll svg { width: var(--ag-board-zoom) }`), so anything that is
not inside the `<svg>` does not scale with the map. A sibling `<canvas>` would
have to re-derive that sizing and stay in step with it; an `<image>` inherits it
for free, and no CSS or zoom code changes at all.

The canvas is drawn at a fixed pixel size — the largest declared tile size ×
the grid, so a sheet at that size is never resampled on the way in, and a
smaller one is upscaled with smoothing off (§3.5.5) rather than blurred — and
handed over as an
object URL from `canvas.toBlob`, revoked when the map unmounts, rather than a
`toDataURL` string that would hold a megabyte of base64 in the React tree. A
pixel-art sheet gets `image-rendering: pixelated` so zooming in doesn't smear
it.

Two fallbacks, both mandatory rather than nice-to-have:

- **No sheet, an entry with no art yet, or a sheet that failed to load** →
  fill those tiles with the registry's fallback colour, in the same pass. This
  is what makes the areas shippable before any art exists at all, what lets a
  new area land ahead of its tiles, and the honest answer to a 404 on a phone
  with a bad connection: a coarse but correct map, not an empty frame. An
  overlay with no art draws nothing rather than a coloured square — a missing
  bridge should read as "not drawn yet", not as a mystery block on the river.
- **A world with no terrain field** — every world generated before this lands —
  → keep drawing today's flat silhouette from `landmass.values`. The field is
  written at generation, so old worlds simply don't have one, and they are
  *deliberately not backfilled*: a live world's ground changing under the
  players would move every movement cost they have been planning around.
  Regenerating from the stored seed is possible (that is what storing it is
  for) and stays a deliberate, manual act rather than a migration that runs
  itself.

The map's own accessibility doesn't change: the `<svg>` keeps its `role="img"`
and label, and the tiles are decoration under it — a screen reader has never
been reading the silhouette. The legend is generated from the registry rather
than hand-written, because a colour that means something to a sighted player
should be named somewhere, and a hand-written legend is the first thing to go
stale the next time an area is added.

#### 3.5.7 Transparent-backed tiles

Every sheet shipped so far is **grass-backed**: an edge tile of woodland,
beach or water is drawn over a square of grass, because the artist assumed
grass is what surrounds it. That holds while grass is the only thing any area
meets, and stops holding everywhere else. Where woodland meets beach the
woodland's edge tile brings a strip of grass with it, so the two are separated
by a sliver of ground that isn't on the map; where mountains meet water, the
same. With ten areas and more to come (§3.5.2), "everything borders grass" is
a promise the generator does not keep, and the fringe is the most visible seam
on the map.

So the renderer also accepts **transparent-backed** art: an edge tile whose
open side is alpha rather than grass, meaning "whatever is next door shows
through here". It is how most commercial and open overworld tilesets are drawn
now, and it is what lets any two areas meet without anyone drawing that pair.

**Declared per art entry, not guessed per pixel.** An `AREA_ART` entry gains an
optional `backing: "baked" | "transparent"`, defaulting to `"baked"`, so every
entry already in `tileset.ts` means what it printed. It lives on the entry
rather than the sheet because one sheet can carry both kinds — and on the
entry rather than the tile, because an area whose edges disagree about what
lies under them has no coherent look. Overlays don't need it: an overlay is
drawn over ground that is already there (§3.5.6's third pass), so a bridge
with a transparent background has always worked.

**What shows through.** A transparent edge tile's square is drawn in two steps
instead of one: first an **underlay** built from its neighbours, then the tile
itself over it. The underlay is split into four wedges — the triangles from the
square's centre to each of its sides — and each wedge is filled with the
**interior** tile of whatever area lies across that side: the fully-matched
slot of a mask entry (mask 15, or the blob's full tile), a `variants` entry's
seeded pick, or the registry `fallbackColour` for an area with no art. A side
that matches the square's own area fills with its own interior, which the
tile's opaque part will cover anyway. Wedges rather than one underlay per
square because a square of woodland can have beach to its north and water to
its east, and each side's gap should show what is actually on that side. The
wedge seams run through the tile's corners, which is where an edge tile's own
art is densest, so the join between two different underlays is hidden under
the tile rather than drawn across its open side.

Consequences worth being deliberate about:

- **Two transparent areas meeting each draw their own fringe over the
  other's interior.** Woodland's edge shows beach through it, beach's edge shows
  woodland through it, and the boundary reads as the two blending. This is
  symmetric, so `priority` stays what it was — paint order — rather than
  becoming a rule about which area wins a border.
- **A baked area next to a transparent one still works.** The baked tile
  covers its own square; the transparent neighbour shows the baked area's
  *interior* tile through its gap, not the baked edge tile with its grass
  fringe, which is the whole point.
- **An interior tile has to be opaque.** It is what fills other areas' gaps,
  so an interior with holes would show through to nothing. The guard test
  checks this rather than trusting it (below).
- **Mixing is allowed, and it is a migration path.** A sheet can be redrawn
  one area at a time — mountains first, since they look worst on grass —
  without the rest of the map changing.

Pass one of §3.5.6 changes shape to fit: a square whose area is baked (or has
no art) still starts from its fallback colour, and a square whose area is
transparent starts from its four-wedge underlay. Passes two and three are
unchanged. The cost is up to four extra clipped `drawImage` calls per
transparent edge square, once per world, into the same offscreen canvas — no
new DOM, and nothing per frame.

**The art pipeline has to keep the alpha.** `npm run optimise-art` quantises to
a 256-colour palette; that keeps a transparent index, but a soft
anti-aliased edge gets its alpha quantised along with its colour. Pixel art
with hard alpha edges is unaffected. Hand-painted art with feathered edges
needs checking before and after the optimiser, and the PR lands with one such
sheet so the round-trip is exercised rather than assumed.

**The guard, extended.** `tilesetGuard.ts` currently reads only a PNG's IHDR
header. For a transparent entry it decodes the sheet with `sharp` (already a
dev dependency, via the optimiser) and asserts that every interior tile it
declares is fully opaque — the one property the underlay depends on. The
opposite check is useful as a warning, not a failure: a `"baked"` entry whose
edge tiles carry real transparency is probably a sheet someone forgot to
declare.

**The mapper** (§3.5.5) draws the loaded sheet over a checkerboard, so alpha
is visible rather than rendered as white. When the sheet has an alpha channel
with transparent pixels in it, the backing control defaults to `"transparent"`
and says why. The slot preview for a transparent entry shows the tile over a
chosen neighbour area — beach, water, grass — so an artist sees the seam they
are about to ship.

#### 3.5.8 Animated tiles

Water that shimmers, a fire burning in a ruined watchtower, fields and
woodland moving in the wind, a windmill's sails turning. None of it changes
what a tile *is*, but a map that moves reads as a place, and a player who
opens the world to check a timer sees that it is alive. This is the one part
of the ground layer that is not "composite once, draw forever", so most of
this section is about keeping the cost of it bounded.

**What animates.** Any area art entry or overlay art entry may declare an
`animation`. An animated entry's tiles are **frames**: frame 0 is the tile the
entry already declares, and frames 1…n−1 are found by a fixed **offset** on the
same sheet.

```ts
animation?: {
    frames: number;          // 2–8
    frameMs: number;         // ≥ 120 — pixel art animates at 4–8 fps, not 60
    offset: { columns: number; rows: number }; // frame k of any tile is k × offset squares from frame 0
    phase?: "seeded" | "sweep"; // default "seeded"; see below
}
```

The offset is the layout nearly every animated tileset is drawn in: a whole
copy of the tile block per frame, side by side or stacked. Declaring it once
per entry means a 47-slot water entry becomes animated with one field, not 47
lists of frames. A sheet whose frames are scattered arbitrarily is rearranged
in the art tool into that shape before it is committed, rather than
accommodated with a second way of declaring frames; that keeps the manifest,
the guard and the mapper to one model. Every slot, variant and piece square
of an animated entry animates with the same frame count and timing, so a
shoreline and the open water behind it ripple together.

**Why not just recomposite.** §3.5.6 composites the whole map into one canvas
because the tile loop is expensive and the result is large: at 100 × 70
squares and 32px art, the canvas is 3,200 × 2,240 — about 28 MB decoded. Doing
that per frame, or holding one full-map raster per frame, is out of the
question on a phone. An on-screen canvas redrawn per frame is ruled out for the
reason §3.5.6 gives: `BoardZoom` sizes the `<svg>`, and anything outside it has
to re-derive that sizing.

**Decision: a second, SVG-native layer whose size is bounded by the art, not
by the map.** The approach rests on one observation: however many squares of
water there are, there are only as many *different* animated squares as the
manifest declares.

1. **An atlas of frames.** After the static composite, the renderer bakes every
   frame of every distinct animated square it actually needs — after the mask
   slot, the variant and the piece part have been picked — into one small
   atlas canvas at the composite's tile size, smoothing off. One `toBlob`, one
   object URL, revoked on unmount exactly like the composite's.
2. **One `<pattern>` per (square, frame).** Each is `patternUnits="userSpaceOnUse"`,
   one world tile square, anchored at the map's origin, so it lines up with
   the grid exactly. Its content is the atlas `<image>`, offset so that frame
   sits in the pattern's one tile.
3. **One `<path>` per (square, frame, phase group)**, covering every map square
   that draws that square of art, in the same run-length rectangle form the old
   silhouette used. Frame paths are shown one at a time by a CSS
   `visibility` keyframe with `steps()`. Each path's `animation-delay` is set
   to its frame's slot in the cycle. Toggling visibility on a handful of paths
   is supported the same everywhere, whereas animating content *inside* a
   `<pattern>` has a history of browsers not repainting it. That is why the
   frames are separate patterns rather than one moving one.

The layer sits between the composite `<image>` and `MapEdges`, inside the same
`<svg>`, so `BoardZoom` scales it for free and it stays *beneath the node
graph* as §3.5.6 requires. Its DOM is bounded by *distinct animated squares ×
frames × phase groups* — tens to low hundreds of nodes for a realistic
manifest — whatever the size of the world. A 7,000-square ocean is still one
path per frame.

**The static composite leaves animated squares to the layer above.** If the
composite drew frame 0 under the animated layer, a transparent frame (§3.5.7)
would show frame 0 through its gaps. So an animated square gets only its
underlay in the composite: the four-wedge underlay for a transparent entry, or
its fallback colour for a baked one. The layer draws all of its frames,
including frame 0. The two sections compose cleanly: transparency decides what
is under a square, animation decides what is drawn on it.

**Phase, so a whole ocean doesn't blink in unison.** A square's phase offsets
where in the cycle it starts. `"seeded"` picks it from the same stable
coordinate hash `seededVariantIndex` uses, split into a few groups, so
neighbouring squares are out of step and the same for every player. `"sweep"`
derives it from `col + row`, so a gust visibly travels across a field or a
wood. The number of phase groups is capped (four) because each one multiplies
the path count.

**Performance and restraint:**

- **`prefers-reduced-motion` gets frame 0, still.** The layer is still drawn —
  it is where animated squares' art now lives — but its keyframes are switched
  off in the same `@media (prefers-reduced-motion: reduce)` block
  `ag-theme.css` already uses elsewhere. The map keeps its look and drops only
  the motion.
- **The map stops when nobody can see it.** Browsers already throttle
  animations in a hidden tab. The layer also pauses (`animation-play-state`)
  while the map is scrolled out of view, using an `IntersectionObserver` on the
  board, so a map scrolled away from on its own page costs nothing.
- **Slow on purpose.** `frameMs ≥ 120` is enforced by the guard, not left as
  advice. Every frame step repaints the map's visible region, and 4–8 fps is
  both the budget and how pixel art is meant to move.
- **A budget, measured.** The PR that lands this profiles a 100 × 70 world
  with animated water and woodland on a mid-range Android phone, zoomed out and
  zoomed in. It states the frame cost in the PR description. If the fully
  zoomed-out view is over budget, the fallback is to animate only from the
  first zoom step in, where far fewer squares are on screen. That is a
  one-line condition on the layer, not a redesign.
- **Nothing animates the node graph.** Settlements, edges and labels are the
  information on the map, and they stay still. Motion belongs to the ground and
  the landmarks on it.

**Overlays animate the same way, and for free.** An overlay placement resolves
to one or more squares of art (a piece is drawn a square at a time, §3.5.5), so
an animated overlay's squares go into the same atlas and the same
path-per-frame groups as an area's. A burning watchtower, a turning windmill
and a flag on a keep need no code of their own. They also come out as the
cheapest case, because overlays are sparse.

**The guard** checks what can be checked statically: `frames` in 2–8,
`frameMs ≥ 120`, a phase from the list, and every frame of every declared tile
landing inside the sheet's bounds. The last is the same bounds check pieces
already get, run once per frame offset, so an offset that walks frame 3 off
the right edge of the sheet fails the test instead of drawing someone else's
art.

**The mapper** gains a frames control on the entry — frame count, frame time,
phase — and sets the offset by asking for one click: "now click frame 2 of the
tile you just assigned". The entry's preview then cycles through its frames,
so a wrong offset shows as a stutter before anything is committed.

### 3.6 World size

A world is **200 × 140 world units** — doubled in both directions from the
100 × 70 the generator first used, so four times the ground for the same ten
seats. Everything that fills the map scales with its area rather than staying
fixed: four times the terrain nodes (128), four times the expansion sites (56,
still beside exactly ten player starts), a river per original map's worth of
ground, and four times the scattered landmarks. The noise lattices scale with
the width too, so a hill range or a wet patch is the same size in world units
as before rather than the old map magnified — a bigger world, not a zoomed-in
one. Spacing rules (minimum node and site separation, the fields radius, the
fairness reach) are unchanged, which is what keeps the density the same.

Worlds generated before the change keep their stored 100 × 70 dimensions; the
map screen reads its viewBox off the stored landmass, so both sizes draw.

### 3.7 Map shape: ranges, not a central massif

Every generated world today has the same silhouette: an island with **one
block of mountains in the middle**, hills ringing it, and grass and woodland
around the coast. That is not bad luck — it is the generator doing exactly what
it was written to do, and worth diagnosing precisely before redesigning:

- `generateLandmass` computes one value per cell as
  `islandFalloff × (0.58 + noise × 0.42)`. The falloff is a radial term, 1 at
  the centre and 0 at the coast, so the **same number is both "how far from the
  sea" and "how high"**.
- The area registry (§3.5.2) reads that number as elevation: hills from 0.52,
  mountains from 0.66. The only cells that can reach 0.66 are the ones where
  the falloff is still near 1 — the middle of the map. The noise term only
  wobbles the edge of the blob; it can't move it.
- Rivers are traced downhill from high ground (§3.5.2), so they all start at
  that one massif and radiate outward like spokes, which is the second thing
  that makes every world look alike.

The consequence is also a gameplay one, not just a looks one: a single central
wall of ×3.5 ground sits between every pair of opposite starts, so the
"interesting chokepoint" of §3.2 degenerates into "walk round the edge", the
same for every world.

**The fix is to separate land from height.** The landmass stays what decides
land versus sea; elevation becomes its own field, built from features that are
placed on purpose rather than falling out of the coast:

1. **Coastline.** Keep the island falloff, but only as the land mask, and warp
   it (domain warping: offset each sample by a second, low-frequency noise
   before reading the falloff) so the coast grows bays, peninsulas and the odd
   offshore island rather than a rounded blob. A small set of seeded **shape
   presets** — one continent, two continents joined by an isthmus, a large
   island with an archipelago — picked per world, give worlds a different
   overall read without any of them being a special case in the code. Every
   node goes on the **mainland** — the largest body of land, lakes and rivers
   included — because ocean is impassable, and a site on an offshore island
   could never be linked to the rest; the islands are scenery.
2. **Mountain ranges as ridge lines.** A range is a short polyline — a random
   walk with a bounded turn per step, 26–64 world units long — placed anywhere
   on land, **with no bias toward the centre**, and at least 14 units from
   every other range's spine so two ranges never merge into a massif. Ranges
   are added against a **budget of ridge length** rather than a count: enough
   spine for the mountain cores to cover a seeded 6.5–8.5% of the land, so a
   small continent gets a few ranges and a big one more, and the mountain share
   lands in its band on most seeds rather than by luck. (A fixed two-to-five
   per original map's worth of ground was the first plan; it left the mountain
   share swinging from 3% to 13% between seeds.) Elevation near a range is a
   ridged profile of distance to the polyline, shaped against the registry's
   own mountain and hills floors, so a range is long and thin, has foothills
   (the hills band) on both flanks, and narrows to its ends rather than
   filling a region.
3. **Passes are placed, not hoped for.** Each range longer than a threshold
   gets one or two gaps cut into its ridge — a notch in the profile that drops
   to the hills band — at points chosen along the range. A pass is where
   movement cost funnels, which is the chokepoint §3.2 wanted; now the
   generator puts one in every range deliberately instead of it depending on
   where an edge happened to be drawn.
4. **Rolling ground everywhere else.** A low-amplitude noise field gives the
   lowlands their hills and hollows, so hills are not *only* foothills and a
   plain is not perfectly flat. It is shifted per world so that a fixed 9% of
   the land rolls up into hills of its own, rather than leaving that share to
   the noise, and tilted gently upward away from the coast so rivers find the
   sea.
5. **Moisture from the ranges.** The existing moisture field gains a
   rain-shadow term: one side of a range (fixed per world, the "prevailing
   wind") is wetter, the other drier. Woodland and marsh then cluster on the
   windward side and grass on the lee — a reason for the land to vary that a
   player can learn to read, and a cheap source of the "wood belt" §3.1 always
   promised.
6. **Rivers from every range.** With several high points instead of one,
   the downhill trace (§3.5.2) naturally starts rivers in several places and
   sends them to different coasts — three rivers for every two ranges. A river
   caught in a hollow spills over its lowest rim up to four times; one that
   still can't reach the sea pools into a small lake where it stops, rather
   than ending dead on dry land.

**Composition bands, checked like fairness.** A hand-tuned generator drifts, so
the shape is asserted, not trusted. After generation, measure the share of land
in each area and reject-and-retry (the same loop §3.3 already runs, under the
same retry cap) when a world falls outside the bands. First-pass bands, for
tuning by the "generate worlds and look at them" pass §12 already calls for:

| Area | Share of land |
|---|---|
| Mountains | 5–10% |
| Hills | 10–18% |
| Woodland | 18–30% |
| Grass + fields | 30–50% |
| Marsh | 0–6% |
| Lakes and rivers | 2–8% |

Plus two shape rules that are the direct answer to "one block in the middle":

- **No single mountain region holds more than 40% of the world's mountain
  tiles** (measured as connected components of mountain tiles).
- **The mountains' centre of mass is not the map's centre**, averaged over a
  test run: the guard test generates twenty worlds and asserts the mountain
  tiles are spread across the map (for example, at least three of the map's
  3 × 3 ninths hold mountains in most worlds) rather than every world stacking
  them in the middle ninth.

Two more pieces make this reviewable rather than a matter of taste:

- **A contact sheet.** A dev-only script (`npm run kb-worlds`, beside
  `npm run icons`) writes a PNG grid of N seeded worlds drawn in the registry's
  fallback colours, and prints each world's passing attempt, generation time
  and area shares. A change to the generator is reviewed by looking at the
  before-and-after sheets in the PR, not by reading noise maths:
  `npm run kb-worlds -- --out before.png` on the base branch, the same on
  yours, and compare. `--count`, `--prefix`, `--columns` and `--scale` change
  how many worlds, their seeds, the grid and the pixels per tile.
- **Everything still goes through the registry.** Ranges, passes and rain
  shadow change the *inputs* to the elevation and moisture windows; they do not
  add a `switch` on area names. A new area stays one `AREAS` entry.

Existing worlds are not regenerated — the same rule as §3.5.6: a live world's
ground doesn't change under its players. With §9.1 a tester can end an old
world and start a new one instead.

### 3.8 The tiles are the roads: travel over the grid

§3.1 made the map a graph, and §3.5 then gave it real ground — but the two
were never merged. An edge is still a straight line between two nodes, and its
cost is a walk of the tiles that line happens to cross (§3.5.4). The ground
only *prices* a route that the graph already chose. That shows up in play:
a route drawn straight over a mountain range can exist while an obvious valley
beside it doesn't, because nobody drew that edge; and an army can only ever be
"on edge X, some way along", never "in that forest".

**Decision: the tile grid is the travel network.** Nodes stop being the
places things connect *between* and become things that sit *on* a tile:

- **Every node owns a tile.** A settlement site, a terrain node, later a
  barbarian village or an army's camp: each has a `tile` (row-major index into
  the field) and its drawn `x`/`y` is that tile's centre. Generation snaps
  every node to a passable tile (the nearest one if the noise put it in water)
  and no two nodes share one.
- **Movement is a path over tiles.** Neighbours are the eight surrounding
  tiles; a diagonal step costs √2 of its tile's weight and may not cut the
  corner between two impassable tiles. A step's cost is the tile's area weight,
  or the overlay's where one overrides it (bridge, ford, road — §3.5.3), which
  is exactly the rule §3.5.4 already uses per tile, so no weight changes
  meaning. The route between two places is the cheapest such path —
  Dijkstra, or A\* with straight-line distance × the cheapest land weight as
  the heuristic. At 100 × 70 = 7,000 tiles that is a sub-millisecond search on
  the server, run once per dispatch, not per tick.
- **An army's position is a tile.** A dispatched army stores its path (the
  tile list) and how far along it is; the tick engine advances it by its
  speed, spending each tile's cost. §6.2's "slowest unit sets the pace" and
  the terrain multipliers are unchanged — they now apply to tiles the player
  can see the army cross, which is what §3.5.4 was reaching for.
- **Edges become derived routes.** The world still wants lines on the map:
  "how would I get from here to there" is the question the map answers. So
  the generator keeps producing edges, but an edge's shape is now the
  cheapest tile path between its two nodes (drawn as that path, not a straight
  line), and its `movementCost` is that path's cost. They are for reading the
  map and for §3.3's fairness scoring; nothing *moves* along an edge.
  `MapEdges` draws a straight segment, so a route drawn as a path is a
  polyline mode added to it (or its own small component, if the caveman
  prefers), not a second map component.
- **Crossings follow the paths.** Bridges and fords (§3.5.3) are derived from
  where routes cross water today. With tiles as the network, the crossing pass
  runs over rivers themselves: each river gets a crossing at least every N
  tiles of its length, at its narrowest points, plus one wherever a site-to-site
  route would otherwise detour by more than a threshold. The rule that a
  derived overlay can't disagree with movement (§3.5.3) holds for free: a
  bridge is a tile with a passable weight, so the pathfinder uses it simply
  because it is there.
- **Roads follow the paths too.** Roads (PR 12) are laid under the route tiles
  between occupied settlements, and cap those tiles' weight — so a road is a
  real shortcut an army's pathfinder will choose, not a decoration on a line.

What this changes for fairness (§3.3): reachability is already measured as
time-weighted cost (PR 9); it becomes a Dijkstra flood from each candidate
start over the tiles — the same function the armies will use — rather than a
walk over edges. One function for "how far is it" everywhere is the point.

What this means for hidden information (§6.3): an army's stored path is
exactly the thing fog of war must not send an opponent, which PR 20 then
enforces. It is simpler to guard a single `path` field than a route inferred
from edges.

**Old worlds.** A world generated since PR 9 has a terrain field, so it can
use tile movement directly: its nodes are snapped to their tiles on read, and
its stored straight-line edges are simply redrawn as paths. A world from before
PR 9 has no field and can't; those are testing worlds, and §9.1 is how they
get cleared out rather than carried forward.

---

## 4. Settlements

### 4.1 Layout

Each settlement occupies **9 tiles in a 3×3 block**: a fixed **town centre**
in the middle, and 8 surrounding tiles that can each hold one building. The
town centre itself has levels (see below) but is never demolished or
replaced — it's the settlement's identity tile, the thing that falls when
the settlement falls.

### 4.2 Buildings

| Building | Role | Notes |
|---|---|---|
| **Lumber camp** | Produces wood per turn/tick | |
| **Quarry** | Produces stone per turn/tick | |
| **Mine** | Produces iron per turn/tick | Only buildable where the settlement's surrounding land has hills or mountains in it (§4.6) — ties the settlement economy back to the world map rather than making all 8 tiles interchangeable |
| **Farm** | Produces wheat per turn/tick | Added with wheat (§4.6); best on grass, fields and river land |
| **Barracks** | Trains army units | Queue-based; higher levels unlock stronger unit types and shorten training time |
| **Market** | Converts one resource to another at a rate, lists trade offers to other players, and sells caravans | Gives a player short on iron but flush with wood a way out that isn't "wait" (§4.7) |
| **Walls** | Passive defence bonus; the thing a siege wears down (§8) | Occupies a tile like anything else — a maxed-out economy settlement really is choosing not to have walls |
| **Town centre** (fixed) | Caps the settlement's overall level, unlocks more building slots (if the design allows more than 8) or higher tiers of the tiles above | Its own upgrade track, gated behind resource cost + time like everything else |

Each building has levels; a higher level costs more of one or more resources
and more build time, and yields a bigger per-turn/tick output (production
buildings) or a stronger effect (barracks unlock speed/strength, walls raise
the defence multiplier). Only one building project and, separately, one
training queue run at a time per settlement at low town-centre levels, with
higher town-centre levels unlocking parallel queues — this is the main
lever for making the town centre feel like progress rather than a plaque.

A settlement's site also grants a **terrain bonus** to whichever production
building matches its neighbouring terrain — a lumber camp in a settlement
surrounded by woodland outproduces the same-level lumber camp in one with no
woodland nearby. §4.6 makes this concrete: the bonus is read off the tiles
around the settlement, not off the nearest terrain node. This is what makes §3.3's "parity on total value, not on
flavour" rule matter in practice: no site is simply better, but a wood-heavy
site and an iron-heavy site call for different opening builds.

### 4.3 The economy loop

Resource buildings generate income every turn/tick (§5 decides what a
"turn" actually is). That income is the only currency in the game — there is
no separate soft/hard currency — and it is spent on exactly three things:

1. **Construction** — building a new structure on an empty tile, or
   upgrading an existing one.
2. **Recruitment** — training army units at the barracks.
3. **Trade** — via the market, converting a resource surplus into whatever's
   short, at a rate that should be worse than producing it directly (so the
   market is a release valve, not a way to dodge the tech tree).

This is intentionally a small, closed loop: four resources — wood, stone,
iron and wheat (§4.6) — and three sinks.
Depth is meant to come from *when* and *where* to spend (build up an economy
vs. rush an army; defend in depth vs. expand the border) rather than from a
sprawling resource list.

### 4.4 Founding new settlements

> As shipped in PR 24: the town centre gains a second level (60 wood, 60 stone,
> 20 iron), and at it trains a **settler** (60 wood, 40 stone, 10 iron, 40
> wheat, 4 ticks) into the settlement's one training queue. A settler is a unit
> like any other — slow, carried in a stack, and killed in a battle it is
> caught in — but a civilian: it strikes no blow, guards nothing, lays no siege,
> stays home from a sally, and walks into no barbarian village without soldiers.
> Camped at an open site — an expansion site nobody holds, or a barbarian one
> whose village has burnt — it founds a town there, bringing a first
> settlement's stockpile (40 wood, 20 stone, 20 wheat) from the town that
> trained it; every other stack of the player's camped there moves in with it.
> A player still holds two settlements at most. Unguarded settlers are taken on
> the road like caravans (§4.7), and found towns for whoever took them. The free
> "Found here" of PR 6 is gone. First-pass numbers (§12).

A player is not capped at one settlement forever. Once a town centre reaches
a threshold level, it can train a **settler** unit (costing all three
resources, and vulnerable to attack in transit like any other unit) and send
it to an unclaimed settlement site elsewhere on the map. This is the
mechanism that turns "10 players on a big map" into a living map rather than
ten static dots — expansion, not just defence, drives players toward each
other, and a second settlement is also a second thing an attacker can pick
off, which matters for §9's catch-up design.

Conquering a barbarian village (§3.4) is the other way to a second
settlement, and the two are meant to pull a player in different directions:
a settler is slower to arrange but risk-free beyond the settler itself,
while a barbarian conquest is faster and immediately productive but costs an
army and forecloses that army from anything else in the meantime.

### 4.5 Building costs and the starting stockpile

> PR 17 shipped this section; the prices (units' too), the starting stockpile and the town
> centre's trickle are read from `src/games/KingdomBuilder/economy.ts`, so a
> tuning pass edits that one file. PR 18 added the farm and wheat rows.

Through PR 13 a building costs only time: `queuePrototypeBuilding` checks the tile and
the queue, never the stores, so a new settlement can fill all eight tiles on
day one and resources are only ever spent on units. That makes the economy
loop of §4.3 a loop with no first step, and it's the thing to fix before armies
(and so trade-offs between armies and buildings) arrive.

**Every building level has a price.** The rule is the one PR 13 already set for
units: the whole cost is taken when the level is queued, by one conditional
update that repeats every check (owner, tile, queue room, and now the stores),
so a tick or a second tab in between fails the write rather than overdrawing.
Buildings and units share one `cost` shape, one "can I afford this" helper and
one way of showing it: the `BuildRow` already names "what it costs" under each
choice, and an unaffordable row is shown disabled with its shortfall rather
than hidden, so a player can see what they are saving for.

First-pass prices (numbers for the §12 tuning pass, not a contract):

| Building | Level 1 | Each level after |
|---|---|---|
| Lumber camp | 15 wood | Level 1 × the target level |
| Quarry | 15 wood | Level 1 × the target level |
| Farm (§4.6) | 10 wood, 5 stone | Level 1 × the target level |
| Mine | 20 wood, 10 stone | Level 1 × the target level |
| Barracks | 30 wood, 20 stone, 10 iron | Level 1 × the target level |

Linear in level, matching `buildTicksFor`'s linear build time, so both curves
are one number to retune rather than a formula to reverse-engineer.

**The starting stockpile.** A player's *first* settlement is founded with
enough in store to build the starter camps and make one real choice:

| Resource | Starting stock |
|---|---|
| Wood | 40 |
| Stone | 20 |
| Iron | 0 |
| Wheat | 20 |

That buys a lumber camp and a quarry (30 wood) with 10 wood and 20 stone left
over — not yet enough for a mine or a farm, so the first decision is what to
wait for, and which camp to level first. Only the first settlement gets it: a
second settlement founded for free (PR 6) with its own stockpile would be a
stockpile printer. A settlement a settler founds (PR 24) gets the same
stockpile, carried from the town that trained it — which paid more than that
for the settler, so it prints nothing either. A barbarian village taken starts
with only what its conquerors' caravans brought.

**A settlement can never be stuck.** Once buildings cost, a settlement with no
production buildings and not enough in store for the cheapest one would have
no way forward. The town centre therefore produces a small trickle of its own —
first pass: 1 wood and 1 wheat a tick — independent of buildings. It is the
softlock guard, and it also covers every settlement from before this change
without a migration: an old settlement that has built nothing starts earning
wood the tick after this ships. (Settlements that already built for free keep
their buildings; nothing is charged retroactively.)

### 4.6 Wheat, and the land around a settlement

> PR 18 shipped this section. The radius, the tier bands and what each tier
> pays live in `economy.ts` beside the prices; what each area yields lives on
> its `AREAS` entry.

Two related changes: a fourth resource, and production that depends on the
ground a settlement is built on.

**Wheat.** Armies have to eat. Wheat joins wood, stone and iron in
`KingdomBuilderResources`, produced by a new **farm** building and spent on
**units**: every unit's training cost gains a wheat price (first pass: scout 3,
militia 5, infantry 8, siege engine 10, cavalry 15 — horses eat), and so will
the settler (PR 24). That gives the economy a resource that belongs to the
military side the way iron does, and makes grassland worth holding rather than
being the empty space between the interesting tiles. A document from before it
has no `wheat` field and reads as zero, the same pattern PR 13 used for the
queue and garrison.

Upkeep — units eating wheat every tick while they exist, not only when they are
trained — is the obvious next step and deliberately *not* in this change: it
brings starvation rules (what happens at zero) that want designing with armies
in the field (PR 19) rather than guessed at now. §12 keeps it open.

**The catchment.** Each settlement looks at the tiles within a fixed radius of
its own tile (§3.8) — first pass: 4 tiles, so a 9 × 9 square minus corners,
about 60 tiles. The share of that catchment in each kind of ground sets a
**yield tier** for each resource:

| Share of catchment yielding the resource | Tier | Output per building level |
|---|---|---|
| None | — | The building can't be built here |
| Under 15% | Poor | 1 |
| 15–35% | Good | 2 |
| Over 35% | Rich | 3 |

Tiers rather than a smooth curve, because "Rich woodland" is something a player
can read on the settlement screen and plan around, and whole numbers keep
resources integers with no fractional carry to store. (Base output moves from 1
to 2 per level for a *Good* site, so the typical economy runs at roughly twice
the PR 13 rate; the price table above is pitched against that.)

Which ground yields what is **a field on the area registry**, never a branch on
an area's name (§3.5.2's rule):

| Area | Yields |
|---|---|
| Woodland | Wood |
| Hills | Stone |
| Mountains | Stone, iron |
| Grass, fields | Wheat |
| Marsh | Wheat (counts as half a tile) |
| River and lake tiles | Nothing directly; each one *beside* a grass or fields tile makes that tile count double for wheat |
| Beach, ocean | Nothing |

A future area — desert, tundra — declares its yields in its own entry and the
catchment picks it up.

Two things follow from where this lives:

- **The catchment is computed once and stored.** The ground never changes
  under a world (§3.5.6), so a settlement's tiers are worked out when it's
  founded and written on the settlement document, and `applyTick` reads a tier
  rather than re-walking 60 tiles for every settlement every fifteen minutes.
  Settlements from before this change are backfilled once from their world's
  stored field; one on a world with no field (pre-PR 9) gets *Good* in
  everything but iron, which stays buildable wherever a mine already stands.
- **It supersedes the terrain-node bonus.** §4.2 promised "a lumber camp next to
  a forest node outproduces one without"; the catchment is that promise made
  concrete and visible. Terrain nodes stay on the map as landmarks for now;
  whether they retire or become rich deposits that bump a tier is left to §12.

**Fairness.** §3.3 scores starting sites on total reachable value; the score's
inputs become the catchment's tiers, and it gains one hard rule: **every
player start has at least a Poor tier in all four resources**, because a start
with no wheat or no iron can never train a single unit. Composition, not total, is still allowed to differ — a Rich
woodland start and a Rich mountain start are both fair — which is exactly the
"parity on total value, not on flavour" rule §3.3 already states. §3.7's
composition bands are what keep that rule satisfiable on most seeds.

---

### 4.7 The market, trade and caravans

> PR 25 shipped this section. The prices, the rates, a caravan's load and the
> offer limit live in `economy.ts` beside everything else; `market.ts` is the
> pure half the settlement screen prices with.

§4.3's third sink, in three parts: a market that converts, a board where
players trade with each other, and caravans that carry stores by road.

**The market** is a building like the barracks: one a settlement, built once
(25 wood, 15 stone) and raised a level at a time to level three, each level
priced and timed linearly like every other. It exchanges any resource for any
other at a rate set by its level — **4 for 1, then 3, then 2** — which is
always worse than producing the resource, so it stays a release valve. An
exchange is instant and conditional on the market's level and the stores, so
an upgrade finishing or a second tab in between fails it rather than pricing
it at the wrong rate.

**Trade offers.** A player posts an offer from a market — "40 wood for 10
iron" — and any other player in the world takes it at a market of theirs.
What an offer gives is taken from the stores when it is posted and held on the
offer, so what is on the board is always paid for; withdrawing it returns the
goods to the settlement it came from. Taking one is one transaction: the offer
comes off the board, the taker pays what it wants and receives what it gives,
and the poster's settlement receives what it wanted. Goods change hands market
to market, instantly — the trade needs no road. Each side names at least one
resource and no resource is on both; a player may have five offers open in a
world. The board is public to every member: who posted each offer and what it
is, but which of a player's settlements posted it is theirs alone. A player
who leaves takes their offers — and the goods held on them — with them.

**Caravans.** Moving stores between settlements by road — to feed a second
town from a first, or to deliver the other half of a private deal — is what a
caravan is for. One costs 20 wood and 10 wheat at a market, carries 50
resources of any mix, and stands empty in the market yard until it is sent:

- **Loaded at muster.** Sending a stack from a garrison (§6.2) can take
  caravans from the yard, loaded from the stores in the same conditional write
  that spends the garrison. With units in the stack the caravans are
  **escorted**; with none they travel **alone**. Either way the stack moves at
  a slow unit's pace — ox-carts set the speed, as the slowest unit does.
- **Unloaded on arrival.** A stack that marches into one of its owner's own
  settlements rejoins it as it always did (§6.2), and its caravans unload into
  the stores the tick they arrive and stand in that yard.
- **Detached and joined where they camp.** An escorted stack camped anywhere
  but a barbarian village can split its caravans off into a stack of their own,
  and any two of a player's stacks camped at the same place can be joined into
  one — which is how caravans are attached to an army in the field.
- **Unloaded into someone else's town.** A stack camped at another player's
  settlement can unload its load into that settlement's stores: a gift, or
  the delivery side of a deal made off the board. Not while it is besieging —
  a besieger's caravans are detached first, and a caravan stack on its own
  never besieges.

Caravans follow the rules of the stack they are in: an **unescorted** stack
lays no siege (§8), never fights, and is refused at a barbarian village, where
it would simply be plundered. An **escorted** one shares its escort's fate: if
the escort takes a barbarian village, the caravans and their load stock the
new settlement.

Caravans are never simply lost to another player — they change hands:

- **Taken on the road.** At the end of every tick, an unescorted stack on the
  same tile as a rival's stack with units — marching or camped, anywhere on
  the map — is taken by it, unless a stack of its own owner's with units
  stands on that tile too. The caravans and their load join the taker's stack
  (the oldest, if several could), which carries them on wherever it was
  going. A rival's caravans alone take nothing, and a town's garrison takes
  nothing that camps at its gate: that is how a delivery is made.
- **Left on the field.** If a push or a sally wipes an escort out, its caravans
  and load go to the town that beat it — into its yard and its stores. Only a
  barbarian village, which is nobody, still plunders them outright.

Both sides are told, in their Battles list (§7.6): the taker how many
caravans it took, the loser how many it lost — and, after a raid, nothing of
the army that took them. A raid is named for the place it happened when the
caravans were camped there; one on the open road names nowhere, since where
they were bound is their owner's business (§6.3). A rival who can see a stack (§6.3) sees how
many caravans it has — a covered cart shows it is one — but never what it
carries.

---

## 5. Time model: turns vs. ticks

**Decided: Option C, a fixed real-time tick.** This section keeps all three
options and the comparison table, because the reasoning is what makes the
decision worth trusting rather than just asserting — it shapes nearly
everything else downstream: how travel time is expressed, how combat can be
simultaneous or not, how offline players are protected, and how much this
reuses vs. departs from the app's existing turn/command engine (see §10).

### 5.1 Option A — strict sequential turns

The pattern every other game in this app uses: one active player at a time;
the game only advances when they end their turn.

**Pros**
- Maximum reuse of the existing engine — `GameLogic`, the command pattern,
  turn recap, the "your turn" push notification are all built around exactly
  this shape.
- No server-side scheduler needed; the game is inert until someone acts.
- Zero ambiguity about state at any instant — there is always exactly one
  "now."

**Cons**
- Falls apart at 10 concurrent, independently-paced players. A round-robin
  turn order means a player might wait for nine others to each take a turn
  before they can act again — for a builder game where "acting" is mostly
  "check my income and queue something," that's an enormous, un-fun amount
  of dead time.
- Travel time expressed in turns becomes travel time in *rounds*, which only
  means something fixed in wall-clock time if every player takes their turn
  promptly — in practice, an army's ETA becomes hostage to the slowest
  player in the rotation.
- Doesn't match the genre's expectations at all — nobody wants to wait their
  turn to let their lumber camp produce wood.

This option is really only listed for completeness; it's a poor fit the
moment there are more than 2-3 players sharing a game instance, which rules
it out here.

### 5.2 Option B — simultaneous ("WEGO") turns

Every player can queue actions at any time; the game advances in discrete
rounds, but *all* players act within the same round rather than one at a
time. A round might be resolved once every player has confirmed ("I'm
done"), or — more realistically for an async game people don't all check at
once — once a timer expires (see Option C, which this converges toward).

**Pros**
- No player blocks another; everyone acts inside the same round window.
- Combat, production and movement all resolve at one well-defined instant
  per round, so there's no argument about who acted "first."
- Keeps the recognisable vocabulary of "turns" for replay/recap purposes.

**Cons**
- If resolution waits for every player to confirm, one inactive player
  stalls the whole world — unacceptable for a persistent game where players
  are expected to disappear for a day at a time.
- If resolution is instead timer-gated, this *is* option C wearing a
  different name — the "turn" is really just a tick with a fixed length.

### 5.3 Option C — fixed real-time ticks

The world advances on a wall-clock schedule regardless of who's looking —
e.g. once per hour, a sweep processes every active world: apply production,
advance in-flight construction/training/movement, resolve any combat for
armies that have arrived. Players queue actions whenever they like; queued
actions apply either immediately (start building now, finish at a computed
future tick) or at the next sweep, depending on the action.

**Pros**
- This is the genre's proven model (Travian, Tribal Wars, OGame and similar
  persistent-world builders all work this way) — players already expect it.
- True fairness across time zones and schedules: the world doesn't wait on
  anyone, and nobody's inactivity blocks anyone else's.
- Travel time in hours is a real, stable number a player can plan around
  ("my army lands at 3am their time") — this is a feature, not a bug, since
  timing an attack for when a defender is asleep is a legitimate part of the
  genre's strategy.
- Maps cleanly onto infrastructure this app is already described as having:
  a cron sweep is an established pattern here (see `gremlin`'s brief,
  AGENTS.md's reviewer table), and FCM push notifications are a natural fit
  for "your walls are under siege" or "construction complete" alerts that
  land while the player is away.

**Cons**
- Needs an always-on scheduler hitting every active world on a fixed
  cadence — real infrastructure cost that none of this app's other games
  require, and one that scales with the number of concurrent worlds, not
  the number of concurrently-online players.
- Snowballing/offline vulnerability: a player who can't check in for two
  days can wake up to a lost settlement. Needs deliberate mitigation
  (grace periods, siege-before-attack per §8, beginner protection per §9) —
  none of which is optional if this model is chosen.
- Determinism/replay is a little less tidy than a pure command log: a tick's
  outcome depends on real wall-clock timing of when actions were queued
  relative to the sweep, not just an ordered list of commands. Solvable (see
  §5.5) but it's an extra design decision this app's other games don't have
  to make.
- Round pacing is coarser than "instant" — a 1-hour tick means a player who
  just logs off 1 minute after building queues up won't see it start until
  the top of the hour, which needs to be communicated clearly or it reads as
  a bug.

### 5.4 Comparison

| Dimension | A. Sequential turns | B. WEGO turns | C. Fixed ticks |
|---|---|---|---|
| Blocks other players? | Yes, badly at 10p | Only if confirm-gated | No |
| Fair across time zones | Yes (no clock involved) | Depends on gating | Yes |
| Fits existing engine | Very well | Well | Needs a scheduler |
| Travel time is a stable real quantity | No (rotation-dependent) | Only if timer-gated | Yes |
| Offline vulnerability | None (game waits) | Low if timer-gated | Real, needs mitigation |
| Genre fit | Poor | Partial | Strong |
| Infra cost | None | Low–medium | Medium (recurring sweep) |

### 5.5 Decision

**Timer-gated WEGO — a fixed real-time tick that is also numbered and
recorded like a turn.** Concretely: the world advances every fixed interval
(15 minutes, shortened from the hour this document first proposed once
playtesting showed an hour made "wait for the next tick" the main activity —
still coarse enough that a sweep across many worlds is cheap; §12). Every sweep is
assigned a monotonic turn number and is driven by an ordered command log
exactly like this app's other games, so turn recap and "since you were last
here" work unmodified in spirit — the log just happens to be appended to by
a cron sweep instead of by "end turn," and a "turn" is a fixed span of
wall-clock time instead of a player's discretion. This gets the predictable,
stable-income fairness and genre-correctness of Option C without abandoning
the app's existing turn/command/recap vocabulary, at the cost of the real
infrastructure trade Option C's cons describe honestly — that cost doesn't
go away, it's accepted as worth paying for the ten-player, weeks-long shape
this game actually has. Everything from §6 onward assumes this model.

---

## 6. Armies and movement

### 6.1 Unit types

A small roster keeps army composition legible without becoming a spreadsheet
exercise:

| Unit | Role | Speed | Notes |
|---|---|---|---|
| **Militia** | Cheap defence/offence | Slow | Cost-efficient garrison filler |
| **Infantry** | Main-line offence | Medium | The default attacking stack |
| **Cavalry** | Fast raiding/reinforcement | Fast | Expensive; sets a stack's speed if mixed in (see below) |
| **Siege engine** | Needed to meaningfully damage walls | Slow | An attack without one against a walled settlement mostly just fails to break in |
| **Scout** | Reveals a target's garrison/defences before committing | Fast | Cheap, disposable, answers "is this worth attacking" |

### 6.2 Dispatch and travel time

> From PR 16, "distance" below means the cost of the cheapest path over the
> tiles (§3.8), not a count of edges; the multipliers are per tile, as they
> already are since PR 9. The rules — slowest unit sets the pace, terrain
> multiplies, the ETA is known — are unchanged.

An army's base travel time is the graph distance (in edges) divided by the
**speed of its slowest unit** — mixing a scout into a siege train doesn't
make the siege train faster, so composition is a real trade-off between
striking power and response time.

Each edge also carries a **terrain movement-cost multiplier**, applied on top
of distance rather than instead of it. The figures below are per-tile weights:
an edge's multiplier is the walk of the terrain tiles its line crosses (§3.5.4),
so they describe ground the player can see rather than a label on a line:

| Terrain | Multiplier | Notes |
|---|---|---|
| Plains | ×1 | The baseline; most edges near the map's centre |
| Forest | ×1.5 | Common near wood-belt sites |
| Hill | ×2 | |
| Mountain pass | ×3–4 | The chokepoints called out in §3.2's generation step — a short-looking route on the map that is anything but fast |
| River crossing | Impassable without a bridge, or ×2+ at a bridge node | Forces routing through a specific node rather than a straight line |

An edge's cost is fixed and known to every player who can see the map, so
"three hops" is never a reliable proxy for "three hours" — a defender's real
safety margin is the *time-weighted* distance along the route an attacker
would actually take, mountains and rivers included, not the node count.
Under the tick model (§5.5) this resolves to a concrete number of ticks, and
therefore a concrete number of hours, an ETA a player can plan an attack (or
a defence) around.

Dispatching an army removes it from the settlement's garrison for the round
trip — there's no telefragging reinforcement, only "did I leave enough
behind to still be defended."

### 6.3 Visibility and scouting

> As shipped in PR 20: settlements are public — where each stands and whose it
> is — and it is **armies** that are fogged. Sight is a circle of tiles around
> everything a player owns: a settlement watches 3 tiles (5 and 7 at barracks
> levels 2 and 3 — the detection upgrade), an army 4, and an army with a scout
> in it 8. A rival army inside any of those circles is seen live — its owner,
> the tile it stands on and what it holds, never its road, destination or ETA —
> and one outside them is not sent at all. A scouting army within sight of a
> rival town also reads its garrison, live while it stays there rather than the
> snapshot sketched below. Having your own army nearby is therefore itself a
> way to scout another.

An army in transit is **hidden** by default — an opponent cannot see that it
has been dispatched, its route, its composition, or its size. This is
deliberate, not an oversight to patch later: it's what makes siege (§8) the
game's actual warning system instead of a redundant one. Without it, a
defender would see an incoming army the moment it left and the siege's
grace period would just be double warning; with it, an unrevealed march is
the norm and the siege opening is usually the first anyone but the sender
knows about it.

- **The scout unit** (§6.1), sent ahead of or independently from a strike
  force, reveals a target settlement's current garrison and defences at the
  moment it arrives — a snapshot, not a live feed, so a scouted target can
  still reinforce afterward.
- **Upgrades at higher town-centre or barracks levels** can grant passive
  detection — e.g. spotting armies passing through a settlement's own
  adjacent edges — giving a developed settlement some warning of a march
  aimed at it without relying on a dedicated scout being sent reactively.
- Without either, the *only* information a defender has about an incoming
  attack is what a siege's onset (§8) tells them: that something arrived, and
  how strong the debuff feels, not what's actually in the besieging stack.
  Deciding whether to sally out or wait it out is therefore a real read on
  imperfect information, not a lookup.

This is exactly the kind of hidden-state question this app already has a
review discipline for (see `croupier` in §10) — an army's position, route
and composition are hidden information the server must not hand an opponent
just because their client happens to be able to compute where an edge leads.

### 6.4 Arrival: siege begins automatically

An army that reaches a hostile settlement does not choose whether to fight —
**it automatically begins a siege.** There is no direct-attack-on-arrival
option; siege is the only door in, and what happens next is a matter of
timing rather than a choice made at dispatch:

- **The attacker decides when, if ever, to push the attack** (§8) — they
  might do it the instant the grace period ends, or hold off to let a second
  army converge on the same target first, all while the siege's debuffs are
  already in effect.
- **The defender decides whether to sally out** (§8) — send their own
  garrison out to fight the besieging army in the open — rather than sit
  and wait for the attacker to make the first combat move.

Because armies march unseen (§6.3), the siege's onset is ordinarily the
first concrete signal either the defender or their allies get that this
particular attack is happening at all — which is exactly the "losing is
visible, not sudden" pillar in practice: the visibility arrives at siege,
not before, but it does arrive before anything is destroyed.

---

## 7. Combat resolution

**Decided: Option 3, deterministic multi-round attrition with unit
counters**, with Option 4's small bounded randomness scoped in as a planned
future addition rather than an open alternative (§7.6). The four candidates
below are kept in full, in increasing order of how much they lean on
randomness, because the comparison is the reasoning the decision rests on.
The asynchronous setting matters a lot here: attacker and defender are
essentially never both watching when a battle resolves (it happens on a
tick, possibly hours after either side last logged in), so anything that
depends on a live audience — watching dice fall, reacting mid-fight — buys
nothing. The report both sides read afterward is the only thing that has to
be satisfying.

### 7.1 Option 1 — deterministic power comparison

Every unit has a power value (with modifiers for walls, terrain, siege
engines vs. walls). Total attacker power vs. total defender power decides
the outcome outright; losses are proportional to the power ratio (a
Lanchester-style attrition formula rather than all-or-nothing).

**Pros:** fully transparent and reproducible — a player can compute in
advance whether an attack will succeed. No randomness to record for replay.
Impossible to feel "cheated" by a bad roll, which matters more than usual
here because the loser often won't be online to see it happen and contest
it in the moment.

**Cons:** removes tension — the stronger stack always wins, so the only
skill expressed is accumulation and arithmetic. Favours whoever optimises
the spreadsheet hardest, and can make a large early lead feel unbeatable
(snowball risk compounds with §5.3's offline-vulnerability concern).

### 7.2 Option 2 — randomised dice/CRT resolution

Combat rolls dice (or looks up a combat-results-table) per unit or per
round, the way this app's own World Domination handles Risk-style combat.

**Pros:** genuine tension and comeback potential — a well-defended
underdog can win. Familiar to players of this app's existing dice-combat
game, and this app already has the UI building blocks for it (`Dice`,
`RollReadout`) and, per `new-game.md`, an established pattern for recording
a dice outcome so it replays correctly.

**Cons:** in a live, both-players-present game a bad roll is at least
shared theatre; here, a defender who logs in to find their army wiped by an
unlucky roll they never got to see happen has no recourse and no
spectacle to compensate — the randomness's downside lands harder in an
async setting than its upside pays for. Also weakens the "distance is the
defence" pillar: a well-defended settlement can still fall to variance
regardless of how well the player planned around travel time.

### 7.3 Option 3 — multi-round attrition with unit counters

Deterministic like Option 1, but combat runs several simulated rounds and
units have type advantages (cavalry beats archers, archers beat infantry,
siege beats walls but is weak in the open field, etc. — a rock-paper-scissors
layer familiar from Travian/Tribal Wars-style games).

**Pros:** adds real strategic depth — scouting a target's composition
(via the scout unit) before attacking becomes worth doing, and a smaller,
well-composed force can beat a larger, poorly-composed one without needing
randomness to do it. Still fully deterministic, so it keeps Option 1's
async-fairness property.

**Cons:** more surface area to balance (a counter matrix plus per-round
attrition math) and more to explain to a new player — the combat report
needs a round-by-round breakdown or the result looks like a black box
despite being deterministic underneath. Wall/siege-engine interaction adds
another axis on top of the counter matrix.

### 7.4 Option 4 — deterministic core with bounded variance

Option 1 or 3's math, plus a small random modifier (e.g. ±10%) applied to
one side's effective power — enough to occasionally flip a close fight,
never enough to make a heavily lopsided one interesting.

**Pros:** keeps most of the fairness and predictability of a deterministic
model (a player can still tell "this is a safe attack" from "this is a
gamble") while giving combat reports some variance instead of being 100%
readable in advance — useful for keeping close fights (the ones players
actually agonise over) from feeling like a foregone spreadsheet
conclusion.

**Cons:** still needs the randomness recorded for replay, same as Option 2,
just less of it. Splits the difference well but is quietly a "have it both
ways" option — a lopsided fight is exactly as boring as under Option 1, and
if the bound is wide enough to matter often it's just Option 2 with extra
steps.

### 7.5 Comparison

| Dimension | 1. Deterministic | 2. Dice/CRT | 3. Attrition + counters | 4. Bounded variance |
|---|---|---|---|---|
| Fair without a live audience | Strong | Weak | Strong | Strong |
| Strategic depth (composition matters) | Low | Low–medium | High | Depends on base (1 or 3) |
| Tension / comeback potential | Low | High | Medium (via composition, not luck) | Low–medium |
| Implementation/UX complexity | Low | Medium | High | Low–medium |
| Snowball resistance | Poor | Good (variance) | Good (counters reward smaller smart plays) | Medium |
| Needs recorded randomness | No | Yes | No | Yes (small amount) |

### 7.6 Decision, and future scope

> As shipped in PR 22: `combat.ts`'s `resolveBattle` fights up to six rounds,
> both sides striking at once from what stood at the start of each. Every unit
> has an attack and a health (militia 2/6, scout 1/3, infantry 4/10, cavalry
> 7/12, siege engine 1/10), spreads its attack over the other side by headcount,
> and hits harder where a counter says: militia ×2 against cavalry, cavalry ×1.5
> against infantry, infantry ×1.5 against militia, and everything ×1.5 (cavalry
> ×2) against siege engines. Damage too small to kill carries over to the next
> round. A garrison fighting from its own town divides the damage it takes by
> 1.25, and each siege engine in the attacking stack takes 0.05 off that bonus —
> the walls of §8 do not exist yet, so this is the defence siege engines break.
> The attacker wins only by leaving the defender with nothing and something of
> their own; both gone, or both still standing after the sixth round, holds for
> the defender. There are no archers, so the counter triangle is between the
> three fighting units. First-pass numbers (§12).

**Option 3 — deterministic multi-round attrition with unit type counters —
is the combat model**, reporting results as a round-by-round log (which also
gives the combat report something worth reading, addressing Option 1's
flattest weakness without importing Option 2's async-fairness problem).
Depth comes from scouting and composition, which a patient, less
numerically-dominant player can act on, rather than from a die roll neither
side is present to see — and §6.3's fog of war is what makes that depth real
rather than academic: without a scout, a defender's composition is
unknown to the attacker (and vice versa) until the siege report shows what
actually landed on either side, so guessing the counter matchup correctly is
itself a skill test, not just arithmetic once the numbers are visible.

**Option 4's small bounded randomness (±10% on effective power) is
in-scope as a future addition**, not a fallback held in reserve — the goal
is specifically to make **close** fights risky, the ones a pure power/counter
comparison would otherwise resolve with total confidence, without touching
lopsided ones. It's deliberately sequenced after the deterministic model
ships and is played, rather than built alongside it, because it's much
easier to add a little noise to a working deterministic model once real
fights show which match-ups feel too safe than to remove unwanted
swinginess from a randomised one after players have calibrated their trust
around it.

---

## 8. Sieges in detail

> As shipped in PR 21: an army camped at another player's settlement besieges
> it from the tick it arrives. The town produces half from the next tick; after
> a four-tick grace period (an hour) its building and training stop where they
> are as well. There are no walls yet, so nothing stops regenerating. The
> besieger can **push the attack** with every army of theirs at the town, and
> the defender can **sally out** with the whole garrison against every army at
> the gate. Since PR 22 both are fought out by §7's engine: a push against the
> garrison behind its town's defences, a sally in the open without them. What
> survives on each side goes home — back into the garrison, or shared back
> among the armies that fought by what each brought, an army left with nothing
> disbanding. A won push destroys the garrison but does not take the town —
> capture is a later rule — so the siege goes on; a stand-off leaves it where it
> was. Both sides can read every battle afterwards.
>
> One consequence of PR 20's sight: a settlement always sees its own tile, so a
> defender sees exactly what is camped at their gate from the moment the siege
> begins. The last paragraph below — sallying as a bet on a stack the defender
> "mostly can't" see — therefore holds only for a relief force still on the
> road, not for the besiegers themselves. Whether a besieging army should be
> able to hide its numbers is part of §12's sight question.

A siege is deliberately the *opening* move, not a lesser attack, and — per
§6.4 — not a choice: any army that reaches a hostile player settlement opens
one automatically. What follows is two independent clocks, one per side,
both ticking from the moment siege begins:

**The attacker's clock — when to push.**

- On arrival, the besieging army applies debuffs to the target settlement —
  e.g. reduced resource production, construction/training queues paused or
  slowed, walls stop passively regenerating — for as long as it remains,
  win or lose nothing yet.
- A short **grace period** after siege begins, before debuffs ramp to full
  strength, prevents a siege from being a near-instant knockout against a
  player who happens to be offline at exactly the wrong tick.
- The attacker chooses, at any point after arrival, to **push the attack** —
  the action that finally triggers §7's combat resolution against the
  garrison and any remaining wall bonus. There's no forced timer on this
  beyond the strategic cost of waiting: every extra tick under siege is
  another tick of debuff extracted for free, but it's also another tick the
  defender has to reinforce, and another tick a relief force has to arrive.
  A common reason to hold off rather than push immediately is massing a
  second army to arrive and push together, since the attacker fully
  controls the timing.

**The defender's clock — whether to sally out.**

- **No garrison losses occur under siege alone.** This is what makes it a
  warning rather than a surprise: a defender who logs in mid-siege still has
  their full garrison and every option below still open.
- The defender can **sally out**: send the settlement's garrison out to
  fight the besieging army directly, resolved as ordinary field combat (§7)
  rather than a defence against the settlement's walls. This trades the
  wall/terrain bonus a defending garrison would otherwise get for striking
  first, before the attacker chooses to push — worthwhile against a
  besieging force the defender's garrison can beat in the open but might
  not survive taking the attacker's chosen moment to fight behind walls
  against, particularly once siege engines are involved.
- Alternatively, the defender can **reinforce** from another settlement,
  **wait** and out-defend a push when it comes, or **evacuate** a settler
  (§4.4) to protect the line of succession if the settlement looks lost
  either way.
- A besieging army is vulnerable to more than a sally-out: a **relief
  force** (an ally's army, marching in from elsewhere) can attack it the
  same way, in the open — sieging a settlement is a commitment for the
  attacker, not a free, risk-free debuff.

Because armies march unseen (§6.3), neither side's clock runs on full
information: the attacker doesn't know if a relief force is already inbound
when they decide whether to wait, and the defender doesn't know the
besieging army's exact composition unless they scouted it — sallying out is
a bet on a garrison the defender can currently see against an army they
mostly can't.

---

## 9. Victory, seasons, and catch-up

A persistent ten-player world needs an endpoint and a way to keep a losing
position from being a foregone conclusion for the rest of the season:

- **Seasoned, not eliminated.** Rather than "last kingdom standing," a world
  runs for a fixed real-world duration (e.g. two to four weeks) and is
  scored at the end — total settlement levels, army value, and territory
  held (including barbarian villages conquered, §3.4, which is deliberately
  counted the same as a player-taken settlement — the map doesn't care who
  used to hold it) are reasonable inputs. This matters specifically because
  losing a single settlement early (a real risk given §5.3's
  offline-vulnerability cost) shouldn't mean a player has nothing left to
  play for; a scored season gives them a comeback to chase instead of a
  dead account.
- **New-player protection.** A freshly-founded settlement (including a
  second one via §4.4) is unattackable for a short fixed window after
  founding — long enough to build a first layer of defence, short enough
  that it isn't a safe harbour for the whole season.
- **Diminishing returns on dominance.** A player who already holds
  meaningfully more than the map's average (settlements, or total power)
  gets progressively less benefit from further conquest — e.g. captured
  settlements above a threshold yield reduced resources — so a runaway
  leader is a target worth organising against rather than an inevitability.
- **A visible leaderboard**, not just a final result, so the "who's ahead
  and by how much" information that would otherwise only exist in players'
  heads is common knowledge — this is what makes the diminishing-returns
  rule actionable rather than just a footnote nobody checks.

### 9.1 Ending a world early

A season ending on schedule is PR 26. Before that there is no way for a world to
end at all: every other game here has `/api/game/end`, but a world is not a
`GameData` (§10), so that route can't see it. During testing that is a real
problem — each generator change (§3.7, §3.8) makes older worlds unrepresentative,
and they sit on the dashboard ticking forever. So a world needs two ways out,
both designed now so that the season's end reuses them rather than growing a
third.

- **The host ends the world.** From the world screen, behind a
  confirmation that names the world and how many other players are in it.
  Ending sets `endedAt` on the world with one conditional write (only if it is
  still unset). From that moment the tick sweep skips it (its query filters on
  `endedAt`), no command against it is accepted, its invitation code is revoked
  so nobody can join a finished world, and it leaves every player's dashboard
  row list and `AppRail` switcher. `endedAt` is the same field PR 26 writes when
  a season ends, so "ended by hand" and "ended by the clock" differ only in the
  reason recorded beside it.
- **Any other player leaves.** Leaving removes that player's settlements and
  frees their roster seat and site, so the site is claimable by the next
  joiner. If the host leaves, the host passes to the longest-seated player; if
  the last player leaves, the world is ended. A leaver's armies in the field
  disband where they stand (PR 19), and removing a world removes its armies with
  its settlements.
- **Ended worlds are removed.** The world, its settlements and its invitation
  are deleted a fixed time after `endedAt` (first pass: seven days — the
  lobby's longest code lifetime), by a step in the existing tick cron rather
  than a new cron. The host can also choose "delete now" at the confirmation,
  which during testing will be the usual choice. Deletion removes the
  settlements first and the world last, so a sweep that dies partway leaves
  a world that still has `endedAt` set and is simply finished by the next
  sweep; nothing is ever an orphaned settlement pointing at a missing world.
- **Worlds with no host.** Worlds from before PR 8 have no `hostId`. For those,
  the owner of the world's first settlement counts as host. Beyond that, an
  admin can end or delete any world from a small `/admin/kingdombuilder-worlds`
  page — a list of worlds with their seed, player count, tick and age — which
  is the tool for clearing out abandoned test worlds nobody will come back to
  end themselves.

What this deliberately isn't: a result. An ended-by-hand world records no
`GameResult` and no stats, because there is no scoring to record until PR 26;
at that point ending early can decide whether a hand-ended world scores or is
simply void.

---

## 10. Fit with the existing engine

Two things about Kingdom Builder don't fit this app's existing games without
adjustment, worth naming plainly since they're scope decisions as much as
game-design ones:

- **Cardinality.** Every other game here is one `GameData` document per
  match, 2–6 players, finite length. A Kingdom Builder "world" is one
  persistent document (or set of documents) shared by up to ten players over
  weeks — closer to a shared room than a match. The command/turn/replay
  machinery this app already has (§5.5 deliberately keeps a numbered,
  ordered command log so that machinery still applies) is the right
  foundation, but the *lifecycle* — who "owns" the game record, what a
  player leaving mid-season means, how `GameResult` and its stats map onto a
  season rather than a single win/loss — needs its own design pass before
  implementation, not assumed from the single-match model. §11.3's PR 7 and
  PR 8 are where that pass lands, and both answers keep the distinction: a
  world is listed *beside* the turn lists rather than becoming a `GameData`,
  and its seats fill over the life of the season rather than all at once at a
  lobby's start.
- **The scheduler.** §5.5's chosen tick model needs a recurring sweep across
  every active world, in the spirit of this app's existing cron-sweep
  patterns (see the `gremlin` reviewer's brief in AGENTS.md) but running
  continuously for the life of a world rather than as an occasional
  maintenance job. Sizing that (how many worlds run concurrently, what an
  hour-long sweep costs at that scale) is an infrastructure question this
  document intentionally leaves open — it's a prerequisite for building this
  game, not a game-design decision.

Everything else — the node/edge map renderer, `BoardZoom`, push
notifications for siege/attack/completion events, `Dice`/`RollReadout` when
Option 4's bounded variance is added, the reviewer crew (`rulebook` for
wiring, `croupier` for making sure a player can't see an enemy army in
transit or a garrison a scout hasn't revealed — §6.3's fog of war is exactly
the hidden-state contract that reviewer exists to check, not a new one this
game invents — `gremlin` for the sweep's failure modes, `locksmith` for the
dispatch/siege/attack API surface) — is a good match for what this app
already has and already does.

---

## 11. Implementation plan

### 11.1 Principles

Two milestones: **A** gets a working prototype in front of a player —
found a settlement, watch resources tick, queue one building — and **B**
expands it into the full game described above. Every PR in both is scoped
so it can merge to `main` without disrupting anything already shipped:

- **New code stays unreferenced until it's ready to be used.** A PR that
  adds a schema, a pure function, or a route that nothing else calls yet
  cannot regress an existing feature, by construction — there's nothing for
  it to conflict with. Kingdom Builder's own files live entirely under
  `src/games/KingdomBuilder/` plus a small number of new API routes, so nearly
  every PR touches only new files.
- **Shared, must-stay-consistent files are touched by exactly one PR per
  milestone.** `src/utils/ui/games.ts` (the game picker), the `GameLogic`
  barrel the serializable-registry test (`npm test`) checks every game
  against, and any home-page/nav component are all left alone until the PR
  that's explicitly "turn it on" (§11.2, PR 5) — so no earlier PR can be the
  one that breaks that test or half-registers a game the picker can already
  see but can't yet run.
- **The cron sweep follows the existing cron pattern exactly**, including
  the part where adding the route and turning it on are two different
  steps: the tick route is gated by `isAuthorisedCron` like `turntimer`,
  `staledevices` and `staleguests` already are, but it isn't added to
  `vercel.json`'s `crons` list until it's been exercised manually — so
  merging the route can never itself start an unattended schedule running
  against real data.
- **Every PR still passes the repo's existing gates** — `npm run build`,
  `npx tsc --noEmit`, `npm run lint --max-warnings 0`, and `npm test` for
  anything touching the game engine — and gets the relevant reviewers from
  the crew in AGENTS.md before merging (`locksmith`+`gremlin` on any new
  route or cron, `croupier` the moment any response carries hidden state,
  `caveman` on any UI, `rulebook` on anything that changes shared
  metadata or wiring).
- **No "What's new" lines while the game is pre-release.** Kingdom Builder
  is being built in the open but not yet announced, so the PRs from here on
  add nothing to `whatsNew.ts` — AGENTS.md's release-note rule is about what
  players have been told, and nobody has been told about this yet. The
  release that announces the game gets its one line then. (The shipped PRs
  below record the lines they did or didn't add at the time.)
- **Commits within a PR are ordered so the PR still builds at every commit**,
  the same discipline as the PR sequence itself, just one level down —
  reviewers should be able to check out any commit in a PR and get a green
  build, not just the final one.

### 11.2 Milestone A — a working prototype

**Goal:** one player can create a world, get a starting settlement, watch
wood/stone/iron tick up on their own, and queue one building — reachable
only via a direct URL, not yet linked from the app's navigation or game
library.

**PR 1 — World generator (pure functions, no persistence, no UI)** — Shipped.
Entirely new files under `src/games/KingdomBuilder/worldgen/`; nothing else
in the repo imports this package yet, so the PR cannot regress anything and
review is just the generator's own correctness and its unit tests.
1. `landmass.ts` — noise-based land/water field and the `WorldNode`/
   `WorldEdge` types.
2. `terrainNodes.ts` — Poisson-disc terrain node placement (forest, quarry,
   ore) per §3.2.
3. `settlementSites.ts` — site placement plus the §3.3 fairness scoring
   (resource-parity radius, minimum separation, no-cornering).
4. `graphConnectivity.ts` — spanning-tree plus chokepoint edges, each typed
   with the §6.2 terrain movement-cost multiplier.
5. `generateWorld.ts` — one seeded entry point orchestrating the above,
   including §3.3's reject-and-retry loop.
6. Unit tests per step, plus one "generate 20 worlds, assert every one
   passes the fairness checks" test.

**PR 2 — Persistence layer (schemas only, no routes)** — Shipped.
Adds `KingdomBuilderWorldModel` (the generated graph plus the current tick
number) and `KingdomBuilderSettlementModel` (owner, node id, 3×3 tile
state) under `src/games/KingdomBuilder/`. New collections only — nothing
here touches `GameData` or any existing schema.
1. `World` schema and indexes.
2. `Settlement` schema (tile array, resource counters, building levels).
3. `createWorld(seed)`, persisting one generator run.
4. `foundSettlement(worldId, userId, siteId)` for a player's first
   settlement.

**PR 3 — Tick engine and a dormant cron route** — Shipped.
1. `applyTick(world)` — a pure function: add production, advance one step
   of in-flight construction. No movement or combat yet, since nothing can
   move or fight in Milestone A.
2. `POST /api/cron/kingdombuilder-tick`, gated by `isAuthorisedCron`
   exactly like the existing cron routes, but **not yet in `vercel.json`**
   — callable for manual/test exercising only.
3. A route test exercising the auth gate the same way `turntimer`'s does.

**PR 4 — Minimal prototype UI** — Shipped.
1. A settlement screen at a direct, unlinked route (e.g.
   `/kingdombuilder/[worldId]/[settlementId]`) rendering the 3×3 grid and
   resource counts, built from `Section` and `ag-*` classes per AGENTS.md
   rather than bespoke markup.
2. A "queue building" API route with its own ownership check (only the
   settlement's owner may queue on it — a `locksmith` concern from day one).
3. Wire the UI to refetch after a tick so a completed queue item shows up.

**PR 5 — Turn it on** — Shipped.
The one PR in Milestone A allowed to touch shared files, because it's the
PR that makes the prototype real:
1. Add the tick route to `vercel.json`'s `crons`.
2. Register Kingdom Builder in `src/utils/ui/games.ts` and the `GameLogic`
   barrel per `new-game.md`, satisfying the serializable-registry test.
3. One `whatsNew.ts` entry, once — per AGENTS.md's one-line-per-branch rule
   — since this is the point the game becomes genuinely player-visible.
4. Full reviewer pass before merging: `rulebook` (wiring), `locksmith` +
   `gremlin` (the new route and cron), `caveman` (the UI) — this PR earns
   all of them, unlike PRs 1–4 which mostly don't touch anything reviewable
   in those terms yet.

That closes the prototype: build → queue → tick → watch it complete, for
one player, no map, no armies.

### 11.3 Milestone B — expanding functionality

Each PR below is additive on top of the shipped prototype — new fields, new
routes, new commands — so the same non-disruption property holds: none of
them changes what Milestone A already does for a settlement sitting alone.
Five of them reach outside Kingdom Builder's own files, and they are
deliberately the only five: **PR 7** touches the home dashboard and the app
rail, **PR 8** the shared invitation flow (`acceptSeat`, the lobby routes, the
join-code card and seat-count hook it shares with every setup screen),
**PR 11** and **PR 14** each add a page to `/admin` and its entry in the
admin-tools doc, and **PR 27** the push-notification plumbing. Everything else stays inside
`src/games/KingdomBuilder/` and Kingdom Builder's own routes, bar PR 28's
one-line entries in the guide and tutorial registries, PRs 29 and 30's lines
in the tile mapper's existing admin-tools entry, and PR 30's
reduced-motion rule in `ag-theme.css` — and PR 25's `step` on the shared
`Stepper` and one-column-per-option `.ag-trade-grid`, both for the market's pickers.

- **PR 6 — World map view and multiple settlements.** Shipped. Render the
  generated graph and let a second settlement be founded elsewhere on it. No armies
  yet — a pure map-rendering PR, reusing
  `ClickableMapNode`/`MapEdges`/`BoardZoom` per §3.1. "Multiple settlements"
  here means a second settlement for the *same* player; the second *player*
  arrives in PR 8.
- **PR 7 — Worlds on the dashboard.** Shipped. Milestone A left a world reachable only
  by its URL, and PR 5 registered Kingdom Builder in the game library — which
  is only the half that starts a *new* world. Nothing lists the worlds a
  player is already in, so closing the tab loses the world. This PR is the
  missing half, and it leads the rest of Milestone B because every PR after
  it is playtested by coming back to a world days later.
  1. `worldSummaries(userId)` in the Kingdom Builder package: the player's
     settlements read by `ownerId`, collapsed to one row per world. The
     `{ ownerId: 1, worldId: 1 }` index it needs already exists from PR 2.
  2. A `worlds` array on `IDashboardResponse`, filled in `buildDashboard`.
     It is a read of its own rather than a fourth member of that function's
     `Promise.all`, and it swallows its own failure to an empty list exactly
     as `unreadChatCounts` does: a hiccup in Kingdom Builder's collections
     must cost a Kingdom Builder row, not everybody's turn lists.
  3. A `ListSection` of world rows on the dashboard, and the world in
     `AppRail`'s game switcher — that switcher is "every game in play", so a
     world missing from it is the same bug one layer up. Deliberately *not*
     `MyTurnList`: a world has no `currentTurn` and never will (§5.5), so the
     row's signal is the tick clock, the settlement count and what has
     finished building since the last visit, not "your turn".
  4. Reviewers: `rulebook` (shared dashboard shape and the response
     contract), `gremlin` (an extra read on the most-hit route in the app,
     plus the failure isolation above), `caveman` (reuse `ListSection` and
     the `ag-*` list classes rather than growing a second turn list).
  5. One `whatsNew.ts` line — the first player-visible change since the
     prototype's own note.

  Worth saying plainly what this isn't: a world does not become a `GameData`
  document here, and no code learns to pretend it is one. The dashboard grows
  a list served from Kingdom Builder's own collections, which is §10's
  cardinality problem answered by shape rather than by squeezing a persistent
  world into the single-match model.

- **PR 8 — More than one player in a world.** Shipped. The generator has placed ten
  fair `player-start` sites since PR 1 (§3.3) and `foundSettlement` has taken
  a `userId` since PR 2, but only ever one is claimed:
  `/api/newgame/kingdombuilder` founds the host's settlement and the other
  nine sites sit empty. Everything from PR 19 on is about doing something to
  somebody, so this is the PR that supplies the somebody.
  1. A roster on the world document — a seat per player, with the site they
     claimed and when they joined — plus the join code and the `expiresAt`
     reaping the existing lobby already models. Ten seats, per §1.
  2. The setup screen gains `usePlayerList`/`UserInviteList` and a world
     size, like every other game's setup screen, so a host can invite named
     friends and not only share a code.
  3. Joining claims a free `player-start` site and founds that player's first
     settlement through the existing `foundSettlement(…, "first")` — whose
     unique `{ worldId, nodeId }` and `{ worldId, ownerId, settlementNumber }`
     indexes already arbitrate two players reaching for the same site in the
     same second. The race is designed for, not new here.
  4. A world stays open after it starts. Joining mid-season is the whole point
     of §9's new-player protection, so a seat filling on day three is the
     normal case rather than an edge one — which is why the existing
     accept-then-start invitation flow is reused for the code, the invite rows
     and the share link, but not for its "everyone has accepted, now begin"
     gate or its `CreateGame` (that mints a `GameData`, and a world isn't
     one — see PR 7).
  5. The PR 7 dashboard row gains the seat count, and PR 6's world map shows
     who owns which settlement.
  6. Reviewers: `locksmith` (the join path is a signed-in stranger asking for
     a seat in a world nobody offered them — the code, the seat cap and
     one-settlement-per-owner are security boundaries now, not just data
     rules), `croupier` (the moment a world holds two players, the map
     response has to decide what each may see of the other; the fog-of-war
     contract of PR 20 effectively starts here, before any army exists to
     hide), `gremlin` (ten players claiming sites at once, and a seat filling
     while a tick is mid-sweep), `rulebook` (the setup screen should now look
     like every other setup screen).
  7. One `whatsNew.ts` line.

  How it landed: the roster is `hostId`, `seatCount` and `roster` on the world
  document; `joinWorld` claims a seat with one conditional `$push` (no seat
  already, site free, roster short of the seat count) and then founds through
  `foundSettlement(…, "first")`. The code, its expiry and the invite rows live
  on a `KingdomBuilderInvitation` — the ordinary lobby invitation plus a
  `worldId` — whose seats `acceptSeat` accepts by joining the world instead of
  gating on everyone and calling `CreateGame`; it is kept out of
  `INVITATION_MODELS` so the generic lobby route can never mint one without a
  world. The code is reaped with the lobby's longest lifetime (seven days), so
  a world's unfilled seats close with it rather than staying a permanent open
  link. The "world size" on the setup screen is its seat count — the named
  players plus the open seats plus the host. The `whatsNew.ts` line was left
  for the release that announces multiplayer.

- **PR 9 — The area registry and the generated ground.** Shipped. §3.5.2 and
  §3.5.4, with no art and no new pixels on screen: the world gains a ground
  truth, and movement cost starts coming from it.
  1. `areas.ts` — the `AREAS` registry itself, with the launch set's codes,
     weights, priorities, fallback colours and `placement` entries, and its
     guard test (unique codes, reserved retirements, every entry reachable by
     the generator). This file is the extension point, so it lands first and
     alone.
  2. `terrainField.ts` in `worldgen/` — the moisture field, the window lookup
     driven by the registry, and the smoothing pass. Then the named placement
     passes: the border flood fill that tells lake from ocean, the downhill
     river trace, the shore band for beach, the radius that paints fields
     around sites. Pure, seeded, unit tested per pass like every other
     generator file.
  3. The field on the world document as the one-character-per-tile string of
     §3.5.2, written by `createWorld` and never updated afterwards — plus the
     read path's unknown-code rule, which is a test of its own because a
     rolling deploy is exactly when nobody is watching.
  4. `edgeCostFor(field, overlays, from, to)` — the supercover tile walk and
     the weighted sum — replacing `edgeTerrain`'s nearest-node guess and
     deleting the synthetic centre-line river and its two hard-coded bridge
     bands. `EdgeTerrain` stays as the derived label, so nothing downstream of
     it changes shape.
  5. Connectivity becomes water-aware: an edge whose walk touches ocean is
     never offered to Prim's, and one clipping a river or lake at a pinch is a
     `river-crossing`. The existing "generate 20 worlds" fairness test gains
     the assertion that every world is still connected once water can veto an
     edge — §3.3's reject-and-retry loop is what absorbs the ones that aren't.
  6. The `OVERLAYS` registry and the sparse overlay list on the world document
     (§3.5.3), carrying **only the derived, load-bearing entries** at this
     point: the bridge or ford on every crossing the pass above just found.
     The shape lands here so PR 12 is additive; the vocabulary does not.
  7. Terrain nodes placed on matching ground, and the fairness test's
     reachability assertions moved from hop count to time-weighted cost, per
     §3.5.4.
  8. Reviewers: `gremlin` (a generator that can now fail to connect a world is
     a generator that can loop — the retry cap, what happens when it is hit,
     and the unknown-code path), `rulebook` (two new registries with their
     tests, new files in `worldgen/`, new schema fields).
     No `whatsNew.ts` line: nothing here is visible yet.
- **PR 10 — Draw the ground beneath the graph.** Shipped. §3.5.6's composited layer, in
  flat colours, before any art exists.
  1. The `tileset.ts` manifest with its sheet list empty and nothing but each
     registry entry's fallback colour resolved — plus the guard test in its
     lenient form (what is declared must be valid; nothing need be declared
     yet).
  2. `useTerrainImage(world)`: the three registry-driven passes of §3.5.6 onto
     an offscreen canvas, the `toBlob` object URL and its revoke, returning the
     one `href` the map draws as its first `<svg>` child, before `MapEdges`.
  3. `worldView` serves the field and the overlay list; a world without them
     keeps today's silhouette from `landmass.values`, which is also the
     no-sheet fallback path arriving early.
  4. The legend, generated from the registry rather than written out.
  5. Reviewers: `caveman` (the map already draws a single `<image>` board in
     two other games — this should look like those, not like a new way of
     drawing a map), `gremlin` (a canvas context the browser can refuse, a
     `toBlob` that can hand back `null`, a field whose length disagrees with
     the grid, an unknown area code, and an object URL that must not leak on
     every refetch — draw the fallback, never throw inside a board).
  6. One `whatsNew.ts` line: the world map now reads as terrain.
- **PR 11 — The sheets, the mapper and the borders.** Shipped. The art landing, and the
  first PR here that needs art to exist.
  1. The tileset mapper at `/admin/kingdombuilder-tiles` per §3.5.5: the
     **pixel tile-size picker** (width and height, margin and spacing, live
     grid overlay, even-divisor suggestions, the partial-row warning, last
     values remembered through `useStoredValue`), then click-to-assign against
     a registry entry and its layout role, then copy out the `tileset.ts`.
     Behind `AdminPage`, persisting nothing, documented in
     `docs/admin-tools.md` beside the track editor it is modelled on.
  2. The first sheet into `art-masters/kingdombuilder/` and
     `public/art/kingdombuilder/`, through `npm run optimise-art`.
  3. The manifest's four layouts (`mask16`, `orientation`, `variants`,
     `single`) and the sheet list with per-sheet pixel sizes; the guard test
     tightened to require all sixteen variants of every `mask16` entry that
     declares any.
  4. The canvas passes gain the autotile mask, the priority-ordered border
     draw and the seeded variant pick, keeping the flat-colour path per entry
     so an area whose art hasn't arrived still draws.
  5. Reviewers: `caveman` (the mapper is a second canvas editor in this repo —
     whatever the track editor already solved should not be solved again),
     `rulebook` (art pipeline, the admin-tools doc, the manifest as a registry
     with a test).
  6. One `whatsNew.ts` line — and if PR 10's line has not shipped to players
     yet, this widens that line rather than adding a second, per AGENTS.md.
- **PR 12 — The overlay vocabulary.** Shipped. The rest of §3.5.3 — piers,
  roads, landmarks — landed as a straight extension of `AREAS`/`OVERLAYS` and
  one placement pass each, with no change needed outside them: PRs 9–11's
  shape held.
  1. The derived overlays that aren't load-bearing: piers on coastal sites,
     roads under the edges between occupied settlements, signposts at
     junctions where three or more edges meet — `worldgen/overlayVocabulary.ts`.
  2. The scattered pass and its rules: ruins, standing stones, shipwrecks,
     watchtowers — seeded, so a world's landmarks are the same for everyone
     who loads it, and tolerant of a shortfall on an unlucky or small world
     rather than failing generation over a decorative pass.
  3. Roads are the one entry here with a movement effect, so the cost walk
     gains the road rule (§3.5.3): a road tile's weight is capped at the
     `Road` registry entry's own multiplier, which — per the registry's own
     comment and its guard test — no area's weight can undercut, so a road
     can only ever match or improve the ground it's laid on, never cost more.
  4. Reviewed by `caveman`, `rulebook` and `gremlin`.
  5. No `whatsNew.ts` line: every overlay here still draws nothing (§3.5.6's
     rule for a registry entry with no art yet), exactly as Bridge and Ford
     already do — nothing on the map changes for a player until a sheet
     lands for one of these through PR 11's mapper.
  6. Their art and manifest entries — through the mapper and the pipeline —
     are follow-up work, not blocking: same as every area shipped ahead of
     its own art (§3.5.2), a registry entry with no sheet yet draws nothing
     rather than standing in the way.
- **PR 13 — Barracks and units.** Shipped. Unit types/levels (§6.1) and a training
  queue on the barracks tile. Units accumulate in a garrison; nothing can
  leave it yet.

  How it landed: `units.ts` is the roster — §6.1's five units, each with a
  cost in all three resources, a base training time, the §6.2 speed label
  PR 19 will turn into a pace over the tiles, and the barracks level that unlocks it.
  "Levels" are the barracks' own: a settlement may hold one barracks, the one
  building a player can raise a level (to 3, each level taking longer to
  build), which unlocks infantry at 2 and cavalry and the siege engine at 3
  and takes a tick off every unit's training for each level above the one that
  unlocked it, never below one. Training is the first thing to *spend*
  resources (§4.3): a unit's whole cost is taken when it is queued, by one
  conditional update that repeats every check (owner, barracks level, queue
  room, stores) so a tick or a second tab in between fails the write rather
  than overdrawing. The queue — up to twenty units, head first — sits on the
  settlement beside the building queue rather than sharing it (§4.2's
  "separately"), and `applyTick` counts down only its head, so a barracks
  finishes at most one unit a tick into the `garrison` counts. A document from
  before this PR has neither field and reads as an empty queue and garrison.
  Both stay on the owner's own settlement screen: nothing in the world map or
  the dashboard carries them, which is PR 20's fog-of-war contract holding
  before there is an army to hide. Buildings still cost nothing to raise — PR 17
  prices them. No `whatsNew.ts` line on this branch.
- **PR 14 — End, leave and remove a world.** Shipped. §9.1. First of the new five
  because it is what makes the others testable: each of PRs 15–18 changes what
  a *new* world or settlement looks like, and without this every tester is left
  playing, or looking past, the worlds generated before it.
  1. `endedAt` (and an `endReason`) on the world document, and a conditional
     `endWorld(worldId, userId)` that sets it only for the host — or, on a
     world with no `hostId`, the owner of its first settlement — and only once.
  2. `leaveWorld(worldId, userId)`: delete the player's settlements, pull their
     roster seat (freeing the site), hand the host on if it was theirs, and end
     the world if the roster is now empty.
  3. The tick sweep's query, `worldSummaries`, `worldView` and every Kingdom
     Builder command route learn `endedAt`: an ended world never ticks, never
     takes a command, never lists on a dashboard, and its invitation code is
     revoked in the same write that ends it.
  4. A removal step at the end of the tick cron: worlds ended more than the
     retention window ago lose their settlements, invitation and then
     themselves, a bounded batch per run, each world in its own try so one
     failure doesn't stop the rest. "Delete now" is the same removal run
     inline for one world.
  5. The world screen gains "End world" (host) or "Leave world"
     (everyone else), behind a confirmation that names what will happen to
     the other players.
  6. `/admin/kingdombuilder-worlds` behind `AdminPage`: every world, newest
     first, with seed, seats, tick, age and an end/delete control — documented
     in `docs/admin-tools.md` beside the tile mapper.
  7. Reviewers: `locksmith` (a stranger ending someone else's world, a
     non-host ending it, a leaver deleting settlements that aren't theirs, the
     admin gate), `gremlin` (ending mid-sweep, a removal that dies partway, two
     players leaving at once so nobody is host, a bounded batch), `caveman`
     (the confirmation and the admin list should be existing pieces).

  How it landed: `lifecycle.ts` holds all of it. Ending is one `updateOne`
  conditional on `endedAt: null` and on the host still being the one read
  (`hostId: {$exists: false}` for a pre-PR 8 world, whose first settlement's
  owner is its host); the invitation is deleted straight after, best-effort,
  since `joinWorld` and `foundSettlement` already refuse an ended world. The
  sweep, the claim write in `tickWorld`, `worldView`, `worldSummaries` and both
  settlement commands (`assertWorldLive`) all read `endedAt`, and an ended
  world answers 404 like a missing one. Leaving is a loop, bounded like
  `joinWorld`'s, around one conditional roster write guarded on what it was
  decided from — the last player (nobody joined since), the host (still host,
  successor still seated) or anyone else — so two leaves at once can't hand the
  world to someone who has gone; the loser re-reads. The leaver's settlements
  are deleted before that write and again after, so a leave that dies partway
  leaves a player still seated rather than a settlement squatting on a freed
  site. The invitation follows the roster (`reconcileWorldInvitation`): the
  host is its sender, and any seat accepted by someone no longer seated — the
  leaver, or a successor who now hosts — goes back to the code. It runs after
  every leave and on the host's own world view, which repairs a leave that died
  before getting to it. A host's second tab ending an already-ended world
  succeeds rather than being told it isn't the host. The host can also leave rather than end, handing the world
  on. Removal deletes settlements, then the invitation, then the world; the tick
  cron's last step removes up to 20 worlds ended over seven days
  (`LOBBY_MAX_TTL_MS`) ago, each in its own try, found through a partial index
  on `endedAt`. `endReason` is `host`, `abandoned` or `admin`. The admin page
  lists the newest 50 worlds.
- **PR 15 — Map shape: ranges, not a central massif.** Shipped. §3.7.
  Generator-only; existing worlds are untouched. As tuned, about four in five
  first attempts pass the bands, and over 200 seeds no world needed more than
  its fifth attempt (of the loop's 80) or 1.7 s end to end — p99 1.4 s. The
  shape checks run before the graph is connected, so a rejected attempt skips
  its most expensive step.
  1. Split the landmass: the falloff becomes only the land mask (with domain
     warping and the seeded shape presets); elevation becomes its own field.
  2. `mountainRanges.ts` in `worldgen/`: seeded ridge polylines anywhere on
     land, their ridged elevation profile, and the passes cut into each one —
     pure and unit tested like every other generator file.
  3. Rolling lowland noise, and the moisture field's rain-shadow term.
  4. The composition bands and the two shape rules (largest mountain
     component, mountains spread across the map) added to §3.3's
     reject-and-retry loop, under its existing cap, and asserted by the
     "generate 20 worlds" test.
  5. `npm run kb-worlds` — the contact-sheet script — with before-and-after
     sheets attached to the PR for review.
  6. Reviewers: `gremlin` (more rejection criteria means more retries; what
     happens at the cap, and how long generation now takes at the p99 seed),
     `rulebook` (still no branch on an area name; the new script documented).
- **PR 16 — The tiles are the roads.** Shipped. §3.8. Lands before PR 19 so armies
  never move along edges at all.
  1. `tile` on every node; generation snaps nodes to distinct passable tiles,
     and a world from before this snaps its nodes on read.
  2. `tilePath.ts`: eight-neighbour Dijkstra/A\* over the field with the
     §3.5.4 per-tile weights and overlay overrides, no corner cutting past
     impassable tiles — plus a flood-fill variant for "cost to everywhere from
     here". Unit tested against hand-built fields (a river with one bridge,
     a pass through a range, a road beside rough ground).
  3. Edges re-derived as tile paths: each edge stores its path and its cost is
     that path's cost; connectivity asks "is there a path" rather than
     "does a straight line avoid the sea".
  4. The crossing pass rewritten over rivers themselves (a crossing every N
     tiles, at narrow points, and wherever a site-to-site route would detour
     too far), and roads laid under route tiles between occupied settlements.
  5. §3.3's fairness reachability switched to the flood fill.
  6. The map draws routes as paths — a polyline mode for `MapEdges` (or a
     sibling component), not a new map renderer.
  7. Reviewers: `caveman` (one pathfinder, used by the generator, fairness and
     — from PR 19 — armies), `gremlin` (a node on an island with no path, a
     search over a malformed field, how long the flood takes over ten
     starts), `croupier` (a stored path is exactly what fog of war must hide
     once armies carry one — agree now where it lives).

  How it landed: `worldgen/tilePath.ts` is the one pathfinder — `travelGridFor`
  (each tile's area weight, a bridge or ford's multiplier on its own water, a
  road capping the ground at its weight), `findTilePath` (A\* with the octile
  distance × the cheapest weight), `tileCostsFrom` (the bounded flood),
  `pathCost` and `snapToTiles`. A step costs its length × the mean of its two
  tiles' weights, so a route costs the same both ways; a diagonal may not pass
  the corner of any impassable tile. Terrain nodes and sites are snapped as
  they are placed. `worldgen/crossings.ts` runs before anything is pathed: a
  crossing every 12 tiles of each river (`RIVER_CROSSING_SPACING`, the first
  half that in), at the shortest straight span with dry ground at both ends —
  up to two tiles, because a river traced four-connected is a staircase, and
  no single tile of a staircase crosses it — then the detour rule over each
  site's three nearest neighbours, bridging or fording wherever the dry route
  costs more than 1.6× one that may cross water. `connectWorldGraph` keeps the
  MST-plus-extras shape by straight-line distance, but connectivity is one
  flood from the first node and each edge is `findTilePath` between its nodes,
  storing `path`. Roads are laid along the paths of edges between occupied
  settlements and those edges re-priced with `pathCost`. The fairness score
  floods from each site to its reach — which is now 24, not 3: the old reach
  was the hop count carried into cost units, reached no resource from almost
  any start, and so every score was zero and the parity band never bit. With
  a real reach every one of 40 seeds still passes by its fourth attempt, and
  generation got faster — p50 about 180 ms, down from the best part of a
  second, since the straight-line walk of every pair of nodes is gone.
  `walkTileLine`, `edgeCostFor` and `weightedGraphDistances` went with it. A
  world from before this has its nodes snapped and its edges re-pathed on read
  (`worldTiles.ts`, about 25 ms for a full world), which `worldView` saves
  once, guarded on the nodes still lacking tiles; a world from before PR 9 gets
  the tile under each node and keeps straight edges. The map draws each route
  through its tiles with `MapEdges`' new `waypoints`. Every node's `tile` and
  every edge's `path` are public map data; an army's route (PR 19) belongs on
  the army, not the world, so PR 20 has one field to redact. No `whatsNew.ts`
  line.
- **PR 17 — Buildings cost resources.** Shipped. §4.5.
  1. A `cost(type, level)` beside `buildTicksFor` in `buildings.ts`, with the
     first-pass table, shared by client and server.
  2. `queuePrototypeBuilding`'s conditional update gains the stores check and the
     deduction, the same single-write pattern units use since PR 13.
  3. The starting stockpile on a player's first settlement only, in
     `foundSettlement(…, "first")`.
  4. The town centre's trickle in `applyTick` — the softlock guard, which is
     also what rescues every existing settlement that built nothing.
  5. The settlement screen's building rows show their cost through
     `BuildRow`, disabled with the shortfall when unaffordable — one
     affordability helper shared with the unit rows.
  6. Reviewers: `locksmith` (queueing the same level from two tabs; queueing
     on a settlement that isn't yours now also spends someone else's stores),
     `gremlin` (a tick landing between the read and the conditional write),
     `caveman` (building and unit costs should be one shape and one helper).

  How it landed: every number lives in `economy.ts` beside `buildings.ts` —
  each building's level-one price, every unit's training price (moved out of
  `units.ts`, so both are tuned in one place), the first settlement's
  stockpile and the town centre's trickle, a resource left out of an entry
  reading as none. It is TypeScript like `tileset.ts` rather than JSON, so each
  number can carry a comment and `satisfies` makes a missing building or unit,
  or a misspelt resource, a compile error; the one rule types can't state —
  whole, non-negative amounts — is checked when the module loads, and a guard
  test runs that check over the real file.
  `buildingCostFor(type, level)` is the level-one price × the target level.
  `resources.ts` is the one affordability vocabulary — `canAfford`,
  `shortfallFor`, `formatResources` — used by the server's pre-checks and the
  settlement screen, for units as much as buildings; both queue commands take
  their cost with the same `spend` filter-and-`$inc`, so a building is paid for
  in the conditional write that queues it, exactly as a unit has been since PR
  13, and a lost race answers `QUEUE_BUSY` rather than overdrawing. Only
  `foundSettlement(…, "first")` gets the stockpile (40 wood, 20 stone). The
  trickle — 1 wood a tick — is paid by the town centre in `productionFor`, so
  every settlement from before this earns it without a migration. The build,
  upgrade and training rows all print their price, and an unaffordable one
  stays on screen, disabled, with "short 5 wood" beside the price. The farm and
  wheat wait on PR 18. No `whatsNew.ts` line.
- **PR 18 — Wheat, farms, and land-driven production.** Shipped. §4.6.
  1. `wheat` in `KingdomBuilderResources` (absent reads as zero), the farm
     building, wheat in every unit's cost and in the starting stockpile.
  2. `yields` on the `AREAS` registry entries, with the registry guard test
     extended so every entry declares them (even if "nothing").
  3. `catchment.ts`: the tiles within the radius of a settlement's tile, the
     shares and the tiers — computed at founding and stored on the settlement,
     plus a one-off backfill for existing settlements from their world's field.
  4. `applyTick` reads the tier for each production building; a building
     whose resource has no tier can't be queued.
  5. §3.3's fairness score reads catchment tiers, with the "at least Poor in
     all four" rule for player starts.
  6. The settlement screen shows the four tiers ("Rich woodland") near the
     resource counts, and the world map shows wheat beside the rest.
  7. Reviewers: `rulebook` (a new field on a registry and its test; the
     schema change and its backfill), `gremlin` (the backfill over every
     settlement, a world with no field), `caveman` (tiers read off the
     registry, never a switch on area name).

  How it landed: `wheat` is the fourth entry in `KINGDOM_BUILDER_RESOURCE_TYPES`,
  and everything that loops over resources picked it up; a document with no
  wheat field reads as zero through `resourcesOf`, and the `spend` filter now
  checks only the resources a price asks for, since `$gte: 0` refuses a field
  that isn't there. The farm costs 10 wood and 5 stone; units carry §4.6's
  wheat prices, the first stockpile 20 wheat and the trickle 1 wheat.
  Each `AREAS` entry declares `yields` (a share of a tile per resource, `{}`
  for nothing), grass and fields add `irrigated` (what they yield beside
  water) and river and lake `irrigates`; the guard test holds every entry to
  known resources and sane amounts, and every resource to some ground.
  `worldgen/catchment.ts` is the pure part — the radius-4 disc (69 tiles, a
  9 × 9 square with its corners cut, off-map tiles left out and sea counted),
  the shares, the tiers, what each pays per level (0–3) and the groundless
  fallback; the radius and bands are `catchmentRadius` and `yieldTiers` in
  `economy.ts`. Irrigation is the four orthogonal neighbours and doesn't stack.
  `land.ts` stands a settlement on its site — the tile under a node from before
  PR 16 — and `foundSettlement` stores the tiers. Older settlements are
  backfilled by the tick cron, once per world, from the stored field and saved
  with the tick's own write; the settlement screen and the queue command
  backfill any it hasn't reached yet, guarded on the field still being absent.
  A world with no field gets Good in everything bar iron, which is Good only
  where a mine already stands. `productionFor` pays level × the tier's output,
  so a mine standing on land with no iron makes nothing, and
  `queuePrototypeBuilding` refuses a production building on land with no tier
  (`NO_YIELD`) before it spends anything. The fairness score is now the sum of
  a site's tier outputs (terrain nodes stay on the map as landmarks and no
  longer count), eligible starts are drawn only from sites yielding all four,
  and `checkSettlementFairness` names any start that doesn't. About half of
  all sites qualify, and generation over 40 seeds needed exactly the attempts
  it did before. The settlement screen shows each count over its tier ("Rich
  woodland"), prints each building's output on this land, and keeps a
  building its land can't hold on screen, disabled, saying why; the world
  map's ground legend names what each area yields. Upkeep stays open (§12). No
  `whatsNew.ts` line.
- **PR 19 — Army dispatch and movement.** Shipped. A command to send a garrison (or
  part of it) toward another node, pathed over the tiles by PR 16's
  pathfinder, and a movement step in the tick engine spending §6.2's terrain
  multipliers tile by tile. Arrival does nothing special yet — this PR is
  purely "can an army cross the generated map." It also answers PR 14's
  leftover question: a player who leaves a world disbands their armies in the
  field.

  How it landed: an army is its own document (`KingdomBuilderArmyModel`),
  not a field on the world, so PR 20 has one collection to redact. It stores its
  units, its `path` (every tile, both ends included), `pathCosts` (what the path
  has cost by each tile, from `costsAlong` beside the one pathfinder), how much
  it has `travelled`, the node it set out from and the one it is bound for, and
  `arrivedAtTick` once it gets there. `armies.ts` is the pure half, shared with
  the world map so the ETA it previews is the one the tick keeps: a stack's pace
  is its slowest unit's (`KINGDOM_BUILDER_PACES` in `units.ts` — 2, 3 and 4 path
  cost a tick, where a straight grass step costs 2), and each tick it spends that
  pace against the route, standing on the last tile it has paid for. The cost is
  fixed at dispatch, so the ETA never moves under a march. `applyTick` marches
  armies after the settlements' own work; the cron loads only the ones still on
  the road (`arrivedAtTick: null`) and saves them with the tick's own
  transaction. Arrival camps the army — except at one of its owner's own
  settlements, where it rejoins that garrison the tick it arrives and the army
  document is deleted, which is how reinforcing another settlement and coming
  home both work. The march command is `action: "march"` on the world route:
  units out of a garrison (spent and the army created in one transaction,
  conditional on the garrison still holding them), or new orders for an army
  already out — onward from its camp, or turned round from the tile it stands
  on, guarded on it not having moved since it was read. Twenty armies a player
  a world at most, counted inside the dispatch's transaction behind a write to
  the world (`armiesDispatched`), so two dispatches at once conflict rather
  than both slipping under the limit. The settlement or army is looked up with the caller as owner
  before anything about the world is read, so a stranger's order learns nothing.
  `worldView` carries the viewer's own armies and their own garrisons only —
  the query names the owner, so nobody else's army is ever read (§6.3). The
  world map draws each army and the road it has left in the owner's colour,
  mustering from a garrison or tapping an army opens a draft, and any node on
  the map is then a destination, with the route previewed dashed and its length
  in ticks. Leaving a world disbands the leaver's armies with their
  settlements, and removing a world removes its armies. No upkeep yet (§12). No
  `whatsNew.ts` line.
- **PR 20 — Fog of war.** Shipped. Redact in-transit armies from `worldView(worldId,
  userId)` — Kingdom Builder's own per-viewer response, which the shared
  `CreateDataResponse` guard does not cover — for everyone but the owner — a `croupier`
  concern, verified with the `trace-hidden-state` skill — plus the scout
  unit and detection upgrade as the two reveal paths from §6.3.

  How it landed: settlements stay public and armies are what the fog hides,
  camped or marching alike. `sight.ts` is the pure half: a sight is a tile and a
  radius in tiles, measured centre to centre by column and row. Every settlement
  of the viewer's watches `KINGDOM_BUILDER_SETTLEMENT_SIGHT[barracksLevel]` (3,
  3, 5, 7 — the detection upgrade), every army of theirs 4, or 8 with a scout
  in it. `worldView` builds the viewer's sights from their own settlements and
  armies, then reads everyone else's armies with a projection that takes only
  what finding a tile needs (owner, units, path, costs, travelled) and sends a
  `sightings` row — seat, tile, units — for each one inside a sight, ordered by
  seat and tile rather than by when it set out; nothing about an army out of
  sight reaches the wire, and no army id, road, destination or ETA ever does.
  A rival settlement carries its `garrison` only while a scouting army of the
  viewer's can see its tile — a live read rather than §6.3's snapshot, which
  needed a report stored per scout and bought nothing a camped scout doesn't.
  The view also sends the viewer's own `sight` circles, which the world map
  shades outside of (the fog dims the ground, never a settlement); it draws
  each sighting in its owner's colour with no road, and an "In sight" list
  names each rival army near the closest place on the map and each garrison a
  scout is counting. First-pass radii (§12). No `whatsNew.ts` line.
- **PR 21 — Automatic siege on arrival.** Shipped. Arrival at a hostile settlement
  opens a siege (§6.4/§8): debuffs, the grace period, and the two new
  player actions, "push the attack" and "sally out" — both stubbed to a
  placeholder resolution for now.

  How it landed: a siege is not a document of its own but a fact about an army.
  An army gains `besiegingSince` when the tick finds it camped at a settlement
  that isn't its owner's, and loses it when no such settlement stands there any
  more (its owner left the world) or when it is sent onward. The tick dates it,
  rather than the arrival, so a town founded under a camp — or an army camped at
  a rival's town since before this PR — gets its grace period too. `siege.ts` is
  the pure half: `siegeOf` dates a siege from the earliest army still besieging,
  `siegeStage` is `grace` for `KINGDOM_BUILDER_SIEGE_GRACE_TICKS` (4) ticks and
  `full` after, and `placeholderBattle` is the stand-in for combat. `applyTick`
  reads sieges from the armies as the tick begins, so an army arriving this tick
  bites from the next: a besieged settlement's production is halved (rounded
  down) in either stage, and in the full one its construction and training
  queue don't advance. The tick cron now loads every army in a world, camped ones
  included, and writes only those that moved or began or ended a siege.
  Push and sally are `action: "push"` (an army id) and `action: "sally"` (a
  settlement id) on the world route, in `assault.ts`. The army or settlement is
  looked up with the caller as owner first, so a stranger learns nothing. Each
  battle runs in one transaction that first bumps the world's `battlesFought`,
  so it conflicts with the tick, a dispatch or another battle rather than
  fighting a garrison that has changed. A push sends every army of the caller's
  besieging that settlement; a sally sends the whole garrison against every
  besieger, whoever owns them. The reply is the world view plus a `battle`
  report — what the caller sent and what it met — told only to the side that
  fought. `worldView` tells a player about the sieges on their own settlements
  (`siege: { sinceTick, fullFromTick }`) and on their own armies
  (`besiegingSince`). It reads only whose each camp is and since when, and tells
  nobody else that a town is besieged; a third player sees the army at the gate
  only if it is in their sight. The world map gains a Sieges section — each town
  under siege with Sally out, each besieging army with Push the attack, both
  confirmed before they go, then a line on how the battle went — and the
  settlement screen says when it is under siege. The other side of a battle
  learns of it only from what it left behind; a report for both sides is PR 22's.
  No `whatsNew.ts` line.
- **PR 22 — Combat resolution.** Shipped. The deterministic multi-round attrition
  engine with unit-type counters (§7.3/§7.6) as a pure function with its own
  matchup-table test suite, then wired into the two actions PR 21 stubbed.

  How it landed: `combat.ts` is the pure half — `resolveBattle(attacker,
  defender, { fortified })` and the stats, counters and defence behind it (§7.6
  has the numbers), plus `shareSurvivors`, which hands a side's survivors back
  to the stacks it fought with type by type, largest remainder first and the
  older army on a tie. `combat.test.ts` is the matchup table: a row per fight a
  player should be able to call from the counters alone. `assault.ts` fights a
  push `fortified` and a sally not, then writes the garrison to what is left of
  it and each army that fought to its share — deleting any left with nothing —
  in one bulk write inside the battle's transaction. Survivors come home either
  way, so a stand-off costs both sides what they lost and moves nothing else.
  The battle's claim on the world now reads the tick it is fought on.

  Every battle is kept, as a `KingdomBuilderBattleModel` document: the world,
  the tick, the kind, the node, who fought on each side (`attackerIds`, and
  `defenderIds` — every besieger's owner in a sally), what each side brought,
  each round's losses, and `shares`: what each player who fought brought and
  kept. It answers PR 21's leftover: the side that didn't start a battle reads
  it too. `battleReports.ts` turns one into a `KingdomBuilderBattleReport` from
  the reader's side — their own units first, the other side second,
  `won`/`lost`/`held` — and `worldView` carries the viewer's latest five
  (`battles`), read by naming the viewer on either side, so nobody sees a
  battle they weren't in; a failed read shows no battles rather than failing
  the view. Nothing in a report is news to its reader, who saw the other side
  at the gate — except what a fellow besieger brought, so a besieger sharing a
  side with another player's armies is told their own units only, and their
  own side's losses round by round are left out (they would give the other's
  away). The push
  and sally reply is now just the world view, whose `battles` begin with the
  one just fought, and removing a world removes its battles; a leaver's stay for
  the others who fought them. The world map gains a Battles section under
  Sieges — each battle with what went in, what each side lost, and a round by
  round log to unfold — and Sieges' hint says what the defences do. No
  `whatsNew.ts` line.
- **PR 23 — Barbarian villages.** Shipped. Generator gains barbarian site placement
  (§3.4); combat resolution from PR 22 applies directly on arrival, no
  siege phase, per §3.4's rule.

  How it landed: `assignBarbarianVillages` hands a quarter of the open expansion
  sites (`4 × WORLD_AREA_SCALE`, at most half of them) to barbarians once the
  starts are fixed, before the overlay vocabulary — which already counted a
  barbarian site as occupied for its roads. `barbarians.ts` is the pure half:
  `barbarianVillagesFor` garrisons each village by its rank in distance from the
  nearest player start, in thirds (§3.4 has the numbers), and `assaultVillages`
  fights every army camped at a standing village. A player's armies there go in
  together, fortified against; two players' go in one after the other, oldest
  army first, each against what the last left. The world stores the standing
  villages and their garrisons (`barbarians`), written by the world's first
  generation and never backfilled — a world from before this has no barbarian
  sites either. The tick cron runs the assault after the sweep's ticks, so a
  sweep catching up several ticks fights once, on its last: it writes the
  villages with its claim on the world, creates a settlement for each village
  taken (in the owner's free slot, on the site's own land, the survivors its
  garrison) and a `barbarian` battle for each fight — attacker only,
  `defenderIds` empty — and writes each army that fought to what it has left,
  deleting any with nothing. A win by a player who already holds two settlements
  burns the village, and `foundSettlement` then takes a barbarian site with no
  village as open ground. A capture racing the same player's own "Found here" for their
  second slot loses to the unique index and fails that world's tick once; the
  next sweep sees the two settlements and burns the village. The sweep drops
  Milestone A's one-settlement-per-owner index before it starts, since a capture
  can be the first second settlement a database has seen. Anyone else camped at a village when it is taken is
  camped at a player's town, and the next tick dates their siege. `worldView`
  sends every standing village's node, and its garrison only while a scouting
  army of the viewer's can see it. The map draws villages in their own colour
  as "Barbarians", the Armies section says an army at one is fighting it, the
  Battles section reports the fight, and In sight lists what a scout has
  counted. No `whatsNew.ts` line.
- **PR 24 — Settlers and a second settlement.** Shipped. The settler unit and a
  "found here" command on open expansion sites (§4.4) — mostly a new unit
  type once PRs 6–19's map/movement/dispatch already exist.

  How it landed: `settler` joins `KINGDOM_BUILDER_UNIT_TYPES`, so it lives in a
  garrison, a stack, a battle and a report like any unit, with no field of its
  own. A unit definition now says where it trains (`trainedAt`, the barracks or
  the town centre, and the level that unlocks it) and whether it is `civilian`;
  `KINGDOM_BUILDER_MILITARY_UNIT_TYPES` is the rest, and `militaryCount` is what
  `isEscorted` now counts, so everything that asked "has this stack an escort?"
  — the siege, the barbarian assault, the caravan raid, the march's barbarian
  refusal — treats a settler as it does a caravan without being touched. It
  fights with no attack and 4 health, and a sally leaves it at home. The town
  centre joins `KINGDOM_BUILDER_UPGRADABLE_BUILDINGS` (to level 2, priced in
  `economy.ts` like the rest), raised by `queuePrototypeBuilding` on its own
  tile; `queueUnitTraining` reads the level of whichever building a unit trains
  at. `seizeCaravans` takes an unguarded stack's settlers along with its
  caravans, into the taker's units, and the raid's shares gain
  `settlersTaken`/`settlersLost`, each read by its own owner only.
  `settlers.ts` is the found command — `action: "settle"` with an army id on
  the world route — which claims the world like every camp command, refuses a
  stack with no settler, one still marching, and a player already at
  `KINGDOM_BUILDER_SETTLEMENT_LIMIT` (`sites.ts`, which barbarian captures now
  read too), and calls `foundSettlement(…, "expansion")` with the stack as its
  stock: the stockpile plus what its caravans carried, its soldiers and the
  rest of its settlers as the garrison, its caravans in the yard. Every stack
  of the player's camped there goes in with it, since a player's stack never
  camps at a town of their own. The unique indexes still decide a race for the
  site or the slot. The bare `siteId` POST that founded a town for free is
  gone. The world map's Armies section offers "Found a town here" among a
  camped stack's orders, `openSites` (`sites.ts`) is how both it and the map
  decide a site is open, and the settlement screen gains a Town centre section
  with its upgrade and the settler. No `whatsNew.ts` line.
- **PR 25 — Market and trade.** Shipped, ahead of PR 24 (§11.4 leaves it free
  to move). Resource conversion and player-to-player trade offers (§4.3), and
  caravans to carry stores by road (§4.7).

  How it landed: `market.ts` is the pure half — the rate a market level asks
  (`exchangeRateFor`), a caravan's price and load, the offer limit, and
  `amountsFrom`, which reads a set of resources from a request; `spendFrom`
  there is now the one conditional-spend helper the settlement's commands and
  the new ones share. The market joins the buildable list and, with the
  barracks, `KINGDOM_BUILDER_UPGRADABLE_BUILDINGS`, which is how
  `queuePrototypeBuilding` now levels either. The settlement route gains
  `action: "exchange"` and `action: "caravan"`; a settlement stores
  `caravans`. Trade offers are a collection of their own
  (`KingdomBuilderTradeOfferModel`), posted, taken and withdrawn through
  `trade.ts` on the world route (`offer`, `accept`, `withdraw`), each in one
  transaction that first bumps the world's `tradesMade`, so two posts at once
  conflict rather than both slipping under the limit. `worldView` carries the
  board as `offers` (`tradeBoard.ts`) — a failed read is an empty board — and,
  on the viewer's own settlements only, their stores, caravans and market
  level. An army document gains `caravans` and `cargo`: `paceOf` counts a
  caravan as slow, the tick's `withSiege` dates no siege for a stack with no
  units, `assaultVillages` leaves such a stack out and stocks a captured
  village from its conquerors' loads, and a stack rejoining a garrison unloads
  into its stores. The march route takes `caravans` and `cargo` at dispatch, and
  `detach`, `join` and `unload` where a stack has camped, each claiming the
  world like a dispatch so it can't interleave with the tick. A sighting carries
  a rival stack's caravan count and never its load. The settlement screen gains
  a Market section (exchange, caravans, upgrade), and the world map a Trade
  section and caravans in the muster and an army's orders. Leaving a world
  takes a player's offers with it, and removing one removes its board. Outside
  Kingdom Builder, `Stepper` gains a `step` (a load is picked five at a time)
  and `.ag-trade-grid` lays its options out a column apiece, so the market's
  four resources reuse the Settlements & Cities bank-trade picker.

  Caravans change hands rather than being lost (§4.7): `seizeCaravans`
  (`armies.ts`) runs in `applyTick` once the armies have moved, folding an
  unguarded stack into the first rival escort on its tile and listing the
  raid in the tick's `seized`, which the cron keeps as a `raid` battle with no
  rounds and no attacker units, so the loser learns nothing of the taker, and
  with no `nodeId` when it happened on the road, so the taker learns nothing
  of where the caravans were bound. `combineCaravans` is the one place stacks'
  caravans and loads are added up — joined, taken, brought home, or stocking
  a captured village. A
  push or sally's `returnSurvivors` hands back the caravans of the armies it
  disbands, and the winning town `$inc`s them into its yard and stores. A
  battle share gains `caravansTaken` and `caravansLost`, each read by its own
  owner only. No
  `whatsNew.ts` line.
- **PR 26 — Victory, seasons, catch-up.** Season length, scoring, new-player
  protection, diminishing returns, leaderboard (§9) — the systemic layer
  that turns the sandbox into a game with an end.
- **PR 27 — Push notifications.** Siege-onset, attack-resolved and
  construction-complete pushes over the app's existing FCM plumbing (§10).
  Held deliberately until last, since it's the one PR reaching into shared
  notification infrastructure, and it benefits from every event type above
  already existing to notify about.
- **PR 28 — Guide, tutorial, share card, polish.** `guide.ts`, `tutorial.ts`,
  the `og-game-kingdombuilder.png` share card, and a final full five-reviewer
  pass — the "most games also want a guide/tutorial" convention in
  AGENTS.md, deliberately last rather than first since it documents
  mechanics that were still moving through PRs 6–27.

Two presentation PRs were planned after the list above was drawn up, and are
numbered after it for that reason only. Neither depends on anything past
PR 11, neither touches a rule, a cost or the wire format, and both can land
whenever their art is ready — before PR 28 included, since a guide describes
mechanics and these change none.

- **PR 29 — Transparent-backed tiles.** §3.5.7. Lets an area's art say
  "whatever is next door shows through here" instead of assuming grass.
  1. `backing?: "baked" | "transparent"` on area art entries in `tileset.ts`,
     defaulting to `"baked"`, so the shipped manifest is unchanged byte for byte.
  2. The underlay in `useTerrainImage.ts`'s pass one: for a square whose
     area is transparent, four clipped wedges, each filled with the interior
     tile (or fallback colour) of the area across that side. It is one helper
     beside `drawTile` that finds "the interior tile of this area". Pass two
     then draws the edge tile over it as it does today. Unit tested without a
     DOM on the pure half: which area and which interior ref each wedge of a
     square resolves to, on hand-built fields (a woodland square with beach
     north and water east; a square matching on every side; the map's own
     border).
  3. The guard: `tilesetGuard.ts` decodes the sheet of any transparent entry
     with `sharp` and fails if a declared interior tile has a pixel with alpha
     below 255. It warns, without failing, on a baked entry whose edge tiles
     carry transparency.
  4. The mapper: checkerboard behind the sheet, the backing control
     (defaulting to transparent when the sheet has alpha), and the slot preview
     over a chosen neighbour area. `docs/admin-tools.md`'s mapper entry gains a
     line for each.
  5. The first transparent sheet into `art-masters/kingdombuilder/` and
     `public/art/kingdombuilder/` through `npm run optimise-art`, with the
     before-and-after alpha checked (§3.5.7). It is re-mapped for at least the
     areas whose grass fringe shows worst — mountains, beach and water — with the
     rest left baked, which exercises the mixed case on day one.
  6. Before-and-after screenshots of the same world's map attached to the PR,
     showing the borders that used to carry a grass fringe. (`npm run
     kb-worlds` draws fallback colours only, so it can't show this.)
  7. Reviewers: `caveman` (one underlay helper, reusing the mask and variant
     pickers pass one and two already have — not a second way of picking an
     interior tile), `gremlin` (a sheet whose alpha the optimiser mangled, a
     transparent entry whose neighbour has no art, a neighbour code the
     registry doesn't know, the map's own edge), `rulebook` (the manifest field
     and its guard, the art pipeline, the admin-tools doc).
  8. One `whatsNew.ts` enhancement line: different kinds of ground on the
     world map now meet cleanly, without a strip of grass between them.
- **PR 30 — Animated tiles.** §3.5.8. Water, fire and wind.
  1. `animation?: { frames, frameMs, offset, phase? }` on area and overlay art
     entries in `tileset.ts`, and a pure `animatedSquares(field, overlays)` that
     resolves every map square drawing animated art to its distinct
     (square of art, phase group). This is the grouping the layer is built
     from, and it is unit tested without a DOM: a field of one animated area
     yields one group per phase however large it is, and a mixed field yields
     exactly the distinct slots used.
  2. The composite leaves animated squares at their underlay (PR 29's wedges
     for a transparent entry, the fallback colour for a baked one) instead of
     drawing frame 0.
  3. The frame atlas: every frame of every distinct animated square baked into
     one small canvas, one `toBlob` object URL revoked alongside the
     composite's, from the same effect in `useTerrainImage` (which now returns
     both).
  4. `AnimatedTerrainLayer`, a Kingdom Builder component drawn inside the map's
     `<svg>` between the composite `<image>` and `MapEdges`. It holds one
     `<pattern>` per (square, frame) and one `<path>` per (square, frame, phase
     group), with the visibility keyframes and phase delays. The CSS lives in
     `ag-theme.css` beside the other `@media (prefers-reduced-motion: reduce)`
     blocks. It pauses off screen via an `IntersectionObserver` on the board.
  5. The guard: frame count 2–8, `frameMs ≥ 120`, the phase list, and every
     frame of every declared tile inside its sheet's bounds.
  6. The mapper: the frames control, the "click frame 2" offset pick and the
     cycling preview. `docs/admin-tools.md` gains a line.
  7. Art: animated water first (ocean, lake and river share it), then one
     animated overlay (a fire or a windmill) to prove the overlay path.
     Woodland in the wind follows as art arrives, as manifest entries only.
  8. The profile from §3.5.8 in the PR description: a 100 × 70 world, animated
     water and woodland, a mid-range Android phone, zoomed out and in. If the
     zoomed-out view is over budget, the layer animates only from the first
     zoom step in.
  9. Reviewers: `caveman` (the layer should be the smallest thing that draws
     patterns and paths inside the existing `<svg>` — no second map renderer,
     no zoom code of its own), `gremlin` (an atlas `toBlob` that returns
     `null`, a second object URL that must not leak on refetch, a manifest that
     declares hundreds of distinct animated squares, a board that unmounts
     mid-bake), `rulebook` (the manifest field and its guard, the CSS in the
     theme file, the admin-tools doc).
  10. One `whatsNew.ts` enhancement line: the world map now moves, with water
      and fire animating. If PR 29's line hasn't shipped to players yet, and
      the two land close together, widen that line instead of adding a second
      one, per AGENTS.md.

### 11.4 Ordering constraints

Most of Milestone B can be resequenced to fit priorities without breaking
anything — trade (PR 25) and seasons (PR 26) don't depend on each other, for
instance, and either could move earlier or later freely. Eight orderings
are not negotiable, because each is a hard dependency rather than a
priority call:

- **PR 5 cannot move earlier than PR 1–4.** It's the wiring step; there's
  nothing to turn on before the prototype exists, and it's also the last
  point at which every PR before it was, by construction, invisible to a
  player.
- **PR 8 (more than one player) must land before or alongside PR 20 (fog of
  war), PR 21 (siege) and PR 26 (seasons).** An army cannot be hidden from
  nobody, a player cannot lay siege to their own town, and scoring,
  new-player protection and a leaderboard are all comparisons between
  players — each of the three is untestable, not merely unexciting, in a
  world of one. The PRs either side of them are genuinely fine solo: a
  barracks trains and an army marches on an empty site without an opponent
  (PRs 13 and 19), and PR 23's barbarians are neutral rather than player-owned, so
  none of those forces the ordering on its own.
- **PR 9 (the area registry) and PR 12's roads must land before PR 19
  (dispatch and movement).** PR 9 is where an edge's cost stops being a guess
  at the nearest node and starts being the ground it crosses (§3.5.4), and
  PR 19 is the first thing to *spend* those costs. Shipping movement first
  means shipping travel times that are about to change, and then changing them
  under players who have learned them — and roads are the one overlay that
  moves a cost, so they belong on the same side of that line. PRs 10 and 11 —
  drawing the ground, then painting it from the sheets — are presentation on
  top of PR 9 and can follow at any point; PR 11 additionally waits on the art
  existing, which is why the flat-colour map of PR 10 is a separate, shippable
  step rather than the first half of PR 11. PR 12's landmarks have no ordering
  constraint at all beyond needing the mapper from PR 11 to author their art.
- **PR 20 (fog of war) must land before or alongside PR 21 (siege).** Siege
  is only the game's warning system per §6.4 if armies were already hidden
  before it — shipping siege first would briefly make army movement visible
  by omission, which is a hidden-information regression even if temporary.
- **PR 22 (combat resolution) must land before or alongside PR 23
  (barbarians).** A barbarian village resolves combat immediately on
  arrival with no siege phase (§3.4), so it has nothing to call until the
  combat engine exists.
- **PR 16 (tiles as the travel network) must land before PR 19 (dispatch and
  movement).** The same argument as PR 9's, one level up: PR 19 is the first
  thing to move along the network, and moving armies along edges first would
  mean stored armies with an edge-based position to migrate, and travel times
  players have learned changing under them. Landing PR 16 first means no army
  ever has a position that isn't a tile.
- **PR 15 (map shape) must land before PR 18 (land-driven production).** PR
  18's fairness rule — every start at least Poor in all four resources — is
  only satisfiable on most seeds once §3.7's composition bands guarantee the
  map has enough of each kind of ground; on today's single-massif map, starts
  far from the middle routinely have no hills or mountains at all, and the
  reject-and-retry loop would spend its whole cap failing them.
- **PR 17 (building costs) must land before or alongside PR 19.** Once armies
  exist, the choice between spending on buildings and spending on units is the
  economy; shipping armies onto an economy where buildings are free means
  every playtest of dispatch starts from a fully built settlement, and
  measures nothing.

PR 7 is the one with no hard dependency at all — it could sit anywhere in
Milestone B, or could have sat alongside Milestone A. It leads the remaining
work because it is what makes everything after it testable by a real player
over real days, rather than by whoever still has the URL in their history.
PR 14 (ending a world) is the same kind of PR and leads PRs 15–18 for the
same reason: each of them changes what a *new* world or settlement looks like,
so being able to end yesterday's test world and start a fresh one is what
makes them testable at all. PR 15 before PR 16 is a preference rather than a
dependency — the pathfinder works on any field — but tuning passes and
crossings is easier on the map shape they'll actually ship on.

PRs 29 and 30 (transparent and animated tiles) have no hard dependency on
anything after PR 11, and none on each other: animated baked art works
without PR 29, and an animated square simply sits on its fallback colour
rather than a four-wedge underlay. PR 29 first is still the preference. It
means PR 30's "the composite draws only the underlay" rule has a real underlay
to draw from day one, and it means animated water can be drawn transparent at
the shoreline from its first sheet, rather than being redrawn later.

---

## 12. Open questions

Left open deliberately, for playtesting or a follow-up doc rather than
guessed at here:

- Tick length: settled at 15 minutes (§5.5), down from the hour first
  proposed. Whether build and travel times should be retuned to match — a
  two-tick building now finishes in half an hour — is part of the numbers
  pass below.
- Exact terrain movement-cost multipliers (§6.2) need numbers, not just
  relative ordering. Sight (§6.3) has first-pass radii since PR 20 — 4 tiles
  for an army, 8 with a scout, 3/5/7 for a settlement by barracks level — and
  detection is guaranteed inside them; whether those are the right distances
  against the paces below, and whether a scout's garrison read should become a
  stored snapshot once sieges make a stale read matter, are playtest questions.
- Barbarian village specifics (§3.4): does a conquered site ever respawn a
  new one elsewhere so the map doesn't run out of soft targets over a
  multi-week season, and does garrison strength scale continuously with
  distance from the centre or in discrete tiers?
- Siege numbers (§8): first pass since PR 21 — a four-tick grace period, half
  production throughout, building and training stopped after the grace period.
  Whether sieges should stack (two besiegers biting harder than one), and what a
  won push should lead to — capture, razing, or a settler's line of succession
  (§4.4) — are open until combat (PR 22) makes a push something other than a
  headcount.
- Does a sallying garrison forfeit the settlement's wall/terrain defence
  bonus entirely (§8), or keep some fraction of it? Zero is the simpler rule
  but may make sallying out a trap rather than a real choice.
- Alliances/diplomacy: nothing above assumes them, but a ten-player map
  without any is likely to converge on one dominant player unless the
  catch-up mechanics in §9 turn out to be strong enough alone — worth a
  dedicated exploration if playtesting bears that out.
- Terrain tuning (§3.5.2): the elevation/moisture windows that decide how much
  of a map is mountain versus hill versus open grass, how wide a fields radius
  around a site should be, and whether a 2 × 2 tile is the right grain — all
  "generate worlds and look at them" questions rather than ones to settle on
  paper. Which areas the launch set should actually ship with is the same kind
  of question, and cheap to change late by design. Whether a lake is ever
  crossable by anything but a bridge or ford (a boat, a winter freeze) is a
  rules question left with them.
- Market and caravan numbers (§4.7): whether 4/3/2 for 1 is too generous next
  to a Poor site's own output, and whether a caravan's 50 is the right load against
  the stores a mid-game town holds. Whether an escorted caravan on the road
  can be raided by a rival army that meets it waits on field combat; one with
  no escort already can (§4.7).
- Exact resource/time cost curves for buildings and units. §4.5 and §4.6 now
  give first-pass numbers (linear in level, a 40/20/0/20 starting stockpile,
  tiered output of 1/2/3 per level); they exist so PRs 17–18 have something
  to build against, and still want the numbers pass once armies can be fielded.
- Unit upkeep (§4.6): should units eat wheat every tick they exist, and if so
  what happens at zero — desertion, a combat penalty, or simply no new
  training? Armies are in the field since PR 19, which still charges nothing to
  keep one there; this wants the numbers pass beside the paces below.
- Army paces (§6.2): first pass 2, 3 and 4 path cost a tick for slow, medium and
  fast stacks (`KINGDOM_BUILDER_PACES`) — a slow stack crosses open grass at a
  tile a tick (15 minutes), so a neighbour two dozen grass tiles off is six hours
  away for militia and three for cavalry, before hills and passes. Whether that is the right scale for a
  world that runs for weeks is a playtest question.
- Overlapping catchments (§4.6): two settlements close together share tiles.
  Does a woodland tile count for both, for the nearer, or split between them?
  "Both" is simplest and rewards clustering; "nearer" is fairer to a rival
  who settles next door. Minimum site separation keeps this rare for now.
- Terrain nodes after §4.6: once production reads the tiles, do forest,
  quarry and ore nodes retire, stay as pure landmarks, or become rich deposits
  that raise the tier of a catchment they fall inside?
- Animated tiles (§3.5.8): whether the fully zoomed-out map can afford to
  animate on a mid-range phone, or only from the first zoom step in — PR 30
  measures it rather than guessing. Also whether players get their own
  "still map" toggle (through `useStoredValue`) beyond `prefers-reduced-motion`,
  and whether seasonal themes (§9) should swap in their own animated art, such
  as snowfall over a winter world.
- Map-shape presets (§3.7): which shapes the launch set ships with, and
  whether the host should pick one on the setup screen or it stays a seeded
  surprise.
