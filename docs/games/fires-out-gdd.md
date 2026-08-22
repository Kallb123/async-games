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

---

## 17. Implementation Plan

Nothing in `src/games/FiresOut/` exists yet. This section is the bridge between
the design above and the codebase: what the engine already provides, what it
doesn't, the concessions async play forces, and the order to build it in.

Read [`docs/new-game.md`](../new-game.md) and
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) §6 first — the checklist and the
command pattern are assumed here rather than repeated. Outbreak's §21
(`outbreak-gdd.md`) is the sibling plan; the two co-op games share their first
two steps and should not each pay for them.

### 17.1 What the engine already gives us

| Need | Provided by |
|---|---|
| Invite, accept, create a game | The shared invitation engine — one `FiresOutInvitationModel` with a `CreateGame` |
| Persist and mutate board state | `GameData` discriminator + `specificGameState` |
| A move that validates, mutates and logs | `IGameCommand.Execute` |
| A turn made of many small moves | `turnOver: false` on the outcome until the player ends the turn |
| Rolling a d6 and a d8 | `DiceRoll(6)` / `DiceRoll(8)` in `src/utils/games/DiceRoll.ts` — already arbitrary-sided |
| Showing dice | `Dice` / `DieFace` in `src/components/ui/` — with one caveat, see 17.2 |
| Two rule sets from one game | The `expansions.ts` flag-on-`specificGameState` pattern from Settlements & Cities |
| "It's your turn" push, turn timers, surrender, rematch | The command pipeline, the turntimer cron, `/api/game/end`, `GameFinishBanner` |
| Per-turn boards for the recap | `buildTimeline()`, given a replay adapter and recorded RNG |

### 17.2 What the engine does not give us yet

**1 and 2 — the two co-op gaps, shared with Outbreak.** There is no way to
express a shared outcome (`IGameData.winner` is a single user ID, and an empty
one reads as a *draw* in `outcomeFor()`), and the turntimer cron cannot resolve
a timeout in a game-specific way. Both are described in full in
`outbreak-gdd.md` §21.2 and closed by its steps 1 and 7. **Whichever game is
built first pays for them; the second inherits them.** The timeout gap bites
Fires Out for exactly the same reason it bites Outbreak: the fire advances at
the end of *your* turn, so a turn the cron skips is a turn the building doesn't
burn — and AP banking means a skipped turn even leaves you richer. Timing out
would be the strongest play at the table.

**3 — The engine's turn belongs to a *player*; this game's belongs to a
*firefighter*.** With one figure each that distinction is invisible, but §1
offers 1–6 players with solitaire play "supported by controlling multiple
pawns", and §7's design note makes the fire advance once per *firefighter*
turn — that per-figure advance is what keeps six-player games from being six
times easier. `gameState.turnOrder` is a list of user IDs and `currentTurn` is
one user ID, so a solo player driving three firefighters has no way to say
"it's my turn, for my second figure". This is why multi-pawn control is a late,
optional step below rather than part of setup.

**4 — `DieFace` has no face above 6.** Its `PIP_LAYOUT` covers 1–6 and returns
an empty pip grid for 7 or 8, so a d8 renders as a blank die. Octahedral dice
show numerals rather than pips anyway, so the fix is a numeral variant *in the
shared component* — not a bespoke Fires Out die that leaves the next game with
a d8 to solve it again.

### 17.3 Deviations from this document

* **Solitaire is a separate mode, not the default.** §1's "control multiple
  pawns" is gap 3 above; until that step lands, a one-player game is a
  one-firefighter game, which the AP economy makes close to unwinnable. Ship it
  as an option, not as the entry point.
* **Crew planning is out of band.** §14.2's quarterback problem and the crew
  discussion the Specialists exist to provoke both assume a table talking. The
  app has no chat, so the board must carry it: everyone's banked AP, every
  Specialist's ability, and the whole crew's positions visible on every screen.
* **Two of §14.5's three weaknesses simply vanish.** Async play removes
  downtime entirely — there is no waiting at a table — and analysis paralysis
  stops being a group cost when thinking happens on your own time. Only Family
  game variance survives, which makes the Experienced game's randomised setup
  the mode worth building toward.
* **The Fire Captain commands, but only on their own turn.** §11 lets them
  spend command AP moving other firefighters; `POST /api/game/command` rejects
  any command from a user who isn't `currentTurn`. Moving someone else's figure
  during your own turn is fine and needs no engine change — it's the pawn that
  moves, not the turn.

### 17.4 State and command surface

```ts
{
  ruleset: 'family' | 'experienced',
  difficulty: 'recruit' | 'veteran' | 'heroic',
  layout: 'a' | 'b',
  spaces: {                       // 48 interior + the exterior track, one array
      threat: 'none' | 'smoke' | 'fire',
      poi: { id: number, revealed: boolean } | null,   // identity redacted until revealed
      hazmat: boolean,
      hotspot: boolean,
  }[],
  edges: { kind: 'wall' | 'door' | 'open', damage: 0 | 1 | 2, doorOpen: boolean }[],
  damage: number,                 // 0–24; the collapse clock
  rescued: number,                // 7 wins
  lost: number,                   // 4 loses
  poiPool: boolean[],             // face-down victim/false-alarm pool — redacted to a count
  firefighters: {
      ownerId: string,
      space: number,
      specialist: SpecialistId,
      apLeft: number,
      bankedAp: number,           // 0–4
      carrying: 'victim' | 'hazmat' | null,
  }[],
  activeFirefighter: number,
  engine: number, ambulance: number,
  hotspotReserve: number,
}
```

**Edges are a flat array, not a keyed map.** The 8 × 6 grid has a fixed 82
interior wall segments (42 vertical, 40 horizontal) plus the exterior openings;
number them once in `board.ts` and index them, the way World Domination numbers
its territories. A `Record<string, …>` keyed by `"12-13"` would work and would
be worse: it becomes `Schema.Types.Mixed`, it can't be validated by the schema,
and it invites two different key orderings for the same wall.

**Every command must call `markModified('specificGameState')`.** This is
`docs/new-game.md`'s hardest-won gotcha and Fires Out hits it harder than any
game shipped so far: `spaces`, `edges` and `firefighters` are all nested arrays
mutated in place, and Mongoose tracks none of that. One `markDirty(gameData)`
helper, called at the end of every `Execute`, as the gotcha recommends.

**One command class.** Every action in §8 is "do you have the AP, spend it,
mutate, log":

```ts
FiresOutAction {
  kind: 'move' | 'carry' | 'door' | 'extinguish' | 'chop' | 'drive'
      | 'deckGun' | 'crewChange' | 'disposeHazmat' | 'reveal' | 'endTurn',
  … per-kind params (target space, edge, quadrant, specialist) …,
  recordedRolls: number[],
}
```

There is no second decision point anywhere in the turn — Advance Fire, flashover
and Replenish POI are all fully deterministic given their rolls, and a revealed
POI offers no choice — so nothing needs the open-turn/second-command shape Train
Time and Outbreak use. `{ kind: 'endTurn' }` banks up to 4 AP, then runs Phase 2
and Phase 3 inside the same `Execute` and returns `turnOver: true`.

**Recorded randomness is the hard part of this game.** A single Advance Fire can
roll many times: the initial d6/d8, a re-roll for an invalid replenish target,
and one further full resolution per hot spot flare-up, which can chain. The
number of rolls is not knowable in advance, so `recordedRolls` is an ordered
list with a cursor: the resolver calls a `nextRoll(d)` that pops the next
recorded value if present and otherwise rolls and appends. First execution
records; replay consumes. `buildTimeline()` then reproduces the fire exactly,
which is what `recordedRoll` does for a single die in Snakes & Ladders and
Settlements & Cities — this is the same idea with the count left open. Get it
wrong and the recap tells every player a different story about the same fire.
The Experienced game's rolled setup (§6.2) lands in `initialSpecificGameState`,
the way World Domination's territory deal does.

**Redaction.** `gameStateToModel` sends an unrevealed POI as `{ revealed:
false }` with no victim flag, and the face-down pool as a count. §10's design
note is explicit that hidden POI identity is what stops the game being a pure
logistics optimisation; leaving it in the response hands every player a
`Ctrl+Shift+I` cheat that deletes a design pillar.

### 17.5 The commits

Each step leaves `npm run build`, `npx tsc --noEmit` and `npm test` green and is
reviewable on its own. From step 4 the game is playable by hand.

**1 — The two shared co-op steps.** `outbreak-gdd.md` §21.5 steps 1 and 7:
extract one `finishGame()` and put the `teamwin`/`teamloss` outcome inside it
(including the `$cond` aggregation in `getPlayerStats` that duplicates
`outcomeFor()`), and let the cron resolve a timeout by executing the game's own
pass command through the normal pipeline. Skip entirely if Outbreak got there
first. Fires Out's timeout command is `FiresOutAction { kind: 'endTurn' }`,
which already banks AP and advances the fire.

**2 — Board data and pure rules.** `src/games/FiresOut/board.ts`: both layouts
as space and edge tables, the d6/d8 coordinate mapping, the exterior track, the
parking spots, and the printed Family setup. `rules.ts` alongside it is the
whole fire system as pure functions — §9.1's four-row table, explosion
radiation with shockwaves, flashover to fixpoint, knock-downs — taking a
`nextRoll` callback rather than calling `DiceRoll` itself, which is what makes
it both replayable and testable. Server-free, so the client can import it to
show what an action costs and what is reachable (`docs/new-game.md`,
"Isomorphic rules modules"). Ships with tests: a shockwave crosses a burning
corridor and damages the wall at the end of it, a smoke-filled wing flashes over
in one step, and 24 damage markers end the game.

**3 — Setup and wiring.** `FiresOutModels.ts` (both discriminators,
`buildInitialFiresOutState`, `gameStateToModel` with the redaction above),
`apiModels.ts`, `meta.ts` with `available: false`,
`POST /api/newgame/firesout`, and the setup screen — `GameSetupLayout` +
`UserInviteList` (`src/components/UserInviteList.tsx`, driven by `usePlayerList`)
+ `TurnTimerSelect` + `OptionSection` rows for board side and, later, ruleset.
`meta.categories` claims `Strategy` and `Co-op` (adding `Co-op` to
`GAME_CATEGORIES` in `src/utils/ui/games.ts` if Outbreak hasn't). Then the
shared-file wiring of `docs/new-game.md` step 6 — `mongodb.ts` is four separate
edits, and `command/route.ts` takes one line per command class, which here is
genuinely one line. Family game only, at this step: no hazmat, hot spots,
vehicles or Specialists.

**4 — The Family turn loop.** `FiresOutLogic.ts` with `FiresOutAction` and
`FiresOutGameType`: the AP economy including banking, move/carry/door/
extinguish/chop, POI reveal and rescue, `endTurn` running Advance Fire (with
explosions, flashover, knock-downs) and Replenish POI, and all three end
conditions from §5 — the win through `CheckGameOver`, the two losses through
step 1's `teamloss`. This is the complete Family game and the whole design in
miniature; everything after it is content.

**5 — The board screen.** An 8 × 6 CSS grid inside `ag-board-frame`, walls drawn
as cell borders and doors as gaps, threat markers as smoke/fire pips, POIs as
"?" tokens, firefighters as pawns. The chrome is the shared kit re-tinted under
a `.ag-game--firesout` scope, never rebuilt — `GameShell`, `GameScoreboard`,
`Stat` for the rescued/lost/damage tracks, `ActionButton` and `ag-actionsheet`
for the AP spend picker, `ag-log` for the history, `GameOptionsMenu`,
`GameFinishBanner`, `useGameData`, `useSubmitCommand`, `usePushEvents`,
`useEndGame`. Snakes & Ladders' grid is the closest existing thing and is *not*
reusable — `ag-sl-cell` and friends are scoped to that game's 10 × 10 board with
its own snake and ladder art — so this is a new grid, kept inside its own scope
for the same reason. The d8 face from gap 4 lands here, in `DieFace`.

**6 — Advance Fire on screen.** The fire is the antagonist (§2) and a player
returning after a day away needs to see what it did, not read a log line. The
d6/d8 roll through the shared `Dice`, then the affected spaces highlighted in
sequence — `useAnimatedList` already exists for staged reveals. Deliberately its
own step: it is the one piece of this game that is pure presentation, and the
easiest thing to cut if it is bundled with something load-bearing.

**7 — Hazmat, hot spots and the Experienced setup.** The rolled setup of §6.2
including initial explosions and their wall damage, the three difficulty tiers,
hazmat detonation, and flare-up chaining through `nextRoll`. Gated on the
`ruleset` flag in the style of `SettlementsAndCities/expansions.ts`. This is the
step that makes the game replayable (§14.4) and it is where the recorded-roll
cursor earns its keep.

**8 — Vehicles.** Engine and Ambulance parking, driving with riders, the
ambulance as the rescue destination, and the deck gun's quadrant-and-roll
targeting. Small, self-contained, and needed before two of the Specialists mean
anything.

**9 — Specialists.** All eight at once, chosen at setup, swappable at the Engine
for 2 AP, expressed as AP-pool modifiers and rule exceptions in `rules.ts`
rather than branches sprayed through `Execute`. The restricted-AP roles (§11's
design note) are the interesting ones: model AP as a small set of typed pools —
general, plus movement/chop, extinguish or command — rather than a single number
with special cases at every spend site, or every action gains a "which pool did
this come from" argument.

**10 — Recap, stats, ship.** `recap.ts` plus a replay adapter and
`useTurnRecap`/`useTurnNavigation`/`TurnNavControls` on the board screen. This
game's away-time story is unusually strong — the fire advanced once per crewmate
since you last looked — and step 2's `nextRoll` design is what makes replaying
it honest. Result stats need all four pieces in `GameResultData.ts`: the schema
def, the `FiresOutGameResult` discriminator, `computeFiresOutResultStats`
(rescued, lost, damage placed, turns survived, ruleset and tier) and
`formatFiresOutResultStats` wired into `GAME_RESULT_STATS` — miss the formatter
and `formatGameResultStats` returns an empty array and the result page renders
nothing, silently, with no test failing. Then flip `meta.available`, add the
"What's new" line to `src/utils/ui/whatsNew.ts`, and fold 17.3's deviations into
this document.

**11 — Solitaire, optional.** Multi-pawn control, closing gap 3. A solo game
creates its invitation with `userIdList: []` and `UNLIMITED_TURN_TIMER` exactly
as Solitaire's `POST /api/newgame/solitaire` does, and `turnOrder` carries the
one user ID once per firefighter they control, with `activeFirefighter` saying
which figure is up. Note the trap before writing it: the turntimer cron advances
turns with `turnOrder.findIndex(to => to === currentTurn)`, which finds the
*first* occurrence and would jump to the wrong figure — safe here only because
`isExpired()` returns false for unlimited timers and so the cron never touches a
solo game at all. If a multi-pawn game ever gets a real timer, that lookup has
to move to `activeFirefighter` first.

### 17.6 Testing

`FiresOutLogic.test.ts` follows `SolitaireLogic.test.ts`'s harness — an
in-memory `makeGame()`/`cmd()` pair over a plain `IGameData`-shaped object, no
Mongo and no Clerk. Because `rules.ts` takes an injected `nextRoll`, the fire
system can be tested with scripted dice rather than statistically:

* **Scripted fires.** Feed a fixed roll sequence into a hand-built board and
  assert the exact resulting state — a shockwave through three burning spaces, a
  flare-up chain, a flashover that ignites a wing. These are the tests that
  would have caught every rules bug in this design.
* **Marker conservation.** 24 damage markers, the POI pool, and the threat
  markers are all finite; assert after every command that what's on the board
  plus what's in reserve equals what the game started with.
* **A full auto-played game per tier.** Play legal actions until a win or one of
  the two losses, asserting termination and no deadlock — and doubling as the
  only practical way to sanity-check §13's tuning without a hundred playtests.
* **Replay equality.** Run a game, then rebuild it through `buildTimeline()` and
  assert the final state matches. In a game this roll-heavy that assertion is
  worth more than any individual rules test.
