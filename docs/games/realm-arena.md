# Realm Arena — Game Design Document

**Status:** Concept, v0.4. Split out of Defender of the Realm in its third
round of design, when one concept became two games
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). This is the
one to build first (§10). §11 records the answers so far. §13 is the first
draft of the battle rules and the first characters, settled in round 3. §14
asks the questions that draft raises.
**Working title:** Realm Arena (see the appendix)
**Genre:** Turn-based tactical squad battles, XCOM-style
**Players:** 2–4, free-for-all or two teams of two
**Session shape:** one battle per match, four to six days (longer with more
players), played a turn at a time in spare minutes
**Setting:** the same fantasy world as Defender of the Realm (§10)

---

## 1. High concept

Two to four players each build a squad of characters from a limited budget of
points, then fight one battle, XCOM-style. It's a large grid battlefield with
cover, flanking, overwatch, and characters with abilities. Players take turns.
One turn moves your whole squad, and fits into the time it takes the kettle to
boil. Every battle has a winner. Between battles, players unlock new
characters and equipment to choose from (§7).

**One-line pitch:** *XCOM in the gaps of your day.*

---

## 2. Design pillars (draft)

| Pillar | How it shows |
|---|---|
| **Real XCOM, move by move** | Players take turns. Each character spends its action points, and reaction fire happens on other players' turns |
| **A turn fits a kettle boil** | One turn moves the whole squad in a minute or two. Squad size, tap-to-move and quick defaults keep it that way (§6) |
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
| Battles have fewer rounds as players are added, but not so many fewer that a bigger battle is over as quickly: a bigger battle lasts longer (§13.8) | §11.2, answer 2; §11.3, answer 15 |
| Progression unlocks new characters or equipment, each with a points cost. Unlocks are sidegrades, earned across all your matches (§7) | §11.1, answer 1; §11.2, answer 3 |
| A character is a single figure with its own HP (§10) | §11.2, answer 4 |
| No permanent death (§7) | §11.2, answer 5 |
| The first playable version (§10) | §11.2, answer 6 |
| A large battlefield: 36×48 squares for two players, 48×48 for three or four (§13.1) | §11.3, answer 2 |
| About four action points per character per turn, with some things costing more than one (§13.2) | §11.3, answer 4 |
| Overwatch can react more than once, depending on the AP left (§13.4) | §11.3, answer 9 |
| The rest of the first battle rules and the first six characters, as proposed (§13) | §11.3 |
| The same fantasy world as Defender of the Realm | §11.1, answer 4 |
| Built before Defender of the Realm | §11.1, answer 7 |
| The name: Realm Arena | §11.1, answer 6 |

---

## 4. Why it fits asynchronous play

- **The hand-off budget works, if battles are kept to a sensible length.**
  Every player takes a turn each battle round, so the hand-offs grow with the
  table. At roughly three hours a hand-off:

  | Players | Hand-offs per battle round | 10 battle rounds | 15 battle rounds |
  |---:|---:|---|---|
  | 2 | 2 | 20: about 2½ days | 30: about 4 days |
  | 3 | 3 | 30: about 4 days | 45: about 5½ days |
  | 4 | 4 | 40: about 5 days | 60: about 7½ days |

  Round 2 asked for a similar pace whatever the player count (§11.2, answer
  2). Round 3 refined that: bigger battles shouldn't lose rounds as fast, and
  should last longer (§11.3, answer 15). So battle rounds fall gently as
  players are added, from 15 at two players to 12 at four: about four days
  at two players and six at four (§13.8).
- **Nobody sits idle.** Players on this platform already have several games
  in play at once. A battle waiting on someone else is just one of them. At
  four players, though, three other turns come between each of yours, so
  expect two or three turns a day.
- **It's the platform's own shape**, as long as each player takes their own
  turn: a rotation of seats with one player active at a time, a command per
  action, and a turn timer. Reaction fire (overwatch and guard) goes off
  during another player's turn. The server resolves it as part of that
  player's command, so it needs no out-of-turn action. Teams sharing a turn
  would be new (§5.2).
- **A missed turn is cheap.** If the turn timer runs out, the squad holds its
  ground: every character puts its AP into overwatch or guard, the same
  default as a turn you end early (§6). No computer opponent is needed. A
  player who keeps missing turns is dropped the way every game here drops
  them (`ARCHITECTURE.md` §7). Their squad leaves the battlefield, and their
  score stands.

---

## 5. A match (sketch)

1. **Setup.** The host picks a mission, a battlefield and the points budget.
   The budget shrinks as players are added (§13.6).
2. **Muster and deploy.** Each player spends the budget on characters and
   equipment, and places their squad in their own deployment zone. This is
   one sitting, and it stays sealed until everyone is done, so nobody can
   counter-pick. (Sealed choices are hidden state: see §8.)
3. **Battle.** Players take turns in seat order. On your turn each character
   has four action points to spend (§13.2). Hit chances depend on cover,
   flanking and high ground (§13.3).
4. **End.** The battle ends at the turn limit, or when only one squad (or
   team) is left on the battlefield (§5.1).

### 5.1 Every battle has a winner

*Proposal*, for any number of players:

- **Missions score points.** The objective depends on the mission: hold a
  point, carry a relic off the map, destroy a target. Knocking out an enemy
  character also scores (§13.7).
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
two hand-offs per battle round instead of four, as fast as a two-player game.
It waits on the slower teammate, and it needs two players active at once,
which the platform's one-at-a-time turn doesn't do today
(`defender-of-the-realm.md` §3.3).

---

## 6. Keeping turns short

Moving the whole squad in one turn keeps the hand-offs down (§4), but it also
makes a turn long. Four AP for each of six characters could be two dozen
decisions. Three things keep it short:

- **Squad size.** The points budget sets it: 4–6 characters in a two-player
  battle, falling to 3–4 at four players (§13.6). That keeps a four-squad
  battlefield readable on a phone too.
- **Tap to move.** The board shades how far a character can go for 1, 2, 3
  and 4 AP. Tapping a square spends what it takes, so a long move is one tap,
  not four (§13.2).
- **Quick defaults.** When you end your turn, any character with AP left puts
  them into overwatch (if it's ranged) or guard (if it fights in melee)
  (§13.4). A turn where only two characters need to move takes seconds.

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
- **A starter set is enough to play well.** Each faction's first six
  characters (§13.6) are there from the first match. The characters that
  round 3 wondered about (cavalry, a spearman to stop charges, a beast) are
  natural first unlocks.
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
- **The bigger battlefield (§13.1) adds weight to this side.** On a 36×48
  board with every position public, a player can watch the whole battle from
  the far end before committing. XCOM's maps are as big as they are partly
  because fog makes crossing them tense.

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
(`defender-of-the-realm.md` §7.3, answer 10). Grazes soften XCOM's famous
all-or-nothing miss (§13.3), so a shot that misses doesn't always feel like
robbery. The server makes and records every roll, reaction fire included, as
every game here does, so a replay shows the same result.

---

## 10. Shared with Defender of the Realm

The two games share a similar fantasy world (§11.1, answer 4). Both fight on a
grid battlefield. These parts are worth building once:

- **The battlefield:** grid, terrain, cover, line of sight, pathfinding, and
  the board component that draws it.
- **The catalogue:** character and troop types, their abilities, factions and
  art. Each game shows them in its own way. Here, a character is a single
  figure with its own HP, as in XCOM (agreed, §11.2, answer 4). In Defender of
  the Realm, a troop is a number of soldiers who each have HP
  (`defender-of-the-realm.md` §18.5). An archer is still an archer in both.

The two battlefields differ in size. Realm Arena's is large (§13.1);
Defender of the Realm's is a small skirmish field
(`defender-of-the-realm.md` §18.6). The shared battlefield therefore has to
work at both scales, which `BoardZoom` already handles.

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
   (Round 3 refined this: see §11.3, answer 15.)
3. **Unlocks as sidegrades, earned across all your matches?** Yes: sidegrades,
   giving more choice.
4. **Characters as single figures with their own HP?** Single figures.
5. **Permanent death?** No.
6. **Is the first playable the right place to start?** Yes.
7. **Move on to the battle rules and the first characters?** Yes. Ask about
   them.

### 11.3 Round 3

v0.3 asked fifteen questions about the battle rules, each with a proposed
default. Round 3 answered the four below. The other eleven (1, 3, 5–8 and
10–14) took their defaults. §13 is the result.

2. **How big is the battlefield?** Much bigger. The smallest XCOM maps are
   48×72. It doesn't need to be that big on mobile: maybe 36×48 for two
   players, and 48×48 for three or four.
4. **What can a character do?** Agreed, except about four action points per
   turn, with some things costing more than one.
9. **Reactions on other players' turns?** Overwatch should allow more than one
   reaction, depending on how much AP is left.
15. **How long is a battle?** Bigger games shouldn't scale down as fast. They
    should last longer.

---

## 12. Questions (round 2)

Answered in §11.2.

---

## 13. Battle rules and the first characters (first draft)

The result of round 3 (§11.3). Where round 3 changed a proposed default, the
rule says so. The numbers are first guesses for playtesting, not balance.

### 13.1 The battlefield

- **Squares**, with cover along the edges between them.
- **Size:** 36×48 squares for two players, 48×48 for three or four (round 3).
  That's smaller than XCOM's smallest maps (48×72), because this is a phone.
- **What's on it:**
  - **Half cover** (low walls, fences, barrels) and **full cover** (high
    walls, rocks), along the edges between squares.
  - **Blocking terrain** (buildings, cliffs).
  - **One level of high ground** (a hill or a rampart): +10% to hit from
    above.
  - Nothing destructible in the first playable version.
- **Deployment zones** sit at opposite ends for two players, and in the
  corners for three or four, about 40 squares apart. At the speeds in §13.2,
  squads meet within two or three turns, and reach the centre (§13.7) sooner.

**A big board on a small screen.** At phone width, 36 columns works out at
about 10 pixels a square. That's fine for seeing the whole battle, and far too
small to tap. So the whole map is the overview, and the board spends most of
its time zoomed in:

- `BoardZoom` steps from the whole map down to a close zoom (its `maxWidth`),
  deep enough that about ten squares fill the width and each one is
  comfortable to tap. Pinch and ctrl-wheel zoom as usual.
- Selecting a character brings the view to it. A replay of other players'
  turns follows the action. Both use `BoardZoom`'s `focus`, the way Race Cars
  follows a car.
- The ground is better drawn as one image than as a shape per square, because
  a 48×48 board has 2,304 of them. Kingdom Builder's tile sheet is a
  precedent.

### 13.2 A turn: action points

**Each character has 4 action points (AP) per turn** (round 3). AP don't carry
over to your next turn, except as banked reactions (§13.4).

| Action | AP |
|---|---:|
| Move, up to the character's speed | 1 |
| Sneak (Scout only): move up to its speed without setting off reactions | 2 |
| Attack: shoot or strike | 2 |
| Aimed shot (Archer only) | 3 |
| Hunker down: double the cover against shots at it, until your next turn | 1, and ends the character's turn |
| Go on overwatch or guard | All the AP it has left (§13.4) |
| Use an ability | 1–3, depending on the ability (§13.6) |

- **Speed**, in squares per move: Knight 4, most characters 6, Scout 8. With
  all 4 AP spent on moving, that's 16–32 squares in a turn.
- **A charge is just moving and then striking** (1 + 2 AP), so it no longer
  needs a rule of its own.
- *Proposal:* **one attack per character per turn**, unless an ability says
  otherwise. Moving after an attack is allowed if AP are left (§14,
  question 3).
- **Tap to move.** The board shades how far a character can go for 1, 2, 3 and
  4 AP. Tapping a square spends what it takes.
- **Characters act in any order**, and you can switch between them mid-turn.

### 13.3 Hitting and damage

As proposed in v0.3 (defaults taken):

- **Chance to hit.** Each weapon has an accuracy (a bow, 80%). Half cover
  takes off 20 and full cover 40. High ground adds 10. A flanked target (no
  cover between you) loses its cover. It's shown as one percentage before you
  commit.
- **Range.** A weapon can't shoot past its range, and there's no fall-off to
  work out. Ranges are in the character table (§13.6), scaled to the bigger
  board.
- **Grazes.** A shot that misses by 10 or less grazes, for half damage. An 80%
  shot is then 80% hit, 10% graze and 10% clean miss.
- **Damage is fixed per weapon.** A sword always does 4, so the only luck is
  hit, graze or miss. Flanking adds +1 damage, instead of XCOM's critical
  hits. Characters have about 5–12 HP.
- **Melee** needs to be next to the target, and always hits, with no roll.

### 13.4 Reactions: overwatch and guard

- **Going on overwatch** (ranged) **or guard** (melee) spends all the
  character's remaining AP and banks them until your next turn.
- **Each reaction costs 2 AP from the bank** (round 3). So 4 banked AP buy two
  reactions, and 2 or 3 buy one. A character that only moved once still has a
  shot saved up.
- **Overwatch:** a shot at −15% at an enemy that moves where it can see.
  **Guard:** a strike at an enemy that steps next to it.
- **A character reacts at most once to each move an enemy makes.** An enemy
  that moves four times can draw two reactions from one watcher, but a single
  step can't soak up a whole bank.
- **Banked AP not used by your next turn are lost.** Every character starts
  its turn with a fresh 4.
- **Sneaking sets off neither.**
- **Resolving reactions.** The server resolves reactions as part of the moving
  player's command, nearest watcher first, and records every roll.
- **Balance to watch.** A squad all on overwatch can lock down open ground.
  The answers are moving from cover to cover, sneaking and hunkering down. If
  playtesting shows that's not enough, raise the overwatch penalty or the
  cost of a reaction.

### 13.5 Abilities and downed characters

As proposed in v0.3 (defaults taken), with AP costs added:

- **Each character has one or two abilities**, each with an AP cost (§13.6)
  and a cooldown of two or three turns.
- **At 0 HP a character is down**: out of the battle, and its points count for
  whoever knocked it out (§13.7).
- **A Cleric can raise a downed ally** next to them, once per battle, at half
  HP. Being raised doesn't take back the points already scored.
- **After the battle everyone is fine.** There's no permanent death (§7).

### 13.6 The first faction and its characters

As proposed in v0.3 (defaults taken): a human kingdom, the Realm that both
games are named for. It would also be Defender of the Realm's first faction.

| Character | Role | Speed | Attack | Ability (AP, cooldown) | Points |
|---|---|---:|---|---|---:|
| **Man-at-arms** | Cheap front line | 6 | Sword, melee, 4 | **Cleave:** strike two enemies next to them (2 AP, 3 turns) | 15 |
| **Knight** | Slow and very tough | 4 | Mace, melee, 4 | **Shield wall:** allies next to the Knight count as in half cover until its next turn (2 AP, 3 turns) | 25 |
| **Archer** | Long range; the overwatch specialist | 6 | Bow, 80%, range 20, 3 | **Aimed shot:** +20% to hit (3 AP, 2 turns) | 20 |
| **Scout** | Fastest and fragile; the flanker | 8 | Knives, melee, 3 | **Sneak:** move without setting off reactions (2 AP a move, no cooldown) | 20 |
| **Mage** | Fragile; hits an area | 6 | Bolt, 70%, range 10, 3 | **Fireball:** hits every character in a 3×3 area, friend or foe, up to 12 squares away (3 AP, 3 turns) | 30 |
| **Cleric** | Support | 6 | Staff, melee, 2 | **Heal:** restore 4 HP to an ally next to them (2 AP, 2 turns). **Raise:** once per battle (3 AP) | 25 |

**The budget:** 100 points each for two players, 80 for three, and 70 each for
four (free-for-all or teams). That's 4–6 characters at two players and 3–4 at
four. You can take up to two of any one character.

### 13.7 The first mission: Hold the Centre

As proposed in v0.3 (default taken):

- **The centre** is a marked area in the middle of the battlefield, about 6×6
  squares on the bigger board.
- **At the end of your own turn**, if you have characters in it and no enemy
  does, you score 5. Scoring on your own turn gives every seat the same
  number of chances, rather than favouring whoever moves last in a round.
- **A knock-out** scores the fallen character's points cost ÷ 5 (3–6 points).

It brings squads together early, and works the same in free-for-all and in
teams.

### 13.8 How long a battle lasts

*Changed in round 3:* bigger battles shouldn't lose rounds as fast, and should
last longer. *Proposal:*

| Players | Battle rounds | Hand-offs | Roughly |
|---:|---:|---:|---|
| 2 | 15 | 30 | 4 days |
| 3 | 13 | 39 | 5 days |
| 4 (free-for-all, or teams in alternate seats) | 12 | 48 | 6 days |

With a shared team turn (§5.2), a team battle could run 15 rounds in 30
hand-offs.

---

## 14. Questions (round 4)

1. **AP per character** (§13.2): does every character get its own 4 AP, rather
   than the squad sharing a pool?
2. **AP costs** (§13.2): move 1, sneak 2, attack 2, aimed shot 3, hunker down
   1, overwatch or guard everything that's left. Is that about right?
3. **Attacking** (§13.2): one attack per character per turn, with moving
   afterwards allowed if AP are left? Or XCOM's rule, where attacking ends
   the character's turn?
4. **Quick defaults** (§6, §13.4): should AP left at the end of your turn go
   into overwatch or guard automatically, with a way to switch it off for a
   character?
5. **Speeds and ranges** (§13.2, §13.6): speed 4, 6 or 8 squares a move, bow
   range 20, bolt 10, fireball 12. About right for the bigger board?
6. **Battle length** (§13.8): 15, 13 and 12 rounds, roughly four, five and six
   days?
7. **Fog of war** (§8): the bigger board makes it more worthwhile. Revisit it
   now, or keep it for after the first playable?
8. **Next, the first battlefield:** hand-made first and generated later? And
   what should it be: a village square, a ruined fort, a forest crossroads?

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
| 0.4 | Round-3 answers recorded (§11.3). §13 becomes the first draft of the battle rules: a 36×48 or 48×48 battlefield, with how it's shown on a phone (§13.1); four action points per character, with a cost table, speeds, and a charge that is now just moving and striking (§13.2); ranges scaled to the bigger board (§13.3); overwatch and guard banking AP for several reactions (§13.4); AP costs for abilities (§13.5–§13.6); battle rounds falling gently with player count, so bigger battles last longer (§4, §13.8). Fog of war gains a point in its favour (§8). Round-4 questions (§14). |
