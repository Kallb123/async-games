# Squad Tactics — Game Design Document

**Status:** Concept, v0.1. Split out of Defender of the Realm in its third
round of design, when one concept became two games
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). This doc
records what's decided, sketches a match, and lists the next questions (§11).
**Working title:** Squad Tactics (a placeholder, see §12)
**Genre:** Turn-based tactical squad battles, XCOM-style
**Players:** 2 (see §11)
**Session shape:** one battle per match, a few days long, played a turn at a
time in spare minutes

---

## 1. High concept

Two players each build a squad from a limited budget of points, then fight one
battle, XCOM-style. It's a small grid battlefield with cover, flanking,
overwatch, and troop types with abilities. Players take turns. One turn moves
your whole squad, and fits into the time it takes the kettle to boil. Every
battle has a winner. Between battles, your troops level up.

**One-line pitch:** *XCOM in the gaps of your day.*

---

## 2. Design pillars (draft)

| Pillar | How it shows |
|---|---|
| **Real XCOM, move by move** | Players take turns. Each unit moves and acts, and reaction fire happens on the other player's turn |
| **A turn fits a kettle boil** | One turn moves the whole squad in a minute or two, and squad size keeps it that way (§6) |
| **A fair fight** | Both squads are bought from the same budget of points |
| **Every battle has a winner** | Missions have objectives, a turn limit, and a tie-break that can't end level (§5.1) |
| **Your troops remember** | Survivors gain experience and progress between battles (§7) |

---

## 3. Where it came from

Defender of the Realm started as one game: a HOMM overworld with XCOM battles.
Three rounds of design showed the two halves pull against each other when
played asynchronously. XCOM's move-by-move battle needs 20–40 hand-offs, which
is days of real time, and an overworld shared by up to six players can't wait
that long (`defender-of-the-realm.md` §9). Round 3 split them. Defender of the
Realm keeps the overworld, with battles that are planned and then watched.
This game keeps the battles and drops the overworld.

It's that doc's Proposal 5 (§14) taken in a new direction: individual battles
with progression, instead of a campaign round that waits on everyone's
battles.

What's decided so far (all from round 3 of that doc, §7.7):

- XCOM-style battles, taking turns.
- A limited number of points to build your team.
- Between battles, individual levelling and progression, not an overworld.
- Every battle must have a winner.
- There could be fog of war, but that isn't decided yet.

---

## 4. Why it fits asynchronous play

- **The hand-off budget works here.** A battle of 20–40 turns is 20–40
  hand-offs: about two and a half to five days, at roughly three hours a
  hand-off. That's long for one battle, but ordinary for a game on this
  platform, and nothing else is waiting on it. There's no overworld to hold.
- **Nobody sits idle.** Players on this platform already have several games
  in play at once. A battle waiting on your opponent is just one of them.
- **It's the platform's own shape:** two players, one active at a time, a
  command per action, and a turn timer. Reaction fire (overwatch) goes off
  during the other player's turn. The server resolves it as part of that
  player's command, so it needs no out-of-turn action.
- **A missed turn is cheap.** If the turn timer runs out, the squad holds its
  ground: every unit that hasn't acted hunkers down or goes on overwatch. No
  computer opponent is needed.

---

## 5. A match (sketch)

1. **Setup.** The host picks a mission, a battlefield and the points budget.
2. **Muster and deploy.** Each player spends the budget on a squad and places
   it in their deployment zone. This is one sitting, and it stays sealed until
   both players are done, so nobody can counter-pick. (Sealed choices are
   hidden state: see §8.)
3. **Battle.** Players take turns. On your turn each unit gets two actions:
   move, shoot, use an ability, go on overwatch, or hunker down. Hit chances
   depend on range, cover and flanking (§9).
4. **End.** The battle ends when one side is wiped out, when the mission's
   objective is met, or at the turn limit (§5.1).

### 5.1 Every battle has a winner

*Proposal:*

- Every mission has an objective that scores points. Examples: hold a point at
  the end of each round, carry a relic off the map, destroy a target.
- At the turn limit, the higher score wins.
- If the scores are level, the side with more of its points' worth still
  standing wins.
- If that's level too, the player who took the second turn wins. That also
  makes up for the advantage of going first.

---

## 6. Keeping turns short

Moving the whole squad in one turn keeps the hand-offs down (§4), but it also
makes a turn long: two actions for each of eight units is sixteen decisions.
There are two ways to keep it short:

- **Squad size.** The points budget sets it. Aim for 4–8 units, fewer than
  Defender of the Realm's 6–10, so a turn stays within a couple of minutes.
- **Quick defaults.** Any unit you don't touch holds its ground when you end
  the turn, going on overwatch or hunkering down in cover. A turn where only
  two units need to move takes seconds.

Alternating activations, where each turn moves only a few units, would make
battles more reactive. But it multiplies the hand-offs, so it doesn't fit the
budget.

---

## 7. Progression (options)

Round 3 asked for "individual battles, with progression". That can be read two
ways:

| | **A. A company that lasts** | **B. A series of battles** |
|---|---|---|
| What it is | Each player keeps a roster of named troops across all their matches of this game, and picks each squad from it | A match is a short series against the same opponent, say first to two wins. Survivors carry over between the battles in the series |
| What progresses | Troops gain experience, levels and abilities across every match | Troops level up between battles in the series; the next match starts fresh |
| Keeping it fair | A levelled troop costs more points, so the budget still balances squads. Levels buy options (abilities, a specialism), not a free advantage | Both players progress within the same series. The loser of a battle could get extra points for the next one |
| Death | Can be permanent, as in XCOM | Permanent for the rest of the series |
| Several matches at once | A troop fighting in one match can't join another until it ends, so a player with many games in play needs a bigger roster | No clash: each series stands alone |
| Fit with the platform | New: state that belongs to a player, outside any one game | Fits as it is: one game holds the whole series |

*Recommendation:* build **B** first. It fits the platform as it is, and
progression and permanent death both work inside it. **A** is the more XCOM
of the two, with your own soldiers and their names and histories. It can come
afterwards and reuse everything B builds.

---

## 8. Fog of war (not decided)

Round 3 left this open.

**For**
- It's what makes overwatch, flanking and scouting matter. It's XCOM.

**Against**
- It's hidden state. The server must send each player only the enemy units
  their squad can see. The replay of the other player's turn must show only
  what your squad saw happen.
- This platform already hides hands and secret codes from opponents, so the
  work is familiar. But it touches every response and every replay.

A middle ground is no fog, with line of sight still deciding who can shoot
whom. That keeps most of the tactics without the hidden state. Sealed
mustering (§5) is hidden state either way, but only until the first turn.

---

## 9. Luck

Players are there for every decision, so hit chances are fine
(`defender-of-the-realm.md` §7.3, answer 10). It's worth softening XCOM's
famous all-or-nothing miss: a miss could still graze for reduced damage, so a
90% shot that misses doesn't feel like robbery. The server makes and records
every roll, as every game here does, so a replay shows the same result.

---

## 10. Shared with Defender of the Realm

Both games fight on a small grid battlefield with troop types and abilities.
These parts are worth building once:

- **The battlefield:** grid, terrain, cover, line of sight, pathfinding, and
  the board component that draws it.
- **The troop catalogue:** types, stats, abilities, factions and art, if the
  two games share a world (§11).

What can't be shared is the rulebook. In this game players take turns and roll
to hit. In Defender of the Realm, orders play out together and predictably
(`defender-of-the-realm.md` §13.3).

*Recommendation:* **build this game first.** It's the smallest thing that fits
the platform as it stands, a two-player game with one player active at a
time, and it builds the battlefield both games need. Defender of the Realm
then adds the overworld, sealed orders and the replay on top.

Within this game, build in this order:

1. A single battle, with points and no progression.
2. The series (§7, B).
3. The company (§7, A), if wanted.

---

## 11. Questions (round 1)

1. **Progression** (§7): a company that lasts across all your matches, or a
   series of battles within one match?
2. **Players:** two only, or also two against two, or free-for-all?
3. **Death:** can troops die for good?
4. **One world or two:** should both games share the same factions, troop
   types and art?
5. **Fog of war** (§8): any leaning yet?
6. **A name:** "Squad Tactics" is only a placeholder.

---

## 12. Working title

"Squad Tactics" is a placeholder, chosen only so this doc has a file name.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Split out of Defender of the Realm (its §17). Concept, draft pillars, why it fits async play, a sketch of a match with a winner every time, keeping turns short, two readings of progression, fog of war, luck, what's shared with Defender of the Realm and a build order; round-1 questions. |
