# Realm Arena — Game Design Document

**Status:** Concept, v0.2. Split out of Defender of the Realm in its third
round of design, when one concept became two games
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). This is the
one to build first (§10). §11 records the answers so far, and §12 lists the
next questions.
**Working title:** Realm Arena (§13)
**Genre:** Turn-based tactical squad battles, XCOM-style
**Players:** 2–4
**Session shape:** one battle per match, a few days long, played a turn at a
time in spare minutes
**Setting:** the same fantasy world as Defender of the Realm (§10)

---

## 1. High concept

Two to four players each build a squad of characters from a limited budget of
points, then fight one battle, XCOM-style. It's a small grid battlefield with
cover, flanking, overwatch, and characters with abilities. Players take turns.
One turn moves your whole squad, and fits into the time it takes the kettle to
boil. Every battle has a winner. Between battles, players unlock new
characters and equipment to choose from (§7).

**One-line pitch:** *XCOM in the gaps of your day.*

---

## 2. Design pillars (draft)

| Pillar | How it shows |
|---|---|
| **Real XCOM, move by move** | Players take turns. Each character moves and acts, and reaction fire happens on other players' turns |
| **A turn fits a kettle boil** | One turn moves the whole squad in a minute or two, and squad size keeps it that way (§6) |
| **A fair fight** | Every squad is bought from the same budget of points |
| **Every battle has a winner** | Missions score points, with a turn limit and a tie-break that can't end level (§5.1) |
| **Progress widens your choices** | Unlocks add characters and equipment to pick from, each with a points cost. Progress gives you options, not an edge (§7) |

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
battles. Round 4 named it Realm Arena, set it in the same fantasy world as
Defender of the Realm, opened it to up to four players, and pointed its
progression at unlocks.

What's decided so far:

| Decided | Where |
|---|---|
| XCOM-style battles, with players taking turns | Defender of the Realm, round 3 (its §7.7) |
| A limited number of points to build a squad | Defender of the Realm, round 3 |
| Every battle has a winner | Defender of the Realm, round 3 |
| Between battles, progression rather than an overworld | Defender of the Realm, round 3 |
| 2–4 players | §11, answer 2 |
| Progression unlocks new characters or equipment, each with a points cost (still to be decided in detail) | §11, answer 1 |
| The same fantasy world as Defender of the Realm | §11, answer 4 |
| Built before Defender of the Realm | §11, answer 7 |
| The name: Realm Arena | §11, answer 6 |

---

## 4. Why it fits asynchronous play

- **The hand-off budget works, if battles shrink as players are added.** Every
  player takes a turn each battle round, so the hand-offs grow with the table.
  At roughly three hours a hand-off:

  | Players | Hand-offs per battle round | 10 battle rounds | 20 battle rounds |
  |---:|---:|---|---|
  | 2 | 2 | 20: about 2½ days | 40: about 5 days |
  | 3 | 3 | 30: about 4 days | 60: about 7½ days |
  | 4 | 4 | 40: about 5 days | 80: about 10 days |

  *Proposal:* keep a battle to about 30–40 hand-offs whatever the player
  count. That's 15–20 battle rounds for two players, 10–12 for three, and
  8–10 for four. More players means a smaller squad each (§6), and missions
  that bring squads into contact early (§5).
- **Nobody sits idle.** Players on this platform already have several games
  in play at once. A battle waiting on someone else is just one of them. At
  four players, though, three other turns come between each of yours, so
  expect two or three turns a day.
- **It's the platform's own shape**, as long as each player takes their own
  turn: a rotation of seats with one player active at a time, a command per
  action, and a turn timer. Reaction fire (overwatch) goes off during another
  player's turn. The server resolves it as part of that player's command, so
  it needs no out-of-turn action. Teams sharing a turn would be new (§5.2).
- **A missed turn is cheap.** If the turn timer runs out, the squad holds its
  ground: every character that hasn't acted hunkers down or goes on
  overwatch. No computer opponent is needed. A player who keeps missing turns
  is dropped the way every game here drops them (`ARCHITECTURE.md` §7). Their
  squad leaves the battlefield, and their score stands.

---

## 5. A match (sketch)

1. **Setup.** The host picks a mission, a battlefield and the points budget.
   The budget shrinks as players are added (§6).
2. **Muster and deploy.** Each player spends the budget on characters and
   equipment, and places their squad in their own deployment zone. This is
   one sitting, and it stays sealed until everyone is done, so nobody can
   counter-pick. (Sealed choices are hidden state: see §8.)
3. **Battle.** Players take turns in seat order. On your turn each character
   gets two actions: move, shoot, use an ability, go on overwatch, or hunker
   down. Hit chances depend on range, cover and flanking (§9).
4. **End.** The battle ends at the turn limit, or when only one squad (or
   team) is left on the battlefield (§5.1).

### 5.1 Every battle has a winner

*Proposal*, for any number of players:

- **Missions score points.** The objective depends on the mission: hold a
  point at the end of each round, carry a relic off the map, destroy a target.
  Knocking out an enemy character also scores its points cost.
- **The battle ends** at the turn limit, or when only one squad (or team) is
  left. Being the last one standing ends the battle but doesn't win it on its
  own: the score does.
- **The highest score wins.** If scores are level, the side with more of its
  points' worth still standing wins. If that's level too, the later seat in
  the turn order wins, which also makes up for the advantage of going early.
- **A wiped-out squad** takes no more turns. The rotation steps past it, as it
  does a dropped player, and its score stands. Since the score decides, a
  player knocked out early can still place.

### 5.2 Three and four players: everyone for themselves, or teams

| | **Free-for-all** (3–4 players) | **Teams** (two against two) |
|---|---|---|
| Turns | One player at a time: 3–4 hand-offs per battle round | Teammates share their team's turn, moving in either order. The turn passes once both have finished: 2 hand-offs per battle round, as fast as a two-player game |
| Scoring | Each player scores alone. The leader becomes everyone's target, which keeps a lead from running away | The team scores together |
| Knocked out | A wiped-out player keeps their score but takes no more turns | Their teammate plays on |
| Risks | Two players ganging up on a third; a player knocked out early waits for the end | A shared turn waits on the slower teammate. Coordinating needs chat, which the app already has |
| Fit with the platform | As it is: a rotation of seats | New: two players active at once, which the one-at-a-time turn doesn't do today (`defender-of-the-realm.md` §3.3) |

*Recommendation:* build two players first, then free-for-all, because it fits
the platform as it is. Teams can come later if they're wanted.

---

## 6. Keeping turns short

Moving the whole squad in one turn keeps the hand-offs down (§4), but it also
makes a turn long: two actions for each of eight characters is sixteen
decisions. There are two ways to keep it short:

- **Squad size.** The points budget sets it. Aim for 4–8 characters in a
  two-player battle, falling to 3–5 at four players. That keeps each turn to
  a couple of minutes, keeps a four-squad battlefield readable on a phone,
  and helps the battle fit the hand-off budget (§4).
- **Quick defaults.** Any character you don't touch holds its ground when you
  end the turn, going on overwatch or hunkering down in cover. A turn where
  only two characters need to move takes seconds.

Alternating activations, where each turn moves only a few characters, would
make battles more reactive. But it multiplies the hand-offs, so it doesn't fit
the budget.

---

## 7. Progression: unlocks

Round 1 left progression to be decided, but pointed it at **unlocks**: new
characters, which give more flexibility, or new equipment for characters,
each with a points cost (§11, answer 1). *Proposal*, for how that could work:

- **Unlocks are sidegrades.** A new character or piece of equipment is
  different, not stronger. Its points cost is set so that it's worth what it
  replaces. A newer player isn't outgunned, just has fewer options. And since
  mustering is sealed (§5), having more options can't be used to counter-pick.
- **A starter set is enough to play well.** Each faction's basic characters
  are there from the first match.
- **Equipment is picked at muster** and costs points like a character does.
  It lasts for that battle only.
- **Earned by playing.** Every battle earns progress towards the next unlock,
  win or lose. Winning earns more.
- **It lives across all your matches of Realm Arena.** That's state belonging
  to a player, not to any one game, which the platform doesn't have yet. An
  unlock list is the lightest kind of that state. There's no roster of named
  characters with their own levels and wounds to keep.
- **Nothing is lost for good.** Progress is unlocks, not individual
  characters, so a character who falls is only out of that battle. Permanent
  death would come back only if a roster of named characters did.

v0.1 considered two other readings of "progression". One was a **company**:
named troops that level up across all your matches. The other was a
**series**: several battles against the same opponent, with survivors
carrying over. Unlocks replace the company with something lighter and fairer.
The series could still come back later as a match format built on top.

---

## 8. Fog of war (not decided)

Still open after round 1.

**For**
- It's what makes overwatch, flanking and scouting matter. It's XCOM.
- With three or four squads, it also stops a player from waiting to see who's
  weakened before striking.

**Against**
- It's hidden state. The server must send each player only the enemy
  characters their squad can see. The replay of other players' turns must
  show only what your squad saw happen.
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

The two games share a similar fantasy world (§11, answer 4). Both fight on a
small grid battlefield. These parts are worth building once:

- **The battlefield:** grid, terrain, cover, line of sight, pathfinding, and
  the board component that draws it.
- **The catalogue:** character and troop types, their abilities, factions and
  art. Each game shows them in its own way. Here, a character is one figure
  with its own HP, as in XCOM. In Defender of the Realm, a troop is a number of
  soldiers who each have HP (`defender-of-the-realm.md` §18.5). An archer is
  still an archer in both.

What can't be shared is the rulebook. In this game players take turns and roll
to hit. In Defender of the Realm, orders play out together and predictably
(`defender-of-the-realm.md` §13.3).

**This game is built first** (§11, answer 7). It's the smaller of the two, it
fits the platform as it stands, and it builds the battlefield both games need.
Defender of the Realm then adds the overworld, sealed orders and the replay on
top.

*Proposal:* the first playable version is kept small:

1. **First playable:** two players, one faction (a mirror match), one mission,
   one battlefield, and a points budget spent from a fixed set of characters.
   No fog of war and no unlocks.
2. **Then:** more missions and battlefields, then free-for-all for three and
   four players (§5.2).
3. **Then:** unlocks (§7), and fog of war if it's chosen (§8).
4. **Then:** more factions.

---

## 11. Questions and answers (round 1)

These were asked in v0.1 and answered in round 4 of Defender of the Realm's
design (`defender-of-the-realm.md` §7.8).

1. **Progression: a company that lasts, or a series of battles?** Still to be
   decided. It could be unlocking new characters, which give more
   flexibility, or new equipment for characters. Each would have a points
   cost.
2. **Players:** more than two. Maybe up to four.
3. **Can troops die for good?** Not answered yet. §7 suggests unlocks make the
   question mostly go away; §12 asks again.
4. **One world or two?** The two games should share a similar fantasy world.
5. **Fog of war?** Still open (§8).
6. **A name:** Realm Arena.
7. **Build this game first?** Yes.

---

## 12. Questions (round 2)

1. **Three and four players** (§5.2): free-for-all, teams of two, or both?
2. **Battle length** (§4): should battles get shorter as players are added, so
   that a four-player battle stays around five days rather than ten?
3. **Unlocks** (§7): should they be sidegrades, different rather than
   stronger? And should they be earned across all your matches?
4. **Characters** (§10): one figure each, with its own HP, as in XCOM, unlike
   Defender of the Realm's troops?
5. **Death** (§7): with progression as unlocks, a fallen character is only
   out of that battle. Is that right, or do you want permanent death?
6. **First playable** (§10): is that the right place to start?
7. **Next:** ready to move on to the battle rules and a first set of
   characters? That means actions, hit chances, cover, abilities and points
   costs.

---

## 13. Working title

"Realm Arena", chosen in round 4. The shared "Realm" ties it to Defender of the
Realm, its sibling in the same world.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Split out of Defender of the Realm (its §17), as `squad-tactics.md`. Concept, draft pillars, why it fits async play, a sketch of a match with a winner every time, keeping turns short, two readings of progression, fog of war, luck, what's shared with Defender of the Realm and a build order; round-1 questions. |
| 0.2 | Named Realm Arena, renamed to `realm-arena.md`. Round-1 answers recorded (§11). 2–4 players: the hand-off budget by player count, with battles shrinking as players are added (§4), scoring and a winner for any number of players (§5.1), and free-for-all against teams (§5.2). Progression becomes unlocks, as sidegrades earned across all your matches (§7). Shares a fantasy world with Defender of the Realm; characters are single figures here and troops there (§10). A first playable scope (§10). Round-2 questions (§12). |
