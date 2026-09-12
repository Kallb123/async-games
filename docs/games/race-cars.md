# Race Cars — Game Design Document

**Genre:** Racing / gear-management push-your-luck
**Players:** 2–6 (competitive, free-for-all)
**Play time:** 30 minutes at a table; a Sprint is ~12 turns a driver asynchronously
**Age:** 8+
**Complexity:** Light-medium (approx. 2.2 / 5)

---

## Contents

- [1. High Concept](#1-high-concept)
- [2. Design Pillars](#2-design-pillars)
- [3. Player Experience Goals](#3-player-experience-goals)
- [4. Objectives](#4-objectives)
  - [4.1 Winning](#41-winning)
  - [4.2 Classification](#42-classification)
  - [4.3 Nobody is eliminated](#43-nobody-is-eliminated)
- [5. Components Manifest](#5-components-manifest)
  - [5.1 The circuit](#51-the-circuit)
  - [5.2 Ashcombe Park](#52-ashcombe-park)
  - [5.3 The cars](#53-the-cars)
- [6. Setup Procedure](#6-setup-procedure)
- [7. Core Gameplay Loop](#7-core-gameplay-loop)
- [8. Gears and the Dice](#8-gears-and-the-dice)
  - [8.1 The gear table](#81-the-gear-table)
  - [8.2 Shifting](#82-shifting)
  - [8.3 Why Ashcombe is a five-gear circuit](#83-why-ashcombe-is-a-five-gear-circuit)
- [9. Movement, Lanes and Blocking](#9-movement-lanes-and-blocking)
- [10. Corners and the Stop Rule](#10-corners-and-the-stop-rule)
- [11. Wear: Tyres, Brakes, Gearbox](#11-wear-tyres-brakes-gearbox)
- [12. Slipstream](#12-slipstream)
- [13. Spins and Recovery](#13-spins-and-recovery)
- [14. Oil Spills — the optional module](#14-oil-spills--the-optional-module)
- [15. Turn Order and Race Distance](#15-turn-order-and-race-distance)
- [16. Systems Analysis](#16-systems-analysis)
  - [16.1 The three economies](#161-the-three-economies)
  - [16.2 The corner is the whole game](#162-the-corner-is-the-whole-game)
  - [16.3 Tension curve](#163-tension-curve)
- [17. Known Failure Modes & Mitigations](#17-known-failure-modes--mitigations)
- [18. Edge Cases & Adjudication](#18-edge-cases--adjudication)
- [19. Accessibility & Table Presence](#19-accessibility--table-presence)
  - [19.1 Can the cars be emoji?](#191-can-the-cars-be-emoji)
  - [19.2 Reading a 214-space board on a phone](#192-reading-a-214-space-board-on-a-phone)
- [20. Iteration Hooks](#20-iteration-hooks)
- [21. Glossary](#21-glossary)
- [22. Quick Reference](#22-quick-reference)
- [23. Implementation Plan](#23-implementation-plan)
  - [23.1 What the engine already gives us](#231-what-the-engine-already-gives-us)
  - [23.2 What the engine does not give us yet](#232-what-the-engine-does-not-give-us-yet)
  - [23.3 Deviations from this document](#233-deviations-from-this-document)
  - [23.4 State and command surface](#234-state-and-command-surface)
  - [23.5 Turn recap & planning](#235-turn-recap--planning)
  - [23.6 The art](#236-the-art)
  - [23.7 The PRs](#237-the-prs)
  - [23.8 Testing](#238-testing)

---

## 1. High Concept

Six cars, one circuit, and a gearbox that decides how much of the next corner
you are allowed to survive. Each gear rolls a different die with a different
span: first gear moves you one or two spaces, fifth moves you eleven to twenty.
You pick the gear *before* you roll, which means you are not betting on a
number — you are betting on a **range**, and the corner ahead has a fixed
number of spaces in which that range has to land.

Everything else in the game is what you spend when the range misses: tyres to
survive an overshoot, brakes to shorten a roll that came up too big, gearbox to
drop two gears at once when the corner arrived sooner than you planned.

**One-line pitch:** *Choose the die before you know the number, and pay for the
difference.*

---

## 2. Design Pillars

| Pillar | Description | How it manifests |
|---|---|---|
| **The gear is the decision** | The whole turn is one choice made before any information arrives. Everything after the roll is damage control. | Six gears, six different dice, one shift per turn |
| **Corners are the clock** | A straight is travel; a corner is where races are won and lost. The field bunches at every corner, so nobody ever gets away. | Stop counts, overshoot cost, gears forced down |
| **Pay, don't die** | Every mistake has a price in a wear pool rather than an exit from the race. A driver 20 spaces down is still driving. | Tyres / brakes / gearbox; no elimination (§4.3) |
| **Everything is public** | Positions, gears, wear, slicks. There is no hidden information anywhere in this game, so there is nothing to bluff and nothing to remember. | One open DTO (§23.4), no redaction |
| **One tap, one turn** | An asynchronous turn is a gear, a roll and a destination. It must be possible to take a good turn in fifteen seconds on a phone. | Pick the end space, not the path (§9) |

The fourth pillar is the one that shapes the code more than the design. Every
other multiplayer game in this repo hides something — a hand, a ticket, a secret
code — and pays for it in the response builder. Race Cars hides nothing, and
§23.4 spends its redaction budget on *proving* that rather than implementing it.

---

## 3. Player Experience Goals

1. **The grid (turn 1): a standing start.** Six cars in three staggered rows,
   everyone in gear 0, and the only decision is how hard to launch.
2. **First corner: the bunching.** Ashcombe Hairpin owes two stops, so the
   field compresses into five rows of tarmac and the pole-sitter's advantage
   evaporates. This is the moment the game teaches that a lead is temporary.
3. **The Mile: the gear ladder.** Four turns of shifting up, each one a
   commitment, with the knowledge that the top of the ladder cannot stop in
   time for Gravel Bend.
4. **The gamble that defines the race.** Somebody takes fifth into Gravel Bend,
   rolls 17 instead of 12, and pays five tyres to stay on the road — or spins,
   and (with oil on) leaves the mess behind for whoever is following.
5. **The last corner.** The Kink owes one stop, and it is the last place the
   order can change. Everything after it is a drag race to the line.

**Target race length:** ~12 turns a driver for a Sprint, ~22 for a Grand Prix.
That is deliberately in the same band as Train Time and Outbreak rather than
shorter — a race that ends before the field has bunched twice is a dice roll,
not a race.

---

## 4. Objectives

### 4.1 Winning

**The first car to cross the finish line having completed the race distance
wins**, immediately, in the middle of the round. There is no tie-break, because
crossing is an event in play order rather than a state the board settles into.

### 4.2 Classification

Everybody else is classified by **track progress** at the moment the winner
crosses — laps completed, then row, then the previous round's order for an exact
tie (§15). Classification is not a tie-break for the win; it is what the result
page and the match record report, and it is what makes finishing fourth instead
of sixth worth driving for once the win is gone.

### 4.3 Nobody is eliminated

A car that runs every wear pool to zero keeps racing. It simply cannot pay for
anything any more: it must take every corner in a gear small enough to stop
inside it, it can never shorten a roll, and it can never drop two gears at once.
It gets **slow**, not dead.

This is a deliberate departure from the genre, and it is an asynchronous-play
decision as much as a design one. A game where a bad roll on day three removes
a player from a fortnight-long race is a game they will not start again. The
spiral is still real — §13's spins compound — it just ends in last place rather
than in an empty seat.

---

## 5. Components Manifest

| Component | Qty | Notes |
|---|---|---|
| Circuit board | 1 | Ashcombe Park; 78 rows, 214 spaces (§5.2) |
| Cars | 6 | One per driver, each carrying a race number |
| Gear dice | 6 | d4, d6, d8, d12, d20, d30 — one per gear (§8.1) |
| Wear tokens | 12 per car | Split across tyres / brakes / gearbox by the chosen spec (§11) |
| Oil slicks | 12 | Optional module only (§14); the cap is a rule, not a component shortage |
| Gear indicator | 1 per car | Current gear, 0–6 |

### 5.1 The circuit

A circuit is a **loop of rows**. Each row is 2 or 3 **lanes** wide, and a
**space** is one (row, lane) pair. Rows are numbered from the start line and
wrap: the row after the last row is row 0 again, and crossing that boundary
completes a lap.

Movement is always forward by whole rows. From a space you can step to the same
lane in the next row, or to either adjacent lane in the next row — a car changes
lane *while* moving, never sideways on the spot:

```
        lane 1   lane 2   lane 3
row r     ■ ────────┐
              ╲     │     ╱
row r+1   ■     ■   ■   ■        (three legal steps from (r, 2))
```

Every consequence in this document falls out of that one rule. A move of *N* is
exactly *N* of those steps; a lane change is free but costs you the row you were
going to spend anyway; and the set of places a roll of *N* can put you is a
breadth-first walk of exactly *N* steps, which is four lines of code and the
reason §9 can let a player tap a destination rather than draw a path.

**Corners are rows, not turns of the wheel.** A corner is a contiguous band of
rows with a **stop count** attached (§10). Corners are narrower than the
straights they join, which is what makes them block.

### 5.2 Ashcombe Park

The circuit that ships. 78 rows, three corners, one very long straight.

| Rows | Section | Lanes | Stops |
|---|---|---|---|
| 0–9 | **Start / Finish Straight** — the grid occupies rows 0–2 | 3 | — |
| 10–14 | **Turn 1 — Ashcombe Hairpin** | 2 | **2** |
| 15–46 | **The Mile** — 32 rows of full throttle | 3 | — |
| 47–51 | **Turn 2 — Gravel Bend** | 2 | **1** |
| 52–61 | **Woodland Esses** | 2 | — |
| 62–65 | **Turn 3 — The Kink** | 3 | **1** |
| 66–77 | **Run to the Line** | 3 | — |

214 spaces. Four corner-stops a lap, and the two-lane Esses are the only place
on the circuit where a straight is narrow enough to block a following car
outright.

**The grid** is six staggered spaces on rows 0–2, lanes 1 and 3, so no car
starts directly behind another:

| Slot | P1 | P2 | P3 | P4 | P5 | P6 |
|---|---|---|---|---|---|---|
| Space | (2, 1) | (2, 3) | (1, 1) | (1, 3) | (0, 1) | (0, 3) |

Pole is two rows of road, and it is worth less than it looks: turn order is
leader-first (§15), so the pole-sitter moves first every round and shows the
whole field what they are doing before anyone else commits.

### 5.3 The cars

Every car is identical. There is no car selection, no engine stat, and no
asymmetry between drivers: the only thing that separates two cars at the start
line is where they are standing and who moves first.

What varies is the **spec** the host picks for the whole field (§6) — how the
twelve wear tokens are divided. Everybody races the same spec, so the choice is
a statement about the race rather than an advantage in it.

---

## 6. Setup Procedure

1. **The host picks the race distance:** Sprint (1 lap) or Grand Prix (2 laps).
   Sprint is the default.
2. **The host picks the spec** every car runs (§11's table). Balanced is the
   default.
3. **The host switches oil spills on or off** (§14). Off is the default.
4. **Draw the grid.** Shuffle the field into the grid slots of §5.2, P1 first.
   This is the only randomness in setup.
5. **Every car starts in gear 0**, on full wear pools, with no corner stops
   banked.
6. **Turn order for round one is the grid order**, P1 first.

---

## 7. Core Gameplay Loop

A round is one turn for each driver, in the order §15 fixes at the start of it.
A turn is three steps, in this order, and the middle one is where the game is:

**Step 1 — Shift.** Declare the gear you will drive this turn: at most one gear
higher than your current gear, or any gear below it that you can pay the gearbox
cost for (§8.2). The gear's die is then rolled and the number is public.

**Step 2 — Move.** Optionally spend brakes to shorten the roll (§11), then move
exactly that many rows, choosing your destination from the spaces the roll can
legally reach (§9). Corner stops, overshoots, blocking and — if it is on — oil
are all resolved by arriving.

**Step 3 — Slipstream.** If your move ended one or two rows behind another car,
you may take a three-row tow (§12), or decline it. Either way the turn ends.

The shape of the turn matters as much as its content: **the roll happens in
step 1, and every decision that follows it is made with the number known.**
A game that rolled after the destination was chosen would be a different, worse
game — it would be a bet on a number rather than a bet on a range, and §2's
first pillar would have nothing to stand on.

---

## 8. Gears and the Dice

### 8.1 The gear table

Each gear has its own die, and each die is **printed with a band of numbers
rather than 1-to-N**. That is the whole trick: a gear is a promise about the
range you will travel, and the ranges overlap only at their edges.

| Gear | Die | Range | Faces | What it is for |
|---|---|---|---|---|
| **0** | — | 0 | — | Stopped: the grid, and a car that has spun |
| **1** | d4 | **1–2** | 1, 1, 2, 2 | Crawling out of a hairpin; the only gear that can bank a second stop in a five-row corner |
| **2** | d6 | **2–4** | 2, 2, 3, 3, 4, 4 | Corner entry and corner exit |
| **3** | d8 | **4–8** | 4, 5, 5, 6, 6, 7, 7, 8 | The workhorse — wide enough to reach a corner, short enough to stop in one |
| **4** | d12 | **7–12** | 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12 | The Mile's gear. Committed: a five-row corner cannot contain it |
| **5** | d20 | **11–20** | 11–20, twice each | The gamble. Reaches Gravel Bend from the middle of the Mile, and cannot stop in it without brakes |
| **6** | d30 | **21–30** | 21–30, three times each | Top gear, reachable only on a circuit with a straight long enough to climb the ladder (§8.3) |

Every band is uniform: a gear is `min + randomInt(span)`, and the printed faces
above exist so the *physical* die that appears on screen is the right one. This
matters for exactly one reason — a player reading "d20" learns the shape of the
bet faster than a player reading "11–20", and the shape of the bet is the game.

### 8.2 Shifting

**Up:** at most **one gear per turn**, free. From gear 0 (the grid, or a car
that has spun) you may launch to gear 1 **or** gear 2 — a standing start is
allowed one extra ratio, and it is the only exception.

**Down:** one gear is free. More than one costs gearbox, steeply:

| Gears dropped | Gearbox cost |
|---|---|
| 1 | free |
| 2 | 1 |
| 3 | 3 |
| 4 | 6 |
| 5 or more | not allowed |

You may not shift into a gear you cannot pay for, and a gearbox pool at zero
means you drop one gear a turn like everyone else did on the way up. This is
the asymmetry that gives the ladder its teeth: **climbing is slow and free,
falling is fast and expensive**, so every gear you take is a gear you will
spend something to leave.

### 8.3 Why Ashcombe is a five-gear circuit

Ashcombe Park's track data declares `maxGear: 5`, and this section exists
because that looks like an omission and is not.

Leaving Ashcombe Hairpin you are in gear 1. Climbing the ladder one gear a turn,
the furthest you can have travelled by the time you are *in* a gear is the sum
of the bands below it:

| Turn out of the hairpin | Gear | Best case this turn | Rows covered, best case |
|---|---|---|---|
| 1 | 2 | 4 | 4 |
| 2 | 3 | 8 | 12 |
| 3 | 4 | 12 | 24 |
| 4 | 5 | 20 | 44 |
| 5 | 6 | 30 | 74 |

The Mile is 32 rows, running from row 15 to row 46. A car is in gear 4 after 12
of them and in gear 5 after 24 — which puts it at row 39 with Gravel Bend
starting at 47, so fifth's band of 11–20 lands inside the corner only on an 11
or a 12 and overshoots on everything else. That is the gamble §3 is built
around, and it is the top of this circuit. Sixth needs roughly **seventy
unbroken rows** to be reached at all, which is most of a lap of Ashcombe.

So sixth is specified, implemented and tested, and no car will use it at
Ashcombe. The circuits in §20 that want it — an oval, or a long-straight
airfield layout — get it for free because the rule lives in the gear table and
the permission lives in the track data.

---

## 9. Movement, Lanes and Blocking

A move of *N* rows is **exactly *N* steps** of the (r → r+1, lane ±1) rule in
§5.1. You may not move fewer, and you may not move more.

**You choose a destination, not a path.** The game computes every space
reachable in exactly *N* steps without passing through an occupied space, marks
them on the board, and you tap one. The path itself is then derived, and it only
matters for two things — which oil slicks you crossed (§14) and which corners
you crossed (§10) — both of which the derivation resolves in the player's
favour where it has a choice (see §14).

This is the single biggest concession to asynchronous play in the design, and
it costs less than it looks. In a live game a driver picks their line row by row
while watching the traffic; here the traffic is frozen for the whole move, so
every path to the same destination is equivalent except for those two things.

**You may not enter an occupied space.** There is no bumping, no overtaking
manoeuvre and no contact model: a car is a wall.

**Blocked short.** If no space is reachable in exactly *N* steps, you stop on
the **furthest** space you can reach — you choose among the furthest if there is
more than one — and take **1 tyre** of wear. One, regardless of how many rows
you lost: the scuff is for having to lift, not for the distance.

**Boxed in.** If you cannot move even one row, you stay where you are, take no
damage, and your gear drops to 1. This is possible only in the two-lane Esses
and inside a corner, which is exactly where a leader would want it to be
possible.

**You can never choose to stop.** Every roll must be moved in full, minus
whatever you paid brakes to shave off. A car cannot park across a corner to hold
the field up, and a car that wants to go slower has to pay for it.

---

## 10. Corners and the Stop Rule

A corner is a band of rows with a **stop count** — the number of separate turns
you must **end inside it** before you are allowed past its last row.

- Ending a turn on any space whose row is inside the corner **banks one stop**.
- Your banked stops **reset to zero** the moment you legally leave the corner.
- Ending a turn past the corner's last row with fewer stops banked than it owes
  is an **overshoot**.

**Overshoot cost: 1 tyre per row past the corner's last row.** A car that blows
through Gravel Bend (last row 51) and lands on row 55 pays 4 tyres.

**If you cannot pay the full cost, you spin** (§13). You do not pay what you can
and spin for the rest — you pay nothing, the car is placed on the corner's last
row in the first free lane, and the spin resolves. A driver with two tyres left
approaching a corner therefore knows exactly how much overshoot they can afford,
and that number is the most-read thing on their screen.

**A move may cross more than one corner.** On Ashcombe, Gravel Bend (rows 47–51)
and The Kink (rows 62–65) are eleven rows apart, so a car sitting in the Bend
that rolls 20 in fifth crosses both. Each corner crossed is resolved **in order
along the path**, and each charges its own overshoot. A move that spins the car
at the first corner stops there and never reaches the second.

**Passing through is not stopping.** A corner only ever counts a turn that
*ends* inside it. Crossing it in a single move, banking nothing, is the
overshoot case above.

---

## 11. Wear: Tyres, Brakes, Gearbox

Three pools, twelve tokens, one spec for the whole field. The spec is the host's
choice at setup and everybody races it.

| Spec | Tyres | Brakes | Gearbox | Reads as |
|---|---|---|---|---|
| **Balanced** *(default)* | 5 | 4 | 3 | Everything costs something, nothing is free |
| **Sticky** | 7 | 3 | 2 | Corner-eater: overshoot and survive it |
| **Stopper** | 4 | 6 | 2 | Precision: brake down and land the corner exactly |
| **Close-ratio** | 4 | 3 | 5 | Drop two gears at a time; slow in, fast out |

| Pool | Spent on | Spent when |
|---|---|---|
| **Tyres** | Overshooting a corner (1 per row, §10) · being blocked short (1, §9) | Automatically, on arrival |
| **Brakes** | Shortening this turn's roll by 1 row each | Declared with the move, after the roll |
| **Gearbox** | Dropping more than one gear (§8.2's table) | Declared with the shift, before the roll |

**Braking is the only pool you spend on purpose, with the number in front of
you.** After the roll you may spend any number of brake points up to what you
have, reducing the distance by one row each, **down to a minimum of one row** —
a car always moves. This is the rule that makes fifth gear into Gravel Bend a
decision rather than a mistake: a roll of 17 with four brakes left is a roll of
13, and 13 from row 38 is row 51, which is the last row of the Bend.

Wear never comes back. There are no pit stops, no repairs and no refills, which
is what turns the three pools into a budget for the whole race rather than a
per-lap allowance. A Grand Prix over two laps is therefore not twice a Sprint:
it is the same twelve tokens spread over eight corner-stops instead of four, and
that alone changes which spec is correct.

---

## 12. Slipstream

If your move ends **one or two rows behind another car — in any lane** — you may
take a tow: a second move of exactly **3 rows**, immediately, resolved under
every rule a normal move follows.

- You may **decline**. Declining costs nothing.
- The tow obeys blocking (§9), corners (§10) and oil (§14) exactly as the first
  move did. **A tow can push you out of a corner you still owe stops to**, and
  the overshoot is charged in full.
- **One tow per turn.** Ending the tow behind a third car does not earn another.
- A tow that is blocked short takes the same 1 tyre a blocked move does.

Slipstream is the game's rubber band, and it is pointed the right way round: it
only ever helps the car behind, it is strongest where the field is closest, and
it is most dangerous exactly where the field is closest — in the braking zone
for a corner, where three free rows are three rows of overshoot.

---

## 13. Spins and Recovery

A car spins when it overshoots a corner it cannot pay for (§10), or when it
loses control on oil (§14).

A spin resolves like this, in order:

1. The move ends **immediately** — nothing further on the path is resolved.
2. The car is placed on the **last row of the corner it failed**, in the first
   free lane (for an oil spin, on the slick's own space; see §14).
3. Its gear drops to **0**.
4. It **misses its next turn** entirely.
5. If oil is on, it **lays a slick** on the space it came to rest on.

Missing a turn is automatic and silent — the driver is skipped when the round
reaches them, not prompted to confirm it. This is an asynchronous-play decision
with real teeth: a "tap to acknowledge you spun" turn is a decision-free tap
that can cost a day of wall-clock in a game where turns are a day apart. The
driver finds out from their recap and from the log, which is where they would
have found out anyway.

A spun car rejoins from gear 0 on the turn after, which means the launch rule of
§8.2 applies and it can be back in gear 2 immediately. The cost of a spin is
therefore about **five rows of position and one whole turn**, not a wrecked car.

---

## 14. Oil Spills — the optional module

Off by default. The host switches it on at setup, and it adds one hazard, two
sources and one die roll.

**Where slicks come from**

| Source | Where the slick lands |
|---|---|
| A spin (§13) | The space the spun car comes to rest on |
| Spending **3 or more brake points** in one turn | The space the braking car ends on |

The second source is the one that makes the module worth switching on. Braking
hard is already the correct play into a corner; with oil on, it also leaves
something behind for the car that is chasing you — and the car chasing you is,
by §15's turn order, the one that moves next. Oil turns a defensive spend into
an offensive one without adding a single new action to the turn.

**What a slick does.** A car that **enters** a slick's space — passing through
or ending on it — rolls a d6. On a **1** it loses control: the move ends on that
space and the car spins (§13). On 2–6, nothing happens. A car does not check a
slick on the space it is already standing on, so a driver never spins on their
own oil.

**Slicks are avoidable, and the game avoids them for you.** Because the player
picks a destination rather than a path (§9), the path derivation prefers a
route that crosses **no slicks**, and only routes through one when every path to
that destination crosses it. The board marks those destinations, so choosing to
risk oil is a choice the player makes knowingly rather than one the app makes
for them.

**Slicks fade.** A slick laid during round *r* is swept at the end of round
*r + 1*, so it threatens roughly one full round of following traffic. **At most
12 slicks exist at once**; laying a thirteenth sweeps the oldest.

---

## 15. Turn Order and Race Distance

**Turn order is track order, leader first**, recomputed at the **start of each
round** and fixed for its duration:

1. Laps completed, descending.
2. Row, descending.
3. The previous round's order, for an exact tie.

Recomputing mid-round would let a driver's own move reorder the drivers behind
them; fixing it at the top of the round makes the order a thing everybody can
read off the board before anyone moves.

**Leading is a disadvantage in play order and an advantage in position.** The
leader commits first, every round, with no information; the last-placed driver
moves knowing exactly what all five cars ahead did and where every tow is. This
is the quiet counterweight to the rich-get-richer problem every racing game has,
and it is why §17 does not need a catch-up mechanic beyond slipstream.

**Race distance** is Sprint (1 lap, ~12 turns a driver) or Grand Prix (2 laps,
~22). A lap is complete when a car crosses from the last row to row 0.

---

## 16. Systems Analysis

### 16.1 The three economies

| Pool | Converts | Into | Runs out when |
|---|---|---|---|
| **Tyres** | Mistakes | Survival | You have taken one corner too fast too often |
| **Brakes** | Foresight | Precision | You have driven the whole race too fast for the gear |
| **Gearbox** | Lateness | Recovery | You keep arriving at corners in the wrong gear |

They are not interchangeable, and the spec (§11) decides which mistakes the
race will forgive. This is the entire strategic layer: there is no engine to
build and no tableau to grow, so the only long-term decision a driver makes is
**which of the three pools they intend to spend the race out of**, and they make
it turn by turn rather than once.

### 16.2 The corner is the whole game

Ashcombe has 214 spaces and 4 corner-stops a lap. A driver spends about a third
of their turns inside a corner and the rest arranging to arrive at one in the
right gear.

That ratio is deliberate. Straights are where the ladder gets climbed — no
decisions, just up one gear and go — and corners are where every pool gets
spent. A circuit with fewer corners is a circuit with fewer decisions, which is
why §20's alternative layouts change the *length* of the straights rather than
removing corners.

The stop counts do the fine tuning:

- **A two-stop corner forces gear 1.** Five rows cannot contain two consecutive
  ends unless the second move is 1–2 rows. So the hairpin resets the ladder for
  everybody, every lap, and that is where the field bunches.
- **A one-stop corner is a gear-3 corner.** Land inside it, leave next turn.
  It costs a driver their momentum but not their gearbox.

### 16.3 Tension curve

```
  tension
    │                                        ╭──╮
    │                        ╭──╮           ╱    ╲
    │        ╭──╮           ╱    ╲        ╱       ╲
    │       ╱    ╲_________╱      ╲______╱         ╲
    │  ____╱                                        ╲___
    └──────────────────────────────────────────────────── turns
       grid   hairpin    the Mile   Gravel Bend  Kink  line
```

Three peaks, each a corner, each higher than the last because the wear pools are
emptier. The Mile is the trough on purpose: four turns of pure acceleration
where nothing can go wrong is what makes the braking zone at the end of it feel
like a cliff.

---

## 17. Known Failure Modes & Mitigations

| Failure mode | Why it happens | Mitigation |
|---|---|---|
| **The leader drives away** | Nothing slows a car that is alone | Corner stops bunch the field every lap regardless of gap; slipstream only tows the car behind; the leader commits first every round (§15) |
| **The last round is decided before it is played** | Leader-first order + first-across-wins means a trailing car cannot win the final round | Accepted, and mitigated at the corner before it: The Kink owes a stop 12 rows from the line, so the lead has to be *taken* into the last corner rather than defended after it |
| **The async race never finishes** | 12 turns × 6 drivers × a 1-day timer | Sprint is the default distance; the turn-timeout adapter (§23.2) drives a stalled car conservatively rather than banking a missed turn |
| **A spin feels like elimination** | 5 rows lost and a turn missed, late in a race | No elimination at all (§4.3); a spun car relaunches straight into gear 2 |
| **Analysis paralysis on the lane choice** | 214 spaces, three lanes, a 20-row move | Pick the destination, not the path (§9); the board highlights the legal set and nothing else is tappable |
| **Oil turns the race into a lottery** | A 1-in-6 spin check per slick entered | 1-in-6 is per *entry*, the path derivation avoids slicks where it can (§14), slicks fade after one round, and the module is off by default |
| **The wide board is unreadable on a phone** | A 78-row circuit at 400px | §19.2 — the map is context, the decision happens in a car-centred strip |

---

## 18. Edge Cases & Adjudication

| Situation | Ruling |
|---|---|
| Roll exceeds the rows remaining in the race | You cross the line and win; distance past the line is not measured |
| Two cars complete the race distance in the same round | The first to cross, in play order, wins — the race ends immediately and the second never gets its turn |
| A move crosses two corners | Each is resolved in path order and charges its own overshoot (§10). A spin at the first stops the move there |
| A slipstream tow crosses a corner | Fully resolved, overshoot charged. The tow is a move, not a bonus |
| A spin happens on the last row of a corner | The car is already there; it stays, drops to gear 0 and misses its turn |
| An oil spin inside a corner | The car rests on the slick's space, not the corner's last row. Its banked stops are untouched |
| Overshoot cost exactly equals tyres remaining | It is payable. Tyres reach 0 and the car continues (§4.3) |
| Blocked short *and* the short landing is an overshoot | Both apply: 1 tyre for the block, plus 1 per row past the corner |
| Blocked short with 0 tyres | The block's scuff is a debt that cannot be paid, and an unpayable *block* does not spin — only an unpayable overshoot does. The car stops and takes nothing |
| Boxed in inside a corner owing stops | Staying put ends the turn inside the corner, so it **banks a stop** |
| A car is on the grid and the field has lapped it | Not possible in a 2-lap race; a circuit that allows it classifies by laps first (§4.2), and a lapped car is simply behind |
| The last free lane of a corner is taken when a spin needs it | The spin resolves onto the last *available* space searching backwards along the corner; a corner is never fully occupied by fewer than six cars |
| A driver is removed from the game mid-race | The game ends for everybody as abandoned — the engine's existing behaviour, not a racing rule |

---

## 19. Accessibility & Table Presence

Colour never carries information alone. Every car is drawn in its driver's
`playerColour()` **and** carries its **race number** (its grid slot, 1–6), so
the board, the scoreboard, the log and the recap all identify a car two ways.

Dice are drawn by the shared `DieFace`, which already prints anything over six
sides as a numeral rather than pips — a d12 showing 9 says "9". The gear's die
is labelled with its gear beside the roll, so a player who cannot tell a d12
from a d20 at a glance still reads "4th · 9".

Corner stops are shown as a pip row on the corner itself ("● ○" = one banked of
two owed), never as a tint of the corner's tarmac.

### 19.1 Can the cars be emoji?

Short answer: **no for the car on the board, yes everywhere identity is not the
job.**

The board needs six cars that are instantly distinguishable at about 20px, and
the app already has the mechanism for that: `playerColourForId()`, six colours,
used by every other game's pawns and by the scoreboard, the log and the recap so
a player is one colour everywhere. A car on the board has to join that system,
not run a second one beside it.

Emoji cannot. The reason is written into this codebase already, in the comment
on `GameResultEventIcon` in `src/utils/apiModels/GameDataApi.ts`: *"an emoji
arrives with its own colours baked in and ignores `fill`"* — which is exactly
why chart markers stopped being emoji. The same is true of a car.

And the palette is not there even if tinting were possible. Counting vehicle
emoji whose colour is both distinct and stable across Apple, Google, Microsoft
and Samsung:

| Emoji | Colour | Stable? |
|---|---|---|
| 🏎️ | red | yes |
| 🚕 | yellow | yes |
| 🚓 | blue-and-white | yes |
| 🚌 | orange-yellow | yes, but reads as the taxi at 20px |
| 🚗 | red / blue | **no** — red on Apple and Google, blue on others |
| 🚙 | blue / green | **no** |

Three reliable, four if you accept the bus being mistaken for the taxi. The game
seats six.

**The middle road, and why it is also rejected:** an identical 🏎️ on a
`playerColour` disc. The disc carries the identity, the emoji carries nothing,
and at 20px the emoji's own colours fight the disc it is sitting on. That is
more pixels for strictly less information than the disc alone.

**What ships:** the car is one shared SVG silhouette — a single `<path>` in the
board component — filled with `playerColourForId()` and rotated to the track's
heading at that space, with the race number printed on it. The precedent is
Outbreak's pawn circles and Banned Islet's `.ag-bi-pawn`; this is the same
contract with a better shape.

**Where emoji do appear**, because nothing there is carrying identity:

| Place | Emoji |
|---|---|
| The game's `meta.glyph` in the library | 🏎️ |
| The start/finish row on the board | 🏁 |
| Log and recap row markers | 🏁 finish · 🛞 tyre spent · 🛑 brake · ⚙️ gearbox · 💥 spin · 🛢️ oil laid · 💨 slipstream |
| "What's new" and the guide | as the rest of the app uses them |

### 19.2 Reading a 214-space board on a phone

The circuit is 78 rows long. Fitted to a 400px column, a row is about five
pixels, which is fine for *where is everybody* and useless for *where can I go*.

Two surfaces, one renderer:

- **The map** — the full circuit inside `ag-board-frame`, with `BoardZoom` for
  the pinch-and-pan pass over it. This is context: the field, the gaps, the
  corners, the oil.
- **The strip** — the ±20 rows around the viewer's own car, drawn large, with
  the legal destinations highlighted and tappable. This is where every turn is
  actually taken.

They must be **one space renderer used twice at two scales**, not two
components. A second copy of the space markup is the defect AGENTS.md names
first, and the strip exists precisely because the same drawing needs to be
bigger — which is a prop, not a component.

---

## 20. Iteration Hooks

Ordered by what each one buys against what it costs.

1. **A second circuit.** The track is data (§23.4): rows, lane widths, corner
   bands, stop counts, `maxGear`. A new layout is one file and one render.
   Two worth building: **Bonneville Oval** — two enormous straights, two
   one-stop corners, `maxGear: 6`, the circuit that exists to make sixth gear
   real — and **Old Harbour**, a narrow two-lane street circuit with four
   corners where blocking decides the race.
2. **Per-driver spec.** Let each driver split their own twelve tokens instead of
   racing the host's spec. The async cost is what kills it today: a setup phase
   is a whole extra round of turns before anything moves. It becomes free the
   moment it is folded into the *first* turn's command — choose your spec and
   your launch gear in one tap — which is where it should be built.
3. **Weather.** One switch that narrows every gear band by two at the top: a
   wet race is the same circuit driven a gear lower. Cheap to implement,
   changes every corner, and needs no new art beyond a wet variant of the board.
4. **A theme.** The circuit re-dressed as a hover-race — same rows, same lanes,
   same corner bands, same numbers, different names and art — is a textbook fit
   for the app's theme system (`docs/game-themes.md`) and its guard test would
   have real work to do. It is listed last only because it costs a second full
   board render, which is the most expensive thing on this list.
5. **Championship.** Race results already carry a finishing position; a season
   that adds them up across several races is a feature of the results layer
   rather than of this game.

---

## 21. Glossary

| Term | Meaning |
|---|---|
| **Row** | One step along the circuit. 78 of them at Ashcombe; movement is measured in these |
| **Lane** | A position across the road, 1–3. Every row is 2 or 3 lanes wide |
| **Space** | One (row, lane) pair — where a car stands. 214 at Ashcombe |
| **Band** | The range of rows a gear can travel (§8.1) |
| **Stop** | A turn ended inside a corner. Corners owe 1 or 2 |
| **Overshoot** | Ending past a corner's last row without its stops banked. Costs 1 tyre a row |
| **Spin** | The unpayable-overshoot or lost-control result: gear 0 and a missed turn (§13) |
| **Tow** | The three free rows a slipstream grants (§12) |
| **Scuff** | The 1 tyre a blocked-short move costs (§9) |
| **Spec** | How the field's twelve wear tokens are split (§11) |
| **Slick** | An oil hazard, module only (§14) |

---

## 22. Quick Reference

**Your turn**

1. **Shift** — up one, or down as many as the gearbox pays for. Roll the gear's die.
2. **Brake** *(optional)* — 1 point = 1 row less, never below one row.
3. **Move** — exactly that many rows. Tap a highlighted space.
4. **Tow** *(optional)* — 3 more rows if you ended 1–2 rows behind a car.

**Gears** · 1: 1–2 · 2: 2–4 · 3: 4–8 · 4: 7–12 · 5: 11–20 · 6: 21–30

**Shifting down** · 2 gears = 1 gearbox · 3 = 3 · 4 = 6 · 5 = illegal

**Costs** · overshoot 1 tyre/row · blocked short 1 tyre · brake 1/row · can't pay an overshoot → spin

**Ashcombe Park** · Hairpin (10–14) 2 stops · Gravel Bend (47–51) 1 · The Kink (62–65) 1 · fifth gear is the top of this circuit

---

## 23. Implementation Plan

Nothing in `src/games/RaceCars/` exists yet. This section is the bridge between
the design above and the codebase: what the engine already provides, what it
doesn't, what asynchronous play forces us to change, and the order to build it
in.

Read [`docs/new-game.md`](../new-game.md) and
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 first — the checklist and the
command pattern are assumed here rather than repeated.
[`banned-islet.md`](./banned-islet.md) §21 is the plan to read alongside this
one: it is the most recent game built to this template and Race Cars copies its
PR shape deliberately.

### 23.1 What the engine already gives us

| Need | Provided by |
|---|---|
| Invite, accept, create a game | The shared invitation engine — one `RaceCarsInvitationModel` with a `CreateGame` |
| Reading and validating the setup request | `readGameSetupRequest` / `seatsFor` (`src/utils/api/gameSetupRequest.ts`) — auth, body parsing and rate limiting in one call, as every other `POST /api/newgame/<game>` uses |
| Persist and mutate board state | `GameData` discriminator + `specificGameState` |
| A move that validates, mutates and logs | `IGameCommand.Execute` |
| A turn made of several commands (shift → move → tow) | `turnOver: false` on the outcome, exactly as Outbreak's and Banned Islet's multi-command turns already do |
| **Qualifying** | `rollOffTurnOrder()` (`src/utils/games/rollOff.ts`) — "everyone rolls, highest goes first, ties re-roll" is the grid draw of §6 step 4 with a different name. Five games share it; this is the sixth |
| Rolling a gear's die | `DiceRoll(sides)` (`src/utils/games/DiceRoll.ts`) over the CSPRNG in `random.ts` |
| A game-specific turn timeout | `registerTurnTimeoutAdapter` / `resolveStalledTurn` (`src/utils/games/turnTimeout.ts`) |
| Running a command identically live, on replay and on timeout | `runCommand` (`src/utils/games/commandPipeline.ts`) |
| Keeping a client from choosing its own dice | `stripRecordedRandomness` on the command route, which deletes every `recorded…` property off an incoming command |
| Car colours | `playerColourForId()` (`src/utils/ui/playerColours.ts`) — six colours against a six-car grid, which is the exact fit §19.1 depends on |
| The dice on screen | `Dice` / `DieFace` (`src/components/ui/`), which already print anything over six sides as a numeral — so the d8, d12, d20 and d30 of §8.1 need no new component |
| The roll card | `RollReadout` — the dark card holding the dice, the total and a line naming what the roll moved. "4th · 9 · into Gravel Bend" is precisely its `headline`/`sub` shape |
| Board zoom and pan | `BoardZoom` inside `ag-board-frame` |
| Per-turn boards for the recap | `buildTimeline()`, given a replay adapter and recorded RNG |
| "It's your turn" push, turn timers, surrender, rematch, chat | The command pipeline, the turntimer cron, `/api/game/end`, `GameFinishBanner` |

Three non-uses worth stating so nobody reaches for them:

- **`buildSymmetricAdjacency` (`src/utils/games/adjacencyGraph.ts`) is not the
  adjacency helper for this board.** It is for boards that are a fixed set of
  **named** nodes joined by an edge list transcribed from a rulebook, and it
  keys on those names. A circuit's adjacency is row/lane arithmetic over the
  track data (§5.1) — three candidate steps from any space, computed in four
  lines — and it is *directed*, where that helper is symmetric by construction.
  Fires Out and Banned Islet both compute their own grid neighbours for the same
  reason; this is the third.
- **`ClickableMapNode` and `MapEdges` are not how the spaces are drawn.** Those
  are for a few dozen named nodes on an illustrated map with a drawn edge layer.
  A circuit is 214 unnamed lozenges and its edges are implied by position and
  never drawn; `MapEdges` would have nothing to render and `ClickableMapNode`'s
  three rings and `<title>` per space would cost 214 of each to express a
  legal/illegal state that one class on a `<rect>` expresses. The nodes here are
  Snakes & Ladders' cells drawn over art, not Outbreak's cities.
- **`src/utils/games/Cards.ts` has nothing to offer a game with no cards.**
  Stated only because it is the first thing a reader scanning `utils/games/`
  reaches for.

### 23.2 What the engine does not give us yet

**1. `CheckEndTurn` has never had to reorder the table.** Every existing game
advances `currentTurn` one step along a fixed `turnOrder`. Race Cars recomputes
the order at the top of each round from track position (§15). Nothing in the
engine forbids it — `CheckEndTurn` sets `currentTurn` to whatever the game says
— but nothing in the engine helps either, so the round bookkeeping
(`roundOrder`, `roundIndex`, `round`) is game state and the recompute is a pure
function in `rules.ts`. **The one engine-shaped consequence** is that a game's
`turnOrder` is what several shared surfaces read for "who is playing" — the
scoreboard, the recap's player ordering, `playerColourForId`. Those must keep
reading the **join order**, which never changes, and only the *turn* must follow
the race. Colours that reshuffle when a car overtakes would be a bug in six
places at once.

**2. `GameResultEventIcon` is a closed union.** It is
`'landmark' | 'explosion' | 'rescue' | 'epidemic' | 'sinking'` in
`GameDataApi.ts`, with art per name in `ChartEventIcon.tsx`, deliberately so a
marker can be recoloured per chart line. A spin marker needs one name — `'spin'`
— added there and one drawing added beside the others. Reusing `'explosion'`
was considered and rejected: a chart legend that calls a spin an explosion
misreads the race, and the documented cost of a new one is one line each.

**3. Nothing else.** Race Cars needs no new sharing, no new redaction, no new
ending kind: it is a single-winner competitive game, which is the case
`finishGame` was built for and the case `GameEndReason: 'win'` already covers.
This is the shortest gap list of any game added since Train Time, and it is
worth saying out loud because it is why the PR list below is mostly game code.

### 23.3 Deviations from this document

Asynchronous play forces four. Record each in a "Deviations" subsection of this
document as it lands — a deviation is anything a reader of this document alone
would not predict from the code.

* **The player picks a destination, not a path** (§9). At a table a driver
  threads their line row by row against live traffic; here the traffic is frozen
  for the whole move, so every path to the same destination is equivalent except
  for the corners and the slicks it crosses — and the derivation resolves both
  in the player's favour where it has a choice (§14). What it costs: a driver
  can no longer deliberately take the long way round to sit in a particular lane
  on arrival, because lane on arrival *is* the destination. What it buys: a turn
  that is one tap on a phone, which is the fourth pillar.

* **A spun car is skipped silently rather than prompted** (§13). The alternative
  is a command with no decision in it, and a decision-free tap costs a full turn
  of wall-clock in a game whose turns are a day apart. The skip happens in
  `CheckEndTurn`, is written to `gameState.history`, and earns a recap row — so
  the driver is told, just not asked.

* **The whole field runs the host's spec** (§11), where a table would let each
  driver split their own twelve tokens. A per-driver setup phase is an entire
  extra round of turns before a single car moves, and a race that takes three
  days to start is a race nobody finishes. §20's second hook is how it comes
  back: folded into the first turn's command rather than placed in front of it.

* **The race ends the instant a car crosses** (§4.1), rather than completing the
  round to settle the classification behind. Completing the round costs up to
  five more turns — days, asynchronously — to decide places nobody is racing for
  by then, and §15's leader-first order means those turns cannot change the win.
  What it costs is named honestly in §17: the last round is decided by who leads
  into it. The Kink owing a stop twelve rows from the line is the design's answer
  to that, and it is a tuning knob rather than a fix.

### 23.4 State and command surface

The **track is data, not code** — a `RaceCarsTrack` in `tracks/ashcombe.ts`,
which is what makes §20's first hook one file:

```ts
interface RaceCarsTrack {
  id: 'ashcombe',
  name: 'Ashcombe Park',
  rows: number,                       // 78
  laneWidth: number[],                // per row: 2 or 3
  corners: { id: string, name: string, from: number, to: number, stops: 1 | 2 }[],
  grid: { row: number, lane: number }[],   // P1 first
  maxGear: 1 | 2 | 3 | 4 | 5 | 6,     // 5 at Ashcombe (§8.3)
  art: { href: string, viewBox: { width: number, height: number } },
  // Where each space is drawn on the art, and which way the car faces there.
  geometry: { row: number, lane: number, x: number, y: number, heading: number }[],
}
```

`specificGameState`:

```ts
{
  trackId: 'ashcombe',
  laps: 1 | 2,
  spec: 'balanced' | 'sticky' | 'stopper' | 'closeRatio',
  oilSpills: boolean,
  round: number,
  roundOrder: string[],        // userIds, leader first — fixed for this round
  roundIndex: number,          // whose turn within roundOrder
  phase: 'shift' | 'move' | 'slipstream',
  roll: number | null,         // this turn's rolled distance, once shifted
  slicks: { row: number, lane: number, laidOnRound: number }[],   // max 12
  players: Map<userId, {
      raceNumber: number,      // grid slot, 1-6 — the second identity channel (§19)
      row: number,
      lane: number,
      lapsCompleted: number,
      gear: 0 | 1 | 2 | 3 | 4 | 5 | 6,
      tyres: number, brakes: number, gearbox: number,
      cornerId: string | null, // the corner the car is standing in
      cornerStops: number,     // stops banked in it
      skipNextTurn: boolean,   // set by a spin (§13)
      finishedPosition: number | null,
  }>,
}
```

**One map of per-player subdocuments, not parallel maps** — the shape every
multiplayer game here uses, giving `gameStateToModel` one loop and one
`markModified` surface. `slicks` is the only plain array, so it is the only
thing needing `markModified('specificGameState')` care; the per-player
subdocument mutations track themselves.

**Position is `(row, lane)`, never a space id.** Every rule in §§9–14 is
arithmetic on the row, and a space id would be resolved back to a row on every
single legality check.

**`round` / `roundOrder` / `roundIndex` are persisted rather than derived.**
The order is a *fixed* fact about a round (§15), so deriving it from live
positions mid-round would reorder the drivers behind whoever just moved. It is
recomputed in exactly one place — `CheckEndTurn`, when `roundIndex` wraps.

Three command classes, not nine:

| Command | Covers |
|---|---|
| `RaceCarsShift { gear, recordedRoll? }` | Validates the shift against §8.2, pays gearbox, rolls the gear's die. `turnOver: false` |
| `RaceCarsMove { row, lane, brake, recordedOilRolls? }` | Spends brakes, walks the derived path, resolves corners, overshoot, blocking, spins and oil. `turnOver: false` only if a tow is on offer |
| `RaceCarsSlipstream { row, lane, decline, recordedOilRolls? }` | Takes or declines the tow. Always ends the turn |

**`RaceCarsShift` is deliberately separate from `RaceCarsMove`.** They could be
one command carrying both the gear and the destination — and they must not be,
because §7's whole design is that *the number is known before the destination is
chosen*. One command would mean the client either chose blind or rolled locally,
and a client that rolls locally is a client that chooses its own dice.

**`rules.ts` is pure and isomorphic**, imported by the command classes and by
the board alike (`docs/new-game.md`, "Isomorphic rules modules"). It is where
every function in this document lives:

| Function | §  |
|---|---|
| `legalGears(state, userId)` | 8.2 |
| `rollFor(gear)` | 8.1 |
| `reachableSpaces(state, userId, distance)` | 9 |
| `derivePath(state, from, to, distance)` — slick-avoiding | 9, 14 |
| `resolveArrival(state, userId, path)` — corners, overshoot, spins | 10, 13 |
| `slipstreamOffered(state, userId)` | 12 |
| `trackProgress(state, userId)` / `recomputeRoundOrder(state)` | 15 |
| `conservativeTurn(state, userId)` | 23.7 PR 6 |

That table is also the test plan: every row is a pure function with a fixture
and no Mongo.

**Redaction: there is none, and that is the thing to prove.** Every field above
is public by §2's fourth pillar. `CreateDataResponse(viewerId)` still takes the
viewer, because the signature is not optional and because a later feature might
need it — and `gameStateToModel` deliberately ignores it. The croupier's job on
this game is therefore the *inverse* of the usual one: confirm the absence of
hidden state rather than the presence of redaction, and add Race Cars to
`publicGameState.test.ts`'s explicit `RESPONSE_BUILDERS` list so the claim is
asserted on the serialised response rather than on the typings.

**Recorded randomness.** Three sources, all named `recorded…` so
`stripRecordedRandomness` deletes them off an incoming request:

| Field | On | Why |
|---|---|---|
| `recordedRoll` | `RaceCarsShift` | The gear's die |
| `recordedOilRolls: number[]` | `RaceCarsMove` | One d6 per slick entered, in path order |
| `recordedOilRolls: number[]` | `RaceCarsSlipstream` | The tow crosses spaces too (§12) |

The grid draw at setup goes into `initialSpecificGameState` rather than onto a
command, because it happens in `CreateGame` where there is no command to carry
it. Build the clone on `clonePlayerStates` (`src/utils/games/mongoMaps.ts`) with
a per-player clone that **names every field** — a Mongoose subdocument keeps its
fields behind getters, so a spread copies none of them.

**A variable number of oil rolls per command is the trap here.** It is the same
shape as Settlements & Cities' discard-on-7 loop and Train Time's reshuffle: the
number of draws depends on the path, so the recorded field is a *log*, consumed
in order on replay, not a single value. Getting it wrong is invisible until a
replay rolls a different number of dice than the live game did — which is
precisely what §23.8's replay-equality test exists to catch.

### 23.5 Turn recap & planning

The three-column decision `docs/new-game.md` §7 asks for before PR 1, for the
per-game table in
[`turn-recap-and-planning.md`](../turn-recap-and-planning.md#per-game-status):

**Replay — yes**, from the `initialSpecificGameState` snapshot of 23.4.

**Recap — yes.** The away-time narrative is the order changing: *"Three cars
went past. Vale took fifth into Gravel Bend and paid four tyres to stay on the
road. Kel spun at the Hairpin and left oil on the exit."* Rows for corner stops,
overshoots, spins, tows, oil laid and oil hit, finishes and lead changes; no row
for a plain move down a straight, which is the same editorial line Outbreak's
`recap.ts` takes on Treat and Share Knowledge. `tip` is the standings: *"You're
P3, nine rows off the lead, and The Kink still owes you a stop."*

**Planning — ✖ by design, and replaced by something better.**

This is the one column where Race Cars departs from the shared doc's usual
answer, so here is the reasoning in its terms. By
[the four questions](../turn-recap-and-planning.md#planning-what-can-be-planned)
the game qualifies easily: its randomness is **memoryless** (dice, not a deck),
it hides nothing at all, and nothing is revealed at game over. A planner would
be safe.

It would also be **actively misleading**, which is the reason not to build it. A
planned turn resolves one hypothetical roll and shows the player a board where
they are in Gravel Bend. Their real turn will roll a different number. The
decision this game asks for is not "where do I end up" — it is "**which band do
I bet on**" (§2), and a planner answers the wrong question with a concrete,
persuasive, wrong picture. It is the same failure mode as
`banned-islet.md` §21.5's rejected decoy flood deck: a plan drawn against
invented randomness is worse than no plan.

What ships instead is the **reach band**, and it is the actual decision support:
for every gear the driver may legally select, show the *span* of rows it can
reach, whether that span can stop in the next corner, whether any of it
overshoots and what the overshoot would cost. It is `reachableSpaces()` called
once per legal gear — pure, client-side, no server round trip, no timeline
route — and it tells the truth about a range instead of lying about a number.

`plannableCommands` therefore stays `[]`, which is the default-deny the shared
doc asks for, and `canPlan` stays `false` on `TurnNavControls`.

### 23.6 The art

One rendered image: a top-down illustration of Ashcombe Park — tarmac, kerbs,
run-off, the start/finish line, grandstands — at the board's `viewBox`
resolution, drawn as a single `<image href="/art/racecars/ashcombe.png">` under
the SVG space layer, exactly as `OutbreakBoard.tsx` draws its map.

**The art does not draw the spaces.** The 214 lozenges are SVG over the top,
positioned from the track data's `geometry`, so a space's position and its
drawing can never drift apart. What the art *does* draw is everything that is
not state: the road surface, the corner kerbing, the scenery, and the painted
corner boundary lines that make §10's bands legible without a legend.

The pipeline is the repo's, not a new one: the master export goes to
`art-masters/racecars/ashcombe.png`, the served copy to
`public/art/racecars/ashcombe.png`, then `npm run optimise-art` and commit what
it writes. `meta.ts` ships with `glyph: "🏎️"` and gains
`art: "/art/racecars/icon.png"` in the same PR once there is a crop of the
render worth using. `npm run icons` writes
`public/icons/og-game-racecars.png` from `meta` — it needs Bricolage Grotesque
installed as a system font and warns rather than failing without it.

**Producing the geometry is the part to plan for.** 214 hand-placed
coordinates is not a thing to type. The track's centre line is authored as a
path, and a small build-time script samples it at 78 points, offsets each by
lane, and writes `geometry` — so the art and the data are generated from the
same curve. That script lives beside the track data and runs once per circuit;
it is not a runtime dependency and nothing in `src/` imports it.

### 23.7 The PRs

Each PR leaves `npm run build`, `npx tsc --noEmit`, `npm run lint` and
`npm test` green, and is reviewable on its own. From PR 4 the game is playable
by hand rather than only by the test harness. The bulleted lines inside each PR
are its commits.

**PR 1 — Track data and pure rules.** No engine work and no wiring; the whole
game as pure functions, which is the half worth getting right before anything
can be clicked.

- `src/games/RaceCars/tracks/ashcombe.ts` and the `RaceCarsTrack` shape of
  23.4, with placeholder `geometry` (a straight-line unrolled circuit) so the
  rules can be tested before any art exists.
- `board.ts`: the gear table of §8.1, the shift-down costs of §8.2, the spec
  table of §11, `MIN_PLAYERS`/`MAX_PLAYERS` (2/6), `SLICK_CAP`, the race
  distances, and the step rule of §5.1 as `stepsFrom(row, lane)`.
- `rules.ts`: every function in 23.4's table. Server-free, so the board can
  import it for the reach band (`docs/new-game.md`, "Isomorphic rules modules").
- `board.test.ts` / `rules.test.ts`: a lap is 78 rows and 214 spaces; a move of
  N reaches exactly the spaces N steps away; an occupied space blocks every path
  through it; a two-stop corner cannot be cleared in fewer than two turn-ends; an
  overshoot costs one tyre a row; a move crossing two corners charges both.

**PR 2 — Setup, wiring and the game type.** After this PR a race can be created
and its grid inspected in the API response.

- `RaceCarsModels.ts`: both discriminators, `buildInitialRaceCarsState` (the
  grid draw via `rollOffTurnOrder`, recorded into `initialSpecificGameState`),
  and `gameStateToModel` with 23.4's deliberate non-redaction.
- `apiModels.ts` and `meta.ts` (`available: false`, categories `["Dice",
  "Strategy"]`, `glyph: "🏎️"`, `minPlayers: 2`, `maxPlayers: 6`).
- `POST /api/newgame/racecars` through `readGameSetupRequest` + `seatsFor`,
  validating the distance, the spec and the oil flag against their tables the
  way the Outbreak route validates its difficulty.
- The setup screen, composed as `src/app/newgame/outbreak/page.tsx` composes
  its own: `GameSetupLayout` wrapping `UserInviteList` (driven by
  `usePlayerList`), `SeatCountSelect`, `TurnTimerSelect`, `PartySizeHint`, two
  `OptionChoiceSection`s (distance, spec) and one `OptionToggleRow` (oil
  spills) — with `useCreateLobbyOrInvite` owning seat count, `canSubmit`, the
  action label, the footnote and the submit itself.
- `RaceCarsLogic.ts` with `RaceCarsGameType` and a skeleton `RaceCarsShift`.
  This file has to exist by the end of this PR, not PR 3: `gameRegistry.test.ts`
  discovers games by the presence of `meta.ts` and then demands the barrel
  export.
- The shared-file wiring of `docs/new-game.md` step 6 — `GameLogic.ts`,
  `GAME_META`, `mongodb.ts` (four separate edits) and one keyed entry in
  `gameCommands.ts`'s `COMMANDS_BY_GAME_TYPE`, extended in PRs 3 and 5 as
  command classes arrive — plus the new game's line in
  `publicGameState.test.ts`'s explicit `RESPONSE_BUILDERS` list, which is
  deliberately not globbed so that forgetting it fails rather than passes.

**PR 3 — Shift, move and the round.** The game becomes drivable: a car can be
raced around the circuit against no hazards but the other cars.

- `RaceCarsShift` and `RaceCarsMove`, both validating through PR 1's `rules.ts`
  rather than re-deriving reachability or corner state a second time.
  `recordedRoll` lands here, in the PR that introduces the command — never a
  later one, because a command already in `commandHistory` can never be given
  the field retroactively.
- `CheckEndTurn`: advance `roundIndex`, consume `skipNextTurn`, and recompute
  `roundOrder` when the round wraps (§15).
- `CheckGameOver`: nothing. The win is *an event in play order* (§4.1), so it is
  set inside `RaceCarsMove`/`RaceCarsSlipstream` where the line is crossed, and
  `CheckGameOver` is the pass-through the command route calls. A version that
  re-derived the win from state would hand it to whoever was furthest along,
  which is not the same thing.
- `RaceCarsLogic.test.ts` on the in-memory harness `SolitaireLogic.test.ts` and
  both co-ops use.

**PR 4 — The board screen, first pass.** Enough UI to play PR 3 by hand, so
every PR after this one is playtestable as it lands.

- `components/RaceCarsBoard.tsx`: the circuit inside `ag-board-frame` with
  `BoardZoom`, the art `<image>` (placeholder until PR 8), the space layer, and
  the car silhouette of §19.1 filled by `playerColourForId` and carrying its
  race number.
- `components/RaceCarsStrip.tsx`: the ±20-row decision surface of §19.2 —
  **drawn by the same space renderer as the board, at a different scale**. If
  writing it proves the two need genuinely different markup, keep them apart and
  say so in the commit message; a second copy of the space is the defect
  AGENTS.md names first.
- `components/RaceCarsActions.tsx`: the gear picker as a run of `BuildRow`
  inside `.ag-build-list` — one row per legal gear showing its die, its band and
  its reach (23.5's reach band) — then the brake stepper and the destination
  prompt. Wrapped in `ReadOnlyPanel` so it goes inert off-turn.
- The roll shown through `RollReadout`, not a new card.
- The rest of the chrome is the shared kit re-tinted under a
  `.ag-game--racecars` scope and never rebuilt: `GameShell`, `GameScoreboard`
  (one row per driver, `sub` carrying the gear and wear, `score` the position),
  `Stat` for laps and the gap, `GameOptionsMenu`, `GameFinishBanner`,
  `useGameData`, `useSubmitCommand`, `usePushEvents`, `useEndGame`.
- The board page, `src/app/games/racecars/[gameid]/page.tsx`, in the shape of
  Outbreak's — including `useGameGuide` + `GameGuideModal` (the guide lands in
  PR 8, the mount point is here) and `useTurnNavigation` + `TurnNavControls`
  with `canPlan={false}`, permanently (23.5).

**PR 5 — Slipstream, spins and the finish.** The race becomes a race: it can be
won, and it can go wrong.

- `RaceCarsSlipstream` and the `phase: 'slipstream'` hand-off from
  `RaceCarsMove`.
- Spins (§13) — every path into one, the `skipNextTurn` flag PR 3's
  `CheckEndTurn` already consumes, and its log line.
- Crossing the line: `finishedPosition`, the classification of §4.2, and the
  ending through `finishGame` with `endReason: 'win'`.
- The end-of-move reveal — the roll, the corner verdict and the tow offer —
  through `TurnRecap` as `OutbreakEndTurnScreen` does, or `PayoffScreen` as
  Fires Out's does. One of those two, not a third.

**PR 6 — Turn-timeout resolution.** Not optional, and not deferrable past the
PR that turns the game on. The cron's `noAdapter` fallback advances
`currentTurn` and nothing else, which here means a silent driver's car does not
move — making a timeout a way to conserve wear — and, worse, a turn that times
out in the `slipstream` phase **deadlocks the race for everybody**, since only
that driver may send `RaceCarsSlipstream` and the command route stops accepting
it the moment `currentTurn` moves past.

- `conservativeTurn()` in `rules.ts` (§23.4's last row), tested on its own: hold
  the gear if its maximum cannot overshoot the next corner, otherwise drop to the
  highest gear that cannot; spend the minimum brakes needed to avoid an
  overshoot, if affordable; take the furthest legal destination that neither
  overshoots nor crosses oil; decline the tow unless it does neither.
- One `ITurnTimeoutAdapter` registered in `turnTimeout.ts` alongside Outbreak's,
  Fires Out's and Banned Islet's, handing back `RaceCarsShift`, then
  `RaceCarsMove`, then `RaceCarsSlipstream` — no engine work, since
  `resolveStalledTurn` already loops an adapter to completion inside one cron
  tick.
- `turnTimeout.test.ts` covers a timeout at each of the three phases, and one
  where the conservative line still ends the race.

**PR 7 — Oil spills.** The optional module, last among the rules PRs because it
is the only one that is switchable off and the only one that adds randomness
mid-move.

- Both sources of §14, the d6 entry check, the slick-avoiding path derivation,
  the one-round fade and the 12-slick cap.
- `recordedOilRolls` on both moving commands, as the *log* 23.4 describes.
- The board's slick marker, and the destination marking that says "the only
  route here crosses oil".

**PR 8 — Replay, recap and the result page.** The largest wiring PR, and the one
whose shared-file list is easiest to under-read:

- The replay adapter, registered inline in the shared
  `src/utils/games/replay.ts` alongside the others — there is no per-game
  `replay.ts` in this repo, only a per-game `replay.test.ts` — with
  `plannableCommands: []` permanently (23.5).
- `recap.ts` in the game folder with the row selection of 23.5, **plus the
  `import "@/games/RaceCars/recap";` line in `src/utils/games/recap.ts`**
  without which the adapter never registers; `gameRegistry.test.ts` fails with
  that exact instruction. The board page picks up `useTurnRecap` +
  `TurnRecapScreen` in the same PR.
- The result page: a `RaceCarsGameResultModel` discriminator and schema in
  `GameResultData.ts`, its `GAME_RESULT_STATS` entry
  (`model`/`compute`/`format`/`charts`), and the
  `computeRaceCarsResultStats` / `formatRaceCarsResultStats` /
  `formatRaceCarsCharts` trio in `RaceCarsModels.ts`. Stats: finishing position,
  rows covered, top gear used, each pool spent, corners overshot, tows taken,
  spins, slicks laid and hit.
- Per-turn charts: **rows covered per driver per round** — the race trace, whose
  crossing lines are the overtakes — with spins as events, which needs the new
  `'spin'` `GameResultEventIcon` and its art in `ChartEventIcon.tsx` (23.2 gap
  2), one line each.

**PR 9 — Art, guide and release.** The upkeep PR, and the one that turns the
game on.

- The circuit render: master into `art-masters/racecars/`, served copy into
  `public/art/racecars/`, `npm run optimise-art`, and the generated `geometry`
  replacing PR 1's placeholder (§23.6).
- `guide.ts` beside `meta.ts`, wired into `GAME_GUIDES` in
  `src/utils/ui/gameGuides.ts` — five sections, `Goal` first, then `Your turn`,
  in the player's language, matching the existing guides rather than restating
  this document.
- `npm run icons` for `public/icons/og-game-racecars.png`.
- `meta.available: true`, **one** "What's new" line in the *New games* group of
  `src/utils/ui/whatsNew.ts`, and the Race Cars row in
  `turn-recap-and-planning.md`'s per-game table (`✅ from snapshot` / `✅ (tip)` /
  `✖ by design — the reach band, 23.5`).

**One "What's new" line for the whole game.** Nine PRs, one entry, written when
the game becomes findable. Fixes to Race Cars before PR 9 are part of building
it and get no line of their own — players never saw the broken version. AGENTS.md
is explicit about this and the group only holds ten lines.

**Review passes.** By what each PR touches, rather than all five every time:

| Agent | On |
|---|---|
| `caveman` | PRs 1, 4 and 7 — the reuse-heavy ones. PR 4 carries the board/strip extraction call, which is the single most likely place this game grows a second copy of something |
| `croupier` | PR 2's `gameStateToModel` — and specifically to confirm the *absence* of hidden state (23.4), which is the opposite of its usual job — and again on PR 8's recap and result page |
| `locksmith` | PR 2's new route, and PR 3 for the `recorded…` naming, the `brake` bound and the destination validation |
| `gremlin` | PR 2's route, PR 5's round-order recompute with a spun or finished driver in it, PR 6's timeout paths and PR 7's slick cap |
| `rulebook` | PRs 2, 8 and 9 — the wiring and the upkeep |

### 23.8 Testing

`RaceCarsLogic.test.ts` follows `SolitaireLogic.test.ts`'s harness — an
in-memory `makeGame()`/`cmd()` pair over a plain `IGameData`-shaped object, no
Mongo and no Clerk.

* **Scripted rolls.** Every command takes its randomness from a `recorded…`
  field, so a test sets the roll outright and asserts the exact resulting
  board: a 17 in fifth into Gravel Bend with four brakes (lands the corner), the
  same roll with none (four tyres or a spin), a 20 that crosses two corners.
* **The corner, exhaustively.** Enter, bank, leave, overshoot by one, overshoot
  by more than the tyres left, overshoot with exactly the tyres left, and get
  towed out of a corner that still owes a stop.
* **Blocking.** A two-lane corner with both lanes filled ahead; the blocked-short
  scuff; the boxed-in case that banks a stop by standing still.
* **Round order.** Recomputed only on wrap; a spun driver keeps their slot; a
  finished driver leaves it; an exact tie falls back to the previous round.
  Assert alongside it that **`turnOrder` and the colour map never change** —
  23.2's gap 1 is a bug in six places if it slips.
* **Conservation.** After every command, assert each pool is within `0..spec`
  and that no two cars occupy one space — which is what catches a path
  derivation that walked through a car.
* **A full auto-played race, `it.each` over the four specs and both distances.**
  Drive the conservative line until somebody wins, asserting termination and no
  deadlock — and doubling as the only practical way to sanity-check §16's tuning
  without a hundred playtests. The assertion that matters is the *turn count*:
  if a Sprint is not finishing in roughly 12 turns a driver, the circuit is
  wrong, not the test.
* **Replay equality.** Run a race, rebuild it through `buildTimeline()`, and
  assert the final state matches — with `crypto.getRandomValues` stubbed to
  throw, as `TrainTime/replay.test.ts` does. With a variable-length oil-roll log
  (23.4) that single assertion is worth more than any individual rules test.
