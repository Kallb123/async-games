# Kingdom Builder — Game Design Document

**Status:** Concept / exploration — not yet scheduled for implementation.
**Genre:** Asynchronous 4X / persistent-world empire builder
**Players:** up to 10 per world, competitive, no elimination-by-turn-order
**Session shape:** a long-running "world" spanning days to weeks, checked in on
repeatedly, not a single sitting

This document lays out the concept and works through the two open design
questions that most affect everything downstream of them: how time passes
(turns vs. a real-time tick), and how combat is resolved. Both sections weigh
several concrete approaches rather than picking one immediately, per the brief
that started this doc — a recommendation is given at the end of each, but the
trade-offs are the point.

---

## Table of contents

1. [High concept](#1-high-concept)
2. [Design pillars](#2-design-pillars)
3. [The world map](#3-the-world-map)
   - 3.1 [Representation](#31-representation)
   - 3.2 [Procedural generation](#32-procedural-generation)
   - 3.3 [Balance constraints](#33-balance-constraints)
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
   - 5.5 [Recommendation](#55-recommendation)
6. [Armies and movement](#6-armies-and-movement)
   - 6.1 [Unit types](#61-unit-types)
   - 6.2 [Dispatch and travel time](#62-dispatch-and-travel-time)
   - 6.3 [Arrival: siege or attack](#63-arrival-siege-or-attack)
7. [Combat resolution](#7-combat-resolution)
   - 7.1 [Option 1 — deterministic power comparison](#71-option-1--deterministic-power-comparison)
   - 7.2 [Option 2 — randomised dice/CRT resolution](#72-option-2--randomised-dicecrt-resolution)
   - 7.3 [Option 3 — multi-round attrition with unit counters](#73-option-3--multi-round-attrition-with-unit-counters)
   - 7.4 [Option 4 — deterministic core with bounded variance](#74-option-4--deterministic-core-with-bounded-variance)
   - 7.5 [Comparison](#75-comparison)
   - 7.6 [Recommendation](#76-recommendation)
8. [Sieges in detail](#8-sieges-in-detail)
9. [Victory, seasons, and catch-up](#9-victory-seasons-and-catch-up)
10. [Fit with the existing engine](#10-fit-with-the-existing-engine)
11. [Open questions](#11-open-questions)

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
| **Distance is the defence** | A settlement's safety comes from where it sits, not from a die roll. | Travel time scales with map distance; scouting and forward bases matter more than raw army size |
| **Losing is visible, not sudden** | A player should see a threat coming and have time to respond, even offline. | Siege as a distinct, non-lethal opening move; push notifications on army departure/arrival |
| **The map made the terms, not the players** | Starting position should feel fair even though it's procedurally rolled. | Balance constraints on generation (§3.3), not hand-authored symmetric maps |
| **Depth from composition, not from bookkeeping** | Strategic choices should live in what you build and send, not in remembering to log in every hour | Resource/build queues run unattended; ticks/turns process automatically |

---

## 3. The world map

### 3.1 Representation

A **node-and-edge graph**, not a hex or square grid: each settlement site and
each notable terrain feature (a forest, a mountain pass, a river crossing) is
a node, and travel routes between them are edges with an associated
distance/time cost. This is a deliberate departure from a uniform grid for
two reasons:

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
   starting radius, per the constraints below.
4. **Connect the graph.** Run a routine that guarantees connectivity (a
   minimum spanning tree first, so nothing is an island) and then adds extra
   edges for redundancy and chokepoints, echoing the "topological chokepoint"
   design already used in World Domination — a mountain pass or river
   crossing that funnels an army is more interesting than an open field.
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

---

## 5. Time model: turns vs. ticks

This is the question the brief asked to have weighed rather than decided
outright, because it shapes nearly everything else — how travel time is
expressed, how combat can be simultaneous or not, how offline players are
protected, and how much this reuses vs. departs from the app's existing
turn/command engine (see §10).

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

### 5.5 Recommendation

**Timer-gated WEGO, in other words a fixed real-time tick that is also
numbered and recorded like a turn.** Concretely: the world advances every
fixed interval (an hour is a reasonable starting point — long enough that a
sweep across many worlds is cheap, short enough that "wait for the next
tick" never feels like the main activity). Every sweep is assigned a
monotonic turn number and is driven by an ordered command log exactly like
this app's other games, so turn recap and "since you were last here" work
unmodified in spirit — the log just happens to be appended to by a cron
sweep instead of by "end turn," and a "turn" is a fixed span of wall-clock
time instead of a player's discretion. This gets the fairness and
genre-correctness of Option C without abandoning the app's existing
turn/command/recap vocabulary, at the cost of the real infrastructure trade
Option C's cons describe honestly — that cost doesn't go away, it's just
worth paying for the ten-player, weeks-long shape this game actually has.

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

An army's travel time is the graph distance (§3.1's edge weights) divided by
the **speed of its slowest unit** — mixing a scout into a siege train doesn't
make the siege train faster, so composition is a real trade-off between
striking power and response time. Distance is measured in edges/ticks, so
under the recommended time model (§5.5) an ETA is a concrete number of
ticks, and therefore a concrete number of hours, which a player can plan an
attack (or a defence) around.

Dispatching an army removes it from the settlement's garrison for the round
trip — there's no telefragging reinforcement, only "did I leave enough
behind to still be defended."

### 6.3 Arrival: siege or attack

When an army reaches a hostile settlement, the sender chooses one of two
postures (or is locked into whichever they queued from further away, if the
design prefers commitment at dispatch time over a choice at arrival — see
§11):

- **Siege** — no combat. Debuffs the target settlement (§8) for as long as
  the besieging army remains. This is the "visible, not sudden" pillar in
  practice: it gives the defender a window to react, reinforce, or
  counter-march before anything is destroyed.
- **Attack** — immediate combat resolution (§7) against the settlement's
  garrison and defences. If the settlement was already under siege, this is
  how a siege is converted into an actual assault.

---

## 7. Combat resolution

Four candidate approaches, in increasing order of how much they lean on
randomness, followed by a comparison and a recommendation. The asynchronous
setting matters a lot here: attacker and defender are essentially never both
watching when a battle resolves (it happens on a tick, possibly hours after
either side last logged in), so anything that depends on a live audience —
watching dice fall, reacting mid-fight — buys nothing. The report both sides
read afterward is the only thing that has to be satisfying.

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

### 7.6 Recommendation

**Option 3 — deterministic multi-round attrition with unit type counters —
as the combat model, reporting results as a round-by-round log** (which
also gives the combat report something worth reading, addressing Option 1's
flattest weakness without importing Option 2's async-fairness problem).
Depth should come from scouting and composition, which a patient, less
numerically-dominant player can act on, rather than from a die roll neither
side is present to see. If playtesting finds fights still too predictable
once compositions are known, add Option 4's small bounded modifier on top
rather than starting with live randomness — it's much easier to add a little
noise to a working deterministic model than to remove unwanted swinginess
from a randomised one after players have calibrated their trust around it.

---

## 8. Sieges in detail

A siege is deliberately the *opening* move, not a lesser attack:

- On arrival, a besieging army applies debuffs to the target settlement —
  e.g. reduced resource production, construction/training queues paused or
  slowed, walls stop passively regenerating — for as long as it remains.
- **No garrison losses occur under siege alone.** This is what makes it a
  warning rather than a surprise: a defender who logs in mid-siege still has
  their full army and can react (reinforce, sue for peace, sally out against
  the besiegers, or evacuate the settler-founding path in §4.4).
- A short **grace period** after siege begins, before debuffs ramp to full
  strength, prevents a siege from being a near-instant knockout against a
  player who happens to be offline at exactly the wrong tick.
- A besieging army is itself vulnerable: a relief force (the defender's own
  returning army, or an ally's) can attack the besiegers directly, resolved
  as ordinary combat (§7) in the open rather than against the settlement's
  walls — sieging is a commitment, not a free debuff.
- Converting a siege into an **attack** is a separate action the besieger
  takes when ready (or forced into, if a relief force is inbound and staying
  passive is worse) — this is what finally triggers §7's combat resolution
  against the garrison and any remaining wall bonus.

---

## 9. Victory, seasons, and catch-up

A persistent ten-player world needs an endpoint and a way to keep a losing
position from being a foregone conclusion for the rest of the season:

- **Seasoned, not eliminated.** Rather than "last kingdom standing," a world
  runs for a fixed real-world duration (e.g. two to four weeks) and is
  scored at the end — total settlement levels, army value, and territory
  held are reasonable inputs. This matters specifically because losing a
  single settlement early (a real risk given §5.3's offline-vulnerability
  cost) shouldn't mean a player has nothing left to play for; a scored
  season gives them a comeback to chase instead of a dead account.
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
  implementation, not assumed from the single-match model.
- **The scheduler.** §5.5's recommended tick needs a recurring sweep across
  every active world, in the spirit of this app's existing cron-sweep
  patterns (see the `gremlin` reviewer's brief in AGENTS.md) but running
  continuously for the life of a world rather than as an occasional
  maintenance job. Sizing that (how many worlds run concurrently, what an
  hour-long sweep costs at that scale) is an infrastructure question this
  document intentionally leaves open — it's a prerequisite for building this
  game, not a game-design decision.

Everything else — the node/edge map renderer, `BoardZoom`, push
notifications for siege/attack/completion events, `Dice`/`RollReadout` if
Option 4's bounded variance is ever added, the reviewer crew (`rulebook` for
wiring, `croupier` for making sure a player can't see an enemy garrison a
scout hasn't revealed, `gremlin` for the sweep's failure modes, `locksmith`
for the dispatch/siege/attack API surface) — is a good match for what this
app already has and already does.

---

## 11. Open questions

Left open deliberately, for playtesting or a follow-up doc rather than
guessed at here:

- Tick length: is an hour right, or does a faster (e.g. 15-minute) or slower
  (e.g. 4-hour) cadence suit the target session shape better?
- Does a player commit to siege-or-attack at dispatch time, or choose on
  arrival? Choosing on arrival is more flexible for the attacker but removes
  the defender's ability to infer intent from what's inbound.
- Alliances/diplomacy: nothing above assumes them, but a ten-player map
  without any is likely to converge on one dominant player unless the
  catch-up mechanics in §9 turn out to be strong enough alone — worth a
  dedicated exploration if playtesting bears that out.
- Exact resource/time cost curves for buildings and units — deliberately
  left as "increases with level" above; needs a numbers pass once the
  above structural questions are settled, not before.
