# Realm Arena: Hold Out balance experiments

A record of what was tried to make *Hold Out* (docs/games/realm-arena.md
§30.3, §30.9–§30.11) winnable, and what each change did to the team's chances
in simulation. None of these rules has shipped. This file holds the numbers
and how each lever was built, so the next person tuning the mode doesn't start
from scratch.

Written October 2026, at command version 6 (growing waves and the rally
included).

## Why

A playtest of three players on Normal against the Swarm was overrun within a
wave or two. Both sides muster the same points, and the time to kill felt like
two hits. The balance harness (§30.12, `npm run ra-balance`) reproduced it:
across 144 battles the team won none.

## Method

- `npm run ra-balance` fights whole co-op battles through the command
  pipeline, with the computer's planner (§29.7) playing the team as well as
  the warbands.
- Every experiment is **Hold Out on the Sacked Fort, Normal difficulty and
  Normal size, no fog**, for teams of 2 and 3 against both factions, with **24
  battles per cell** on seeds 1–24, so each cell faces the same dice.
- **Read the cells as comparisons, not odds.** The planner plays the team by
  its own score with no plan, and people should do better. With 24 battles a
  cell's 95% interval is roughly ±20 points (0 wins is 0–14%, 12 wins is
  31–69%), so trust the large gaps rather than the small ones.
- Each cell is the team's win rate, then the average round it was overrun in
  when it lost. A 2-player battle lasts 15 rounds and a 3-player one lasts 13,
  with waves landing at rounds 4, 7, 10 and 13 in both.
- The levers were environment switches in a scratch copy of the rules, never
  committed (see *How each lever was built*). Repeating a run means
  re-applying them.

## Baseline

| Team | vs Realm | vs Swarm |
|---|---|---|
| Solo | 0% · r8.0 | 0% · r10.1 |
| 2 players | 0% · r8.8 | 0% · r9.8 |
| 3 players | 0% · r8.5 | 0% · r8.0 |

What the round-by-round tables showed:

- **The opening fight is lost before the first wave.** A 3-player team against
  the Swarm is down from 12 characters to about 4.7 by the end of round 4, and
  against the Realm to about 5.8. The waves only finish the job.
- **The time to kill is one enemy turn.** With 4 AP and an attack costing 2, a
  character attacks twice a turn. Melee always hits, so a Ravager (4 + 4, or
  Rend's 6 + 4), a Knight or Man-at-arms (4 + 4), or two Skitterlings take out
  an Archer, Scout, Mage or Cleric outright. Realm Archers hit 80% of the
  time from 20 squares.
- **Attrition only runs one way.** Each wave refills every warband and grows it
  by one. The team never gets anyone back: the rally (§30.11) heals only the
  standing, and a Cleric raises once.
- **Equal points means unequal bodies.** Against the Swarm, 80 points buys six
  characters to the team's four, so a 3-player team faces 18 to its 12 from
  the first turn, and more actions every round.

## The levers

| Lever | What it changes | Scope |
|---|---|---|
| **Restore *n*** | As each wave lands, up to *n* of each player's downed characters, lowest id first, stand back up at half HP (rounded up) on free squares of that player's deployment zone, with no effects and no banked AP. Applied after the rally, so they don't also get the rally's heal. | Hold Out |
| **Attack 3 AP** | An attack costs 3 AP rather than 2 (`ATTACK_AP`): one attack a turn, plus one move. | Every mode |
| **Armour 1** | Every hit an enemy lands on a team character does 1 less damage, never less than 1. | Hold Out (team only) |
| **Enemy −*n* steps** | Each warband musters, and its waves refill to, the ready-made squad *n* steps down the points ladder (`BUDGETS`) from today's. On Normal for 2 or 3 players, −1 is 70 points and −2 is 60. | Co-op |
| **No growth** | Waves refill each warband to its squad but no longer add a character a wave (§30.10 off). | Hold Out |
| **Waves every 4** | A wave every fourth round instead of every third (`WAVE_EVERY`). | Hold Out |
| **HP ×1.5** | Every character's HP × 1.5, rounded. | Every mode |

## Results

Win rate · average round overrun in, over 24 battles a cell.

| Change | 2p vs Realm | 2p vs Swarm | 3p vs Realm | 3p vs Swarm |
|---|---|---|---|---|
| **Today's rules** | 0% · r8.8 | 0% · r9.8 | 0% · r8.5 | 0% · r8.0 |
| *Fewer enemies* | | | | |
| Enemy −1 step | 0% · r7.3 | 0% · r11.3 | 0% · r6.7 | 0% · r9.1 |
| Enemy −2 steps | 0% · r7.4 | 0% · r10.9 | 0% · r9.2 | 0% · r10.9 |
| No growth | 0% · r9.0 | 8% · r9.1 | 0% · r8.2 | 0% · r8.5 |
| Enemy −2 steps + no growth | 0% · r8.4 | 17% · r12.4 | 8% · r9.5 | 8% · r11.1 |
| Waves every 4 | 0% · r8.7 | 4% · r9.2 | 0% · r8.6 | 0% · r8.5 |
| *Harder to kill* | | | | |
| HP ×1.5 | 0% · r9.7 | 0% · r10.3 | 0% · r8.8 | 0% · r10.8 |
| Enemy −1 step + HP ×1.5 | 0% · r8.9 | 0% · r12.4 | 0% · r9.3 | 8% · r11.3 |
| Attack 3 AP | 0% · r11.4 | 0% · r11.8 | 8% · r11.8 | 13% · r11.5 |
| Armour 1 | 0% · r11.2 | 8% · r13.4 | 0% · r10.4 | 33% · r11.7 |
| Armour 1 + waves every 4 | 0% · r10.3 | 17% · r12.9 | 0% · r10.5 | 38% · r12.1 |
| Armour 1 + attack 3 AP | 13% · r12.9 | 42% · r14.1 | 25% · r12.6 | 96% · r13.0 |
| *Downed characters return* | | | | |
| Restore 1 | 0% · r11.4 | 0% · r11.9 | 8% · r9.9 | 25% · r9.9 |
| Restore 2 | 0% · r11.5 | 0% · r12.8 | 4% · r11.0 | 42% · r10.6 |
| Restore 1 + enemy −1 step | 0% · r9.7 | 4% · r13.9 | 4% · r8.9 | 29% · r10.8 |
| Restore 1 + enemy −2 steps | 0% · r9.9 | 8% · r13.2 | 4% · r11.1 | 50% · r12.0 |
| Restore 1 + no growth | 0% · r11.7 | 33% · r11.4 | 13% · r9.8 | 46% · r10.2 |
| Restore 2 + enemy −1 step | 0% · r11.6 | 17% · r14.8 | 4% · r9.7 | 50% · r12.0 |
| Restore 1 + enemy −1 step + no growth | 0% · r11.5 | 75% · r15.0 | 0% · r9.6 | 58% · r11.5 |
| *Return plus harder to kill* | | | | |
| Restore 1 + attack 3 AP | 0% · r13.6 | 29% · r14.0 | 21% · r12.0 | 75% · r12.0 |
| Restore 1 + armour 1 | 4% · r12.3 | 38% · r15.0 | 25% · r11.6 | 96% · r13.0 |
| **Restore 1 + attack 3 AP + armour 1** | **13% · r14.8** | **92% · r15.0** | **79% · r12.2** | **100% · —** |

## What it says

1. **Fewer enemies alone does almost nothing.** Smaller warbands, waves that
   don't grow and slower waves win next to nothing, and the team is overrun no
   later. Two thirds of the team falls before round 4, so a smaller wave
   arrives too late to matter. Against the Realm, a warband one step smaller
   was overrun sooner, if anything (within the noise): the 70-point Realm
   squad swaps its slow Knight for a second, faster Man-at-arms.
2. **Slowing the killing is what moves the Realm.** HP ×1.5 barely registered.
   Attack 3 AP and armour 1 each helped, and together they took 3 players vs
   the Realm from 0% to 25%. The Realm's damage is a few big melee hits that
   always land, and only cutting how many land a turn touches that.
3. **Restoring a character is the best Swarm lever.** On its own it was the
   only single change that won against the Swarm (25% at one a player a wave,
   42% at two), and it compounds with everything else. It fixes the one-way
   attrition the mode is built on.
4. **Armour hits the factions unevenly.** Taking 1 off a Swarm claw or spit
   (2 damage) halves it, but takes only a quarter off a Realm sword or mace
   (4). So armour 1 swings the Swarm far more: restore 1 + armour 1 is 96% vs
   the Swarm and 25% vs the Realm for 3 players. Attack 3 AP is even-handed
   between the two.
5. **All three together** (restore 1, attack 3 AP, armour 1) is the first set
   that wins against both factions for 3 players (79% / 100%). It's too easy
   against the Swarm and still hard for 2 players against the Realm.
6. **Two players have it harder than three, with the same changes.** Check
   2p vs Realm in every row. A 2-player battle runs two rounds past the last
   wave (15 against 13), and the Sacked Fort for two splits the edge between
   two warbands rather than three. It's open which of the two matters; a
   2-player run with the last wave moved, or a 13-round battle, would tell.

## Where this points

- **Restore one downed character per player as each wave lands.** It's
  Hold Out-only, fits the mission's fiction (reinforcements reach the keep),
  is legible ("Bob's Archer rejoins the fight"), and helps the most on its
  own.
- **Pair it with something that slows the killing.** Attack 3 AP is the more
  even of the two but changes every mode, free-for-all included, so it wants
  its own playtest there. Armour 1 is Hold Out-only but favours the team much
  more against the Swarm. A Hold Out-only middle ground could be armour in
  the keep only, or armour against melee only, to temper the Swarm swing.
- **Then tune the enemy's size per faction and team size**, now that the team
  can last long enough for it to matter. Restore + armour + attack 3 AP is
  too easy against the Swarm, so try it with the Swarm's waves no longer
  growing, or the Swarm a step bigger.
- Every one of these is a rule, so it takes a command version, as growing
  waves (5) and the rally (6) did.

## How each lever was built

For re-running: each was an environment switch in a scratch worktree.

- **Restore *n*:** a `restoreDowned(gs)` in `RealmArenaLogic.ts`, called in
  `landWave` right after `rally(gs)`. For each seat, take the downed fighters
  it owns sorted by id, and move each onto a free standable square of
  `battlefieldOf(gs.map, gs.blasted).deployments[seatIndex]` with
  `hp = ceil(CHARACTERS[c].hp / 2)`, `effects = {}`, `ap = 0`, `banked = 0`.
  A real version would also log the line, record it for the recap, and say
  in fog who saw it.
- **Attack 3 AP:** `ATTACK_AP` in `rules.ts`. The planner and the board both
  read it, so nothing else changes.
- **Armour 1:** in `wound` in `rules.ts` (`act`), before the HP comes off: if
  the attacker is an enemy, the damage is above 0 and the target isn't a
  warband's, `damage = max(1, damage − 1)`. The planner's odds don't know
  about it, so it slightly misjudges hits on the team. A real version would
  put it in `shotOdds` and the strike preview too.
- **Enemy −*n* steps:** `DIFFICULTY_RUNGS[difficulty] − n` in
  `warbandBudget` (`characters.ts`), with `rung` clamped to the ladder.
- **No growth:** `waveStrength` with no extra characters.
- **Waves every 4:** `WAVE_EVERY` in `rules.ts`.
- **HP ×1.5:** every `CHARACTERS[c].hp` scaled and rounded as the table loads.

To compare a change properly, run the same scenarios on the base branch and
on the change with the same `--seed`, and with more battles than these:
`--runs 200` gives about ±7 points, which the *Realm Arena balance* workflow
manages in about a quarter of an hour across its runners.
