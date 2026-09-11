# Banned Islet — Game Design Document

**Genre:** Cooperative set-collection / spatial survival
**Players:** 2–4 (co-op, no traitor)
**Play time:** 30 minutes
**Age:** 8+
**Complexity:** Light (approx. 1.8 / 5)

---

## Contents

- [1. High Concept](#1-high-concept)
- [2. Design Pillars](#2-design-pillars)
- [3. Player Experience Goals](#3-player-experience-goals)
- [4. Objectives](#4-objectives)
  - [4.1 Victory Condition](#41-victory-condition)
  - [4.2 Defeat Conditions](#42-defeat-conditions)
- [5. Components Manifest](#5-components-manifest)
  - [5.1 Island Anatomy](#51-island-anatomy)
  - [5.2 The Tiles](#52-the-tiles)
- [6. Setup Procedure](#6-setup-procedure)
- [7. Core Gameplay Loop](#7-core-gameplay-loop)
- [8. Action Catalogue](#8-action-catalogue)
- [9. Tile States and Swimming](#9-tile-states-and-swimming)
  - [9.1 The Three States](#91-the-three-states)
  - [9.2 Swimming](#92-swimming)
- [10. The Treasure Deck](#10-the-treasure-deck)
- [11. The Flood Deck and the Water Meter](#11-the-flood-deck-and-the-water-meter)
- [12. Roles & Abilities](#12-roles--abilities)
- [13. Difficulty Tuning](#13-difficulty-tuning)
- [14. Systems Analysis](#14-systems-analysis)
  - [14.1 The Two Economies](#141-the-two-economies)
  - [14.2 The Ratchet](#142-the-ratchet)
  - [14.3 Tension Curve](#143-tension-curve)
- [15. Known Failure Modes & Mitigations](#15-known-failure-modes--mitigations)
- [16. Edge Cases & Adjudication](#16-edge-cases--adjudication)
- [17. Accessibility & Table Presence](#17-accessibility--table-presence)
- [18. Iteration Hooks](#18-iteration-hooks)
- [19. Glossary](#19-glossary)
- [20. Quick Reference](#20-quick-reference)
- [21. Implementation Plan](#21-implementation-plan)
  - [21.1 What the engine already gives us](#211-what-the-engine-already-gives-us)
  - [21.2 What the engine does not give us yet](#212-what-the-engine-does-not-give-us-yet)
  - [21.3 Deviations from this document](#213-deviations-from-this-document)
  - [21.4 State and command surface](#214-state-and-command-surface)
  - [21.5 Turn recap & planning](#215-turn-recap--planning)
  - [21.6 The PRs](#216-the-prs)
  - [21.7 Testing](#217-testing)

---

## 1. High Concept

A small team of adventurers lands on a sinking island to lift four relics off it
before the sea takes them. Every turn the island loses ground: tiles flood, then
sink and are gone for good, taking the path home with them. Players do not
compete — they win together or lose together, and the adversary is a deck that
eats the board they are standing on.

**One-line pitch:** *Four treasures, one shrinking island, and a deck that
deletes the floor under your feet.*

---

## 2. Design Pillars

| Pillar | Description | How it manifests |
|---|---|---|
| **The floor is the clock** | The thing running out is the board itself, not an abstract track. Loss is visible as a hole where a tile used to be. | Flood → sink → tile removed permanently |
| **Shared table, shared brain** | All information is open. The game is a conversation about routes. | Open hands, open discards, no hidden agendas |
| **Triage over optimisation** | Three actions a turn against an island losing two to five tiles. Success is choosing what to abandon. | Fixed 3 actions; flood rate outruns shoring |
| **Asymmetric competence** | Each player breaks one spatial rule, so each player owns a problem nobody else can solve. | 6 roles, each a movement or shoring exception |
| **Short, sharp, repeatable** | A loss should cost 20 minutes, not an evening, so the next attempt starts immediately. | Four difficulties on one dial; 30-minute sessions |

The pillar list is deliberately close to Outbreak's (`outbreak-gdd.md` §2) — the
two games are cousins — but the third pillar resolves differently. Outbreak's
board deteriorates and can be pushed back; **Banned Islet's board only
deteriorates**. Shoring buys a turn, never a recovery.

---

## 3. Player Experience Goals

1. **Opening (turns 1–2): A map, not a crisis.** Six tiles are already flooded.
   Players read the island and plan routes.
2. **First Waters Rise!: the forecast rewrites itself.** The flood discard —
   which everyone had been reading as "these are safe for a while" — goes back
   on top of the deck and hits the same tiles again.
3. **Midgame: the island splits.** A sunk tile severs two halves of the board
   and somebody is suddenly on the wrong side of the gap.
4. **Late game: the runway.** Everything is about Beacon Pier and the tiles that
   still reach it. Treasures are captured on the way past, not detoured to.
5. **Resolution: lift-off or drowning.** Wins should come down to one or two
   tiles. A comfortable win means the water level dial was set too low.

**Target win rate:** roughly 50–65% at Normal for competent groups — deliberately
kinder than Outbreak's 30–45%, because the session is half as long and the
restart is the point.

---

## 4. Objectives

### 4.1 Victory Condition

Players win when **all four** of the following hold at once, and a player plays a
**Helicopter Lift** card:

1. All four treasures have been captured.
2. Every player's pawn is on **Beacon Pier**.
3. Beacon Pier has not sunk.
4. Someone holds a Helicopter Lift card to play.

The win is therefore an *action taken*, not a state reached — the team can be one
card short of escaping with everything else done, which is the design's most
memorable failure and worth preserving.

### 4.2 Defeat Conditions

The team loses immediately if **any** of the following occurs:

| Condition | Trigger | Design purpose |
|---|---|---|
| **The pier is gone** | Beacon Pier sinks | The single point of failure everyone must defend; creates a permanent second job |
| **A treasure is lost** | Both tiles of an uncaptured treasure sink | Punishes deferring a treasure indefinitely; makes the flood discard worth reading |
| **A player drowns** | A player's tile sinks and they have no legal swim (§9.2) | Punishes wandering to the island's edges alone |
| **The sea wins** | The water level reaches 10 | The hard clock; caps game length |

Four distinct failure vectors mean no single defensive strategy is sufficient:
shoring the pier every turn loses treasures, and chasing treasures loses the
pier.

As in Outbreak (§4.2 there), the ending has to say *which* one it was: each
records the clause naming it as the game's `endDetail` (see ARCHITECTURE.md,
"Match results"), and the finish banner, the result page and the "your team
lost" push all read it back.

---

## 5. Components Manifest

| Component | Qty | Notes |
|---|---|---|
| Island tiles | 24 | Double-sided: dry face / flooded face. Removed from the board when sunk |
| Treasure figures | 4 | Ember Crown, Storm Idol, Tide Chalice, Root Stone |
| Adventurer pawns | 6 | One per role |
| Role cards | 6 | Defines each player's spatial rule exception |
| Treasure deck | 28 | 20 treasure cards (5 each) + 3 Waters Rise! + 3 Helicopter Lift + 2 Sandbags |
| Flood deck | 24 | One card per island tile |
| Water meter | 1 | Ten levels; the tenth is the skull |
| Reference cards | 4 | Action summary, one per player |

### 5.1 Island Anatomy

The 24 tiles are laid out in a **diamond inside a 6 × 6 grid**, with row widths
2 / 4 / 6 / 6 / 4 / 2:

```
        ■ ■
      ■ ■ ■ ■
    ■ ■ ■ ■ ■ ■
    ■ ■ ■ ■ ■ ■
      ■ ■ ■ ■
        ■ ■
```

- **Adjacency is orthogonal only** — up, down, left, right. Diagonals are not
  adjacent (the Explorer, §12, is the exception that makes this rule matter).
- **The grid is fixed; the tiles are not.** The 24 named tiles are shuffled into
  the 24 positions at setup, so the island's shape is constant and its *contents*
  are different every game. Beacon Pier may be dead centre or hanging off a
  corner, which is most of the game's replay value.
- **A sunk tile leaves a hole**, not a gap that closes. Adjacency is computed
  from grid positions, so a hole permanently severs the routes that ran through
  it.

### 5.2 The Tiles

| Tile | Role |
|---|---|
| **Beacon Pier** | The escape point (§4.1). Pilot's start |
| **Cinder Temple**, **Ashfall Hollow** | Ember Crown |
| **Whistling Spire**, **Gale Terrace** | Storm Idol |
| **Coral Vault**, **Weeping Well** | Tide Chalice |
| **Mossgrave**, **Deepwood Steps** | Root Stone |
| **Bramble Gate** | Engineer's start |
| **Twin Palms** | Explorer's start |
| **Misty Shallows** | Diver's start |
| **Lantern Walk** | Messenger's start |
| **Watcher's Rock** | Navigator's start |
| **Salt Market**, **Broken Causeway**, **Crab Flats**, **The Long Dune**, **Kelp Stair**, **Driftwood Camp**, **Gull Shelf**, **Tern Hollow**, **Old Anchorage**, **Shell Road** | Plain tiles |

Ten plain tiles is the tuning knob for how forgiving the island is: they are the
ones the team can afford to lose, and there are deliberately fewer of them than
tiles that matter.

---

## 6. Setup Procedure

1. **Shuffle the 24 island tiles** into the 24 grid positions of §5.1, dry side
   up.
2. **Flood six tiles.** Shuffle the flood deck, flip six cards, and turn those
   six tiles to their flooded face. The six cards go to the flood discard.
3. **Place the four treasure figures** beside the board, uncaptured.
4. **Deal roles.** One role card at random per player; place each pawn on that
   role's start tile (§5.2). If that tile is already flooded, the pawn still
   starts there — a flooded tile is standable.
5. **Deal starting hands.** Two cards per player from the shuffled treasure
   deck, **with the three Waters Rise! cards set aside**; shuffle them back into
   the deck afterwards. Nobody starts the game already drowning.
6. **Set the water meter** to the starting level for the chosen difficulty
   (§13).
7. **First player:** dealt at random.

Step 5's set-aside is the same variance-control instinct as Outbreak's
pile-built deck (`outbreak-gdd.md` §6 step 7): both exist so that the opening
two minutes cannot be ruined by the shuffle.

---

## 7. Core Gameplay Loop

Play proceeds in turn order. A turn has three mandatory phases in fixed order:

```
┌─────────────────────────────────────────────┐
│  PHASE 1 — Take up to 3 Actions             │
│    Any combination, repeats allowed,        │
│    may be forfeited                         │
├─────────────────────────────────────────────┤
│  PHASE 2 — Draw 2 Treasure Cards            │
│    Resolve Waters Rise! immediately         │
│    Enforce the 5-card hand limit            │
├─────────────────────────────────────────────┤
│  PHASE 3 — Flood the Island                 │
│    Draw cards = current flood rate          │
│    Dry → flooded; flooded → SUNK            │
└─────────────────────────────────────────────┘
```

Phase 1 is the only phase the players control and it is sandwiched between two
phases that only ever make things worse. At water level 2 the island loses two
tile-states a turn against three actions, at most three of which can be shoring —
so the team is never more than break-even, and the margin shrinks every time the
meter climbs.

---

## 8. Action Catalogue

Three actions per turn. Actions may be repeated and may be skipped.

| Action | Effect | Notes |
|---|---|---|
| **Move** | Move your pawn to an orthogonally adjacent tile | Dry or flooded only; never onto a hole |
| **Shore Up** | Flip your tile, or an adjacent one, from flooded back to dry | Cannot un-sink. The only way to give ground back |
| **Give a Treasure Card** | Hand one treasure card to a player on your tile | The only transfer; the Messenger (§12) breaks it |
| **Capture a Treasure** | Discard 4 matching treasure cards while standing on either of that treasure's tiles | Free of hand-limit concerns: the discard happens as part of the action |
| **Pass** | Forfeit the rest of your actions | Ends Phase 1 early; the turn still draws and floods |

Special cards (Helicopter Lift, Sandbags — §10) are **not** actions and do not
cost one.

The catalogue is deliberately four verbs long. Outbreak needs eight actions
because it has two boards' worth of state (cubes and cures); Banned Islet has
exactly one piece of state per tile, and a longer list would only be a longer
list.

---

## 9. Tile States and Swimming

### 9.1 The Three States

```
   DRY  ──flood card──▶  FLOODED  ──flood card──▶  SUNK
    ▲                       │                        │
    └──────Shore Up─────────┘                   (permanent)
```

- **Dry.** Normal. Pawns stand on it, it can be moved through.
- **Flooded.** Identical to dry for movement — the difference is entirely that
  the *next* flood card removes it. This is the design's central bluff: a flooded
  tile is not a damaged tile, it is a tile with one life left.
- **Sunk.** The tile is removed from the board and **its flood card is removed
  from the game**, permanently shrinking the flood deck. Nothing can bring it
  back.

Removing the flood card is easy to miss and mechanically vital: it is why the
late game floods the *same* remaining tiles over and over, and why the island
collapses faster than a linear reading of the water meter suggests.

### 9.2 Swimming

When a tile sinks with a pawn on it, that pawn **swims** to an adjacent
non-sunk tile immediately. If there is no such tile, the game is lost (§4.2).

Role exceptions widen the swim: the Diver swims through any number of
contiguous missing/flooded tiles to the nearest land, the Explorer may swim
diagonally, and the Pilot may swim to any tile on the island.

Swimming is the rule this design and the async engine disagree about most, and
§21.3 records how that disagreement is settled — mechanically, by a pure
function, rather than by asking a player who is not there.

---

## 10. The Treasure Deck

28 cards, drawn two at a time in Phase 2 and discarded to a public pile.

| Card | Qty | Effect |
|---|---|---|
| **Treasure card** (Ember Crown / Storm Idol / Tide Chalice / Root Stone) | 5 each | Collect 4 of a kind to capture that treasure (§8) |
| **Waters Rise!** | 3 | Not held: resolve and discard immediately (§11) |
| **Helicopter Lift** | 3 | Move any number of pawns from one tile to any other tile. The escape card (§4.1) |
| **Sandbags** | 2 | Shore up any one tile anywhere on the island |

**Hand limit: 5.** Checked at the end of Phase 2; excess cards are discarded by
the holder. Special cards may be played rather than discarded to get under the
limit, which is the only way Sandbags reliably reaches the board.

Five copies per treasure against a four-card cost is a deliberately thin margin:
lose two Ember Crowns to a hand-limit discard and that treasure is now on a
timer of its own. The treasure discard is public precisely so the team can see
that timer.

When the treasure deck is exhausted, shuffle the discard pile to form a new
deck. Unlike the flood deck, this is routine rather than a crisis — treasure
cards are not removed from the game.

---

## 11. The Flood Deck and the Water Meter

Phase 3 draws flood cards equal to the **flood rate**, which is read from the
water meter:

| Water level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **Flood rate** | 2 | 2 | 3 | 4 | 4 | 5 | 5 | 6 | 6 | 💀 |

Level 10 is not a rate — it is the loss (§4.2).

**Waters Rise!**, drawn in Phase 2, resolves in three steps, in order:

1. **Raise** the water meter one level. If it reaches 10, the game ends now.
2. **Shuffle the flood discard pile** and place it **on top** of the flood deck.
3. Discard the Waters Rise! card.

Step 2 is the whole game. Everything the island has already suffered comes back
to the top of the deck, which means **flooded tiles are about to sink, and the
tiles that sink are the ones already hurt**. There is no second chance to shore
them; the cards are already on their way.

Note the interaction with §9.1: because a sunk tile's flood card leaves the
game, each Waters Rise! shuffles back a *smaller* pile of increasingly dangerous
cards. The deck concentrates.

**If the flood deck empties mid-draw**, shuffle the discard to form a new deck
and continue the draw. With only 24 cards and a rate reaching 6, this happens in
most Elite and Legendary games and is not an exception case — it is the endgame.

---

## 12. Roles & Abilities

Six roles, dealt at random, each bending exactly one spatial rule.

| Role | Ability | What it is for |
|---|---|---|
| **Pilot** | Once per turn, fly to any tile on the island for 1 action | Solves the "wrong side of the hole" problem outright; the strongest role and the one the team plans around |
| **Engineer** | Shore up two tiles for 1 action | Doubles the only defensive action in the game; keeps Beacon Pier alive |
| **Explorer** | Moves and shores up diagonally | Converts a severed island back into a connected one |
| **Diver** | For 1 action, move through any number of contiguous flooded or sunk tiles to the nearest land | The only pawn a collapsing island cannot strand; the rescue role |
| **Messenger** | Give treasure cards to any player anywhere, for 1 action | Removes the "meet in person" tax that otherwise eats half the team's actions |
| **Navigator** | Move another player up to 2 adjacent tiles for 1 action | Buys actions for whoever is furthest from where they need to be |

**Role balance note.** The Pilot and Diver both solve connectivity; the Engineer
and Explorer both solve survivability; the Messenger and Navigator both solve
the action economy. A hand of two roles from the same pair is the worst draw and
is the main cause of an unwinnable-feeling game. This is accepted — the session
is 30 minutes — but it is the first thing to revisit if the win rate misses §3's
target.

---

## 13. Difficulty Tuning

One dial, set at creation: the **starting water level**.

| Difficulty | Start level | Opening flood rate | Waters Rise! cards needed to lose |
|---|---|---|---|
| **Novice** | 1 | 2 | 9 (more than exist — the meter cannot reach 10) |
| **Normal** | 2 | 2 | 8 (likewise unreachable) |
| **Elite** | 3 | 3 | 7 |
| **Legendary** | 4 | 4 | 6 |

With only three Waters Rise! cards in a 28-card deck, **the water meter is not
actually a loss condition in a single pass of the deck** — it becomes one only
once the treasure deck has been reshuffled, which happens in long games. This is
intentional: at Novice and Normal the team loses to the island, not the clock,
and the meter is a difficulty multiplier rather than a timer. At Legendary it is
both.

---

## 14. Systems Analysis

### 14.1 The Two Economies

| | **Actions** | **Cards** |
|---|---|---|
| **Supply** | 3 per player per turn, fixed | 2 per player per turn, effectively unlimited |
| **Spent on** | Movement, shoring, transfers | Captures |
| **Constrained by** | Distance, holes in the island | Hand limit (5), matching |
| **Failure if depleted** | Tiles sink; the island severs | A treasure's tiles sink uncaptured |

The tension is different from Outbreak's, and the difference is worth stating
because the two games look alike. Outbreak's cards are the scarce resource and
are spent on *both* movement and cures, so every flight is a fraction of a cure
destroyed. Banned Islet's cards are nearly free; its scarcity is **positional**.
The question is never "can we afford this?" — it is "can we get there and back
before the route stops existing?"

### 14.2 The Ratchet

The Waters Rise! shuffle is the mechanical heart of the design, and it ratchets
harder than Outbreak's Intensify does:

- Intensify re-seeds cities that already have cubes; cubes can be treated away.
  **Flood cards re-seed tiles that are already flooded, and a flooded tile hit
  again is gone forever.**
- Sunk tiles remove their flood cards, so the deck shrinks around the survivors.
- The flood discard is therefore a *visible, growing, shrinking* threat forecast:
  everything in it will come back, sooner each time.

Reading the discard is the skill the design rewards, exactly as it is in
Outbreak — which is why both games make that pile public and rendered (§21.4).

### 14.3 Tension Curve

```
Tiles remaining
 24 │╲
    │ ╲──╲
    │      ╲───╲
    │           ╲──╲
    │                ╲─╲
    │                    ╲╲
  0 │                      ╲
    └────────────────────────────────► Time
      WR1      WR2        WR3

  Each Waters Rise! steepens the slope (rate ↑, discard returns)
  Shoring flattens it locally, never reverses it
```

The curve is monotonic and accelerating, and the game must end before it reaches
zero. Every design decision above — the 4-card capture cost, the 5-card hand
limit, the 3 actions — is calibrated against how fast this line falls.

---

## 15. Known Failure Modes & Mitigations

| Failure mode | Symptom | Mitigation in design |
|---|---|---|
| **Quarterbacking** | One experienced player dictates every move; others disengage. | Asymmetric roles give each player authority over one problem; the active player decides. Shared with Outbreak (§15 there) and equally unsolved |
| **The pier tax** | The team spends every action shoring Beacon Pier and never captures anything. | The treasure-loss condition (§4.2) punishes pure defence directly; Sandbags and the Engineer exist to make the tax affordable |
| **Analysis paralysis** | Perfect information plus a spatial puzzle extends turns indefinitely. | Three actions and four verbs bound the search space hard |
| **The unwinnable opening** | Two roles from the same pair (§12) plus an unlucky six-tile flood. | Accepted: the session is short and the restart is one tap. Watched as the first tuning lever if §3's win rate misses |
| **The anticlimactic win** | Team captures everything by turn 6 and strolls to the pier. | Waters Rise! placement is random, so the late game is never guaranteed calm; Elite and Legendary exist for groups who find Normal soft |

---

## 16. Edge Cases & Adjudication

- **Two Waters Rise! in one draw phase.** Resolve the first fully (raise,
  shuffle, discard) before drawing the second. The second shuffle picks up the
  first one's discard pile including cards it just placed — this is correct and
  brutal.
- **A tile sinks during a Waters Rise! resolution.** It cannot: Waters Rise!
  never draws flood cards, it only re-orders them. Sinking happens exclusively
  in Phase 3 and via the flood draws of Phase 3.
- **The last tile of a treasure sinks while a player holds all four cards.** The
  treasure is lost and the game ends. Holding the cards is not capturing them;
  the capture is an action and actions happen in Phase 1.
- **A player's tile sinks and their only swim is onto another flooded tile.**
  Legal. Flooded is standable (§9.1).
- **Beacon Pier sinks while every player is standing on it.** The pier loss
  (§4.2) fires first; it does not matter where the pawns were.
- **Shore Up on a dry tile.** Illegal, not a no-op — it must be rejected rather
  than silently consuming an action.
- **Capturing with a hand of exactly four matching cards while over the hand
  limit.** The limit is checked at the end of Phase 2 and captures happen in
  Phase 1, so a player cannot hold six cards into their next turn to capture
  later.
- **Helicopter Lift played to win.** All four conditions of §4.1 are checked at
  the moment the card is played; the card is spent either way.
- **Sandbags on a sunk tile.** Illegal — Shore Up never un-sinks (§9.1).
- **The flood deck empties mid-draw.** Reshuffle the discard and continue the
  same draw (§11), rather than truncating it.

---

## 17. Accessibility & Table Presence

- **State is read from tile *orientation*, not colour** — dry versus flooded is a
  different face, and sunk is an absent tile. This is a genuine accessibility win
  over Outbreak's four-colour cubes and should not be given up in the digital
  version by rendering flooding as a blue tint alone: the flooded face needs its
  own art and its own icon.
- **Treasures are four distinct silhouettes**, not four colours, for the same
  reason.
- **Footprint** is small — a 6 × 6 grid — which is what makes this design fit a
  phone screen better than any other co-op in the repo.
- **No hidden information and no player elimination**, so a late arrival can be
  brought up to speed from the board alone.

---

## 18. Iteration Hooks

- **A second island shape.** The grid is data (§5.1); a cross, a ring or an
  isthmus changes the whole game and costs one table.
- **More roles.** The cheapest expansion vector, exactly as in Outbreak: each
  new role is one spatial exception.
- **A fifth treasure**, breaking the symmetry of two tiles per treasure.
- **Tile traits** — a tile that cannot be shored, a tile that floods two others
  with it. High impact, high risk of turning a clean design muddy.
- **Campaign scarring**, carrying sunk tiles from one session into the next.

---

## 19. Glossary

| Term | Definition |
|---|---|
| **Adjacent** | Orthogonally neighbouring on the 6 × 6 grid, and not sunk. Diagonals are not adjacent (Explorer excepted) |
| **Capture** | Discarding 4 matching treasure cards on a matching tile to claim a treasure |
| **Dry / Flooded / Sunk** | The three tile states (§9.1). Sunk is permanent and removes the tile's flood card |
| **Flood rate** | Flood cards drawn in Phase 3, read from the water meter (§11) |
| **Shore Up** | Flipping a flooded tile back to dry — the only action that gives ground back |
| **Swim** | The forced move a pawn makes when its tile sinks under it (§9.2) |
| **Waters Rise!** | A treasure card that raises the meter and returns the flood discard to the top of the deck |

---

## 20. Quick Reference

**Turn:** 3 Actions → Draw 2 Treasure Cards → Flood (cards = flood rate)

**Actions:** Move · Shore Up · Give a Treasure Card · Capture a Treasure · Pass

**Capture cost:** 4 matching cards, standing on either of that treasure's tiles

**Hand limit:** 5

**Waters Rise!:** meter +1 → shuffle flood discard onto the top of the flood deck

**Sinking:** dry → flooded → sunk; a sunk tile and its flood card leave the game

**Win:** all 4 treasures captured · everyone on Beacon Pier · play Helicopter Lift

**Lose:** Beacon Pier sinks · both tiles of an uncaptured treasure sink · a
player cannot swim · water level 10

---

## 21. Implementation Plan

Nothing in `src/games/BannedIslet/` exists yet. This section is the bridge
between the design above and the codebase: what the engine already provides,
what it doesn't, the concessions async play forces, and the order to build it
in.

Read [`docs/new-game.md`](../new-game.md) and
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 first — the checklist and the
command pattern are assumed here rather than repeated.
[`outbreak-gdd.md`](./outbreak-gdd.md) §21 is the sibling plan and the one to
read alongside this: Banned Islet is the third co-op in the repo and inherits
everything the first two paid for.

### 21.1 What the engine already gives us

| Need | Provided by |
|---|---|
| Invite, accept, create a game | The shared invitation engine — one `BannedIsletInvitationModel` with a `CreateGame` |
| Persist and mutate board state | `GameData` discriminator + `specificGameState` |
| A move that validates, mutates and logs | `IGameCommand.Execute` |
| A turn made of several commands (3 actions, then a discard) | `turnOver: false` on the outcome, as Outbreak's action/end-turn/discard trio already does |
| **A shared win or loss for the whole table** | `finishGame()` (`src/utils/games/finishGame.ts`) plus `'teamwin'`/`'teamloss'` on `GameEndReason` — built for Outbreak, inherited free |
| **A game-specific turn timeout** | `registerTurnTimeoutAdapter` / `resolveStalledTurn` (`src/utils/games/turnTimeout.ts`) — likewise |
| Running a command identically live, on replay and on timeout | `runCommand` (`src/utils/games/commandPipeline.ts`) |
| A per-game registry | `createAdapterRegistry` (`src/utils/games/adapterRegistry.ts`) |
| Symmetric adjacency from an edge list | `buildSymmetricAdjacency` / `isAdjacentIn` (`src/utils/games/adjacencyGraph.ts`) |
| Shuffling anything | `shuffle()` in `src/utils/games/shuffle.ts` |
| Six pawn and scoreboard colours | `playerColour()` in `src/utils/ui/playerColours.ts` — exactly six, which is the role cap |
| "It's your turn" push, turn timers, surrender, rematch | The command pipeline, the turntimer cron, `/api/game/end`, `GameFinishBanner` |
| Per-turn boards for the recap | `buildTimeline()`, given a replay adapter and recorded RNG |

Two non-uses worth stating so nobody reaches for them:

- **`src/utils/games/Cards.ts` is not on that list.** It is rank/suit playing-card
  logic written for Solitaire. Treasure cards share nothing with it but the word
  "deck" — the same call Outbreak made (§21.1 there).
- **`MapEdges` / `ClickableMapNode` / `MapLabelLayer` are not on it either.**
  Those exist for node-and-edge maps drawn over art (World Domination, Outbreak,
  Train Time). Banned Islet is a 6 × 6 grid whose adjacency is implied by
  position and never drawn, so its board is a CSS grid inside `ag-board-frame`
  in the shape of `FiresOutBoard.tsx`'s `.ag-fo-grid`, not an SVG node map.
  Drawing 40-odd invisible edges to reuse a component would be the expensive
  kind of reuse.

### 21.2 What the engine does not give us yet

**The two co-op gaps are already closed.** Outbreak's §21.2 named them — no
shared outcome, and a turntimer cron that could only advance `currentTurn` — and
its steps 1 and 7 closed both. Banned Islet has the same shape of problem in
both places (a skipped turn is a turn the island doesn't flood, so timing out
would be the strongest play at the table) and pays nothing for either: it calls
`finishGame` with `'teamloss'` and registers one `ITurnTimeoutAdapter`.

That leaves two much smaller gaps, neither of which blocks the first PR:

**1. `GameResultEventIcon` is a closed union.** It is
`'landmark' | 'explosion' | 'rescue' | 'epidemic'` in `GameDataApi.ts`, with art
per name in `ChartEventIcon.tsx`, deliberately so the marker can be recoloured
per chart line. A sinking-tile marker needs one name added there and one drawing
added beside the others — **not** a game-local glyph, which
`mapEventsToRounds` would drop rather than draw.

**2. Cross-player planning is still clamped to the caller.** The timeline route
sets `command.senderId = userId` on every planned command ("for v1 planning we
only let a user plan their own moves"), so Outbreak's crew planner — and the
route planner of 21.5 — still needs that opt-in built. Whoever builds it first
pays for it; the second game registers. It is the last PR here, and optional.

**The forced swim of §9.2 is deliberately not a third gap.** A tile only sinks
during the active player's own Phase 3, so the pawn that swims is moved by a
command that player sent, inside an `Execute` that is already running. Nothing
out-of-turn happens and nothing needs to prompt an absent player — see the
deviation below for what that costs the design.

### 21.3 Deviations from this document

Async play forces five. Record each in a "Deviations" subsection of this
document as it lands.

* **A swim is resolved by rule, not by the swimmer.** §9.2 gives the drowning
  player the choice of tile. Their tile sinks during somebody else's turn, and
  `POST /api/game/command` rejects every command from a user who isn't
  `currentTurn` — so the choice would have to become an out-of-turn
  authorisation path *and* a pause that stalls the game for however many hours
  it takes that player to open the app. Both are rejected. `resolveSwim()` in
  `rules.ts` is a pure, total function of board state: prefer a dry adjacent
  tile over a flooded one, break ties by the shortest surviving route to Beacon
  Pier, and break remaining ties by the lowest tile id. It is the one piece of
  this game where the app decides something a player would have decided, so it
  must be **legible** (the swim gets its own log line and its own recap row, not
  a silent pawn teleport) and it must be **cheap to undo** — one Move action on
  the swimmer's own next turn, which the tie-break toward the pier is chosen to
  make rare.
* **Special cards are playable only on your own turn**, at any point in your
  action phase, and during your own draw phase to duck the hand limit. §10 has
  them playable at any moment by anyone, which the command route cannot express
  and which means nothing when turns are hours apart. **Sandbags loses the
  most** — its whole point is reacting to a flood card — and drops to "shore
  anywhere, free" as a result; Helicopter Lift loses almost nothing, since the
  escape play (§4.1) is taken on a turn anyway.
* **The Navigator moves a teammate without consent** (§12), the same call
  Outbreak makes for Airlift: co-op means no adversarial use, and the moved
  player can see where they were put.
* **Discussion is out of band.** §2's "shared table, shared brain" pillar rests
  on players talking about routes. In-game chat exists (`docs/in-game-chat.md`)
  but the design must not lean on it: open hands, a public flood discard and a
  legible board are what carry the pillar, so a silent table plays as well as a
  chatty one.
* **A player who drops out ends the game for everybody** — the cron's abandon
  path, reading as "the team lost", exactly as in the other two co-ops.

### 21.4 State and command surface

`specificGameState`:

```ts
{
  difficulty: 'novice' | 'normal' | 'elite' | 'legendary',
  // 24 entries, indexed by GRID POSITION; `tile` names which of the 24 named
  // tiles was shuffled into that position at setup (§5.1).
  positions: { tile: TileId, state: 'dry' | 'flooded' | 'sunk' }[],
  waterLevel: number,                 // 1–10
  treasures: Record<TreasureId, boolean>,   // captured
  treasureDeck: CardId[],             // top first — redacted to a count
  treasureDiscard: CardId[],          // public
  floodDeck: TileId[],                // top first — redacted to a count
  floodDiscard: TileId[],             // public, and the most-read thing on screen
  players: Map<userId, {
      hand: CardId[],                 // public by design (§2)
      position: number,               // grid index, not tile id
      role: RoleId,
      actionsLeft: number,
      pilotFlightUsed: boolean,       // the one once-per-turn ability (§12)
  }>,
  phase: 'actions' | 'discard',
}
```

**One map of per-player subdocuments, not parallel maps** — the shape both
existing multiplayer games and both co-ops use, giving `gameStateToModel` one
redaction loop and one `markModified` surface.

**Pawns live on grid positions, not tile ids.** Movement, adjacency and swimming
are all spatial, and a sunk tile still occupies a hole in the grid that routes
have to go around (§5.1). Storing a pawn's tile id would mean resolving position
from tile on every single legality check.

**`actionsLeft` lives on the player and refills at the start of that player's
turn**, the same persisted-schema decision Outbreak's §21.4 explains at length —
it is what lets a plan cross from one player to the next without stalling on an
exhausted counter, and it costs nothing to do it this way from day one.

Four command classes, not fifteen:

| Command | Covers |
|---|---|
| `BannedIsletAction { kind, … }` | Move · Shore Up · Give Card · Capture · Pass, plus the two role kinds that aren't one of those (`pilotFlight`, `navigatorMove`) |
| `BannedIsletPlayCard { cardId, … }` | Helicopter Lift (including the §4.1 win) and Sandbags |
| `BannedIsletEndTurn` | Phase 2 and Phase 3: draw two, Waters Rise!, flood, sink, forced swims, the loss checks |
| `BannedIsletDiscard { cardIds }` | Coming back down to the 5-card hand limit |

**`BannedIsletEndTurn` is deliberately separate from the last action**, and is
the only command in the game that touches a deck. The third action returns
`turnOver: false` and the client follows it with `BannedIsletEndTurn`; if the
draw leaves the player over the limit, `phase` becomes `'discard'` and the turn
stays open until `BannedIsletDiscard` closes it. That split is what makes the
turn-timeout adapter straightforward (PR 7) and the route planner possible at
all (21.5), and it is exactly Outbreak's shape — deliberately, so the third
co-op does not invent a fourth turn structure.

Do **not** trigger the draw from `CheckEndTurn`: it runs during replay too, so
the deck would fire inside a plan with no command accounting for it.

**Redaction.** Both deck orders are redacted to counts in `gameStateToModel`
(`docs/new-game.md`, "Don't leak hidden information"). Both *discards* are
public and must be rendered rather than hidden: reading the flood discard is the
skill §14.2 is built to reward, and hiding it would remove the game's only
forecast. Hands are public by §2 — which is a decision the croupier should be
asked to confirm against `hiddenHands.test.ts` when `apiModels.ts` lands, not
one to assume.

**Recorded randomness.** Every `shuffle()` at setup — the tile layout, the flood
deck, the treasure deck, the role deal — lands in `initialSpecificGameState`, so
replay is deterministic from day one. The **only** mid-game randomness is the
flood-discard shuffle: Waters Rise! (§11) and the empty-deck reshuffle. Both
must be recorded onto `BannedIsletEndTurn` the first time they run, and the
field **must be named `recordedFloodShuffles`** — the command route strips every
incoming `recorded…` property precisely because `Execute` prefers a recorded
value, and a field named `floodShuffles` would sail straight through and let a
player choose which tiles drown next.

### 21.5 Turn recap & planning

The three-column decision `docs/new-game.md` §7 asks for before PR 1, for the
per-game table in
[`turn-recap-and-planning.md`](../turn-recap-and-planning.md#per-game-status):

**Replay — yes**, from the `initialSpecificGameState` snapshot of 21.4.

**Recap — yes.** The away-time narrative is the island getting smaller, which is
the entire experience of §3: *"Three tiles went under while you were away, and
Kelp Stair is gone for good."* Sinkings, captures, Waters Rise! and forced swims
each earn a row; plain movement and shoring do not, the same editorial line
Outbreak's `recap.ts` takes on Treat and Share Knowledge.

**Planning — yes, as a route planner**, and only under deck freeze. Queue
`BannedIsletAction`s and watch pawns move and tiles dry out; `BannedIsletEndTurn`
is not queueable, so the plan never draws, never floods, and never consults an
order the live game is hiding. The general pattern and the two-axis test behind
it are [in the shared doc](../turn-recap-and-planning.md#planning-what-can-be-planned)
and are not restated here.

Two things follow, and both are Outbreak's conclusions rather than new ones:

- **A decoy flood deck is rejected**, for the reasons `outbreak-gdd.md` §21.5
  gives under "the decoy deck, and why not" — plus one this game adds: a decoy
  draw that sinks a tile would show a *hole in the island* that may not exist, and
  a planned route around a phantom hole is worse than no plan.
- **Cross-player planning needs the route opt-in of 21.2 gap 2.** Banned Islet
  qualifies for it on the same grounds Outbreak does — §2 makes hands public, so
  planning a teammate's turn discloses nothing the response didn't already carry
  — but the flag is per-game and off by default, and a hidden-hand game must
  never inherit it.

**Say what it is in the UI.** A frozen plan shows an island that *cannot occur*:
in the real game tiles sink between each player's turn. A route that works in the
plan may run through a hole by the time it is walked. This is a reach-and-action
calculator, not a forecast, and the copy has to carry that — because the natural
"improvement" someone will later reach for is to resolve the flood deck.

### 21.6 The PRs

Each PR leaves `npm run build`, `npx tsc --noEmit`, `npm run lint` and
`npm test` green, and is reviewable on its own. From PR 4 the game is playable
by hand rather than only by the test harness. The bulleted lines inside each PR
are its commits.

**PR 1 — Board data and pure rules.** No engine work and no wiring; the whole
game as pure functions, which is the half worth getting right before anything
can be clicked.

- `src/games/BannedIslet/board.ts`: the 24 named tiles of §5.2, the 6 × 6 grid
  and its diamond mask, the treasures, the role table, `MIN_PLAYERS`/
  `MAX_PLAYERS`, `HAND_LIMIT`, `ACTIONS_PER_TURN`, `WATER_LEVEL_TRACK` and the
  difficulty start levels. Grid adjacency is generated from positions and fed
  through `buildSymmetricAdjacency` (`src/utils/games/adjacencyGraph.ts`)
  rather than hand-written or re-derived — the same helper World Domination and
  Outbreak use.
- `rules.ts`: legal moves and shoring from a position, capture eligibility,
  the dry → flooded → sunk transition with its flood-card removal (§9.1),
  `resolveSwim()` (§21.3), `floodRateFor(waterLevel)`, and all four loss checks
  of §4.2. Server-free, so the client can import it for the action picker
  (`docs/new-game.md`, "Isomorphic rules modules").
- `board.test.ts` / `rules.test.ts`: the diamond has 24 positions, adjacency is
  symmetric and orthogonal-only, a sunk tile severs the routes through it, a
  swim prefers dry over flooded and the pier over both, and a pawn with no swim
  is a loss.

**PR 2 — Setup, wiring and the game type.** After this PR a game can be created
and its opening island inspected in the API response.

- `BannedIsletModels.ts`: both discriminators, `buildInitialBannedIsletState`
  (every setup shuffle of §6 recorded into the snapshot), and `gameStateToModel`
  with the 21.4 redaction.
- `apiModels.ts` and `meta.ts` (`available: false`, categories `["Strategy",
  "Co-op"]` — `Co-op` is already in `GAME_CATEGORIES`).
- `POST /api/newgame/bannedislet` and the setup screen: `GameSetupLayout` +
  `UserInviteList` (driven by `usePlayerList`) + `TurnTimerSelect` +
  one `OptionChoiceSection` for the four difficulties — the same four components
  `src/app/newgame/outbreak/page.tsx` composes, in the same order.
- `BannedIsletLogic.ts` with `BannedIsletGameType` and a skeleton
  `BannedIsletAction`. This file has to exist by the end of this PR, not PR 3:
  `gameRegistry.test.ts` discovers games by the presence of `meta.ts` and then
  demands the barrel export.
- The shared-file wiring of `docs/new-game.md` step 6 — `GameLogic.ts`,
  `GAME_META`, `mongodb.ts` (four separate edits) and `gameCommands.ts`, whose
  `registration` array takes a line per command class and so is revisited in
  PRs 5 and 9. `gameRegistry.test.ts` and `serializableRegistry.test.ts` name
  anything missed.

**PR 3 — The action phase.** The game becomes winnable and unloseable, which is
the point of stopping here: the action economy is testable while nothing is
fighting back.

- `BannedIsletAction` covering move, shore up, give card, capture and pass, all
  five validating through PR 1's `rules.ts` rather than re-deriving adjacency or
  capture eligibility a second time.
- `CheckEndTurn` refilling `actionsLeft` for the next player; `CheckGameOver`
  returning the §4.1 win (all four treasures, everyone on the pier, a Helicopter
  Lift played — the card arrives in PR 9, so until then the win is the first
  three conditions).
- `BannedIsletLogic.test.ts` on the in-memory harness `SolitaireLogic.test.ts`
  and both co-ops use.

**PR 4 — The board screen, first pass.** Enough UI to play PR 3 by hand, so
every PR after this one is playtestable as it lands.

- `components/BannedIsletBoard.tsx`: a 6 × 6 CSS grid inside `ag-board-frame`
  with an `.ag-bannedislet-frame` subclass, in the shape of
  `FiresOutBoard.tsx`/`.ag-fo-grid`. Tile states are art plus an icon, never a
  tint alone (§17); pawns are coloured by `playerColour()`.
- `components/BannedIsletActions.tsx` from the same
  `ag-actionsheet`/`ag-build-list`/`ag-build-row` primitives the other games'
  action pickers use.
- The chrome is the shared kit re-tinted under a `.ag-game--bannedislet` scope
  and never rebuilt: `GameShell`, `GameScoreboard` (one row per player, `sub`
  carrying the role, `score` the actions left), `Stat` for the water level and
  tiles remaining, `GameOptionsMenu`, `GameFinishBanner`, `useGameData`,
  `useSubmitCommand`, `usePushEvents`, `useEndGame`, and `ReadOnlyPanel` for the
  hands a waiting player can read but not act on.

**PR 5 — The draw and flood phases.** The island starts fighting back; the game
is playable start to finish, winnable and loseable, at a fixed flood rate.

- `BannedIsletEndTurn`: draw two, hand-limit check, flood at the current rate,
  sink, remove the sunk tiles' flood cards, and run `resolveSwim()` for every
  pawn caught by a sinking.
- `BannedIsletDiscard`, and the `phase: 'discard'` hand-off between them.
- Three of the four losses (§4.2) — the pier, a lost treasure, a drowning — each
  reporting through `finishGame`'s `'teamloss'` with the `endDetail` naming it.
- The two board controls this makes necessary: an "End turn" prompt at zero
  actions, and a discard picker reusing `ag-build-row` rather than a new
  component.

**PR 6 — Waters Rise!, the meter and difficulty.** The difficulty curve, and the
first PR whose win rate can be measured against §3.

- The three-step Waters Rise! resolution of §11, the water-level track and
  flood-rate lookup going live, the PR 2 difficulty dial reaching the meter, and
  the fourth loss (level 10).
- The empty-deck reshuffle of §11.
- `recordedFloodShuffles` on `BannedIsletEndTurn`, recorded here in the PR that
  introduces the shuffle rather than retrofitted — Train Time's §11 is the
  cautionary tale of what retrofitting this costs.

**PR 7 — Turn-timeout resolution.** One `ITurnTimeoutAdapter` registered in
`turnTimeout.ts` alongside Outbreak's and Fires Out's: forfeit each remaining
action with the same `pass` a live player bailing out would send, hand back
`BannedIsletEndTurn` to run the draw and flood phases, then a
`BannedIsletDiscard` computed from the resulting hand if the draw pushed it over
the limit. No engine work — `resolveStalledTurn` already loops an adapter to
completion inside one cron tick. `turnTimeout.test.ts` covers a timeout at zero
and non-zero `actionsLeft`, a forced draw landing in `discard`, and a forced
flood that ends the game.

**PR 8 — Roles.** All six at once, deliberately after the base rules are stable:
every role bends a rule PRs 3 and 5 established, and building them alongside
those rules doubles the surface being debugged.

- The role table in `board.ts` and each ability as a small pure predicate in
  `rules.ts` — `swimReach`, `shoreUpTargets`, `moveTargets`, `giveCardTargets`,
  `pilotFlightAvailable` — so `Execute` calls into them rather than branching on
  `role` inline.
- The two that reach outside their own command deserve their own tests: the
  Diver's and Explorer's widened `resolveSwim()` (§9.2), and the Navigator's
  two-step move of another player's pawn.

**PR 9 — Special cards.** `BannedIsletPlayCard` for Helicopter Lift and
Sandbags, neither costing an action, both playable in the action phase and in
the player's own discard phase (§21.3). This is the PR that completes §4.1: the
win check in `CheckGameOver` gains its fourth condition.

**PR 10 — Replay, recap and the result page.**

- The replay adapter in `replay.ts` (`buildInitialSpecificGameState` +
  `toResponseState`), with `plannableCommands: []` until PR 12.
- `recap.ts` and its recap adapter, with the row selection of 21.5.
- Per-turn charts: tiles remaining and water level as series, sinkings and
  captures as events — which needs the new `GameResultEventIcon` name and its
  art in `ChartEventIcon.tsx` (21.2 gap 1), one line each.

**PR 11 — Guide, art, share card and release.** The upkeep PR, and the one that
turns the game on.

- `guide.ts` beside `meta.ts`, wired into `GAME_GUIDES` in
  `src/utils/ui/gameGuides.ts` — five sections, `Goal` first, then `Your turn`,
  in the player's language, matching the existing guides rather than restating
  this document.
- Tile and treasure art: masters into `/art-masters` under the path they mirror
  in `public/art`, then `npm run optimise-art` and commit what it writes.
- `npm run icons` for `public/icons/og-game-bannedislet.png`.
- `meta.available: true`, **one** "What's new" line in the *New games* group of
  `src/utils/ui/whatsNew.ts` (one per branch, not one per PR — and PRs 1–10 add
  none, because until this one lands there is nothing a player can see), and the
  Banned Islet row in `turn-recap-and-planning.md`'s per-game table.

**PR 12 — The route planner** *(optional, and the only PR that touches shared
routing).* Builds 21.2's gap 2 — the per-game cross-player planning opt-in on
the timeline route — and turns `plannableCommands` on for
`BannedIsletAction`. Whoever gets here first pays for the opt-in; Outbreak's
crew planner is the second customer. Skippable: the game is complete without it.

**Review passes.** By what each PR touches, rather than all five every time:
`caveman` on PRs 1, 4 and 8 (the reuse-heavy ones); `croupier` on PR 2's
`gameStateToModel` and again on PR 10's recap; `locksmith` and `gremlin` on
PR 2's new route and PR 12's route change; `rulebook` on PRs 2 and 11, the
wiring and the upkeep.

### 21.7 Testing

`BannedIsletLogic.test.ts` follows `SolitaireLogic.test.ts`'s harness — an
in-memory `makeGame()`/`cmd()` pair over a plain `IGameData`-shaped object, no
Mongo and no Clerk.

* **Scripted floods.** Because the flood deck is state rather than dice, a test
  can set the deck outright and assert the exact resulting island: a Waters
  Rise! that sinks four already-flooded tiles, a sinking that severs the island
  in two, a sinking that strands a pawn with exactly one legal swim.
* **Each loss condition, exactly once.** Four tests, each driving the board to
  one of §4.2's four endings and asserting the `endDetail` that names it — the
  cheapest possible guard on the thing a losing table most wants to be told.
* **Swim determinism.** `resolveSwim()` is the one place the app decides for a
  player (§21.3), so it gets the deepest unit coverage: every tie-break, every
  role exception, and the no-legal-swim case.
* **Conservation.** 24 tiles and 24 flood cards; assert after every command that
  sunk tiles plus the flood deck plus the flood discard still accounts for all
  24, which is what catches a sunk tile's card not being removed.
* **A full auto-played game per difficulty.** Play legal actions until a win or
  a loss, asserting termination and no deadlock — and doubling as the only
  practical way to sanity-check §13's tuning without a hundred playtests.
* **Replay equality.** Run a game, rebuild it through `buildTimeline()`, and
  assert the final state matches. With two decks and a mid-game shuffle, that
  single assertion is worth more than any individual rules test.
