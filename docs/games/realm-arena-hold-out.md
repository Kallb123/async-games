# Realm Arena: Hold Out

Hold Out, the co-op mission where the team holds off the computer's
warbands, is Realm Arena's main mode, and its design has outgrown a few
sections of the game's design document. This doc holds what comes next for it.
The history of what's built stays in [`realm-arena.md`](./realm-arena.md): the
mission (§30.3), its waves and rallies (§30.10–§30.14), its battlefields (§30.9,
§35, §37), and the Swarm's elites, themed waves and nests in rules version 12
(§39). A bare § number below is this doc's own; one in the main design document
says so.

Every value marked *Proposed* is a starting point for the balance harness
([`realm-arena-balance.md`](./realm-arena-balance.md)), not a decision.

---

## 1. Why Hold Out needs rethinking

**What it asks.** On Normal a team musters once. Each Swarm warband musters
about 70 points, then four waves refill it, each bought with more points than
the last: about 530 points more per warband over the battle. Between waves the
team gets back only the rally: half its HP, one character back, or its items. So
the team's strength only shrinks and the enemy's keeps coming back. Hold Out is a
war of attrition, decided by how many enemies each team character takes down
before falling.

**What that does, measured.**

- **Winning by surviving (version 12).** The planner-played team wins about
  half its battles on Normal. It does so by hanging on: at round 12 a winning
  team has about one character left, and every win in the baseline came in the
  last round, never from beating the last wave early. Pulling back into the keep
  is the best play, and the last wave lands as the last round begins, so the
  Brood Queen barely acts.
- **Winning by clearing the field (prototyped and parked, §9).** It's all or
  nothing. Wins fall from about 100% at growth 5 to about 0% at growth 15 for
  teams of three and four. A team that falls one wave behind can't catch up, and
  Easy and Hard would be near-certain wins and losses.

**Why tuning numbers won't fix it.** Both results come from the attrition
itself, not from its numbers. The Swarm's costs (10–20 points against budgets in
steps of 10) make it coarse besides: one growth step is one or two whole
characters.

## 2. The plan in brief

Four changes, the first independent of the other three:

1. **The enemy's turn runs in the background (§3).** An End turn ends the
   player's turn and returns at once. The warbands then play on the server with
   a much longer time budget, and the next player is notified when they're done.
   It needs no rules change and helps version 12 today.
2. **The Brood, an enemy-only Swarm (§4).** The computer's own version of the
   Swarm: cheap, weak *minions* in numbers, real characters and elites among
   them, priced in a finer currency of their own. The playable Swarm is
   untouched.
3. **Break the Brood, keep the Shrine (§5).** The nests produce the enemy every
   round instead of in waves, and destroying them is how the team wins. The
   team also has something to defend, the Shrine, and loses if it falls.
4. **Stars (§6).** A win is graded from one to three stars, so the basic win can
   be generous while Hard players go for three.

All of §4–§6 is one new rules version, 13 (§8). Old battles keep their rules to
the end, as always.

---

## 3. The enemy's turn, in the background

### 3.1 Today

A player's End turn plays every warband turn that falls due before the next
player's turn, inside the same request (`handOff` → `warbandTurns`,
`RealmArenaLogic.ts`). The End turn command records the warbands' actions and
rolls (`recordedEnemyActions`, `recordedRolls`), so a replay never asks the
planner. Its outcome carries the warbands' turns, cut to what the sender saw in
fog (`outcomeFor`), for the board to play back at once.

The cost of that is time. The request waits for the planner, so each warband
turn stops planning after **two seconds**. Version 12's twelve-strong waves
already reached that deadline, and the release had to speed the planner up twice
to fit (`realm-arena.md` §39.9). A Brood of minions can't fit inside it at all.

### 3.2 The change

- **The warband's turn is its own command.** A server-only
  `RealmArenaWarbandTurn` (one warband, by index), built and stamped by the
  server as `PlayerDropped` is (ARCHITECTURE §7), and recorded in the command
  history like any move. It carries the recorded actions and rolls the End turn
  carries today, so a replay plays it without the planner. Its `Execute` is
  today's `warbandTurn` followed by the hand-off to whoever is next: a player,
  or another warband in a block of turns.
- **An End turn ends only the player's turn.** If a warband is due next,
  `currentTurn` becomes that warband's seat (`ai:k`) and the game is saved.
- **Who plays it.** Two runners, both calling one function,
  `playEnemyTurns(gameId)`. It loads the game and, while `currentTurn` is a
  warband's, runs one `RealmArenaWarbandTurn` through `runCommand` and saves.
  Each warband turn is saved on its own, so a stopped runner loses at most the
  turn in progress, which was never saved and is played again.
  - **First, at once:** in the command route's `after()`, once the End turn is
    saved, as the turn-end push and achievements are today.
  - **Backstop:** the turn-timer cron. A game whose `currentTurn` has been a
    warband's for over two minutes (*Proposed*) is a sweep candidate, and the
    sweep runs the same function. A warband's turn is never timed out as a
    player's is.
  - **If `after()`'s budget proves too short:** a dedicated route that declares
    its own `maxDuration`, as the crons do, called from `after()`, gives the
    warbands a fresh function to play in.
- **Two runners can meet.** Each save checks the document's version (the
  `trySave`/409 idiom). On a conflict the runner reloads, and stops if the turn
  has moved on. The function only acts while `currentTurn` is a warband's, so
  running it twice is harmless.
- **The time budget is stretched.** The two-second deadline becomes *Proposed*
  10 seconds a warband turn, with each runner's whole budget set below the
  function's limit. `planner.pace.test.ts` is held to the new budget.
- **Pushes follow the turn.** The `YourTurn` push and turn-end achievements go
  out when the turn reaches a player. That is now after the last warband turn,
  not after the End turn.

### 3.3 What the players see

- **The sender's End turn** returns at once, without the enemy's turn. While
  `currentTurn` is a warband's, the board says "The Swarm is moving…". It
  checks back every few seconds (`useRefreshableData`'s refresh), and plays the
  warband's turn from the history as it plays any other seat's turn, through
  the recap and review step that already show what happened since a player's
  last turn. Fog cutting moves with it: the warband command's events are told
  per viewer as the End turn's are today.
- **The dashboard** lists a game waiting on the computer as "The Swarm's turn",
  not as anyone's.
- **Solo** is where the wait is seen, since its player usually watches. The
  wait is the planner's time either way. The request no longer hangs while it
  runs, and the board says why it's waiting.
- **Everyone else** is already waiting for a push. It arrives a few seconds
  later than now, which in an async game nobody will notice.

### 3.4 Versions and replays

- **Command version 13.** An open tab built for an End turn that expects the
  enemy's turn in its outcome reloads.
- **No rules version.** Who plays the warbands' turn, and when, changes no rule.
- **Old battles replay as recorded.** An End turn from before carries its
  warbands' actions and replays as it did. From version 13, End turns carry none,
  and the warband commands follow them in the history. `buildTimeline` reads
  both.
- **Every co-op battle uses it:** Hold Out and Hold the Centre alike.

### 3.5 Tests

- An End turn hands to the warband and saves without playing it.
- `playEnemyTurns` plays one warband turn after another, saving each, and hands
  to the player, with one push sent.
- A runner stopped mid-turn leaves the game as it was, and the cron finishes
  the turn.
- Two runners at once play the turn once.
- A replay of a version-13 battle, and of an older one.
- Fog: what each viewer is told of a warband command.
- `hiddenHands.test.ts` covers the new command's null viewer.
- `gremlin` and `locksmith` passes: a new background path into a game's state,
  and a command no player may send.

### 3.6 What PR 1 settled

- **The warband's turn is `RealmArenaWarbandTurn`**, a server-only command
  (`gameCommands.ts`'s `SERVER_ONLY_COMMANDS`), its sender the computer's seat.
  It records `recordedActions` and `recordedRolls`, as the End turn's
  `recordedEnemyActions` and `recordedRolls` were. Outside a block it also
  plays the empty turns of any warband with only a burning nest that the
  rotation passed over (`realm-arena.md` §39.7), as the End turn did, since
  they need no planning. In a block each warband's turn is its own command.
- **What's due is stored**: `warbandDue: { warband, from }` on the battle,
  never sent. `from` is the player's seat the hand-off carries on from: the
  player who ended their turn, or the last seat round the table when the
  warbands take their turns in a block. The hand-off (`handOff`) is the one it
  was, stopping where it used to play a warband and picked up again by the
  warband's command from the same place, so the round, the wave, the rally and
  burning land exactly where they did.
- **One seat holds the computer's turn**, `ai:computer` (`COMPUTER_TURN_SEAT`),
  whichever warband's it is, rather than the warband's own `ai:k`: `currentTurn`
  and a command's sender are on the wire, and which warband's turn came round
  would tell a fogged team which warbands still stand.
- **Only a warband with someone standing takes the turn.** The empty turn of
  one with only a burning nest (`realm-arena.md` §39.7) is still played where
  it falls — inside the End turn, or the warband command before it — since it
  needs no planning, and handing it the turn would tell a fogged team a nest
  still stands and burns.
- **An End turn that hands to a warband is `turnOver`, even solo**, so
  `CheckEndTurn` gives the warband the turn. The warband's command is always
  `turnOver`, and after the last one the turn passes on from `from`, which in
  solo is the player again.
- **The engine stays game-agnostic.** A computer's seat is any `currentTurn`
  starting `ai:` (`COMPUTER_SEAT_PREFIX`, `src/utils/games/computerTurns.ts`),
  and a game that has them registers an `IComputerTurnAdapter` that builds the
  command for the seat on turn. The runner, `playComputerTurns`, knows no game.
- **The runner** is `playComputerTurns(gameId, { finishBy })`
  (`src/utils/games/playComputerTurns.ts`). It starts a warband turn only with
  `COMPUTER_TURN_BUDGET_MS` (30 seconds: the planner's guard, the save, and
  the turn-end push and judging) left before `finishBy`: the command route
  declares `maxDuration` 60 and hands it 50 seconds from the request's start;
  the cron its run's own deadline. A lost save reloads and carries on only
  while the turn is still the computer's, giving up after three. When the turn
  reaches a player it pushes them and judges turn-end achievements
  (`announceTurnEnd`, shared with the route) — in solo only when the wait ran
  past a minute, since the player otherwise watched it.
- **A computer's turn that can't be played** — refused, or throwing — is
  counted against its seat (`missedTurnCounts`) and put back two minutes, and
  the game is abandoned on the third in a row, with nobody to blame, rather
  than left on "The enemy is moving…" for good.
- **The backstop** sweeps a computer's turn that has stood two minutes
  (`COMPUTER_TURN_STALE_MS`), whatever the timer — solo's unlimited one
  included — through a branch of `actionableTurnFilter` and a new
  `{ complete, currentTurn, lastTurnTimestamp }` index, matching the one seat
  exactly. The sweep plays a
  timed-out turn's warbands too, rather than pushing nobody.
- **The planner's deadline** is 10 seconds a warband turn
  (`WARBAND_DEADLINE_MS`). `planner.pace.test.ts` keeps its tighter budgets on
  the planner's own time.
- **The board** says "{The enemy} is moving…" while a warband holds the turn
  and checks back every three seconds (`usePushEvents`'s `'fast'` poll), and
  fetches the recap again when the turn comes back to the viewer. The
  dashboard names the turn "The enemy's", and offers no nudge.
- **The review's dock** names a warband's command "The enemy · took its
  turn", never by its faction, which a random enemy keeps hidden.

---

## 4. The Brood: an enemy-only Swarm

### 4.1 Why apart from the Swarm

The Swarm is a faction players can muster, PvP included (`realm-arena.md` §32),
and Swarm characters earn mastery. Tuning it as Hold Out's enemy means tuning
the PvP faction too. **The Brood** is the computer's own version: the Swarm's art
and models, its own statlines and prices, in no player's faction list, and never
mustered, as the elites aren't (`realm-arena.md` §39.5). The playable Swarm, its
balance and its mastery stay as they are. Whether the Swarm stays playable can be
decided once the Brood has been played.

### 4.2 Two numbers

Each Brood character has the two numbers every character has, and one more:

- **`points`:** what a knock-out of it scores (`realm-arena.md` §13.7), and what
  the planner values it at. These have to stay apart from its price, or every
  retune moves the score race and the planner's choices too.
- **`threat`:** what producing it costs, in steps of 1. A Skitterling is 1
  where today it's 10 points, so a tuning step is a tenth of a character.

A Brood minion is worth very little to the planner, so the planner spends minions
freely. That recklessness is how a swarm should play.

### 4.3 Minions

**`minion: true`.** A minion has 1 HP and no armour, and anything that does it
damage downs it: a blow, a blast, a burst, a burning or poison tick. A miss is
still a miss, and the board draws no HP bar for one. A Thunder or an Ice Ball
that hits a minion downs it, so its stun or slow never matters.

This is what makes area abilities matter: one Fireball can clear a pack. It also
keeps single-target abilities for the real characters and the elites, the job
the elites were added for in the first place.

| Character | Kind | Move | Weapon | Threat | Points |
|---|---|---:|---|---:|---:|
| Skitterling | minion | 8 | Claws: melee, 2 | 1 | 2 |
| Spitter | minion | 5 | Acid spit: 70%, range 12, 2, corrodes | 2 | 3 |
| Bloater | minion | 4 | Barbs: melee, 1; bursts as it falls (3, corrodes) | 2 | 3 |
| Ravager | real, 9 HP | 5 | Scything talons: melee, 4; Rend | 5 | 10 |
| Broodmother | real, 8 HP | 5 | Talons: melee, 3; Regrowth (a nest or a real one) | 5 | 10 |
| Bile Lobber | elite, as in version 12 | | | 10 | 40 |
| Carapace Brute | elite, as in version 12 | | | 12 | 50 |
| Brood Queen | elite, as in version 12; Hatch makes minion Skitterlings | | | 15 | 60 |

All *Proposed*. The art is the Swarm's: each Brood character names the Swarm
character it's drawn as, so no sprite rows are added.

### 4.4 How many on the field

**`HORDE_CAP`**, *Proposed* 16 minions per warband, beside at most four real
characters and elites. A team of three can then face about 60 figures, which is
the cap's real limit. Three things to check before the cap is set:

- **The phone screen:** can the player still read the board?
- **Rendering:** measured with `npm run ra-bench`, on the isometric board and
  the 3D one (`docs/realm-arena-rendering.md` §2).
- **Playback:** a warband turn played one action at a time gets long (§4.5).

### 4.5 How minions plan

Minions don't run the planner's search. Real characters and elites plan as now,
with their temperaments (`realm-arena.md` §39.8). Minions take a **swarm step**:
one pass, in id order, with no search.

- **Something in reach:** strike the most hurt team character it reaches, or
  the Shrine (§5.2) if no character is in reach. A Spitter shoots the nearest
  one it sees.
- **Nothing in reach:** step toward its goal along the path. The goal is the
  nearest team character its side sees, or else the Shrine.
- **A Bloater** walks toward the most team characters inside its burst.

It's deterministic, and it reads the warband's view only, as the planner does.
It costs microseconds a minion, so the time §3 buys goes to the characters that
need it.

**Playback.** A warband's minions move together: their steps play as one beat on
the board, and their strikes follow one after another, quickly.

### 4.6 Hidden information

- Minions are fighters, so fog hides them and remembers them as ghosts like
  anyone else.
- Characters a nest produces are told as hatchlings are (`realm-arena.md`
  §39.5): only to a viewer who sees the nest, and only as much as they see.
- A warband's threat, banked or spent, is server-only.
- A `croupier` pass is due.

### 4.7 What PR 2 settled

- **The catalogue.** `catalogues/v13.ts` is registered in `RULESETS` and is
  not current: `CURRENT_RULESET_VERSION` stays 12 until PR 5. Tests build their
  battles at 13 through `rulesVersion`.
- **The Brood is the faction `brood`**, `computerOnly`: it is in no list a
  player picks from (`FACTION_IDS`, `isFactionId`, Random's draw). A battle
  finds it through its own catalogue (`factionById`, `factionOf`), never
  today's. Its characters have ids of their own: `broodSkitterling`,
  `broodSpitter`, `broodBloater`, `broodRavager` and `broodBroodmother`, named
  as the Swarm's characters they're drawn as.
- **The elites, the themes and the nests move to the Brood in version 13.**
  The elites keep their ids, and a character is in one faction alone, so
  version 13's Swarm is the playable faction alone: its roster and its squads,
  with no elites, themes or nests. Hatch makes the Brood's minion Skitterlings.
- **Character data** gains three fields, each absent before version 13:
  `minion`, `threat` and `drawnAs`.
  - `isMinion` (`rules.ts`) is read wherever a minion differs. Any damage takes
    it to 0 HP, in `wound`, so a burning or poison tick downs it too. It wears
    no armour (`armourOf`, `damageTo`). `healRefusal` refuses it: "A minion
    can't be healed". The board draws no HP bar over it (`hasHpBar`).
  - `drawnAs` keeps the Brood off the sheets. `ART_CHARACTER_IDS` leaves its
    characters out, so the sheets are byte-identical. `artCharacterOf` answers
    the art, the 3D model and a shot's missile through it.
- **Threat, until nests produced the Brood.** The Brood is a `horde`: it is
  bought, never mustered, so its `readyMade` is empty. In PR 2 `hordePurchase`
  bought in each character's `threat`, as `wavePurchase` buys in points: the
  elite first, then the theme's list round and round, never more than
  `HORDE_CAP` (16) minions or `HORDE_REAL_CAP` (4) others, and `waveOf` held a
  landing wave to the same caps. Until PR 3 made the nests produce it (§5.6),
  the Brood mustered and landed its waves on version 12's schedule, each
  spending the points the Swarm's would have had, a threat for every
  `POINTS_PER_THREAT` (5). PR 3 removed that bridge, and `hordePurchase` with it:
  `hordeSpawn` buys the starting horde and what the nests produce (§5.6).
- **The swarm step** is `swarmAction` (`swarm.ts`). At the start of each
  warband turn the minions step first, all of them, then strike, all of them.
  Only then does the planner plan the real characters (`nextAction` passes over
  minions). Both kinds of action are recorded in one list, so a replay never
  asks either.
- **Playback.** A review merges a warband's run of minion moves into one part,
  and its run of minion strikes into another (`partsOf`). A run of walks by
  different characters in one part sets off together, and a run of strikes
  follows one after another at a quicker step (`timeline`).
- **Still to measure** (§4.4): whether a phone can read the board with the full
  horde, and `ra-bench` with one. Both belong with the balance in PR 5, before
  `HORDE_CAP` is set.

---

## 5. The mission: break the Brood, keep the Shrine

Hold Out keeps its name and its place on the setup screen, so the achievements
that read "win Hold Out" still mean what they say. Rules version 13 changes what
it asks.

**Hold Out is the Brood's alone, for now.** Under version 13 the setup screen
offers Hold Out with no choice of enemy: it is always the Brood. The Renegades
and the Miners stay enemies for Hold the Centre. Version-12 battles against them
play to their end as they were. That also retires the random enemy from Hold Out
(`realm-arena.md` §29.3), and with it everything that withheld the wave's name,
the nests' squares and the next-wave line while the enemy was unseen.

### 5.1 Nests produce the enemy (A)

- **Every round, not in waves.** At the start of each warband turn, every
  standing nest adds `SPAWN_THREAT` threat to its warband (*Proposed* 3, rising
  by 1 every four rounds). The warband spends it at once on its theme's buy list.
  What it buys stands on free squares next to the nest, chosen as Hatch chooses
  them (`hatchSquares`), and acts from the warband's next turn.
- **Themes by round.** The Rush in rounds 1–4, the Bile in 5–8, the Brutes in
  9–12, the Queen from 13. The themes' buy lists from version 12 carry over,
  repriced in threat.
- **Elites on a schedule, more of the early ones.** Each elite arrives in its
  round from a standing nest, and how many arrive depends on the elite
  (*Proposed*):

  | Round | Elite | How many |
  |---:|---|---|
  | 5 | Bile Lobber | One for each warband with a nest standing |
  | 9 | Carapace Brute | One for every two such warbands, rounded up |
  | 13 | Brood Queen | One, from the warband with the most nests standing |

  Ties go to the lowest seat. With one warband, as in Solo, every row is one.
  A warband with no nest standing contributes no elites, so destroying nests
  early is how the team keeps the Queen from ever arriving. The count is data
  on the faction's schedule (`eliteSchedule`: `perWarbands`, or a number per battle), so it is
  tuned like any other value.
- **Destroyed for good.** No nest regrows. Every nest down permanently slows
  the enemy, so the momentum runs in the team's favour.
- **Two nests a warband**, *Proposed* 15 HP each. **Their squares are the
  ruleset's.** `catalogues/v13.ts` lists the nest squares and the Shrine's square
  for every Hold Out map, even where they start as copies of the map's own
  (`BattlefieldMap.nests`, `realm-arena.md` §39.7). A battle reads its sites from
  its own rules version, so a version-12 battle keeps the map's nests whatever
  later happens to them, and moving a nest is a new rules version rather than an
  edit to a map in play. `maps/holdOut.test.ts`'s checks (two to a warband, near
  the edge, reachable, out of sight on the first turn, clear of the placements)
  walk every catalogue's sites. Whether the raid is too far is measured (§7).
- **The first muster.** Each warband starts with its nests and a starting horde
  of *Proposed* 10 threat. The team musters as it does today.

### 5.2 The Shrine (B)

- **Something to defend.** The Shrine is a structure on the team's side, on one
  square in the keep, listed for each Hold Out map by the ruleset (§5.1).
  It is built on the nests' rules (`isStructure`): it can be hurt by anything
  that hurts a character, and it never acts or moves.
- **HP:** *Proposed* 20 plus 10 for each player.
- **Friendly fire counts.** A structure takes damage from anything, the team's
  own Fireball included, as anyone standing in a blast does. Fighting in the
  keep is a risk to the Shrine.
- **No ability heals it.** The rally gains a fourth choice, **Mend**: half the
  Shrine's HP back (§5.3).
- **The Brood goes for it.** It is the minions' goal when they see no team
  character (§4.5). For the planner, every HP of it is worth what the team's
  side loses: *Proposed* 3 points' worth an HP.
- **The team splits.** Some of the team guard the Shrine and some raid the
  nests. With two to four players, that split is a natural division of roles to
  talk over.

### 5.3 The rally

The rally has always come with a wave, and there are no waves now. The team
**earns** a rally at two kinds of moment:

- **On a schedule:** as rounds 5, 9 and 13 begin (*Proposed*), the rounds the
  elites arrive in, so a team that is struggling to raid still recovers.
- **Each time a warband is broken**, meaning its last nest falls. This rally
  rewards raiding.

**Spacing.** A rally is **taken** only as a round begins, and never in two
rounds running. At each one, every player chooses, as in `realm-arena.md`
§39.4: Rally, Reinforce, Resupply, or now Mend.

- **None is lost.** A rally earned while one can't be taken is banked, and is
  taken as the first round begins that it can be. So breaking a warband the
  round before a scheduled rally is never wasted: the team takes one rally in
  round 5 and the other in round 7.
- **A warband broken mid-round** earns its rally at once. The rally is taken as
  the next round begins, so every player's choice still comes at the start of
  their turn, as it does today.
- **Ending with rallies banked** loses nothing that matters: the last nest
  falling ends the battle, and so does the cap.
- **The scoreboard** says when a banked rally comes: "Rally next round" or
  "Rally in round 7".
- **The state** keeps how many rallies are banked and the round of the last
  one taken. Both are public: everyone saw what earned them, nearly always
  (§5.6).

### 5.4 Winning and losing

- **Won the moment the last nest falls.** The Brood breaks. Whatever of it
  still stands scatters: it leaves the board, and nobody scores for it, so the
  team doesn't have to clear the field. This is the ending that shortens a
  battle the better the team plays.
- **A bonus for breaking it early.** The team scores points for each round
  left before the cap, shared evenly among its players, in the result's points
  race. As always in Hold Out, the score doesn't decide the result
  (`realm-arena.md` §30.3), but it ranks the team's wins against each other, and
  **a faster win must outscore a slower one with more knock-outs.** So a round's
  bonus is set above the most a round of fighting can score: the knock-out points
  of everything every nest the battle started with can produce in a round, at its
  latest, largest `SPAWN_THREAT`. That is *Proposed* 60 points a round to begin
  with (50 fell short for four, §5.6), and a test holds the bonus above that bound for every team size, so a
  retune of the spawning can't quietly undo it.
- **Won at the round cap**, if the Shrine still stands: **15 rounds**, for every
  team size, Solo included. Holding the keep is still a win, just the smallest
  one (§6).
- **Lost** the moment the Shrine falls, or when every team character is down.

### 5.5 The Renegades and the Miners, later

Hold Out is the Brood's alone until it has been played (§5). If the Renegades or
the Miners come back to it, the mission is the same against them, with a
producing structure of their own named by their faction's data: a war camp, a
mine head. They have no minions, and their ready-made squads' characters are
produced at a threat equal to their points. The random enemy would then come back
too, with the structures' squares withheld while the enemy is unseen, as the
nests' are today.

---

### 5.6 What PR 3 settled

- **Where nests produce the enemy** is `nestsProduce` (`rules.ts`): Hold Out,
  under rules with `SPAWN_THREAT`. Every rule below asks it, so version 12's
  Hold Out, waves and all, is untouched. No wave lands (`waveOf` is empty) and
  there is no next-wave line (`nextWaveOf`).
- **Hold Out is the Brood's** through the rule `HOLD_OUT_ENEMY`:
  `buildInitialRealmArenaState` stores it whatever the host chose, and drops a
  random draw (`holdOutEnemy`). The setup screen hides the enemy picker under
  it. Hold the Centre keeps the host's choice.
- **The sites are the ruleset's**: `RULES.HOLD_OUT_SITES`
  (`catalogues/holdOutSitesV13.ts`), by map id, for all eight maps Hold Out is
  fought on. The nests are literal copies of the maps' own. The Shrine stands on
  no muster or nest square, so it never meets a mustered character: on the
  middle-out maps the most central free square of the keep, on the line maps
  the square just in front of the team's zones. On the Sacked Fort the keep is
  open, so the Brood's longest sight (25) sees the Shrine from its zones; its
  square is no secret, so that is allowed and pinned (`maps/holdOut.test.ts`).
- **Spawning** (`spawn`, at the start of each warband turn, after its burning):
  each standing nest adds `spawnThreatOf` the round to the warband's banked
  threat (`threat`, server-only). It is spent on the round's theme
  (`spawnThemeOf`: one every `SPAWN_STEP_ROUNDS`) by `hordeSpawn`: the buy list
  in order, round and round, **stopping at the first it can't afford**, so a
  Ravager is saved up for rather than passed over, and skipping what the caps
  leave no room for. What's left is banked, never more than the list's dearest:
  threat the caps leave nothing to spend on is lost. Each buy stands on the
  square Hatch would pick by one nest after another (`standByNest`), at 0 AP. A
  buy with no room isn't made, and its threat stays banked. A warband with only
  nests standing still takes its turn (`warbandFights`), so its nests produce.
- **The elites** are the faction's `eliteSchedule`, as rounds 5, 9 and 13
  begin (`eliteArrivals`). The themes no longer carry an elite. Scheduled elites
  are not held to `HORDE_REAL_CAP`: a warband of four Ravagers would otherwise
  keep the Queen away for good. One with no free square by any of its warband's
  nests doesn't come, and isn't owed later. No line tells their arrival, since who fields
  one says whose nests still stand. The theme's change is told to everyone ("The
  Bile begins").
- **What fog still gives away** (a `croupier` pass, §4.6). Three channels
  remain, each accepted for now rather than closed:
  - **Fighter ids.** Every spawn and elite takes the next id (`nextFighterId`),
    and ids are on the wire, so the gap between two spawns the team sees counts
    what was made out of its sight. That can tell a watching team whether an
    unseen nest stands, rebuild a warband's banked threat, and show an elite's
    arrival. Waves and hatchlings have always left the same gaps
    (`realm-arena.md` §27.2, §39.5). Closing it means ids that don't count,
    which is a change to every command that mints a fighter, so it is left for a
    plan of its own.
  - **A rally for a broken warband** announces its last nest's fall, even one
    nobody of the team saw: a burn tick at the warband's turn start, or the
    Brood's own burst or bile. The rally is taken publicly the next round, so
    the fall can't be hidden without hiding the rule. §5.3's "everyone saw what
    earned them" is true of the schedule and of most breaks, not all.
  - **`enemiesDefeated`**, sent mid-battle, counts Brood deaths nobody saw, as
    it always has. Minions fall to anything, the Brood's own blasts included,
    so it ticks more often now.
- **The Shrine** is a structure owned by `SHRINE_OWNER` ("shrine"), which
  `battleFrom` puts on the team's side after the seats and the warbands. It is
  no seat, so no turn, rally, drop-out or squad reaches it. Its burning or
  poison ticks as each round begins. Every side's view holds it (`viewOf`),
  since its square is the ruleset's. Downing it scores nothing (a knock-out
  worth 0 points writes no `scored` event). Its HP is `SHRINE_HP` plus
  `SHRINE_HP_PER_PLAYER` a player, on the fighter as `maxHp`. To the planner it
  is worth `hpWorth` (3) points an HP. Minions and the planner's characters make
  it their goal when they see no team character, and minions strike it when no
  team character is in reach.
- **Rallies** are `ralliesBanked` and `lastRally` on the battle. One is earned
  as each of `RALLY_ROUNDS` begins, and as each warband's last nest falls
  (`noteBroken`, written after the line that felled it). One is taken as a round
  begins if any is banked and none was taken as the last round began
  (`beginRound`), so the team owes its choices as in version 12. The response
  carries `rally: { banked, next }`, with `next` the round the next is taken in
  (`nextRallyOf`), for "Rally next round" or "Rally in round 7". **Mend** is the
  rally's fourth choice, offered only where there is a Shrine, and available
  while it stands hurt: half its HP back, as a Rally gives a character.
- **The ending** (`broodEnding`): the team's loss when nobody of it stands (as
  before) or the Shrine falls; its win when every nest is down, or once
  `HOLD_OUT_ROUNDS` (15) are played. Breaking the Brood (`breakTheBrood`, once,
  as the battle ends) removes whatever of it still stands, and gives each player
  still in the battle an even share of `ROUND_BONUS` (60) for each round left.
  60, not the 50 proposed: with four warbands, the round-5 Lobbers (one a
  warband, 8 points each) and eight nests at round 15's threat make a round
  worth up to 51.2 points. `rulesets.test.ts` holds the bonus above that bound
  for every team size.
- **Left for PR 4:** the result. The battle record still counts arrivals and
  rallies on version 12's wave schedule (`battleRecord.ts`), and the result's
  wave chart reads it. The stars, the guide's and the tutorial's copy, and the
  achievements are PR 4's too. Built (§6.1).

---

## 6. Stars (D)

- **Win or lose stays as it is.** The result, stats and every achievement read
  as now. A win also carries **stars**, one to three, stored on the result's
  Hold Out record:
  - ★ **Held:** the team won. The Shrine stood to the end.
  - ★ **Broke the Brood:** every nest fell before the round cap.
  - ★ **Unscathed:** the Shrine ended above half its HP.
- **Difficulty becomes stars.** Easy, Normal and Hard move `SPAWN_THREAT`, nest
  HP and the Shrine's HP by small steps. The win itself can stay generous on every
  difficulty, while the stars carry the challenge.
- **On screen.** The result shows the stars with the reason for each. The
  scoreboard shows the nests left and the Shrine's HP throughout.
- **Achievements:**
  - New: *Three Stars* (any Hold Out) and *Three Stars on Hard*.
  - *Broken Tide* (which needs waves) and *Scorched Earth* (which needs nests
    to regrow) take new criteria in place: breaking the Brood by round 10, and
    breaking it with nobody of the team down. Their ids stay. Nobody has earned
    either, so nothing needs to depend on the rules version. A version-12 battle
    still in progress at the change simply can't earn them. *Broken Tide* is
    older (`realm-arena.md` §30.4), so confirm in the database that nobody has
    earned it before changing it; no admin page shows it.
  - *Regicide* keeps its meaning. The Queen only arrives while a nest stands in
    round 13, so earning it now means letting her come.
  - A `rulebook` pass is due against `docs/achievements.md`.

### 6.1 What PR 4 settled

- **Stars** are `HOLD_OUT_STARS` (`rules.ts`): `held`, `broke` and
  `unscathed`, each named and explained by `HOLD_OUT_STAR_INFO`, which the
  board, the log, the result and the guide all read. `holdOutStars` reads them
  off the battlefield as a win ends: Held for the win; Broke the Brood for
  every nest down, which ends the battle the moment it happens, so only ever
  before the cap; Unscathed for the Shrine above half its HP (exactly half
  isn't). `awardStars` keeps them on the state (`stars`) as a won Hold Out
  ends, after the Brood breaks, and logs "The team earns 2 of 3 stars: …". A
  loss has none, and a version-12 battle never does.
- **On the wire.** `stars` only on the finished response. `nestsLeft`, how many
  nests still stand over every warband, to every viewer throughout the battle,
  fog or not, for the scoreboard. It is a fourth channel beside §5.6's three,
  accepted as `enemiesDefeated` is (a `croupier` pass). What it gives a fogged
  team that they didn't have: a nest falling out of their sight that isn't its
  warband's last (a burn or poison tick as its warband's turn begins, the
  Brood's own burst or bile, a blast of the team's reaching past its sight),
  told on the next fetch after the command that felled it rather than guessed
  from fighter ids; and so, subtracting the falls they saw from the public
  nest squares, often which nest it was, and the Brood's spawn rate. It gives
  no nest's HP, square or warband, and nothing of the horde: the banked threat
  stays the server's. Closing it would mean counting only the falls the team
  has seen, which needs a memory of sightings per team. The Shrine's HP needed
  nothing new: every view holds it.
- **The difficulty's steps** are `HOLD_OUT_DIFFICULTY` in the ruleset, read
  through `holdOutDifficultyOf`: Easy −1 threat a nest a turn, nests 3 HP
  weaker and the Shrine 10 HP stronger; Hard the opposite; Normal nothing
  (*Proposed*). A nest's HP is set on the fighter as `maxHp`, as the Shrine's
  is, so a version-12 nest is untouched. Version 13's Hold Out has no use for
  the warbands' points budget, so the setup screen describes the steps
  instead. `rulesets.test.ts` holds the round bonus above a round's fighting
  on Hard, whose nests produce the most.
- **The scoreboard** for a version-13 Hold Out is the round, the nests left
  ("3/4"), the Shrine's HP and the team's health, in place of the enemies
  defeated. A won battle shows its stars under the finish banner
  (`RealmArenaStars`), earned and missed, each with what earns it.
- **The result.** The battle record (`battleRecord.ts`) no longer counts a
  version-13 battle on version 12's wave schedule: each of `waves` is a stage
  of the horde (`produced`), starting as the theme changes, so its arrivals
  and rallies are the stage's. It also keeps the Shrine's HP and the nests
  standing at the end (`shrine`, `nests`). The result's Hold Out group leads
  with how it ended (overrun, the Shrine fell, broke the Brood, or held to the
  cap), then the stars with their reasons, then what took the field, what was
  downed and how many nests fell, the rallies, and each stage ("The Rush, from
  round 1: 23 arrived, 19 downed"). The stars are copied from the state, not
  the replay, so a result whose replay failed still has them. The charts name
  stages by their theme ("Enemies downed by stage", "The Bile begins").
- **Achievements**, ids kept: *Three Stars* (`realmarena.three-stars`) and
  *Three Stars on Hard* (`realmarena.three-stars-hard`), read off `stars` and
  `difficulty`. *Broken Tide* is breaking the Brood by the end of round 10
  (`BROKEN_TIDE_BY_ROUND`, fixed rather than read off `HOLD_OUT_ROUNDS`, so
  PR 5's balance should revisit it; `round` on the finished response is the
  round the battle ended in), and *Scorched Earth* breaking it with every
  character of the team standing. Like the copy, the catalogue switches on the
  current ruleset (`achievementsFor`): until version 13 is released it holds
  version 12's *Broken Tide* and *Scorched Earth* and no *Three Stars*, so no
  profile shows an achievement nobody can earn, and `nestsCleared` stays on
  the response for version 12's *Scorched Earth*. PR 5 deletes the version-12
  branch, `nestsCleared` with it. *Regicide*'s description drops "of the
  Swarm", since the Queen is the Brood's from version 13; its meaning is
  unchanged.
- **Before PR 5 releases** — the moment *Broken Tide* and *Scorched Earth*
  change in place — confirm in the database that nobody has earned either
  (`AchievementUnlock` rows for `realmarena.broken-tide` and
  `realmarena.scorched-earth`). *Scorched Earth* shipped with version 12, and
  *Broken Tide* long before, so this is a real check, not a formality: an id
  someone holds needs a new id rather than new criteria (`docs/achievements.md`
  §11). No admin page shows it.
- **PR 5's What's new line** names the stars, *Three Stars* and *Three Stars
  on Hard*, and what *Broken Tide* and *Scorched Earth* ask now.
- **The result's schema** declares `produced`, `shrine`, `nests` and `stars`,
  so a result recorded before them reads them back absent.
- **Copy that waits for the release.** The guide's co-op section
  (`coopText`, `brokenBroodText`), the setup screen's Hold Out, battlefield and
  difficulty lines, and the tutorial's new *Break the Brood* step all switch on
  whether the **current** ruleset's nests produce the enemy
  (`nestsProduce("holdOut")`), so today's players still read version 12's. Each is
  built from the rule values it's given, and `holdOutCopy.test.ts` renders it
  at version 13. PR 5 deletes the version-12 branches. The tutorial's step
  stands on the stat row (`breakTheBrood`) and reads version 13's round cap,
  since only a version-13 battle raises it. *The centre* is now shown only in a
  battle that has one (`centre`), which is live at once: version 12's Hold Out
  no longer points at a centre it doesn't score. Nothing else of this PR is
  seen before PR 5.

---

## 7. Balance and measuring

- **Targets on Normal**, for the planner-played team: a win (★) in 70–85% of
  battles, two stars in 35–55%, three in 10–25%. Easy and Hard each move them by
  about 15 points.
- **The slope first.** Before tuning, check that one step of `SPAWN_THREAT` moves
  the win rate by under 15 points. If it moves more, the mission still behaves
  like an all-or-nothing war of attrition, and must be fixed before it's tuned.
- **The harness's team has to raid.** Today the team's planner never walks to a
  nest (`realm-arena.md` §39.7), so it would never break the Brood and every
  battle would end at the round cap. Two steps:
  - First, a scripted policy in the harness: each player's two fastest
    characters raid the nearest standing nest, and the rest guard the Shrine.
  - Later, the team's planner gets an objective term of its own.
- **Hand-offs.** Battles end at the round cap or before it, so a Hold Out is
  never longer than today's and often shorter. The harness reports the round
  each battle ended in, as it does now.
- **Rendering** with a full horde, through `npm run ra-bench` (§4.4).

## 8. PRs and versions

| PR | What | Versions |
|---|---|---|
| 1 | The enemy's turn in the background (§3) — **built** (§3.6) | Command 13 |
| 2 | The Brood: minions, threat, the swarm step, playback (§4) — **built** (§4.7) | Rules 13, unreleased |
| 3 | Nests that produce, the Shrine, Mend, the rally's two triggers, the new ending and its bonus, Hold Out against the Brood only (§5) — **built** (§5.6) | Rules 13, unreleased |
| 4 | Stars, the result, achievements, the guide and setup copy (§6) — **built** (§6.1) | Rules 13, unreleased |
| 5 | The harness's raid policy and star report, a full-horde bench, balance, the database check, deleting version 12's branches, release, What's new (§7, §8.2) | Rules 13 released |

PR 1 stands alone and ships first: it gives version 12's warbands their time back
today. PRs 2–5 follow `realm-arena.md` §39.1's pattern. The catalogue
`catalogues/v13.ts` is registered but not current until PR 5, so each PR may
still edit it, and tests and the harness fight at version 13 through
`rulesVersion`. One "What's new" line, written by the last PR, covers the lot.

### 8.1 Questions

*Answered on review:*

1. **The Shrine** is its name, and it is one square.
2. **The rally** is earned on a schedule as well as when a warband is broken,
   and is taken only as a round begins, never in two rounds running, with none
   lost (§5.3).
3. **The Brood's scattering** scores nothing. Breaking it early earns a bonus
   for each round left, large enough that a faster win outscores a slower one
   with more knock-outs (§5.4).
4. **Minions and status effects:** a minion hit by anything that does damage is
   downed, whatever else the hit would have done (§4.3).
5. **The round cap** is 15 for every team size (§5.4).
6. **Hold Out is the Brood's alone** for now (§5, §5.5).
7. **Elites** depend on the elite: a Lobber a warband, a Brute every two
   warbands, one Queen (§5.1).
8. **The nest and Shrine squares are the ruleset's**, even while they match the
   maps' (§5.1).
9. **Friendly fire** hurts the Shrine, as it hurts everyone (§5.2).
10. **Solo** keeps both jobs: its player has more time and every character
    (§5).
11. **The numbers** are found by trying them, once the harness's team can raid
    (§7).
12. **Achievements** change their criteria in place, since nobody has earned
    them (§6).

*Still open:*

1. **The playable Swarm:** kept beside the Brood, or retired? To revisit once
   the Brood has been played.
2. **The background runner's budget:** whether `after()` gives the warbands
   enough time, or they need their own route (§3.2). Measured once PR 1 runs in
   production, which it now does (§8.2).

### 8.2 PR 5's list

PRs 1–4 were checked against §3–§6 before PR 5 began. All of it was built,
except that the rally sheet still opened every rally with "A fresh wave has
landed". It now names the rally the team earned wherever there is a Shrine
(`rallyReason`, `rally.ts`). What PR 5 has to do, beyond what §7 says:

- **The harness (`npm run ra-balance`).**
  - *The raid policy* (§7) comes first. A trial run at version 13 (Solo and
    two players, two battles each) ended every battle at the round cap, so
    tuning without it would tune a mission nobody can win early.
  - *Stars in the report.* §7's targets are star rates, and the report has no
    column for them. It needs each battle's stars (Held, Broke the Brood,
    Unscathed), how often the Brood was broken and by which round, and the
    Shrine's HP at the end. The endings line also needs to tell the Shrine
    falling apart from the team being overrun.
  - *`--enemies` is meaningless for Hold Out at version 13*: `HOLD_OUT_ENEMY`
    makes every Hold Out the Brood's, so the default run fights the same
    battle once per faction under three labels ("vs Swarm" and so on). Under
    rules with `HOLD_OUT_ENEMY`, the harness should fight Hold Out once,
    labelled the Brood, and keep `--enemies` for Hold the Centre.
  - *What `--set` can't reach.* It already takes every numeric rule
    (`RULES.SPAWN_THREAT` for the slope check of §7, `STARTING_HORDE`,
    `SHRINE_HP`, `ROUND_BONUS` and the rest) and any character's HP
    (`CHARACTERS.nest.hp`). It can't change a character's `threat` or
    `points`, or `HOLD_OUT_DIFFICULTY`'s steps, which the Brood's prices and
    Easy and Hard are tuned by. Widen it to those, or tune them by editing the
    catalogue between runs.
- **Rendering with a full horde** (§4.4, §4.7). Every `ra-bench` fixture is a
  version 12 Hold Out (`bench/realmarena/fixture.ts` builds against the
  Renegades). Add a version 13 fixture with every warband at `HORDE_CAP`,
  measure it on the isometric and 3D boards, and check a phone can still read
  the board before `HORDE_CAP` is set.
- **Balance**, to §7's targets, then revisit `BROKEN_TIDE_BY_ROUND` (§6.1)
  against the round a good team breaks the Brood in. Record the runs in
  [`realm-arena-balance.md`](./realm-arena-balance.md), in a version 13 section
  of their own.
- **The database check** (§6.1). Before *Broken Tide* and *Scorched Earth*
  change, look for `AchievementUnlock` rows for `realmarena.broken-tide` and
  `realmarena.scorched-earth`. If anyone holds either, that achievement needs a
  new id rather than new criteria. It needs production access: no admin page
  shows it.
- **Delete version 12's branches**: the guide's (`guide.ts`), the
  achievements' (`achievementsFor`), the setup screen's and the tutorial's
  copy that switch on the current ruleset's `nestsProduce("holdOut")`.
  `nestsCleared` comes off the **response** only. The state field stays: a
  version 12 battle still in progress at the release reads it until it ends
  (`RealmArenaLogic.ts`, its nests regrowing).
- **Release**: `CURRENT_RULESET_VERSION` to 13 (`rulesets.ts`). No command
  version bump should be needed (`docs/command-versions.md`): an old tab's
  setup screen still offers an enemy for Hold Out, which the server already
  ignores under `HOLD_OUT_ENEMY`, and no command means anything different.
  Check that against the diff before releasing.
- **What's new**: one line for the lot (§6.1 says what it names).
- **Open question 2** (§8.1) can be answered now that PR 1 is live: search the
  production logs for "stopped short of time" (`playComputerTurns.ts`), the
  warning a runner logs when `after()` ran out before the warbands finished.

---

## 9. Parked: Hold Out to the last enemy (was `realm-arena.md` §41)

Moved here from the main design document, with its own sections renumbered
from §41.n to §9.n. Every other § number in it refers to
[`realm-arena.md`](./realm-arena.md).

*Plan; nothing built. Prototyped and measured (§9.4): parked.* A review of version 12 before anyone played it found
that the last wave hardly fights. A team of two to four plays 13 rounds, and
the waves land in rounds 4, 7, 10 and 13, so the Queen's wave lands as the last
round begins. Each warband then gets one turn before the team wins by still
standing. The Brood Queen lands in her warband's zone, out of the team's sight,
and moves 4. Her hatchlings start with 0 AP, so they never act. The biggest
wave of the battle (170 points a warband on Normal) does next to nothing, and
*Regicide* can only really be earned in Solo, which lasts 15 rounds. More
broadly, a team wins Hold Out by never leaving the keep, which is the problem
nests (§39.7) were built to work around.

This plan changes what winning Hold Out means instead: **the team wins by
downing the last wave**, and the waves are a round further apart to leave time
for it.

### 9.1 The rule

- **Four waves, every fourth round.** Waves land as rounds **5, 9, 13 and 17**
  begin. Until now the number of waves came from the battle's length. Now
  there are always four, one for each of the Swarm's themes (§39.6), and
  against the Renegades and the Miners too.
- **The team wins once the last wave is down.** From round 17, the team wins
  the moment no enemy character stands. Hatchlings count; nests don't. They
  are structures, not combatants (`isCombatant`, §39.7). Surviving the rounds
  no longer wins anything.
- **The team loses when everyone is down**, as before, **or at the cap**.
  Players who never stop playing need a battle that ends: a Queen hiding in
  fog and hatching, a Spitter backing away. At the end of round
  `HOLD_OUT_MAX_ROUNDS` the battle is lost: "the Swarm held the field". The
  cap is set from the measured length (§9.4), so a battle the planner can win
  almost never reaches it.
- **`WAVE_GROWTH_POINTS` goes back to 15.** Version 12 raised it to 25 because
  a team that only had to survive won nine battles in ten. A team that has to
  clear the field is facing a much harder task (§9.4). At 15, each nest's 15
  points (`NEST_POINTS`) is one growth step again, as §39.7 designed it.
- **Nests don't regrow with the last wave.** After it there is no wave left for
  them to shrink, so a nest left standing is just scenery. Destroying one
  before round 17 is still the only way to make the final fight smaller.
- **The rally is unchanged:** each player chooses once after every wave
  (§39.4).
- **Hold the Centre, duels and free-for-all are untouched.** Only Hold Out's
  ending and its wave schedule change.

### 9.2 What it fixes, and what it costs

- **The last wave plays out.** The Queen gets as many turns as the team needs
  to down her, and her hatchlings fight. Getting to her through her brood is
  the final fight the themed waves were built to end on.
- **Staying in the keep stops being enough.** The team has to go out
  eventually, so the nests, which sit near the edge, become part of the plan
  rather than a side trip. The rule pays for that trip directly: every nest
  destroyed before round 17 is one fewer character in the final fight.
- **Clearing up between waves doesn't shrink the next one.** A wave refills
  its warband to the purchase (§39.6), so a field the team has cleared gets the
  whole wave, and survivors only add to it. The extra round between waves
  doesn't mean fewer enemies. It gives the team a round to rally, regroup and
  fight one wave at a time rather than two at once, and that is what it should
  be measured for. Nests are the only thing that shrinks a wave.
- **Battles get longer.** This is the price, and the reason it is measured
  before anything is built. Version 12's Hold Out for two to four is 13 rounds.
  This one is at least 17 plus however long the final fight takes, and an async
  battle's length is counted in hand-offs (§4).
- **Fog is harder.** The last enemies have to be found. The Sunken Village in
  fog was already almost unwinnable for the planner's team (§39.9), and making
  the team hunt down the last characters only makes that worse.

### 9.3 Engine

- **Rules are data.** `catalogues/v13.ts`, with `RULES`:
  - `WAVE_EVERY: 4`
  - `HOLD_OUT_WAVES: 4`
  - `HOLD_OUT_TO_THE_LAST: true`
  - `HOLD_OUT_MAX_ROUNDS`
  - `WAVE_GROWTH_POINTS: 15`

  Each is absent before version 13, where the wave interval is today's 3, the
  battle's length sets how many waves come, and surviving wins.
- **The schedule reads the rules.** `WAVE_EVERY` is a module constant in
  `rules.ts` today. `waveArrives`, `wavesLanded`, `nextWaveRound`,
  `lastWaveRound` and `waveThemeOf` take the battle's context. Every caller
  already has the game state, except `battleRecord.ts`, which is handed the
  rules version it already receives. The last wave is
  `1 + WAVE_EVERY × HOLD_OUT_WAVES`.
- **The length is the cap.** Under the new flag, `battleRounds` gives Hold Out
  `HOLD_OUT_MAX_ROUNDS`. Everything that reads the length then sees the same
  number: the ending, the record's rounds, the setup line and the harness's
  turn limit. The round counter is the exception (§9.5).
- **The ending.** Under the flag, `holdOutEnding`'s `held out for all N rounds`
  becomes the cap's loss. `beat the last wave in round N`, which already
  exists, is the one way to win.
- **Nests.** `landWave` skips the regrowth on the last wave. `nestsCleared`
  (*Scorched Earth*) already requires a wave still to come, so it needs no
  change.
- **The planner** needs no new rules code: the warbands already hunt the team.
  §9.4 measures whether a last wave holds back for long enough to stall a
  battle. If it does, the planner-side fix is a *last stand*: once the last
  wave has landed, temperaments no longer reward Exposure (§39.8), and the
  Queen stops hanging back. This is planner behaviour, not a rule, and isn't
  versioned.
- **Command version 13** at release, so an open tab reloads before it reads a
  version-13 battle. The board's copy and wave line read the schedule, and an
  old tab would announce the old rounds.

### 9.4 Measured (prototype)

**These numbers stand alone.** The team wins a different way here, so a win
rate can't be set against version 12's. What can be compared is one
version-13 setup against another, fought on the same seeds and under the same
win condition. Each setup is read against fixed targets:

- **Win rate:** on Normal, the planner-played team wins about half to two
  thirds, with no cell under a quarter or over three quarters (§39.9's band).
- **Length:** the round a battle ends in, median and 90th percentile. This is
  the change's real cost, counted in hand-offs (§4).
- **Stalls:** how many battles reach the cap. Anything beyond a few means a
  last wave can hold out of reach, and the *last stand* (§9.3) is needed.

The harness copes with a battle past 13 rounds as it is. It reads the length
from `battleRoundsOf`, and its turn limit, its per-round tables and its
ended-round columns all scale with that length. The prototype fought to a
40-round safety cap with no change to the harness.

The prototype was an environment switch in a scratch checkout. It fought
every Hold Out cell on Normal without fog, seeds 1–40, waves every fourth
round, a 40-round cap, at growth 0, 5, 10 and 15. Growth 25 and waves every
third round were left unrun: growth 15 already lost nearly every battle.

| Cell | Growth 0 | 5 | 10 | 15 | v12 as shipped |
|---|---:|---:|---:|---:|---:|
| Solo, Ruined Fort | 100% | 92% | 60% | 30% | 45% |
| 2 players, gate fort | 100% | 100% | 62% | 25% | 80% |
| 2 players, Sacked Fort | 100% | 92% | 55% | 20% | 65% |
| 3 players, gate fort | 100% | 90% | 12% | 2% | 77% |
| 3 players, Sacked Fort | 97% | 85% | 7% | 5% | 30% |
| 3 players, Sunken Village | 100% | 77% | 12% | 0% | 22% |
| 4 players, Sacked Fort | 100% | 97% | 47% | 0% | 50% |
| 4 players, Sunken Village | 100% | 70% | 2% | 0% | 20% |
| Battles ending at the cap | 0 | 18 | 10 | 4 | — |

The last column is the same seeds under version 12, and it is there only for
scale: version 12 wins by surviving, so its win rates measure something else.

**What it says.**

- **Battles roughly double in length.** A win comes in round 19–23 at any
  growth, two to six rounds after the last wave lands, where version 12 ends at
  13. In hand-offs this is the change's cost, before anything else.
- **Growth 15 doesn't work.** The team gets through the waves (fewer than one
  in ten battles is lost before round 17), but it never clears the field. At
  growth 15, a team of three goes into the last wave with about 3 characters
  standing against about 27 enemies, and is overrun within two to four rounds
  of the Queen's wave landing. A wave refills its warband to the purchase
  (§39.6), so the stack the team must finally wipe out is about as big as the
  warbands can field, whatever the team did between waves.
- **The slope is a cliff.** Win rates fall from about 100% at growth 5 to about
  0% at growth 15 in every cell of three or four players. Either the team keeps
  pace and wins comfortably, or it falls one wave behind and is buried. Easy
  and Hard move the warbands' base budget by 10–20 points, more than the whole
  width of that slope, so they would be close to certain wins and certain
  losses.
- **No one growth fits every team size.** At 10, Solo and both two-player
  cells sit in the band (55–62%), and so does the four-player Sacked Fort
  (47%). The three-player cells and the four-player Sunken Village are at
  2–12%.
- **Stalls appear when the sides are evenly matched.** At growth 5 and 10, up
  to one battle in five ran to the cap (the four-player Sunken Village, at
  growth 5): the team and the Swarm grind with neither clearing the field. A
  real version would need the *last stand* (§9.3) or a firmer cap.

**Where that leaves the plan.** Needing a wipe to win does what it was meant
to do: the last wave fights, and the Queen with it. But tuning growth can't
balance it: the balance point is a knife-edge, and it sits at a different
growth for every team size. If this goes ahead, the snowball needs a lever of
its own before growth is tuned. The options:

- the last wave replaces each warband rather than adding to it;
- a much lower cap on how many characters each warband can have on the field;
- earlier waves' survivors withdraw as the last one lands.

The planner's team never goes after nests, so nests' part in shrinking the
final fight is still unmeasured. This was left here to explore another
direction.

### 9.5 Screens and copy

- **The round counter** reads "Round 9" with no "of 13", and from the last
  wave on, "Round 18 · last wave". Showing the cap would make it look like the
  goal.
- **The next-wave line** (§30.11) counts down to round 17 as it does now. After
  that it says what is left: "The last wave: 6 still standing". In fog that
  count is a ceiling, as the wave count already is (§39.6): the characters the
  team has seen fall, subtracted from what arrived. That is a hidden-information
  question, and a croupier pass is due.
- **The guide's** co-op section changes from "anyone still standing after the
  last round" to "down the last wave", with the new rounds and the cap. The
  setup screen's Hold Out line and the tutorial's Hold Out step follow.
- **The result** keeps its waves and its *Enemies downed by wave* chart. The
  lost detail "the Swarm held the field by round N" joins "overrun".

### 9.6 Achievements

Two achievements change meaning under the new ending. Ids are permanent and
existing earners keep theirs, so the criteria only change for version 13
battles:

- **Broken Tide** ("down every character of the last wave before the last
  round is over") becomes every win. In version 13 it becomes a race instead:
  *down the last wave within two rounds of it landing*.
- **Regicide** (a Brood Queen downed) becomes every win against the Swarm,
  since the Queen is in the last wave at every budget. In version 13 it
  becomes *down a Brood Queen before her first hatchling acts*.

A `rulebook` pass checks this against `docs/achievements.md`.

### 9.7 PRs

| PR | What |
|---|---|
| 1 | `catalogues/v13.ts` (unreleased), the wave schedule from the rules, the ending, the cap, no regrowth on the last wave. Tests below |
| 2 | Screens and copy: the round counter, the next-wave line after the last wave, the guide, setup and tutorial lines, the result's detail. Croupier pass on the count left |
| 3 | Balance at 200 a cell (every Hold Out cell, Easy, Normal and Hard, with and without fog, and against the Renegades and the Miners), the cap set from it, achievements (§9.6), release, What's new |

**Tests.**
- The schedule at version 13: waves in 5, 9, 13 and 17, and none after.
- The ending:
  - no win while an enemy stands, or a hatchling;
  - a win the moment the last falls;
  - a win with only nests left standing;
  - the cap's loss.
- No regrowth on the last wave.
- A version-12 battle still lands waves in 4, 7, 10 and 13 and still wins by
  surviving.
- A replay.
- `rulesets.test.ts` pins the new values and that nothing else of version 12
  changed.

### 9.8 Open questions

1. **What the cap gives.** A loss, as proposed, or a lesser result: "held,
   but didn't break them"?
2. **Every fourth round, or every third.** §9.4 measures both.
3. **The number in fog** after the last wave: a ceiling, as proposed, or
   nothing?
4. **The Renegades and the Miners.** Their waves grow by a character each
   (`waveStrength`), not by points, and were never retuned for having to be
   wiped out. They are measured in PR 3 before release.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Split out of `realm-arena.md`. The plan to rethink Hold Out: the enemy's turn in the background (§3), the Brood as an enemy-only Swarm with minions (§4), nests that produce the enemy and a shrine to defend (§5), and stars (§6). The parked plan for Hold Out to the last enemy moved here from `realm-arena.md` §41 (§9). |
| 0.2 | Answers on review (§8.1): the Shrine, one square; a rally on a schedule as well as when a warband is broken; the scattered Brood scores nothing, and breaking it early earns a bonus for each round left; minions hit by anything that does damage are downed; a 15-round cap for every team size; and Hold Out is the Brood's alone for now, so the Renegades' and Miners' structures are put off (§5.5) and the PRs are five. |
| 0.3 | The rally is earned on a schedule and when a warband is broken, and taken only as a round begins, never in two rounds running, with none lost (§5.3). The open questions are spelt out (§8.1). |
| 0.4 | More answers on review (§8.1): a bonus for each round left large enough that a faster win outscores a slower one, held by a test; elites counted by the elite (a Lobber a warband, a Brute every two, one Queen); nest and Shrine squares in the ruleset; friendly fire hurts the Shrine; Solo keeps both jobs; and achievements change in place. |
| 0.5 | PR 1 built (§3.6): the warbands' turns are `RealmArenaWarbandTurn`s from command version 13, played by the server once the End turn is saved, with the turn-timer cron as the backstop. |
| 0.6 | PR 2 built (§4.7): the Brood in rules version 13, unreleased, with its minions, threat and horde caps, the swarm step and its playback. Until nests produce it, it is bought in threat on version 12's waves. |
| 0.7 | PR 3 built (§5.6): nests that produce the Brood every round, the Shrine and Mend, the rally earned on a schedule and by breaking a warband, the new ending and its bonus (60 a round, not 50), and Hold Out against the Brood alone, all in rules version 13, unreleased. |
| 0.8 | PR 4 built (§6.1): stars kept as a won Hold Out ends and sent once it's over, the difficulty's steps for the spawn, the nests and the Shrine, the nests left and the Shrine's HP on the scoreboard, the result by the horde's stages, *Three Stars* and *Three Stars on Hard*, *Broken Tide* and *Scorched Earth* for breaking the Brood, and the guide's, setup's and tutorial's copy, live once version 13 is current. |
| 0.9 | PRs 1–4 checked against the plan before PR 5: the rally sheet no longer says a wave landed where there is a Shrine. PR 5's list spelt out (§8.2): the harness's star report and its one Brood scenario, a full-horde bench fixture, the database check, what of version 12 to delete and what to keep, and the runner's budget read from the logs. |
