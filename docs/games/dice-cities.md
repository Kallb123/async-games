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

The rules carry no dependency on that dressing. Two appendices re-skin the
whole game — every base, Docks and Billionaires Row card — to prove it:
[§12](#12-appendix-alternative-theme--rust--bottlecaps) is a post-nuclear
wasteland paid for in bottlecaps, and is the one that shipped;
[§13](#13-appendix-alternative-theme--outer-rim) is a galactic civil war paid
for in credits, and is on paper only.

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

---

## 11. Public Information: Seeing the Other Cities

Every card in Dice Cities sits face-up on the table. §10 already takes that
as read — "all state (money, tableau, landmarks) is public, and the only
hidden randomness is the dice roll" — and the rules lean on it hard. A Red
card is paid out of the *roller's* pocket, so what an opponent has built is
literally the price of your own turn: a player who cannot see the other
cities cannot tell whether rolling a 3 costs them one coin or four, cannot
tell whether the Cheese Factory is worth 6 coins a turn to them and nothing
at all to their neighbour, and cannot see the Stadium being lined up
against them.

The app did not show them.

**Option B′ is built** — the shared landmark track of §11.4 and the city
stack of §11.5 are what the board screen does today. §11.1 is kept as the
record of what the gap was, and options A, C and D remain unbuilt: they are
the alternatives this design was chosen over, and §11.6 says why.

### 11.1 Where it stood before this

**Nothing is hidden on the wire.** `CreateDataResponse` in
`DiceCitiesModels.ts` takes a `_viewerId` and ignores it, and
`gameStateToModel` walks the entire `playerStates` map, sending every
player's cards, coins, landmark flags and dice choice to everyone at the
table. There is nothing to unredact and no API contract to change — the
client is already holding every city it would need to draw.

What the board screen did with that payload was the gap:

* **`page.tsx` drew exactly one city.** `boardPlayer` was the viewer's own
  seat, falling back to whoever's turn it was, falling back to the first
  seat; it went to `DiceCitiesBoard` and the other seats went to the action
  sheet and nowhere else.
* **The landmark track only tracked one player.** `DiceCitiesBoard` drew
  the four (five with the Docks) landmark tiles from
  `buildableLandmarks()` and lit them from the `playerState` it was
  handed — so the one component that already named every landmark on the
  board reported a single city's progress.
* **The scoreboard stops one step short.** `GameScoreboard` already gives
  every player a pill with their colour, name, landmark count and coins —
  everything except what they own. `★ 3/4` says how close someone is
  without saying to what.
* **Opponents' establishments already rendered in full, in one place.** The
  Business Center's "choose an opponent's establishment to take" picker in
  `DiceCitiesActions.tsx` laid out every opponent's cards, grouped by
  player. The app already accepted that these cards were the viewer's to
  look at — just only while an 8-coin purple card was resolving.
* **The history log leaks it all anyway.** Every purchase writes
  "*Dave bought a Cafe*". A determined player can reconstruct all four
  cities by scrolling back to turn one. The information is not secret; it
  is merely tedious to assemble.

One more fact shapes every option below: **`DiceCitiesBoard` is already the
right component.** It takes a `playerState` plus an `ownerLabel` and draws
whoever it is handed, captioning the tableau "Dave's city" when it isn't
yours. The work is routing more player states into a component that already
copes, not drawing cities.

### 11.2 What any answer has to do

1. **Never leave any doubt whose city is on screen.** The build step always
   spends *your* coins into *your* city; anything that can put another
   tableau in front of the player must say so loudly and offer an obvious
   way back.
2. **Keep `opponents` anchored to the viewer's seat.** `opponents` was
   derived from `boardPlayer` (`players.filter(p => p.userId !==
   boardPlayer.userId)`), so any option that let `boardPlayer` become
   someone else had to decouple the two, or the TV Station picker would
   offer to rob the viewer and skip the player they were looking at. B′
   discharged this by deleting `boardPlayer` outright.
3. **Cost nothing on the turn you are actually taking.** Roll → collect →
   build is a handful of taps in an async game; browsing must not stand
   between the player and their build.
4. **Fit four players in a phone column** — and leave room for the five §9
   designs for, even though `meta.ts` caps the shipped game at four seats
   today. A late-game city runs to a dozen-plus establishment types plus a
   five-slot landmark track.
5. **Work under turn review.** Past states carry the full `playerStates`
   map, so whatever is built must read from `nav.displayedState` and keep
   behaving while a reviewed or finished turn is on screen.
6. **Not crash for a seatless viewer.** `myState` is `undefined` for anyone
   opening a game they are not in. Under B′ they simply match no seat, so
   every city is an opponent's and the turn sheet hides itself as it
   already did.
7. **Reuse `DiceCitiesBoard` rather than growing a second way to draw a
   city.** A compact opponent-only tableau that drifts out of step with the
   real one is the duplication `AGENTS.md` treats as a defect.

### 11.3 The options

| # | Option | What the player gets | Pros | Cons | Verdict |
|---|---|---|---|---|---|
| **B′** | **Stacked collapsible cities under a shared landmark track** (§11.4) — your city where it is today, one collapsed row per opponent below it, and a single landmark track at the top carrying every player's progress | Everyone's landmarks at a glance, always; any opponent's establishments one tap away | Requirements 1 and 2 never arise: your own city never moves, so nothing points `boardPlayer` elsewhere and the robbery pickers stay anchored. Several cities open at once for real comparison. Built from parts we own — the `ag-disclosure` `<details>` block (so the panels need no open state at all), `seatOrderFrom`, one `DiceCitiesBoard` per panel — plus a track that is a **split** of an existing component, not a new one. The shared track is smaller *and* says more than the four private tracks it replaces. Scrolls, screenshots and reads to a screen reader as one document. | Still the longest page of any option once panels are open. The track's pip row is the one genuinely new piece of markup, and its space budget is tight at five tiles on a narrow phone (§11.4). Costs a component split that A does not. | ✅ **Recommended** |
| **A** | **Tap a scoreboard pill** — the board swaps to that player's city; tap again (or a "back to your city" bar) to return | One city at a time, chosen from the strip already at the top of the screen | Cheapest possible: `ScoreEntry` already carries `onClick` and `highlighted`, `boardPlayer` already accepts any seat, `ownerLabel` already captions it. **No new component at all** — one `useState` and a banner. Page height unchanged. Outbreak already teaches the tap-a-pill gesture. | Puts another player's tableau where yours normally sits, so requirement 1 has to be actively defended and requirement 2 is a live trap. One city at a time; comparison means tapping back and forth. A pill is a smallish tap target. | ⚠️ **Fallback** if the stack proves too long |
| **C** | **Swipeable gallery** — one full-width city, swipe or arrow between seats, yours first | A deck of cities to flip through | Constant page height, full column width per city, cards stay big. Two cities land in the *same* screen position, so swiping diffs them in a way scrolling never does. | **The repo has no carousel, no swipe handler and no `scroll-snap` anywhere** — a new shared primitive to build, document and maintain (a caveman finding unless it is written for `components/ui/` and other games adopt it). Horizontal gestures fight vertical page scroll and the turn-nav controls. Needs dots/arrows and keyboard equivalents. Same requirement-1 exposure as A. | ⚠️ Only as a shared primitive |
| **D** | **Roll-number summary strip** — per opponent, a row of chips 1–14 marking what pays them, expanding to the full city | The answer to "what does my roll pay them?" in two lines | Smallest footprint of anything here; scales cleanly to five players; answers the question the Red cards actually pose. | It is a *second* way of drawing a city — requirement 7 — unless the chip row is factored out and reused in the real board. Loses the card art the game just invested in being tappable. Still needs a route through to the detail. | ➕ An addition to B′, not an answer |
| **E** | **Status quo** — Business Center picker and the history log | Nothing | No work. | Contradicts §10 and the game guide, both of which tell the player these cards are public and pay out on everyone's roll. Leaves the Red economy unreadable and makes the log the only route to public information. | ❌ Leaves a real defect |

### 11.4 The shared landmark track

This is the piece that makes B′ worth doing, and it is **separable from the
option choice** — A and C would both have been better with it too.

**The insight:** landmarks are not like establishments. A city's
establishment grid is open-ended and differs wildly between players, which
is why it needs a panel each. The landmark track is the opposite — the same
four (or five) fixed slots for everybody. Four players' landmark progress is
a **matrix**, not four lists, and drawing it four times over is both the
bulk of B's page-length cost and a worse presentation than drawing it once.

**What it looks like.** Each tile keeps its art, name, cost and its current
built/unbuilt styling *for the viewer* — your own reading of the track does
not change. Beneath the cost line each tile gains a row of pips, one per
seat, in `userIdList` order and coloured by `playerColourForId` so they
match the scoreboard, the log and the turn recap:

* **Filled pip = built. Hollow pip = not built.** The state is carried by
  shape, not colour, so the row survives colour-blindness and greyscale;
  colour only carries *identity*. The pips themselves are `aria-hidden`
  behind one `role="img"` label on the row — "Train Station: built by you,
  Sam" — so a screen reader gets one sentence per tile rather than a pip
  each.
* **Every seat always has a pip, in the same position on every tile.** That
  makes the row a small matrix: read across one tile to see who holds that
  landmark, read down the same position across tiles to see what one player
  has. Showing pips only for players who have built it would shift the
  positions tile by tile and destroy both readings.
* **Your own pip stays in**, ringed the way `ag-score-pill--me` rings your
  scoreboard pill. It is redundant against the tile styling, but dropping
  it makes the row's positions depend on which seat is yours.

**The pip is the app's seat swatch, not a new shape.** `.ag-score-dot` is
9px and Dice Cities' own `.ag-dc-legend-dot` 8px, both radius 2 — a pip
meant to echo the scoreboard pill should look like one.

**Space budget, as measured in a browser** (four seats, `deviceScaleFactor`
aside). In-game the column runs full width — `.ag-app:has(.ag-game)` drops
the 480px cap — so a 360px phone gives each of four tiles 72.8px, 62.8px of
it usable by the pip row, against the 41px four 8px pips with 3px gaps
need. Comfortable. The Docks' five tiles cut that to 56.8px (46.8px usable)
at 360px, still one row.

Where it actually runs out is **five tiles on a 320px screen**: 48.8px per
tile, 38.8px usable, and four pips wrap to two rows. That is narrower than
the estimate this section first carried, which had the wrap starting only
at five *seats* — so the `flex-wrap` is not a hypothetical for a board
`meta.ts` cannot deal, it is load-bearing on the smallest phones a Docks
game runs on. It degrades exactly as intended: the row wraps, the tiles
grow together, and nothing overflows.

**The component split.** `DiceCitiesBoard` drew the track *and* the city
from one `playerState`. The track had to become everyone's while
the city stays one player's, so the two separate:

* **`DiceCitiesLandmarkTrack.tsx`** (new) — takes the ordered seats,
  `userIdList`, `myUserId`, `enabledDocks` and `theme`; draws the tiles from
  `buildableLandmarks()` exactly as today, plus the pip row. `page.tsx`
  renders it once, above the city stack.
* **`DiceCitiesBoard.tsx`** keeps the establishment grid, its legend and
  `theme` — and *loses* its `enabledDocks` prop, which it only ever used to
  build the landmark list. `ownerLabel` collapses into a single `isViewer`
  flag: the caption and the collapsibility were never two independent
  choices (a city cannot read "Your city" and fold away behind a
  `<summary>` at the same time), so one boolean drives both.

**Where the sky goes.** `DiceCitiesBoard` wraps *both* halves in one
`ag-board-area ag-dc-area` — the blue sky plus a 12px flex-column gap. That
wrapper cannot move to both halves at once, and left unsaid the likely
outcome is five stacked skies or a near-copy class. `page.tsx` keeps one
wrapper around the track and the stack; the track renders only
`.ag-dc-landmarks` and the board only `.ag-dc-city`. That *removes* a div
from `DiceCitiesBoard` rather than adding one.

Otherwise the grid markup moves unchanged. This is a split of one component
into two, not a second way of drawing a city, so requirement 7 is satisfied
by construction. `ZoomableCardArt` keeps working on both halves, so tapping
a landmark tile still opens the full card.

**The cheaper cousin, considered and passed over.** `ScoreEntry.sub` is
already a `ReactNode` and already renders `★ 3/4` per seat, so the pips
could go *there* instead — the transpose of this matrix, at zero new
components and zero page height, which makes it the cheapest thing in this
section. The track still wins: it carries the landmarks' names, art and
costs, and reading *across* one tile ("who has the Train Station?") is the
direction a question about an opponent's engine actually asks in, where a
scoreboard `sub` can only be read per player. Worth revisiting if the pip
row proves too tight in practice.

### 11.5 The city stack

Below the track, in `seatOrderFrom(userIdList, myUserId)` order — viewer
first, the same rule `OutbreakHands` uses so finding your own cards never
means hunting the middle of a list:

* **Your city stays exactly where it is today**, expanded and not
  collapsible. Nothing about taking your turn changes.
* **Each opponent's city is a native `<details className="ag-disclosure">`,
  and its `<summary>` is the header the board already draws.**
  `.ag-dc-city-head` prints "Dave's city · 12 establishments" today, so
  making it the summary and adding an `ag-disclosure-chevron` gives the
  collapsed row its content for nothing — no second header to write, and no
  summary line that can drift out of step with the panel below it. (Keep
  the activation-colour legend in that header to your own city's copy; an
  opponent's summary wants the counts and the chevron, not a third copy of
  the key.)
* **There is no open state to keep.** `.ag-disclosure` exists for exactly
  this, and says so in `ag-theme.css`: "being closed by default costs no
  state and no JS". `<details>` elements without a shared `name` open
  independently, so "several open at once" — B′'s advantage over A and C —
  is the default rather than something to build. No `useState`, no toggle
  callback, and no question about whether to persist the open set.

The whole stack is therefore an `isViewer` flag on `DiceCitiesBoard`: when
false, `.ag-dc-city` *is* the `<details>` and `.ag-dc-city-head` its
`<summary>`. No new opponent-panel component, and nothing new that draws a
city.

```tsx
// page.tsx — one sky, the track once, then the cities, viewer first.
const seats = seatOrderFrom(userIdList, myUserId)
    .map(id => displayed?.playerStates?.[id])
    .filter((p): p is IDiceCitiesPlayerStateResponse => Boolean(p));

<div className="ag-board-area ag-dc-area" style={{ "--ag-dc-sky-1": theme.sky[0], "--ag-dc-sky-2": theme.sky[1] }}>
    <DiceCitiesLandmarkTrack seats={seats} userIdList={userIdList}
                             myUserId={myUserId} enabledDocks={enabledDocks} theme={theme} />
    {seats.map(p => (
        <DiceCitiesBoard
            key={p.userId}
            playerState={p}
            isViewer={p.userId === myUserId}
            theme={theme}
        />
    ))}
</div>
```

Both components take `theme` alongside the props above: a theme names every
card on the track and in the grid (`theme.cards`) and the nouns the captions
use (`theme.words`), exactly as `DiceCitiesActions` already did — see §12.

**What `page.tsx` sheds.** `seats` replaces `players`, and `boardPlayer`
and its fallback chain go with nothing left reading them — so requirement 2
is discharged by deletion rather than by care: `opponents` re-anchors to
`myState` directly and can no longer point anywhere else. Two tidy-ups fall
in the same pass: `colorForUserId` is declared and never called, and the
scoreboard hand-rolls `PLAYER_COLOURS[i % PLAYER_COLOURS.length]` where
`playerColourForId` is the helper that exists for it.

Because `seats` is derived from `displayed`, turn review (requirement 5)
and finished games come free: a reviewed turn draws the cities and the pips
as they stood then. A seatless viewer (requirement 6) simply has no seat
matching `myUserId`, so every panel is an opponent panel and the turn sheet
stays hidden as it already does.

### 11.6 Why B′ and not the others

**The track (§11.4) and the stack (§11.5) shipped together.** They were
planned as two steps — the track first, since it needs no navigation change
and would have been worth having even alone — but together they came to one
new component, one prop each way on `DiceCitiesBoard` and no new state, so
splitting them across two branches would have bought nothing.

B′ reversed the verdict this section originally reached. A was
recommended for costing nothing structurally, and that is still true. But
the shared track removes B's chief liability — four repeated landmark
tracks and the page length that came with them — and once that is gone B′
wins on the things that matter more than component count: your own city
never leaves the screen, so requirements 1 and 2 stop being hazards to
defend against and become conditions that cannot arise; and two cities can
be compared by opening both rather than by navigating between them.

A remains the fallback, and switching costs little: both options render the
same `DiceCitiesBoard`, so the stack's per-seat panel *is* A's swapped
board, and the shared track is worth having under either.

C should only be built if a swipeable gallery is wanted across the app —
Outbreak's hands, Settlements' player boards and this screen would all use
it — in which case it belongs in `src/components/ui/`. Built for one screen
it is the most expensive option here and the only one that adds a
maintenance surface.

D is worth revisiting after B′ ships, as a strip inside each city's header
rather than instead of the city — but only by extracting the chip row so
the viewer's own board shows the same thing about them.

### 11.7 What shipped

The track and the stack landed together, so they share one **What's new**
enhancement line ("See every city in Dice Cities") rather than taking one
each — one line per branch, per `AGENTS.md`. The game guide's "Card
colours" section gained the clause that sends a player looking: it is the
section that already explains why an opponent's cards cost you money.

Files: `DiceCitiesLandmarkTrack.tsx` is new; `DiceCitiesBoard.tsx` lost the
landmark track, its `enabledDocks` prop and its outer wrapper, and traded
`ownerLabel` for `isViewer`; `page.tsx` lost `boardPlayer`, its fallback
chain and a dead `colorForUserId`, and now builds one `seats` array for
both. Both components also take `theme` (§12), threaded through the same
way `DiceCitiesActions` already reads it. The pips and the collapsed head
are the only new CSS.

No `croupier` pass was needed for its own sake: this makes public state
visible, and §11.1 shows the server was already sending it.

---

## 12. Appendix: Alternative Theme — "Rust & Bottlecaps"

The shipped theme of Dice Cities is a bright Japanese-inspired region of rival
towns: wheat fields, bakeries, sushi bars and a radio tower. Nothing in the
rules depends on that dressing, so the whole game re-skins cleanly to a
post-nuclear wasteland in the vein of the Fallout games — a handful of
survivors rebuilding a settlement out of scrap, paying for everything in
**bottlecaps**.

This appendix is a naming reference only. **No costs, activation numbers,
colours, icons, limits or win conditions change** — a Brahmin Pen is a Ranch
with a different picture on it. The names below are a starting point to be
taken or swapped to taste — the columns that matter are the ones to their
right.

**This is implemented.** The host picks between "Rising Sun" (the game as it
ships) and "Rust & Bottlecaps" on the New Game screen, and the whole table
plays in the chosen one — cards, market, landmark track, turn log, game guide
and recap. The names below live in `src/games/DiceCities/themes.ts`, and the
cross-game machinery around them is written up in
[`docs/game-themes.md`](../game-themes.md). Two notes on what shipped:

- **The wasteland's card art has not been drawn yet.** Its folder,
  `public/art/dicecities/wasteland/`, starts as a copy of the Rising Sun one, so
  every card is drawable and the setup screen says the faces are placeholders.
  Redrawing a card is overwriting its file under the name it already has —
  `wheat-field.png` is the Hydroponic Plot's picture — with no code change, one
  card at a time.
- **App-level vocabulary is not re-skinned.** "Your turn", "End turn" and the
  turn timer belong to Async Games rather than to this game, so the "scavenging
  run" of §12.1 stays flavour: the board still rolls dice and takes turns.

### 12.1 Vocabulary

| Base theme | Wasteland theme | Notes |
| --- | --- | --- |
| **Coin** | **Bottlecap** ("cap") | Denominations of 1, 5 and 10 caps, plus the Docks' 20-cap rolls. Still public information. |
| **The bank** | **The Cap Hoard** | The communal stash payouts come out of and purchases go back into. Its total is unchanged (262 caps, or 502 with the Docks). |
| **Mayor** | **Overseer** | "The first Overseer to finish all four Reclamation Projects wins." |
| **City / tableau** | **Settlement** | |
| **Establishment** | **Holding** | |
| **Landmark** | **Reclamation Project** | |
| **The market / supply** | **The Caravan Market** | The travelling traders who will sell anyone anything. |
| **Dice roll** | **Scavenging run** | The number rolled is "what the run turned up". Flavour only — the app's own "turn" and "roll" wording is shared with every other game and stays as it is. |
| **Blue (Primary Industry)** | **Scavenging** | Pays on anyone's run. |
| **Green (Secondary Industry)** | **Workshops** | Pays on your own run only. |
| **Red (Restaurants)** | **Watering Holes** | Charges the scavenger who came back with the number. |
| **Purple (Major Establishments)** | **Power Players** | One each; big swings on your own run. |

### 12.2 Holding types (icon groups)

Several cards pay per type, so the renamed types carry through into their
effect text ("get 3 caps for each **Livestock** holding that you own").

| Base type | Wasteland type | Members |
| --- | --- | --- |
| `farm` (grain icon) | **Crop** | Hydroponic Plot, Mutfruit Grove, Glowcap Bed |
| `pasture` (cow icon) | **Livestock** | Brahmin Pen |
| `production` (gear icon) | **Salvage** | Blasted Timber Yard, Uranium Mine |
| `store` (bread icon) | **Stall** | Snackcake Bakery, Salvage Trading Post, Chem Stand |
| `dining` (cup icon) | **Canteen** | Roadside Diner, Scavvers' Mess Hall, Crab Cake Stand |
| `factory` | **Works** | Jerky Smokehouse, Scrap Workshop, Ration Depot |
| `market` | **Bazaar** | Caravan Bazaar |
| `boat` | **Raft** | Fishing Raft, Deep-Water Trawler |
| `landmark` | **Project** | The five Reclamation Projects and the three Power Players |

### 12.3 Base game

Each Overseer still starts with the two cheapest holdings — here a **Hydroponic
Plot** and a **Snackcake Bakery** — and **3 caps**.

| Base name | Wasteland name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Wheat Field** | **Hydroponic Plot** | Blue | 1 | 1 | Get 1 cap from the hoard. |
| **Ranch** | **Brahmin Pen** | Blue | 2 | 1 | Get 1 cap from the hoard. |
| **Bakery** | **Snackcake Bakery** | Green | 2–3 | 1 | Get 1 cap from the hoard, on your run only. |
| **Cafe** | **Roadside Diner** | Red | 3 | 2 | Take 1 cap from the scavenger. |
| **Convenience Store** | **Salvage Trading Post** | Green | 4 | 2 | Get 3 caps from the hoard, on your run only. |
| **Forest** | **Blasted Timber Yard** | Blue | 5 | 3 | Get 1 cap from the hoard. |
| **Stadium** | **Cage Fight Arena** | Purple | 6 | 6 | Take 2 caps from every other Overseer. |
| **TV Station** | **Pirate Radio Station** | Purple | 6 | 7 | Take 5 caps from any one Overseer. |
| **Business Center** | **Barter Exchange** | Purple | 6 | 8 | Trade one non-Project holding with another Overseer. |
| **Cheese Factory** | **Jerky Smokehouse** | Green | 7 | 5 | Get 3 caps per **Livestock** holding you own. |
| **Furniture Factory** | **Scrap Workshop** | Green | 8 | 3 | Get 3 caps per **Salvage** holding you own. |
| **Mine** | **Uranium Mine** | Blue | 9 | 6 | Get 5 caps from the hoard. |
| **Family Restaurant** | **Scavvers' Mess Hall** | Red | 9–10 | 3 | Take 2 caps from the scavenger. |
| **Apple Orchard** | **Mutfruit Grove** | Blue | 10 | 3 | Get 3 caps from the hoard. |
| **Fruit and Vegetable Market** | **Caravan Bazaar** | Green | 11–12 | 2 | Get 2 caps per **Crop** holding you own. |

### 12.4 Reclamation Projects (the win engine)

Still four to build, still in this order of cost, and finishing the fourth
still ends the game on the spot.

The cheapest and the dearest of them are the pre-war Vault your settlement grew
up around: the first thing an Overseer does is get its door open, and the last
is get its command terminal running again.

| Base name | Wasteland name | Cost | Unchanged effect |
| --- | --- | --- | --- |
| **Train Station** | **Vault Door** | 4 | Roll 1 or 2 dice on each run, your choice. |
| **Shopping Mall** | **Ruined Superstore** | 10 | Each of your **Stall** and **Canteen** holdings earns +1 cap when it activates. |
| **Amusement Park** | **Abandoned Funfair** | 16 | Matching dice grant another run after this one. |
| **Radio Tower** | **Overseer's Terminal** | 22 | Once per run, re-task it from the terminal (re-roll your dice). |

The Terminal is not a second transmitter on purpose: the theme already has a
**Pirate Radio Station** (§12.3), and a terminal is a thing you *operate*,
which is what a re-roll is.

### 12.5 The Docks expansion → "The Wharf"

The coastal district becomes a flooded riverfront: sunken pre-war barges,
irradiated fish that are worth good caps to anyone hungry enough, and the pier
that makes reaching them possible.

| Base name | Wasteland name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Harbour** (5th landmark) | **Salvage Pier** | — | — | 2 | A run of 10 or more may be nudged +2. Optional; never needed to win. |
| **Sushi Bar** | **Crab Cake Stand** | Red | 1 | 2 | With the Pier, take 3 caps from the scavenger. |
| **Flower Orchard** | **Glowcap Bed** | Blue | 4 | 2 | Get 1 cap from the hoard. Feeds the Chem Stand. |
| **Flower Shop** | **Chem Stand** | Green | 6 | 1 | Get 1 cap per **Glowcap Bed** you own, on your run only. |
| **Mackerel Boat** | **Fishing Raft** | Blue | 8 | 2 | With the Pier, get 3 caps from the hoard. |
| **Food Warehouse** | **Ration Depot** | Green | 12–13 | 2 | Get 2 caps per **Canteen** holding you own, on your run only. |
| **Tuna Boat** | **Deep-Water Trawler** | Blue | 12–14 | 5 | With the Pier, a shared 2d6 haul pays every Trawler owner that many caps. |

### 12.6 Billionaires Row expansion → "Kingpins' Row"

The premium tier becomes the wasteland's opportunists: the people who got rich
off other survivors rather than off the land.

| Base name | Wasteland name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Loan Office** | **Cap Lender's Booth** | Green | 5–6 | (gain 5 now) | 5 caps up front on purchase, then 2 caps every time it activates. |
| **Publisher** | **Broadsheet Press** | Purple | 7 | 5 | Take 1 cap from every Overseer per **Stall + Canteen** icon they own. |
| **Renovation Company** | **Wrecking Crew** | Purple | 8 | 4 | Shut down all holdings of one chosen type across every opponent; collect a fee per holding shut. |
| **Tax Office** | **Tribute Collectors** | Purple | 8–9 | 4 | Take half (rounded down) the caps of any Overseer holding 10 or more. |
| **Corporate HQ** | **Settlers' Council** | Green | 11–12 | 4 | Get 8 caps from the hoard if you are not leading on Projects. |
| **Exhibition Hall** | **Pre-War Relic Hall** | Purple | 11–12 | 3 | Shut down one opponent holding worth 6+ and collect its value; its owner reopens it on their run. |

A "closed" holding in this theme is **boarded up** — raiders have been through
it — and its owner **reopens** it by working that type again on a later run.

---

## 13. Appendix: Alternative Theme — "Outer Rim"

A second worked re-skin, this time to a galactic civil war: the board is one
contested frontier world, far enough out that the Empire only garrisons it and
the Rebellion only hides on it, and near enough to a trade lane that everybody
there is trying to make a living regardless. Money is **credits**.

Like §12 this is a naming reference only. **No cost, activation number,
colour, icon group, per-player limit, bank total or win condition changes** —
a Spice Mine is a Mine with a different picture on it.

**This one is on paper only.** Nothing in the app offers it yet; §13.7 is what
building it would take.

### 13.1 The three-column tables

Every card table below gives **three candidate names** — an **Empire** one, a
**Rebellion** one and a **Neutral** one — because the same building means
three different things depending on who is running it. A mess hall is a
garrison canteen, a safehouse kitchen or a spaceport diner, and all three are
the Family Restaurant.

A shipped theme still needs exactly **one** name per card (a card has one
title), so each row marks a suggested pick with a **★**. The picks are
deliberately mixed rather than all-Neutral: the everyday economy — farms,
mines, diners, markets — runs Neutral, because the frontier does not care who
is winning, while the cards that reach into another player's pocket lean
Imperial or Rebel, because those are the ones where the war shows up at your
door. An **Imperial Inspection** shutting your operations down and a **Rebel
Cell Command** paying the player who is behind both read as what they
mechanically are.

The alternative is to ship **three themes off one card list** — "Outer Rim
(Imperial)", "(Rebellion)", "(Neutral)" — which the theme system supports at no
extra cost, since a theme is just a name table. It is not the recommendation:
a theme is table-wide, so it would make the host pick a side for everyone, and
none of the three columns alone fills a whole board convincingly. Take it as a
free option, not a plan.

**Name the effect, not the building.** Three cards in this game are all
"somewhere you trade" if you go by the picture — the Business Center, the
Shopping Mall and the Fruit and Vegetable Market — and the base theme only
keeps them apart because the art is an office tower, a mall and a produce
stall. A theme has no art to lean on while its faces are placeholders, so a
re-skin that names all three after commerce collapses them into one card the
player cannot tell apart on the board or in the turn log. Name each after
**what it does** instead, and they separate on their own:

| Card | What it actually does | So it is called |
| --- | --- | --- |
| **Business Center** | Forces a one-for-one swap of a built card. Nobody is buying anything. | **Claims Office** — the frontier registry where a title changes hands, willing owner or not. |
| **Shopping Mall** | Pays +1 to every Supply and Cantina you already own. It is footfall, not a shop. | **Way Station** — the lane stop whose passing traffic fills your stalls and diners. |
| **Fruit and Vegetable Market** | Pays per Cropland you own. It is your farms' outlet. | **Growers' Co-op** — the thing the farms sell into. |

The same test caught two quieter collisions: three ★ picks originally opened
with "Spaceport", and the theme's supply pile is already **the Trade Ring**,
so a "Trade Concourse" landmark beside it read as the same place.

**On names.** The columns lean on the recognisable vocabulary of the setting;
anything actually shipped in the app should prefer the descriptive coinages
(Moisture Farm, Spice Mine, Sensor Array) over trademarked proper nouns, which
is why the ★ picks are almost all in that register.

### 13.2 Vocabulary

| Base theme | Outer Rim theme | Notes |
| --- | --- | --- |
| **Coin** | **Credit** | Denominations of 1, 5 and 10, plus the Docks' 20s. Still public information. |
| **The bank** | **The Exchange** | The Trade Guild's credit pool that payouts come out of and purchases go back into. Total unchanged (262, or 502 with the Docks). |
| **Mayor** | **Governor** | "The first Governor to finish all four Installations wins." |
| **City / tableau** | **Outpost** | |
| **Establishment** | **Operation** | |
| **Landmark** | **Installation** | |
| **The market / supply** | **The Trade Ring** | The lane traffic that will sell anyone anything, both sides included. |
| **Dice roll** | **Supply run** | The number rolled is "what the run brought in". Flavour only — as in §12, the app's own "turn" and "roll" wording is shared with every other game and stays as it is. |
| **Blue (Primary Industry)** | **Frontier** | Pays on anyone's run. |
| **Green (Secondary Industry)** | **Industry** | Pays on your own run only. |
| **Red (Restaurants)** | **Cantinas** | Charges the pilot who came back with the number. |
| **Purple (Major Establishments)** | **Power Brokers** | One each; big swings on your own run. |

### 13.3 Operation types (icon groups)

| Base type | Outer Rim type | Members |
| --- | --- | --- |
| `farm` (grain icon) | **Cropland** | Moisture Farm, Orchard Terraces, Glowbloom Field |
| `pasture` (cow icon) | **Herd** | Grazer Pens |
| `production` (gear icon) | **Extraction** | Timber Camp, Spice Mine |
| `store` (bread icon) | **Supply** | Portion-Bread Stall, Outfitter's Post, Bacta Apothecary |
| `dining` (cup icon) | **Cantina** | Safehouse Cantina, Spaceport Diner, Void-Crab Grill |
| `factory` | **Works** | Creamery Works, Parts Foundry, Provisions Warehouse |
| `market` | **Co-op** | Growers' Co-op |
| `boat` | **Freighter** | Ore Hauler, Bulk Freighter |
| `landmark` | **Installation** | The five Installations and the three Power Brokers |

### 13.4 Base game

Each Governor still starts with the two cheapest operations — here a
**Moisture Farm** and a **Portion-Bread Stall**, which is about as frontier
homestead as a starting hand gets — and **3 credits**.

**Candidate names** (★ = suggested pick):

| Base name | Empire | Rebellion | Neutral |
| --- | --- | --- | --- |
| **Wheat Field** | Agri-Corps Plot | Ration Plot | ★ **Moisture Farm** |
| **Ranch** | Garrison Herd Pens | Hidden Pasture | ★ **Grazer Pens** |
| **Bakery** | Commissary Kitchen | Field Mess | ★ **Portion-Bread Stall** |
| **Cafe** | Officers' Club | ★ **Safehouse Cantina** | Dust-Road Cantina |
| **Convenience Store** | Garrison Supply Depot | Smuggled Goods Drop | ★ **Outfitter's Post** |
| **Forest** | Timber Levy Camp | Sheltered Woods | ★ **Timber Camp** |
| **Stadium** | Tribute Rally | Recruitment Rally | ★ **Grav-Ball Arena** |
| **TV Station** | Propaganda Broadcast | Pirate Holonet Feed | ★ **Holovid Studio** |
| **Business Center** | Requisition Order | Prisoner Exchange | ★ **Claims Office** |
| **Cheese Factory** | Rations Plant | Field Creamery | ★ **Creamery Works** |
| **Furniture Factory** | Fleet Parts Foundry | Scrapyard Workshop | ★ **Parts Foundry** |
| **Mine** | Penal Ore Mine | Unlicensed Shaft | ★ **Spice Mine** |
| **Family Restaurant** | Garrison Mess Hall | Rebel Safehouse Kitchen | ★ **Spaceport Diner** |
| **Apple Orchard** | Fruit Levy Grove | Sheltered Grove | ★ **Orchard Terraces** |
| **Fruit and Vegetable Market** | Harvest Levy | Black-Market Run | ★ **Growers' Co-op** |

**The picks, with the numbers they do not change:**

| Base name | Outer Rim name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Wheat Field** | **Moisture Farm** | Blue | 1 | 1 | Get 1 credit from the Exchange. |
| **Ranch** | **Grazer Pens** | Blue | 2 | 1 | Get 1 credit from the Exchange. |
| **Bakery** | **Portion-Bread Stall** | Green | 2–3 | 1 | Get 1 credit from the Exchange, on your run only. |
| **Cafe** | **Safehouse Cantina** | Red | 3 | 2 | Take 1 credit from the pilot. |
| **Convenience Store** | **Outfitter's Post** | Green | 4 | 2 | Get 3 credits from the Exchange, on your run only. |
| **Forest** | **Timber Camp** | Blue | 5 | 3 | Get 1 credit from the Exchange. |
| **Stadium** | **Grav-Ball Arena** | Purple | 6 | 6 | Take 2 credits from every other Governor. |
| **TV Station** | **Holovid Studio** | Purple | 6 | 7 | Take 5 credits from any one Governor. |
| **Business Center** | **Claims Office** | Purple | 6 | 8 | Trade one non-Installation operation with another Governor. |
| **Cheese Factory** | **Creamery Works** | Green | 7 | 5 | Get 3 credits per **Herd** operation you own. |
| **Furniture Factory** | **Parts Foundry** | Green | 8 | 3 | Get 3 credits per **Extraction** operation you own. |
| **Mine** | **Spice Mine** | Blue | 9 | 6 | Get 5 credits from the Exchange. |
| **Family Restaurant** | **Spaceport Diner** | Red | 9–10 | 3 | Take 2 credits from the pilot. |
| **Apple Orchard** | **Orchard Terraces** | Blue | 10 | 3 | Get 3 credits from the Exchange. |
| **Fruit and Vegetable Market** | **Growers' Co-op** | Green | 11–12 | 2 | Get 2 credits per **Cropland** operation you own. |

### 13.5 Installations (the win engine)

Still four to build, still in this order of cost, and finishing the fourth
still ends the game on the spot.

| Base name | Empire | Rebellion | Neutral |
| --- | --- | --- | --- |
| **Train Station** | Imperial Landing Platform | Hidden Airstrip | ★ **Docking Bay** |
| **Shopping Mall** | Garrison Commissary | Smugglers' Layover | ★ **Way Station** |
| **Amusement Park** | Parade Grounds | Victory Bonfire | ★ **Speeder Circuit** |
| **Radio Tower** | Imperial Comm Tower | Encrypted Relay | ★ **Sensor Array** |
| **Harbour** (Docks, 5th) | Orbital Garrison Ring | Asteroid Rendezvous | ★ **Orbital Dock** |

| Base name | Outer Rim name | Cost | Unchanged effect |
| --- | --- | --- | --- |
| **Train Station** | **Docking Bay** | 4 | Roll 1 or 2 dice on each run, your choice. |
| **Shopping Mall** | **Way Station** | 10 | Each of your **Supply** and **Cantina** operations earns +1 credit when it activates. |
| **Amusement Park** | **Speeder Circuit** | 16 | Matching dice grant another run after this one. |
| **Radio Tower** | **Sensor Array** | 22 | Once per run, sweep the lane again (re-roll your dice). |

The first and last Installations are two halves of the same derelict
spaceport the outpost grew up beside: a Governor's first job is clearing the
**Docking Bay** so anything can land, and their last is getting the old
**Sensor Array** turning again so they can see what is coming.

As in §12.4, the top Installation is deliberately not a second transmitter —
the theme already has a **Holovid Studio** (§13.4), and a sensor sweep is a
thing you *re-run*, which is exactly what the re-roll is.

### 13.6 The expansions

**The Docks → "The Skylanes."** The coastal district goes up rather than out:
the water is orbit, the boats are freighters, and the pier is the ring that
lets anything dock at all. The Orbital Dock gates the Freighter cards exactly
as the Harbour gates the boats.

| Base name | Empire | Rebellion | Neutral |
| --- | --- | --- | --- |
| **Sushi Bar** | Orbital Officers' Mess | Smugglers' Galley | ★ **Void-Crab Grill** |
| **Flower Orchard** | Bacta Herb Plot | Medicinal Bloom Plot | ★ **Glowbloom Field** |
| **Flower Shop** | Imperial Apothecary | Field Medic's Bench | ★ **Bacta Apothecary** |
| **Mackerel Boat** | Customs Skiff | Blockade Runner | ★ **Ore Hauler** |
| **Food Warehouse** | Fleet Ration Depot | Hidden Supply Cache | ★ **Provisions Warehouse** |
| **Tuna Boat** | Fleet Supply Contract | Convoy Raid | ★ **Bulk Freighter** |

| Base name | Outer Rim name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Harbour** (5th landmark) | **Orbital Dock** | — | — | 2 | A run of 10 or more may be nudged +2. Optional; never needed to win. |
| **Sushi Bar** | **Void-Crab Grill** | Red | 1 | 2 | With the Dock, take 3 credits from the pilot. |
| **Flower Orchard** | **Glowbloom Field** | Blue | 4 | 2 | Get 1 credit from the Exchange. Feeds the Apothecary. |
| **Flower Shop** | **Bacta Apothecary** | Green | 6 | 1 | Get 1 credit per **Glowbloom Field** you own, on your run only. |
| **Mackerel Boat** | **Ore Hauler** | Blue | 8 | 2 | With the Dock, get 3 credits from the Exchange. |
| **Food Warehouse** | **Provisions Warehouse** | Green | 12–13 | 2 | Get 2 credits per **Cantina** operation you own, on your run only. |
| **Tuna Boat** | **Bulk Freighter** | Blue | 12–14 | 5 | With the Dock, a shared 2d6 haul pays every Freighter owner that many credits. |

**Billionaires Row → "Cartel Row."** The premium tier is where the war and the
money finally admit they are the same thing: the people getting rich off the
occupation, the resistance to it, or both at once.

| Base name | Empire | Rebellion | Neutral |
| --- | --- | --- | --- |
| **Loan Office** | Imperial Credit Line | Sympathiser's Loan | ★ **Cartel Loan Broker** |
| **Publisher** | Ministry of Information | Underground Newsfeed | ★ **Holonet Newsfeed** |
| **Renovation Company** | ★ **Imperial Inspection** | Sabotage Cell | Demolition Crew |
| **Tax Office** | ★ **Imperial Tithe Office** | War-Effort Levy | Protection Racket |
| **Corporate HQ** | Sector Governor's Grant | ★ **Rebel Cell Command** | Traders' Guild Hall |
| **Exhibition Hall** | Trophy Hall | Salvaged Wreck Display | ★ **Antiquities Gallery** |

| Base name | Outer Rim name | Colour | Activates | Cost | Unchanged effect |
| --- | --- | --- | --- | --- | --- |
| **Loan Office** | **Cartel Loan Broker** | Green | 5–6 | (gain 5 now) | 5 credits up front on purchase, then 2 credits every time it activates. |
| **Publisher** | **Holonet Newsfeed** | Purple | 7 | 5 | Take 1 credit from every Governor per **Supply + Cantina** icon they own. |
| **Renovation Company** | **Imperial Inspection** | Purple | 8 | 4 | Impound all operations of one chosen type across every opponent; collect a fee per operation impounded. |
| **Tax Office** | **Imperial Tithe Office** | Purple | 8–9 | 4 | Take half (rounded down) the credits of any Governor holding 10 or more. |
| **Corporate HQ** | **Rebel Cell Command** | Green | 11–12 | 4 | Get 8 credits from the Exchange if you are not leading on Installations. |
| **Exhibition Hall** | **Antiquities Gallery** | Purple | 11–12 | 3 | Impound one opponent operation worth 6+ and collect its value; its owner clears the seal on their run. |

A "closed" operation in this theme is **impounded** — there is an Imperial
seal across the door — and its owner **clears the seal** by working that type
again on a later run.

### 13.7 What it would take to ship

Nothing here is built. Per [`docs/game-themes.md`](../game-themes.md), the work
is the same shape as the wasteland's was:

1. A third entry in `src/games/DiceCities/themes.ts` — the `words` block from
   §13.2 and the ★ names and rules text from §13.4–13.6.
2. One line in `GAME_THEMES` in `src/utils/ui/gameThemes.ts` (id, name,
   description, glyph, and the "art is placeholder" note while it is).
3. `public/art/dicecities/outerrim/`, starting as a copy of the default
   theme's folder so every card is drawable from day one, then redrawn one
   file at a time under the names it already has.
4. Nothing else: `themes.test.ts` already walks every card of every theme and
   fails the build if a name table changed a cost, a colour or an activation
   number, and `themeIdFor` already resolves an unknown id to the default, so
   adding a theme cannot break a game in progress.

Two things stay as they are, exactly as they do for the wasteland: app-level
vocabulary ("Your turn", "End turn", the turn timer) belongs to Async Games
rather than to this game, so "supply run" is flavour only; and the share card
(`public/icons/og-game-dicecities.png`) is drawn from the game's `meta`, not
from a theme, so it does not change.

## 14 Theme Summary

| Base name | Outer Rim | Wasteland |
| --- | --- | --- |
| **Wheat Field** | **Moisture Farm** | Hydroponic Plot
| **Ranch** | **Grazer Pens** | Brahmin Pen
| **Bakery** | **Portion-Bread Stall** | Snackcake Bakery
| **Cafe** | **Safehouse Cantina** | Roadside Diner
| **Convenience Store** | **Outfitter's Post** | Salvage Trade Post
| **Forest** | **Timber Camp** | Blasted Timber Yard
| **Stadium** | **Grav-Ball Arena** | Cage Fight Arena
| **TV Station** | **Holovid Studio** | Pirate Radio Station
| **Business Center** | **Claims Office** | Barter Exchange
| **Cheese Factory** | **Creamery Works** |
| **Furniture Factory** | **Parts Foundry** |
| **Mine** | **Spice Mine** |
| **Family Restaurant** | **Spaceport Diner** |
| **Apple Orchard** | **Orchard Terraces** |
| **Fruit and Vegetable Market** | **Growers' Co-op** |
| **Train Station** | **Docking Bay** | Vault Door
| **Shopping Mall** | **Way Station** |
| **Amusement Park** | **Speeder Circuit** |
| **Radio Tower** | **Sensor Array** | Overseer Terminal
| **Harbour** (5th landmark) | **Orbital Dock** |
| **Sushi Bar** | **Void-Crab Grill** |
| **Flower Orchard** | **Glowbloom Field** |
| **Flower Shop** | **Bacta Apothecary** |
| **Mackerel Boat** | **Ore Hauler** |
| **Food Warehouse** | **Provisions Warehouse** |
| **Tuna Boat** | **Bulk Freighter** |
| **Loan Office** | **Cartel Loan Broker** |
| **Publisher** | **Holonet Newsfeed** |
| **Renovation Company** | **Imperial Inspection** |
| **Tax Office** | **Imperial Tithe Office** |
| **Corporate HQ** | **Rebel Cell Command** |
| **Exhibition Hall** | **Antiquities Gallery** |

