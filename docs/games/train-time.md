# Game Design Document: Train Time

## 1. Game Overview

* **Genre:** Set Collection, Route Building, Hand Management
* **Target Audience:** 8+ years old (Family / Gateway Strategy)
* **Player Count:** 2–5 players
* **Estimated Playtime:** 30–60 minutes (a few days to a few weeks asynchronously)
* **Core Concept:** Players are rival rail barons racing across a continent.
  Collect coloured carriage cards, spend matching sets to claim routes between
  cities, and quietly build the longest network you can while trying to connect
  the secret city pairs printed on your Destination Tickets before the trains
  run out.
* **Core Hook:** One action per turn, chosen from three, with almost no rules
  overhead — but every card you draw is public information and every route you
  claim is a route somebody else can never have.

---

## 2. Theme & Setting

*Train Time* is set during the golden age of rail expansion. The board is a
stylised map of a continent, its cities linked by coloured stretches of track.
Players never move a train; they *build* one. The fiction is entirely
economic — you are laying the network that will define a century of travel,
and the tension comes from knowing that your competitors want the same
mountain pass you do.

The base game is set in **North America**. The expansion described in §9 moves
the map to **Europe**, where the terrain fights back.

---

## 3. Physical Components

* **Game Board:** A map of the continent showing **36 cities** connected by
  **routes**. Each route is a chain of 1–6 coloured spaces.
  * Routes are coloured (one of the eight card colours) or **grey**.
  * Some city pairs are linked by **double routes** — two parallel tracks,
    usually in different colours.
* **Coloured Trains (5 sets of 45):** Plastic train pieces in the player
  colours, placed on claimed routes.
* **Carriage Cards (110 total):**
  * 12 each of **8 colours** — Red, Orange, Yellow, Green, Blue, Purple, White,
    Black (96 cards).
  * 14 **Engine** cards (wilds), which count as any colour.
* **Destination Tickets (30):** Each names two cities and a point value
  (typically 4–22). Kept secret until the game ends.
* **Scoring Track:** Runs around the edge of the board; each player has a
  scoring marker.
* **Long Haul Bonus Card (1):** Awarded at the end of the game for the longest
  continuous run of track.

---

## 4. Setup

1. Place the board and put the scoring markers on space 0.
2. Each player takes a set of **45 trains** and the matching scoring marker.
3. Shuffle the carriage cards and deal each player **4 cards** as a starting
   hand. Place the deck beside the board and turn **5 cards face up** next to
   it — this is the **market**.
4. Shuffle the Destination Tickets and deal **3** to each player. Each player
   secretly looks at them and **keeps at least 2**, returning any they discard
   to the bottom of the ticket deck.
5. The most experienced traveller goes first.

> **The three-Engine rule.** If at any point three of the five face-up market
> cards are Engines, discard all five and deal five new ones from the deck.
> Repeat if the new market also shows three Engines.

---

## 5. Core Gameplay Loop

Play proceeds clockwise. On your turn you perform **exactly one** of three
actions. There are no phases, no upkeep, and no dice.

### Action A — Draw Carriage Cards

Draw **two cards**, one at a time, from either the face-down deck or the
face-up market. Each card taken from the market is immediately replaced from
the deck before the second draw.

* **The Engine exception:** taking a face-up **Engine** from the market costs
  your entire action — you draw that card and nothing else. An Engine drawn
  blind from the deck is an ordinary card and does not end your action early.
* If the deck runs out, shuffle the discards to form a new deck. If there are
  no cards at all left to draw, this action is unavailable.

### Action B — Claim a Route

Play a set of cards from your hand matching a route's **colour and length**,
then place one of your trains on each space of that route.

* A **grey** route may be claimed with any single colour, so long as every card
  played is the same colour.
* **Engines** substitute for any colour.
* Score immediately, per the route-length table in §6.
* Discard the cards played to the discard pile.
* A player may claim **at most one route per turn**, and may never claim both
  halves of a double route.

### Action C — Draw Destination Tickets

Draw **3** tickets from the top of the ticket deck (or as many as remain) and
**keep at least 1**. Returned tickets go to the bottom of the deck.

---

## 6. Mechanics & Systems

### Route Scoring

Points are awarded the moment a route is claimed, and the curve is
deliberately steep — long routes are worth far more per train than short ones,
which is what makes the board's few 5- and 6-length routes so contested.

| Route length | Points | Points per train |
| --- | --- | --- |
| 1 | 1 | 1.00 |
| 2 | 2 | 1.00 |
| 3 | 4 | 1.33 |
| 4 | 7 | 1.75 |
| 5 | 10 | 2.00 |
| 6 | 15 | 2.50 |

### Double Routes and Player Count

Both halves of a double route are available in a **4- or 5-player** game (a
single player still may never own both). In a **2- or 3-player** game, only
**one** half of each double route may be claimed; once one is taken, the
parallel track is closed for the rest of the game. This keeps the small-player
map tight and preserves the blocking game.

### Destination Tickets (The Hidden Economy)

Tickets are the game's risk engine. A ticket scores its printed value **only**
if an unbroken chain of routes you own connects the two named cities; otherwise
its value is **subtracted** from your score. Direction does not matter, the
path may be as long and winding as you like, and passing *through* a city
neither helps nor hurts.

Drawing tickets mid-game (Action C) is the classic gamble: the tickets you draw
late are often the ones you have already accidentally completed, but a bad draw
you are forced to keep can cost you the game.

### Blocking and Information

Every card taken from the market and every route claimed is public. Experienced
players read the market draws to guess which routes an opponent is collecting
for, and claim contested chokepoints early — not for the points, but to force a
detour that costs an opponent their ticket. Blocking is a legitimate and
central strategy; the game is designed so that a pure builder who ignores
opponents will usually lose to one who does not.

### Hand Limit

There is none. A player may hold any number of carriage cards.

---

## 7. Game End & Win Conditions

### Triggering the End

When a player, at the **end of their turn**, has **2 or fewer trains**
remaining, every player — **including that player** — takes exactly **one more
turn**. The game then ends. A player may claim routes on their final turn as
normal, and may end with 0, 1 or 2 trains unused.

### Final Scoring

1. **Route points** already accumulated on the scoring track.
2. **Destination Tickets:** reveal all tickets. **Add** the value of every
   completed ticket; **subtract** the value of every incomplete one.
3. **Long Haul Bonus (+10):** awarded to the player with the longest
   **continuous path** of connected routes. Loops and branches are allowed as
   part of the network, but the measured path may not use the same route twice.
   Ties: every tied player scores the bonus.

Highest total wins. Ties are broken by the greatest number of **completed
Destination Tickets**; if still tied, the players share the win.

---

## 8. Design Notes & Balance

* **One action, three choices.** The whole game is a repeated question: do I
  spend this turn on economy (draw cards), conversion (claim a route), or
  ambition (draw tickets)? The tension is that the three are never equally
  urgent, and that claiming a route is the only one that scores.
* **The steep scoring curve** is the counterweight to hoarding. Six 1-length
  routes cost six turns of card spend and score 6; one 6-length route scores 15.
  This pushes players toward long routes, which are exactly the routes most
  likely to be sniped.
* **Negative ticket scoring** is what stops the game from being a solitaire
  optimisation puzzle. Without the penalty, ticket draws would be free.
* **The Engine tax** (a face-up Engine costs your whole action) is the single
  most important balancing valve. Without it, wilds would trivialise every
  grey route and every long build.
* **Known failure mode — the runaway market.** With five players, a player who
  is starved of a needed colour can spend many turns drawing. The game's
  answer is the ticket deck: when your colour never comes, pivot to a route
  you *can* build. Designers adapting this game should resist adding a
  "discard and redraw the market" action, which removes that pressure.

---

## 9. Expansion: Train Time — Continental

*Adapted from Ticket to Ride: Europe.*

The Continental expansion replaces the North American map with **Europe** and
layers three new subsystems onto the base loop: **tunnels**, **ferries**, and
**stations**. Everything in §§4–7 still applies unless stated below. It is
best understood as a *complete alternative board* rather than a bolt-on — it is
playable standalone, and the two maps are not mixed in a single game.

Where the base game is about efficiency, Continental is about **risk and
insurance**: tunnels can cost more than you budgeted, ferries demand Engines
you would rather spend elsewhere, and stations let you buy your way out of a
block for a points penalty.

### 9.1 New & Changed Components

* **Game Board:** a map of Europe with **47 cities**. Routes run 1–**8** spaces.
* **Coloured Trains (5 sets of 45):** unchanged.
* **Stations (15 total, 3 per player):** small building pieces in the player
  colours.
* **Destination Tickets (46):**
  * **40 regular tickets**, as in the base game.
  * **6 Long Route tickets**, worth 20–21 points each and spanning the width of
    the map.
* **Carriage Cards (110):** unchanged — 96 coloured, 14 Engines.
* **Continental Express Bonus Card:** replaces the Long Haul bonus (§7),
  scoring the same **+10** for the longest continuous path.

### 9.2 Changed Setup

Deal each player **4 carriage cards**, **3 regular Destination Tickets**, and
**1 Long Route ticket**. Each player must keep **at least 2 tickets in total**
— the Long Route may be among the discards. Each player also takes **3
stations**.

### 9.3 Tunnels

Certain routes are marked as tunnels. Claiming one is a two-step gamble:

1. Play the required cards for the route as normal.
2. Flip the **top 3 cards** of the deck. For **each** flipped card matching the
   colour you played (**Engines always match**), you must immediately play
   **one additional card of that same colour** from your hand.
3. If you can pay the surcharge, the route is yours. If you cannot — or choose
   not to — take **all** your cards back into your hand. Your turn ends with
   no route claimed.
4. The 3 flipped cards are discarded either way.

*Design note:* a tunnel of length 3 can cost anywhere from 3 to 6 cards. Since
roughly 26 of the 110 carriage cards match any given colour (12 of that colour
plus 14 Engines), the average surcharge is about **0.7 cards per tunnel claim**
regardless of the tunnel's length — but the variance is the point. Players who
attempt a tunnel holding exactly the minimum are gambling a whole turn for a
one-in-four chance of paying nothing extra... and a small chance of paying
three.

### 9.4 Ferries

Ferry routes are grey routes crossing water, showing one or more **Engine
symbols** among their spaces. To claim a
ferry you must play an Engine for each Engine symbol, plus ordinary matching
cards for the remaining spaces. Engines cannot be replaced by coloured cards on
those spaces, and coloured cards cannot be replaced by Engines elsewhere on the
route beyond the usual wild substitution.

This gives Engines a second, non-optional use and makes the "spend your whole
action on a face-up Engine" decision far sharper than in the base game.

### 9.5 Stations

A station is the expansion's escape hatch from being blocked.

* **Placement:** on your turn, instead of another action's use of cards, place a
  station in a city that has no station. The cost escalates:

  | Station | Cost |
  | --- | --- |
  | 1st | 1 card |
  | 2nd | 2 identical cards |
  | 3rd | 3 identical cards |

  Engines may substitute for the required colour.
* **Effect:** at the end of the game, a station lets you use **one** route of
  **another** player leading into that city, as if it were your own, purely for
  the purpose of connecting Destination Tickets. You choose which route when
  scoring.
* **A station does not** score route points, count toward the Continental
  Express path, or block anyone.
* **Unused stations score +4 each** at the end of the game. Placing a station is
  therefore a deliberate 4-point purchase of insurance.

### 9.6 Extended Route Scoring

The Europe map uses a different distribution of route lengths: there are **no
5- or 7-space routes**, and it adds an **8-space** route band at the top.

| Route length | Points |
| --- | --- |
| 1 | 1 |
| 2 | 2 |
| 3 | 4 |
| 4 | 7 |
| 6 | 15 |
| 8 | 21 |

An 8-space route is the biggest single score in either game and, at 2.63 points
per train, the most efficient — but committing eight cards of one colour is a
multi-turn project that everyone at the table can see coming.

### 9.7 Changed Final Scoring

Score as §7, with two additions:

* **+4** per **unused station**.
* Long Route tickets score (or cost) their full 20–21 points, making them the
  single largest swing in the game.

### 9.8 Base vs. Continental at a Glance

| | Base (North America) | Continental (Europe) |
| --- | --- | --- |
| Cities | 36 | 47 |
| Longest route | 6 | 8 |
| Trains per player | 45 | 45 |
| Destination tickets | 30 | 46 (40 + 6 Long Route) |
| Starting tickets | 3, keep 2 | 3 + 1 Long Route, keep 2 |
| Tunnels | — | Yes |
| Ferries | — | Yes |
| Stations | — | 3 per player, +4 each if unused |
| Longest-path bonus | Long Haul, +10 | Continental Express, +10 |
| Combines with base map | n/a | No — alternative board, not a layer |

### 9.9 Further Expansion Space

Should *Train Time* justify more content beyond Continental, the natural next
steps (in rough order of implementation cost) are:

* **Alternative ticket decks** for the base map — a "1910-style" larger deck
  with bigger tickets and a "Mega Game" variant that uses every ticket. Cheap
  to build: no new mechanics, only data.
* **Regional maps** (a single country, a single coastline) sized for 2–3
  players, using the base rules with a tighter board.
* **Warehouses / depots** — a Continental-style station variant that stores
  cards rather than granting passage.

Each of these should extend the existing engine rather than fork it; only
Continental warrants its own board renderer and rules branches.

---

## 10. Asynchronous Play Adaptation

*Train Time* is unusually well suited to this app: turns are short, exactly one
action long, and carry no negotiation. A few points need explicit handling in
an asynchronous implementation.

* **Hidden information.** A player's hand of carriage cards and their
  Destination Tickets must be redacted from every other player's game-state
  response — only *counts* are public. Tickets stay hidden until final scoring,
  at which point the full set is revealed to everyone in the result summary.
* **The face-up market is shared state.** Because opponents move while you are
  away, the market you saw when you were notified may not be the market you get.
  The UI must show the live market at render time and validate draws
  server-side, rejecting a draw against a card that has already gone.
* **Draws are the turn.** "Draw two cards" is two client interactions but one
  turn. Model it as a single command carrying both choices where possible, or
  as a two-step turn that only ends when the second card is taken — never leave
  a turn half-finished across a notification boundary if it can be avoided.
* **Tunnel resolution is server-side.** The 3-card flip must be resolved by the
  server from the authoritative deck order, and the result returned in the
  command response so the client can animate it. The player then either pays
  the surcharge or withdraws — a second decision point inside the same turn, so
  the turn is not complete until they answer.
* **Turn timers.** The standard `TurnTimerSelect` values apply. A timeout should
  resolve to the safest legal action — draw two cards from the deck — rather
  than forfeiting, since a skipped turn in a race-to-exhaust game is close to a
  loss.
* **Turn recap.** Each turn produces a compact, highly readable diff: cards
  drawn (public source only), route claimed, points scored, trains remaining.
  This is ideal material for the "since you were last here" recap described in
  [`docs/since-you-were-last-here.md`](../since-you-were-last-here.md).
* **End-game trigger.** The final-round rule ("everyone gets one more turn")
  needs an explicit flag in game state recording *which* player triggered it,
  so the engine knows where the last lap stops rather than counting turns.

---

## 11. Implementation Status

**Not yet implemented.** This document is a design specification only; there is
no `src/games/TrainTime/` module. When it is built, follow the checklist in
[`docs/new-game.md`](../new-game.md) and the architecture rules in
[`ARCHITECTURE.md`](../../ARCHITECTURE.md), and reuse the existing setup-screen
building blocks (`GameSetupLayout`, `UserInviteList`, `TurnTimerSelect`) plus a
`src/utils/ui/games.ts` entry rather than rebuilding them.

Suggested build order:

1. **Base map, no tickets** — board data, carriage deck, market, route claiming
   and route scoring. This is a complete playable loop on its own.
2. **Destination Tickets** — dealing, redaction, the keep-at-least-N choice, and
   connectivity checking at scoring time (a straightforward union-find or BFS
   over claimed routes).
3. **End-game and bonuses** — the final-round trigger and the longest-path
   calculation (§7), which is the only computationally interesting part: it is
   a longest-trail search over the player's claimed-route graph.
4. **Continental (§9)** — a second board plus tunnels, ferries and stations,
   gated behind an expansion flag on `specificGameState` in the same style as
   [`src/games/SettlementsAndCities/expansions.ts`](../../src/games/SettlementsAndCities/expansions.ts).

Keep the command surface small: `TrainTimeDrawCarriageCard { source }`,
`TrainTimeClaimRoute { routeId, cards }`, `TrainTimeDrawTickets` /
`TrainTimeKeepTickets { keep }`, and — for Continental —
`TrainTimeResolveTunnel { pay }` and `TrainTimePlaceStation { cityId, cards }`.
