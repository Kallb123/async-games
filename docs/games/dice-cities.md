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

The rules carry no dependency on that dressing. For a worked example of
re-skinning the whole game — every base, Docks and Billionaires Row card — to a
post-nuclear wasteland paid for in bottlecaps, see
[§12 Alternative Theme](#12-appendix-alternative-theme--rust--bottlecaps).

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

## 11. Public Information: Seeing the Other Cities (design proposal)

Every card in Dice Cities sits face-up on the table. §10 already takes that
as read — "all state (money, tableau, landmarks) is public, and the only
hidden randomness is the dice roll" — and the rules lean on it hard. A Red
card is paid out of the *roller's* pocket, so what an opponent has built is
literally the price of your own turn: a player who cannot see the other
cities cannot tell whether rolling a 3 costs them one coin or four, cannot
tell whether the Cheese Factory is worth 6 coins a turn to them and nothing
at all to their neighbour, and cannot see the Stadium being lined up
against them.

The app does not show them.

**This section is a proposal. None of it is implemented.** It sets out why
that gap is a rendering question rather than a rules or privacy one, what a
fix has to satisfy, and the shapes a fix could take.

### 11.1 Where it stands today

**Nothing is hidden on the wire.** `CreateDataResponse` in
`DiceCitiesModels.ts` takes a `_viewerId` and ignores it, and
`gameStateToModel` walks the entire `playerStates` map, sending every
player's cards, coins, landmark flags and dice choice to everyone at the
table. There is nothing to unredact and no API contract to change — the
client is already holding every city it would need to draw.

What the board screen does with that payload is the gap:

* **`page.tsx` draws exactly one city.** `boardPlayer` is the viewer's own
  seat, falling back to whoever's turn it is, falling back to the first
  seat; it goes to `DiceCitiesBoard` and the other seats go to the action
  sheet and nowhere else.
* **The scoreboard stops one step short.** `GameScoreboard` already gives
  every player a pill with their colour, name, landmark count and coins —
  everything except what they own.
* **Opponents' establishments already render in full, in one place.** The
  Business Center's "choose an opponent's establishment to take" picker in
  `DiceCitiesActions.tsx` lays out every opponent's cards, grouped by
  player. The app therefore already accepts that these cards are the
  viewer's to look at — just only while an 8-coin purple card is resolving.
* **The history log leaks it all anyway.** Every purchase writes
  "*Dave bought a Cafe*". A determined player can reconstruct all four
  cities by scrolling back to turn one. The information is not secret; it
  is merely tedious to assemble.

One more fact shapes every option below: **`DiceCitiesBoard` is already the
right component.** It takes a `playerState` plus an `ownerLabel` and draws
whoever it is handed, captioning the tableau "Dave's city" when it isn't
yours. The work is routing a second player state into a component that
already copes, not drawing cities.

### 11.2 What any answer has to do

1. **Never leave any doubt whose city is on screen.** The build step always
   spends *your* coins into *your* city; a screen that can show someone
   else's tableau must say so loudly and offer an obvious way back.
2. **Keep `opponents` anchored to the viewer's seat.** Today `opponents` is
   derived from `boardPlayer` (`players.filter(p => p.userId !==
   boardPlayer.userId)`). Any option that lets `boardPlayer` become someone
   else must decouple the two, or the TV Station picker will offer to rob
   the viewer and skip the player they happen to be looking at.
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
   opening a game they are not in; `boardPlayer` already falls back and the
   turn sheet already hides itself.
7. **Reuse `DiceCitiesBoard` rather than growing a second way to draw a
   city.** A compact opponent-only tableau that drifts out of step with the
   real one is the duplication `AGENTS.md` treats as a defect.

### 11.3 The options

| # | Option | What the player gets | Pros | Cons | Verdict |
|---|---|---|---|---|---|
| **A** | **Tap a scoreboard pill** — the board swaps to that player's city; tap again (or a "back to your city" bar) to return | One city at a time, chosen from the strip already at the top of the screen | Cheapest by a wide margin: `ScoreEntry` already carries `onClick` and `highlighted`, `boardPlayer` already accepts any seat, `ownerLabel` already captions it. **No new component at all** — one `useState` and a banner. Discoverable, because the pills already name everyone. Page height unchanged. Outbreak already teaches the tap-a-pill gesture. | One city at a time; no side-by-side comparison. Must remember to tap back (mitigated by requirement 1's banner). A pill is a smallish tap target. Requirement 2 has to be honoured or the robbery pickers invert. | ✅ **Recommended** |
| **B** | **Stacked collapsible cities** — your board, then one collapsed panel per opponent below it | Every city on one page, opened and closed at will | Built entirely from parts we own: `Collapse`/`CollapsingSection` plus one `DiceCitiesBoard` per panel; `seatOrderFrom` gives the viewer-first order. Several cities can be open at once. Scrolls, screenshots and reads to a screen reader as one document. `OutbreakHands` is the same shape, so the pattern is precedented. | A four-player late game is four full tableaus plus four landmark tracks in a phone column — a long page, and comparing two open cities still means scrolling between them. Animating a body that tall is the least convincing use of `Collapse`. Repeating the landmark track four times is a lot of chrome for a 4/5 counter the scoreboard already shows. | ⚠️ Good second choice |
| **C** | **Swipeable gallery** — one full-width city, swipe or arrow between seats, yours first | A deck of cities to flip through | Constant page height, full column width per city, cards stay big. Comparison is genuinely good: two cities land in the *same* screen position, so swiping back and forth diffs them in a way scrolling never does. Reads like the table it models. | **The repo has no carousel, no swipe handler and no `scroll-snap` anywhere** — this is a new shared primitive to build, document and maintain (a caveman finding unless it is written for `components/ui/` and other games actually adopt it). Horizontal gestures fight vertical page scroll and the turn-nav controls. Needs dots/arrows for discoverability and keyboard/AT equivalents for the gesture. Hides the fact that opponents exist behind an interaction. | ⚠️ Only as a shared primitive |
| **D** | **Roll-number summary strip** — per opponent, a row of chips 1–14 marking what pays them, expanding to the full city | The answer to "what does my roll pay them?" in two lines | Smallest footprint of anything here; scales cleanly to five players; skips the landmark-track repetition; answers the question the Red cards actually pose. | It is a *second* way of drawing a city — requirement 7 — unless the chip row is factored out and reused in the real board. Loses the card art the game just invested in being tappable. Still needs a route through to the detail. | ➕ An addition to A/B/C, not an answer |
| **E** | **Status quo** — Business Center picker and the history log | Nothing | No work. | Contradicts §10 and the game guide, both of which tell the player these cards are public and pay out on everyone's roll. Leaves the Red economy unreadable and makes the log the only route to public information. | ❌ Leaves a real defect |

### 11.4 Recommendation

**Ship A, keep B in reserve, and treat C as a separate investment.**

A is recommended less for being cheap than for being *already built*: the
scoreboard is the per-player index, it is pinned at the top of every board
screen, it already knows how to be tapped and highlighted, and
`DiceCitiesBoard` already draws and captions any seat handed to it. The
whole feature is a piece of state and a way back:

```ts
// page.tsx — which city the board is pointed at; null = your own.
const [viewing, setViewing] = useState<string | null>(null);
const viewedPlayer = players.find(p => p.userId === viewing);
const boardPlayer = viewedPlayer ?? myState
    ?? players.find(p => p.userId === displayedCurrentTurn) ?? players[0];

// Requirement 2: opponents stay relative to *me*, never to the viewed seat.
const opponents = players.filter(p => p.userId !== (myState?.userId ?? boardPlayer?.userId));
```

with each `ScoreEntry` gaining `onClick: () => setViewing(v => v === userId ? null : userId)`
and `highlighted: viewing === userId`, so the pill you tapped stays lit as
the "you are here" marker while the board is somebody else's. `ownerLabel`
already reads "Dave's city"; a return affordance above the board — "👀
Viewing Dave's city · Back to yours" — covers requirement 1 and gives a
tap target bigger than the pill.

Two details to get right when it is built:

* **Clear or re-resolve `viewing` when the viewed seat disappears** — the
  fallback chain above already copes with a missing seat, but a stale id
  should not survive a jump between reviewed turns.
* **Leave the turn sheet alone.** It is the viewer's own row, wrapped in
  `ReadOnlyPanel` off their turn, and must stay that way while the board
  points elsewhere. Browsing a city is never a game action.

B is the better answer to a different question — "show me the whole table
at once" — and is the natural upgrade if playtesting shows people want two
cities side by side rather than one at a time. It costs no new primitives
either, so switching later is not wasted work: both options render the same
`DiceCitiesBoard`, so A's per-seat routing is B's panel body.

C should only be built if a swipeable gallery is wanted across the app —
Outbreak's hands, Settlements' player boards and this screen would all use
it — in which case it belongs in `src/components/ui/` as a shared
component, not as a Dice Cities carousel. Built for one screen it is the
most expensive option here and the only one that adds a maintenance
surface, and it buys a comparison affordance that A largely matches for
free (tap two pills in turn and the cities land in the same place).

D is worth revisiting after A ships, as a strip inside each city's header
rather than instead of the city — but only by extracting the chip row so
the viewer's own board shows the same thing about them.

### 11.5 When it ships

* Shows up in the guide (`guide.ts`): the "Watch the market" section
  already teaches tap-to-read, and the Goal/Your turn sections tell players
  their cards pay out on everyone's roll — one clause on how to go and look
  at those cities belongs beside them.
* Adds a single **What's new** enhancement line (`whatsNew.ts`) in the same
  PR, per `AGENTS.md` — one line for the branch, in the player's language.
* Wants a `caveman` pass (it is a UI/reuse change, and options C and D are
  where a second way of drawing a city would creep in) and a `rulebook`
  pass (guide copy and the release note). No `croupier` pass is required
  for its own sake: this makes public state visible, and §11.1 shows the
  server was already sending it.

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
| **Dice roll** | **Scavenging run** | The number rolled is "what the run turned up". |
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

| Base name | Wasteland name | Cost | Unchanged effect |
| --- | --- | --- | --- |
| **Train Station** | **Metro Junction** | 4 | Send out 1 or 2 scavengers (roll 1 or 2 dice), your choice each run. |
| **Shopping Mall** | **Ruined Superstore** | 10 | Each of your **Stall** and **Canteen** holdings earns +1 cap when it activates. |
| **Amusement Park** | **Abandoned Funfair** | 16 | Matching dice grant another run after this one. |
| **Radio Tower** | **Signal Relay Mast** | 22 | Once per run, re-tune the signal (re-roll your dice). |

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
