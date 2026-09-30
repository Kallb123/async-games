# Realm Arena — Game Design Document

**Status:** Concept, v0.3. Split out of Defender of the Realm in its third
round of design, when one concept became two games
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). This is the
one to build first (§10). §11 records the answers so far. §13 asks about the
battle rules and the first characters, each question with a proposed default.
**Working title:** Realm Arena (see the appendix)
**Genre:** Turn-based tactical squad battles, XCOM-style
**Players:** 2–4, free-for-all or two teams of two
**Session shape:** one battle per match, about four days whatever the player
count, played a turn at a time in spare minutes
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
| 2–4 players | §11.1, answer 2 |
| Free-for-all *and* teams of two (§5.2) | §11.2, answer 1 |
| A match keeps a similar pace whatever the player count, so battles shrink as players are added (§4) | §11.2, answer 2 |
| Progression unlocks new characters or equipment, each with a points cost. Unlocks are sidegrades, earned across all your matches (§7) | §11.1, answer 1; §11.2, answer 3 |
| A character is a single figure with its own HP (§10) | §11.2, answer 4 |
| No permanent death (§7) | §11.2, answer 5 |
| The first playable version (§10) | §11.2, answer 6 |
| The same fantasy world as Defender of the Realm | §11.1, answer 4 |
| Built before Defender of the Realm | §11.1, answer 7 |
| The name: Realm Arena | §11.1, answer 6 |

---

## 4. Why it fits asynchronous play

- **The hand-off budget works, because battles shrink as players are
  added.** Every player takes a turn each battle round, so the hand-offs grow
  with the table. At roughly three hours a hand-off:

  | Players | Hand-offs per battle round | 10 battle rounds | 20 battle rounds |
  |---:|---:|---|---|
  | 2 | 2 | 20: about 2½ days | 40: about 5 days |
  | 3 | 3 | 30: about 4 days | 60: about 7½ days |
  | 4 | 4 | 40: about 5 days | 80: about 10 days |

  *Agreed in round 2:* a match keeps a similar pace whatever the player count
  (§11.2, answer 2). So a battle holds to about 30 hand-offs, roughly four
  days. That's 15 battle rounds for two players, 10 for three and 8 for four
  (§13, question 15). More players means a smaller squad each (§6), and
  missions that bring squads into contact early (§13, question 14).
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
   gets two actions (§13, question 4). Hit chances depend on cover, flanking
   and high ground (§9; §13, questions 5–7).
4. **End.** The battle ends at the turn limit, or when only one squad (or
   team) is left on the battlefield (§5.1).

### 5.1 Every battle has a winner

*Proposal*, for any number of players:

- **Missions score points.** The objective depends on the mission: hold a
  point, carry a relic off the map, destroy a target. Knocking out an enemy
  character also scores (§13, question 14).
- **The battle ends** at the turn limit, or when only one squad (or team) is
  left. Being the last one standing ends the battle but doesn't win it on its
  own: the score does.
- **The highest score wins.** If scores are level, the side with more of its
  points' worth still standing wins. If that's level too, the later seat in
  the turn order wins, which also makes up for the advantage of going early.
- **A wiped-out squad** takes no more turns. The rotation steps past it, as it
  does a dropped player, and its score stands. Since the score decides, a
  player knocked out early can still place.

### 5.2 Three and four players: everyone for themselves, and teams

Round 2 chose both (§11.2, answer 1): free-for-all for three or four players,
and teams of two for four.

| | **Free-for-all** (3–4 players) | **Teams** (two against two) |
|---|---|---|
| Turns | One player at a time: 3–4 hand-offs per battle round | Seats alternate between the teams (A1, B1, A2, B2), so no team moves twice in a row. Later, teammates could share a turn (below) |
| Scoring | Each player scores alone. The leader becomes everyone's target, which keeps a lead from running away | The team scores together |
| Knocked out | A wiped-out player keeps their score but takes no more turns | Their teammate plays on |
| Risks | Two players ganging up on a third; a player knocked out early waits for the end | Coordinating needs chat, which the app already has |
| Fit with the platform | As it is: a rotation of seats | As it is, with alternating seats |

*Build order:* two players first, then free-for-all, then teams. All three fit
the platform as it is.

**A later speed-up for teams: the shared turn.** Teammates move in the same
turn, in either order, and the turn passes once both have finished. That makes
two hand-offs per battle round instead of four, as fast as a two-player game,
so a team battle could run the full 15 rounds. It waits on the slower
teammate, and it needs two players active at once, which the platform's
one-at-a-time turn doesn't do today (`defender-of-the-realm.md` §3.3).

---

## 6. Keeping turns short

Moving the whole squad in one turn keeps the hand-offs down (§4), but it also
makes a turn long: two actions for each of eight characters is sixteen
decisions. There are two ways to keep it short:

- **Squad size.** The points budget sets it. Aim for 4–6 characters in a
  two-player battle, falling to 3–4 at four players (§13, question 13). That
  keeps each turn to a couple of minutes, keeps a four-squad battlefield
  readable on a phone, and helps the battle fit the hand-off budget (§4).
- **Quick defaults.** Any character you don't touch holds its ground when you
  end the turn, going on overwatch or hunkering down in cover. A turn where
  only two characters need to move takes seconds.

Alternating activations, where each turn moves only a few characters, would
make battles more reactive. But it multiplies the hand-offs, so it doesn't fit
the budget.

---

## 7. Progression: unlocks

Round 1 pointed progression at **unlocks**: new characters, which give more
flexibility, or new equipment for characters, each with a points cost (§11.1,
answer 1). Round 2 agreed the shape below (§11.2, answers 3 and 5). The one
thing still to design is how progress is earned.

- **Unlocks are sidegrades, giving more choice** (agreed). A new character or
  piece of equipment is different, not stronger. Its points cost is set so
  that it's worth what it replaces. A newer player isn't outgunned, just has
  fewer options. And since mustering is sealed (§5), having more options
  can't be used to counter-pick.
- **They're earned across all your matches of Realm Arena** (agreed). That's
  state belonging to a player, not to any one game, which the platform
  doesn't have yet. An unlock list is the lightest kind of that state.
  There's no roster of named characters with their own levels and wounds to
  keep.
- **No permanent death** (agreed). A character who falls is only out of that
  battle.
- **A starter set is enough to play well.** Each faction's basic characters
  are there from the first match.
- **Equipment is picked at muster** and costs points like a character does.
  It lasts for that battle only.
- *Proposal:* **progress comes from playing.** Every battle earns progress
  towards the next unlock, win or lose. Winning earns more.

v0.1 considered two other readings of "progression". One was a **company**:
named troops that level up across all your matches. The other was a
**series**: several battles against the same opponent, with survivors
carrying over. Unlocks replace the company with something lighter and fairer.
The series could still come back later as a match format built on top.

---

## 8. Fog of war (not decided)

Still open. The first playable version has none (§10).

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
famous all-or-nothing miss with grazes (§13, question 6), so a shot that
misses doesn't always feel like robbery. The server makes and records every
roll, as every game here does, so a replay shows the same result.

---

## 10. Shared with Defender of the Realm

The two games share a similar fantasy world (§11.1, answer 4). Both fight on a
small grid battlefield. These parts are worth building once:

- **The battlefield:** grid, terrain, cover, line of sight, pathfinding, and
  the board component that draws it.
- **The catalogue:** character and troop types, their abilities, factions and
  art. Each game shows them in its own way. Here, a character is a single
  figure with its own HP, as in XCOM (agreed, §11.2, answer 4). In Defender of
  the Realm, a troop is a number of soldiers who each have HP
  (`defender-of-the-realm.md` §18.5). An archer is still an archer in both.

What can't be shared is the rulebook. In this game players take turns and roll
to hit. In Defender of the Realm, orders play out together and predictably
(`defender-of-the-realm.md` §13.3).

**This game is built first** (§11.1, answer 7). It's the smaller of the two,
it fits the platform as it stands, and it builds the battlefield both games
need. Defender of the Realm then adds the overworld, sealed orders and the
replay on top.

The build order, agreed in round 2 (§11.2, answer 6):

1. **First playable:** two players, one faction (a mirror match), one mission,
   one battlefield, and a points budget spent from a fixed set of characters.
   No fog of war and no unlocks.
2. **Then:** more missions and battlefields, then free-for-all for three and
   four players, then teams (§5.2).
3. **Then:** unlocks (§7), and fog of war if it's chosen (§8).
4. **Then:** more factions.

---

## 11. Questions and answers

### 11.1 Round 1

Asked in v0.1 and answered in round 4 of Defender of the Realm's design
(`defender-of-the-realm.md` §7.8).

1. **Progression: a company that lasts, or a series of battles?** Still to be
   decided. It could be unlocking new characters, which give more
   flexibility, or new equipment for characters. Each would have a points
   cost.
2. **Players:** more than two. Maybe up to four.
3. **Can troops die for good?** Not answered in round 1; answered in §11.2.
4. **One world or two?** The two games should share a similar fantasy world.
5. **Fog of war?** Still open (§8).
6. **A name:** Realm Arena.
7. **Build this game first?** Yes.

### 11.2 Round 2

1. **Three and four players: free-for-all, teams of two, or both?** Both.
2. **Should battles get shorter as players are added?** A match should keep a
   similar kind of pace. It doesn't need to slow down for more players.
3. **Unlocks as sidegrades, earned across all your matches?** Yes: sidegrades,
   giving more choice.
4. **Characters as single figures with their own HP?** Single figures.
5. **Permanent death?** No.
6. **Is the first playable the right place to start?** Yes.
7. **Move on to the battle rules and the first characters?** Yes. Ask about
   them (§13).

---

## 12. Questions (round 2)

Answered in §11.2.

---

## 13. Battle rules and the first characters (round 3 questions)

Each question comes with a proposed default. A "yes" takes the default. The
numbers are first guesses for playtesting, not balance.

### 13.1 The battlefield

1. **Squares or hexes?** *Default: squares.* XCOM's cover sits along the edges
   of squares, and line of sight and flanking are easier to read on a phone.
   Hexes make movement fairer, but give six directions to flank from.
2. **How big?** *Default: 12×12 squares for two players, 16×16 for three or
   four.* A board too big for the column wears `BoardZoom`, like every other
   large board in the app.
3. **What's on it?** *Default:*
   - **Half cover** (low walls, fences, barrels) and **full cover** (high
     walls, rocks), on the edges between squares.
   - **Blocking terrain** (buildings, cliffs).
   - **One level of high ground** (a hill or a rampart): +10% to hit from
     above.
   - Nothing destructible in the first playable version.

### 13.2 A turn

4. **What can a character do?** *Default: XCOM's two actions per character
   per turn.* Moving uses one action, so moving twice is a dash. Attacking,
   using most abilities, going on overwatch or hunkering down ends that
   character's turn. Characters act in any order you like.

### 13.3 Hitting and damage

5. **How is the chance to hit worked out?** *Default: a few steps you can read
   at a glance, shown as one percentage before you commit.* Each weapon has
   an accuracy (a bow, say, 80%). Half cover takes off 20 and full cover 40.
   High ground adds 10. A flanked target (no cover between you) loses its
   cover. A weapon can't shoot past its range; there's no fall-off to work
   out.
6. **Grazes?** *Default: a shot that misses by 10 or less grazes, for half
   damage.* An 80% shot is then 80% hit, 10% graze and 10% clean miss.
7. **How much damage?** *Default: fixed per weapon.* A sword always does 4, so
   the only luck is hit, graze or miss. Flanking also adds +1 damage, instead
   of XCOM's critical hits. Characters have about 5–12 HP.

### 13.4 Melee, overwatch and abilities

8. **How does melee work?** *Default:* it needs to be next to the target, and
   it always hits, with no roll. Every melee character can **charge**: move
   up to its full movement and strike in one action. The risk is getting
   there, because moving past watchful enemies sets off their reactions
   (question 9).
9. **Reactions on other players' turns?** *Default:* ranged characters use
   **overwatch**: the first enemy that moves where they can see it takes a
   shot at −15%. Melee characters use **guard**: the first enemy that steps
   next to them takes a strike. Each character reacts once per battle round.
   Sneaking doesn't set off either (the Scout, question 12), as in Defender
   of the Realm (`defender-of-the-realm.md` §18.4).
10. **How often can abilities be used?** *Default: each character has one or
    two abilities, each with a cooldown of two or three turns.* That keeps
    them in play over a long battle. The alternative is once per battle,
    which is simpler to read but makes them rarer.
11. **What happens at 0 HP?** *Default:* the character is **down**, out of the
    battle, and its points count for whoever knocked it out. A Cleric can
    raise a downed ally next to them, once per battle, at half HP. Being
    raised doesn't take back the points already scored. After the battle
    everyone is fine (no permanent death).

### 13.5 The first characters

12. **The first faction, and its six characters?** *Default: a human kingdom,
    the Realm that both games are named for, which would also be Defender of
    the Realm's first faction.* Its first six characters:

    | Character | Role | Attack | Ability (cooldown) | Points |
    |---|---|---|---|---:|
    | **Man-at-arms** | Cheap front line | Sword, melee, 4 | **Cleave:** strike two enemies next to them (3) | 15 |
    | **Knight** | Slow and very tough | Mace, melee, 4 | **Shield wall:** allies next to the Knight count as in half cover until its next turn (3) | 25 |
    | **Archer** | Long range; the overwatch specialist | Bow, 80%, 3 | **Aimed shot:** +20% to hit, using both actions (2) | 20 |
    | **Scout** | Fastest and fragile; the flanker | Knives, melee, 3 | **Sneak:** move at half speed without setting off overwatch or guard (2) | 20 |
    | **Mage** | Fragile; hits an area | Bolt, 70%, short range, 3 | **Fireball:** hits every character in a 3×3 area, friend or foe (3) | 30 |
    | **Cleric** | Support | Staff, melee, 2 | **Heal:** restore 4 HP to an ally next to them (2); **Raise:** once per battle (question 11) | 25 |

    Is that the right six? Is anything missing, such as cavalry, a spearman to
    stop charges, or a beast?
13. **Budget and costs?** *Default:* 100 points each for two players, 80 for
    three, and 70 each for four (free-for-all or teams). That's 4–6
    characters at two players and 3–4 at four. You can take up to two of any
    one character.

### 13.6 The first mission

14. **Which mission comes first?** *Default: Hold the Centre.* A marked area
    in the middle of the battlefield.
    - At the end of **your own turn**, if you have characters in it and no
      enemy does, you score 5. Scoring on your own turn gives every seat the
      same number of chances, rather than favouring whoever moves last in a
      round.
    - A knock-out scores the fallen character's points cost ÷ 5 (3–6
      points).

    This mission brings squads together early, which the hand-off budget
    needs (§4). It works the same in free-for-all and in teams.
15. **How long is a battle?** *Default:* 15 battle rounds for two players, 10
    for three, and 8 for four (and for teams taking alternate seats). That's
    about 30 hand-offs, roughly four days, whatever the player count (§4).

---

## Appendix: Working title

"Realm Arena", chosen in round 4. The shared "Realm" ties it to Defender of the
Realm, its sibling in the same world.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Split out of Defender of the Realm (its §17), as `squad-tactics.md`. Concept, draft pillars, why it fits async play, a sketch of a match with a winner every time, keeping turns short, two readings of progression, fog of war, luck, what's shared with Defender of the Realm and a build order; round-1 questions. |
| 0.2 | Named Realm Arena, renamed to `realm-arena.md`. Round-1 answers recorded (§11). 2–4 players: the hand-off budget by player count, with battles shrinking as players are added (§4), scoring and a winner for any number of players (§5.1), and free-for-all against teams (§5.2). Progression becomes unlocks, as sidegrades earned across all your matches (§7). Shares a fantasy world with Defender of the Realm; characters are single figures here and troops there (§10). A first playable scope (§10). Round-2 questions (§12). |
| 0.3 | Round-2 answers recorded (§11.2) and folded in: both free-for-all and teams, with teams taking alternate seats and a shared team turn as a later speed-up (§5.2); a similar pace at every player count, holding a battle to about 30 hand-offs (§4); unlocks as sidegrades earned across matches, and no permanent death (§7); single figures (§10); the first playable scope agreed (§10). Adds round-3 questions on the battle rules and the first characters, each with a proposed default (§13). The working title moves to an appendix. |
