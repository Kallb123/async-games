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