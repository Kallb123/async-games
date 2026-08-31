# Game Design Document: Settlements and Cities

## 1. Game Overview

* **Genre:** Resource Management, Negotiation, Strategy Board Game
* **Target Audience:** 10+ years old (Family/Casual Strategy)
* **Player Count:** 3–4 players (expandable to 5–6)
* **Estimated Playtime:** 60–90 minutes
* **Core Concept:** Players act as settlers establishing colonies on the uncharted island. Through strategic expansion, resource management, and trading with opponents, players race to build the most dominant settlement network.

---

## 2. Theme & Setting

The game takes place on a fertile, uninhabited island rich in natural resources. Players are expedition leaders guiding their people to build settlements, pave roads, and upgrade towns into cities. The narrative is driven entirely by the players' geographic expansion and their economic negotiations with one another.

---

## 3. Physical Components

The modular nature of the board ensures no two games are exactly alike.

* **19 Terrain Hexagons:** 4 Forests, 4 Pastures, 4 Fields, 3 Hills, 3 Mountains, 1 Desert.
* **6 Sea Frame Pieces:** Containing 9 distinct harbor locations.
* **18 Number Tokens:** Ranging from 2 to 12 (excluding 7), with dots indicating probability.
* **Resource Cards (95 total):** 19 each of Lumber, Wool, Grain, Brick, and Ore.
* **Development Cards (25 total):** 14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty, 2 Monopoly.
* **Player Pieces (4 colors):** 15 Roads, 5 Settlements, 4 Cities per player.
* **Special Achievement Cards:** "Longest Road" and "Largest Army".
* **Other:** 2 six-sided dice (2d6), 1 Robber pawn.

---

## 4. Setup & Board Generation

1. **The Island:** Shuffle and randomly place the 19 terrain hexes within the sea frame.
2. **Number Tokens:** Place tokens on each resource hex (alphabetically spiraling inward, then flipped face-up). The Desert receives no token.
3. **The Robber:** Placed on the Desert hex.
4. **Initial Placement:** Players roll to determine turn order. In a "snake draft" format (1-2-3-4-4-3-2-1), each player places one Settlement at a hex intersection and one connected Road. Players receive one starting resource for each hex adjacent to their *second* placed settlement.

---

## 5. Core Gameplay Loop

Turn order proceeds clockwise. A player's turn consists of three distinct phases executed in order:

### Phase 1: Resource Production

The active player rolls 2d6. The sum dictates which terrain hexes produce resources.

* Every player with a Settlement touching a hex with the rolled number receives 1 corresponding resource.
* Cities touching that hex receive 2 corresponding resources.
* **The Rule of 7:** If a 7 is rolled, no resources are produced. The Robber is activated (see *Mechanics & Systems*).

### Phase 2: Trade

The active player may trade resources to acquire what they need to build.

* **Domestic Trade:** The active player negotiates trades with other players. Any ratio and combination of resources can be traded, but the active player must be involved in all transactions.
* **Maritime Trade:** The active player trades directly with the bank. Standard rate is 4:1 (four of identical resource for any one resource). Controlling harbors reduces this rate to 3:1 (generic harbor) or 2:1 (specialized harbor).

> **Implementation note:** Maritime trade is built; **domestic (player-to-player)
> trade is not**. It is the one part of the core loop still missing. See
> [§10](#10-player-to-player-trading-design-proposal) for the design proposal.

### Phase 3: Build

The active player spends resources to construct new pieces on the board or buy Development Cards. Players may build as many items as their resources allow.

---

## 6. Mechanics & Systems

### Economy & Costs

A balanced economy is essential for victory. Each piece serves a distinct strategic purpose.

| Item | Cost | Function & Benefit |
| --- | --- | --- |
| **Road** | 1 Brick, 1 Lumber | Expands network; necessary to reach new settlement sites. |
| **Settlement** | 1 Brick, 1 Lumber, 1 Wool, 1 Grain | Yields 1 resource on rolls; worth 1 Victory Point. Must be placed at least 2 intersections away from any other settlement. |
| **City** | 2 Grain, 3 Ore | Upgrades a settlement. Yields 2 resources on rolls; worth 2 Victory Points. |
| **Dev Card** | 1 Wool, 1 Grain, 1 Ore | Draws a hidden card yielding a special ability or Victory Point. |

### The Robber (Anti-Snowball Mechanic)

When a 7 is rolled, the active player must move the Robber pawn to a new hex.

1. **Discarding:** Any player holding more than 7 resource cards must discard half of them (rounded down).
2. **Blocking:** The hex containing the Robber produces no resources while he is there, even if its number is rolled.
3. **Stealing:** The active player blindly steals one random resource card from one player who has a settlement/city adjacent to the Robber's new hex.

### Development Cards

Bought blindly, these provide hidden advantages. They cannot be played on the turn they are purchased.

* **Knights:** Allows the player to move the Robber (identical to rolling a 7, but bypasses the discard penalty).
* **Progress Cards:** Provide immediate resource injections or free roads.
* **Victory Points:** Kept hidden until they secure the game-winning point.

---

## 7. Win Conditions

The game ends immediately when a player accumulates **10 Victory Points (VPs)** on their turn. VPs are tracked openly, except for hidden VP Development Cards.

**Sources of Victory Points:**

* **Settlements:** 1 VP each.
* **Cities:** 2 VPs each.
* **Longest Road (2 VPs):** Awarded to the first player to build a continuous unbroken road of at least 5 segments. It can be stolen if another player builds a longer road.
* **Largest Army (2 VPs):** Awarded to the first player to play 3 Knight cards. It can be stolen if another player plays more Knights.
* **VP Development Cards:** 1 VP each (kept hidden).

---

## 8. Expansions

The base game is designed to be layered with optional expansions that add new
mechanics, larger maps, and higher player counts. This section documents four
major expansions and the player-count extension, modelled on the classic
*Catan* expansion line. Each expansion below notes the *Catan* set it is
adapted from so designers can cross-reference the original rules.

Every expansion preserves the core turn loop (Produce → Trade → Build); they
extend it rather than replace it. Unless stated otherwise, an expansion is
played on top of the base rules in Sections 4–7.

### 8.1 Seas & Sailors

*Adapted from Catan: Seafarers.*

* **Concept:** The island becomes an archipelago. Players explore open water,
  settle multiple islands, and race across the sea for bonus points.
* **New Components:** Sea hexes, gold-field hexes, additional terrain and
  number tokens, **Ships** (15 per player), and a **Pirate** pawn.
* **Key Mechanics:**
  * **Ships** are the maritime equivalent of roads (cost **1 Lumber + 1 Wool**).
    They are built along sea edges to connect coastal settlements. An open-ended
    ship may be moved once per turn to redirect exploration.
  * **Gold Fields** produce a resource of the player's choice when their number
    is rolled — the most valuable terrain in the game.
  * **The Pirate** is a naval Robber: it blocks ship movement and adjacent
    coastal production, and steals from players with ships/settlements nearby.
  * **Scenario play:** Ships to unsettled islands and "new shores" award bonus
    VPs. The expansion ships with a set of pre-built map scenarios
    (e.g. *Heading for New Shores*, *The Four Islands*, *The Fog Island*), each
    with its own victory target (typically 12–14 VP).
* **Player Count:** 3–4 (up to 6 with the 5–6 Player Extension).
* **Compatibility:** Combines cleanly with *Knights & Commerce* and with most
  scenarios of *Traders & Raiders*. Not compatible with *Explorers & Pirates*.

### 8.2 Knights & Commerce

*Adapted from Catan: Cities & Knights.*

* **Concept:** The deepest strategic expansion. Cities generate refined
  **commodities**, unlock a technology tree of **city improvements**, and must
  be defended by standing **knights** against a recurring barbarian invasion.
* **New Components:** Commodity cards (**Coin, Cloth, Paper**), city-improvement
  markers, Knight pieces (three ranks), a **Barbarian Ship** track, an **Event
  Die**, Progress cards, city walls, and metropolis markers.
* **Key Mechanics:**
  * **Commodities:** Each city produces its normal resource **plus** one
    commodity from adjacent terrain — Ore→**Coin**, Wool→**Cloth**,
    Lumber→**Paper**. Commodities fuel city improvements.
  * **City Improvements:** Three tracks — **Trade** (Paper), **Politics**
    (Coin), **Science** (Cloth). Advancing a track unlocks stronger Progress
    cards and abilities; reaching the top of a track builds a **Metropolis**
    (+2 VP, and it cannot be pillaged).
  * **Progress Cards** replace base Development Cards: drawn by track (Trade /
    Politics / Science) instead of a single deck, offering trade, combat, and
    tech advantages.
  * **Knights** are built, then **activated** (fed 1 Grain) to defend cities,
    displace the Robber, or harass opponents. They come in Basic/Strong/Mighty
    ranks and can be promoted.
  * **The Barbarian Invasion:** Each turn the Event Die may advance a barbarian
    ship. When it lands, total activated **knight strength** across all players
    is compared to the number of **cities** on the board. If the barbarians
    win, the player(s) with the fewest active knights lose a city (downgraded to
    a settlement). If the defenders win, the single strongest contributor earns
    the **Defender of Catan** VP.
  * **Higher Target:** Because points come faster, the victory threshold is
    raised to **13 VP**.
* **Player Count:** 3–4 (up to 6 with the 5–6 Player Extension).
* **Compatibility:** Combines with *Seas & Sailors* and with most *Traders &
  Raiders* scenarios. Not compatible with *Explorers & Pirates*.

### 8.3 Traders & Raiders

*Adapted from Catan: Traders & Barbarians.*

* **Concept:** Not a single ruleset but a **toolbox** of standalone scenarios
  and small variants that can be played individually. Also introduces the
  official **2-player** rules for the base game and its scenarios.
* **Contents (representative):**
  * **The Rivers of Catan** — river hexes and a gold-based economy; wealth is a
    double-edged sword (leads to a "poorest player" penalty).
  * **The Great Caravan** — escort camel trains between settlements.
  * **Barbarian Attack** — a semi-cooperative defence against invading
    barbarian tokens.
  * **Traders & Barbarians** — deliver commodities to castles for points.
  * **The Fishermen of Catan** — a lake, fish tiles, and the ability to spend
    fish to draw resources, reposition the Robber, or discard.
  * **Variants** — Harbor Master (VP for harbour buildings), The Castles,
    Catan for Two, and event-card play in place of dice.
* **Key Mechanics:** Varies per scenario; each adds one focused subsystem
  (rivers/money, cargo delivery, cooperative defence, or fishing) to the base
  loop.
* **Player Count:** **2**–4 (up to 6 with the 5–6 Player Extension for the
  scenarios that support it).
* **Compatibility:** Many scenarios can be mixed into *Seas & Sailors* or
  *Knights & Commerce* games, but **not all** — scenarios that reserve specific
  tile placements (e.g. rivers, castles) conflict with Seafarers' sea hexes and
  need house rules or must be run solo. Not compatible with *Explorers &
  Pirates*.

### 8.4 Explorers & Pirates

*Adapted from Catan: Explorers & Pirates.*

* **Concept:** A **campaign-style** expansion built as a progression of five
  linked scenarios that gradually introduce exploration, seafaring logistics,
  and mission objectives, culminating in a full combined game.
* **New Components:** Ships that carry **crews and settlers**, harbour
  settlements, face-down sea tiles for exploration, plus **fish, spice, and
  gold** tokens and pirate figures.
* **Key Mechanics:**
  * **Exploration:** Sea tiles begin face-down and are revealed as ships
    approach, uncovering new islands, resources, and hazards.
  * **Cargo Ships:** Ships transport crews and settlers to found new
    settlements far from the home island — a logistics layer absent from the
    base game.
  * **Missions:** Three headline missions drive scoring — **Pirate Lairs**
    (clear lairs with ship crews), **Fish for Catan** (deliver fish to the
    council), and **Spices for Catan** (ferry spice across the map). Completing
    missions, not just building, earns victory points.
* **Player Count:** 2–4 (up to 6 with its own 5–6 Player Extension).
* **Compatibility:** **Standalone.** Because it restructures the map, the piece
  set, and the scoring around a scripted campaign, it does **not** combine with
  any other expansion.

### 8.5 The 5–6 Player Extension

*Adapted from the Catan 5–6 Player Extension line.*

* **Concept:** Supplies the extra components and one rules tweak needed to seat
  **5 or 6 players** at once.
* **New Components:** Additional terrain hexes, number tokens, sea frame pieces,
  Development/Progress cards, and a fifth and sixth set of player pieces.
* **Key Mechanic — the Special Build Phase:** To keep downtime low with more
  players, after the active player finishes their turn, **every other player**
  (in turn order) may build and trade with the bank once before the dice pass.
  This is especially valuable for asynchronous play, where it keeps all players
  engaged between rolls.
* **Important — matching extensions required:** Each major expansion has its
  **own** 5–6 Player Extension. To play an expansion with 5–6 players you need
  **both** the base 5–6 extension **and** that expansion's 5–6 extension. For
  example, a 6-player *Knights & Commerce* game requires the base game, the base
  5–6 extension, *Knights & Commerce*, and the *Knights & Commerce* 5–6
  extension.

### 8.6 Compatibility Matrix

| Combination | Supported? | Notes |
| --- | --- | --- |
| Seas & Sailors **+** Knights & Commerce | ✅ Yes | Officially supported; a popular deep combo. |
| Seas & Sailors **+** Traders & Raiders | ⚠️ Partial | Only scenarios that don't reserve fixed land tiles; others need house rules. |
| Seas & Sailors **+** Explorers & Pirates | ❌ No | E&P is a self-contained campaign. |
| Knights & Commerce **+** Traders & Raiders | ✅ Yes | Most T&R scenarios layer onto a K&C game. |
| Knights & Commerce **+** Explorers & Pirates | ❌ No | Incompatible structures. |
| Traders & Raiders **+** Explorers & Pirates | ❌ No | E&P does not accept add-ons. |
| Seas & Sailors **+** Knights & Commerce **+** Traders & Raiders | ⚠️ Advanced | Possible for compatible scenarios; long, complex sessions. |
| Any expansion **+** matching 5–6 Player Extension | ✅ Yes | Requires **both** the base and the expansion-specific 5–6 extension. |

### 8.7 Player-Count Summary

| Set | Base Players | With 5–6 Extension |
| --- | --- | --- |
| Base Game (Settlements & Cities) | 3–4 | up to 6 |
| Seas & Sailors | 3–4 | up to 6 |
| Knights & Commerce | 3–4 | up to 6 |
| Traders & Raiders | **2**–4 | up to 6 (supported scenarios) |
| Explorers & Pirates | 2–4 | up to 6 (own extension) |

**Rules of thumb:**

* Only *Traders & Raiders* and *Explorers & Pirates* natively support **2
  players**; the base game and the other expansions start at 3.
* Reaching **5–6 players** always requires the base 5–6 extension, plus a
  matching extension for each layered expansion.
* *Explorers & Pirates* is the odd one out: it never mixes with other
  expansions, so treat it as a separate mode rather than a layer.

---

## 9. Implementation status & outstanding work

The expansion **framework** is implemented — selection, compatibility and
player-count validation, persistence into the game model, and the
expansion-derived victory-point target. The single source of truth for this is
[`src/games/SettlementsAndCities/expansions.ts`](../../src/games/SettlementsAndCities/expansions.ts).

The **5–6 Player Extension's Special Build Phase (§8.5) is now implemented** —
see below. The remaining **deep per-expansion subsystems** are **not yet
implemented**. Selecting one of those expansions currently affects the
player-count rules and the victory target, but does not yet add its unique
mechanics. Outstanding work, by expansion:

* **Seas & Sailors (§8.1):** sea/gold-field hexes, Ships as sea-edge roads,
  the Pirate pawn, and scenario maps with bonus-VP goals.
* **Knights & Commerce (§8.2):** commodity cards (Coin/Cloth/Paper), the three
  city-improvement tracks and metropolises, Progress-card decks, activatable
  Knights, and the barbarian-invasion loop driven by an Event Die.
* **Traders & Raiders (§8.3):** the per-scenario subsystems (rivers/money,
  caravans, cooperative defence, fishing) and the official 2-player rules.
* **Explorers & Pirates (§8.4):** face-down sea-tile exploration, cargo ships
  carrying crews/settlers, and the mission-based scoring campaign.

Separately from the expansions, the base game is also missing **domestic
(player-to-player) trade** from §5 Phase 2 — the largest outstanding gap in the
core loop. That is designed in [§10](#10-player-to-player-trading-design-proposal)
rather than here, because it needs a change to the shared engine (off-turn
commands) that the expansions do not.

Each of these is a substantial feature in its own right. They should be added
incrementally on top of the existing framework — new commands in
`games/SettlementsAndCitiesLogic.ts`, new `specificGameState` fields, and
expansion-gated branches keyed off `specificGameState.expansions`.

### 9.1 Implemented: the 5–6 Player Extension Special Build Phase (§8.5)

When the **5–6 Player Extension** is enabled, a **Special Build Phase** runs
between every player's turns, exactly as described in §8.5. It is a natural fit
for asynchronous play: rather than sitting idle while the dice pass, each other
player is given the board (and a push notification) for a quick build.

* **Turn model.** Each special-build opportunity is modelled as its own
  `currentTurn`, so it reuses the app's existing turn-passing, push-notification
  and turn-timer machinery. After the active player ends their turn,
  `CheckEndTurn` opens the phase: it fills `specialBuildQueue` with every *other*
  player in turn order (starting after the active player), remembers the active
  player in `specialBuildMainPlayer`, sets `specialBuildActive`, and hands
  `currentTurn` to the first queued player. Each player finishing their special
  build advances the queue; once it drains, the phase closes and the dice pass on
  from the seat that opened it.
* **What a special-build player may do.** Build roads, settlements and cities,
  buy a development card, and trade with the bank (maritime trade) — gated by the
  shared `sacCanBuildOrTrade` helper, which lets them act without having rolled.
* **What they may not do.** Roll the dice, move the robber, play a Knight or any
  progress card, or take free Road-Building roads. These are explicitly blocked
  while `specialBuildActive` is true.
* **Winning.** A player can reach the victory target during their special build;
  `CheckGameOver` runs after every command and is unaffected by the phase.
* **State/serialisation.** The three new fields
  (`specialBuildActive`, `specialBuildQueue`, `specialBuildMainPlayer`) live on
  `ISACSpecificGameState`, are persisted in the Mongoose schema, deep-cloned for
  turn recap, and surfaced to the client (queue mapped to usernames) so the game
  screen can label the phase and whose move it is.

The relevant code is the special-build helpers and the rewritten `CheckEndTurn`
in [`src/games/SettlementsAndCities/SettlementsAndCitiesLogic.ts`](../../src/games/SettlementsAndCities/SettlementsAndCitiesLogic.ts),
plus the special-build branch in the actions sheet
([`SettlementsAndCitiesActions.tsx`](../../src/games/SettlementsAndCities/components/SettlementsAndCitiesActions.tsx)).

---

## 10. Player-to-player trading (design proposal)

Domestic trade is written into the core loop at §5 Phase 2 and is the one part
of that loop this implementation has never had. Everything else a turn does —
produce, rob, build, buy, bank-trade — is built; the "negotiate with the table"
half of Phase 2 is missing entirely.

**This section is a proposal. None of it is implemented.**

### 10.1 Why trading is the hard one

Every command in this game today is a *solitary* action: one player, on their
turn, mutates the board. Trading breaks both halves of that sentence.

1. **It needs two players to agree**, and in a face-to-face game that agreement
   is reached in five seconds of talking. Here the other player may be asleep.
2. **It needs a player to act when it isn't their turn**, and the engine is
   built on the opposite assumption in two load-bearing places:
   * `src/app/api/game/command/route.ts` rejects any command whose sender isn't
     `gameData.currentTurn` ("Not your turn in this game").
   * `src/utils/games/replay.ts` sets `state.currentTurn = command.senderId`
     before each replayed command, under the comment *"Every command was
     executed on its sender's turn."*

So the design question isn't "what does a trade UI look like". It is **what is
the smallest hole we can cut in the one-active-player assumption**, and **what
replaces live haggling** once we accept that nobody will haggle in real time
across a 24-hour turn timer.

A note on the obvious precedent: the Special Build Phase (§9.1) solved a similar
"other players get to act" problem cheaply, by making each opportunity a real
`currentTurn` — which bought it turn-passing, push and timers for free. **Trading
can't use that trick.** Special Build is a queue, taken in order; a trade offer
is *simultaneous* — it is open to several players at once, and turning it into a
queue of turns would serialise the whole table behind a question most of them
will answer with "no". This is worth stating plainly so it doesn't get
re-litigated.

### 10.2 What already exists to build on

Two off-turn interactions already ship, and they bracket the design space:

| Feature | Where | Off-turn behaviour | Persistence |
| --- | --- | --- | --- |
| **Nudge** | `POST /api/game/nudge` | Any player pokes the active player. Auth, membership check, one push. | None. Fire-and-forget. Rate-limited only client-side (`TheirTurnList.tsx` keeps a local `nudgedGameIds` set). |
| **Reaction** | `POST /api/game/[gameid]/reaction` | Any player reacts to a recap event. Target re-derived server-side from `buildEventFeed`, never trusted from the body. | Own collection (`ReactionData.ts`), with a duplicate-guard → 409. |

Reaction is the better-built of the two — server-derived target, duplicate
guard. **But a trade should copy neither**, because both sit *outside* the game
engine, and reactions can afford to because they never touch game state. A trade
moves resources. Anything that mutates `specificGameState` outside
`commandHistory` is invisible to `buildTimeline`, `recap.ts`, and the
result-page charts — every replayed board would be wrong from the first trade
onward, and every subsequent build would fail validation against a hand that
never got its resources. **Trades must be commands.**

Three genuine free wins are already sitting there:

* **Refresh without a push.** `useGameData` sets
  `pollWhileWatching: waitingOnOpponent`, where `waitingOnOpponent` is
  `currentTurn && !complete && currentTurn !== user.id` — *exactly* the set of
  players who can respond to an offer. Anyone with the board open sees a new
  offer within 10s with no new code. This is what makes the "no silent pushes"
  rule (§10.11) free rather than painful.
* **Every player's hand size is public.** `ISACPlayerStateResponse.resourceCount`
  gives every player's total to everyone, so an offer can show who could
  plausibly cover it. What it *can't* show is who actually holds the goods:
  `resources` is the composition, and it is now sent only to the player it
  belongs to (§10.2a).

#### 10.2a What changed here, and what it costs the design

An earlier draft of this section was written against a response that shipped
every player's exact resource composition — and their dev card identities — to
everyone at the table. That was a bug, not a feature: §6 hides both (the robber
steals *at random* precisely because a hand is unknown, and victory-point cards
are supposed to stay hidden until they win the game), and the board screen has
always reduced opponents to a card total. The response now matches the rules:
composition and dev cards go to their owner alone.

The consequence for trading is that **an open offer is no longer fully
informed**, and the design has to stop assuming it is:

* An offer can be addressed to a player who cannot fill it. That is how the
  physical game works — you ask, and they say no — so treat "can't fill this"
  as a normal decline, not an error state, and don't render an
  offer as impossible on the proposer's screen.
* Any "who can accept this?" affordance has to be built from `resourceCount`
  (a bound, not an answer), never from `resources`.
* Acceptance has to be validated **server-side**, against the accepting
  player's real hand. That was always true; it is now the only check there is.
* A UI that greys out recipients who lack the goods would leak exactly what
  this fix hides — the proposer would learn a player's composition by watching
  which offers light up. Don't build one.
* **The next player's push describes itself.** `buildYourTurnNotification`
  already leads with the most recent recap event, so once a settled trade is a
  recap event (§10.10), it shows up in the next "your move" push for free.

And the plumbing to reuse rather than rebuild: `trySave`'s `VersionError` → 409
path (`GameData.ts`), `notificationContent.ts` for all push copy,
`sendPushToUsers` + `gameNotificationLink`, `formatRemainingTimeShort` +
`useNowToTheMinute` for countdowns, and the `ag-trade-*` picker already in the
maritime modal (§10.12).

### 10.3 The engine change: an off-turn escape hatch

**Recommendation: let a command declare that it may be played off-turn — but
decide that server-side, never from the request body.** This is the whole
architectural change, and the "server-side" part is not a detail.

🪨 **The obvious version of this is a security hole.** A plain
`offTurn?: boolean` field on `IGameCommand` would be *client-controlled*.
`Serialisable.ts`'s reviver is:

```ts
Object.assign(new registry[v.className](), v)
```

Every own enumerable property in the posted JSON overwrites the constructed
instance, and TypeScript's `readonly` is compile-time only. So a client posting
`{"className": "SACRollDice", …, "offTurn": true}` would get past the guard and
**roll the dice on someone else's turn.** One narrow trade hole becomes a
general turn-order bypass.

`className` itself is safe — the reviver picks the class *by* `v.className` and
then assigns the same value back, so it always matches the class actually
constructed. That gives the fix: derive the flag from the class, in the route.

```ts
// src/app/api/game/command/route.ts — server-owned, not body-owned
const OFF_TURN_COMMANDS = new Set(['SACAcceptTrade']);
const offTurn = OFF_TURN_COMMANDS.has(commandRequest.className);
```

The route already hand-maintains a per-class list (the `registration` array), so
one more server-side set is in keeping with how this file works. A prototype
method (`CanPlayOffTurn()`) also fails closed — JSON can't carry a function, so
a spoofed value shadows it as a non-callable own property and the call throws —
but it throws a 500 where the allowlist gives a clean 400. Prefer the allowlist.

`replay.ts` (§10.4) reads the flag from persisted history rather than a request,
so either form is safe there; the simplest option is for it to consult the same
exported set.

The guard block then becomes:

```ts
if (!gameData.userIdList.includes(userId)) { /* 403 not a player */ }
if (gameData.complete)                     { /* 400 game is already complete */ }
if (userId !== gameData.currentTurn && !offTurn) { /* 400 not your turn */ }
// the existing sender-spoof guard stays exactly as it is
if (userId !== commandRequest.senderId)    { /* 400 can't act for someone else */ }
```

Two of those lines are new, and both matter:

* **The membership check.** Today the `currentTurn` guard implies it. Both
  `/api/game/nudge` and the reaction route already do this check explicitly, so
  the shape is established.
* 🪨 **The `complete` check.** The command route **does not check
  `gameData.complete` today** — and gets away with it only because
  `CheckGameOver` sets `currentTurn = ''`, so the turn guard rejects everything
  on a finished game. An off-turn command bypasses exactly that guard, and
  `sacCanBuildOrTrade` only tests `phase === 'main'` and `hasRolled`, both still
  true after a win. Without this line, resources stay tradeable on a completed
  game and the route would re-enter its game-over branch and re-fan the win/lose
  pushes.

Four invariants keep the rest of the turn machinery intact. They belong in the
route, not in each command, so no future off-turn command can forget them:

1. **An off-turn command can never end a turn.** Force `outcome.turnOver = false`
   for off-turn commands before `CheckEndTurn` runs — otherwise accepting a
   trade would pass the dice.
2. **It never touches `lastTurnTimestamp`.** Follows from (1), but state it: a
   trade must not extend or reset the active player's clock.
3. **It never clears `missedTurnCounts`.** Answering a trade is not taking your
   turn; a player who trades but never rolls should still be swept by the
   abandonment logic.
4. **`CheckGameOver` still runs.** It is a no-op for trades (resources aren't
   VP), but a uniform pipeline is cheaper than a special case.

#### The second contract change: telling the route who to notify

`ICommandOutcome` is `{ validMove, turnOver }` and nothing else, and the route's
`after()` push blocks are hard-coded to `YourTurn` / `GameOver`. So §10.11's
"notify the players who could fill this offer" currently has **nowhere legal to
live** — it needs SAC's resource model, and the route must not branch on game
type. Both statements can't hold as written. Pick one and say so:

* **Extend `ICommandOutcome`** with an optional
  `notify?: { userIds: string[]; event: string }` that `Execute` populates and
  the route fans out generically, with the copy built in
  `notificationContent.ts` keyed off `event`. Additive; every existing command
  ignores it; the engine stays game-agnostic. **This is the one that fits.**
* Or drop the eligibility filter to "everyone else in the game", which needs no
  contract change at all and is a perfectly good Phase 1.

This is the **second-largest architectural change in the feature**, after the
off-turn flag itself — not a notifications detail.

**Alternatives considered and rejected:**

| Option | Why not |
| --- | --- |
| A bespoke `/api/game/[gameid]/trade` route (the reaction shape) | Breaks replay/recap permanently (§10.2), *and* re-implements ~60 lines the command route already owns: body deserialisation, the registration-array import, the sender-spoof guard, `Execute`/`validMove`, `commandHistory.push` + `markModified`, `CheckGameOver`/`CheckEndTurn`, `trySave`/409, `CreateDataResponse`, and the `after()` push. It would drift within a release. |
| A `TradeOfferData` collection mirroring `ReactionData` | Same problem: off-`commandHistory` state is invisible to the replay engine. |
| Proxy every acceptance through the active player ("they said yes — confirm?") | No engine change, but it makes the active player return a second time to close a trade they already agreed. Two round-trips through a 24-hour timer is slower than not trading. |
| Give the responder a real turn (the Special Build model) | See §10.1 — it serialises the table behind a question most players will decline. |

### 10.4 The landmine: `replay.ts` will silently corrupt recap

This must land in the same change as the first off-turn command.
`src/utils/games/replay.ts` does:

```ts
// Every command was executed on its sender's turn.
state.currentTurn = command.senderId;
```

That comment stops being true the moment an off-turn command exists. A replayed
`SACAcceptTrade` would rewrite `currentTurn` to the accepter mid-replay, and
everything downstream replays against the wrong seat: `sacAdvanceMainTurn`
resumes the rotation from the wrong index, and `CheckGameOver` folds
`newDevCards.victoryPoint` in for whoever `currentTurn` happens to be. Recap and
the result-page charts would diverge from the live game **silently, with no test
failing.**

The fix reuses the same flag:

```ts
if (!command.offTurn) state.currentTurn = command.senderId;
```

The rest of the replay story is easy, because **trades consume no randomness** —
nothing to record, no `SACRandomLog` equivalent, deterministic for free. With
one hard rule attached:

> 🪨 **`Date.now()` must never appear inside a trade command's `Execute`.** This
> is the same rule that forced `recordedRoll1/2` and the whole `SACRandomLog`
> class to exist. Anything time-dependent must be evaluated against the
> command's own recorded `timestamp` field, which replays identically — **and
> that field is only trustworthy once the route stamps it server-side**, which
> it does not do today. See §10.7 for both halves; together they are what make
> deadlines possible without a cron.

### 10.5 Three shapes of offer

Both ideas on the table — *a time-limited call anyone can consider* and *a
standing "I'd swap ore for wool if anyone's interested" ping* — plus the
straightforward table offer are the same object with different lifetimes. They
are not three features; they are one entity and one knob.

| Shape | Lifetime | Posted | What it feels like | Cost |
| --- | --- | --- | --- | --- |
| **Table offer** | Dies when the proposer's turn ends | On-turn, by the active player | "Anyone want wool for ore?" said mid-turn | **One nullable field.** Cleared in `sacAdvanceMainTurn` next to `hasRolled` and `playedDevCard`. No clock, no expiry, no sweep. |
| **Timed open call** | Until a recorded deadline | Any time | The time-limited notification idea: a real countdown, outlives the turn | Adds a deadline field, lazy expiry (§10.7), and re-validation |
| **Standing want-ad** | Until filled or withdrawn | Any time | The any-turn ping: sits on the board indefinitely | Adds all of the above, plus persisted declines, an offer *list* rather than a slot, and a rules divergence (§10.8) |

**The table offer is the recommended first cut**, and it is genuinely small: a
single nullable `openTrade` on `ISACSpecificGameState`, cleared by the existing
end-of-turn reset. It buys the whole Catan *feeling* for almost nothing, and it
proves the `offTurn` change end-to-end on the narrowest possible case.

The other two are where the interesting value is — a turn-scoped offer only
works if someone happens to be awake during that turn, which in a 1-day-timer
game is a coin flip. **The standing want-ad is the shape most likely to make
async trading actually happen.** It is worth building; it just should not be
built first, and §10.7–§10.8 price it honestly.

Shape for the full version (the turn-scoped cut is this with `expiresIn: null`,
`declinedBy` dropped, and a single slot instead of an array):

```ts
interface ISACTradeOffer {
    offerId: string;
    proposerId: string;                            // Clerk userId
    give: Record<SAC_Resource, number>;            // what the proposer hands over
    want: Record<SAC_Resource, number>;            // what they want back
    createdAt: string;                             // the proposing command's server-stamped timestamp
    expiresIn: string | null;                      // a TIMER_MS bucket key ('3h'); null = no deadline
    endsWithTurn: boolean;                         // auto-void at end of proposer's turn
    declinedBy: string[];                          // stops a declined offer nagging
}
```

Typed fields only (§10.9), and note the deadline is stored as a **bucket key,
not an absolute time** — §10.7 explains why that matters.

### 10.6 Replacing live negotiation

The honest position: **we are not going to replicate face-to-face haggling, and
we should not try.** What makes it work at a table is instant, zero-cost,
free-form back-and-forth. Every one of those properties is gone here. A UI that
tries to recover them — chat threads, haggling rounds, counter-counter-offers —
becomes exactly the "ridiculous UI" worry.

It would also be **building someone else's feature, badly.** Free text between
players is its own, separately-sized piece of work —
`docs/social-features.md` Tier 1, *"In-game messaging"* — and it has since
shipped as a general per-game chat thread on every board
(`docs/in-game-chat.md`), sending on the `chat` notification channel
`notificationPreferences.ts` reserves for it. Trading must not grow a *second*,
bespoke chat box in through the side door.

Messaging and trading compose exactly as they should: **messaging carries the
persuasion, trading carries the settlement.** That is a better split than a
bespoke haggling thread would ever be.

What replaces negotiation in the meantime is a **market, not a conversation**:

* **Offers are concrete and machine-checkable.** Exact quantities both ways.
* **A counter-offer is not a new concept.** With a single turn-scoped slot, a
  counter is simply the active player replacing their own offer — zero new
  types, zero new commands, and it matches how a table actually works. Only if
  standing offers ship (§10.5) does "counter" need to become a real object, and
  then it is just a new offer that records what it answers.
* **Several offers can be live at once** (standing shape only). The board
  becomes a small want-ads board, and parallel offers do the work that serial
  haggling does at a table.
* **Decline is the cheapest possible action.** For a turn-scoped offer it is a
  **client-side dismiss with no server call and no push** — same pattern as the
  nudge pill's local set. Only standing offers need `declinedBy` persisted.
* **No free text anywhere in this feature.**

A group that genuinely wants to haggle has the game's own chat thread now — or
WhatsApp. Either beats shipping a second, half-built chat client inside the
trading screen.

### 10.7 Deadlines without a clock and without a cron

A deadline looks like it needs a timer. It doesn't, and it must not get one.

**Do not extend `/api/cron/turntimer`.** That job is a full-table sweep — it
loads *every* incomplete game — fired every ~15 minutes by an external
scheduler. A trade window shorter than 15 minutes can't be honestly enforced by
it, and one longer than 15 minutes doesn't need it. Wrong tool, and every added
sweep multiplies that job's per-run cost.

Instead, make a deadline **deterministic and unspoofable** by construction, then
enforce it lazily.

**Store a bucket key, not an absolute time.** The offer records something like
`expiresIn: '3h'` — a key into `TurnTimer`'s existing `TIMER_MS` — and the
deadline is *derived* as `createdAt + TIMER_MS[expiresIn]`. This reuses the
buckets rather than paraphrasing them, and it removes the proposer's ability to
pick their own absolute deadline.

🪨 **`createdAt` must be server-stamped, and today it isn't.** A command's
`timestamp` is a class field initialiser — `new Date().toISOString()` — that
runs **in the browser**; `useSubmitCommand` overwrites only `gameId`,
`senderId` and `senderUsername`, and the route never restamps it. So a client
can backdate a command and accept an offer that expired yesterday, and clock
skew does the same thing by accident. Nothing validates against `timestamp`
today, which is precisely why trading is the first feature that makes it
load-bearing. The fix is one line in the route, before `Execute`:

```ts
commandRequest.timestamp = new Date().toISOString();
```

It is safe for every existing game, and it makes the stored timestamp both
authoritative *and* replayable.

Then enforce expiry in the two places that matter:

1. **In `SACAcceptTrade.Execute`** — compare the derived deadline against **the
   accepting command's own (now server-stamped) `timestamp`**, never
   `Date.now()`. Both values are persisted in `commandHistory`, so the
   comparison gives the same answer on the thousandth replay as it did live.
2. **On the way to the client** — hide offers that have already lapsed.

🪨 **The obvious home for that second filter is the wrong one.**
`gameStateToResponse` looks live-only but **is the replay adapter's
`toResponseState`** — `replay.ts` imports it as
`settlementsAndCitiesStateToModel` and runs it on *every replayed snapshot*. A
wall-clock read inside it makes recap output depend on when the recap is viewed.
Put the filter in `CreateDataResponse` instead (a Mongoose schema method, so
genuinely live-only), or give `gameStateToResponse` an optional `now?: number`
parameter where `undefined` means "don't filter" — the same convention
`formatRemainingTimeShort(…, now)` already established for not reading the clock
implicitly.

That's the whole mechanism: correctness never depends on a job running, and an
expired offer simply stops being acceptable and stops being rendered. A tidy
sweep could delete stale rows later if they accumulate, but it would be
housekeeping, not enforcement.

Offer buckets should be `TIMER_MS`'s, trimmed to what suits an offer (`30m`,
`1h`, `3h`, `6h`, `1d`) plus "no deadline". The countdown label is
`formatRemainingTimeShort` fed by `useNowToTheMinute` — `TheirTurnList` is the
working example.

### 10.8 Settlement rules — and the deliberate house rule

Real Catan requires the active player to be a party to every domestic trade, and
allows it only during their trade phase. Enforced literally on a standing offer,
it could only ever be accepted inside the window where its proposer is active —
which in async play is the window where nobody is looking.

| Rule | Behaviour | Cost |
| --- | --- | --- |
| **Strict** | Acceptable only while the proposer is the active player | Faithful. This is what the turn-scoped shape (§10.5) *is*. |
| **Anchored** | Acceptable when *either* party is the active player | Half-faithful, fires roughly twice as often. Still mostly dead. |
| **Open market** | Any two players settle any time | Fires whenever players are awake. Diverges from the printed rules. |

The turn-scoped first cut is strict by construction, so **this decision only has
to be made when standing offers are built** — which is a good reason to build
them second. When it is made, the recommendation is **open market**, because the
alternative is a feature nobody gets to use, with two guardrails:

* **No gifts.** Both `give` and `want` must be non-empty. This is Catan's actual
  rule and it is a one-line validation.
* **Every settled trade is written to `gameState.history` in full**, so the
  table can see who is feeding whom. Two conventions to follow there: SAC
  commands **`unshift`** (the log is newest-first — push instead and it
  inverts), and a line names a player with a `{{userId}}` token, resolved on
  the way out (`src/utils/games/history.ts`). A two-party event is exactly what
  that is for: `playerHistory(this.senderId, ...)` with a `userToken(otherId)`
  in the text names both sides, and both keep reading correctly after either
  of them renames.

Two balance risks, documented rather than pre-solved:

* **Discard laundering.** A player at 8+ cards parks resources with an ally to
  dodge the rule-of-7 discard, then trades them back. Bounded by no-gifts, not
  eliminated.
* **Endgame kingmaking.** A player who can't win hands the leader the win. True
  at a real table too, but easier when it costs no social capital.

If either bites, **the fix is one condition in `SACAcceptTrade.Execute`** — not
a rebuild. That is precisely why the simple rule is safe to pick now.

One more guard, whichever rule is chosen: trading should be blocked while
`pendingRobber` is set. `sacCanBuildOrTrade` already stops the active player
trading mid-robber; the same must hold for everyone else, or the robber's
discard-and-steal can be traded around while it is resolving.

### 10.9 State plumbing — the checklist nothing enforces

`specificGameState` is a **typed Mongoose sub-schema** (`makeSACStateSchemaDef`),
not a `Mixed` blob. Two consequences worth stating loudly:

* A new field that isn't added to the schema definition is **silently dropped on
  save** — the classic "works in memory, gone after refresh" bug.
* SAC calls `markModified('specificGameState')` **nowhere**, because typed paths
  are tracked automatically. Keep it that way: modelling the offer as
  `Schema.Types.Mixed` would put SAC on the fragile manual-`markModified` path
  for the first time. Use typed fields
  (`{ offerId: String, proposerId: String, give: resourcesSubSchema, want: resourcesSubSchema, … }`,
  defaulting to `null`). The command itself is already covered — `commandHistory`
  *is* `Mixed` and the route already calls `markModified` for it.

🪨 **Adding a field to SAC state means editing four places, and no test catches
a miss.** This is the same class of failure as §10.4 — recap silently diverges
from the live game — so treat it as a checklist, not prose. The Special Build
fields did exactly this edit; follow them as the worked example.

- [ ] **`makeSACStateSchemaDef()`** — or the field never persists.
- [ ] **`cloneSACState()`** — or recap replays from a state the live game never
      had. There is no completeness test for this function.
- [ ] **`gameStateToResponse()` + `ISACSpecificGameStateResponse`** — or the UI
      can't see the offer.
- [ ] **The `registration` array** in the command route, for each new command,
      alongside `@serializable export class`.
      `serializableRegistry.test.ts` matches `@serializable`, `export`, `class`
      separated by whitespace only — so a class declared without `export`, or
      with a comment between the decorator and the class, is invisible to that
      guard.

👀 **The response speaks usernames; the offer speaks user IDs.**
`ISACSpecificGameStateResponse.playerStates` is keyed by **username**, and
`gameStateToResponse` already maps IDs→usernames for `longestRoadOwner` /
`largestArmyOwner`. The offer holds `proposerId` (a Clerk user ID), so the
response shape must carry the proposer as a **username** (or both), or the offer
row can't render a name and `playerByUserId` gets reinvented in the UI.

Finally, both new commands need the conventions every other SAC command follows:
`myString()` — which is not cosmetic, it feeds `ITurnSnapshot.command.summary`
and the route's request log — and `Undo()`, which is `commandHistory.pop()`
everywhere in this game.

### 10.10 Concurrency and recap

**Trading is the first place in this app where two different players
legitimately act on the same game document at once.** The good news is that it
is already handled: both accepters pass `Execute` against separately-fetched
documents, the loser's `save()` throws a `VersionError`, `trySave` returns
false, the route returns 409, and `useSubmitCommand` already resyncs on 409. No
locking to build. Two details belong in the implementation:

* **`SACAcceptTrade.Execute` must clear the offer as its first mutation**, so a
  second accept against a re-read document fails `validMove` rather than racing.
* **Re-validate both sides at execution, never at proposal.** The proposer's
  hand can be emptied by a robber, a Monopoly, or their own building between
  offering and acceptance. No escrow, no reservation, no locking — just return
  `{ validMove: false }` and let the existing 401 path prompt a refresh.
* The 409 copy on this path should read **"someone beat you to it"**, not
  "please refresh".

**Recap** (`src/games/SettlementsAndCities/recap.ts`) deliberately skips roads
and maritime trades as low-signal chatter. A player-to-player trade is the
opposite — it is exactly the social beat the recap feed exists for. Add **one**
case to the switch, for the *accept* only (offers and declines are noise):
`glyph: "🤝"`, a title, and `affectedIds: [proposerId]` so it reads correctly
for both sides and so a reaction can be dropped on it. No new adapter, no new
event plumbing.

🪨 **The clear-first rule above collides with this one.** `toEvents` receives
`prev` / `next` *response* snapshots, and after a clear-first `Execute` the
offer is already gone from `nextState`. **The recap case must read the offer's
details out of `prevState`.** Two individually correct rules that silently
produce a broken recap event if their interaction goes unnoticed.

### 10.11 Notifications

`ARCHITECTURE.md` §8 is explicit: **no silent data-only pushes** — WebKit
revokes a subscription after three pushes that display nothing, and the old
`TurnTaken`/`TurnExpired` pushes were deleted for exactly this. A trade feature
is a fan-out feature, so it is precisely where that rule gets broken by
accident.

* **Two events, both carrying visible copy:** `TradeOffered` (to eligible
  responders) and `TradeAccepted` (to the proposer). Both built in
  `notificationContent.ts` via `gamePush()` so they inherit the game's artwork
  and body truncation — never written inline in a route — and both carrying
  `gameNotificationLink`, or tapping the notification goes nowhere.
* **Nothing else pushes.** Declines, cancellations and expiries refresh through
  `pollWhileWatching` and `refreshOnVisible` (§10.2), which already cover exactly
  the players who can respond.
* **A new `trade` notification channel**, so trading pushes can be turned off
  without losing turn pushes. Do *not* reuse the reserved `chat` channel — its
  settings label says "When a player sends you a message". Note that adding a
  channel is a **four-place edit** in `notificationPreferences.ts` —
  `ALL_NOTIFICATION_CHANNELS`, `DEFAULT_PREFERENCES.channels`, the hand-written
  per-key fallback mapping inside `getNotificationPreferences`, and the
  `NOTIFICATION_CHANNELS` label array — because the channel list is spelled out
  four times. Nothing else needs touching: the preferences route iterates
  `ALL_NOTIFICATION_CHANNELS` and the settings screen iterates
  `NOTIFICATION_CHANNELS`. An existing smell worth tidying, not a blocker.
* **Only notify players who could actually fill the offer** — holding the wanted
  resources, and not already dismissed. An open offer in a 6-player game must
  not be five pushes. This is a server-side filter over hands the server can
  see; who it selected must never come back to the proposer, in the response or
  anywhere else, or the offer becomes a probe for what everyone is holding
  (§10.2a). This needs the `ICommandOutcome.notify` contract change in
  §10.3; it cannot be done from the route without breaking the game-agnostic
  rule. Eligibility is evaluated **once, at proposal, and never re-evaluated**
  (see §10.14).
* **Rate-limit per proposer per turn** (three offers is plenty), so trading
  can't become a nuisance vector — the same concern `/api/game/nudge` lives
  under.
* **Client wiring:** `useGameData` currently subscribes to
  `TURN_ADVANCED_EVENTS`, which is documented as "the turn has moved on" — a
  trade doesn't belong in it. Add a `GAME_UPDATED_EVENTS =
  [...TURN_ADVANCED_EVENTS, 'TradeOffered']` constant in `usePushEvents.ts` and
  point `useGameData` at it: one constant, one changed line, every game screen
  benefits. Do **not** add a second `usePushEvents` call inside the SAC page.

### 10.12 UI — extend what exists, don't clone it

**The resource picker already exists.** `SettlementsAndCitiesActions.tsx`'s
maritime modal is already a "You give / You get" two-grid picker built from
`ag-trade-section`, `ag-trade-label`, `ag-trade-grid`, `ag-trade-opt`
(`--active`, `--disabled`), `ag-trade-opt-emoji`, `ag-trade-opt-ratio`,
`ag-trade-opt-have`, `ag-trade-preview` and `ag-trade-preview-arrow`. A trade
composer that rebuilds that grid is a straight second copy — the exact defect
`AGENTS.md` names.

**Extract before writing the second caller.** A game-local
`components/SACResourcePicker.tsx` — props roughly
`{ values, onChange, availability, ratioFor?, label }` — then the bank modal
renders it with `ratioFor={tradeRatio}` and the trade composer renders it with
plain counts. One component, two callers. It stays in the game folder, **not**
`components/ui/`: five named resources are SAC domain, not a cross-game
primitive.

While in there, fix duplication this feature would otherwise deepen:
`RESOURCE_EMOJI` is already declared **three times** — in
`SettlementsAndCitiesActions.tsx`, in
`src/app/games/settlementsandcities/[gameid]/page.tsx`, and again in
`SettlementsAndCitiesBoard.tsx` — and the trade panel would be the fourth.
Along with `RESOURCES` and the `costText` / `shortfall` helpers, it belongs in
`src/games/SettlementsAndCities/ui.ts`, which already holds `SAC_DEV_CARD_META`
for exactly this reason.

The rest of the surface should invent nothing:

* **Offer row** — `ListRow` (`icon | title | sub | action`) is already
  "avatar · *Priya offers 🐑2 → ⛏️1* · [Accept]". Inside the action sheet, the
  `ag-build-row` / `ag-build-main` / `ag-build-name` / `ag-build-cost` /
  `ag-build-tag--muted` shape already does "thing + cost line + trailing tag,
  with a disabled state".
* **Accept / decline** — `ag-pill-action ag-pill-action--accept` is the existing
  accept pill (`IncomingInvitesList` is the working example); decline is the
  same class without the modifier.
* **"An offer is live" banner** — `ag-callout`, already used for the Special
  Build notice.
* **Composer modal** — Bootstrap `<Modal dialogClassName="ag-modal">`, which is
  sanctioned on board screens and already used by the maritime modal.
* **In-flight state** — `ActionButton` + `PendingTag` and the existing
  `pendingTarget` mechanism already threaded through the actions component. New
  targets are just `'proposeTrade'` / `'acceptTrade'`. No new spinner, no new
  CSS.
* **Optimistic dismiss** — `TheirTurnList`'s pattern: local set of acted-on ids,
  disable the control, toast on success, roll back on failure.
* **Where the "Offer a trade" button goes** — the actions sheet already has an
  `ag-action-grid` holding exactly one button ("⚖️ Trade with the bank"), and
  that class is `display:flex; gap:8px` with `> * { flex: 1 }`. It is literally
  built for a second button beside it. The alternative someone will otherwise
  reach for is a new full-width row.

**Net new CSS should be zero.** A new `ag-trade-offer-*` block in the theme file
is a sign something is being rebuilt.

🪨 **One structural trap.** The board page renders
`<SettlementsAndCitiesActions>` only when `isMyTurn`. The responder panel is a
genuinely new render branch, and the obvious wrong move is to copy the 581-line
action sheet to get an off-turn variant. It must be a small sibling — roughly
`{!isMyTurn && !complete && gs?.openTrade && <SACTradeOffer … />}`, ~40 lines,
rendering the shared picker read-only plus an accept pill.

One naming note: `components/ui/OfferCard.tsx` already exists and is the app's
install/notifications pitch card. Don't call anything here `OfferCard`.

### 10.13 Out of scope

Named explicitly so they don't creep in:

* **Free-text chat or haggling threads** — belongs to the planned messaging
  feature with its moderation dependencies (§10.6), not to trading.
* **Three-or-more-way trades** — §5 Phase 2's own rule is that the active player
  is party to every transaction; a party matrix models more than the rules
  allow, for a large UI and a small payoff.
* **Counter-offer chains** — a counter is a replaced offer (turn-scoped) or a
  new offer (standing). Don't build a tree.
* **Targeted offers ("offer to Sam only")** — an open offer already reaches
  everyone who could fill it, and since hands are hidden (§10.2a) the proposer
  has no better information to target *with*. Targeting adds a picker and a
  permission check for very little, and only becomes interesting once standing
  offers exist.
* **Auto-accept rules / trading bots** — turns a social mechanic into a config
  screen.
* **A trades history tab** — the recap event (§10.10) already puts settled
  trades in "since you were last here" and in the next player's push.
* **Trading dev cards or victory points** — not a Catan rule.
* **Anything cross-game.** No second game needs this. Every line stays inside
  `src/games/SettlementsAndCities/`, except the handful §10.3, §10.4 and §10.11
  genuinely require.

### 10.14 Suggested phasing

| Phase | Scope | Why this order |
| --- | --- | --- |
| **0 — pure refactor** | Extract `SACResourcePicker` from the maritime modal; move `RESOURCE_EMOJI` / `RESOURCES` / `costText` / `shortfall` into `ui.ts`. No behaviour change. | Lands the reuse work on a clean diff, so the risky engine change reviews on its own. |
| **1 — the hole in the wall** | The server-side off-turn allowlist, the three-line route guard, the `timestamp` restamp, and the `replay.ts` one-liner. `SACProposeTrade` (on-turn) and `SACAcceptTrade` (off-turn). One nullable turn-scoped `openTrade`, cleared in `sacAdvanceMainTurn`. The small responder panel. Decline is client-side. One `TradeOffered` / `TradeAccepted` push pair and the `trade` channel. One recap case. | Proves the engine change end-to-end on the narrowest case. No timers, no cron, no new collection, no new CSS. |
| **2 — the standing want-ad** | Offers become a list and outlive the turn, **with deadlines from the start** (§10.7): the bucket field, lazy expiry, persisted `declinedBy`, re-validation. Optionally `SACCancelTrade`. | The shape most likely to make async trading actually happen. **Prerequisite:** the §10.8 settlement-rule decision is a rules/balance call and must be settled *before* this phase starts, not inside it. |
| **3 — polish** | The live countdown label, real counter-offers, offers surfaced on the home dashboard. | Genuine polish on a working market. Safe to defer. |

Two notes on why deadlines sit in Phase 2 rather than Phase 3, against the
instinct to defer them:

* **Deadlines are cheaper than cancellation.** Lazy expiry (§10.7) is a derived
  comparison; `SACCancelTrade` is a whole command plus a UI affordance. Deadlines
  are also the natural garbage collector for a want-ads board.
* **Standing offers without expiry is the worst intermediate state.** Offers
  would live forever, exiting only via a cancel the proposer has to remember to
  send — accumulating in `specificGameState`, re-validated against hands that
  emptied days ago, and still cluttering the responder panel.

Two things Phase 2 inherits that are easy to miss when scoping it:

* **The rate limit loses its anchor.** §10.11's "per proposer per turn" stops
  meaning anything once offers outlive turns — a proposer may not have a turn
  for a day. Re-specify it as per-game or per-time-window.
* **Eligibility is evaluated once, at proposal, and never re-evaluated.** On a
  standing offer, players *become* able to fill it later, and "re-notify when
  they can" needs a hook on every resource change and is a spam vector. State
  the rule rather than leaving it to be discovered.

And one thing Phase 1 should say out loud so nobody "fixes" it later: **a
client-side decline is lost on refresh and on a second device, and that is
acceptable for an offer that dies at the end of the turn.** Without that
sentence, someone will persist `declinedBy` in Phase 1 and drag Phase 2's state
model forward.

Phase 1 carries all the architectural risk. Phases 2 and 3 are additive and each
is independently shippable.

### 10.15 Open questions

1. **Does trading need to be an opt-in game setting**, like the expansions in
   `expansions.ts`, so a group can play the strict printed rules? Cheap at
   creation time, awkward to retrofit — worth deciding before Phase 1 persists
   its first field.
2. **Open market or anchored settlement (§10.8)?** Recommended open. This is a
   rules/balance call, not an implementation detail — it must be settled
   *before* Phase 2 starts rather than decided inside it.
3. **Should an offer survive its proposer's turn by default?** The default
   matters more than it looks: `true` is faithful, `false` is what makes async
   trading work.
4. **Do offers belong on the home dashboard** ("2 offers waiting") as well as
   the board screen? That is where the re-engagement value is, but it is a
   cross-game surface change.
5. **How much imbalance is a legal trade?** The no-gifts rule blocks 0-for-N,
   but not 1-for-8. Cap it, or trust the visible history and the table?
