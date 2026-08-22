# Outbreak — Game Design Document

**Genre:** Cooperative board game / crisis management
**Players:** 2–4 (co-op, no traitor)
**Play time:** 45–60 minutes
**Age:** 8+
**Complexity:** Light-medium (approx. 2.4 / 5)

---

## 1. High Concept

Four disease specialists are dispatched around a world map as four virulent diseases spread simultaneously. The team must synthesise a cure for every disease before the world destabilises. Players do not compete — they win together or lose together, and the game itself is the adversary, driven by a stacked deck that grows steadily more hostile as it is consumed.

**One-line pitch:** *A race against four exponential curves, where every turn you must choose between putting out today's fire and building tomorrow's cure.*

---

## 2. Design Pillars

| Pillar | Description | How it manifests |
|---|---|---|
| **The board fights back** | The opposition is a deterministic system, not a rival player. Its escalation is legible and therefore plannable. | Infection deck, epidemic cards, infection rate track |
| **Shared table, shared brain** | All information is open. The game is a conversation. | Open hands (by convention), no hidden agendas, discussion encouraged |
| **Triage over optimisation** | There are never enough actions. Success comes from choosing what to let burn. | 4 actions/turn against a growing threat surface |
| **Asymmetric competence** | Each player is uniquely good at something, so each player is uniquely needed. | 7 role cards with rule-breaking abilities |
| **Escalating dread** | Tension rises monotonically. The last third of the game should feel like drowning. | Intensify step re-seeds already-infected cities |

---

## 3. Player Experience Goals

The intended emotional arc across a single session:

1. **Opening (turns 1–3): Deceptive calm.** The board looks manageable. Players make plans.
2. **First epidemic: The floor tilts.** A new hotspot appears in an unattended region, and previously-drawn infection cards return to the top of the deck.
3. **Midgame: Split attention.** Two crises in different colours, one cure nearly assembled. Players begin arguing productively.
4. **Late game: Controlled panic.** Outbreak marker climbing, cube supply thinning, the player deck visibly short.
5. **Resolution: Relief or collapse.** Wins should feel narrow. A comfortable win indicates the difficulty was set too low.

**Target win rate:** roughly 30–45% for competent groups at Standard difficulty. Losses should be attributable to identifiable decisions, not to feeling cheated.

---

## 4. Objectives

### 4.1 Victory Condition

Players win **immediately** when cures have been discovered for all four diseases. Cubes may remain on the board — curing, not eradicating, is the win condition. This is deliberate: requiring eradication would extend the endgame past its dramatic peak.

### 4.2 Defeat Conditions

The team loses immediately if **any** of the following occurs:

| Condition | Trigger | Design purpose |
|---|---|---|
| **Outbreak cascade** | The outbreak marker reaches 8 | Punishes neglect of dense clusters |
| **Cube exhaustion** | A cube of a given colour must be placed and none remain in supply | Punishes ignoring one colour entirely |
| **Time out** | A player must draw from an empty player deck | The hard clock; caps game length |

Three distinct failure vectors mean there is no single dominant strategy. Optimising purely against one loss condition accelerates another.

---

## 5. Components Manifest

| Component | Qty | Notes |
|---|---|---|
| Game board | 1 | World map, 48 cities, 4 colour regions |
| Disease cubes | 96 | 24 each in blue, yellow, black, red |
| Research station markers | 6 | Hard cap; a 7th requires relocating an existing one |
| Cure markers | 4 | Two-sided: *cured* / *eradicated* |
| Outbreak marker | 1 | Tracks 0–8 |
| Infection rate marker | 1 | Tracks a 7-space escalation track |
| Player pawns | 7 | One per role, colour-matched to role card |
| Role cards | 7 | Defines each player's rule exception |
| Player cards | 53 | 48 city cards + 5 event cards (epidemic cards added at setup) |
| Epidemic cards | 6 | 4, 5, or 6 used depending on difficulty |
| Infection cards | 48 | One per city, matches the city card set |
| Reference cards | 4 | Action summary, one per player |

### 5.1 Board Anatomy

- **48 cities**, connected by lines representing travel routes. Adjacency is defined by these lines only, not by geographic proximity.
- **Four colour regions**, 12 cities each:
  - **Blue** — North America and Europe
  - **Yellow** — South America and Africa
  - **Black** — the Middle East, Central and South Asia
  - **Red** — East and Southeast Asia, and Oceania
- Region boundaries are porous: several cities bridge two colours (e.g. the Istanbul/Cairo corridor, the Sydney/Los Angeles trans-Pacific link). These bridges are the primary vector for cross-colour crises and are deliberately placed at chokepoints.
- **Population figures** are printed on each city card and are used only to determine the starting player.

---

## 6. Setup Procedure

1. **Place the board.** Set out all cubes sorted by colour, and place the four cure markers beside the board, vial side up.
2. **Outbreak marker** on the 0 space of the outbreak track.
3. **Infection rate marker** on the leftmost space of the infection rate track (rate = 2).
4. **First research station** in Atlanta.
5. **Assign roles.** Deal one role card at random to each player and give them the matching pawn. Place all pawns in Atlanta.
6. **Deal starting hands** from the shuffled deck of 53 player cards (48 city + 5 event), *before* epidemics are added:
   - 2 players → 4 cards each
   - 3 players → 3 cards each
   - 4 players → 2 cards each
7. **Build the player deck (critical step).**
   - Divide the remaining player cards into a number of equal-sized face-down piles equal to the number of epidemic cards being used.
   - Shuffle exactly one epidemic card into each pile.
   - Stack the piles into a single deck.
   - This guarantees epidemics are distributed roughly evenly through the game rather than clustering — a deliberate variance-control mechanism that keeps pacing predictable while keeping exact timing unknown.
8. **Initial infection.** Shuffle the infection deck, then:
   - Flip 3 cards → place **3 cubes** on each named city.
   - Flip 3 cards → place **2 cubes** on each named city.
   - Flip 3 cards → place **1 cube** on each named city.
   - All 9 cards go to the infection discard pile. The board therefore starts with 18 cubes across 9 cities.
9. **Determine first player:** the player holding the city card with the highest printed population.

---

## 7. Core Gameplay Loop

Play proceeds clockwise. A turn has three mandatory phases in fixed order:

```
┌─────────────────────────────────────────────┐
│  PHASE 1 — Do 4 Actions                     │
│    Any combination, repeats allowed,        │
│    may be forfeited                         │
├─────────────────────────────────────────────┤
│  PHASE 2 — Draw 2 Player Cards              │
│    Resolve epidemics immediately            │
│    Enforce 7-card hand limit                │
├─────────────────────────────────────────────┤
│  PHASE 3 — Infect Cities                    │
│    Draw cards = current infection rate      │
│    Place 1 cube per card                    │
└─────────────────────────────────────────────┘
```

The loop is the engine of the whole design: Phase 1 is the only phase the players control, and it is sandwiched between two phases that only ever make things worse. Every turn, the board deteriorates by at least two cubes. The action economy must outpace that decay.

---

## 8. Action Catalogue

Four actions per turn. Actions may be repeated and may be skipped.

### 8.1 Movement Actions

| Action | Cost | Effect |
|---|---|---|
| **Drive / Ferry** | 1 action | Move to a city connected by a line to your current city. |
| **Direct Flight** | 1 action + discard | Discard a city card and move to the city named on it. |
| **Charter Flight** | 1 action + discard | Discard the card matching the city you are *currently in*, then move to **any** city on the board. |
| **Shuttle Flight** | 1 action | Move from a city with a research station to any other city with a research station. |

**Design note:** the four movement modes form a deliberate cost curve — free but slow (Drive), cheap but destination-limited (Direct), expensive but unrestricted (Charter), free but infrastructure-dependent (Shuttle). Building the research station network converts card expenditure into permanent mobility, which is the game's core investment decision.

### 8.2 Other Actions

| Action | Requirement | Effect |
|---|---|---|
| **Build a Research Station** | Discard the card matching your current city | Place a research station in your current city. If all 6 are already on the board, relocate one from anywhere. |
| **Treat Disease** | Be in a city with cubes | Remove 1 cube of one colour. If that disease is **cured**, remove **all** cubes of that colour from the city instead. |
| **Share Knowledge** | Both players in the same city; card matches that city | Give the matching city card to, or take it from, another player in your city. Requires only the acting player's action. |
| **Discover a Cure** | Be at a research station; discard 5 cards of one colour | Flip that disease's cure marker to the cured side. |

### 8.3 Eradication

If a disease is **cured** and there are **zero cubes of that colour on the board**, flip its marker to the *eradicated* side. Eradicated diseases are permanently removed from the game — their infection cards are drawn and discarded with no effect.

Eradication is the game's only mechanism for permanently shrinking the threat surface. It is optional, often not worth the actions, but is the strategic keystone in long or high-difficulty games because it reduces the effective size of the infection deck.

---

## 9. Draw Phase

Draw **2 cards** from the player deck.

- **If the deck is empty when a card must be drawn → the team loses immediately.**
- **Hand limit is 7 cards.** If exceeding it, immediately discard or play event cards down to 7.
- **Event cards** may be played at any moment by their holder, including on another player's turn, but not in the middle of resolving another card.

### 9.1 Epidemic Cards

When an epidemic card is drawn, resolve it fully and immediately in three steps, then discard it. If both drawn cards are epidemics, resolve the first completely before the second.

**1 — INCREASE**
Advance the infection rate marker one space to the right. The track escalates: **2, 2, 2, 3, 3, 4, 4**. This permanently raises how many cities are infected each turn thereafter.

**2 — INFECT**
Draw the **bottom** card of the infection deck. Place **3 cubes** of that colour on the named city. If the city already has cubes of that colour, add only enough to reach 3, then trigger an **outbreak** there. Discard the card to the infection discard pile.

Drawing from the bottom guarantees the epidemic strikes a city that has *not* been infected recently — creating a fresh crisis in a region players have likely left uncovered.

**3 — INTENSIFY**
Shuffle the infection **discard pile** and place it **on top** of the infection deck.

This is the single most important mechanic in the game. Every city infected so far becomes an immediate re-infection candidate. Hotspots compound. It converts the infection deck from a random walk into a ratchet, and it is the reason the difficulty curve is exponential rather than linear.

---

## 10. Infect Phase

Draw infection cards equal to the current infection rate. For each, place **1 cube** of the matching colour on the named city, then discard the card.

Skip placement entirely for eradicated diseases.

### 10.1 Outbreaks

If a cube would be placed on a city that **already has 3 cubes of that colour**, an **outbreak** occurs instead:

1. Advance the outbreak marker one space. *(At 8, the team loses.)*
2. Place **1 cube of that colour** in **every adjacent city**.
3. If that placement would push an adjacent city to a 4th cube of the same colour, it too outbreaks — a **chain reaction**.
4. **A city may only outbreak once per infection card resolution.** Mark chained cities with the outbreak marker's spare tokens or a coin to track this.

Chain reactions are the game's dramatic climax mechanism. A single card can advance the outbreak track by 3–4 in a badly-tended cluster, which is why high-connectivity cities (Cairo, Istanbul, Hong Kong, Kolkata) are the true strategic objectives rather than the cities with the most cubes.

---

## 11. Roles & Abilities

Each role is a permanent, unique exception to a core rule. Roles are dealt randomly; the design intent is that any combination is viable, though some are markedly stronger.

| Role | Ability | Design function |
|---|---|---|
| **Medic** | Treat Disease removes **all** cubes of one colour from the city, not just one. Additionally, once a disease is cured, the Medic automatically removes all cubes of that colour from any city he enters or is in — **no action required**. | The cleanup engine. Converts curing into board control. Strongest single role. |
| **Scientist** | Needs only **4** cards of a colour to Discover a Cure, rather than 5. | Compresses the card economy; effectively grants the team an extra ~4 cards over a game. |
| **Researcher** | May give **any** city card from her hand to a player in her city — the card need not match the city. Another player may likewise take any card from her. | Removes the game's harshest logistical constraint. The team's card-routing hub. |
| **Dispatcher** | May move another player's pawn as if it were his own (spending his own actions and discarding from his own hand), or move any pawn to a city containing another pawn. | Action-economy multiplier. Lets the team amortise movement costs onto one player. |
| **Operations Expert** | May build a research station in his current city **without discarding a card**. Once per turn, may move from a research station to any city by discarding **any** city card. | Infrastructure specialist. Makes the research network cheap, which unlocks Shuttle Flight mobility for everyone. |
| **Quarantine Specialist** | Prevents all cube placement and all outbreaks in her current city **and every adjacent city**. | Pure prevention. Does not remove existing cubes — she is a shield, not a cure, and must be positioned proactively. |
| **Contingency Planner** | As an action, may retrieve any **discarded** event card and store it on his role card. It does not count against his hand limit. When played, it is removed from the game permanently. | Event recursion. Turns the discard pile into a resource. |

### 11.1 Role Balance Notes

- **Medic + Quarantine Specialist** is the strongest defensive pairing and can trivialise low difficulties.
- **Contingency Planner** is weak in the early game (nothing is discarded yet) and strong late — a deliberate power curve inversion.
- **Operations Expert** and **Dispatcher** are both mobility roles; drawing both leaves the team card-poor for curing.
- The design tolerates this variance because roles are dealt at setup and can be re-dealt; groups seeking consistency may draft rather than randomise.

---

## 12. Event Cards

Five one-shot cards shuffled into the player deck. Playable at any time by the holder, free of action cost, then discarded.

| Card | Effect | Best use |
|---|---|---|
| **Airlift** | Move any one pawn to any city (with that player's consent). | Emergency repositioning; getting a Medic to a cluster instantly. |
| **Government Grant** | Place a research station in any city, no discard required. | Establishing a second continental hub without spending a cure card. |
| **One Quiet Night** | Skip the next Infect Cities phase entirely. | Bought time when the outbreak marker is at 6–7. |
| **Forecast** | Draw the top 6 infection cards, rearrange them in any order, return them face-down. | Information plus control. Strongest immediately after an Intensify step. |
| **Resilient Population** | Remove any 1 card from the infection discard pile permanently from the game. | Played *immediately before* an Intensify step to delete a high-cube hotspot from the ratchet forever. |

**Design note:** every event card is a pressure-release valve, but each releases a *different* pressure — time (One Quiet Night), space (Airlift, Government Grant), information (Forecast), and long-term deck decay (Resilient Population). Only five exist in 53 cards, so drawing one is a genuine event.

---

## 13. Difficulty Tuning

Difficulty is set by the number of epidemic cards shuffled into the player deck at setup:

| Epidemics | Label | Effect |
|---|---|---|
| 4 | **Introductory** | Slower rate escalation, deeper piles, more time between Intensify steps |
| 5 | **Standard** | The intended baseline experience |
| 6 | **Heroic** | Infection rate reaches 4 quickly; Intensify steps come relentlessly |

This is an elegant single-dial system: one variable simultaneously adjusts the rate of escalation, the frequency of the Intensify ratchet, and the effective size of the pile players draw from between epidemics. Adding an epidemic card does not merely add one bad event — it compresses the entire timeline.

**Secondary difficulty levers available to designers/variant authors:**
- Player count (2-player is hardest for action economy despite larger hands; 4-player is hardest for card sharing)
- Restricting or removing event cards
- Forcing eradication rather than curing as the win condition
- Starting the outbreak marker above 0

---

## 14. Systems Analysis

### 14.1 The Two Economies

The game is a contest between two resource flows:

| | **Actions** | **Cards** |
|---|---|---|
| **Supply** | 4 per player per turn, fixed | 2 per player per turn, finite total |
| **Spent on** | Movement, treating, building | Cures, flights, stations |
| **Constrained by** | Time, positioning | Hand limit (7), colour matching |
| **Failure if depleted** | Outbreaks accumulate | Deck exhaustion loss |

Cards must be spent on *movement* to enable *treating*, but hoarded for *curing*. Every flight discarded is a fraction of a cure destroyed. This single tension generates almost all of the game's interesting decisions.

### 14.2 The Ratchet

The Intensify step is the mechanical heart of the design. Without it, the infection deck would be a memoryless random draw and the board state would trend toward equilibrium. With it:

- Infected cities have a permanently elevated chance of re-infection.
- The infection discard pile is a *visible, growing threat forecast* — players can and should read it.
- The deck's effective size shrinks over the game, concentrating danger.

This is what makes information (Forecast) and deletion (Resilient Population) so valuable, and why treating a city to zero is worth far more than treating it to one.

### 14.3 Tension Curve

```
Threat
  │                                                    ╱
  │                                            ╱──────╯
  │                                    ╱──────╯
  │                          ╱────────╯
  │              ╱──────────╯
  │  ╱──────────╯
  └──────────────────────────────────────────────────────► Time
     E1        E2        E3        E4        E5

  Step increases at each Epidemic (rate ↑, Intensify)
  Gradual climb between them (cube accumulation)
```

Each epidemic is a discrete step up; the slope between epidemics is cube accumulation outpacing treatment. Cures flatten the slope (Treat removes all cubes of a cured colour), which is why the curing tempo must accelerate late.

---

## 15. Known Failure Modes & Mitigations

| Failure mode | Symptom | Mitigation in design |
|---|---|---|
| **Quarterbacking** | One experienced player dictates all moves; others disengage. | Asymmetric roles give each player unique authority; open discussion is officially encouraged but final decisions rest with the active player. |
| **Analysis paralysis** | Turns extend indefinitely due to perfect information. | Hard action cap (4) and simple action set bound the search space. Optional turn timers are a common house rule. |
| **Runaway leader (inverted)** | A collapsing board becomes unrecoverable long before the loss triggers fire. | Losses are usually a few turns behind the point of no return — a known and accepted cost of the design. Some groups concede early. |
| **Difficulty cliff** | Introductory feels trivial, Heroic feels impossible. | Single-dial tuning is coarse by design; the middle setting is the tuned experience. |
| **Colour neglect** | Players ignore one region, then lose to cube exhaustion. | The cube-exhaustion loss condition exists specifically to punish this; 24 cubes per colour is a tight enough budget to make it real. |

---

## 16. Edge Cases & Adjudication

- **Two epidemics in one draw phase.** Resolve the first fully (Increase, Infect, Intensify) before beginning the second. The second Intensify will re-shuffle the first epidemic's infected city back onto the deck.
- **Outbreak during an epidemic's Infect step.** Fully resolvable, including chains. The outbreak marker can reach 8 mid-epidemic and end the game immediately.
- **Chain reaction re-entry.** A city that has already outbroken during the resolution of a single infection card does not outbreak again in that same chain, even if further cubes would be added to it.
- **Cube supply runs dry mid-outbreak.** The loss is immediate — do not finish resolving the chain.
- **Medic entering a city with cured cubes.** Removal is automatic and free, and occurs on entry — including movement caused by the Dispatcher or Airlift.
- **Quarantine Specialist and epidemics.** Her protection applies to epidemic cube placement as well as ordinary infection, and blocks the resulting outbreak entirely.
- **Curing with a hand of exactly the required cards** while the hand limit is exceeded: the hand limit check occurs at the end of the draw phase, so a player may draw to 8 and then must discard before their next turn's actions — they cannot hold 8 cards to cure later.
- **The 7th research station.** Building when six are already placed requires removing one from the board; this is part of the same single action.
- **Eradicated disease cards drawn.** Draw, note the city, place nothing, discard as normal. The card still enters the discard pile and will return via Intensify — harmlessly.

---

## 17. Accessibility & Table Presence

- **Colour dependency:** the four diseases are distinguished by colour only. Colour-blind accessibility requires either shaped cubes or a symbol overlay — a known weakness of the original component design and a required fix in any modern iteration.
- **Component footprint:** the board is large and cube-dense by the endgame; table space of roughly 90 × 60 cm is needed.
- **Reading load:** role and event card text is short; the game is playable by strong readers aged 8+.
- **Session integrity:** no hidden information and no player elimination, so late arrivals can be integrated and no one sits out.

---

## 18. Iteration Hooks

Directions the core system supports without structural change:

- **Persistent campaign layer** — carry board state, scarring, and character upgrades between sessions (this is the design space the *Legacy* line occupies).
- **Fifth disease / mutation** — a colour that behaves differently, breaking the symmetry of the four-region structure.
- **Bioterrorist / traitor role** — introduces hidden information and directly contradicts the "shared table" pillar; a substantial tonal shift.
- **Role expansion** — additional exception-based roles are the lowest-risk, highest-value expansion vector.
- **Alternate maps** — the system is map-agnostic provided the new map preserves 12 cities per region and comparable connectivity chokepoints.

---

## 19. Glossary

| Term | Definition |
|---|---|
| **Adjacent** | Connected by a printed line on the board. Not geographic proximity. |
| **Cured** | A disease whose cure marker has been flipped. Treat removes all cubes of that colour from a city in one action. |
| **Eradicated** | A cured disease with zero cubes on the board. Its infection cards have no effect. |
| **Epidemic** | A player card triggering Increase → Infect → Intensify. |
| **Intensify** | Shuffling the infection discard pile back on top of the infection deck. |
| **Outbreak** | Result of a 4th cube of one colour reaching a city; spreads one cube to all adjacent cities. |
| **Infection rate** | Number of infection cards drawn each turn: 2, 2, 2, 3, 3, 4, 4. |
| **Research station** | Enables Shuttle Flight and Discover a Cure. Maximum 6 on the board. |

---

## 20. Quick Reference

**Turn:** 4 Actions → Draw 2 Player Cards → Infect Cities

**Actions:** Drive/Ferry · Direct Flight · Charter Flight · Shuttle Flight · Build Station · Treat Disease · Share Knowledge · Discover Cure

**Cure cost:** 5 cards of one colour at a research station (Scientist: 4)

**Hand limit:** 7

**Epidemic:** Increase rate → Infect bottom card with 3 cubes → Intensify discard pile onto deck

**Outbreak trigger:** 4th cube of a colour in one city

**Win:** all 4 diseases cured
**Lose:** 8 outbreaks · any cube colour exhausted · player deck empty

---

## 21. Implementation Plan

Nothing in `src/games/Outbreak/` exists yet. This section is the bridge between
the design above and the codebase: what the engine already provides, what it
doesn't, the concessions async play forces, and the order to build it in.

Read [`docs/new-game.md`](../new-game.md) and
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 first — the checklist and the
command pattern are assumed here rather than repeated.

### 21.1 What the engine already gives us

| Need | Provided by |
|---|---|
| Invite, accept, create a game | The shared invitation engine — one `OutbreakInvitationModel` with a `CreateGame` |
| Persist and mutate board state | `GameData` discriminator + `specificGameState` |
| A move that validates, mutates and logs | `IGameCommand.Execute` |
| Multi-step turns (4 actions, then a discard choice) | `turnOver: false` on the outcome, as Train Time's `TrainTimeDrawTickets` / `TrainTimeKeepTickets` pair already does |
| Shuffling anything | `shuffle()` in `src/utils/games/shuffle.ts` — four games already import it |
| "It's your turn" push, turn timers, surrender, rematch | The command pipeline, the turntimer cron, `/api/game/end`, `GameFinishBanner` |
| Per-turn boards for the recap | `buildTimeline()`, given a replay adapter and recorded RNG |

`src/utils/games/Cards.ts` is **not** on that list and should not be reached
for. It is rank/suit playing-card domain logic written for Solitaire; Outbreak's
city/event/epidemic cards share nothing with it but the word "deck".

### 21.2 What the engine does not give us yet

Two gaps, each of which has to be closed by an engine change rather than by
game code. They are the reason the build order below starts outside
`src/games/Outbreak/`.

**1. There is no shared outcome.** `IGameData.winner` is a single user ID, and
`outcomeFor()` in `GameResultData.ts` reads an empty winner as a *draw* — which
is what Train Time deliberately records for a tie. A co-op table needs all four
players to read "won" or all four to read "lost", and neither is expressible
today. The command route also hardcodes `gameData.endReason = "win"` whenever
`CheckGameOver` returns true, so a game that ends in defeat would be filed as a
win, and the game-over notification fan-out splits the table into one winner and
N losers.

**2. A timed-out turn is a *reward* in this game.** Everywhere else, missing
your turn costs you something. In Outbreak the board only deteriorates during
the draw and infect phases of a player's own turn, so a turn the cron skips is a
turn with no infection — timing out becomes the strongest play at the table. The
cron advances `currentTurn` and nothing else, with no way for a game to resolve
a timeout differently (Train Time's §10 wants the same thing and notes its
absence).

### 21.3 Deviations from this document

Async play forces four, all of which should be recorded in a "Deviations"
subsection of this document as they land:

* **Event cards are playable only on your own turn**, at any point in your
  action phase, and during your own draw phase to duck the hand limit. §12 says
  they interrupt anyone at any moment; `POST /api/game/command` rejects every
  command from a user who isn't `currentTurn`, and the right answer is to accept
  that rather than build an out-of-turn authorisation path around it. With turns
  hours or days apart, "interrupt the active player" has no meaning — by the
  time a holder saw the situation and responded, the turn would be long
  resolved. One Quiet Night and Resilient Population lose the least (both are
  played in anticipation); Airlift loses the most, and is the one card whose
  power this measurably cuts.
* **Airlift needs no consent.** There is nobody to ask in real time, and the
  moved player can see where they were put. Co-op means no adversarial use.
* **Discussion is out of band.** §2's "shared table, shared brain" pillar rests
  on players talking. The app has no chat; open hands and a legible board are
  what carry it (see step 5 and step 11 below).
* **A player who drops out ends the game for everybody**, as in every other game
  here — the cron's abandon path already does this, and co-op gives it a cleaner
  reading than usual: the team lost.

### 21.4 State and command surface

`specificGameState` (all 48 cities in one array, indexed by city id):

```ts
{
  difficulty: 'introductory' | 'standard' | 'heroic',
  cities: { cubes: [number, number, number, number], station: boolean }[],
  cubesLeft:  Record<DiseaseColour, number>,
  cures:      Record<DiseaseColour, 'none' | 'cured' | 'eradicated'>,
  outbreaks: number,
  infectionRateIndex: number,
  playerDeck: CardId[],        // top first — redacted to a count
  playerDiscard: CardId[],
  infectionDeck: CityId[],     // top first — redacted to a count
  infectionDiscard: CityId[],  // public, and the game's most-read information
  players: Map<userId, {
      hand: CardId[],          // public by design (§2)
      city: CityId,
      role: RoleId,
      contingencyCard: CardId | null,
  }>,
  actionsLeft: number,
  phase: 'actions' | 'discard' | 'forecast',
}
```

**One map of per-player subdocuments, not four parallel maps.** Both existing
multiplayer games do it this way (`playerStates` in `WorldDominationModels.ts`
and `SettlementsAndCitiesModels.ts`), it gives `gameStateToModel` one redaction
loop and one `markModified` surface, it is the shape `computePerTurnStat` in
`GameResultData.ts` expects via a single `playerByUserId` helper, and it removes
a whole class of "the Medic moved but only three of the four maps knew" bug from
the Airlift and Dispatcher commands.

Three command classes, not fifteen — `docs/new-game.md` prefers a small number
of parameterised commands, and all eight board actions share the same "is it
your turn, do you have an action left, decrement, log" spine:

| Command | Covers |
|---|---|
| `OutbreakAction { kind, … }` | Drive · Direct · Charter · Shuttle · Build · Treat · Share · Cure · Pass |
| `OutbreakPlayEvent { cardId, … }` | The five event cards, the Contingency Planner's retrieval, and Forecast's second step (`phase === 'forecast'` gates it) |
| `OutbreakDiscard { cardIds }` | Coming back down to the 7-card hand limit |

The last action of a turn (or an `OutbreakAction { kind: 'pass' }`) runs the
draw and infect phases inside the same `Execute` and returns `turnOver: true`,
carrying what happened back on the outcome so the client can animate it. If the
draw leaves the player over the hand limit, `phase` becomes `'discard'` and the
turn stays open until `OutbreakDiscard` closes it — exactly the shape Train
Time's draw/keep-tickets pair already has.

**Redaction and recorded randomness.** Both deck orders are redacted to counts
in `gameStateToModel` (`docs/new-game.md`, "Don't leak hidden information") —
otherwise the infection deck, the thing the whole design is about not knowing,
is one network tab away. The infection *discard* is public and should be
rendered, not hidden: reading it is a skill the design rewards (§14.2). Every
`shuffle()` at setup — infection deck, player deck, the epidemic piles, the role
deal — lands in `initialSpecificGameState`, the way World Domination's territory
deal does, so replay is deterministic from day one. The **only** mid-game
randomness is the Intensify shuffle, which must be recorded onto the
epidemic-resolving command the first time it runs, the way `recordedRoll` is in
Snakes & Ladders and Settlements & Cities. Record it in the commit that
introduces it — Train Time's §11 is the cautionary tale of what retrofitting
this costs.

### 21.5 The commits

Each step below leaves `npm run build`, `npx tsc --noEmit` and `npm test` green,
and each is reviewable on its own. Step 1 is useful to the repo whether or not
Outbreak ever ships; from step 5 onward every step is playable by a human rather
than only by the test harness.

**1 — One way to finish a game, and shared outcomes.** No Outbreak code. Three
places already end a game and each has its own copy of the same sequence — set
`complete`/`winner`/`endReason`, `trySave`, `recordGameResult`, look up the
roster through Clerk, fan out `GameOver` pushes: the command route's game-over
branch, the cron's abandon path, and (partially) `/api/game/end`. Extract one
`finishGame(gameData, { winner, endReason, forfeitedBy })` next to
`recordGameResult` and port all three onto it, then add the co-op case *inside*
that one function rather than as a fourth copy:

* `'teamwin' | 'teamloss'` join `GameEndReason`; a co-op result records
  `winner: ""` plus one of those two, so nothing downstream has to guess.
* `CheckGameOver` may set `endReason` itself, and the command route stops
  overwriting it with `"win"`.
* `outcomeFor()` maps both new reasons to the same result for every player —
  **and so must the `$cond` aggregation in `getPlayerStats`**, which re-encodes
  the identical win/loss/draw rule a second time in Mongo. Fix only
  `outcomeFor()` and a co-op table gets the right chip in "recent form" and a
  silently wrong W/L/D on every profile. Better: delete the pipeline's
  branching, group in JS through the one `outcomeFor()`, and keep the rule in a
  single place.

Fires Out (`fires-out-gdd.md`) is co-op too and inherits all of this.

**2 — Board data and pure rules.** `src/games/Outbreak/board.ts`: the 48 cities,
their colours, the adjacency edge list, and schematic `x`/`y` for the map SVG —
the same shape as `WorldDomination/board.ts`. `rules.ts` alongside it holds the
pure logic: legal moves from a city, the outbreak chain resolver (with the
once-per-resolution rule of §10.1), cure eligibility, and the loss checks. Both
modules are server-free so the client can import them for the action picker
(`docs/new-game.md`, "Isomorphic rules modules"). Ships with tests: adjacency is
symmetric, every colour has 12 cities, the graph is connected, and a hand-built
cluster produces the chain reaction §10.1 describes.

**3 — Setup and wiring.** `OutbreakModels.ts` (both discriminators,
`buildInitialOutbreakState`, `gameStateToModel` with the redaction above),
`apiModels.ts`, `meta.ts` with `available: false`,
`POST /api/newgame/outbreak`, and the setup screen — `GameSetupLayout` +
`UserInviteList` (`src/components/UserInviteList.tsx`, driven by the
`usePlayerList` hook) + `TurnTimerSelect` + an `OptionSection` for the three
difficulties. `meta.categories` claims `Strategy` and `Co-op`, adding
**`Co-op`** to `GAME_CATEGORIES` in `src/utils/ui/games.ts` — one line, from
which `GameLibrary`'s filter chips derive automatically, and Fires Out will
want it too. Then the shared-file wiring of `docs/new-game.md` step 6: note that
`mongodb.ts` is four separate edits, and that the `registration` array in
`command/route.ts` takes one line *per command class*, so that row is revisited
in steps 4 and 10 rather than finished here. `gameRegistry.test.ts` and
`serializableRegistry.test.ts` name anything missed. At the end of this step a
game can be created and its opening board — 9 infected cities, 18 cubes, a
station in Atlanta — inspected in the API response.

**4 — The action phase.** `OutbreakLogic.ts` with `OutbreakAction` and
`OutbreakGameType`: four actions, all eight action kinds, `CheckEndTurn`
advancing on the fourth, and `CheckGameOver` returning true when all four
diseases are cured. The game is winnable and unloseable — which is exactly the
point of stopping here: the action economy can be tested in isolation before
anything is fighting back.

**5 — The board screen, first pass.** Enough UI to play step 4 by hand, so every
step after this one is playtestable as it lands rather than five commits later.
A pan-and-zoom SVG map over map art, following `WorldDominationBoard.tsx`:
cities as nodes, adjacency as lines, cubes as stacked pips, stations as markers.
The chrome is the shared kit re-tinted under a `.ag-game--outbreak` scope, never
rebuilt — `GameShell`, `GameScoreboard`, `Stat` for the outbreak/rate/cube
counters, `ActionButton` and `ag-actionsheet` for the action picker,
`GameOptionsMenu`, `GameFinishBanner`, `useGameData`, `useSubmitCommand`,
`usePushEvents`, `useEndGame`.

*Note for this step:* World Domination will then be the second game drawing a
node-and-edge map over art in an SVG. If the two are genuinely the same
component with different data, promote it to `src/components/ui/` and port World
Domination onto it in the same commit — a second copy is the signal to extract
the first (`AGENTS.md`). If Outbreak's per-city cube stacks and four-colour
state make it a different component wearing the same hat, keep them apart and
say so in the commit message. Decide by writing it, not up front.

**6 — The draw and infect phases.** Draw two, the hand-limit discard step, the
infect phase at the current rate, cube placement, outbreaks and chains, and all
three loss conditions (§4.2) reported through step 1's `teamloss`. The game is
now a real game: playable start to finish, winnable and loseable, at a fixed
infection rate of 2.

**7 — Turn-timeout resolution.** Now that a skipped turn is worth skipping,
close gap 2 of 21.2. **Not** a new `IGameType` method: the cron should construct
the game's own pass command, `Execute` it, push it onto `commandHistory` and let
`CheckGameOver`/`CheckEndTurn` run — the same three steps the command route and
`buildTimeline()` already perform. A per-game registry in the style of
`registerReplayAdapter` supplies that command; games that register nothing keep
today's advance-the-turn behaviour untouched. Doing it any other way — mutating
`specificGameState` from the cron directly — puts cubes on the board that no
command in history accounts for, and step 12's recap would then reconstruct a
different board than the live one, for exactly the turns the recap exists to
narrate. Outbreak's timeout is `OutbreakAction { kind: 'pass' }`, which already
resolves the draw and infect phases.

**8 — Epidemics.** The three-step resolution of §9.1, the pile-based deck
construction of §6 step 7, the difficulty dial from step 3 becoming live, the
infection rate track, and the recorded Intensify shuffle. This is the step that
gives the game its difficulty curve; the win rate target of §3 can only be
measured from here.

**9 — Roles.** All seven at once, dealt in `buildInitialOutbreakState` and
expressed as exceptions in `rules.ts` rather than branches sprayed through
`Execute`. Deliberately after the base rules are stable: every role bends a rule
step 4 or 6 established, and building them alongside those rules doubles the
surface being debugged. The Medic's free removal on entry and the Quarantine
Specialist's suppression are the two that reach outside their own command and
deserve their own tests.

**10 — Event cards.** The five of §12 through `OutbreakPlayEvent`, including
Forecast's ordering step and the Contingency Planner's retrieval (which is why
this follows roles). Own-turn-only, per 21.3.

**11 — The board screen, second pass.** The pieces that make a co-op table work
without a chat window: every player's hand rendered for everyone
(`ag-hand`/`ag-hand-card`, already shared by Settlements & Cities and Train
Time), the infection discard pile as a first-class panel rather than a footnote,
the event-card tray, and the history in `ag-log`. Turn navigation lands here
too — `useTurnNavigation` + `TurnNavControls`, the client half of step 12.

**12 — Recap, stats, ship.** `recap.ts` plus a replay adapter registration and
`useTurnRecap` on the board screen, which step 8's recorded shuffle and step 7's
command-shaped timeout already make possible. Co-op recap is unusually valuable
here: the away-time narrative is the board getting worse, which is the entire
experience of §3. Result stats need all four pieces in `GameResultData.ts` —
the schema def, the `OutbreakGameResult` discriminator model,
`computeOutbreakResultStats` (cures discovered, outbreaks survived, turns
lasted, difficulty) and `formatOutbreakResultStats` wired into
`GAME_RESULT_STATS`; miss the formatter and `formatGameResultStats` returns an
empty array and the result page renders nothing, silently, with no test failing.
`GameResultStats` and `GameStatsList` then display it for free. Finally flip
`meta.available` to true, add the "What's new" line to
`src/utils/ui/whatsNew.ts`, and fold the deviations of 21.3 into this document.

### 21.6 Testing

`OutbreakLogic.test.ts` follows `SolitaireLogic.test.ts`'s harness — an
in-memory `makeGame()`/`cmd()` pair over a plain `IGameData`-shaped object, no
Mongo and no Clerk. Two things are worth more here than in any game shipped so
far:

* **Cube conservation.** 24 cubes per colour, split between the board and the
  supply, with the loss firing the moment a placement can't be paid for. An
  invariant asserted after every command in a simulated game catches the
  placement bugs that outbreak chains are otherwise very good at hiding.
* **A full auto-played game per difficulty.** Play legal moves until a win or
  one of the three losses, asserting the game always terminates and never
  deadlocks. The same harness doubles as the only practical way to sanity-check
  the §3 win-rate target without a hundred human playtests.
