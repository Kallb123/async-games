# Game Design Document: Dice Cities

## 1. Game Overview

* **Genre:** Tableau Building, Engine Building, Dice Rolling, Economic Strategy
* **Target Audience:** 8+ years old (Family/Casual Strategy)
* **Player Count:** 2–4 players (expandable to 5 with expansions)
* **Estimated Playtime:** 30 minutes
* **Core Concept:** Each player is the mayor of their own tiny city. Players roll dice to activate the establishments they own, earn income, and reinvest that income into new buildings and civic landmarks. The first mayor to complete all of their landmarks wins.

---

## 2. Theme & Setting

Dice Cities is a light, upbeat economic game set in a bustling region of rival towns. Every player begins with a single Wheat Field and a Bakery and the ambition to grow their sleepy hamlet into a thriving metropolis. Fortunes are decided by the roll of the dice: a lucky number sends money flowing into wheat farms, cafes, and factories, while a shrewd mayor arranges their establishments so that almost every roll pays out. The tone is friendly and competitive rather than confrontational — you build your own city, but you can occasionally reach into a neighbour's coin purse.

---

## 3. Physical Components

* **Establishment Cards (base game):** A shared supply of purchasable buildings, grouped by activation number. Multiple copies of each card exist so more than one player can own the same establishment.
* **Landmark Cards:** 4 major construction projects per player (Train Station, Shopping Mall, Amusement Park, Radio Tower), each starting face-down/inactive.
* **Starting Cards:** Each player begins with 1 Wheat Field and 1 Bakery already built.
* **Coins (Money tokens):** Denominations of 1, 5, and 10. Money is public information.
* **Dice:** 2 six-sided dice (2d6). The base game begins with each player rolling only 1 die; the second die is unlocked by building the Train Station.

---

## 4. Setup

1. **Starting Tableau:** Deal each player 1 Wheat Field and 1 Bakery. These are placed face-up in front of the player.
2. **Starting Money:** Each player takes **3 coins**.
3. **The Market:** Sort the establishment supply by type and place it in the middle of the table where all players can reach it. Every card in the supply is available for purchase at all times (an "open market").
4. **Landmarks:** Give each player their 4 Landmark cards, placed face-down/inactive in their play area. Their cost and effect are visible, but they are not yet built.
5. **First Player:** The youngest player goes first; play proceeds clockwise.

---

## 5. Core Gameplay Loop

Play proceeds clockwise. On their turn, the active player performs three phases in strict order:

### Phase 1: Roll Dice

The active player rolls **1 die** (or **2 dice** if they have built the Train Station). The total rolled determines which establishments across **every** player's city may activate this turn. The active player announces the number.

### Phase 2: Earn Income

All players resolve any of their establishments that match the rolled number. Cards pay out (or charge) according to their colour category and whose turn it is (see *Mechanics & Systems*). Income is resolved in a fixed priority order to handle the case where a player cannot afford a payment.

### Phase 3: Construction

The active player may spend money to buy **one** establishment from the market **or** build **one** landmark — or choose to build nothing and keep their money. A newly purchased card is placed in the player's tableau and is active immediately (starting next turn's rolls). A player may never own more landmarks than the four provided, but may own many copies of most establishments.

The turn then passes to the next player clockwise.

---

## 6. Mechanics & Systems

### Card Colours (Activation Timing)

Every establishment has a colour that dictates **when** it triggers relative to whose turn it is. This colour system is the heart of the engine.

| Colour | Triggers On | Effect |
| --- | --- | --- |
| **Blue (Primary Industry)** | **Anyone's** turn | Earns income from the bank whenever the number is rolled, regardless of whose turn it is. Reliable, always-on income. |
| **Green (Secondary Industry)** | **Your own** turn only | Earns income from the bank, but only when *you* are the active player. |
| **Red (Restaurants)** | **Another player's** turn only | When an opponent rolls this number, they must pay *you* from their own funds. Your defence against opponents' rolls. |
| **Purple (Major Establishments)** | **Your own** turn only | Powerful effects (stealing coins, swapping cards) that trigger only on your turn. Limited to one copy of each per player. |

### Income Resolution Order

When a number is rolled, effects resolve in a fixed sequence so that a cash-strapped active player is handled fairly:

1. **Red** (restaurants) — the active player pays opponents first.
2. **Blue & Green** — the bank pays out to all eligible owners.
3. **Purple** — the active player's major establishments resolve last.

If the active player owes a Red payment but does not have enough money, they pay what they can; the difference is **not** owed as debt (players can never be driven below zero). Coins are never taken on credit.

### The Landmarks (Win Engine)

Landmarks are expensive one-time upgrades. Each is built only once per player and, once built, grants a permanent passive ability. Building all four ends the game.

| Landmark | Typical Cost | Permanent Effect |
| --- | --- | --- |
| **Train Station** | 4 | Roll **1 or 2 dice** each turn (your choice). Unlocks the entire upper half of the number range. |
| **Shopping Mall** | 10 | Each of your Cup and Bread icon establishments (cafes, bakeries, etc.) earns **+1 coin** whenever it activates. |
| **Amusement Park** | 16 | If you roll **doubles** with two dice, take **another turn** after this one. |
| **Radio Tower** | 22 | Once per turn, you may **re-roll** your dice. |

### Example Base-Game Establishments

The base supply is tuned so that low numbers (reachable with one die) are cheap and safe, while high numbers (needing two dice) pay more but require the Train Station.

| Establishment | Colour | Activates On | Cost | Effect |
| --- | --- | --- | --- | --- |
| **Wheat Field** | Blue | 1 | 1 | Get 1 coin from the bank. |
| **Ranch** | Blue | 2 | 1 | Get 1 coin from the bank. |
| **Bakery** | Green | 2–3 | 1 | Get 1 coin from the bank (your turn). |
| **Cafe** | Red | 3 | 2 | Take 1 coin from the active player. |
| **Convenience Store** | Green | 4 | 2 | Get 3 coins from the bank (your turn). |
| **Forest** | Blue | 5 | 3 | Get 1 coin from the bank. |
| **Stadium** | Purple | 6 | 6 | Take 2 coins from **every** opponent. |
| **TV Station** | Purple | 6 | 7 | Take 5 coins from one opponent of your choice. |
| **Business Center** | Purple | 6 | 8 | Swap one non-landmark establishment with an opponent. |
| **Cheese Factory** | Green | 7 | 5 | Get 3 coins per Ranch (Cow icon) you own. |
| **Furniture Factory** | Green | 8 | 3 | Get 3 coins per Forest/Mine (Gear icon) you own. |
| **Mine** | Blue | 9 | 6 | Get 5 coins from the bank. |
| **Family Restaurant** | Red | 9–10 | 3 | Take 2 coins from the active player. |
| **Apple Orchard** | Blue | 10 | 3 | Get 3 coins from the bank. |
| **Fruit & Veg Market** | Green | 11–12 | 2 | Get 2 coins per Wheat (grain icon) establishment you own. |

### Icon Combos (Engine Synergies)

Some establishments multiply their payout based on icons you already own. This rewards planning a coherent city rather than buying at random:

* **Cheese Factory** pays per **Cow** icon (Ranches).
* **Furniture Factory** pays per **Gear** icon (Forests and Mines).
* **Fruit & Vegetable Market** pays per **Wheat/Grain** icon (Wheat Fields, Apple Orchards).
* The **Shopping Mall** landmark boosts every **Cup** and **Bread** icon building.

---

## 7. Win Conditions

The game ends **immediately** the moment a player finishes constructing their **fourth and final landmark** (Train Station, Shopping Mall, Amusement Park, and Radio Tower) on their turn. That player is the winner.

There is no points tally and no tie-break: the first mayor to complete all four landmarks wins outright. Money left over is irrelevant except as the means to build.

---

## 8. Optional Expansion: The Docks (Harbour)

The Docks expansion adds a coastal district that deepens the mid- and late-game economy. It is fully compatible with the base game and is recommended once players are comfortable with the core loop.

### New Components & Setup

* **The Harbour (Landmark):** A **fifth landmark** available to every player, but **not** required to win. It may be built before the other four.
* **New Establishments:** A batch of new sea- and travel-themed cards is shuffled into the market, several of which activate on numbers **1–14**.
* **Two-Die Range Extension:** Several new cards activate on totals **higher than 12** — reachable only via the new Harbour rules below.
* **More Money:** The expansion brings its own coins — 12 pieces worth 20 each, another **240**. The base box holds **262** (42 ones, 24 fives, 10 tens), so a Docks game is played from a supply of **502**. The implementation counts value rather than coins, so denominations do not matter, only the totals.

### New Rules

* **The Harbour (built for ~2 coins):** *Passive.* If you roll a total of **10 or more**, you may add **+2** to your dice result. This unlocks activation numbers **11–14** and lets a player "aim" for lucrative high-number cards.
* **Card Choice on Purchase:** In the base game every card is always available. The Docks introduces an optional **"draw and stock" market variant** (see below) to keep the larger card pool manageable.

### New Establishment Examples

| Establishment | Colour | Activates On | Cost | Effect |
| --- | --- | --- | --- | --- |
| **Sushi Bar** | Red | 1 | 2 | If you have the **Harbour**, take 3 coins from the active player (otherwise inactive). |
| **Flower Orchard** | Blue | 4 | 2 | Get 1 coin from the bank. Feeds the Flower Shop combo. |
| **Flower Shop** | Green | 6 | 1 | Get 1 coin per **Flower Orchard** you own (your turn). |
| **Mackerel Boat** | Blue | 8 | 2 | If you have the **Harbour**, get 3 coins from the bank. |
| **Food Warehouse** | Green | 12–13 | 2 | Get 2 coins per **Cup** (restaurant) icon establishment you own. |
| **Tuna Boat** | Blue | 12–14 | 5 | If you have the **Harbour**, a shared throw of **two dice** sets the payout; every Tuna Boat owner earns that many coins. |

### Optional "Open Market" Variant for a Larger Pool

Because the combined card pool is large, the Docks recommends a curated market that limits choice per turn while keeping variety high:

* Sort the supply into **three stacks** by broad value: low numbers (1–6), high numbers (7+), and major/purple establishments.
* Deal face-up rows until **10 distinct types** are available across the stacks (some sources use 5/5/2). When a type sells out or a new type is revealed, refill so the market always shows the target number of **distinct** establishments.
* This keeps the game moving and prevents any single powerful card from being spammed early.

---

## 9. Optional Expansion: Billionaires Row (Millionaires Row)

Billionaires Row is a set of premium, high-value establishments and an alternate market intended for players who want a faster, higher-stakes economy. It can be combined with the base game and with The Docks.

### New Components & Setup

* **Premium Establishments:** A set of expensive, powerful cards (loan offices, publishers, tax offices, and marquee attractions) that reward heavy investment.
* **Marketplace Draft:** Billionaires Row is designed to be played with the **curated open market** — a fixed number of distinct establishment types are on offer at any time, so premium cards appear over the course of the game rather than all at once.
* **Fifth Player Support:** With the extra card volume, the expansion supports up to **5 players**.

### New Rules & Mechanics

* **Renovation / Closure Effects:** Some premium purple cards can temporarily **close** an opponent's establishment type. Closed (flipped) establishments do **not** activate until their owner "reopens" them on a future turn (typically by that owner activating the affected type). This adds a light take-that layer of tempo control.
* **Loans & Debt Instruments:** Certain cards let a player take money up front in exchange for a recurring cost, giving cash-poor mayors a way to accelerate — at a price.
* **Comeback Economy:** Several cards specifically reward the player who is **behind** (fewest landmarks or least money), softening runaway leaders and keeping every player in contention.

### New Establishment Examples

| Establishment | Colour | Activates On | Cost | Effect |
| --- | --- | --- | --- | --- |
| **Loan Office** | Green | 5–6 | (gain 5 now) | Take 5 coins from the bank immediately on purchase, then pay 2 coins each time it activates. |
| **Renovation Company** | Purple | 8 | 4 | Close all establishments of one chosen type across all opponents; collect a fee per card closed. |
| **Tax Office** | Purple | 8–9 | 4 | Take **half** (rounded down) of the coins from any opponent who holds **10 or more** coins. |
| **Publisher** | Purple | 7 | 5 | Take 1 coin from every opponent per **Cup + Bread** (cafe/bakery) icon they own. |
| **Corporate HQ** | Green | 11–12 | 4 | Get 8 coins from the bank if you are **not** in the lead on landmarks. |
| **Exhibition Hall** | Purple | 11–12 | 3 | Close one opponent card worth 6+ and collect its value; owner reopens it on their turn. |

### Interaction Notes

* Billionaires Row is a **replacement/addition** to the purple tier — it noticeably increases player interaction and swing. Groups who prefer a gentler game can include only its green income cards and leave out the closure effects.
* When combining **The Docks + Billionaires Row**, use a single curated market with the recommended distinct-type count (commonly 5 low / 5 high / 2 major) so both expansions' cards cycle in fairly. Landmark costs and win condition are unchanged: complete your four core landmarks to win. (The Harbour remains an optional fifth landmark and is never required for victory.)

---

## 10. Design Notes & Balance

* **Probability Curve:** With one die every number 1–6 is equally likely; with two dice the distribution peaks at 7. Card costs and payouts are tuned against these odds — cheap, low-number Blue cards give steady early income, while expensive high-number cards are gated behind the Train Station and pay out more to compensate for their rarity.
* **The Two-Die Decision:** The Train Station's "1 or 2 dice" choice is the central strategic pivot. A player invested in low numbers keeps rolling one die; a player invested in 7–12 cards switches to two. This makes the *order* in which you build your engine matter as much as *what* you build.
* **Catch-Up Tension:** Red restaurants and purple major establishments are the game's balancing valves — a runaway leader taking many turns also hands opponents' restaurants repeated payouts. Billionaires Row leans into this with explicit "behind player" bonuses.
* **Async Suitability:** Dice Cities fits the Async Games model well: each turn is a single roll plus a single build decision, all state (money, tableau, landmarks) is public, and the only hidden randomness is the dice roll — which the server resolves and records. There is no simultaneous action, so turns serialise cleanly into the asynchronous turn lifecycle.
