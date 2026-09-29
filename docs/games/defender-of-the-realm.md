# Defender of the Realm — Game Design Document

**Status:** Concept. This first draft records the idea and sets out the problem
that decides everything else: how a game with an overworld *and* tactical
battles can be played asynchronously. Nothing below is decided. The open
questions (§7) need answers before more solutions are proposed.
**Working title:** Defender of the Realm (see §8)
**Genre:** Turn-based fantasy strategy: an overworld of factions, cities and
armies, with tactical squad battles
**Inspirations:** *Heroes of Might and Magic* (the overworld) and *XCOM* (the
battles)
**Players:** TBD (§7.1)
**Session shape:** TBD (§7.1)

---

## 1. High concept

A fantasy strategy game that sits somewhere between *Heroes of Might and
Magic* and *XCOM*.

- **The strategic layer** is an overworld map like the one in HOMM. Players
  lead factions, hold cities, gather resources and recruit troops. Armies
  march around the map.
- **The tactical layer** is where armies meet. A battle isn't one stack traded
  against another. It plays out more like XCOM: a small tactical map,
  individual troops and, most importantly, troop types with **abilities**.
  That gives battles variety, and choices beyond "who brought more".

Combat happens only now and then. Most overworld turns are about the economy
and moving armies. The battles are what all of that leads to. They're where
the choices made on the overworld get tested: what to recruit, where to
march, when to commit.

---

## 2. What each inspiration brings

My reading of the pitch, to be confirmed (§7):

| From *Heroes of Might and Magic* | From *XCOM* |
|---|---|
| A shared overworld map with resources to claim and places to visit | A small grid battlefield with terrain and cover |
| Factions, each with its own cities and troop roster | Units that act one at a time, a handful per side |
| Cities that grow buildings, which unlock and produce troops | Troop types defined by abilities, not just stats |
| Resources gathered from mines and the map, spent on buildings and recruits | Positioning, flanking and turn-by-turn tactical decisions |
| Armies, often led by a hero, that move a limited distance per turn | A battle that runs for many turns of its own |
| A calendar of days and weeks that sets the pace of growth | |

§7 asks which of these carry over. Heroes? Single soldiers or stacks? Cover?
Hit chances? Permanent losses?

---

## 3. The core problem: asynchronous play

Every other game on this platform is asynchronous. There is no real-time
connection. A player takes their turn when a notification arrives, and a turn
timer moves the game on if they don't (`ARCHITECTURE.md` §4, §7). Defender of
the Realm has two layers that don't share a clock, and that's what makes it
hard.

### 3.1 Two time scales

One overworld turn will usually hold many tactical turns. Say a battle runs
for eight rounds and each side acts once per round. That's sixteen hand-offs
between two players, where the overworld needs only one turn each. The
overworld is the big, slow layer. Battles are small and quick, but they have
far more turns.

On this platform, every hand-off costs a notification and a wait while
someone picks up their phone. For illustration: if players answer within two
hours on average, those sixteen hand-offs take more than a day for one
battle. And the overworld has to be doing *something* in the meantime.

### 3.2 Battles at the same time

Several players share one overworld, so battles can overlap. Two might be
happening at once: A against B while C fights D, or A against neutrals while
B fights C. The overworld is one shared state, so this raises a lot of
questions:

- **What does the rest of the world do while a battle is still going?** Wait
  for it, or carry on?
- **What happens to the armies in the battle?** They're no longer where they
  stood, and their fate hasn't been decided yet. Can anyone else interact
  with them, or with the city they were defending?
- **What about players who aren't in any battle?** They shouldn't have to wait
  on someone else's fight. But their turn may hang on how it ends: the army
  they want to attack, or the city whose defenders are fighting elsewhere.
- **What if the result of a battle overturns something that happened while it
  was being fought?**

### 3.3 Why nothing else in the app solves this

- The engine is built around **one active player at a time**
  (`currentTurn`), with a turn timer and a cron sweep. There is a narrow way
  to act out of turn, for cards played on someone else's turn
  ([`out-of-turn-actions.md`](../out-of-turn-actions.md)). It's kept small on
  purpose: it can't end a turn or hand one over.
- **Kingdom Builder** ([`kingdom-builder-gdd.md`](./kingdom-builder-gdd.md))
  is the closest relative: a persistent overworld for several players, with
  armies. It avoids this problem entirely. Time moves on a real-time tick
  (its §5.5), and combat resolves by itself (its §7.6). That is the first
  idea in §4, and it's the trade this game doesn't want to make.

---

## 4. Ideas raised so far

### 4.1 Auto-resolve every battle

Drop the tactical layer. When armies meet, the server works out the result.

**For**
- Fits the async model perfectly. No battle ever waits on a player, and the
  overworld is never left with a fight unsettled.
- Already proven in this app (Kingdom Builder).

**Against**
- It loses much of the fun, and much of the point of the overworld. The
  overworld exists to set up battles. If battles are just a calculation,
  recruiting a varied army with interesting abilities has no payoff, and the
  XCOM half of the pitch is gone.

This is the extreme the concept is trying to avoid.

### 4.2 Your turn = your overworld turn + one turn in each of your battles

On their turn, a player takes their overworld turn and also takes one
tactical turn in every battle they're in.

**For**
- Both layers are still played by hand.
- It keeps the one-active-player shape the platform already has. No battle
  needs its own notification, and battles move forward steadily.

**Against**
- It feels strange when the overworld is so much larger. Following it
  through:
  - An eight-round battle takes eight overworld turns. In HOMM terms that's
    more than a week of game time for one skirmish. The world moves on much
    faster than the battle does.
  - The armies in a battle are shut out of the overworld for that whole time,
    and it's hard for anyone to tell what those armies can still do.
  - Turns become uneven. A player in three battles has a heavy turn. A player
    in none has a light one.
  - A battle moves at the speed of the overworld rotation. That's slow in a
    big game, and has nothing to do with how the fight itself is going.
  - It raises questions of its own. Can reinforcements march into a battle
    that's still going? Can a third army join in?

### 4.3 Further ideas

Held back until §7 is answered. Several of those answers change which
approaches are even possible.

---

## 5. What a good answer has to do

A first draft of the test to judge the coming proposals against, to be
agreed (§7):

1. **Battles are played, not simulated**, at least the ones that matter.
2. **Nobody sits idle waiting on a battle they aren't in.**
3. **The overworld stays consistent.** A battle ending later can't make an
   earlier action invalid. If it can, the rules say so plainly.
4. **A battle finishes in a sensible amount of real time**, and the pace of
   the overworld doesn't depend on it.
5. **An absent player isn't treated unfairly**, especially a defender who
   didn't choose to fight.
6. **It fits the platform.** Where it needs something new, as Kingdom Builder
   needed its tick, the cost is named and worth paying.

---

## 6. Out of scope for now

Factions, the unit roster, abilities, the economy, map generation and victory
conditions all wait until the async model is settled, because it limits each
of them. It sets how many units a battle can hold, how long a battle can run,
and how much one overworld turn can ask of a player.

---

## 7. Open questions

The answers decide which async models are possible. The first three groups
matter most.

### 7.1 Shape of a match

1. How many players share an overworld: 2, 2–4, or more? Is it a
   free-for-all, teams, or co-operative against the game?
2. How long should a match last in real time: an evening, a week, several
   weeks? And roughly how many overworld turns is that?
3. How often do you picture players checking in: every few minutes while
   they're actively playing, a few times a day, or once a day?

### 7.2 Who fights whom

4. Are there neutral forces on the map, like HOMM's creature stacks guarding
   mines and treasure, raiders, or a monster faction? If so, would most
   battles be against them rather than against other players?
5. In a player-versus-player battle, does the defender fight it by hand? Or is
   it acceptable for an absent defender to be run by standing orders or an
   AI?
6. Is auto-resolve acceptable as an *option*, like HOMM's quick combat for a
   one-sided fight, even though it's not acceptable as the only way?

### 7.3 Size and feel of a battle

7. How big is a battle? How many units a side (XCOM's four to six, or more?),
   how large a map, and how many rounds should a typical battle take?
8. Does a hero lead each army (HOMM), or is an army a squad of single soldiers
   (XCOM)? Is a unit one soldier, or a stack like fifty pikemen?
9. Do units carry over from one battle to the next, gaining levels, keeping
   wounds, dying for good?
10. How much luck is in a battle: XCOM-style hit percentages, or something
    more predictable?

### 7.4 The overworld

11. Does the overworld go strictly turn by turn, one player moving at a time?
    Or would it be acceptable for everyone to plan at once and have the
    orders play out together?
12. Is there fog of war on the overworld? Is anything hidden in battles, such
    as concealment or enemies you can't see?
13. While a battle is going on, is it fine for the rest of the world to carry
    on? Or should a battle feel like a moment the world waits for?

### 7.5 Everything else (lower priority)

14. How many factions are there, and how different are they from each other?
15. How does a match end: conquest, a race for victory points, a fixed
    calendar, an objective?
16. Is there anything from either inspiration you specifically *don't* want?

---

## 8. Working title

"Defender of the Realm" is close to existing titles. There's the board game
*Defenders of the Realm* (Richard Launius, 2010) and the computer game
*Defender of the Crown* (1986). It's fine as a working title, but check it
before release.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Concept recorded; the async problem set out; the two ideas raised so far (§4) written up; open questions listed. |
