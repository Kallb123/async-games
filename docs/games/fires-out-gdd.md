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
| Double-sided game board | 1 | Two house layouts; grid of 8 × 6 = 48 interior spaces inside an exterior perimeter of 32 outdoor spaces (the parking track and the street round it) |
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
(`outbreak-gdd.md`) is the sibling plan; the two co-op games share Outbreak's
steps 1 and 7, folded into one step here, and should not each pay for them.

### 17.1 What the engine already gives us

| Need | Provided by |
|---|---|
| Invite, accept, create a game | The shared invitation engine — one `FiresOutInvitationModel` with a `CreateGame` |
| Persist and mutate board state | `GameData` discriminator + `specificGameState` |
| A move that validates, mutates and logs | `IGameCommand.Execute` |
| A turn made of many small moves | `turnOver: false` on the outcome until the player ends the turn |
| Rolling a d6 and a d8 | `DiceRoll(6)` / `DiceRoll(8)` in `src/utils/games/DiceRoll.ts` — already arbitrary-sided |
| Shuffling the POI pool | `shuffle()` in `src/utils/games/shuffle.ts` — four games already import it |
| Showing dice | `Dice` / `DieFace` in `src/components/ui/` — with one caveat, see 17.2 |
| Six pawn and scoreboard colours | `playerColour()` in `src/utils/ui/playerColours.ts` — exactly six, which is the crew cap |
| "It's your turn" push, turn timers, surrender, rematch | The command pipeline, the turntimer cron, `/api/game/end`, `GameFinishBanner` |
| Per-turn boards for the recap | `buildTimeline()`, given a replay adapter and recorded RNG |

### 17.2 What the engine does not give us yet

**1 and 2 — the two co-op gaps, shared with Outbreak.** There is no way to
express a shared outcome (`IGameData.winner` is a single user ID, and an empty
one reads as a *draw* in `outcomeFor()`), and the turntimer cron cannot resolve
a timeout in a game-specific way. Both are described in full in
`outbreak-gdd.md` §21.2 and closed by its steps 1 and 7. **Whichever game is
built first pays for the engine work; the second only registers itself** —
Outbreak paid for both, so **this is done**: `finishGame()` carries the shared
outcome and `registerTurnTimeoutAdapter` (`src/utils/games/turnTimeout.ts`) is
where Fires Out registers its own timeout command. The timeout gap bites Fires
Out for exactly the same reason it bites Outbreak: the fire advances at the end
of *your* turn, so a turn the cron skips is a turn the building doesn't burn —
and AP banking means a skipped turn even leaves you richer. Timing out would be
the strongest play at the table. Worse than in Outbreak, a skipped turn also
*deadlocks* the game, for gap 3's reason: the cron's plain advance moves
`currentTurn` without moving `activeFirefighter`, and nobody can move again.

**3 — The engine's turn belongs to a *player*; this game's belongs to a
*firefighter*.** With one figure each that distinction is invisible, but §1
offers 1–6 players with solitaire play "supported by controlling multiple
pawns", and §7's design note makes the fire advance once per *firefighter*
turn — that per-figure advance is what keeps six-player games from being six
times easier. `gameState.turnOrder` is a list of user IDs and `currentTurn` is
one user ID, so neither can name a figure.

This needs no engine change, and specifically **must not** be solved by putting
a user in `turnOrder` more than once. Five places in the repo advance a turn
with `turnOrder.findIndex(to => to === currentTurn)` — `/api/game/taketurn`,
the turntimer cron, and the `CheckEndTurn` of Snakes & Ladders, Dice Cities and
Smartthink — and every one of them would find the *first* occurrence and jump to
the wrong figure. Worse, `buildTimeline()` sets `state.currentTurn =
command.senderId` for every replayed command, so duplicate IDs are
indistinguishable on replay no matter what the live game did.
`activeFirefighter` on `specificGameState` is therefore the single source of
truth for which figure is up; `turnOrder` keeps one entry per user, and
`turnOver` is true only when the next figure belongs to a different one.

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
  app now has a chat thread on every board (`docs/in-game-chat.md`), but planning
  must never *depend* on it: the board carries everything a crew needs to
  coordinate — everyone's banked AP, every Specialist's ability, and the whole
  crew's positions visible on every screen — so a silent table plays exactly as
  well as a chatty one.
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
* **The rooms are the ones the art draws.** `ROOM_GRID` in `board.ts` is
  measured off `public/art/fires-out/board.png` against the grid the board
  component lays over it, so every wall the player can see is a wall the rules
  play by. Four of the eight door markers sit on doorways the art draws; the
  other four are placed by us, because the art seals four of its rooms and
  every room has to be reachable. Re-measure the art before changing the
  table.
* **A game in flight keeps the floorplan it was dealt.** The migration for a
  board saved under an older layout is additive only: it appends the spaces and
  edges the exterior perimeter added and leaves the walls, doors and damage
  alone. Re-pointing them at a new `ROOM_GRID` would move walls under a game
  already being played, and — because the recap replays a game's recorded
  commands against its own starting snapshot (`utils/games/replay.ts`) — would
  make its own history stop replaying, quietly dropping every move through a
  boundary that had become a wall. Any future change to the room table applies
  to games started after it, not to games already burning.
* **One board layout, not two.** §3 and §6.1 step 1 describe a double-sided
  board; only one floorplan's art was ever uploaded
  (`public/art/fires-out/board.png`), so `board.ts` builds one `ROOM_GRID` /
  door layout and there is no board-side picker on the setup screen. The
  `specificGameState` shape has no `layout` field to migrate later — replay
  only needs the persisted `spaces`/`edges` snapshot, not a layout id to
  rebuild them from — so adding a second floorplan later is additive: a
  second room/door table in `board.ts`, a toggle in the setup screen, nothing
  to retrofit on games already in flight.

### 17.4 State and command surface

The grid is **6 rows (the d6) × 8 columns (the d8)** — §3's component table and
its dice design note state the same 48 spaces in opposite orders, so `board.ts`
fixes the convention once and the coordinate mapping and the CSS grid both read
it from there.

```ts
{
  ruleset: 'family' | 'experienced',
  difficulty: 'recruit' | 'veteran' | 'heroic',
  layout: 'a' | 'b',
  spaces: {                       // 48 interior + the 32-space exterior perimeter, one array
      threat: 'none' | 'smoke' | 'fire',
      poi: { id: number, revealed: boolean } | null,   // identity redacted until revealed
      hazmat: boolean,
      hotspot: boolean,
  }[],
  edges: { kind: 'wall' | 'door' | 'open', damage: 0 | 1 | 2, doorOpen: boolean }[],
  rescued: number,                // 7 wins
  lost: number,                   // 4 loses
  poiPool: boolean[],             // shuffled once at setup, drawn in order — redacted to a count
  firefighters: {
      ownerId: string,
      space: number,
      specialist: SpecialistId,
      apLeft: number,
      restrictedAp: { kind: 'command' | 'moveChop' | 'extinguish', left: number } | null,
      bankedAp: number,           // 0–4
      carrying: 'victim' | 'hazmat' | null,
  }[],
  activeFirefighter: number,
  engine: number, ambulance: number,
  hotspotReserve: number,
}
```

**There is no `damage` total.** The collapse clock is `sum(edges[].damage)`,
derived in `rules.ts` and in `gameStateToModel`. A stored total would be a
second source of truth mutated by every chop and every explosion, and the
marker-conservation test below would be asserting one against the other rather
than against the board.

**Restricted AP is one optional pool, not a pool system.** Only three of §11's
eight Specialists have one — Fire Captain (+2 command), Rescue Specialist (+3
move/chop), CAFS Firefighter (+3 extinguish) — and none has two, so a single
nullable `restrictedAp` covers all of them. One `spendAp(firefighter, cost,
actionKind)` in `rules.ts` decides which pool pays; every spend site already
knows its own action kind, so no action gains a "which pool" argument. Declaring
it now rather than at the Specialists step avoids changing a persisted schema
eight commits in.

**Edges are a flat array, not a keyed map.** The grid has a fixed 82 interior
wall segments (42 vertical, 40 horizontal), plus 28 openings onto the exterior
perimeter (one per face of every edge space) and the 32 segments joining one
perimeter space to the next — 142 in all. Number them once in `board.ts` and
index them, the way World Domination numbers its territories. The numbering is
**append-only**: a persisted game indexes its `edges` array by edge id and its
`spaces` array by space index, so a new kind of segment or space goes on the
end, and `rules.ts`'s `growBoardToCurrentLayout` (or `boardAtCurrentLayout`, on
read-only paths) appends the blanks for a game saved before it existed. A
`Record<string, …>` keyed by `"12-13"` would work and would be worse: it becomes `Schema.Types.Mixed`, the schema can't validate it, and it
invites two different key orderings for the same wall.

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
Time and Outbreak use. `{ kind: 'endTurn' }` banks up to 4 AP, runs Phase 2 and
Phase 3 inside the same `Execute`, advances `activeFirefighter`, and returns
`turnOver: true` only when the next figure has a different owner.

**`endTurn` being the only kind that consumes randomness is load-bearing**, and
not just tidiness: it is what makes the crew planner of 17.5 possible, since a
plan that never queues `endTurn` resolves no dice at all. Keep Advance Fire out of
every other kind, and out of `CheckEndTurn` — which runs during replay too, so a
fire lit there would burn inside a plan with no command accounting for it.

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

Left open is not left unbounded, though, and the re-roll is where that bit.
"Re-roll an invalid target" costs two recorded numbers a go, and on a late-game
board almost nothing is a valid target: Replenish hunting three clear spaces
could persist 386 rolls on one `endTurn` and then give up anyway, leaving the
board short of the POIs §7 requires. `rollValidTarget` (rules.ts) is that rule
written as the roll it actually is: gather the legal spaces, answer "nowhere"
without rolling at all, and otherwise roll *once* over them. `spaceForRoll`
maps d6×d8 onto the 48 interior spaces one-for-one, so re-rolling a pair until
it lands somewhere legal is a uniform pick among the legal spaces — the same
distribution, one recorded number instead of up to 384, and a placement that
always happens when one is possible. (The visible dice are unaffected: Advance
Fire still rolls and reports its own d6/d8. Nothing ever displayed a
placement's re-rolls.) The one thing to keep in mind is that a recorded value
is replayed positionally, so a log written by a different number of rolls per
placement no longer lines up — `rollValidTarget` clamps its pick for that
reason rather than indexing off the end of the list.

The dice are not the only randomness. The **POI pool is shuffled once** into
`initialSpecificGameState` and drawn in order thereafter, the way World
Domination's territory deal is — a pool reshuffled at each Replenish would be
unreplayable for the same reason, and `nextRoll` cannot express "draw the next
marker". The Experienced game's rolled setup (§6.2) lands there too.

**Redaction.** `gameStateToModel` sends an unrevealed POI as `{ revealed:
false }` with no victim flag, and the undrawn pool as a count. §10's design note
is explicit that hidden POI identity is what stops the game being a pure
logistics optimisation; leaving it in the response hands every player a
`Ctrl+Shift+I` cheat that deletes a design pillar.

### 17.5 Turn recap & planning

`docs/new-game.md` §7 wants this settled before step 1, and 17.4 has already paid
for most of it: the snapshot, the redaction and `nextRoll`'s recorded-roll cursor
are all replay decisions. This subsection records the three-column outcome for
the table in
[`turn-recap-and-planning.md`](../turn-recap-and-planning.md#per-game-status).

**Replay — yes**, from the `initialSpecificGameState` snapshot of 17.4, with
`recordedRolls` as the ordered cursor. The field name matters: the command route
strips every incoming `recorded…` property, because each `Execute` prefers a
recorded value over rolling fresh and a player could otherwise post their own
fire. `recordedRolls` is correctly named; something like `rollLog` would not be
covered.

**Recap — yes.** This game's away-time story is the strongest in the repo — the
fire advanced once per crewmate since you last looked — and step 2's `nextRoll`
design is what makes replaying it honest.

**Planning — yes, in two modes**, and unlike Outbreak it costs no schema change
and no new command class. 17.4 already puts AP on the firefighter
(`apLeft`/`bankedAp`) and already makes `endTurn` the separate command that runs
Advance Fire, which is exactly the shape planning needs. The general pattern is
[in the shared doc](../turn-recap-and-planning.md#planning-what-can-be-planned).

#### Mode 1 — the crew planner (fire frozen)

Queue any `FiresOutAction` for any figure, in any order, and stop short of
`endTurn`. Because the whole spending half of a turn is deterministic, the plan
resolves no randomness whatsoever: it answers "can this crew reach the two
victims in the east wing and still get out", which is the question §14.2's
quarterback problem is really about, and which no amount of table talk can compute.

Note that `activeFirefighter` (gap 3 in 17.2) makes stepping by *figure* and by
*player* the same feature here, so the crew planner and solitaire multi-pawn play
(step 12) share their UI rather than each inventing one.

**Say what it is:** with the fire frozen the plan shows a board that cannot
occur, because the fire advances once per figure in the real game. It is a reach
and AP calculator, not a forecast.

#### Mode 2 — one possible fire

Fires Out can do what Outbreak never can: queue `endTurn` too, and roll the fire.
A fabricated d6/d8 discloses **nothing**, because the dice are memoryless —
there is no stored ordering for a hypothetical to diverge from, so the planned
roll is a genuine sample rather than a peek. This is the honest version of the
"decoy" idea, and it is honest here precisely because the randomness isn't a
deck.

Two constraints:

* **The POI pool is a deck, not a die.** Replenish draws from the pool shuffled
  once into `initialSpecificGameState`, so a planned Replenish must draw a decoy
  from the pool's *remaining composition* (a known count of victims and false
  alarms) rather than the real next marker. Drawing the real one would hand the
  player the identity §10's design note exists to hide.
* **This mode puts client-supplied rolls on a live command class.** Planned rolls
  are recorded so stepping back and forth doesn't re-roll them, and
  `resolvedPlannedCommands` round-trips through the browser. The route's
  `recorded…` strip is what keeps that out of live play; the mode is unsafe
  without it.

Ship mode 1 first. Mode 2 is more impressive and less useful — one sample of a
fire is a poor guide to a plan, and the frozen calculator is what players will
actually reason with.

#### Cross-player planning

The timeline endpoint clamps planned `senderId`s to the caller, so planning a
crewmate's figure needs the same per-game route opt-in Outbreak describes
(`outbreak-gdd.md` §21.5). Fires Out qualifies for the same reason: 17.3 already
requires every crewmate's AP, Specialist and position to be visible to everyone,
so coordination never depends on the board's chat thread
(`docs/in-game-chat.md`). Nothing about a planned crewmate turn is hidden
from the planner in live play either.

### 17.6 The commits

Each step leaves `npm run build`, `npx tsc --noEmit` and `npm test` green and is
reviewable on its own. From step 5 the game is playable by hand.

**1 — The two shared co-op steps.** `outbreak-gdd.md` §21.6 steps 1 and 7:
extract one `finishGame()` and put the `teamwin`/`teamloss` outcome inside it
(including the `$cond` aggregation in `getPlayerStats` that duplicates
`outcomeFor()`) — **this half has landed**, as
`src/utils/games/finishGame.ts` — and let the cron resolve a timeout by
executing the game's own pass command through a per-game registry. If Outbreak got there first, skip the
engine work — but Fires Out still registers its own timeout command,
`FiresOutAction { kind: 'endTurn' }`, which it can only do once step 4 exists.
**Both halves have landed**: Outbreak built the registry, and Fires Out's
adapter is registered alongside its own in `turnTimeout.ts`. No new command
kind was needed — `'endTurn'` already *is* the pass, and it is the only command
that runs §7's Phase 2 and Phase 3 and syncs `currentTurn` to
`activeFirefighter`, so one of them per stalled figure is the whole fix.
`src/games/FiresOut/turnTimeout.test.ts` covers it: the turn advancing figure
and player together, the fire resolving with its rolls recorded for the recap,
a forced Advance Fire ending the game, one advance per figure for a player
holding two, and gap 3's deadlocked game reporting `'stuck'` rather than being
papered over. Such a turn is one only its owner can take, so `resolveStalledTurn`
reports `'declined'` — the adapter ran nothing — and the cron banks the missed
turn against `MAX_CONSECUTIVE_MISSED_TURNS` and restarts their timer: three of
them and the game is abandoned like any other its player walked away from. (It
used to bank nothing at all: the count was incremented in memory and dropped
with the unsaved document, so such a game was swept every tick forever and
never ended. `src/utils/games/turnTimeout.test.ts` covers declining against
the other thing an adapter can fail to do — get `'stuck'` after commands have
already run, which is thrown away rather than banked — and
`src/app/api/cron/turntimer/route.test.ts` holds the sweep to both.)
Still worth folding in: `turnOrder.findIndex(to => to === currentTurn)`
followed by a modulo is copy-pasted in five places — and gap 3 turned out
*not* to add a sixth, since `'endTurn'` delegates the advance to
`CheckEndTurn` — so one `nextInTurnOrder(gameState, currentTurn)` helper still
retires all five.

**2 — Board data and pure rules.** `src/games/FiresOut/board.ts`: the board as
a space and edge table, the d6/d8 coordinate mapping, the exterior perimeter
(a full ring round the building — the numbered strips above and below it and
the dice strips down either side, all walkable and all parkable), the display
grid that ring and the interior share, and the printed Family setup. §17.3's
deviation note explains why this ships one layout rather than both. `rules.ts`
alongside it is the whole fire system as pure functions — §9.1's four-row
table, explosion radiation with shockwaves, flashover to fixpoint,
knock-downs — taking a
`nextRoll` callback rather than calling `DiceRoll` itself, which is what makes
it both replayable and testable. Server-free, so the client can import it to
show what an action costs and what is reachable (`docs/new-game.md`,
"Isomorphic rules modules"). Ships with tests: a shockwave crosses a burning
corridor and damages the wall at the end of it, a smoke-filled wing flashes over
in one step, and 24 damage markers end the game.

**3 — Setup, wiring, and the game type.** `FiresOutModels.ts` (both
discriminators, `buildInitialFiresOutState`, `gameStateToModel` with the
redaction above), `apiModels.ts`, `meta.ts` with `available: false`,
`POST /api/newgame/firesout`, and the setup screen — `GameSetupLayout` +
`UserInviteList` (`src/components/UserInviteList.tsx`, driven by `usePlayerList`)
+ `TurnTimerSelect`. No board-side or ruleset picker yet — one layout exists
(§17.3's deviation) and the ruleset is Family-only until step 8; an
`OptionSection` of `OptionToggleRow`s is the place for both once there's
something to pick between. `meta.categories` claims `Strategy` and `Co-op`
(adding `Co-op` to `GAME_CATEGORIES` in `src/utils/ui/games.ts` if Outbreak
hasn't).

`FiresOutLogic.ts` has to exist by the end of this step, not step 4:
`gameRegistry.test.ts` discovers games by the presence of `meta.ts` and then
demands the barrel export `@/games/FiresOut/FiresOutLogic`, and `CreateGame`
needs `FiresOutGameType` anyway. So this step ships that file with
`FiresOutGameType` and a skeleton `FiresOutAction`, and step 4 fills the action
in. Then the rest of the shared-file wiring of `docs/new-game.md` step 6 —
`mongodb.ts` is four separate edits, and the `registration` array in
`command/route.ts` takes an entry per command class *and* one for the game type,
so it is revisited whenever either changes. Family game only, at this step: no
hazmat, hot spots, vehicles or Specialists.

**4 — The AP economy and actions.** The turn's spending half: 4 AP plus banking,
move, move-into-fire, carry, doors, extinguish, chop, POI reveal and rescue, and
an `endTurn` that for now only banks AP and advances the figure. The win
condition (7 rescued) goes in `CheckGameOver` here; nothing can be lost yet,
which is the point — the AP economy is the subtlest part of this design and is
worth testing while nothing is fighting back.

**5 — The board screen.** A 6 × 8 CSS grid inside `ag-board-frame`, walls drawn
as cell borders and doors as gaps, threat markers as smoke/fire pips, POIs as
"?" tokens, firefighters as pawns coloured by `playerColour()`. The chrome is
the shared kit re-tinted under a `.ag-game--firesout` scope, never rebuilt —
`GameShell`, `Stat` for the rescued/lost/damage tracks, `ActionButton` and
`ag-actionsheet` for the AP spend picker, `ag-log` for the history,
`GameOptionsMenu`, `GameFinishBanner`, `useGameData`, `useSubmitCommand`,
`usePushEvents`, `useEndGame`. The crew roster that 17.3 says has to replace
table talk **is `GameScoreboard`**, not a new component: one entry per
firefighter, `sub` carrying the Specialist and banked AP, `score` the AP left,
`isActive` the figure whose turn it is. Snakes & Ladders' grid is *not*
reusable — `.ag-sl-grid` is literally `repeat(10, 1fr)` and `.ag-sl-cell--snake`
is that game's art — which is why this one is new and scoped. The d8 face from
gap 4 lands here, in `DieFace`.

**6 — Advance Fire, Replenish POI, and the end conditions.** `endTurn` grows its
second half: the d6/d8 roll, §9.1's resolution, explosions and shockwaves,
flashover to fixpoint, knock-downs, lost POIs, then Replenish. The two losses
(§5) report through step 1's `teamloss`. This is the commit where the building
starts fighting back and the Family game becomes the complete design in
miniature; everything after it is content.

**7 — Advance Fire on screen.** The fire is the antagonist (§2) and a player
returning after a day away needs to see what it did, not read a log line. The
d6/d8 roll through the shared `Dice`, then the affected spaces highlighted in
sequence. Snakes & Ladders' `SnakesAndLaddersRollResult.tsx` is the precedent —
`Dice` with `rolling`, a timed settle onto the real value, then the reveal — and
if the sequencing turns out to be the same in both games, extract it then rather
than guessing now. Deliberately its own step: it is the one piece of this game
that is pure presentation, and the easiest thing to cut if it is bundled with
something load-bearing.

**8 — Hazmat, hot spots and the Experienced setup.** The rolled setup of §6.2
including initial explosions and their wall damage, the three difficulty tiers,
hazmat detonation, and flare-up chaining through `nextRoll`. The switch is the
`ruleset` field on `specificGameState`, read by `rules.ts` — one two-valued
string, which is the whole mechanism; Settlements & Cities' `expansions.ts` is a
five-expansion compatibility framework and would be a costume here. This is the
step that makes the game replayable (§14.4) and where the recorded-roll cursor
earns its keep.

**9 — Vehicles.** Engine and Ambulance parking, driving with riders, the
ambulance as the rescue destination, and the deck gun's quadrant-and-roll
targeting. Small, self-contained, and needed before two of the Specialists mean
anything. One thing about the rescue destination is worth spelling out, because
it isn't always a move that reaches it. The Ambulance being *driven to* a
firefighter holding a victim delivers them, exactly as walking to the Ambulance
does (12.2's repositioning is why: a rescue point that moves can arrive rather
than be arrived at) — and so does the fire knocking a carrier out of the
building, since §10.3 keeps the victim in their arms and §10.2 makes every
exterior space a rescue point in the Family game. All three go through one
`deliverCarried` (`FiresOutLogic.ts`), which also disposes of a carried hazmat
on the same terms, rather than one rule per way of arriving.

**10 — Specialists.** All eight at once, chosen at setup, swappable at the
Engine for 2 AP, expressed in `rules.ts` as AP-pool values and rule exceptions
rather than branches sprayed through `Execute`. The `restrictedAp` field and
`spendAp()` from 17.4 are already in place, so this step is mostly a table of
eight rows plus the four abilities that aren't AP arithmetic (Imaging remote
reveal, Paramedic escort, Hazmat on-site disposal, Driver/Operator re-roll).

**11 — Recap, stats, ship.** `recap.ts` plus a replay adapter and
`useTurnRecap`/`useTurnNavigation`/`TurnNavControls` on the board screen, with
`canPlan={false}` for now. This game's away-time story is unusually strong — the
fire advanced once per crewmate since you last looked — and step 2's `nextRoll`
design is what makes replaying it honest. Result stats need all four pieces in
`GameResultData.ts`: the schema
def, the `FiresOutGameResult` discriminator, `computeFiresOutResultStats`
(rescued, lost, damage placed, turns survived, ruleset and tier) and
`formatFiresOutResultStats` wired into `GAME_RESULT_STATS` — miss the formatter
and `formatGameResultStats` returns an empty array and the result page renders
nothing, silently, with no test failing (`gameRegistry.test.ts` checks the
`compute*` half only). Then flip `meta.available`, add the "What's new" line to
`src/utils/ui/whatsNew.ts`, and fold 17.3's deviations into this document.

*Landed.* Replay needed no new snapshot machinery: `initialSpecificGameState`
and `buildInitialFiresOutStateFromGameData` already existed from step 3 (§17.4
decided this was a snapshot-replay game — the Family fire cluster and the POI
shuffle are both creation-time randomness — before there was a step 2 to build
around it), so the adapter registered in `replay.ts` is two lines pointing at
what was already there. `plannableCommands: []`, same as every other
unbuilt-planning game — §17.5 already worked out that Fires Out qualifies for
*both* patterns once a UI exists (deck freeze **and** decoy, the one row in
`turn-recap-and-planning.md`'s per-game table marked "both"), but that's steps
13/14's job.

`src/games/FiresOut/recap.ts` exports `firesOutRecapAdapter`. Per §7, the
away-time story is the fire, not the crew's own choices, so `toEvents` leans on
`IFiresOutEndTurnOutcome.advanceFire` — already the fully-resolved summary of
one endTurn's chain of Advance Fire and any flare-ups (§9.4), built by
`applyEndTurn` in `FiresOutLogic.ts` — rather than re-deriving it from a
snapshot diff, the same shortcut World Domination's recap takes for its
battles. The crew's own good news (a POI flipped face up, a rescue, a hazmat
cleared, a Specialist swap) is read straight off each command's own `kind`/
`target`/`specialist` fields instead: unlike Outbreak's cube counts, a move's
`target` already names the one space that matters, so no whole-board diff is
needed. Doors, extinguishing, chopping, driving and the deck gun are this
game's equivalent of a Catan road — routine enough to stay silent. `tip` points
at a revealed victim still waiting to be carried out, falling back to a hazmat
left on the board.

Result stats are the four pieces `GameResultData.ts` needs, added to
`FiresOutModels.ts` alongside the invitation/state machinery already there:
`IFiresOutGameResultStats`/`firesOutGameResultStatsSchemaDef`,
`computeFiresOutResultStats` (rescued/lost straight off the final state,
damage via `rules.ts`'s own `totalDamage` rather than a second total — §17.4's
"never a stored total" applies here too — and turns lasted by counting
`kind === 'endTurn'` in `commandHistory`, since `endTurn` is the one command
type that ever appears there for a passive figure and the only one §17.4 lets
consume randomness) and `formatFiresOutResultStats`. One game-wide stat group
with no per-player breakdown, the same shape Outbreak's and Solitaire's own
summaries use since a co-op table shares its result. Wired into
`GAME_RESULT_STATS` under the `FiresOut` key.

The board screen picked up `useTurnNavigation` + `TurnNavControls` and
`useTurnRecap` + `TurnRecapScreen`, gated on `recap.show` before the normal
board render — the same shape Outbreak uses — plus a "Show last recap" row in
the options menu when `recap.hasRecap`. `isMyTurn` now gates on `nav.isLive`
rather than a bare `true`, which is what makes every existing submit handler
(move, door, extinguish, chop, drive, deck gun, treat, dispose, crew change,
end turn) automatically read-only while reviewing, with no per-handler change
needed. `recapAvailable` is `true` from the moment a game is created (the
snapshot is written in `CreateGame`, not earned by playing), so "Review
actions" is offered before anyone has taken a turn — unlike every other
snapshot-replay game in the repo, which only reaches this state well into a
match. `meta.available` is `true`, `GameLibrary` now lists Fires Out for real,
and `src/utils/ui/whatsNew.ts` has its "New games" line. §17.3's deviations
were re-read against this step's diff and none of them changed — solitaire,
crew planning, the Fire Captain's own-turn-only command AP and the single board
layout are all exactly as shipped in steps 3-10; no new deviation surfaced.

This step's rulebook review caught one real step-3 gap, invisible until now
because it only bites once real invites flow: `src/utils/ui/games.ts`'s
`NAME_TO_URL` (the friendlyName → slug fallback `metaForGame` uses when only
`gameType.friendlyName` is known, not `url`) had no `"fires out!"` entry, so
the lobby screen, the home screen's incoming-invites list and the invite push
notification all silently lost Fires Out's art/tagline/share-card image for
any invite that reached them without a `url`. Fixed alongside this step
rather than left for the next report to rediscover.

An `e2e/specs/firesout-turns.spec.ts` proves the pipeline this step wires up
end to end — invite, accept, take a live turn each, dismiss the Advance Fire
payoff screen, and confirm "Review actions" is offered from the first turn —
following `snakesandladders-turns.spec.ts`'s shape. `src/games/FiresOut/
replay.test.ts` follows Train Time's `replay.test.ts` precedent: a passive
game (every figure just ends its turn) replayed with `Math.random` stubbed to
throw, `buildEventFeed` exercised on a real command log, and
`computeFiresOutResultStats` checked against the final state.

**12 — Solitaire, optional.** Multi-pawn control, closing gap 3 with the
`activeFirefighter` design 17.2 describes — no duplicate entries in `turnOrder`,
so every `findIndex` in the repo stays correct and a solo game can still take a
real turn timer. The turn timer is the one thing to settle about a solo game
and the cron, because the two halves of this paragraph disagree: a solo board
is one where every figure is the same player's, so the timeout adapter declines
the turn (there is nobody to hand it to) and the sweep banks a missed turn
instead of forcing a fire — which is the right answer for a board only its
owner can move, and after `MAX_CONSECUTIVE_MISSED_TURNS` of them the game is
abandoned like any other walked away from. **With the hardcoded
`UNLIMITED_TURN_TIMER` below, none of that ever runs**: `actionableTurnFilter`
excludes unlimited games by construction, so a solo game is never swept, never
warned and never abandoned — it simply waits. Both are defensible; the step has
to pick one, and offering the timer is what makes the declining path worth
having.

The invitation is created with `userIdList: []` exactly as
Solitaire's `POST /api/newgame/solitaire` does, which makes
`/api/invite/accept`'s "has everyone accepted?" check vacuously true on the
first call. Per `docs/new-game.md`'s solo gotcha, the setup screen becomes
mode-dependent: solo hardcodes `UNLIMITED_TURN_TIMER` and drops both
`TurnTimerSelect` and `UserInviteList`, in favour of a crew-size picker.

**13 — The crew planner.** Mode 1 of 17.5, and cheap by this point: no schema
change and no new command, because AP already lives on the figure and `endTurn`
is already separate. `canPlan={!complete}`, planning actions that pick which
*figure* is acting, the route opt-in for cross-player planning, and one place
that refuses to queue `endTurn` — that exclusion is the entire safety argument,
so it wants a comment saying so rather than being spread across the action
picker. Deliberately after step 12: multi-pawn control and planning by figure are
the same UI problem, and doing them together avoids solving it twice.

**14 — One possible fire, optional.** Mode 2 of 17.5: `endTurn` becomes
queueable, planned rolls resolve through `nextRoll` and come back on
`resolvedPlannedCommands`, and a planned Replenish draws a decoy POI from the
pool's remaining composition rather than the real next marker. Last because it is
the least useful of the two modes and the one most likely to be misread as a
forecast.

### 17.7 Testing

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
