# Realm Arena: Hold Out balance experiments

A record of what was tried to make *Hold Out* (docs/games/realm-arena.md
§30.3, §30.9–§30.11) winnable, and what each change did to the team's chances
in simulation. Team HP ×1.5, the enemy −1 step, 1 armour against the Realm and
13 rounds for two players shipped for Hold Out, with melee at 80%, cover counted double against a shot from beyond 10 squares, the Mage Bolt at 80% to a range of 12 and the Cleric's new Heal and
Raise for every mode (see *Where this points*); restore, armour against the
Swarm and 3 AP attacks did not. This file holds the numbers
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
| **Team HP ×*k*** | The team's characters only have *k* times their HP (1.5, 1.75 or 2), rounded; the warbands keep theirs, Realm or not. Heals, Raise, the rally and a restore scale with the team's own full HP. | Hold Out (team only) |
| **HP ×*k*** | Every character's HP × *k* (1.5 or 2), rounded, on both sides. Heals, Raise, the rally and a restore scale with it, since they read full HP; damage, burning and the healing items don't. | Every mode |

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
| HP ×2 | 0% · r11.0 | 0% · r12.3 | 0% · r10.0 | 0% · r11.0 |
| Team HP ×1.5 | 0% · r12.5 | 8% · r13.0 | 17% · r12.6 | 54% · r12.1 |
| Team HP ×1.75 | 8% · r13.7 | 17% · r14.3 | 29% · r12.8 | 92% · r12.5 |
| Team HP ×2 | 21% · r14.4 | 50% · r13.8 | 42% · r12.7 | 100% · — |
| Team HP ×1.5 + enemy −1 step | 4% · r13.2 | 17% · r13.8 | 13% · r12.1 | 63% · r12.0 |
| Team HP ×1.75 + enemy −1 step | 4% · r13.4 | 50% · r14.5 | 29% · r12.6 | 88% · r12.7 |
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
| Restore 1 + armour 1 + enemy −1 step | 0% · r12.4 | 83% · r15.0 | 13% · r11.4 | 96% · r12.0 |
| Restore 1 + HP ×2 | 4% · r11.1 | 13% · r14.5 | 8% · r11.2 | 63% · r12.0 |
| Restore 1 + HP ×2 + enemy −1 step | 4% · r10.8 | 13% · r15.0 | 13% · r11.8 | 71% · r13.0 |
| Restore 1 + team HP ×1.5 | 17% · r14.5 | 50% · r15.0 | 83% · r12.8 | 96% · r12.0 |
| Restore 1 + team HP ×1.75 | 29% · r14.9 | 83% · r15.0 | 96% · r13.0 | 100% · — |
| Restore 1 + team HP ×2 | 50% · r14.8 | 100% · — | 100% · — | 100% · — |
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
   the Swarm and 25% vs the Realm for 3 players. Making the warbands a step
   smaller on top widens the gap: 2 players vs the Swarm go from 38% to
   83%, while vs the Realm they get nowhere (0–13%, if anything slightly
   worse, as with the smaller Realm squads in point 1). Attack 3 AP is
   even-handed between the two.
5. **All three together** (restore 1, attack 3 AP, armour 1) is the first set
   that wins against both factions for 3 players (79% / 100%). It's too easy
   against the Swarm and still hard for 2 players against the Realm.
6. **Doubling HP keeps two attacks a turn but helps less than it looks.**
   It does what it's meant to: a 3-player team against the Swarm still has
   8.9 characters at the end of round 4 rather than 4.7, and against the
   Realm 7.3 rather than 5.8. But it doubles the enemy's HP too, so the team
   takes twice as long to down each one while the waves keep their schedule.
   The exchange (enemy downed per team loss) barely moves, about 1.1 vs the
   Realm and 1.6 vs the Swarm for 3 players, as today. On its own it wins
   nothing; it only stretches the loss from round 8 to round 10–12. With
   restore 1 it starts to win, and with the warbands a step smaller too it
   reaches 71% against the Swarm for 3 players. That's still well short of
   attack 3 AP or armour, which tilt the exchange towards the team rather
   than slowing both sides alike. Against the Realm it stays at 4–13%.
7. **Doubling the team's HP alone is the strongest lever of all,** and keeps
   two attacks a turn. On its own it wins 42% vs the Realm and 100% vs the
   Swarm for 3 players, and 21% / 50% for 2: more than any other single
   change, and more than restore + armour + attack 3 AP together against the
   Realm. Unlike HP ×2 for everyone, it tilts the exchange: 3 players down
   2.2 Realm characters and 8.5 Swarm for each one they lose, against 1.1 and
   1.6 with everyone's HP doubled. A 3-player team still has 9.9 characters
   at the end of round 4 against the Realm (5.8 today) and 10.1 against the
   Swarm (4.7). **With restore 1 it overshoots:** 100% in every 3-player cell
   and 2 players vs the Swarm, with only 2 players vs the Realm still a
   contest (50%). That's the first set to beat the Realm reliably.
   **Stepping it down** with restore 1 kept, at ×1.5 and ×1.75, moves 2
   players far more than 3:

   | Team HP | 2p vs Realm | 2p vs Swarm | 3p vs Realm | 3p vs Swarm |
   |---|---|---|---|---|
   | ×1.5 | 0% | 8% | 17% | 54% |
   | ×1.75 | 8% | 17% | 29% | 92% |
   | ×2 | 21% | 50% | 42% | 100% |
   | ×1.5, enemy −1 step | 4% | 17% | 13% | 63% |
   | ×1.75, enemy −1 step | 4% | 50% | 29% | 88% |
   | ×1.5, restore 1 | 17% | 50% | 83% | 96% |
   | ×1.75, restore 1 | 29% | 83% | 96% | 100% |
   | ×2, restore 1 | 50% | 100% | 100% | 100% |

   Restore 1 is worth far more than a smaller enemy at every team HP: at
   ×1.5 it lifts 3 players vs the Realm from 17% to 83%, where a step
   smaller does nothing (13%). The smaller enemy helps only against the
   Swarm, and there only for 2 players at ×1.75 (17% → 50%) — against the
   Realm it changes nothing, as everywhere else in these runs (point 1).

   A 3-player team is near-certain from ×1.5, while 2 players need ×2 just
   for even odds against the Realm. No one multiplier fits both team sizes,
   so the 2-player gap (point 8) is now the bigger imbalance than the
   enemy's faction.
8. **Two players had it harder than three because their battle ran two
   rounds longer.** A 2-player battle lasted 15 rounds against 3 players' 13,
   with the last wave at round 13 in both, so 2 players had two more rounds
   of the biggest wave to survive. Cutting it to 13 rounds closes most of the
   gap (see *Team HP +50% as the new default*, below): with team HP ×1.5 and
   restore 1, 2 players go from 17% / 50% to 79% / 100% against the Realm /
   Swarm, beside 3 players' 83% / 96%. The Sacked Fort's two-warband split
   doesn't seem to matter.

## Team HP +50% as the new default

Taking team HP ×1.5 as given, and 2-player Hold Out cut to 13 rounds (the
rule's real version would cut Hold Out alone, and Solo, which lasts a duel's
rounds, would come along unless it's kept apart). 3-player battles already
lasted 13 rounds, so their cells are the earlier runs with the same seeds,
except enemy −2 steps, which is new.

| Team HP ×1.5, 13 rounds, plus | 2p vs Realm | 2p vs Swarm | 3p vs Realm | 3p vs Swarm |
|---|---|---|---|---|
| nothing | 8% · r12.2 | 29% · r12.1 | 17% · r12.6 | 54% · r12.1 |
| restore 1 | 79% · r12.4 | 100% · — | 83% · r12.8 | 96% · r12.0 |
| enemy −1 step | 25% · r12.6 | 54% · r12.5 | 13% · r12.1 | 63% · r12.0 |
| enemy −2 steps | 42% · r11.9 | 58% · r12.8 | 42% · r12.9 | 33% · r12.8 |
| **enemy −1 step, and armour 1 against the Realm only** | **71% · r13.0** | **54% · r12.5** | **58% · r12.9** | **63% · r12.0** |

The same 2-player cells at 15 rounds, for comparison: 0% / 8% alone, 17% /
50% with restore 1, 4% / 17% with enemy −1 step.

- **13 rounds is worth a lot to 2 players on its own:** every 2-player cell
  rises by 8–62 points, and they now land close to 3 players' with the same
  levers.
- **Restore 1 is now even across team sizes and factions (79–100%)**, but
  too easy for the planner, and people should do better still. A Normal
  built on it needs pulling back a little: restore 1 with team HP ×1.25,
  say, or the rally (§30.11) dropped now that downed characters come back.
- **A smaller enemy is the gentler lever, and a noisy one.** −1 step lands
  2 players at 25% / 54% and 3 players at 13% / 63%. −2 steps evens the
  Realm (42% for both team sizes) but makes 3 players vs the Swarm *harder*
  (33%, against 63% at −1 step). The 60-point Swarm squad (a Ravager, a
  Skitterling and two Spitters) is half Spitters, with no Bloater to burst
  on its own side. So the Swarm's smaller squads aren't simply weaker, and
  a step down the ladder isn't a clean difficulty knob for it. The cells
  are ±20 points, so this wants a bigger run before anyone leans on it.
- **Enemy −1 step with armour against the Realm alone is the most even set
  found: 54–71% in every cell.** The Swarm cells are enemy −1 step's,
  unchanged, since armour is off against them. Against the Realm, armour 1
  lifts 2 players from 25% to 71% and 3 players from 13% to 58%. That's the
  faction split point 4 found turned to use: armour is worth much more
  against the Swarm's 2-damage hits than the Realm's 4s, so giving it only
  where it's needed keeps the Swarm where it was. The cells sit within
  each other's ±20, so they're a match within what 24 battles can tell.
  How it reads to a player is the open question: a rule that only applies
  against one enemy wants a reason (the Realm's deserters fighting the
  keep's own drill, so the defenders know their blows), or a version that
  isn't faction-shaped: armour against melee only, say, or −1 against any
  hit of 4 or more, which in practice is the Realm's swords, maces and
  Rend.
- **Where that leaves a default:** team HP ×1.5 and 13 rounds for every team
  size, plus restore 1, is the most even set found, with something taken
  off to bring it back from near-certain. Enemy steps are better kept for
  the difficulty setting, which already moves warbands up and down the
  ladder (§30.5), than for Normal itself. The alternative is the even set
  above (enemy −1 step, armour against the Realm), which needs no restore
  at all.

## Where this points

**What shipped (command version 7, realm-arena.md §30.13).** Not the set
above's restore, but the levers that needed little new mechanism, plus
changes that slow the killing in every mode: in Hold Out, **team HP ×1.5**
(rounded up, as `maxHpOf`), **the enemy −1 step** (the warbands and every
wave refill muster one rung down the budget ladder) and **armour 1 for the
team against the Realm only** (the faction-shaped version the cells above
found most even; the Swarm's hits are not armoured, and burning is not
reduced) and **13 rounds for two players** (Solo keeps 15); and everywhere, **melee hits 80%** instead of always, **cover counts
double against a shot from over 10 squares** (hunkering down is the same
doubling, not stacked), the **Mage Bolt is 80% to a range of 12**, a Cleric's **Heal is once a
turn** with no cooldown, and its **Raise is on a four-turn cooldown** instead
of once a battle. The rest of this section, and the cells above, are what
pointed there and what was left over: restore, armour against the Swarm and
attack 3 AP. A
first look at an earlier form of the combined set (a long-shot penalty and a 90%, range-15 Mage Bolt instead of the cover rule and the 80%, range-12 one), 8 battles a cell on seeds 1–8 (so ±30 points,
and only a check that it is neither hopeless nor trivial), gave the team 50%
against the Realm and 50% against the Swarm at 2 players, and 88% and 88% at
3 players. Before the armour and the Mage Bolt the Realm cells were 0% and 38%;
the Swarm cells are unchanged, as neither touches them. It wants the 200-run
comparison the end of this file describes before anyone leans on it.

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
- **To keep two attacks a turn,** slow the killing for the team only.
  Doubling everyone's HP slows both sides alike and shifts the result little
  (point 6), but doubling the team's alone is the strongest lever found
  (point 7). With restore 1, ×1.5 already makes 3 players near-certain and
  ×2 is needed for 2 players to have even odds against the Realm. So either
  tune it per team size, or find what makes 2 players' battle harder and
  fix that, then use one multiplier. It was the length (point 8): with
  2-player Hold Out cut to 13 rounds, one multiplier fits both (*Team HP
  +50% as the new default*). A real version also has to show the team's larger HP on the
  board (`ui.ts` reads `CHARACTERS` for the HP bar), and say why a Knight
  has 24 HP in Hold Out and 12 everywhere else: something like the keep's
  defenders being *Steadfast*.
- Every one of these is a rule, so it takes a command version, as growing
  waves (5) and the rally (6) did.

## Planner experiments

The levers above change the rules. These change the computer's planner
(§29.7) and nothing else, measured with `--team-planner main` (§30.12): the
team plays `main`'s planner and the warbands the experiment's, so the same
seeds differ only in how the warbands play. A warband that plays better shows
as the team winning less and falling sooner. **540 battles a run**: Solo, 2
and 3 players against each faction, Hold Out on the Sacked Fort, Normal, 60
battles a cell on seeds 1–60, compared seed by seed. Written at revision 1.57,
command version 7.

### Counting the team per head (not kept)

The open puzzle (§29.11): a warband shoots a fresh enemy in the open (80% to
wound) over a wounded one behind a wall (70% to down), because the score
weighs a team character by the HP it has left, though it fights at full
strength until it's down. So, in Hold Out, half a team character's worth
counted by its standing at all and half by its HP:
`0.5 × points + 0.5 × points × hp / maxHp`. It solved the puzzle.

| Warbands' planner | Hold Out, team wins | Team's last round, against `main`'s warbands |
|---|---:|---:|
| `main` | 7 of 540 | — |
| Half per head, half by HP | **123** of 540 | **+1.08 ± 0.19** rounds |
| HP, plus half per head on top: `0.5 × points + points × hp / maxHp` | 6 of 540 | −0.02 ± 0.14 rounds |

The half-and-half warbands were much *weaker*: every cell's team won more
or as often, most by a wide margin (Solo against the Miners 4 → 35 of 60, 2
players against the Miners 1 → 29). The same scoring in Hold the Centre, on
the gate forts, was weaker too: the team won 344 of 540 against it, 258
against `main`'s.

**Why.** The planner sees one action ahead. Weighed by HP, damage that
downs nobody still scores, and it is what sets up the knock-outs of the next
turns. Counted half per head, it scores half as much, so warbands attack less
and move more. The bonus on top of HP leaves that damage's worth alone and
only adds to a knock-out. It solves the puzzle too, and changes nothing
measurable: the planner finishing a wounded enemy over wounding a fresh one
is rare enough in a real battle not to show.

**What it says.** A puzzle says what the planner gets wrong, not what's
worth fixing: run the harness before keeping a change to the score. And
anything that lowers what damage short of a knock-out is worth needs a way
to see the knock-outs it sets up, which a one-action planner doesn't have.

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
- **13 rounds for 2 players:** `battleRounds` in `rules.ts` answering 13 for two seats (and so for Solo, which reads two). Only co-op battles were run, so nothing else noticed. (The shipped version is Hold Out's alone, for exactly two players, and leaves Solo at 15: `battleRounds(playerCount, { mission, rulesVersion })`.)
- **Team HP ×*k*:** a `maxHpOf(fighter)` in `rules.ts`, the character's HP, times *k* unless `isWarband(fighter.owner)`, read everywhere a full HP was read from `CHARACTERS`: `newFighter`, the heal checks and `mend`, Raise, the rally, the restore, and the planner's `worthOf` (so a team HP is worth half as much to it).
- **HP ×*k*:** every `CHARACTERS[c].hp` scaled and rounded as the table loads.

To compare a change properly, run the same scenarios on the base branch and
on the change with the same `--seed`, and with more battles than these:
`--runs 200` gives about ±7 points, which the *Realm Arena balance* workflow
manages in about a quarter of an hour across its runners.
