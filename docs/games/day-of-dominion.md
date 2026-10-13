# Day of Dominion — Game Design Document

**Status:** Concept, v0.4. Round 1 (§21.1) settled the name, eight players,
turns taken one after another, long matches at a pace the host picks,
several ways to win, five eras each player moves through at their own speed,
units that upgrade through research, the yields with strategic resources,
and one military unit a tile. Round 2 (§21.2) added gold as a sixth yield,
chose city buildings over workers, and made combat strength and advantages
with no roll. Round 3 (§21.3) reopened the time model: §5 now lays out eight
ways to run a round and what each would need here. Everything still open is in
§20: the time model, round 2's new questions
(D35–D47, none answered yet), two that gold raised (D48–D49), and the rest of
round 1's. The body is written as if each open recommendation were taken,
and marks the spot with the decision's number — except the time model, where
it still assumes round 1's answer (§5.8 lists what would change).
**Name:** Day of Dominion
**Genre:** Turn-based 4X on a hex map, *Civilization*-style
**Inspirations:** *Civilization V* and *VI* (hexes, one unit per tile, cities
working the land around them, culture and faith alongside science)
**Players:** up to 8, competitive (D2, D45)
**Session shape:** a long match — up to 300 rounds or more — at a pace the
host picks; weeks to months of real time depending on the table (§4, D35)

---

## Table of contents

1. [High concept](#1-high-concept)
2. [Design pillars](#2-design-pillars)
3. [Where it sits among the other games](#3-where-it-sits-among-the-other-games)
4. [The asynchronous problem: the hand-off budget](#4-the-asynchronous-problem-the-hand-off-budget)
5. [Time model: who moves when](#5-time-model-who-moves-when)
6. [Pace](#6-pace)
7. [Eras](#7-eras)
8. [A match from start to finish](#8-a-match-from-start-to-finish)
9. [The map](#9-the-map)
10. [Units and movement](#10-units-and-movement)
11. [Combat](#11-combat)
12. [Cities](#12-cities)
13. [Research](#13-research)
14. [Culture](#14-culture)
15. [Religion](#15-religion)
16. [The other players, and everyone else](#16-the-other-players-and-everyone-else)
17. [Fog of war and hidden information](#17-fog-of-war-and-hidden-information)
18. [Winning](#18-winning)
19. [A turn on a phone](#19-a-turn-on-a-phone)
20. [Decisions to make](#20-decisions-to-make)
21. [Questions and answers](#21-questions-and-answers)
22. [Presentation: the isometric hex board](#22-presentation-the-isometric-hex-board)
23. [Fit with the platform](#23-fit-with-the-platform)
24. [Out of scope for the first version](#24-out-of-scope-for-the-first-version)
25. [Implementation sketch](#25-implementation-sketch)

§20 and §21 sit in the middle, before the engineering sections, because
they're what the next round works through.

---

## 1. High concept

Up to eight peoples start with a settler and a warrior each, somewhere on a
world made of hexes that nobody has mapped. They found cities, and the land
around each city decides what it's good at: a city in the grassland by a
river grows fast, a city among the hills turns out soldiers, a city in the
shadow of the mountains becomes a holy place. Cities grow, build, and train
units. Units explore, settle new land, carry a faith abroad, and eventually
march on the neighbours.

Research carries each people through five eras, from the first granary to
the launch pad, and nobody has to be in the same era as anyone else: a
people that pours everything into science can be fielding riflemen against a
neighbour's knights. As research moves on, old units are upgraded into new
ones rather than thrown away.

There's more than one way to win. Conquer every rival, or reach the end of
the tech tree and launch a mission to the stars before anyone can stop it.
Culture and religion are yields from the start, so victories by them can come
later without the game being rebuilt.

**One-line pitch:** *Found a city on a river. Three hundred rounds later,
own the world — or leave it.*

---

## 2. Design pillars

| Pillar | What it means | How it shows up |
|---|---|---|
| **The land decides** | Where you put a city matters more than anything you do afterwards. | Biomes set every tile's yields (§9.2), rivers and coasts decide how big a city can grow (§12.4), buildings multiply what the land already gives (§12.6) |
| **Your history is your own** | Each people moves through the eras at its own speed. | Eras follow your research, not the calendar (§7). Knowing what a neighbour knows makes it cheaper to learn (§13.3) |
| **Nothing is thrown away** | An army raised in round 40 still matters in round 240. | Units upgrade along their line as research moves on (§10.3) |
| **A turn fits in a spare few minutes** | A long match is fine; a long turn isn't. | Standing orders (§10.5), production queues (§12.5), a "what needs me?" button (§19), and a turn that ends by itself when nothing needs you (§5.2) |
| **More than one way to win** | A builder and a warmonger can both be winning. | Domination and a science mission now; culture and faith in the economy from the start, so their victories can follow (§18) |
| **You see what your people see** | Exploration is a discovery, an army is a surprise. | Fog of war, with the server sending each player only what they can see (§17) |
| **The defender isn't punished for being asleep** | An attack on an absent player is fair. | War starts a round after it's declared (§16.1), combat is predictable (§11, D24), cities defend themselves (§11.4) |

---

## 3. Where it sits among the other games

- **Kingdom Builder** ([`kingdom-builder-gdd.md`](./kingdom-builder-gdd.md))
  is the nearest relative: a map, settlements, armies, terrain that changes
  travel. But it's a *world* that runs on a real-time tick, and nobody takes
  a turn. Day of Dominion is a *match* with rounds, turns, and a winner, on a
  hex grid you move pieces across a tile at a time. The two should feel like
  different games.
- **Settlements & Cities** ([`settlements-and-cities.md`](./settlements-and-cities.md))
  already draws a hex board. Its hex maths (`SettlementsAndCitiesBoard.tsx`,
  `board.ts`) is the first thing to look at for reuse; if the projection in
  §22 needs a shared hex helper, both boards should go through it rather than
  grow a second copy (AGENTS.md, the component-reuse rule). It also already
  ends a turn by itself when its player has nothing left they can do
  (`autoEndTurn.test.ts`), the precedent for §5.2.
- **Realm Arena** ([`realm-arena.md`](./realm-arena.md)) has the isometric
  board, fog of war with "last seen", tap-to-move with shaded reach, a
  playback clock for moves played over the board, and a pipeline for figures
  modelled in code. Day of Dominion should reuse all of that machinery, on
  hexes instead of squares.
- **World Domination** ([`worlddomination.md`](./worlddomination.md)) is the
  conquest game, on a node-and-edge map with dice. Day of Dominion is about
  building first; war is one of the ways to use what you built.

---

## 4. The asynchronous problem: the hand-off budget

### 4.1 The numbers

Turns are taken one after another (§5), so a round is eight hand-offs at
eight players. What a hand-off costs depends on how often the table checks
in. The other design documents assume four check-ins a day, which is about
three hours a hand-off
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §9).

| Players | Wait a hand-off | Round | 100 rounds | 200 rounds | 300 rounds |
|---:|---|---:|---|---|---|
| 2 | 3 h (four check-ins a day) | 6 h | 25 days | 50 days | 75 days |
| 4 | 3 h | 12 h | 50 days | 100 days | 150 days |
| 8 | 3 h | 24 h | 100 days | 200 days | **300 days** |
| 8 | 1 h (an hour's turn timer, a keen table) | 8 h | 33 days | 67 days | 100 days |
| 8 | 20 min (a table that plays most evenings) | 2 h 40 | 11 days | 22 days | 33 days |
| 8 | 2 min (everyone online at once) | 16 min | 27 hours of play | 53 hours | 80 hours |

These are upper bounds: a turn that ends by itself (§5.2) costs nothing, and
a turn timer caps every wait.

### 4.2 What follows from it

1. **At eight players and four check-ins a day, a 300-round match is a
   year.** That's the most important number in this document, and it's
   §20's first new question (D35). The levers are the pace (§6), which sets
   how many rounds a match has; the turn timer, which caps each wait; and
   turns that end themselves (§5.2), which remove hand-offs that needed
   nobody.
2. **Over months, people leave.** Somebody will drop out of nearly every
   eight-player match that runs long. What happens to their seat matters far
   more than it does in a two-week game (§16.3, D32).
3. **A big match means a big world.** Eight players and 300 rounds want a map
   of a few thousand hexes, a dozen cities each and armies of dozens of units
   (§9.6). That's what puts pressure on turn length (§4.3), on drawing the
   board (§22) and on storing the match (§23.7).

### 4.3 Keeping a turn short

A late-game *Civilization* turn with fifteen cities and forty units is half an
hour of tapping. On a phone, between two other games, that kills a match.
Seven things keep a turn here to a few minutes:

- **No workers.** Tiles are improved by buildings in the city, not by a unit
  you walk to each tile (§12.6, D16). That alone removes the worst of the
  genre's busywork.
- **Orders that last.** A unit given a destination walks there over as many
  rounds as it takes. A fortified or sleeping unit asks for nothing (§10.5).
- **Queues.** A city works through a queue of up to five items, and can
  repeat its last item. Research works towards a chosen goal through every
  tech on the way (§12.5, §13).
- **City automation.** A city can be left to choose its own builds by a
  priority (growth, military, science, culture, faith) when the player would
  rather not manage it (§12.5).
- **Upgrade all.** One button upgrades every unit that can be (§10.3).
- **One button that knows what needs you.** "Next" walks the player through
  every unit without orders, every city without production and every choice
  waiting (a tech, a tradition, a belief), then becomes "End turn" (§19).
- **A brake on size.** Each city past the first few makes research and
  culture cost a little more (§12.4, D19), and units cost upkeep (§10.6), so
  sprawling is a choice, not the default.

---

## 5. Time model: who moves when

**Reopened in round 3 (D3).** Round 1 chose turns one after another (option A
below), and the rest of this document is still written that way. Round 3 asked
what else there is, whether it could run here, and what it would cost. §5.3–
§5.8 answer that; §20.1 holds the decision.

### 5.1 What a turn is

Under turns one after another (A), at the start of a player's turn, **their
empire moves on**: their cities collect yields, grow or starve, finish what
they were building, their research and culture and faith move on, their units
heal, and units with standing orders walk (§10.5). Then the player plays: moves
units, attacks, founds cities, sets queues and picks choices. Then they end
their turn, and the next seat starts.

After the last seat, **the world moves**: barbarians act (§16.2), and the
round count goes up.

Because each empire moves on at the start of its own turn, nothing a player
does on their turn is undone by the round's bookkeeping, and the recap
(§23.6) can say exactly what changed while they were away.

### 5.2 A turn that ends by itself

A player can choose to have **their turn end by itself when nothing needs
them**: at the start of their turn, once their empire has moved on, if no
unit is without orders, no city's queue is empty, no choice is waiting and no
enemy is in sight, the server ends the turn for them, and they're told what
happened in their next recap. In the long middle of a match — armies
fortified, cities working down their queues — that can take a whole hand-off
out of most rounds.

It's off unless the player turns it on, and it can be switched off at any
time. To everyone else, a turn that ended by itself must look exactly like
one the player ended by hand, as Settlements & Cities already makes sure,
since otherwise it says something about that player's empire (§17).

This works under every option below.

### 5.3 The two problems with moving at once

Letting everyone play the same round at the same time is what makes rounds
fast (§4.1). It brings two problems.

1. **The fastest player wins.** When two players act in the same round and
   moves happen the moment they're made, whoever acts first wins anything they
   both wanted: the city site, the attack before the other side retreats.
   *Civilization*'s own simultaneous mode is known for this.
2. **The double move.** A round closes when the last player ends it, and the
   next opens at once. So the player who played *last* in round 10 can play
   *first* in round 11: two turns in a row, with nobody able to answer in
   between. Their army attacks, then attacks again, before the defender has
   seen the first blow. Asynchronously this isn't an exploit someone has to
   try for: it happens whenever one player checks in after the other, which is
   half the time.

Both only matter **between players who can affect each other**. Two players
who can't touch each other can play in any order, at the same time, twice in a
row, and neither is worse off. Most of the options below are built on that.

"Affect each other" means two things:

- **Fighting:** attacking each other's units and cities. Only players at war.
- **Racing:** both wanting the same thing first — a city site, a tile, a tribal
  village, a wonder. Players at peace can race.

### 5.4 The options

**A. One after another.** Every game here works this way. Fair: nobody moves
twice in a row, nobody races. Slow: a round is eight hand-offs.

**B. All at once, live.** Everyone plays the same round whenever they like,
and every move happens when it's made. The round closes when everyone has
ended it. Fast, and it's *Civilization*'s simultaneous mode — so it has both of
§5.3's problems in full, between everyone.

**C. At war in order, otherwise at once.** *Civilization VI*'s "dynamic turns".
Each round, players at war with each other, directly or through someone else,
form a *war group* and take their turns in a fixed order; everyone else plays
at once, alongside the war groups. Enemies can never double-move each other,
because they always alternate. Players at peace still race (§5.7 deals with
that).

**D. Phases by conflict.** C generalised. Each round the server draws a graph
of who is in conflict with whom and splits the players into as few **phases**
as it can, so that no two players in conflict share one. Phase 1 plays at
once, then phase 2, and so on. With conflict meaning *at war*, it's C, but a
chain of wars takes fewer steps: with A at war with B and B with C, option C
puts all three in one war group, three turns one after another, while D needs
only two phases, {A, C} then {B}. With conflict meaning *in contact*
(borders touching, or units in sight of each other), it also ends peaceful
races near a border, but as the map fills up nearly everyone is in contact
with someone and it slides towards A.

**E. Orders, then resolve (WEGO).** Everyone gives their orders for the round
in secret, at any time; when the last player is done, the server carries them
all out together. *Diplomacy*, *Frozen Synapse*, *Laser Squad Nemesis*, and
this repo's own sealed battle plans
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §13). Perfectly
fair: nobody moves first, so nobody moves twice and nobody races. The cost is
the feel: you can't see the result of one attack before ordering the next,
and the server needs rules for every collision (two units into one tile, an
attack on a unit that moved away, two players taking the same city).

**F. Live economy, sealed war.** Everything that only touches your own empire
— cities, research, culture, faith, moving inside your own land or into the
unknown — happens live, at once. Anything that touches another player — an
attack, moving into a tile they can see, founding a city or buying a tile near
them — is sealed, and carried out at the round's end, as in E. A middle way:
most of a turn feels like *Civilization*, and fights are fair. The cost is a
rule for exactly what "touches another player" means, and a turn where some
moves happen now and some later.

**G. Rounds on a deadline.** The round closes at a fixed time — every 6, 12 or
24 hours — whether everyone has played or not; a player who hasn't has their
standing orders carried out (§23.5). Kingdom Builder's tick, made coarse.
Combined with B, C or E. Its gift is a match whose length is known on day one
(300 rounds at 12 hours is 150 days) and nobody waiting on the slowest
player. The cost: a busy player misses turns they'd have played, and a
deadline has to fit eight time zones.

**H. One after another, with prepared turns.** A, but while others play, you
can **prepare your next turn**: queue moves and choices, as the planning
engine already lets a player try moves on a copy of the board
([`turn-recap-and-planning.md`](../turn-recap-and-planning.md)). When your
turn comes, if nothing you can see has changed in a way that matters — no
enemy in sight, no prepared move blocked — the server plays it and ends it
for you. §5.2 taken further. Fair, because it's still one at a time; quick
when quiet, because a prepared turn costs no hand-off; no help when it isn't.
It works on top of every other option too.

### 5.5 How fast, and how fair

Eight players, four check-ins a day (about three hours a hand-off, §4.1). The
slowest of eight players is about 8 hours on average.

| | Round | 300 rounds | Fastest player wins? | Double move? | Feels like |
|---|---:|---:|---|---|---|
| **A** One after another | ~24 h | ~300 days | No | No | *Civilization* hotseat |
| **B** All at once, live | ~8 h | ~100 days | Yes | Yes, between everyone | *Civilization* simultaneous |
| **C** At war in order | ~8 h at peace; ~10 h with a war; 24 h if everyone is in one war | ~100–130 days | Only in peaceful races (§5.7) | No | *Civilization VI* dynamic turns |
| **D** Phases by conflict | Between C and A | ~100–200 days | Fewer races than C | No | As C |
| **E** Orders, then resolve | ~8 h | ~100 days | No | No | *Diplomacy* |
| **F** Live economy, sealed war | ~8 h | ~100 days | No | No | *Civilization*, with fights at the round's end |
| **G** On a deadline | Fixed: 6, 12, 24 h | 75–300 days, known in advance | As the option it's combined with | | Play-by-email |
| **H** Prepared turns | Between A and B, by how quiet the match is | ~150–300 days | No | No | *Civilization* hotseat |

### 5.6 Could the platform do it?

**Today the platform has exactly one active seat.** `currentTurn` is a single
player, and it runs through the shared code — almost forty files outside the
games themselves:

- the command route refuses anyone but `currentTurn`, except commands marked
  playable out of turn, which by design can never end or hand off a turn
  ([`out-of-turn-actions.md`](../out-of-turn-actions.md));
- the turn-timer sweep keeps one turn clock a game, and drops or abandons by
  the one player who's late;
- one `YourTurn` push, one nudge, and the dashboard's "your turn" lists;
- replay's turn boundaries, the recap's "since your last turn", and the
  ten-second undo hold on the hand-off.

So **A and H** run on the engine as it is. H needs a way to keep a prepared
turn (private to its player, so the `croupier` cares) and the rules for when
it still stands.

**B, C, D, F and E need several players active at once.** Three ways to get
there:

1. **Make the engine's active seat a set.** Each active seat has its own turn
   clock, its own `YourTurn` push and its own "your turn" on the dashboard; a
   round closes when the set is empty; a one-seat game is a set of one and
   changes nothing. This is the right shape, and it's a platform feature, not a
   Day of Dominion one: Realm Arena's team play wants the same "shared turn"
   ([`realm-arena.md`](./realm-arena.md) §5.2). It's the biggest piece of
   engine work in this document, and wants its own design document before it's
   built, with the `gremlin` reviewing it (two players acting on one game at
   the same moment is new, and the saves have to be safe against each other).
   Replay keeps working: the command history is already in the order things
   happened, whoever sent them.
2. **Leave the engine, as Kingdom Builder did.** Kingdom Builder runs outside
   the command pipeline altogether — its own models, its own routes
   (`src/app/api/kingdombuilder/`), its own cron (`cron/kingdombuilder-tick`).
   That proves a game can, but Day of Dominion would then have to rebuild the
   command history, replay and recap, undo, the turn timer and the dropout
   ladder for itself. Not worth it for a turn-based game.
3. **Stretch the out-of-turn path.** Mark every command playable out of turn,
   and have an "I'm done" command close the round. It's narrow on purpose, can't
   end a turn, and the pushes, the timer and the dashboard would all still
   think one person was up. Not recommended.

On top of a set of active seats:

- **C** needs the war-group scheduler: who's in which group, the order inside
  it, whose turn it is inside each.
- **D** needs the graph and the phases: a little more than C.
- **E** needs sealed orders — hidden from everyone until the round resolves,
  which is new hidden state for the `croupier` — and a resolution engine that
  carries all of them out at once and settles every collision. That engine is
  the hard part. The resolution itself is one server command, which suits
  replay well.
- **F** needs both a live path and a sealed one, and the rule for which is
  which.
- **G** is the turn timer applied to every active seat at once: with a set of
  active seats, the sweep already does most of it.

### 5.7 Making C fair

If C is chosen, four rules close the gaps it leaves:

1. **A war group's order never changes while the war lasts.** If B goes first
   in the first round, B goes first in every round, so the two always
   alternate. A player joining a group goes last in it.
2. **The player war is declared on goes first.** War starts the round after
   it's declared (§16.1), and in that first round the defender moves first: an
   army massed on the border during the peace doesn't get the first blow as
   well.
3. **Claims are settled at the round's end, not first come.** Founding a city
   and buying a tile — the races that matter most — are made during the turn
   but happen when the round closes. If two players' claims clash (two cities
   too close, the same tile), the one with the round's **priority** wins, and
   priority goes round the table, a seat a round. Tribal villages and empty
   land stay first come: small races, not worth a rule.
4. **Every empire moves on at the start of the round, together.** Yields,
   growth, what completes, research — for everyone at once, so a wonder
   finishing in two empires in the same round is a tie the priority settles,
   not a race to log in.

### 5.8 Recommendation

**C, with §5.7's rules, built on a set of active seats (§5.6, way 1) — and H
and §5.2 on top.** C keeps the moment-to-moment feel of *Civilization*, is
three times faster than A at eight players, and is fair where it counts:
enemies always alternate, and races are settled by a rotating priority, not by
who logs in first. It's also what most *Civilization* players already know.

- **E** is the fairest option and the cleanest on paper, and the runner-up.
  It's the right choice if the table would rather plan than react. It's a
  different game to play, though, and its resolution engine is a project of its
  own.
- **F** is the most interesting middle way, but "what touches another player"
  is a rule players will argue with.
- **G** is worth offering as a host option on top of C: a round deadline, for
  a table that wants the match's length known in advance.
- **Start as A.** At two players, C is A whenever the two are at war, and
  differs only in peace, so Milestone A (§25) can build the game on today's
  engine while the set of active seats is designed. The game should be written
  so that "whose turn is it" is asked of a function, not read off
  `currentTurn`, so C slots in later.

**If C is chosen, this changes elsewhere:** §4.1's table (rounds are about 8–10
hours, not 24, at eight players); §5.1 (empires move on together at the start
of the round); §16.1 (the defender moves first); §17 (which war group a player
is in is known only to the players in it, and the round's priority is public);
§23.2 (the engine piece, §5.6); §25 (that piece goes into Milestone B); and D33
(standing orders move at the start of the round).

---

## 6. Pace

**Decided in round 1 (D4):** the host picks the match's pace, and the pace
scales how fast everything accumulates, so a match can be as long or as short
as the table wants.

### 6.1 What pace scales

The pace is one multiplier on everything the clock pays for:

- **Costs**: every building, unit, project, tech, tradition and belief.
- **Thresholds**: food to grow, culture to claim a tile, faith to found a
  religion.
- **Durations in rounds**: the minimum length of a peace, how often barbarians
  raid, the mission's voyage (§18).

What it doesn't scale: movement, combat, sight, and what a tile yields. A
round is always a round of moving and fighting; pace sets how many of them
it takes to build something.

### 6.2 Presets

A proposal (D43). Rounds are the expected length of a match that ends on
the round limit; most matches will be decided before it.

| Pace | Multiplier | About this many rounds | 8 players, four check-ins a day | 8 players, an hour's turn timer |
|---|---:|---:|---|---|
| **Blitz** | ×0.33 | 100 | ~100 days | ~33 days |
| **Quick** | ×0.67 | 200 | ~200 days | ~67 days |
| **Standard** | ×1 | 300 | ~300 days | ~100 days |
| **Epic** | ×1.5 | 450 | — | ~150 days |

Every number in this document is a **Standard** number, and a **starting
point to tune**, not a decision. They're there so the shape of the economy
can be judged.

### 6.3 Pacing targets

At Standard, a player who keeps up should reach each era about here:

| Era | Rounds, roughly |
|---|---|
| Ancient | 1–60 |
| Classical | 60–120 |
| Medieval | 120–180 |
| Industrial | 180–240 |
| Modern | 240–300 |

A player who falls behind is an era back by the end; a player who throws
everything into science can be an era ahead by the middle. That spread is
the point of §7.

---

## 7. Eras

**Decided in round 1 (D6):** five eras, and **each player is in their own
era**, driven by their own research. Units unlock by research, not by the
era (§10.3).

### 7.1 The five

A proposal (D40): **Ancient, Classical, Medieval, Industrial, Modern.** The
Renaissance is folded into the end of the Medieval era (gunpowder, ocean
ships) and the start of the Industrial (rifling, steam), which keeps the
Modern era for the age of oil and the launch pad. The tech tree is about ten
techs an era (§13).

### 7.2 What being in an era means

A player **enters an era when they research their first tech from it**
(D40). Being in an era:

- **Changes how your people look.** City and unit art follow your era, so a
  glance at the board tells you who's ahead.
- **Is public** to every player who has met you, as in *Civilization*: a
  neighbour arriving in the Industrial era is news.
- **Sets the barbarians near you**: a camp's defender is from the era of the
  nearest player (§16.2).
- **Moves your tradition costs on** (§14.2).

The era isn't a gate on anything: what you can build is set by the techs
you hold.

### 7.3 Catching up

With eight players moving at different speeds, someone will fall a long way
behind. Two things soften it:

- **Knowledge spreads** (§13.3): a tech costs less for every player you've met
  who already knows it.
- **Upgrades** (§10.3): a player who catches up in research brings their old
  army with them rather than starting again.

---

## 8. A match from start to finish

1. **Setup.** The host picks the players (up to eight), the pace (§6), the
   map size (which follows from the player count, §9.6), the turn timer, and
   which victories are on (§18), on the shared setup screen
   (`GameSetupLayout`, `TurnTimerSelect`, `UserInviteList`,
   `OptionChoiceSection`).
2. **Round 1.** Each player has a settler and a warrior on a fair start
   (§9.7), and can see two tiles around them.
3. **Ancient: settle.** Scouts and warriors explore and find tribal villages
   and barbarian camps (§16.2). The capital builds warriors, settlers and a
   Monument. A pantheon is the first faith choice (§15); the first tradition
   the first culture one (§14).
4. **Classical and Medieval: grow and meet.** Borders press against each
   other. Religions are founded and start to spread. The first wars, usually
   over a river valley, a hill, or a source of iron. Players start to spread
   out across the eras.
5. **Industrial: the gap opens.** Coal, factories, riflemen. A people a whole
   era ahead can take what they like from one behind, unless that one has
   friends, walls, or a lot of pikemen.
6. **Modern: decide.** Oil and tanks, or the launch pad. Someone pushes for
   every capital, someone races to launch the mission, and everyone else
   tries to stop whichever is closer.
7. **The end.** Someone holds every original capital, or their mission
   arrives, or the round limit ends the match and the score decides (§18).

---

## 9. The map

### 9.1 Hexes

A grid of **pointy-topped hexes** (D7), stored as rows ("odd-r" offset
coordinates) and worked on in axial coordinates (*q*, *r*), which make
distances and neighbours simple. Every hex has six neighbours and six edges.
The map doesn't wrap (D8).

### 9.2 Biomes

Every tile is exactly one biome (D11). The biome decides what a city gets
from working it, what it costs to move into, and how well a unit there
defends.

| Biome | Food | Prod. | Science | Gold | Move cost | Defence | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| **Grassland** | 2 | 0 | 0 | 0 | 1 | — | The growing land. Irrigation works +1 food (§12.6) |
| **Hills** | 1 | 2 | 0 | 0 | 2 | +3 | The working land. +1 sight. A Mine +1 production. A city on a hill defends better (§11.4) |
| **Forest** | 1 | 1 | 0 | 0 | 2 | +3 | Blocks sight beyond it. A Lumber mill +1 production. Can be cleared to grassland by a city (§12.6) |
| **Jungle** | 1 | 0 | 1 | 0 | 3 | +3 | Slow, hides units, a source of science. A University +1 science |
| **Mountains** | — | — | — | — | impassable | — | Can't be entered or worked (D12). Blocks sight. +1 faith to the city whose territory it's in; an Observatory +1 science (§12.6) |
| **Coast** (shallow water) | 1 | 0 | 0 | 1 | 1 by sea | — | Workable by any city beside it. A Harbour +1 food, +1 production. The sea's trade is where gold starts |
| **Ocean** (deep water) | 1 | 0 | 0 | 0 | 1 by sea | — | Workable by a city with a Harbour. Only ocean-going ships and units embarked after Navigation cross it (§9.4) |

Rivers are the eighth, and they aren't a tile at all (§9.3).

Culture and faith come mostly from buildings, wonders and beliefs, not from
tiles: the land decides how a city feeds and builds itself, and what the
player builds there decides what it believes and makes. Mountains are the
exception, which is what makes a city in the mountains' shadow a holy place.
Gold is the same, with the coast as the exception: a harbour town is a trading
town.

The biome list is a registry (one entry per biome with its yields, cost,
defence, sight rule and art), so adding plains, desert, tundra or snow later is
one entry (D10).

### 9.3 Rivers

Rivers run along the **edges** between hexes, from high ground to the coast,
and every river reaches water. They do three things (D13):

- **Food.** A land tile with a river along any of its edges gets +1 food.
- **Fresh water.** A city whose centre has a river along an edge, or that
  sits on the coast, can grow bigger (§12.4).
- **An obstacle.** Moving across a river edge **uses all the unit's
  remaining movement**, and a unit attacking across a river fights at −5
  (§11.2). Engineering (§13) bridges every river for its owner.

Each hex owns three of its six edges (east, south-east, south-west), so each
river edge is stored once, as three bits a tile.

### 9.4 Water

Five eras want the oceans. A proposal (D14):

| From | What the water allows |
|---|---|
| The start | Coast and ocean are walls for land units. Cities work them |
| Sailing | Galleys, on coast only |
| Shipbuilding | Land units embark onto coast (strength 10, two moves, defenceless) |
| Navigation | Ocean-going ships; embarked units cross ocean |
| Steam Power and later | Ironclads, destroyers, battleships (§10.2) |

So the first two eras are a continent's game, and the world opens up in the
third. The generator makes one or two large continents and some islands
(§9.7): there has to be something across the water worth going for.

### 9.5 Resources

**Bonus resources** add yields to the tile, and are always visible on
explored tiles:

| Resource | Found on | Gives the city working it |
|---|---|---|
| Wheat | Grassland | +1 food |
| Cattle | Grassland | +1 production |
| Deer | Forest | +1 food |
| Stone | Hills | +1 production |
| Fish | Coast | +2 food |
| Whales | Ocean | +1 food, +1 production |
| Incense | Jungle | +1 faith |
| Marble | Hills | +1 culture |
| Gold ore | Hills | +2 gold |
| Pearls | Coast | +1 gold, +1 faith |

**Strategic resources** are needed to build and upgrade particular units and
buildings (decided in round 1). A proposal for the list, one or two an era
(D42):

| Resource | Revealed by | Found on | Needed for |
|---|---|---|---|
| Horses | Horseback Riding | Grassland, hills | Horseman, Knight, Cavalry |
| Iron | Bronze Working | Hills | Swordsman, Knight |
| Niter | Gunpowder | Grassland, hills | Musketman, Frigate, Cannon |
| Coal | Steam Power | Hills, forest | Ironclad, Factory |
| Oil | Combustion | Grassland, jungle, coast | Tank, Destroyer, Battleship |
| Aluminium | Rocketry | Hills, mountains' foot | The Launch pad and the mission's parts (§18) |

**Revealed by research**: a strategic resource only appears on a player's
map once they know the tech that reveals it, so a world they thought they
knew changes under them as they move through the eras (D42). That's hidden
state per player (§17).

**How much a source gives** (D42): each source a player's cities work
supports **four units** that need it (or one building). A player with one
iron mine can field four swordsmen; a fifth needs a second mine. Units
already built aren't lost when a source is: they just can't heal above half
until it's back. Every start is guaranteed horses and iron within reach; the
later resources are deliberately uneven, which is what the later wars are
about.

### 9.6 Map size

About 180 land hexes a player, plus the water round it (D8). Maps are a
little **taller than wide**, because the game is played on a phone held
upright.

| Players | Size (columns × rows) | Hexes | Land, roughly |
|---:|---|---:|---:|
| 2 | 24 × 32 | 768 | ~360 |
| 4 | 34 × 44 | 1,496 | ~720 |
| 6 | 40 × 52 | 2,080 | ~1,080 |
| 8 | 46 × 60 | 2,760 | ~1,440 |

That's room for eight to twelve cities each (D20), contested ground between
them, and islands across the water. It's also large: §22.2 is about drawing
it, and BoardZoom's "fit" step stops being useful past four players (§22.3).

### 9.7 Generating the map

Procedural, from a seed, with fairness checked rather than hoped for (D9) —
the same approach as Kingdom Builder's balance constraints
([`kingdom-builder-gdd.md`](./kingdom-builder-gdd.md) §3.3):

- **A couple of large continents and some islands**, with inland lakes.
  Mountain ranges in lines, so they make passes. Rivers from the ranges down
  to the sea.
- **Starts** at least ten hexes apart, on land that is not jungle or
  mountains, each with: a river or coast within one tile; at least four
  grassland and two hills or forest within two tiles; horses and iron within
  six; a tribal village within five. Every continent large enough to hold
  starts holds at least two.
- **A fairness score** for each start (the yields within two tiles, the land
  within ten that's closer to it than to any other start). The generator
  rerolls until the worst start is within about 10% of the best.
- **Later strategic resources** spread unevenly but never all in one place:
  no player's share of the land within reach of their start holds every
  source of coal or oil.
- **Barbarian camps and tribal villages** at least five hexes from any start.

The seed and the generated map are both server-only: the client gets only the
tiles its player has explored (§17).

---

## 10. Units and movement

### 10.1 Moving

- Every unit has **movement points** (MP) each round: two for most foot
  units, three for recon and early ships, four for mounted units and tanks,
  five or more for later ships.
- Entering a tile costs its biome's move cost (§9.2). Crossing a river ends
  the move (§9.3).
- **A unit with all its movement points can always move one tile**, even if
  the tile costs more. Otherwise it needs enough MP left.
- **One military unit a tile, plus one civilian** (decided in round 1, D23).
  Units can't pass through a tile another player's military unit stands on.
- **Zones of control** (D28). A unit that moves between two tiles which are
  both next to an enemy military unit stops there.
- **Closed borders at peace** (§16.1, D28). A unit can enter another
  player's land only at war.
- Recon units treat forest and jungle as costing 1.

### 10.2 Unit lines

Every military unit belongs to a **line**, and upgrades to the next unit in it
as research unlocks it (§10.3). A proposal for the roster (D41 for how
upgrades work, D47 for the air):

| Line | Ancient | Classical | Medieval | Industrial | Modern |
|---|---|---|---|---|---|
| **Recon** | Scout 10 | | Explorer 25 | Ranger 45 | |
| **Melee** | Warrior 20 | Swordsman 35 *iron* | Musketman 55 *niter* | Rifleman 70 | Infantry 85 |
| **Anti-mounted** | Spearman 25 | | Pikeman 41 | upgrades into Rifleman | Anti-tank 75, built new |
| **Ranged** | Archer 15/25 | | Crossbowman 30/40 | Field gun 50/60 | Machine gun 70/80 |
| **Mounted** | Horseman 30 *horses* | | Knight 48 *horses, iron* | Cavalry 62 *horses* | Tank 80 *oil* |
| **Siege** | | Catapult 15/30 | Trebuchet 18/42 | Cannon 30/55 *niter* | Artillery 50/75 |
| **Naval melee** | Galley 25 | | Caravel 45 | Ironclad 60 *coal* | Destroyer 85 *oil* |
| **Naval ranged** | | Quadrireme 20/30 | | Frigate 45/55 *niter* | Battleship 60/80 *oil* |

The numbers are melee strength, or melee/ranged strength for ranged units.
Ranged units shoot two tiles; siege units fire at +10 against cities and
can't move and shoot in the same round. Spearmen, pikemen and anti-tank guns
get +10 against mounted units and tanks.

**Civilians** sit outside the lines: the Settler, and religion's Missionary
and Prophet (§15). A **Settler** costs the city 1 population, needs a city of
at least 2, and costs more for every city the player already has (§12.4).

### 10.3 Upgrades through research

**Decided in round 1 (D25):** units upgrade through research. A proposal for
how (D41):

- When a player researches the next unit in a line, every unit of theirs in
  that line **can be upgraded**, and the old unit can no longer be built.
- **Upgrading costs gold** (§12.8): 2 gold for every point of production the
  new unit costs more than the old, at least 10. The unit must be in its
  owner's territory and have movement left; upgrading ends its move, it keeps
  its health, and it needs the new unit's strategic resource to have room
  (§9.5).
- **Upgrade all** does every unit that can be, in one tap.
- An upgraded unit keeps its promotions, if those exist (D25).

Research makes the upgrade possible, and gold pays for it: a rich empire can
modernise its army the round the tech lands, a poor one does it a few units at
a time. That's *Civilization*'s own split, and gold now exists to do it
(D41).

### 10.4 Healing

A unit that doesn't move or fight heals 10 HP a round in neutral land, 20 in
its own, and 30 in one of its own cities. It doesn't heal in enemy land.

### 10.5 Orders that last

A unit is given one of:

- **Go to** a tile. It walks there along the cheapest path, as many rounds as
  it takes, at the start of each of its owner's turns (§5.1), and stops if an
  enemy comes into sight or the path is blocked.
- **Fortify.** It stays, and defends at +4 after a full round in place (§11.2).
  It asks for nothing until an enemy comes into sight.
- **Sleep.** It stays, and asks for nothing until woken.
- **Skip.** Nothing this round.
- **Explore.** It walks to the nearest unexplored ground by itself, round
  after round.
- **Spread** (missionaries). It walks to the nearest city not following its
  religion and converts it (§15).

The "Next" button (§19) only stops on units with none of these.

### 10.6 Upkeep

Each city keeps two units for free. Every unit beyond the empire's allowance
costs **1 gold a round**, 2 from the Industrial era on, out of the treasury
(§12.8, D26, D49).

---

## 11. Combat

### 11.1 Attacking

A military unit attacks by moving into an enemy unit's tile (melee), or by
targeting a tile in range (ranged). Attacking uses all the unit's remaining
movement. Every unit has 100 HP, and loses 1 strength for every 10 HP it's
missing.

- **Melee.** Both sides take damage. If the defender dies, the attacker moves
  into its tile, and captures any civilian there.
- **Ranged.** Only the target takes damage. A ranged unit attacked in melee
  defends with its melee strength.

### 11.2 Strength and advantages

Each side's strength is its unit's strength plus its advantages (below).
The difference between the two sets the damage, by *Civilization VI*'s curve,
because it's well tested and easy to show:

> damage dealt = 30 × e^(0.04 × (your strength − their strength))

So equal strengths deal 30 each way; 10 more strength deals 45 and takes
20; 20 more deals 67 and takes 13. A full era's gap (a rifleman at 70 against
a pikeman at 41) deals 96 and takes 9: an era behind is a long way behind.

| Advantage | Strength |
|---|---:|
| Defending on hills, forest or jungle | +3 |
| Fortified a full round | +4 |
| Attacking across a river | −5 |
| Each other unit of yours next to the target (melee only) | +2 |
| Anti-mounted against mounted | +10 |
| Siege against a city | +10 |

**No random element** (decided in round 2, D24): a fight is decided by each
side's **strength plus its advantages** — the table above — and nothing else.
The damage above is the damage dealt, rounded, so the attack preview (§19)
shows exactly what will happen, and the defender, usually asleep, wins or
loses on the position, never on a roll.

A worked example: a swordsman (35) attacks a spearman (25) fortified on a
hill across a river. The spearman's strength is 25 + 3 + 4 = 32, the
swordsman's 35 − 5 = 30. The spearman deals 32 and takes 28, every time. Bring
a second unit next to the hill and the swordsman is at 32: even.

### 11.3 Experience

None in the first version (D25).

### 11.4 Cities in combat

- A city has **200 HP**, +100 with Walls, +100 more with a Castle, +100 more
  with a Bastion (Industrial). It heals 20 a round.
- Its **strength** is the strength of its owner's best melee unit they can
  currently build, −10, or its garrison's if that's higher, +3 on hills, +5
  for each level of walls. So cities keep up with the era their owner is in.
- **A city with Walls shoots** once a round at anything within 2 tiles, at
  its strength, during its owner's turn.
- **Capture.** A city at 0 HP is taken by the next enemy melee unit that
  moves in. It loses 1 population and keeps its buildings, except walls,
  which drop a level (D27). Cities can't be razed.
- A city's tile can't be entered by an enemy while it has HP left.

---

## 12. Cities

### 12.1 Founding

A settler founds a city on the tile it stands on, if the tile is land (not
mountains), and at least four hexes from any other city: three clear tiles
between (D20). The city takes the settler's place, with population 1, and
claims the six tiles around it.

The capital is the first city, and gets +2 science, +2 production, +2
culture and +3 gold (its palace). Every player's capital is an **original capital** for
the rest of the match, whoever holds it (§18).

### 12.2 Territory and worked tiles

- A city's territory starts as the ring of six tiles around it, and grows
  **with its culture**: each time the city's culture reaches a threshold, it
  claims the best tile next to its border, by its focus, unless the player has
  pinned one (D18). The threshold rises with each tile.
- A city works tiles up to **three rings out** (36 tiles and its centre);
  its border can reach four rings, so a city with a lot of culture holds land
  it can't work, which keeps rivals off it (D20).
- A tile belongs to one city. A tile already held by someone else is skipped
  (taking tiles from a rival with culture is a candidate for a culture
  victory, later).
- **Each citizen works one tile.** The city centre is worked for free.
- **Citizens are placed automatically** by the city's focus — *Balanced*,
  *Food*, *Production*, *Science*, *Culture*, *Faith* or *Gold* — and the
  player can pin a citizen to a tile (D17).
- **Buying a tile.** A tile next to a city's border can be bought with gold
  (§12.8), for a price that rises with every tile the city holds: quicker than
  waiting for culture, and the way to grab the iron before the neighbour's
  border reaches it.

### 12.3 Yields

**Decided in rounds 1 and 2 (D15): six yields.**

| Yield | Where it goes | Where it mostly comes from |
|---|---|---|
| **Food** | The city's food box: growth (§12.4) | Grassland, rivers, coast |
| **Production** | The city's queue (§12.5) | Hills, forest |
| **Science** | The empire's research (§13) | Citizens, jungle, libraries |
| **Culture** | The city's borders, and the empire's traditions (§14) | Buildings, the palace, wonders |
| **Faith** | The empire's religion (§15), and buying religious units | Buildings, mountains, beliefs |
| **Gold** | The empire's treasury: buying, upgrades, upkeep (§12.8) | Coast, city centres, the palace, markets |

The game calls the religion yield **faith**, which reads more naturally on a
city ("+3 faith") than "religion" does (D39). Food and production stay in the
city that makes them; science, culture, faith and gold go to the empire.

A city gets the yields of every tile it works, plus:

- **Its centre**: the yields of its biome, raised to at least 2 food and 1
  production, plus 1 science, 1 culture and 1 gold.
- **Each citizen: +1 science.** Big cities are the scientists.
- Its buildings (§12.6) and wonders (D46).

### 12.4 Population, and the brakes on size

Each citizen eats **2 food** a round. The rest goes into the city's **food
box**.

- **Growth.** When the box holds 15 + 8 × *population* food, the city grows
  by one, and the box empties.
- **Starvation.** If the box would go below zero, the city loses a citizen and
  the box goes to half of what the new size needs.
- **Fresh water caps growth** (D19):

  | | Population cap |
  |---|---:|
  | Base | 4 |
  | Centre on a river or the coast | +3 |
  | Granary | +2 |
  | Aqueduct | +6 |
  | Sewer | +6 |

  A city at its cap stops filling its box. The land decides which cities
  become great: a dry hill town stays a town, a river city becomes the
  capital it ought to be.

A worked example: a capital on grassland beside a river. Its centre gives 3
food (2, +1 river). Its citizen works the river grassland next door for 3
more: 6 food against 2 eaten, +4 a round, so population 2 at about round 7
(it needs 23). At population 2 it works a forest too (+3 a round), so
population 3 comes at about round 17. By round 100 a well-placed capital is
around population 8; by round 300, 20 or more.

**Sprawl is braked three ways** (D19), without a happiness number:

- A **settler costs 1 population** and needs a city of 2.
- A **settler costs more** for every city the player has.
- **Every city past the fourth makes techs cost 3% more and traditions 8%
  more.** A wide empire still gets more of everything, but each new city
  adds a little less.

### 12.5 Production

- A city puts its production into the first item in its **queue**, which
  holds up to five items. What's left over carries into the next.
- **Repeat** keeps building the last item (a unit, usually) until told
  otherwise.
- **Switching** keeps the progress on the first item (D22).
- **Buying.** The first item in the queue can be bought outright with gold
  (§12.8).
- **An empty queue** turns production into food (one for every two) until the
  player chooses something. The "Next" button stops at it (§19).
- **Automate** lets the city choose its next item itself, by a priority the
  player picks: growth, military, science, culture, faith or gold. An automated city
  never stops the "Next" button.
- Units appear on the city's tile, or the nearest free one.

### 12.6 Buildings

Buildings do the job *Civilization*'s workers and tile improvements do
(decided in round 2, D16): instead of walking a unit to every hill to build a mine, the city
builds one Mine, and every hill it works gives more.

| Era | Building | Tech | Effect |
|---|---|---|---|
| Ancient | Monument | — | +2 culture |
| | Granary | Pottery | +2 food, +2 population cap |
| | Mine | Mining | +1 production on every worked hills tile |
| | Shrine | Mysticism | +2 faith |
| | Barracks | Bronze Working | Builds the melee and anti-mounted lines. Units here heal fully in a round |
| | Walls | Masonry | +100 HP, +5 strength, the city shoots (§11.4) |
| | Harbour | Sailing | Coastal only. +1 food, +1 production on every worked coast tile; works ocean; builds ships |
| | Library | Writing | +3 science |
| | Stable | Horseback Riding | Builds the mounted line |
| | Irrigation works | Irrigation | +1 food on every worked grassland beside a river |
| Classical | Workshop | Mathematics | +2 production. Builds the siege line |
| | Market | Currency | +3 gold |
| | Lumber mill | Construction | +1 production on every worked forest tile |
| | Temple | Philosophy | Needs a Shrine. +3 faith |
| | Amphitheatre | Drama | +3 culture |
| | Aqueduct | Engineering | +6 population cap |
| Medieval | Castle | Feudalism | Needs Walls. +100 HP, +5 strength |
| | Bank | Banking | Needs a Market. +4 gold |
| | University | Education | +4 science, +1 science on every worked jungle tile |
| | Observatory | Astronomy | +1 science for every mountain in the city's territory |
| | Cathedral | Theology | Needs a Temple. +4 faith, +1 culture |
| | Printing house | Printing | +3 culture, +2 science |
| Industrial | Factory | Industrialisation | Needs coal. +4 production, +1 on every worked hills tile |
| | Stock exchange | Economics | Needs a Bank. +6 gold |
| | Public school | Scientific Theory | +4 science |
| | Museum | Archaeology | +5 culture |
| | Sewer | Sanitation | +6 population cap |
| | Bastion | Metallurgy | Needs a Castle. +100 HP, +5 strength |
| Modern | Power plant | Electricity | +4 production, +2 science |
| | Research lab | Computers | +6 science |
| | Broadcast tower | Radio | +6 culture |
| | Launch pad | Rocketry | Needs aluminium. Lets the city build the mission's parts (§18) |

**Clearing forest** is a city project, not a building: with Construction, a
city can clear a forest tile in its territory. The tile becomes grassland and
the city gets some production back into its current item.

**Wonders** — one-of-a-kind buildings anyone can race for, each with a
bonus, and each the culture victory's natural raw material — are proposed for
Milestone B (D46).

### 12.7 What a city can build

A unit or building shows in a city's list once its tech is researched, with
what's still missing named on the row ("Needs a Stable", "Needs horses: all 4
in use"). The list teaches the player what to do next.

### 12.8 Gold

**Added in round 2.** Gold goes into the empire's **treasury**, not a city.

**Where it comes from:** worked coast tiles (+1 each), every city centre (+1),
the palace (+3), Gold ore and Pearls (§9.5), Markets, Banks and Stock
exchanges (§12.6), and cities set to the *Gold* focus.

**What it buys** (D48):

- **The first item in a city's queue**, outright, for 3 gold for every point of
  production still needed. One purchase a city a round. Wonders (D46) and the
  mission's parts (§18) can't be bought: they're races, and money shouldn't
  win them in one tap.
- **A tile** next to a city's border (§12.2).
- **Upgrades** (§10.3).
- **Upkeep** for units beyond the free allowance (§10.6).
- **Peace.** A peace proposal can carry gold either way (§16.1).

**No building maintenance** (D49). Buildings cost production once and nothing
after; upkeep falls on units only. That keeps one more number off every
building on a small screen, and keeps out *Civilization*'s spiral where a
poor empire sells the buildings that would have made it rich.

**Running out.** If the treasury would go below zero at the start of a turn,
the unit past the free allowance that is furthest from home is disbanded, and
the player is told. The "Next" button warns a round ahead whenever income is
below zero, so it never comes as a surprise.

**Pace.** Buying prices follow the production costs they replace, so they
scale with the pace; gold income, like every yield, doesn't (§6.1).

Faith still buys religion's units and buildings (§15); gold buys everything
else.

---

## 13. Research

### 13.1 How it works

Each player has one research target. Science from all their cities goes into
it each round, and what's left over carries into the next. The player can
choose a tech several steps away, and research goes through the ones on the
way by itself. A player with nothing chosen researches the cheapest tech they
can.

### 13.2 The tree

About ten techs an era, fifty in all, ending in Space Flight, which unlocks
the mission (§18). A sketch, to be drawn up properly once D40's eras are
settled:

| Era | Techs (what each mainly unlocks) |
|---|---|
| **Ancient** | Pottery (Granary) · Mining (Mine) · Mysticism (Shrine) · Archery (Archer) · Sailing (Harbour, Galley) · Horseback Riding (Stable, Horseman; reveals horses) · Bronze Working (Barracks, Spearman; reveals iron) · Masonry (Walls) · Writing (Library) · Irrigation (Irrigation works) |
| **Classical** | Iron Working (Swordsman) · Mathematics (Workshop, Catapult) · Construction (Lumber mill, clearing forest) · Shipbuilding (embarking, Quadrireme) · Philosophy (Temple, founding a religion) · Drama (Amphitheatre) · Engineering (Aqueduct, bridges) · Currency (Market) |
| **Medieval** | Feudalism (Pikeman, Castle) · Machinery (Crossbowman, Trebuchet) · Chivalry (Knight) · Education (University) · Astronomy (Observatory) · Theology (Cathedral, a second belief for your religion) · Printing (Printing house) · Navigation (ocean, Caravel, Explorer) · Gunpowder (Musketman; reveals niter) · Banking (Bank) |
| **Industrial** | Metallurgy (Cannon, Frigate, Bastion) · Rifling (Rifleman, Ranger) · Steam Power (Ironclad; reveals coal) · Industrialisation (Factory) · Military Science (Cavalry, Field gun) · Scientific Theory (Public school) · Sanitation (Sewer) · Archaeology (Museum) · Railways (units move twice as far along their own territory) · Economics (Stock exchange) |
| **Modern** | Combustion (Tank, Destroyer; reveals oil) · Ballistics (Artillery, Machine gun) · Replaceable Parts (Infantry, Anti-tank) · Electricity (Power plant) · Radio (Broadcast tower) · Steel (Battleship) · Computers (Research lab) · Rocketry (Launch pad; reveals aluminium) · Satellites (the satellite project) · Space Flight (the mission) |

Each era's techs cost about double the last era's. Railways is a stand-in for
roads, which without workers have no one to build them; it's worth a
decision of its own once the Industrial era is being balanced.

### 13.3 Knowledge spreads

A tech costs **10% less for every player you've met who already knows it**,
up to 50% (D40). It's how a player who's fallen behind catches up, and why
meeting people matters. It's also a little hidden state: a player can tell
roughly how many people they've met know a tech from its price, which is
fine, and close to what *Civilization IV* showed outright.

What a rival has researched is otherwise hidden (§17), except their era (§7.2).

---

## 14. Culture

Culture does two things (D38).

### 14.1 Borders

A city's own culture claims tiles for it (§12.2). Culture is what turns a
village into a region.

### 14.2 Traditions

The empire's culture also accumulates towards its next **tradition**: a
permanent bonus, picked from a branch, *Civilization V*'s social policies by
another name. Each pick costs more than the last, and each city past the
fourth adds to the cost (§12.4).

Five branches, one opening in each era:

| Branch | Opens in | For example |
|---|---|---|
| **Tradition** (the tall empire) | Ancient | +1 food in the capital; cities grow at 75% of the food |
| **Expansion** (the wide one) | Ancient | Settlers cost 25% less; new cities start with 2 population |
| **Piety** | Classical | +2 faith in every city with a Temple |
| **Order** | Medieval | Units upgrade without losing their round |
| **Enterprise** | Industrial | Factories +2 production |

About five traditions a branch, and finishing a branch gives a bigger bonus.
A culture victory, later, would likely be "complete four branches", or
tourism on top of it (§18).

---

## 15. Religion

Faith accumulates across the empire (D39). A proposal for the first version:

1. **A pantheon.** The first time a player's faith reaches a threshold, they
   pick a **pantheon belief** from a shared list — "+1 food from forests",
   "+1 faith from every mountain", "+2 culture from Monuments". Each belief
   can be held by only one player, so the early picks are a race.
2. **A religion.** With Philosophy and a higher threshold, a player's next
   faith buys a **Prophet**, who founds a religion in a city with a Temple.
   There can be only as many religions as half the players, rounded up, plus
   one. The founder names it and picks a **founder belief** (for its
   founder, e.g. "+1 culture for every 4 followers") and a **follower belief**
   (for every city that follows it, e.g. "+2 faith from Shrines").
3. **Spreading.** A city follows whichever religion has the most **pressure**
   on it: from its own holy city if it has one, and from every city following a
   religion within ten hexes. **Missionaries**, bought with faith, convert a
   city outright and go on spreading.
4. **Buying.** Faith buys Missionaries, Prophets, and religious buildings
   (Shrine, Temple, Cathedral) outright. Gold can't buy any of these: faith
   is the only way to a religion.

There's no theological combat in the first version. A religious victory,
later, would be "your religion is followed by most of the cities of every
other player".

Which religions a player's cities follow is public on every city they can
see; a player's beliefs are public once they've met them. Faith totals are
hidden.

---

## 16. The other players, and everyone else

### 16.1 War and peace

A proposal (D29):

- Every pair of players is **at peace** or **at war**. Everyone starts at peace.
- **Closed borders at peace.** A unit can't enter another player's territory
  unless the two are at war. A unit inside a border when it expands is moved
  to the nearest tile it may stand on.
- **Declaring war** can be done on your turn against a player you've met. It
  takes effect **at the start of the next round**, and the other player is told
  at once by push notification. At eight players a round is most of a day, so
  nobody wakes up to find a war started and lost.
- **Making peace** is a proposal the other player answers on their turn, and
  can carry gold either way: tribute from the losing side, or a price for
  peace from the winning one (§12.8). Peace
  lasts at least 15 rounds (scaled by pace) before either side may declare war
  again.

With eight players, alliances and agreements matter more than they would at
two. Whether there are any beyond war and peace — open borders, shared
research, defensive pacts, teams — is D29.

### 16.2 Barbarians and tribal villages

- **Barbarian camps** sit on the map from the start, and new ones appear over
  time in land nobody can see (D30). Each has one defender from the era of
  the nearest player (§7.2). Every fifteen rounds a camp sends out a raider,
  which walks to the nearest city and attacks it. Taking a camp gives the
  nearest city of the player who took it some production.
- **Tribal villages** are one-time finds: the first unit to enter one gets one
  of some science, a free scout, +1 population in the nearest city, some faith,
  or the map revealed within five tiles. The result is chosen by the server and
  recorded on the command, so a replay shows the same find.
- Barbarians aren't a seat. They move after the last seat's turn (§5.1) and are
  at war with everyone.

### 16.3 A player who leaves

Over a match of months, this will happen in most eight-player games (§4.2), so
it needs more than one answer (D32):

- **The default: free cities.** A dropped player's cities become neutral,
  defending themselves and their garrisons, never expanding or attacking, and
  capturable by anyone. Their units are removed.
- **A new player can take the seat.** Before their cities turn free, the seat
  is offered by join code, as an open seat is today (`/join`), so a friend can
  step in and play on with the empire as it stands.

---

## 17. Fog of war and hidden information

Always on (D31). Every tile, for each player, is one of:

- **Unexplored.** They've never seen it. The client is told nothing about it,
  not even its biome.
- **Explored.** They've seen it before. They know its biome, rivers and
  resources (§9.5's revealed ones), and see any city there as it was when they
  last saw it.
- **Visible.** One of their units or cities sees it now. They see everything on
  it.

**Sight:** two tiles for a unit, three from hills, more for later recon and
ships. A city sees two tiles beyond its territory. Forest, jungle and
mountains block sight beyond them, except for a unit on hills looking over
forest or jungle.

What is hidden from a rival:

- the map they haven't explored, and the seed it came from;
- strategic resources revealed by a tech they don't have;
- every unit and city they can't see now, beyond what they last saw;
- their research (beyond their era, §7.2, and what §13.3's prices imply), city
  queues, food boxes, culture, faith and gold totals and incomes;
- whether a turn ended by itself or by hand (§5.2).

What is shared with every player who has met you: your name and colour, your
era, your number of cities, your score (§18), your traditions and beliefs,
and whether you're at war with them. When someone starts building the mission,
everyone is told (§18).

This is the same contract every game here keeps for hands and secret codes,
on a much bigger surface: every response, every command outcome, every
replay step and every push notification must be cut to what the viewer can
see. §23.4 lists the places, and the `croupier` is the reviewer for all of
them.

---

## 18. Winning

**Decided in round 1 (D5):** more than one way to win. Domination and
science now; culture and religion later. The host can turn any of them off
at setup.

1. **Domination.** Conquer every rival by force. Proposed (D36): hold every
   original capital, your own included, at the end of any round. A player
   whose capital has fallen still plays, and can win it back.
2. **Science: the mission.** Research Space Flight, then build the mission
   (D37): a Launch pad (needs aluminium), then three parts in any of your
   cities with a Launch pad — booster, habitat, engine — each a project that
   needs oil or aluminium. **Starting the first part tells everyone.** When the
   third is done the mission launches, and **arrives ten rounds later** (scaled
   by pace). If your capital falls before it arrives, the mission is lost. A
   science race with a target the others can hit, and a last ten rounds where
   everyone does.
3. **Culture** (later): perhaps four completed tradition branches, or a
   tourism race (§14.2).
4. **Religion** (later): your religion followed by most of the cities of every
   other player (§15).
5. **Score at the round limit** (D44). When the last round ends (300 at
   Standard), the highest score wins.

| Score | Points |
|---|---:|
| Each city | 5 |
| Each citizen | 1 |
| Each tech | 2 |
| Each era entered | 10 |
| Each tradition | 2 |
| Each wonder | 5 |
| Each original capital held (other than your own) | 10 |
| Each city following your religion | 1 |

Ties go to the later seat. A player with no cities and no settlers left is out:
their score stands, and they take no more turns.

The result screen should tell the match: each player's score and era over the
rounds (`LineChart`, `ChartTooltip`), the map at the end, and who took whose
capital and when.

---

## 19. A turn on a phone

A turn has to work one-handed on a phone held upright. The board fills the
screen inside `BoardZoom`; everything else is a sheet that comes up from the
bottom.

1. **Since you were last here.** The recap (§23.6): what grew, what finished,
   what your units did on their orders, what was seen moving, who declared war,
   who entered a new era, who founded a religion.
2. **The empire bar.** Across the top: the treasury and its income each round,
   science, culture and faith, each tappable for where it comes from. Income
   below zero shows in the bar before anything else.
3. **The "Next" button.** One button at the foot of the board, always in the
   same place, naming what needs the player: "Warrior near Ur needs orders",
   "Ur needs something to build", "Pick a tech", "Pick a tradition", "3 units
   can upgrade (60 gold)". Tapping it focuses the board on that thing and opens its
   sheet. When nothing's left it becomes **End turn**.
4. **A unit.** Tapping it shades how far it can go this round (as Realm Arena
   does) and, for a ranged unit, what it can hit. Tapping a tile inside the
   shading moves it there. Tapping one beyond draws the path with the round it
   arrives on each step, and a second tap confirms. Tapping an enemy shows the
   attack preview: the damage both ways, exactly (§11.2), and Attack. Its sheet
   holds its orders as `BuildRow`s.
5. **A city.** Its sheet, made of `Section`s: population and the food box, the
   focus (`OptionChoiceSection`), the queue (`BuildRow`s with cost, rounds and
   what's still missing, and **Buy** with its gold price), automation, and its
   buildings. Tapping a worked tile pins a citizen; tapping one beyond the
   border offers to buy it.
6. **Research, traditions and religion.** One sheet each, each a list of
   `BuildRow`s by era or branch.
7. **The world.** Everyone you've met: era, score, city count, religion, war or
   peace, and the buttons to declare war or propose peace (with gold, if you
   like).

Anything with a name has an `InfoButton` opening an `InfoModal`. The game
guide and the tutorial (§23.8) carry the rest. When it isn't the player's
turn, the sheets stay readable through `ReadOnlyPanel`.

---

## 20. Decisions to make

Round 1 settled ten decisions, in whole or in part (§21.1), and round 2 three
more (§21.2). Round 3 reopened one of round 1's (§21.3). What's left is below:
first the reopened time model, then round 2's questions (still open), then the
two gold raised, then the rest of round 1's in the order they block work. Each lists its options and a recommendation; the
recommendation is what the body assumes.

### 20.1 Reopened in round 3: the time model

**D3. Who moves when?** (§5)
*Options* (§5.4): (A) one after another; (B) all at once, live; (C) at war in
order, otherwise at once; (D) phases by conflict; (E) orders, then resolve;
(F) live economy, sealed war; (G) rounds on a deadline, on top of B, C or E;
(H) one after another with prepared turns, on top of any of them.
*Recommendation* (§5.8): C, with §5.7's four fairness rules, on a set of
active seats built as a platform feature — with H and §5.2 on top, G as a host
option, and Milestone A built as A on today's engine. E is the runner-up.
*Round 1 chose A;* round 3 reopened it. The body outside §5 still assumes A,
and §5.8 lists what changes if C is taken.

### 20.2 Round 2's questions, still open

**D35. How long, in real time, can an eight-player match be?** (§4)
At four check-ins a day, an eight-player round is about a day, so a 300-round
match is about a year. *Options:* (a) accept it: Day of Dominion is an epic
played over months, and the turn timer and §5.2 are how a keen table goes
faster; (b) default eight-player matches to Blitz or Quick pace and a short
turn timer, so the usual match is one to three months; (c) cap the player
count lower at the longer paces (say, eight at Blitz and Quick, six at
Standard, four at Epic); (d) revisit simultaneous turns for big tables.
*Recommendation:* (b) with turns that end themselves (§5.2): the setup screen
shows the expected length of the match as the host picks the pace, the player
count and the timer, using §4's table, so nobody starts a year-long match by
accident.

**D36. What exactly is domination?** (§18)
*Options:* (a) hold every original capital (*Civilization VI*); (b) eliminate
every rival: take every city; (c) hold a share of the world's land or people.
*Recommendation:* (a). With eight players, (b) means hunting down the last
fishing village of the eighth player, long after the match was decided.

**D37. What is the science mission?** (§18)
*Options:* (a) research the last tech and win; (b) a public project after the
last tech; (c) a Launch pad, three public parts, and a voyage of ten rounds
during which your capital must hold.
*Recommendation:* (c). It gives everyone else a target and a deadline, which
is what makes a science victory something the others can fight.

**D38. What does culture do?** (§14)
*Options:* (a) borders only; (b) borders and traditions (*Civilization V*'s
policies); (c) borders and a civics tree alongside the tech tree
(*Civilization VI*).
*Recommendation:* (b). A second tree as big as the tech tree is too much to
show and to balance on a phone; traditions give culture a choice of its own
in a list that's easy to read.

**D39. What does religion do, and what's the yield called?** (§15)
*Options:* (a) pantheons only; (b) pantheon, founding a religion, passive
spread and missionaries; (c) (b) plus theological combat, inquisitors and the
rest. *Also:* call the yield "faith" in the game, or "religion".
*Recommendation:* (b), and "faith". Faith buys religion's units and buildings,
and gold can't, so a religion is something a player has to choose to build.

**D40. Which five eras, and what does being in one do?** (§7)
*Options for the five:* (a) Ancient, Classical, Medieval, Industrial, Modern;
(b) Ancient, Medieval, Renaissance, Industrial, Modern (Classical folded into
Ancient); (c) Classical, Medieval, Renaissance, Industrial, Modern (no
Ancient). *For entering one:* (a) your first tech from it; (b) a share of its
techs (say, three); (c) every tech of the era before. *For what it does:* art,
public era, barbarians, tradition costs (§7.2). *And:* do techs cost less for
each player you've met who knows them (§13.3)?
*Recommendation:* (a) Ancient to Modern; (a) your first tech; §7.2's effects;
and yes to knowledge spreading, which is the catch-up eight players moving at
their own pace need.

**D41. How do units upgrade?** (§10.3)
*Options:* (a) for gold, in your own territory, ending the unit's move
(*Civilization*); (b) for a round of retraining in your own territory, no
cost; (c) automatically and free, the moment the tech is researched; (d) as a
project in a city ("Retrain the garrison"), paid in production.
*Recommendation:* (a), with "Upgrade all". *Changed by round 2:* with gold in
the game it's the natural price, and a purse rather than production's flow.
(c) makes research too strong and lets an army upgrade in the middle of a
war's front.

**D42. How do strategic resources work?** (§9.5)
*Options for how much a source gives:* (a) one source unlocks unlimited units;
(b) each source supports a fixed number of units (four); (c) a stockpile that
grows each round and is spent when a unit is built (*Civilization VI*). *For
which:* §9.5's six, or fewer. *For seeing them:* always visible, or revealed by
a tech.
*Recommendation:* (b), §9.5's six, revealed by a tech. (a) makes the second
iron mine worthless; (c) is another number to track per resource.

**D43. Which paces?** (§6)
*Options:* (a) §6.2's four: Blitz, Quick, Standard, Epic; (b) three, without
Epic; (c) a free multiplier the host sets.
*Recommendation:* (a), and pace scaling costs, thresholds and durations in
rounds, never movement or combat.

**D44. Is there a round limit?** (§18)
*Options:* (a) yes, set by the pace, with the score deciding; (b) yes, but the
host can turn it off; (c) no: a match ends only with a victory.
*Recommendation:* (a). Over months, a match with no end is a match nobody
finishes, and the platform abandons games that stall.

**D45. Who sits at the table?**
*Options:* (a) 2–8 people; (b) 2–8, with computer players able to fill seats;
(c) teams.
*Recommendation:* (a) for the first version. Eight people is a lot to gather,
and computer players would make every match fill, but an AI that plays
fifty techs, religion, culture and war is a project as big as the game
itself. It's the most likely thing to want next.

**D46. Wonders?** (§12.6)
*Options:* (a) none; (b) a handful of wonders an era, one-of-a-kind, each with
a bonus; (c) (b) plus national wonders, one per empire.
*Recommendation:* (b) in Milestone B. They're the obvious use for culture, a
race every player can see coming, and what a culture victory would be built
on.

**D47. The sky: air units and nuclear weapons?** (§10.2)
*Options:* (a) none: the Modern era is fought on land and sea; (b) fighters
and bombers based in cities, with ranges, but no nuclear weapons; (c) all of
it.
*Recommendation:* (a) for the first version. Air units are a game layer of
their own (bases, ranges, interception) on a screen already full; the Modern
era has tanks, artillery and battleships without them.

### 20.3 Gold: new questions

**D48. What does gold buy?** (§12.8)
*Options:* any mix of (a) a city's current item outright; (b) tiles; (c) unit
upgrades (D41); (d) unit upkeep (D49); (e) peace and other deals (D29); (f)
trade routes between cities, earning gold.
*Recommendation:* (a) to (e), with wonders and the mission's parts never for
sale. Trade routes (f) are a system of their own — trader units, routes,
pillaging — and wait for a later milestone. *Also:* buying at 3 gold a point
of production, one purchase a city a round.

**D49. What costs gold every round?** (§10.6, §12.8)
*Options:* (a) units beyond the free allowance only; (b) units and buildings
(*Civilization V*/*VI*'s maintenance); (c) nothing: gold is only spent when the
player chooses.
*Recommendation:* (a). Upkeep on units is the brake that keeps armies, and so
late turns, a sensible size. Upkeep on buildings is a number on every building
and a way for a poor empire to get poorer. *Also:* a treasury that runs dry
disbands a unit, with a round's warning.

### 20.4 Still open from round 1, before the first version's rules

**D7. Hex orientation and the look** (§9.1, §22).
*Options:* (a) pointy-topped hexes, squashed to a tilted-table view; (b)
flat-topped; (c) a flat top-down map with no standing art; (d) true isometric
hexes with heights.
*Recommendation:* (a).

**D8. Map size and shape** (§9.6).
*Options:* (a) §9.6's sizes by player count, taller than wide, no wrap; (b) the
host picks small, standard or large; (c) a map that wraps east to west.
*Recommendation:* (a), with (b) once balance is known. *Changed by round 1:*
about 180 land hexes a player, up from 120, for a longer match with more
cities.

**D9. Map generation** (§9.7).
*Options:* (a) procedural from a seed, with fairness checks; (b) hand-made maps;
(c) (a) with several map types.
*Recommendation:* (a). *Changed by round 1:* a couple of continents and islands,
not one continent, because five eras want the ocean.

**D10. Which biomes?** (§9.2)
*Options:* (a) the eight in the brief; (b) + plains and desert; (c) + tundra,
snow and marsh.
*Recommendation:* (a), as a registry so (b) is an entry each. With a map of
thousands of hexes, plains and desert are the most likely first additions.

**D11. One biome a tile, or terrain with features?**
*Options:* (a) one biome a tile; (b) a base with a feature on top and hills as a
height.
*Recommendation:* (a).

**D12. Mountains: impassable, or just expensive?**
*Options:* (a) impassable; (b) cost 3, ending the move; (c) passable by some
units.
*Recommendation:* (a), with mountains giving faith and science to the city
they belong to (§9.2), so they're worth having in a territory.

**D13. What rivers do** (§9.3).
*Recommendation:* crossing ends the move until Engineering, −5 attacking across,
+1 food beside, fresh water for growth.

**D14. Water** (§9.4).
*Options:* (a) coast only; (b) coast early, ocean from Navigation; (c) no water
units.
*Recommendation:* (b). *Changed by round 1:* five eras need the oceans, so (a)
is no longer enough.

**D17. Who places citizens?** (§12.2)
*Recommendation:* automatic by focus, with pinning. *Changed by round 1:* the
focuses now include culture and faith.

**D18. How territory grows** (§12.2).
*Options:* (a) a tile each time the city grows; (b) a whole ring at once; (c) by
the city's culture.
*Recommendation:* (c). *Changed by round 1:* culture is now a yield, so it should
do the job it does in *Civilization*.

**D19. What brakes growth and sprawl?** (§12.4)
*Options:* (a) population caps by fresh water and buildings, rising settler
costs, and techs and traditions costing more for each city past the fourth;
(b) a happiness yield; (c) nothing.
*Recommendation:* (a). *Changed by round 1:* the per-city cost on techs and
traditions is new, because a 300-round match gives a wide empire far longer to
snowball.

**D20. How close can cities be, and how far do they reach?**
*Options:* (a) three apart, two rings; (b) four apart, working three rings,
borders to four; (c) four apart, five rings of border (*Civilization VI*).
*Recommendation:* (b). *Changed by round 1:* a city grows for 300 rounds, not
70, and needs the room. Three rings is still a city's land on screen around it.

**D21. Resources.** Bonus resources and strategic ones are settled; how
strategic ones work is now D42.

**D22. Production rules** (§12.5).
*Recommendation:* a queue of five, repeat, progress kept on a switch, an empty
queue turns production into food, and automation. *Changed by round 1:* repeat
and automation are new, for the longer match. *Changed by round 2:* buying
with gold is now possible, and is D48.

**D25. Promotions.** Upgrades are settled (D41 is how). Still open: experience
and promotions. *Recommendation:* none in the first version, the first thing
after. Upgrades keep promotions once they exist.

**D26. Unit upkeep** (§10.6).
*Recommendation:* two free units a city, 1 gold each a round beyond (2 from the
Industrial era). *Changed by round 2:* paid in gold rather than production
(D49).

**D27. Capturing cities** (§11.4).
*Recommendation:* capture only, losing 1 population and a level of walls.

**D28. Zones of control and closed borders** (§10.1, §16.1).
*Recommendation:* both. *Changed by round 1:* closed borders no longer serve
simultaneous turns, but they still stop a "friend" walking an army to your
capital before declaring war.

### 20.5 Still open from round 1, before Milestone B

**D29. Diplomacy** (§16.1).
*Options:* (a) war and peace only; (b) + open borders, research agreements and
defensive pacts; (c) + permanent teams set at setup.
*Recommendation:* (a) first, then (b). *Changed by round 1:* at eight players,
the case for (b) is much stronger than at four. *Changed by round 2:* gold can
change hands in a peace proposal from the start (§16.1), and gives (b)'s deals
a currency.

**D30. Barbarians and villages** (§16.2).
*Options:* (a) static camps that send raiders; (b) camps that appear over time
in unseen land; (c) none.
*Recommendation:* (b). *Changed by round 1:* over 300 rounds, a fixed set of
camps is cleared by round 50 and never matters again.

**D31. Fog of war** (§17).
*Recommendation:* always on.

**D32. A player who drops out** (§16.3).
*Options:* (a) free cities; (b) the seat offered to a new player first, then
free cities; (c) their empire vanishes.
*Recommendation:* (b). *Changed by round 1:* in a match of months, someone leaves
in most games.

**D33. When do standing orders move?**
*Recommendation:* at the start of their owner's turn. *Changed by round 1:* with
turns one at a time there's no shared start of round to move them at, and the
start of the owner's turn is when they'd look.

### 20.6 Can wait for a prototype

**D34. Rendering and art** (§22.2).
*Recommendation:* prototype at the eight-player map size (2,760 hexes) on a
mid-range phone before anything else is drawn. *Changed by round 1:* the
eight-player map is three and a half times the size round 1's was, which makes
a canvas for the ground (§22.2) close to certain.

### 20.7 Other numbers to confirm

Sight, movement, the advantages in §11.2, the growth formula, the population
caps, every strength in §10.2, the pace multipliers, the score table, the four
units a source supports, the knowledge-spread discount, the per-city cost of
techs and traditions, and the gold prices (3 a point of production to buy, 2 a
point of difference to upgrade, the rising price of a tile). And the damage
curve itself: *Civilization VI*'s is the starting point, but any curve that
turns a difference in strength into damage keeps D24's promise. They want a balance pass with a
simulator over the rules module before anyone plays a match that lasts months.

---

## 21. Questions and answers

### 21.1 Round 1

1. **Working title (D1):** *Day of Dominion.*
2. **Players (D2):** 8 players. (Read as *up to* eight; D45 asks who fills the
   seats.)
3. **Time model (D3):** turns are taken one by one.
4. **Match length (D4):** the match could be up to 300 rounds or more. Game pace
   could be selectable by the users, scaling resources to speed up or slow down
   the game. (§6; D35, D43 and D44 follow from it.)
5. **Victory (D5):** there may be multiple win conditions. Domination is
   conquering all opponents with military. Science is getting to the end of the
   tech tree and then conducting some kind of mission. There may be culture or
   religious victories at some point. (§18; D36 and D37 follow.)
6. **Eras (D6):** five flexible eras, but not everyone needs to be in the same era
   at once: it's driven by their tech tree research. (§7; D40 follows.)
7. **Upgrades (D25, in part):** units upgrade through research rather than eras.
   (§10.3; D41 follows.)
8. **Yields (D15):** food, culture, science, production, religion. (§12.3; D38 and
   D39 follow.)
9. **Strategic resources (D21, in part):** there will also be various strategic
   resources which are required for specific units. (§9.5; D42 follows.)
10. **Stacking (D23):** one military unit per tile, plus one civilian.

### 21.2 Round 2

1. **Gold (D15, extended):** let's include gold as a resource as well. (Read as a
   sixth yield, a currency in the treasury, alongside a Gold ore tile resource;
   §12.8. D48 and D49 follow, and D22, D26, D29, D39 and D41 change.)
2. **Workers or buildings (D16):** agree with city buildings. (§12.6.)
3. **Combat (D24):** not random combat; it should be strength and advantage
   based. (§11.2.)

§20.2's questions (D35–D47) are still to come, with D48 and D49.

### 21.3 Round 3

1. **The time model (D3), reopened:** "I think I decided D5 [D3] 'one turn at
   a time' too quickly. Are there other options? Could they be implemented on this
   platform? Civ has options like simultaneous turns, but it means the fastest
   clicker has an advantage. In our case the last person to take a turn would
   take two in a row. Hybrid is another option where players who are at war
   have to take turns sequentially, otherwise it's all simultaneous. Any other
   options?" (§5.3–§5.8 answer it; D3 is open again in §20.1.)

### 21.4 Round 4

To come.

---

## 22. Presentation: the isometric hex board

### 22.1 The look

A **tilted-table hex map** (D7): pointy-topped hexes squashed vertically to
about two-thirds of their height, so the board reads as a table seen from an
angle, the way *Civilization V* and *VI* look. Flat biomes (grassland, coast,
ocean) are flat tiles; hills, forest, jungle and mountains carry art that
stands up out of the tile and overlaps the tile behind it. Everything is drawn
from the back row to the front.

- **Rivers** are drawn along the hex edges they run on, over the ground and
  under the standing art, wider towards the sea.
- **Borders** are a line in the owner's colour just inside every edge where
  the territory changes hands.
- **Fog.** Unexplored tiles are blank parchment. Explored tiles that aren't
  visible are faded, with any city shown as last seen.
- **Cities** are art that grows with population and changes with their owner's
  era (§7.2), with a name banner carrying their size, religion and what they're
  building. Names go through `MapLabelLayer`.
- **Units** are figures standing on their tile on a base in their owner's
  colour, with a health bar when hurt, drawn for the unit's era. A move plays
  back over the board on the shared playback clock (`usePlayback`).

No rotation: the art needs drawing once rather than six times.

### 22.2 How it's drawn

- **Projection.** For a pointy-topped hex of size *s* at axial (*q*, *r*):
  *x* = *s* × √3 × (*q* + *r* / 2), *y* = *s* × 1.5 × *r* × *k*, with the
  squash *k* about 0.65. The inverse, with hex rounding, gives the tile a tap
  lands on; the standing art never takes the tap, the ground under it does.
- **Where it lives.** The hex geometry belongs in a pure helper in
  `src/utils/ui/` beside `isometric.ts` (which is squares only), and
  Settlements & Cities' hex maths should move onto it rather than the app
  keeping two (§3).
- **Drawing 2,760 hexes.** Far too many to be one SVG element each with its art
  on a phone. The likely shape: the ground (biomes, rivers, borders, fog) drawn
  to a canvas, only the part in view, from a single tile sheet (as Kingdom
  Builder's atlas, `npm run kb-atlas`); units, cities, labels and the selection
  in SVG over it, so `MapLabelLayer`, the playback clock and the tap handling
  work as they do elsewhere. That's D34's prototype.
- **Art.** Each biome needs a few variants so the map doesn't look tiled.
  Hand-drawn art goes through `/art-masters` and `npm run optimise-art`. Unit
  figures for five eras and eight lines are about forty figures: Realm Arena's
  code-modelled pipeline, rendered in six hex directions, is the only way that's
  affordable, and simple tokens are the way to begin.

### 22.3 Finding your way round a big map

`BoardZoom`'s fit step shows the whole map, which at eight players is a hex a
few pixels wide. The board should open on what needs the player (the "Next"
button's first item), use `focus` to glide between the things "Next" picks,
and carry a **minimap** — the explored world in miniature, tap to jump —
rather than relying on "fit".

---

## 23. Fit with the platform

### 23.1 Where things go

A new game folder, `src/games/DayOfDominion/`, with its `meta.ts`, rules
(`DayOfDominionLogic.ts`), models, board components, `guide.ts`,
`tutorial.ts` and `achievements.ts`, wired into the registries
`ARCHITECTURE.md` §12 and [`new-game.md`](../new-game.md) list.

### 23.2 The engine as it is

Turns one at a time (§5) are the platform's own shape: one active seat,
`CheckEndTurn` moving it round `turnOrder`, the turn timer and the cron sweep,
the `YourTurn` push, the recap and the undo hold. Nothing in the engine has to
change for the turn order. What has to change is the size of a match (§23.7).

### 23.3 Commands

The player's commands: `MoveUnit` (a path), `Attack`, `SetUnitOrder`,
`UpgradeUnit` (and all), `FoundCity`, `SetQueue`, `SetFocus`, `SetAutomation`,
`PinCitizen`, `ClearForest`, `SetResearch`, `PickTradition`, `PickBelief`,
`FoundReligion`, `SpreadReligion`, `BuyWithFaith`, `BuyWithGold`, `BuyTile`,
`DeclareWar`,
`ProposePeace`, `AnswerPeace` and `EndTurn`.

Server-only commands, recorded on the history like `PlayerDropped` so a replay
runs them at the same moment: **the empire moving on** at the start of each
turn (§5.1), **the world moving** after the last seat (barbarians, the round
count), and **the turn ending by itself** (§5.2).

Every move is its own command and goes to the server at once, because any move
can reveal the map, and only the server knows what's there. The board should
move the unit straight away and settle when the answer comes.

### 23.4 Hidden information

`CreateDataResponse(viewerId)` cuts the state to what that player can see
(§17): their explored tiles only, the resources their techs reveal, their own
units and cities, rivals' units in sight, rivals' cities as last seen.
`outcomeFor` cuts a command's outcome the same way. The replay adapter must do
it for every step of the recap, and push copy must never name something the
recipient hasn't seen. The map seed never leaves the server.

### 23.5 Timers, timeouts and dropouts

- **The turn timer** (`TurnTimerSelect`) times each player's turn. When it runs
  out, a timeout adapter (`ITurnTimeoutAdapter`) ends it for them: standing
  orders carry on, units without orders skip, an empty queue keeps making food,
  research and choices pick the first option.
- **Dropping out** (§16.3). After the platform's run of missed turns (three
  today), the dropout adapter (`IPlayerDropoutAdapter`) either opens the seat to
  a new player or turns the player's cities free. Offering a seat that's already
  in play is new to the platform: today a join code only fills a seat before a
  game starts.

### 23.6 Undo and the recap

- **Undo** ([`undo.md`](../undo.md)) fits the choices that reveal nothing: a
  move that showed no new tile and met nobody, a queue, a focus, a research
  pick. A move that revealed something, an attack, a tribal village, a belief
  or a tradition picked, and founding a city can't be undone.
- **"Since you were last here"** is where an asynchronous *Civilization* lives
  or dies. At eight players it covers seven other turns and the world's; it
  needs to lead with what matters (an attack, a war, a city lost) and fold the
  rest away.

### 23.7 Size and speed: the platform piece a long match needs

Today a game's whole `commandHistory` lives in its document, and the recap and
match review replay it from the start. A long match breaks both:

- **The document.** At eight players, 300 rounds and about fifteen commands a
  turn, that's 36,000 commands. At a few hundred bytes each, that's around
  10 MB in one document, against MongoDB's 16 MB limit, and every save writes
  it back.
- **Replay.** Replaying 36,000 commands, with pathfinding and fog on every step,
  to show someone the last day's turns isn't possible inside a request.

So before matches get long, the platform needs **the command history kept
outside the game document** and **snapshots** every so often (every round,
say) that a recap replays from, rather than round one. That's an engine change
for every game, not a Day of Dominion special, and it wants its own design
document and the `gremlin`'s eye. Two-player matches on Blitz in Milestone A
(§25) stay well inside today's limits, so it doesn't block starting.

The state itself is fine: the map is under 10 KB, each player's explored tiles
a bitset of about 350 bytes.

Balance numbers will change while matches are running for months. Rule
changes that would alter a match in play go behind a command version
([`command-versions.md`](../command-versions.md)).

### 23.8 What every game here brings

A game guide (`GAME_GUIDES`), a guided tutorial (`GAME_TUTORIALS`) — this game
needs one more than any other here — three to six achievements, a share card
(`npm run icons`), and its line in "What's new" when it ships.

---

## 24. Out of scope for the first version

- Trade routes, and building maintenance (D48, D49).
- Happiness or amenities (population caps and per-city costs do that job,
  §12.4).
- Workers and tile improvements (buildings do that job, §12.6).
- Promotions and experience (D25).
- Air units and nuclear weapons (D47).
- Diplomacy beyond war and peace (D29).
- Culture and religious victories (§18), theological combat (§15).
- Computer players (D45) and city-states.
- Map types beyond continents and islands; wrapping; rotating the view.
- Themes ([`game-themes.md`](../game-themes.md)).

---

## 25. Implementation sketch

Not a plan yet; a plan follows once §20 is answered. The order the pieces want:

**Milestone A — two empires, Ancient and Classical.** Two players, Blitz pace,
on the engine as it is.
1. The hex helper and a board that draws a generated map, with the minimap and
   tap-to-tile, built to D34's prototype.
2. The generator with its fairness checks, and the fog.
3. Units moving, with costs, rivers, zones of control and standing orders.
4. Cities: founding, culture borders, worked tiles, growth, queues.
5. Research through two eras, the buildings and units in them, upgrades,
   horses and iron.
6. Combat and capturing cities.
7. Domination and the round limit; the result screen.
8. The timeout and dropout adapters; the recap; turns that end themselves.
9. Guide, tutorial, achievements, share card; then the game library.

**Milestone B — the long match.**
1. The command history out of the game document, and snapshots (§23.7): a
   platform piece with its own design document.
2. Up to eight players, the paces, war and peace.
3. Traditions and religion.
4. The Medieval, Industrial and Modern eras, ocean, the later resources,
   wonders, the mission.
5. Barbarians and tribal villages; taking over a dropped seat.

**Milestone C — after that.** Culture and religious victories, promotions,
diplomacy, air units, the art pass, and perhaps computer players.

**The riskiest parts**, worth a prototype before the rest is built on them:
drawing a 2,760-hex map smoothly on a phone (§22.2), whether a late-game turn
really stays short (§4.3), and the history and replay at 36,000 commands
(§23.7).
