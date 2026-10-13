# Empires — Game Design Document

**Status:** Concept, v0.1. First draft, written to be argued with. Every
choice that changes what gets built is listed in §20 as a numbered decision
(D1–D34), with the options and a recommendation. The body of the document is
written *as if* each recommendation were taken, and marks the spot with the
decision's number, so an answer that goes the other way shows exactly which
paragraphs it rewrites. §21 will record the answers round by round, the way
the other design documents here do.
**Working title:** Empires (see the appendix)
**Genre:** Turn-based 4X on a hex map, *Civilization*-style
**Inspirations:** *Civilization V* and *VI* (hexes, one unit per tile, cities
working the land around them); the *Civilization* board games and *Clash of
Cultures* (a game small enough to finish)
**Players:** 2–4, competitive (D2)
**Session shape:** one match of about 70 rounds, two to three weeks, checked
in on a few times a day (§4, D4)

---

## Table of contents

1. [High concept](#1-high-concept)
2. [Design pillars](#2-design-pillars)
3. [Where it sits among the other games](#3-where-it-sits-among-the-other-games)
4. [The asynchronous problem: the hand-off budget](#4-the-asynchronous-problem-the-hand-off-budget)
5. [Time model: who moves when](#5-time-model-who-moves-when)
6. [A match from start to finish](#6-a-match-from-start-to-finish)
7. [The map](#7-the-map)
8. [Units and movement](#8-units-and-movement)
9. [Combat](#9-combat)
10. [Cities](#10-cities)
11. [Research](#11-research)
12. [The other players, and everyone else](#12-the-other-players-and-everyone-else)
13. [Fog of war and hidden information](#13-fog-of-war-and-hidden-information)
14. [Winning](#14-winning)
15. [A turn on a phone](#15-a-turn-on-a-phone)
16. [Presentation: the isometric hex board](#16-presentation-the-isometric-hex-board)
17. [Fit with the platform](#17-fit-with-the-platform)
18. [Out of scope for the first version](#18-out-of-scope-for-the-first-version)
19. [Implementation sketch](#19-implementation-sketch)
20. [Decisions to make](#20-decisions-to-make)
21. [Questions and answers](#21-questions-and-answers)

---

## 1. High concept

Two to four peoples start with a settler and a warrior each, somewhere on a
continent made of hexes that nobody has mapped. They found cities, and the
land around each city decides what it's good at: a city in the grassland by
a river grows fast, a city among the hills turns out soldiers, a city by the
sea feeds itself from the water. Cities grow, build, and train units. Units
explore, settle new land, and eventually march on the neighbours. Research
opens up new buildings and new units, era by era, from the first granary to
knights and trebuchets.

It is *Civilization*, cut to a size that can be finished asynchronously: a
smaller map, a handful of cities each, three eras rather than seven, and a
match of about seventy rounds rather than five hundred turns.

**One-line pitch:** *Found a city on a river. Seventy rounds later, own the
continent.*

---

## 2. Design pillars

| Pillar | What it means | How it shows up |
|---|---|---|
| **The land decides** | Where you put a city matters more than anything you do afterwards. | Biomes set every tile's yields (§7.2), rivers and coasts decide how big a city can grow (§10.4), buildings multiply what the land already gives (§10.6) |
| **A turn fits in a spare few minutes** | The player who checks in at the bus stop can play properly. | Standing orders and multi-round paths (§8.3), production queues (§10.5), a single "what needs me?" button (§15) |
| **A match ends** | Seventy rounds, not five hundred. A winner on a known date. | A round limit with a score (§14), a small map (§7.6), three eras (§11) |
| **Nobody waits on a war they aren't in** | Peaceful players don't take turns one after another. | Simultaneous rounds at peace, turns taken in order only between players at war (§5, D3) |
| **You see what your people see** | Exploration is a discovery, an army is a surprise. | Fog of war, with the server sending each player only what they can see (§13) |
| **The defender isn't punished for being asleep** | An attack on an absent player is fair. | War starts a round after it's declared (§12.1), combat is predictable (§9, D24), cities defend themselves (§9.4) |

---

## 3. Where it sits among the other games

Three games here already have pieces of this, and it's worth being clear what
Empires is *not*.

- **Kingdom Builder** ([`kingdom-builder-gdd.md`](./kingdom-builder-gdd.md))
  is the nearest relative: a map, settlements, armies, terrain that changes
  travel. But it's a *world* that runs on a real-time tick for up to ten
  players over open-ended weeks, and nobody takes a turn. Empires is a *match*:
  it starts, it has rounds, it ends with a winner, and the board is a hex grid
  you move pieces on one tile at a time. The two should feel like different
  games, and neither should borrow the other's time model.
- **Settlements & Cities** ([`settlements-and-cities.md`](./settlements-and-cities.md))
  already draws a hex board. Its hex maths (`SettlementsAndCitiesBoard.tsx`,
  `board.ts`) is the first thing to look at for reuse; if the projection in
  §16 needs a shared hex helper, both boards should go through it rather than
  grow a second copy (AGENTS.md, the component-reuse rule).
- **Realm Arena** ([`realm-arena.md`](./realm-arena.md)) has the isometric
  board, fog of war with "last seen", tap-to-move with shaded reach, a
  playback clock for moves played over the board, and a pipeline for figures
  modelled in code. Empires should reuse all of that machinery, on hexes
  instead of squares.
- **World Domination** ([`worlddomination.md`](./worlddomination.md)) is the
  conquest game, but on a node-and-edge map with dice. Empires is about
  building first; war is one of the ways to use what you built.

---

## 4. The asynchronous problem: the hand-off budget

### 4.1 The numbers

The same assumption the other design documents use
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §9): each player
checks in about four times a day, so a hand-off to one player waits about
three hours on average.

When every player acts **at the same time** in a round, the round waits for
the *slowest* of them, not the sum. With waits averaging three hours each, the
slowest of *n* players averages 3 × (1 + ½ + … + 1/*n*) hours: about 4½ hours
for two players, 5½ for three, 6¼ for four.

| Players | Round, one after another | Round, all at once | 70 rounds, one after another | 70 rounds, all at once |
|---:|---:|---:|---|---|
| 2 | 6 h | 4½ h | ~17 days | ~13 days |
| 3 | 9 h | 5½ h | ~26 days | ~16 days |
| 4 | 12 h | 6¼ h | ~35 days | ~18 days |

These are slow-case figures. Players who are online together play many
rounds an hour, and short turn timers push everyone along.

### 4.2 What follows from it

1. **A match is tens of rounds, not hundreds.** Seventy rounds is two to
   three weeks. That's the number the whole economy is tuned around (§10,
   §11): about fifteen rounds to settle, twenty-five to grow, thirty to fight
   it out. Short and long matches move that number (D4); the economy scales
   with it.
2. **At three and four players, turns taken one after another nearly double
   the match.** That's the case for simultaneous rounds (§5).
3. **Everything has to be smaller than in *Civilization*.** A map of a few
   hundred hexes rather than thousands, three to six cities a player rather
   than fifteen, about twenty techs rather than seventy. The *Civilization*
   board games, not the computer games, are the right scale.

### 4.3 Keeping a turn short

A long match is bearable. A long *turn* isn't: a late-game *Civilization*
turn with twelve cities and thirty units is half an hour of clicking.
Five things keep a turn here to a few minutes:

- **Fewer pieces.** A small map, a brake on how many cities are worth having
  (§10.4) and unit upkeep (§8.4) keep an empire to a size a phone can show.
- **Orders that last.** A unit given a destination walks there over as many
  rounds as it takes. A fortified or sleeping unit asks for nothing (§8.3).
- **Queues.** A city works through a queue of up to five items, and research
  works towards a chosen goal through every tech on the way (§10.5, §11).
- **No workers.** Tiles are improved by buildings in the city, not by a unit
  you walk to each tile (§10.6, D16). That alone removes the worst of
  *Civilization*'s busywork.
- **One button that knows what needs you.** "Next" walks the player through
  every unit without orders and every city without production, then turns
  into "End turn" (§15).

---

## 5. Time model: who moves when

The decision with the most weight in the document (D3). Four ways to run a
round:

| | **A. One after another** | **B. Orders, then resolve (WEGO)** | **C. All at once, live** | **D. All at once at peace, in order at war** |
|---|---|---|---|---|
| How it works | Seats take turns in order, as every game here does today | Everyone gives orders; the server carries them all out together at the end of the round | Everyone plays in the same round, and every move happens the moment it's made (*Civilization*'s own simultaneous mode) | C for players at peace; players at war with each other take their turns in order, alongside everyone else (*Civilization VI*'s "dynamic turns") |
| 4-player round | ~12 h | ~6¼ h | ~6¼ h | ~6¼ h at peace; one war, ~6–7 h; all four at war, ~12 h |
| Fair in combat? | Yes | Yes, nobody moves first | **No.** Whoever checks in first each round hits first | Yes. Combatants alternate |
| Feels like *Civilization*? | Yes | No: you can't see one attack's result before ordering the next | Yes | Yes |
| Engine work | None | A whole resolution engine: moves that collide, attacks on targets that moved away | Several active players at once | Several active players at once, plus grouping by war |

**Recommendation: D, built as A first.** Players at peace can't hurt each
other: borders are closed (§12.1), so the most they can do is reach a spot
first. Letting them play at the same time costs nothing in fairness and
saves most of the waiting. Players at war need to see each other's moves,
and take turns.

Concretely, each round:

1. **The round opens.** The server runs the new round (yields, growth,
   production, research, healing, barbarians; §17.3), then works out the
   *war groups*: players joined by being at war, directly or through someone
   else. A player at war with nobody is a group of one.
2. **Each group plays at the same time as every other group.** A group of
   one plays whenever they like. Inside a bigger group the players take their
   turns in seat order.
3. **The round closes** when every group is done, or the timer runs out on
   whoever's left (§17.5).

With four players and A at war with B: A plays, then B, while C and D play
whenever they like. The round costs about the time of A plus B, rather than
all four.

Two players are always one group or two, so a two-player match gains little
from D: at war it's A, and at peace it saves 1½ hours a round. That makes two
players the natural first build on today's engine (A), with D as its own
engine piece once there are three or four seats (§19). D needs the platform
to have several players active at once, which it can't do today (§17.2).

---

## 6. A match from start to finish

1. **Setup.** The host picks the player count, the match length (D4), the
   map size (which follows from the player count, §7.6) and the turn timer,
   on the shared setup screen (`GameSetupLayout`, `TurnTimerSelect`,
   `UserInviteList`).
2. **Round 1.** Each player has a settler and a warrior on a fair start
   (§7.7), and can see two tiles around them. Most found their capital on
   the spot or one tile away.
3. **Rounds 1–15: settle.** Scouts and warriors explore, find tribal
   villages and barbarian camps (§12.2). The capital builds warriors and
   settlers. Each player founds two or three cities and researches most of
   the first era.
4. **Rounds 15–40: grow.** Borders meet. Cities grow into their second ring
   of tiles, and buildings start to multiply what the land gives. The first
   wars start, usually over a river valley or a hill both sides want.
5. **Rounds 40–70: decide.** Classical and medieval units. Someone pushes
   for every capital, or someone races for Enlightenment, or both.
6. **The end.** Someone holds every original capital, or finishes the Grand
   Academy, or round 70 ends and the score decides (§14).

---

## 7. The map

### 7.1 Hexes

A grid of **pointy-topped hexes** (D7), stored as rows ("odd-r" offset
coordinates) and worked on in axial coordinates (*q*, *r*), which make
distances and neighbours simple. Every hex has six neighbours and six edges.
The map doesn't wrap at the edges (D8).

### 7.2 Biomes

Every tile is exactly one biome (D11). The biome decides what a city gets
from working it, what it costs to move into, and how well a unit there
defends. The eight biomes are the brief's (D10):

| Biome | Food | Prod. | Science | Move cost | Defence | Notes |
|---|---:|---:|---:|---:|---:|---|
| **Grassland** | 2 | 0 | 0 | 1 | — | The growing land. Irrigation works +1 food (§10.6) |
| **Hills** | 1 | 2 | 0 | 2 | +3 | The working land. +1 sight. A Mine +1 production. A city on a hill defends better (§9.4) |
| **Forest** | 1 | 1 | 0 | 2 | +3 | Blocks sight beyond it. A Lumber mill +1 production. Can be cleared to grassland by a city (§10.6) |
| **Jungle** | 1 | 0 | 1 | 3 | +3 | Slow, hides units, but a source of science. A University +1 science |
| **Mountains** | — | — | — | impassable | — | Can't be entered or worked (D12). Blocks sight. The map's walls and chokepoints |
| **Coast** (shallow water) | 1 | 0 | 0 | 1 by sea | — | Workable by any city beside it. A Harbour +1 food, +1 production. Embarked land units and galleys move here |
| **Ocean** (deep water) | 1 | 0 | 0 | — | — | Workable by a city with a Harbour. No unit enters in the first version (§7.4, D14) |

Rivers are the eighth, and they aren't a tile at all (§7.3).

All the numbers in this document are **starting points to tune**, not
decisions. They're here so the shape of the economy can be judged.

The biome list should be a registry (one entry per biome with its yields,
cost, defence, sight rule and art), so adding plains, desert or tundra later
is one entry, not a change to every rule.

### 7.3 Rivers

Rivers run along the **edges** between hexes, from high ground (hills,
mountains) to the coast, and every river reaches water. They do three things
(D13):

- **Food.** A land tile with a river along any of its edges gets +1 food.
- **Fresh water.** A city whose centre has a river along an edge, or that
  sits on the coast, can grow bigger (§10.4).
- **An obstacle.** Moving across a river edge **uses all the unit's
  remaining movement**, and a unit attacking across a river fights at −5
  (§9.2). Engineering (§11) bridges every river for its owner: crossing
  then costs nothing extra.

Each hex owns three of its six edges (east, south-east, south-west), so each
river edge is stored once, as three bits per tile.

### 7.4 Water

- **Coast** is the band of shallow water along every shore. **Ocean** is
  everything beyond it.
- **Ships.** The first version has one, the galley: coast only, fights
  other ships and units on the shore, and is how a coastal city defends its
  water.
- **Embarking.** With Shipbuilding (§11), a land unit can step onto a coast
  tile and move along it as a slow, defenceless boat (strength 10, 2 moves).
  Without it, water is a wall.
- **Ocean is out of bounds** in the first version (D14). Islands beyond the
  coast band can't be reached, so the generator doesn't make any worth having
  (§7.7).

### 7.5 Resources

A few tiles carry a resource on top of their biome. Resources are always
visible on explored tiles; no tech reveals them (D21).

| Resource | Found on | Gives the city working it |
|---|---|---|
| Wheat | Grassland | +1 food |
| Cattle | Grassland | +1 production |
| Deer | Forest | +1 food |
| Stone | Hills | +1 production |
| Fish | Coast | +2 food |
| Whales | Ocean | +1 food, +1 production |
| **Horses** | Grassland, hills | +1 production, and lets its owner build mounted units |
| **Iron** | Hills | +1 production, and lets its owner build swordsmen |

**Horses** and **iron** are *strategic*: a player needs at least one of each,
worked by one of their cities, to build the units that need it (§8.2, D21).
It doesn't run out, and one tile is enough for any number of units. Every
start is guaranteed one of each within reach (§7.7).

### 7.6 Map size

About 120 land hexes a player, plus the water round it (D8). Maps are a
little **taller than wide**, because the game is played on a phone held
upright.

| Players | Size (columns × rows) | Hexes | Land, roughly |
|---:|---|---:|---:|
| 2 | 18 × 24 | 432 | ~250 |
| 3 | 22 × 28 | 616 | ~360 |
| 4 | 24 × 32 | 768 | ~460 |

At about 25 hexes for a fully grown city's ring and its share of the gaps
between cities, that leaves room for four to six cities each, and contested
ground between them.

### 7.7 Generating the map

Procedural, from a seed, with fairness checked rather than hoped for (D9) —
the same approach as Kingdom Builder's balance constraints
([`kingdom-builder-gdd.md`](./kingdom-builder-gdd.md) §3.3):

- **One continent**, ragged at the edges, with inland lakes and an inner sea
  or two (those are coast tiles too). Mountain ranges in lines, not blobs, so
  they make passes. Rivers from the ranges down to the sea.
- **Starts** at least 8 hexes apart, on land that is not jungle or
  mountains, and each with: a river or coast within one tile; at least four
  grassland and two hills or forest within two tiles; horses and iron within
  six; one tribal village within five.
- **A fairness score** for each start (the yields within two tiles, the land
  within eight that's closer to it than to any other start). The generator
  rerolls until the worst start is within about 10% of the best.
- **Barbarian camps and tribal villages** at least five hexes from any
  start (§12.2).

The seed and the generated map are both server-only: the client gets only the
tiles its player has explored (§13).

---

## 8. Units and movement

### 8.1 Moving

- Every unit has **movement points** (MP) each round: two for most, three for
  scouts, four for horsemen and knights.
- Entering a tile costs its biome's move cost (§7.2). Crossing a river ends
  the move (§7.3).
- **A unit with all its movement points can always move one tile**, even if
  the tile costs more (so a warrior can enter jungle, at the cost of its
  whole round). Otherwise it needs enough MP left.
- **One military unit per tile**, plus one civilian (a settler) alongside it
  (D23). Units can't pass through a tile another player's military unit
  stands on.
- **Zones of control.** A unit that moves between two tiles which are both
  next to an enemy military unit stops there. That's what lets a line of
  units hold a front.
- **Foreign territory is closed at peace** (§12.1). A unit can enter another
  player's land only at war.
- Scouts treat forest and jungle as costing 1.

### 8.2 The roster

Three eras, about a dozen units. *Strength* is melee strength; ranged units
also have a ranged strength and a range in tiles. A unit's need is the tech,
the building in the city that builds it, and the resource it needs (§10.7).

| Unit | Era | Needs | Cost | Str. | Ranged | MP | Notes |
|---|---|---|---:|---:|---|---:|---|
| Settler | — | City of 2 or more | 20 +6 per city | — | — | 2 | Civilian. Founds a city (§10.1). Costs the city 1 population |
| Scout | Ancient | — | 8 | 10 | — | 3 | Forest and jungle cost 1 |
| Warrior | Ancient | — | 10 | 20 | — | 2 | |
| Archer | Ancient | Archery | 14 | 15 | 25, range 2 | 2 | |
| Spearman | Ancient | Bronze Working, Barracks | 16 | 25 | — | 2 | +10 against mounted |
| Galley | Ancient | Sailing, Harbour | 16 | 25 | — | 3 | Coast only |
| Horseman | Ancient | Horseback Riding, Stable, horses | 24 | 30 | — | 4 | Mounted. The first era's strongest unit, gated by the Stable and horses |
| Swordsman | Classical | Iron Working, Barracks, iron | 24 | 35 | — | 2 | |
| Catapult | Classical | Mathematics, Workshop | 28 | 15 | 30, range 2 | 2 | +10 against cities. Can't move and shoot in one round |
| Pikeman | Medieval | Feudalism, Barracks | 32 | 40 | — | 2 | +10 against mounted |
| Crossbowman | Medieval | Machinery | 32 | 28 | 38, range 2 | 2 | |
| Knight | Medieval | Chivalry, Stable, horses | 40 | 46 | — | 4 | Mounted |
| Trebuchet | Medieval | Machinery, Workshop | 40 | 18 | 42, range 2 | 2 | +10 against cities. Can't move and shoot in one round |

Old units don't upgrade in the first version (D25). They stay useful as
garrisons and as the cheap body that holds a hill.

### 8.3 Orders that last

A unit is given one of:

- **Go to** a tile. It walks there along the cheapest path, as many rounds as
  it takes, and stops if an enemy comes into sight or the path is blocked.
- **Fortify.** It stays, and defends at +4 after a full round in place (§9.2).
  It asks for nothing until an enemy comes into sight.
- **Sleep.** It stays, and asks for nothing until woken.
- **Skip.** Nothing this round.
- **Explore.** It walks to the nearest unexplored ground by itself, round
  after round (scouts mostly).

The "Next" button (§15) only stops on units with none of these.

### 8.4 Upkeep

Each city keeps two units for free. Every unit beyond the empire's
allowance costs 1 production a round, taken from the city that built it.
That's the brake on an army that would otherwise make late turns long
(D26).

### 8.5 Healing

A unit that doesn't move or fight heals 10 HP a round in neutral land, 20 in
its own, and 30 in one of its own cities. It doesn't heal in enemy land.

---

## 9. Combat

### 9.1 Attacking

A military unit attacks by moving into an enemy unit's tile (melee), or by
targeting a tile in range (ranged). Attacking uses all the unit's remaining
movement. Every unit has 100 HP, and loses 1 strength for every 10 HP it's
missing.

- **Melee.** Both sides take damage. If the defender dies, the attacker moves
  into its tile (and captures any civilian there).
- **Ranged.** Only the target takes damage. A ranged unit attacked in melee
  defends with its melee strength.

### 9.2 Damage

From *Civilization VI*, because it's well tested and easy to show:

> damage dealt = 30 × e^(0.04 × (your strength − their strength))

So equal strengths deal 30 each way; 10 more strength deals 45 and takes
20; 20 more deals 67 and takes 13.

Modifiers on strength:

| Situation | Modifier |
|---|---:|
| Defending on hills, forest or jungle | +3 |
| Fortified a full round | +4 |
| Attacking across a river | −5 |
| Each other unit of yours next to the target (melee only) | +2 |
| Spearman or pikeman against a mounted unit | +10 |
| Catapult or trebuchet against a city | +10 |

**No random element** (D24): the damage above is the damage dealt, rounded.
The attack preview (§15) shows exactly what will happen, and the defender —
who is usually asleep when it happens — loses to the position, not to a
roll. The bounded variance *Civilization VI* uses (±20%) is the alternative,
recorded on the command the way every roll here is.

### 9.3 Experience

None in the first version (D25). Promotions are one of the first things worth
adding after it.

### 9.4 Cities in combat

- A city has **200 HP**, +100 with Walls, +100 more with a Castle. It heals 20
  a round.
- Its **strength** is 15 + 1 per population, or its garrison's strength if
  that's higher, +3 on hills, +5 with Walls, +5 more with a Castle.
- **A city with Walls shoots** once a round at anything within 2 tiles, at
  its strength, during its owner's turn.
- **Capture.** A city at 0 HP is taken by the next enemy melee unit that
  moves in. It loses 1 population and keeps its buildings, except Walls and
  Castle, which drop a level (D27). Cities can't be razed in the first
  version.
- A city's tile can't be entered by an enemy while it has HP left.

---

## 10. Cities

### 10.1 Founding

A settler founds a city on the tile it stands on, if the tile is land (not
mountains), and at least three hexes from any other city: two clear tiles
between (D20). The city takes the settler's place, with population 1, and
claims the six tiles around it as its territory.

The capital is the first city, and gets +2 science and +2 production
(its palace). Every player's capital is an **original capital** for the rest
of the match, whoever holds it (§14).

### 10.2 Territory and worked tiles

- A city's territory starts as the ring of six tiles around it. **Each time
  the city grows, it claims one more tile** from its second ring: the best one
  by its focus, unless the player has pinned one (D18). A city's territory
  never goes beyond its second ring: 19 tiles at most.
- A tile belongs to one city. A tile already claimed by someone else is
  skipped.
- **Each citizen works one tile** of the city's territory. The city centre is
  worked for free.
- **Citizens are placed automatically** by the city's focus — *Balanced*,
  *Food*, *Production* or *Science* — and the player can pin a citizen to a
  tile by tapping it (D17). Most players will set the focus once and never
  look again.

### 10.3 Yields

Three yields (D15):

- **Food** grows the city (§10.4).
- **Production** builds the city's buildings and units (§10.5).
- **Science** goes into the empire's research (§11).

A city gets the yields of every tile it works, plus:

- **Its centre**: the yields of its biome, raised to at least 2 food and 1
  production, plus 2 science.
- **Each citizen: +1 science.** Big cities are the scientists.
- Its buildings (§10.6).

There's no gold, culture, faith or happiness in the first version (§18).

### 10.4 Population

Each citizen eats **2 food** a round. The rest goes into the city's **food
box**.

- **Growth.** When the box holds 8 + 6 × *population* food, the city grows
  by one, claims a tile (§10.2), and the box empties.
- **Starvation.** If the box would go below zero, the city loses a citizen and
  the box goes to half of what the new size needs.
- **Fresh water caps growth** (D19). A city can grow to:

  | | Population cap |
  |---|---:|
  | Base | 4 |
  | Centre on a river or the coast | +3 |
  | Granary | +2 |
  | Aqueduct | +4 |

  A city at its cap stops filling its box. The cap is how the land decides
  which cities become great: a dry hill town stays a town, a river city
  becomes the capital it ought to be. That's the first pillar (§2).

A worked example: a capital on grassland beside a river. Its centre gives
3 food (2, +1 river), 1 production +2 (palace), 2 science +2 (palace). Its
one citizen works the river grassland next door for 3 food, and adds 1
science. That's 6 food against 2 eaten: +4 a round, and population 2 at
round 5 (it needs 14). At population 2 it works a forest too (7 food, 4
eaten, +3), so population 3 comes at about round 12. A city on dry hills with
no river grows at about half that rate, and builds faster.

| Size | Food to grow | |
|---:|---:|---|
| 1 → 2 | 14 | |
| 2 → 3 | 20 | |
| 3 → 4 | 26 | |
| 5 → 6 | 38 | |
| 8 → 9 | 56 | |

By round 70 a well-placed capital is around population 10–12; a hill town,
5–6.

**Expansion is braked too:** a settler costs 1 population, needs a city of at
least 2, and costs 6 more production for every city the player already has
(D19).

### 10.5 Production

- A city puts its production into the first item in its **queue**, which
  holds up to five items. What's left over when an item finishes carries into
  the next.
- **Switching** to a different item keeps the progress on the first, so it
  can be picked up again at no loss (D22).
- **An empty queue** turns production into food (one food for every two
  production) until the player chooses something, so a forgotten city still
  does something useful. The "Next" button stops at it (§15).
- Units appear on the city's tile, or the nearest free tile if the city is
  already garrisoned.

### 10.6 Buildings

Buildings do the job *Civilization*'s workers and tile improvements do
(D16): instead of walking a unit to every hill to build a mine, the city
builds one Mine, and every hill it works gives more. That keeps a turn short
and keeps the land doing the deciding: the Mine is worth a lot in a city of
hills and nothing in a city of grassland.

| Building | Tech | Cost | Effect |
|---|---|---:|---|
| Granary | Pottery | 16 | +2 food, +2 population cap |
| Mine | Mining | 16 | +1 production on every worked hills tile |
| Barracks | Bronze Working | 16 | Lets the city build spearmen, swordsmen and pikemen. Units here heal fully in a round |
| Walls | Masonry | 20 | +100 city HP, +5 strength, the city shoots (§9.4) |
| Harbour | Sailing | 20 | Coastal cities only. +1 food and +1 production on every worked coast tile; lets the city work ocean; lets it build galleys |
| Library | Writing | 20 | +3 science |
| Stable | Horseback Riding | 18 | Lets the city build horsemen and knights |
| Irrigation works | Irrigation | 20 | +1 food on every worked grassland tile beside a river |
| Workshop | Mathematics | 30 | +2 production. Lets the city build catapults and trebuchets |
| Lumber mill | Construction | 28 | +1 production on every worked forest tile |
| Aqueduct | Engineering | 36 | +4 population cap |
| Castle | Feudalism | 45 | Needs Walls. +100 HP, +5 strength |
| University | Education | 50 | +4 science, +1 science on every worked jungle tile |

**Clearing forest** is a city project, not a building: with Construction, a
city can clear a forest tile in its territory for 10 production. The tile
becomes grassland, and the city gets 10 production back into its current
item. A choice, not a chore.

**Wonders** — one-of-a-kind buildings anyone can race for — are left out of
the first version, except the Grand Academy, which is a victory (§14, D5).
They're the best candidate for what comes next.

### 10.7 What a city can build

A unit or building shows in a city's list once its tech is researched, with
what's still missing named on the row rather than hidden ("Needs a Stable",
"Needs horses"). So the list teaches the player what to do next, rather than
the tech tree having to.

---

## 11. Research

Each player has one research target. Science from all their cities goes into
it each round, and what's left over when a tech completes carries into the
next. The player can choose a tech several steps away, and research goes
through the ones on the way by itself. A player with nothing chosen researches
the cheapest tech they can.

Three eras, twenty techs (D6):

| Era | Tech | Needs | Cost | Unlocks |
|---|---|---|---:|---|
| Ancient | Pottery | — | 12 | Granary |
| | Mining | — | 12 | Mine |
| | Archery | — | 12 | Archer |
| | Sailing | — | 14 | Harbour, Galley |
| | Horseback Riding | — | 16 | Stable, Horseman |
| | Bronze Working | Mining | 16 | Barracks, Spearman |
| | Masonry | Mining | 16 | Walls |
| | Writing | Pottery | 18 | Library |
| | Irrigation | Pottery | 18 | Irrigation works |
| Classical | Iron Working | Bronze Working | 40 | Swordsman |
| | Shipbuilding | Sailing | 40 | Embarking (§7.4) |
| | Mathematics | Writing, Masonry | 45 | Workshop, Catapult |
| | Construction | Masonry | 45 | Lumber mill, clearing forest |
| | Philosophy | Writing | 50 | Every Library +2 science |
| | Engineering | Construction, Mathematics | 55 | Aqueduct, bridges every river (§7.3) |
| Medieval | Feudalism | Iron Working, Construction | 95 | Pikeman, Castle |
| | Machinery | Engineering | 100 | Crossbowman, Trebuchet |
| | Chivalry | Feudalism, Horseback Riding | 110 | Knight |
| | Education | Philosophy, Mathematics | 110 | University |
| — | **Enlightenment** | every medieval tech | 250 | The Grand Academy (§14) |

**Pacing check**, against the 70-round target (§4.2): the first era costs
about 140 science, the second about 280, the third about 420, and
Enlightenment 250. An empire making 4–8 science a round in rounds 1–15,
10–20 in rounds 15–40 and 20–35 in rounds 40–70 earns about 1,300 over the
match, against about 1,070 for the whole tree: enough to finish it around
round 60–65 if it does nothing else well, which is roughly right for a science victory to be possible but
contested.

What a rival has researched is hidden (§13).

---

## 12. The other players, and everyone else

### 12.1 War and peace

Kept to the minimum that makes dynamic turns work (D29):

- Every pair of players is **at peace** or **at war**. Everyone starts at peace.
- **Closed borders at peace.** A unit can't enter another player's territory
  unless the two are at war. A unit inside a border when it expands is moved
  to the nearest tile it may stand on.
- **Declaring war** can be done on your turn against a player you've met
  (seen a unit or city of). It takes effect **at the start of the next
  round**, and the other player is told at once by push notification. Nobody
  wakes up to find a war started and lost in one round.
- **Making peace** is a proposal the other player accepts or turns down on
  their turn. Peace lasts at least ten rounds before either side may declare
  war again. A peace that's accepted moves any units out of the other's
  territory.
- That's all: no trade deals, open borders, alliances or teams in the first
  version.

### 12.2 Barbarians and tribal villages

- **Barbarian camps** sit on the map from the start, each with one defender
  of the current era (a warrior, then a swordsman, then a pikeman). A camp
  shoots nothing and goes nowhere in the first version, but every ten rounds
  it sends out one raider, who walks to the nearest city and attacks it
  (D30). Taking a camp gives the nearest city of the player who took it 20
  production.
- **Tribal villages** are one-time finds: the first unit to enter one gets
  one of +15 science, a free scout, +1 population in the nearest city, or the
  map revealed within five tiles. The result is chosen by the server and
  recorded on the command, so a replay shows the same find.
- Barbarians aren't a seat. They move during the round's opening (§17.3) and
  are at war with everyone.

### 12.3 A player who leaves

A dropped player's cities become **free cities** (D32): neutral, they defend
themselves and their garrisons, never expand or attack, and can be captured
by anyone. That keeps their land in the game rather than leaving a hole in
the map, and the platform's dropout rule handles the rest (§17.5).

---

## 13. Fog of war and hidden information

Always on (D31). Every tile, for each player, is one of:

- **Unexplored.** They've never seen it. The client is told nothing about it,
  not even its biome.
- **Explored.** They've seen it before. They know its biome, rivers and
  resource, and see any city there as it was when they last saw it.
- **Visible.** One of their units or cities sees it now. They see everything
  on it.

**Sight:** two tiles for a unit, three from hills. A city sees two tiles
beyond its territory. Forest, jungle and mountains block sight beyond them,
except for a unit on hills looking over forest or jungle.

What is hidden from a rival:

- the map they haven't explored, and the seed it came from;
- every unit and city they can't see now, beyond what they last saw;
- research (what's known, what's being researched), city queues, food boxes;
- the war groups' order, beyond what a player needs to know whose turn it is.

What is shared with every player who has met you: your name and colour,
your number of cities, your score (§14), and whether you're at war with
them. When someone starts the Grand Academy, everyone is told (§14).

This is the same contract every game here keeps for hands and secret codes,
on a much bigger surface: every response, every command outcome, every
replay step and every push notification must be cut to what the viewer can
see. §17.4 lists the places, and the `croupier` is the reviewer for all of
them.

---

## 14. Winning

Three ways to win (D5):

1. **Domination.** Hold every original capital, your own included, at the
   end of any round. The match ends at once.
2. **The Grand Academy.** Research Enlightenment, then build the Grand Academy
   (a city project costing 120 production) in one of your cities. **Starting
   it tells everyone**, and where. Finish it and you win. Take the city and
   the project is lost. It's a science race with a target the others can hit.
3. **Score at the round limit.** When the last round ends (round 70 in a
   standard match), the highest score wins.

| Score | Points |
|---|---:|
| Each city | 3 |
| Each citizen | 1 |
| Each tech | 2 |
| Each original capital held (other than your own) | 5 |

Ties go to the later seat, as Realm Arena's do, which makes up for going
first. A player with no cities and no settlers left is out: their score stands,
and they take no more turns.

The result screen should tell the match: each player's score over the rounds
(`LineChart`, `ChartTooltip`), the map at the end, and who took whose
capital and when.

---

## 15. A turn on a phone

A turn has to work one-handed on a phone held upright. The board fills the
screen inside `BoardZoom`; everything else is a sheet that comes up from the
bottom.

**The flow:**

1. **Since you were last here.** The recap (§17.6): what grew, what finished,
   what was seen moving, who declared war.
2. **The "Next" button.** One button at the foot of the board, always in the
   same place, naming what needs the player: "Warrior near Ur needs orders",
   "Ur needs something to build", "Pick a tech". Tapping it focuses the board
   on that thing and opens its sheet. When nothing's left it becomes **End
   turn**.
3. **A unit.** Tapping it shades how far it can go this round (as Realm
   Arena does) and, for a ranged unit, what it can hit. Tapping a tile inside
   the shading moves it there. Tapping one beyond draws the path with the
   round it arrives on each step, and a second tap confirms. Tapping an enemy
   shows the attack preview: the damage both ways, exactly (§9.2), and Attack.
   The unit's sheet holds its orders (Fortify, Sleep, Explore, Found a city…)
   as `BuildRow`s.
4. **A city.** Its sheet, made of `Section`s: population and the food box,
   the focus (`OptionChoiceSection`), the queue (`BuildRow`s, each with its
   cost and the rounds it'll take, and what it still needs), and its
   buildings. Tapping a worked tile on the board pins a citizen.
5. **Research.** A sheet listing techs by era, each a `BuildRow` with what it
   unlocks; the chosen goal and the path to it are marked.
6. **Rivals.** Everyone you've met: score, city count, war or peace, and the
   button to declare war or propose peace.

Anything with a name has an `InfoButton` opening an `InfoModal`: a biome's
yields and cost, a unit's stats, a building's effect. The game guide and the
tutorial (§17.8) carry the rest.

When it isn't the player's turn, the sheets stay readable through
`ReadOnlyPanel` rather than a second read-only copy.

---

## 16. Presentation: the isometric hex board

### 16.1 The look

A **tilted-table hex map** (D7): pointy-topped hexes squashed vertically to
about two-thirds of their height, so the board reads as a table seen from an
angle, the way *Civilization V* and *VI* look. Flat biomes (grassland, coast,
ocean) are flat tiles; hills, forest, jungle and mountains carry art that
stands up out of the tile and overlaps the tile behind it. Everything is drawn
from the back row to the front, so nearer things stand in front of further
ones.

- **Rivers** are drawn along the hex edges they run on, over the ground and
  under the standing art, wider towards the sea.
- **Borders** are a line in the owner's colour just inside every edge where
  the territory changes hands.
- **Fog.** Unexplored tiles are blank parchment. Explored tiles that aren't
  visible are faded, with any city shown as last seen.
- **Cities** are art that grows with population (a village, a town, a city),
  with a name banner carrying their size and what they're building. Names go
  through `MapLabelLayer`, so no banner lands on another.
- **Units** are figures standing on their tile on a base in their owner's
  colour, with a health bar when hurt. A move plays back over the board on
  the shared playback clock (`usePlayback`), so a rival's moves can be
  watched in the recap.

No rotation in the first version: the art needs drawing once rather than six
times.

### 16.2 How it's drawn

- **Projection.** For a pointy-topped hex of size *s* at axial (*q*, *r*):
  *x* = *s* × √3 × (*q* + *r* / 2), *y* = *s* × 1.5 × *r* × *k*, with the
  squash *k* about 0.65. The inverse, with hex rounding, gives the tile a tap
  lands on; the standing art never takes the tap, the ground under it does.
- **Where it lives.** The hex geometry belongs in a pure helper in
  `src/utils/ui/` beside `isometric.ts` (which is squares only), and
  Settlements & Cities' hex maths should move onto it rather than the app
  keeping two (§3).
- **Zoom and focus** come from `BoardZoom`: fit, in, and a deeper step for
  picking a tile. A `focus` glides to the selected unit's reach, or to the
  thing the "Next" button picked.
- **Art.** Each biome needs a few variants so the map doesn't look tiled.
  Hand-drawn art goes through `/art-masters` and `npm run optimise-art`, and
  for several hundred tiles a single tile sheet is better than an image a
  tile, as Kingdom Builder found (`npm run kb-atlas`). Unit figures could come
  from Realm Arena's code-modelled pipeline, rendered in the six hex
  directions instead of eight, or as simple standing tokens to begin with
  (D34).
- **Performance.** 768 tiles, their standing art, borders, rivers and fog
  are a lot of SVG for a mid-range phone. Whether it's SVG (the house style,
  and what `BoardZoom` and `MapLabelLayer` assume) or a canvas for the ground
  with SVG on top is worth a prototype before the art is commissioned (D34).

---

## 17. Fit with the platform

### 17.1 Where things go

A new game folder, `src/games/Empires/`, with its `meta.ts`, rules
(`EmpiresLogic.ts`), models, board components, `guide.ts`, `tutorial.ts` and
`achievements.ts`, wired into the registries `ARCHITECTURE.md` §12 and
[`new-game.md`](../new-game.md) list. Its rules module joins the `GameLogic`
barrel so the serialisable-registry test sees it.

### 17.2 The engine piece D needs: several players active at once

Today `currentTurn` is one seat, and a lot leans on that: the command route's
turn check, `CheckEndTurn`, the turn-timer sweep and its deadlines, the
`YourTurn` push, the dashboard's "your turn" lists, replay's turn boundaries,
the undo hold, and "since you were last here". The out-of-turn mechanism
([`out-of-turn-actions.md`](../out-of-turn-actions.md)) is kept small on
purpose and can't end a turn.

Dynamic turns (§5) need a set of active seats, each with its own turn clock,
and a round that closes when the last one ends. Realm Arena's teams wanted
the same thing (its §5.2, "the shared turn"). It's big enough to deserve a
design document of its own before it's built, and building it as a platform
feature rather than an Empires special is the right shape: Realm Arena teams
would use it too.

Until it exists, Empires runs as A: one seat at a time, which is all two
players need.

### 17.3 Commands

The player's commands: `MoveUnit` (a path), `Attack`, `SetUnitOrder`
(fortify, sleep, explore, skip, go to), `FoundCity`, `SetQueue`,
`SetFocus`, `PinCitizen`, `ClearForest`, `SetResearch`, `DeclareWar`,
`ProposePeace`, `AnswerPeace` and `EndTurn`.

The **round opening** is a server-only command, recorded on `commandHistory`
like `PlayerDropped` is, so a replay runs it at the same moment: yields,
growth, production, research, healing, barbarian moves and raids, "go to"
orders carried on (D33 covers whether those walk at the round's opening or
on their owner's turn).

Every move is its own command and goes to the server at once, because any
move can reveal the map, and only the server knows what's there. That's a
round-trip a move; the board should move the unit straight away and settle
when the answer comes.

### 17.4 Hidden information

`CreateDataResponse(viewerId)` cuts the state to what that player can see
(§13): their explored tiles only, their own units and cities, rivals' units
in sight, rivals' cities as last seen. `outcomeFor` cuts a command's outcome
the same way. The replay adapter must do it for every step of the recap, and
push copy must never name something the recipient hasn't seen. The map seed
never leaves the server.

The explored tiles per player are a bitset (one bit a hex: under 100 bytes
each), and "last seen" is a small record per city.

### 17.5 Timers, timeouts and dropouts

- **The turn timer** (`TurnTimerSelect`) times each player's turn. When it
  runs out, a timeout adapter (`ITurnTimeoutAdapter`) ends it for them:
  standing orders carry on, units without orders skip, a city with an empty
  queue keeps turning production into food, and research picks the cheapest
  tech.
- **Dropping out.** After the platform's run of missed turns, the dropout
  adapter (`IPlayerDropoutAdapter`) turns the player's cities into free
  cities (§12.3) and removes their units.

### 17.6 Undo and the recap

- **Undo** ([`undo.md`](../undo.md)) fits the choices that reveal nothing: a
  move that showed no new tile and met nobody, a queue, a focus, a research
  pick. A move that revealed something, an attack, a tribal village and
  founding a city can't be undone.
- **"Since you were last here"** is where an asynchronous *Civilization*
  lives or dies: a list of what happened in your empire (grew, finished,
  starved, was attacked) and what you saw (a rival's army near your border, a
  war declared, the Grand Academy started), with the seen moves played on the
  board.

### 17.7 Size and speed

The map is under 2 KB, and the state well under 100 KB. The command history
is the thing that grows: about ten commands a player a round is 2,800
commands at four players over 70 rounds, perhaps 1 MB. That's fine for the
document, but replaying all of it to build a recap, with pathfinding and
fog on every step, may be slow late in a match. If it is, the recap should
replay from a checkpoint near the start of the player's last turn rather
than from round one (see [`loading-performance-plan.md`](../loading-performance-plan.md)).

Balance numbers will change while matches are running. Rule changes that
would alter a match in play go behind a command version
([`command-versions.md`](../command-versions.md)).

### 17.8 What every game here brings

A game guide (`GAME_GUIDES`), a guided tutorial (`GAME_TUTORIALS`) — this game
needs one more than any other here — three to six achievements, a share card
(`npm run icons`), and its line in "What's new" when it ships.

---

## 18. Out of scope for the first version

- Gold, trade routes and buying things outright.
- Culture, borders that grow by culture, policies, religion, great people.
- Happiness or amenities (population caps do that job, §10.4).
- Workers and tile improvements (buildings do that job, §10.6).
- Wonders other than the Grand Academy.
- Promotions, experience and unit upgrades.
- The ocean, and naval warfare beyond the galley.
- Eras after the medieval.
- Diplomacy beyond war and peace: trade, alliances, teams.
- Computer opponents, solo play, and city-states.
- Map types other than one continent; map wrapping; rotating the view.
- Themes ([`game-themes.md`](../game-themes.md)): a natural fit later (a
  fantasy realm, a space-age map), but not before the rules settle.

---

## 19. Implementation sketch

Not a plan yet; a plan follows once §20 is answered. The order the pieces
want:

**Milestone A — two empires.** Two players, turns one after another, on the
engine as it is.
1. The hex helper and a board that draws a generated map (flat-coloured
   hexes first, no art), with `BoardZoom` and tap-to-tile.
2. The generator with its fairness checks, and the fog: explored and visible
   tiles, cut on the server.
3. Units moving, with costs, rivers, zones of control and "go to".
4. Cities: founding, territory, worked tiles, growth, the queue.
5. Research, and the ancient era's buildings and units.
6. Combat and capturing cities.
7. Winning: domination and the score at the round limit; the result screen.
8. The timeout and dropout adapters; the recap.
9. Guide, tutorial, achievements, share card; then the game library.

**Milestone B — more at the table.**
1. Several players active at once, as a platform feature with its own design
   document (§17.2).
2. Three and four players, war and peace, war groups.
3. Barbarians and tribal villages.
4. The classical and medieval eras, the Grand Academy.

**Milestone C — after that.** The art pass, wonders, promotions, the ocean,
themes, and perhaps computer opponents.

**The riskiest parts**, worth a prototype before the rest is built on them:
whether a late-game turn really stays short on a phone (§4.3), and whether
several hundred isometric hexes draw smoothly (§16.2).

---

## 20. Decisions to make

Thirty-four decisions, in four tiers by how soon they block something:

- **Tier 1 — before anything is built.** These change the shape of the whole
  game.
- **Tier 2 — before Milestone A's rules are written.**
- **Tier 3 — before Milestone B.**
- **Tier 4 — can wait for a prototype.**

Each lists its options and a recommendation. The recommendation is what the
body of this document assumes.

### Tier 1 — the shape of the game

**D1. Working title.** "Civilization" is a trademark, and the games here
take their own names (Settlements & Cities, World Domination, Outbreak).
*Options:* Empires · Dawn of Nations · Hexpire · First Cities · Cradle ·
something else. *Recommendation:* none yet; "Empires" is a placeholder. See
the appendix.

**D2. How many players, and against whom?**
*Options:* (a) 2–4 humans, free-for-all; (b) 2–6 humans; (c) also teams;
(d) also computer opponents or solo play.
*Recommendation:* (a). Six players means a round of a day or more at peace,
and a map too big for a phone. Teams want the shared-turn engine piece and
diplomacy the first version doesn't have. Computer opponents are a project as
big as the game (Realm Arena's co-op AI is only tactics).

**D3. The time model** (§5).
*Options:* (A) one after another; (B) orders, then resolve; (C) all at once,
live; (D) all at once at peace, in order at war.
*Recommendation:* (D), built as (A) first for two players, with "several
players active at once" built as a platform feature for Milestone B.

**D4. How long is a match?**
*Options:* (a) a fixed 70 rounds; (b) the host picks short (50), standard (70)
or long (100), and costs scale to fit; (c) no round limit.
*Recommendation:* (b), with standard the default. (c) means a match that never
ends while two players turtle, which the platform's other games never do.

**D5. How do you win?** (§14)
*Options:* any mix of (a) domination (every original capital); (b) score at
the round limit; (c) a science victory; (d) elimination of everyone else.
*Recommendation:* (a) + (b) + (c), with the science victory as the Grand
Academy — a public project that can be stopped — rather than a tech nobody else
can see coming. (d) is (a) by a slower route.

**D6. How much history?**
*Options:* (a) three eras, ancient to medieval, ~20 techs; (b) four, to the
renaissance and gunpowder; (c) the whole of history.
*Recommendation:* (a). Each era roughly doubles the units, buildings and art,
and three fit 70 rounds (§11). Gunpowder is the natural first expansion.

**D15. Which yields?** (§10.3)
*Options:* (a) food, production, science; (b) + gold; (c) + gold and culture.
*Recommendation:* (a). Each yield adds a number to every tile and every city
on a small screen. Gold earns its place only with something to spend it on
(buying, upkeep, trade), which is a later layer.

**D16. Workers or buildings?** (§10.6)
*Options:* (a) worker units improve tiles one by one, as in *Civilization*;
(b) a building in the city improves every worked tile of a biome; (c) no
improvements at all.
*Recommendation:* (b). Workers are the busiest busywork in the genre, and the
worst fit for a turn at the bus stop.

**D23. How many units on a tile?** (§8.1)
*Options:* (a) one military unit and one civilian (*Civilization V*/*VI*);
(b) unlimited stacks (*Civilization IV*); (c) stacks up to a limit.
*Recommendation:* (a). It's what makes hexes, terrain and fronts matter.
The cost is more units to move each turn, which standing orders (§8.3) and
upkeep (§8.4) keep in check. (b) would be quicker to play and much less
interesting to fight.

### Tier 2 — before Milestone A's rules

**D7. Hex orientation and the look** (§7.1, §16).
*Options:* (a) pointy-topped hexes, squashed to a tilted-table view; (b)
flat-topped, the same; (c) a flat top-down hex map with no standing art;
(d) true isometric hexes with heights, like Realm Arena's squares.
*Recommendation:* (a). Pointy-topped hexes make horizontal rows, which suit
an upright phone and the back-to-front drawing. (c) is cheaper but loses the
look the brief asks for. (d) multiplies the art and the drawing rules for
little gain on a map without heights that matter.

**D8. Map size and shape** (§7.6).
*Options:* (a) about 120 land hexes a player, taller than wide, no wrap; (b)
bigger, for six cities or more each; (c) the host picks small, standard or
large; (d) a map that wraps east to west, as *Civilization*'s does.
*Recommendation:* (a) for the first version, with (c) once balance is known.
Wrapping (the app has it: [`map-edge-wrapping.md`](../map-edge-wrapping.md))
makes a continent harder to read on a phone and gives no player an edge to
put their back against.

**D9. Map generation** (§7.7).
*Options:* (a) procedural from a seed, one continent, with fairness checks;
(b) a few hand-made maps; (c) (a) with several map types (continents,
islands, a big inland sea).
*Recommendation:* (a). Every match should explore something new; (c) when
the ocean opens up.

**D10. Which biomes?** (§7.2)
*Options:* (a) the eight in the brief; (b) + plains (1 food, 1 production)
and desert; (c) + tundra, snow and marsh too.
*Recommendation:* (a), built as a registry so (b) is an entry each. Plains
are the most likely first addition: with only grassland as open land,
everywhere flat looks and plays the same.

**D11. One biome a tile, or a terrain with features on it?**
*Options:* (a) one biome a tile; (b) a base (grassland, plains) with a
feature on top (forest, jungle) and hills as a height, as in *Civilization*
— forested hills, jungle on hills.
*Recommendation:* (a). Easier to read, to draw and to balance. (b) is a lot
of combinations for each to be worth something.

**D12. Mountains: impassable, or just expensive?**
*Options:* (a) impassable; (b) cost 3, ending the move; (c) passable only by
some units (scouts).
*Recommendation:* (a). Impassable ranges with passes are what make a map's
chokepoints and fronts. The brief's "different costs for different biomes"
still holds for the rest.

**D13. What rivers do** (§7.3).
*Options for movement:* (a) crossing ends the move until Engineering; (b)
crossing costs +1; (c) no cost. *For combat:* attacking across a river at
−5, or nothing. *For yields:* +1 food beside a river, or something else
(+1 science, as trade).
*Recommendation:* (a), −5, +1 food, and rivers as fresh water for growth.
Rivers should be the most fought-over places on the map.

**D14. Water** (§7.4).
*Options:* (a) coast only: embarking with Shipbuilding, galleys, no ocean;
(b) + ocean travel later in the medieval era; (c) no water units at all.
*Recommendation:* (a). Water matters as food and as a wall, and the coast
gives coastal cities something to defend, without a naval game to balance.

**D17. Who places citizens?** (§10.2)
*Options:* (a) automatic by the city's focus, with tiles the player can pin;
(b) the player places each citizen; (c) automatic only.
*Recommendation:* (a).

**D18. How territory grows** (§10.2).
*Options:* (a) one tile from the second ring each time the city grows, its
choice or the player's pin; (b) the whole second ring at once at a given
size; (c) by a culture yield, as in *Civilization*.
*Recommendation:* (a). Borders move a little and often, for a reason the
player can see. (c) needs D15's culture.

**D19. What stops cities growing forever, and empires spreading forever?**
(§10.4)
*Options:* (a) population caps by fresh water and buildings, and settlers
that cost more for each city; (b) a happiness system; (c) nothing — the map
size is the brake.
*Recommendation:* (a). It ties growth to the land (the first pillar) without
a fourth number to manage. (c) rewards the player who spams settlers.

**D20. How close can cities be?**
*Options:* (a) three hexes apart, second ring at most (a 19-tile city); (b)
four apart, third ring (37 tiles, as *Civilization VI*); (c) two apart.
*Recommendation:* (a). A second ring keeps a city's land on screen around
it, and four to six cities a player fit the map (§7.6).

**D21. Resources** (§7.5).
*Options:* (a) bonus resources only; (b) + strategic resources (horses,
iron) that gate units, guaranteed near every start; (c) + luxury resources
(needs D19's happiness).
*Also:* are resources visible from the start, or revealed by a tech?
*Recommendation:* (b), always visible. Two strategic resources give the map
places worth fighting for; the guarantee stops a start being locked out of
a unit type. Revealing by tech is more hidden state for little gain.

**D22. Production rules** (§10.5).
*Options:* (a) a queue of five, progress kept when switching, an empty queue
turns production into food; (b) one item at a time, progress lost on a
switch; (c) (a) plus buying things with gold (needs D15's gold).
*Recommendation:* (a).

**D24. Is combat random?** (§9.2)
*Options:* (a) deterministic: the damage formula is the damage; (b)
bounded variance (±20%, as *Civilization VI*), rolled by the server and
recorded; (c) something smaller (±10%).
*Recommendation:* (a). The defender is usually asleep, and the platform's
earlier design rounds settled that the less a player takes part, the less
luck should decide (`defender-of-the-realm.md` §5, point 7). An exact
preview is also simpler to show and to trust. This is the most genuinely
open of the tier-2 questions: some players will miss the swing.

**D25. Promotions and upgrades.**
*Options:* (a) none in the first version; (b) experience and a promotion
tree; (c) upgrading old units for production.
*Recommendation:* (a), with (b) the first addition after.

**D26. Unit upkeep** (§8.4).
*Options:* (a) two free units a city, 1 production each beyond; (b) no
upkeep; (c) a hard cap on units.
*Recommendation:* (a). Upkeep is the brake on armies, which are what make
late turns long.

**D27. Capturing cities** (§9.4).
*Options:* (a) capture only, losing 1 population and a level of walls; (b)
capture or raze; (c) capitals can't be captured, only "occupied".
*Recommendation:* (a). Razing removes original capitals, which domination
counts, and adds a choice that's mostly cruel.

**D28. Zones of control and closed borders** (§8.1, §12.1).
*Options:* (a) both: moving between two tiles next to an enemy stops the
unit, and no unit enters a rival's land at peace; (b) zones of control only;
(c) neither.
*Recommendation:* (a). Zones of control let a few units hold a front for an
absent player. Closed borders are what make peaceful players unable to hurt
each other, which dynamic turns (D3) rely on.

### Tier 3 — before Milestone B

**D29. Diplomacy** (§12.1).
*Options:* (a) war and peace only: war a round after it's declared, peace by
proposal, ten rounds before war again; (b) + open borders and trade; (c)
always at war, no diplomacy.
*Recommendation:* (a). Dynamic turns (D3) need war and peace to exist at
all. (c) would put everyone in one war group and make D3 pointless.

**D30. Barbarians and villages** (§12.2).
*Options:* (a) static camps that send a raider every ten rounds, and tribal
villages; (b) camps that spawn roaming barbarians, as in *Civilization*;
(c) none.
*Recommendation:* (a). Barbarians give the first fifteen rounds some danger
and something to fight before the neighbours arrive. Roaming barbarians need
a real game AI.

**D31. Fog of war** (§13).
*Options:* (a) always on; (b) a host option, on by default (as Realm Arena);
(c) off.
*Recommendation:* (a). Exploring an unknown continent is half the genre. It
means every response is cut per player, which the platform knows how to do
but which touches everything (§17.4).

**D32. A player who drops out** (§12.3).
*Options:* (a) their cities become free cities anyone can take; (b) their
cities and units vanish; (c) the game is abandoned.
*Recommendation:* (a).

**D33. When do standing orders move?** (§17.3)
*Options:* (a) at the round's opening, for everyone, before anyone plays; (b)
when their owner starts their turn; (c) when their owner ends their turn.
*Recommendation:* (a) for "go to" and "explore", so a player opening their
turn sees where their units got to, and can change course before acting. It
also means a timed-out player's units still move.

### Tier 4 — can wait for a prototype

**D34. Rendering and art** (§16.2).
*Options for drawing:* (a) SVG throughout, as the other boards; (b) a canvas
for the ground, SVG for units, cities and labels. *For art:* (a) hand-drawn
tile art through `/art-masters` and a tile sheet; (b) art drawn as code, as
Realm Arena's marks; (c) flat colours and icons to begin with. *For figures:*
code-modelled in six directions (Realm Arena's pipeline), or tokens.
*Recommendation:* prototype (a) with flat colours at the four-player map size
on a mid-range phone, and choose the art and the drawing from that. Start
with tokens for units.

### Other numbers to confirm

These aren't decisions so much as numbers to sign off or change: sight
ranges, movement points, the damage formula and its modifiers, the growth
formula, the population caps, every cost in §8.2, §10.6 and §11, the score
table, and the peace minimum of ten rounds. They want a balance pass with a
spreadsheet (or a simulator over the rules module) before anyone plays.

---

## 21. Questions and answers

None yet. Round 1 will go through §20's decisions, tier 1 first, and record
the answers here as numbered rounds, the way
[`realm-arena.md`](./realm-arena.md) §11 does.

---

## Appendix: Working title

"Empires" is a placeholder. The name has to avoid *Civilization* and
*Civ* (trademarks), and ideally say "found cities on a map and grow them"
without promising a war game. Candidates so far: **Empires**, **Dawn of
Nations**, **Hexpire**, **First Cities**, **Cradle**. Several of these will
collide with something on the app stores; it's worth checking before one is
picked (D1).

## Revision history

- **v0.1** — First draft: concept, pillars, the hand-off budget, a proposed
  time model, the map, units, combat, cities, research, diplomacy, fog of
  war, victory, the phone UI, the isometric hex board, fit with the
  platform, and 34 decisions with recommendations.
