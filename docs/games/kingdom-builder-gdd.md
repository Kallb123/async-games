# Kingdom Builder — Game Design Document

**Status:** In build. Time model (§5.5) and combat model (§7.6) decided;
Milestone A's prototype and the world map that follows it are shipped, and
§11.3 is the plan for the rest.
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
4. [Settlements](#4-settlements)
   - 4.1 [Layout](#41-layout)
   - 4.2 [Buildings](#42-buildings)
   - 4.3 [The economy loop](#43-the-economy-loop)
   - 4.4 [Founding new settlements](#44-founding-new-settlements)
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
   Simplex noise thresholded to land vs. water) purely for flavour and to
   constrain where nodes can exist — the graph doesn't need the noise field
   at runtime, only during generation.
2. **Place terrain nodes.** Scatter forest, quarry, and ore nodes using
   Poisson-disc sampling (even-ish spacing, no two nodes on top of each
   other) with type weighted by the underlying noise (mountains bias to ore,
   plains to nothing special, forest edges to wood).
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
   river crossing), which §6.2 turns into its movement-cost multiplier.
5. **Assign starting sites to players** at world-join time (not at
   generation time), by the fairness rule in §3.3.

### 3.3 Balance constraints

"Procedural" and "fair" are in tension — the generator has to be constrained,
not merely random, or some player spawns next to three iron nodes and another
spawns in a resource desert. Concrete constraints:

- **Resource parity radius.** Every candidate starting site is scored on the
  total resource yield reachable within N edges (e.g. 3 travel-turns/ticks).
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
| **Mine** | Produces iron per turn/tick | Typically only buildable where the settlement is adjacent to an ore node — ties the settlement economy back to the world map rather than making all 8 tiles interchangeable |
| **Barracks** | Trains army units | Queue-based; higher levels unlock stronger unit types and shorten training time |
| **Market** | Converts one resource to another at a rate, and/or lists trade offers to other players | Gives a player short on iron but flush with wood a way out that isn't "wait" |
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
building matches its neighbouring terrain — a lumber camp built next to a
forest node outproduces the same-level lumber camp in a settlement with no
forest nearby. This is what makes §3.3's "parity on total value, not on
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

This is intentionally a small, closed loop: three resources, three sinks.
Depth is meant to come from *when* and *where* to spend (build up an economy
vs. rush an army; defend in depth vs. expand the border) rather than from a
sprawling resource list.

### 4.4 Founding new settlements

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
(an hour is a reasonable starting point — long enough that a sweep across
many worlds is cheap, short enough that "wait for the next tick" never feels
like the main activity; the exact length is still open, §12). Every sweep is
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

An army's base travel time is the graph distance (in edges) divided by the
**speed of its slowest unit** — mixing a scout into a siege train doesn't
make the siege train faster, so composition is a real trade-off between
striking power and response time.

Each edge also carries a **terrain movement-cost multiplier**, assigned at
generation (§3.2), applied on top of distance rather than instead of it:

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
- **Commits within a PR are ordered so the PR still builds at every commit**,
  the same discipline as the PR sequence itself, just one level down —
  reviewers should be able to check out any commit in a PR and get a green
  build, not just the final one.

### 11.2 Milestone A — a working prototype

**Goal:** one player can create a world, get a starting settlement, watch
wood/stone/iron tick up on their own, and queue one building — reachable
only via a direct URL, not yet linked from the app's navigation or game
library.

**PR 1 — World generator (pure functions, no persistence, no UI)**
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

**PR 2 — Persistence layer (schemas only, no routes)**
Adds `KingdomBuilderWorldModel` (the generated graph plus the current tick
number) and `KingdomBuilderSettlementModel` (owner, node id, 3×3 tile
state) under `src/games/KingdomBuilder/`. New collections only — nothing
here touches `GameData` or any existing schema.
1. `World` schema and indexes.
2. `Settlement` schema (tile array, resource counters, building levels).
3. `createWorld(seed)`, persisting one generator run.
4. `foundSettlement(worldId, userId, siteId)` for a player's first
   settlement.

**PR 3 — Tick engine and a dormant cron route**
1. `applyTick(world)` — a pure function: add production, advance one step
   of in-flight construction. No movement or combat yet, since nothing can
   move or fight in Milestone A.
2. `POST /api/cron/kingdombuilder-tick`, gated by `isAuthorisedCron`
   exactly like the existing cron routes, but **not yet in `vercel.json`**
   — callable for manual/test exercising only.
3. A route test exercising the auth gate the same way `turntimer`'s does.

**PR 4 — Minimal prototype UI**
1. A settlement screen at a direct, unlinked route (e.g.
   `/kingdombuilder/[worldId]/[settlementId]`) rendering the 3×3 grid and
   resource counts, built from `Section` and `ag-*` classes per AGENTS.md
   rather than bespoke markup.
2. A "queue building" API route with its own ownership check (only the
   settlement's owner may queue on it — a `locksmith` concern from day one).
3. Wire the UI to refetch after a tick so a completed queue item shows up.

**PR 5 — Turn it on**
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
Two of them reach into shared, cross-game surfaces, and they are deliberately
the only two that do so mid-milestone: **PR 7** touches the home dashboard and
the app rail, **PR 18** the push-notification plumbing. Everything else stays
inside `src/games/KingdomBuilder/` and Kingdom Builder's own routes, bar PR
19's one-line entries in the guide and tutorial registries.

- **PR 6 — World map view and multiple settlements.** Render the generated
  graph and let a second settlement be founded elsewhere on it. No armies
  yet — a pure map-rendering PR, reusing
  `ClickableMapNode`/`MapEdges`/`BoardZoom` per §3.1. "Multiple settlements"
  here means a second settlement for the *same* player; the second *player*
  arrives in PR 8.
- **PR 7 — Worlds on the dashboard.** Milestone A left a world reachable only
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

- **PR 8 — More than one player in a world.** The generator has placed ten
  fair `player-start` sites since PR 1 (§3.3) and `foundSettlement` has taken
  a `userId` since PR 2, but only ever one is claimed:
  `/api/newgame/kingdombuilder` founds the host's settlement and the other
  nine sites sit empty. Everything from PR 11 on is about doing something to
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
     contract of PR 11 effectively starts here, before any army exists to
     hide), `gremlin` (ten players claiming sites at once, and a seat filling
     while a tick is mid-sweep), `rulebook` (the setup screen should now look
     like every other setup screen).
  7. One `whatsNew.ts` line.

- **PR 9 — Barracks and units.** Unit types/levels (§6.1) and a training
  queue on the barracks tile. Units accumulate in a garrison; nothing can
  leave it yet.
- **PR 10 — Army dispatch and movement.** A command to send a garrison (or
  part of it) toward another node, and a movement step in the tick engine
  using §6.2's terrain multipliers. Arrival does nothing special yet — this
  PR is purely "can an army cross the generated graph."
- **PR 11 — Fog of war.** Redact in-transit armies from
  `CreateDataResponse(viewerId)` for everyone but the owner — a `croupier`
  concern, verified with the `trace-hidden-state` skill — plus the scout
  unit and detection upgrade as the two reveal paths from §6.3.
- **PR 12 — Automatic siege on arrival.** Arrival at a hostile settlement
  opens a siege (§6.4/§8): debuffs, the grace period, and the two new
  player actions, "push the attack" and "sally out" — both stubbed to a
  placeholder resolution for now.
- **PR 13 — Combat resolution.** The deterministic multi-round attrition
  engine with unit-type counters (§7.3/§7.6) as a pure function with its own
  matchup-table test suite, then wired into the two actions PR 12 stubbed.
- **PR 14 — Barbarian villages.** Generator gains barbarian site placement
  (§3.4); combat resolution from PR 13 applies directly on arrival, no
  siege phase, per §3.4's rule.
- **PR 15 — Settlers and a second settlement.** The settler unit and a
  "found here" command on open expansion sites (§4.4) — mostly a new unit
  type once PRs 6–10's map/movement/dispatch already exist.
- **PR 16 — Market and trade.** Resource conversion and player-to-player
  trade offers (§4.3) — a pure economy addition with no combat interaction.
- **PR 17 — Victory, seasons, catch-up.** Season length, scoring, new-player
  protection, diminishing returns, leaderboard (§9) — the systemic layer
  that turns the sandbox into a game with an end.
- **PR 18 — Push notifications.** Siege-onset, attack-resolved and
  construction-complete pushes over the app's existing FCM plumbing (§10).
  Held deliberately until last, since it's the one PR reaching into shared
  notification infrastructure, and it benefits from every event type above
  already existing to notify about.
- **PR 19 — Guide, tutorial, share card, polish.** `guide.ts`, `tutorial.ts`,
  the `og-game-kingdombuilder.png` share card, and a final full five-reviewer
  pass — the "most games also want a guide/tutorial" convention in
  AGENTS.md, deliberately last rather than first since it documents
  mechanics that were still moving through PRs 6–18.

### 11.4 Ordering constraints

Most of Milestone B can be resequenced to fit priorities without breaking
anything — trade (PR 16) and seasons (PR 17) don't depend on each other, for
instance, and either could move earlier or later freely. Four orderings
are not negotiable, because each is a hard dependency rather than a
priority call:

- **PR 5 cannot move earlier than PR 1–4.** It's the wiring step; there's
  nothing to turn on before the prototype exists, and it's also the last
  point at which every PR before it was, by construction, invisible to a
  player.
- **PR 8 (more than one player) must land before or alongside PR 11 (fog of
  war), PR 12 (siege) and PR 17 (seasons).** An army cannot be hidden from
  nobody, a player cannot lay siege to their own town, and scoring,
  new-player protection and a leaderboard are all comparisons between
  players — each of the three is untestable, not merely unexciting, in a
  world of one. The PRs either side of them are genuinely fine solo: a
  barracks trains and an army marches on an empty site without an opponent
  (PRs 9–10), and PR 14's barbarians are neutral rather than player-owned, so
  none of those forces the ordering on its own.
- **PR 11 (fog of war) must land before or alongside PR 12 (siege).** Siege
  is only the game's warning system per §6.4 if armies were already hidden
  before it — shipping siege first would briefly make army movement visible
  by omission, which is a hidden-information regression even if temporary.
- **PR 13 (combat resolution) must land before or alongside PR 14
  (barbarians).** A barbarian village resolves combat immediately on
  arrival with no siege phase (§3.4), so it has nothing to call until the
  combat engine exists.

PR 7 is the one with no hard dependency at all — it could sit anywhere in
Milestone B, or could have sat alongside Milestone A. It leads the remaining
work because it is what makes everything after it testable by a real player
over real days, rather than by whoever still has the URL in their history.

---

## 12. Open questions

Left open deliberately, for playtesting or a follow-up doc rather than
guessed at here:

- Tick length: is an hour right, or does a faster (e.g. 15-minute) or slower
  (e.g. 4-hour) cadence suit the target session shape better?
- Exact terrain movement-cost multipliers (§6.2) and exact scout/detection
  parameters (§6.3) — range, reliability, whether detection is guaranteed or
  itself a chance — need numbers, not just relative ordering.
- Barbarian village specifics (§3.4): does a conquered site ever respawn a
  new one elsewhere so the map doesn't run out of soft targets over a
  multi-week season, and does garrison strength scale continuously with
  distance from the centre or in discrete tiers?
- Does a sallying garrison forfeit the settlement's wall/terrain defence
  bonus entirely (§8), or keep some fraction of it? Zero is the simpler rule
  but may make sallying out a trap rather than a real choice.
- Alliances/diplomacy: nothing above assumes them, but a ten-player map
  without any is likely to converge on one dominant player unless the
  catch-up mechanics in §9 turn out to be strong enough alone — worth a
  dedicated exploration if playtesting bears that out.
- Exact resource/time cost curves for buildings and units — deliberately
  left as "increases with level" above; needs a numbers pass once the
  above structural questions are settled, not before.
