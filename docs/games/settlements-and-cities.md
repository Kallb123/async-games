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
