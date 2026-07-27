# Fires Out! — Game Design Document

## 1. Overview

| Field | Value |
|---|---|
| **Title** | Fires Out! |
| **Genre** | Cooperative, action-point, dice-driven crisis management |
| **Players** | 1–6 (fully cooperative; solitaire supported by controlling multiple pawns) |
| **Play time** | 20–45 min (Family) / 45–90 min (Experienced) |
| **Age** | 10+ |
| **Complexity** | Light (Family) to medium (Experienced) |

**One-line pitch:** A crew of firefighters races through a burning house to pull people out before the fire spreads faster than they can contain it and the structure collapses.

**Core fantasy:** Triage under pressure. Every turn the player must choose between saving a person *now* and fighting the fire so that anyone can be saved *later*.

---

## 2. Design Pillars

1. **The building is the antagonist.** There is no AI opponent, no traitor, no deck of event cards driving a story. The threat is a spatial system that grows outward from wherever it already is. Players lose to geometry.
2. **Two currencies, one clock.** Players spend action points; the building spends structural integrity. Both run down, and the two are coupled — chopping a wall buys time and costs the building.
3. **Escalation is emergent, not scripted.** Difficulty ramps because fire adjacency compounds, not because a timer track advances. A quiet game and a catastrophic game use identical rules.
4. **Scalable rule surface.** A single physical box supports a 15-minute family game and a punishing tactical puzzle, using the same board, tokens, and core loop.
5. **Thematic honesty over abstraction.** Terminology, roles, and hazards are drawn from real fire service practice (flashover, hot spots, hazmat, CAFS, deck gun). The theme is load-bearing rather than decorative.

---

## 3. Components

| Component | Qty (approx.) | Function |
|---|---|---|
| Double-sided game board | 1 | Two house layouts; grid of 8 × 6 = 48 interior spaces plus an exterior parking track |
| Threat markers (smoke / fire) | ~33, double-sided | The advancing hazard; smoke on one face, fire on the other |
| Point of Interest (POI) markers | ~15 used per game (10 victims, 5 false alarms) | Face-down "?" tokens; hidden information |
| Damage markers | 24 | Structural integrity; also the global loss timer |
| Hot Spot markers | ~24 | Volatile locations that chain extra fire advances |
| Hazmat markers | 6 (3–5 used) | Explosive obstacles that must be removed or avoided |
| Door markers | 8, double-sided | Open / closed; block or permit movement and fire |
| Firefighter figures | 6 | Player pawns |
| Vehicle markers | 2 | Fire Engine and Ambulance (Experienced game) |
| Specialist cards | 8 | Asymmetric role abilities (Experienced game) |
| Dice | 1 × d6, 1 × d8 | Grid coordinate generator (row × column) |
| Action / saved-AP markers | ~21 | Track banked action points |
| Player aid cards | 6 | Reference |

**Design note:** The d6/d8 pair is the game's cleverest component decision. It maps directly onto the 6 × 8 grid, producing a *uniform random coordinate* with no lookup table, no card deck to shuffle, and no possibility of deck-tracking. The randomness is flat and unforgeable, which is exactly what makes the fire feel indifferent rather than dramatic.

---

## 4. Core Concepts and Terminology

- **Space** — one grid square. Spaces are separated by *wall segments* or *doorways*.
- **Wall segment** — impassable until damaged twice, at which point it is destroyed and becomes passable.
- **Doorway** — holds a door marker, either open (passable to firefighters and fire) or closed (blocks both).
- **Smoke** — hot gas; harmless in itself, but converts to fire on contact with fire.
- **Fire** — the active threat. Kills POIs, knocks down firefighters, and seeds explosions.
- **Explosion** — fire pushed into an already-burning space; radiates outward in four directions.
- **Flashover** — the post-resolution cleanup step where every smoke space adjacent to fire ignites, cascading.
- **Hot Spot** — a marked space that triggers an additional Advance Fire roll when fire reaches it (a *flare-up*).
- **POI (Point of Interest)** — a face-down marker, revealed as a victim or a false alarm when a firefighter reaches it.
- **AP (Action Points)** — the player's per-turn resource.
- **Knock Down** — a firefighter caught by advancing fire is removed to the exterior and must re-enter.

---

## 5. Objectives and End Conditions

The game ends immediately when any one of the following is met:

| Condition | Result |
|---|---|
| **7 victims rescued** | Players **win** |
| **4 victims lost** | Players **lose** (seven can no longer be saved from the ten in the pool) |
| **All 24 damage markers placed** | Building collapses — players **lose** |

**Design note:** Three end conditions, each tied to a different resource, is what gives the game its decision texture. Victims rescued is the *goal*; victims lost is a *soft fail track* that punishes neglect; damage is a *hard clock* that punishes brute force. Chopping through walls is the fastest route to a victim and also the fastest route to defeat — that single coupling generates most of the game's tension.

---

## 6. Setup

### 6.1 Family Game

1. Choose a board side. Place door markers **closed** in every doorway.
2. Place the starting fire markers on the coordinates printed in the setup diagram (a cluster of ten, typically centred).
3. Build the POI pool: 10 victim markers and 5 false alarms, mixed face down ("?" side up).
4. Place 3 POI markers on the board at the printed setup coordinates.
5. Each player takes a firefighter figure and places it on any exterior space (outside the building).
6. Place damage markers, spare POIs, spare threat markers, and dice within reach.
7. Set unused components (hazmat, hot spots, vehicles, specialist cards) aside — they are not used.

### 6.2 Experienced Game

Steps 1, 3, and 5 as above, then:

1. **Choose a difficulty level:**

| Level | Initial Explosions | Hazmats | Notes |
|---|---|---|---|
| **Recruit** | 3 | 3 | Comparable to the Family game |
| **Veteran** | 3 | 4 | Hard |
| **Heroic** | 4 | 5 | Very hard; larger hot spot reserve |

2. **Seed the fire by explosion, not by diagram.** Roll for each initial explosion's coordinate and resolve it fully — including wall damage. The building starts already compromised, and *differently* compromised every game.
3. **Place hazmats** by rolled coordinate, one per space.
4. **Place hot spots** by rolled coordinate: a base number scaled by crew size (roughly 2 for a three-firefighter crew, 3 for four or more), plus 3 additional at Veteran and Heroic. Keep a reserve of hot spot markers on the board's holding circles for later placement.
5. **Place 3 POIs** by rolled coordinate (re-roll invalid spaces).
6. **Park the vehicles.** Place the Fire Engine and Ambulance on separate exterior parking spots.
7. **Each player selects a Specialist card** and the matching firefighter figure.

**Design note:** Rolling the setup — rather than printing it — is what makes the Experienced game replayable in a way the Family game is not. Randomised initial explosions mean the opening tactical problem ("which side of the house do we attack from?") is genuinely new each session, and the wall damage from setup means the collapse clock is already ticking before anyone has taken a turn.

---

## 7. Turn Structure

A player's turn is three phases, always in this order:

### Phase 1 — Take Actions
Spend AP. Actions may be taken in any order and repeated. **Unspent AP are banked, up to a maximum of 4 saved** — so a firefighter may have up to 8 AP available on a turn following a turn spent standing still.

### Phase 2 — Advance Fire
1. Roll d6 and d8 for a target space and resolve it (see §9).
2. Resolve any explosion.
3. Resolve any hazmat detonation.
4. Resolve any hot spot flare-ups (each triggering another roll — these can chain).
5. Resolve **flashover**: every smoke space adjacent to fire flips to fire, repeating until stable.
6. Resolve consequences: POIs in fire spaces are lost; firefighters in fire spaces are knocked down; remove any fire that ended up outside the building.

### Phase 3 — Replenish POI
If fewer than 3 POI markers are on the board, roll for a coordinate and place a new POI, repeating until 3 are present. Invalid targets (fire, an existing POI, occupied spaces in the Experienced game) are redirected using the arrow diagram printed on the board, or re-rolled.

**Design note:** Fire advances after *every individual player's* turn, not once per round. This is a deliberate and often-missed scaling decision: a six-player crew has six times the actions per round but also faces six fire advances. The game therefore scales in *complexity of coordination* rather than in difficulty — more hands, more fire, roughly constant pressure.

---

## 8. Actions and AP Costs

Base allowance: **4 AP per turn** (modified by Specialist).

| Action | Cost | Notes |
|---|---|---|
| Move to an adjacent space | 1 AP | Through open doorways or destroyed walls only |
| Move into a space containing fire | 2 AP | Not permitted while carrying a victim or hazmat |
| Move while carrying a victim | 2 AP per space | The core tension: rescue is slow |
| Move while carrying a hazmat | 2 AP per space | |
| Open or close a door | 1 AP | Closed doors block fire — a genuine tactical tool |
| Extinguish (fire → smoke, or remove smoke) | 1 AP | Fully removing fire therefore costs 2 AP |
| Chop a wall | 2 AP | Places 1 damage marker; 2 damage destroys the wall segment |
| Drive Engine or Ambulance | 2 AP | Experienced; firefighter must be with the vehicle, and rides with it |
| Fire the deck gun | 4 AP | Experienced; from the Engine |
| Crew change (swap Specialist card) | 2 AP | Experienced; must begin the turn at the Engine |
| Dispose of hazmat | — | Experienced; carried out of the building, or removed on-site by the Hazmat Technician |

**Design note on AP banking:** Allowing up to 4 saved AP is a small rule with large consequences. It lets a player deliberately *pass* to fund a decisive 8-AP turn — a wall chop plus a two-space carry, say — and it converts the turn structure from "spend it or lose it" into a genuine tempo decision. It also gives a player with no good options something better to do than fidget.

---

## 9. The Fire System

This is the game's engine. All escalation derives from it.

### 9.1 Resolving the target space

| Target space contains | Result |
|---|---|
| Nothing, not adjacent to fire | Place **smoke** |
| Nothing, adjacent to fire | Place **fire** |
| Smoke | Flip to **fire** |
| Fire | **Explosion** |

### 9.2 Explosions

Fire radiates from the exploding space in all four orthogonal directions. For each direction:

- **Open space or smoke** → place fire and stop.
- **Wall segment** → place a damage marker on it (2 damage destroys it) and stop.
- **Closed door** → the door is destroyed and stop.
- **Space already on fire** → a **shockwave**: the blast continues in that direction, space by space, until it reaches something it can burn, damaging walls and destroying doors along the way.

### 9.3 Flashover

After the explosion resolves, every smoke marker adjacent to a fire marker flips to fire. Repeat until no smoke is adjacent to fire. A single roll into a smoke-filled corridor can therefore ignite an entire wing.

### 9.4 Hazmat and Hot Spots (Experienced)

- **Hazmat struck by fire** → immediate explosion at that space; the hazmat is removed and replaced by a **hot spot**.
- **Fire placed on a hot spot** → a **flare-up**: roll again and resolve another full Advance Fire. Flare-ups can chain into flare-ups.

**Design note:** The four-row table in §9.1 is the whole game compressed into twelve words. Smoke is a *warning*; fire is a *cost*; explosion is a *catastrophe*. Because each state is one step from the next, players can read the board and estimate risk — the fire is unpredictable in *location* but entirely predictable in *behaviour*. That combination is what makes the randomness feel fair rather than arbitrary.

---

## 10. Victims, POIs, and Knock Downs

### 10.1 Points of Interest

- POIs sit face down as "?" markers. A firefighter entering (or occupying) the space **reveals** it.
- **False alarm** → remove the marker; it is replenished at the end of the current turn.
- **Victim** → the marker flips to its victim face and may now be carried.
- A POI caught by fire is **lost**. Losing a false alarm is harmless. Losing a victim advances the loss track — and players usually do not know which they have lost until it burns.

### 10.2 Rescuing

- **Family game:** carry the victim to any exterior space — outside the building is safe.
- **Experienced game:** carry the victim all the way to the **Ambulance**. The ambulance can be repositioned, which turns "where do we park?" into a real opening decision.

### 10.3 Knock Down

A firefighter in a space where fire appears is **knocked down**: the figure is moved to the nearest ambulance parking spot outside the building. Any victim being carried is knocked down along with them rather than lost — a small mercy that keeps a bad roll from being a run-ending roll.

**Design note:** Hidden POI identity is doing quiet, essential work. Without it, the game is a pure logistics optimisation. With it, every rescue route is a bet, and the Imaging Technician becomes genuinely valuable rather than a minor convenience. It also produces the game's best emotional beat: sprinting through fire to reach a "?" that turns out to be a burnt sofa.

---

## 11. Specialist Roles (Experienced Game)

Eight asymmetric roles. Each player takes one; roles may be swapped mid-game for 2 AP at the Engine.

| Specialist | AP | Ability | Role in the crew |
|---|---|---|---|
| **Generalist** | 5 | No special ability — one extra AP every turn | Flexible workhorse; the baseline against which the others are measured |
| **Fire Captain** | 4 (+2 command) | Spends up to 2 extra AP per turn moving *other* firefighters (including carrying victims) or working doors | Force multiplier; scales with crew size |
| **Rescue Specialist** | 4 (+3 move/chop) | Bonus AP usable only for movement and chopping; chops walls for 1 AP instead of 2 | Cuts new routes through the floorplan |
| **CAFS Firefighter** | 3 (+3 extinguish) | Bonus AP usable only for extinguishing; foam suppresses efficiently | Fire control specialist; weak at rescue, strong at containment |
| **Paramedic** | 4 | Treats a victim for 1 AP so the victim walks alongside instead of being carried; pays extra to extinguish | Converts 2-AP-per-space carries into 1-AP-per-space escorts |
| **Imaging Technician** | 4 | Reveals POI markers remotely, without travelling to them | Removes false-alarm waste from route planning |
| **Driver/Operator** | 4 | Fires the deck gun for 2 AP, may reposition the Engine, and re-rolls off-target deck gun shots | Area suppression from outside the building |
| **Hazmat Technician** | 4 | Removes hazmat markers on site rather than carrying them out | Defuses the Experienced game's chain-reaction threat |

**Design note:** The roles are unusually differentiated for a cooperative game of this weight. Rather than the common pattern of "same character, small modifier," several here have *restricted* bonus AP — the CAFS Firefighter trades a general AP for three that can only fight fire, the Rescue Specialist gets three that can only move or chop. Restricted currency is a strong asymmetry tool: it changes what a player *wants to do* rather than merely how efficiently they do it, which is what makes crew composition a real discussion. The Paramedic's extinguish penalty is the clearest example of the design giving roles genuine weaknesses instead of pure upside.

---

## 12. Vehicles (Experienced Game)

### 12.1 Fire Engine
Parked on an exterior spot. Serves as the crew-change point and the deck gun platform. Firefighters in the Engine's space may ride along when it is driven.

### 12.2 Ambulance
The rescue destination. Repositioning it shortens every subsequent carry — a strong but easily forgotten optimisation.

### 12.3 Deck Gun
For 4 AP (2 for the Driver/Operator), select a quadrant of the building containing no firefighters, roll for a target space within it, and remove fire and smoke from that space and its orthogonal neighbours.

**Design note:** The deck gun is a deliberately *unaimed* tool — powerful area suppression with dice-driven targeting. It gives the crew an answer to a runaway fire without letting them surgically undo bad luck, and the "no firefighter in the quadrant" restriction forces a real evacuate-then-suppress sequence rather than a spam button.

---

## 13. Difficulty and Scaling

| Axis | Mechanism |
|---|---|
| **Rule set** | Family (no hazmat, hot spots, vehicles, or roles) → Experienced |
| **Difficulty tier** | Recruit / Veteran / Heroic: initial explosions, hazmat count, hot spot count |
| **Board side** | The two house layouts differ in entry points; one is materially easier |
| **Crew size** | More players = more actions *and* more fire advances per round; scaled hot spot count compensates |
| **Rescue target** | Fixed at 7 victims across all levels — the goal never moves, only the pressure |

**Design note:** Holding the win condition constant while varying only the environment is a clean tuning approach. Players learn one target and one loop, then face it under worse conditions. Nothing has to be re-learned to step up a difficulty tier.

---

## 14. Design Analysis

### 14.1 Tension curve
The game has a characteristic shape: a calm opening (fire contained, POIs close, plenty of AP), a mid-game inflection where the first serious explosion or flare-up chain reorganises the board, and an endgame that is either a controlled evacuation or a desperate scramble with the damage track nearly full. The curve is produced entirely by adjacency compounding — there is no scripted escalation.

### 14.2 The quarterback problem
Like most fully-cooperative games with open information, Fires Out! is vulnerable to a dominant player directing everyone's turns. Mitigations present in the design: individual AP pools with banking (players own their tempo), asymmetric roles (each player holds distinct capability), and — significantly — the Fire Captain role, which *legitimises* the directing behaviour and puts a cost on it. Hidden POI identity also limits how well anyone can plan the whole crew's routes.

### 14.3 Randomness and agency
Two dice determine the fire's location every turn, which is a very high randomness budget for a tactical game. It works because the *consequences* of any roll are deterministic and readable, so players make decisions about probability and exposure rather than hoping. Players who lose can usually identify the moment they overextended, which is the practical test of whether randomness feels fair.

### 14.4 Replayability
Sources of variance: two board layouts, randomised setup in the Experienced game, POI shuffle and hidden identity, dice-driven fire, and eight roles across variable crew sizes. The Family game's fixed setup makes it repetitive after a handful of plays, which is a reasonable trade for its teaching function.

### 14.5 Notable weaknesses
- **Analysis paralysis** grows with crew size, since every player's turn ends in a fire advance that invalidates prior planning.
- **Family game variance** is high relative to its decision space; a bad opening string of rolls can be unrecoverable in a game with few tools to respond.
- **Downtime** in six-player games is significant, mitigated only partly by the fact that the fire advance keeps everyone watching.

---

## 15. Expansion Design Space

The base architecture — a grid, a coordinate roll, and a state-escalation table — extends cleanly. Published expansions have used it for multi-storey buildings with stairwells and elevators, alternate structures (subway station, airfield, laboratory, mechanic's garage), attic and basement modules that attach to existing boards, new hazards (windows, fire-proof doors, explosive objects), and additional specialists such as the Structural Engineer and Fire Prevention Specialist. The key extensibility property is that new content changes the *map and the hazard table*, never the turn loop.

---

## 16. Quick Reference

**Turn:** Actions → Advance Fire → Replenish POI

**Advance Fire:** Roll d6 + d8 → Empty = smoke (fire if adjacent to fire) · Smoke = fire · Fire = explosion → resolve hazmat → resolve flare-ups → flashover → knock downs and lost POIs

**Costs:** Move 1 · Move into fire 2 · Carry victim/hazmat 2 per space · Door 1 · Extinguish 1 · Chop 2 · Drive vehicle 2 · Deck gun 4 · Crew change 2

**Banking:** Save up to 4 AP between turns

**End:** 7 rescued = win · 4 lost = loss · 24 damage = collapse
