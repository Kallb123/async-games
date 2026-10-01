# Realm Arena — Game Design Document

**Status:** Design agreed for the first playable version, v0.9. Split out of
Defender of the Realm in its third round of design, when one concept became
two games ([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). This
is the one to build first (§10). §11 records every answer. §13 is the battle
rules and the first characters, settled in rounds 3–6, and §15 is the first
battlefield, a ruined fort. §17 is the implementation plan, agreed in round
6. Building starts once this doc has merged (§11.6, answer 6).
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
| Every character has its own AP, spent however the player likes, at the costs in §13.2 | §11.4, answers 1–3 |
| AP left at the end of a turn go into overwatch or guard automatically (§6) | §11.4, answer 4 |
| Speeds, ranges and battle length as proposed (§13.2, §13.6, §13.8) | §11.4, answers 5–6 |
| Fog of war is revisited after the first playable version (§8) | §11.4, answer 7 |
| The first battlefield is hand-made: a ruined fort (§15) | §11.4, answer 8 |
| The fort's layout as sketched, and the rest of round 5's defaults (§15, §13) | §11.5 |
| Every square has a movement cost, and low cover can be climbed over for extra movement. Each character has a movement allowance that 1 AP buys (§13.1, §13.2) | §11.5, answer 5 |
| Nobody can stop on low cover; cover sits in squares (§13.1) | §11.6, answers 1–2 |
| A timed-out muster musters a ready-made squad (§17.2) | §11.6, answer 3 |
| The implementation plan, in its order (§17) | §11.6, answer 4 |
| The first playable version ships with placeholder art (§17.3, PR 9) | §11.6, answer 5 |
| No code until this design doc has merged | §11.6, answer 6 |
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
- **Quick defaults** (agreed in round 4). When you end your turn, any
  character with AP left puts them into overwatch (if it's ranged) or guard
  (if it fights in melee) (§13.4). You can switch this off for a character
  that should keep still and quiet. A turn where only two characters need to
  move takes seconds.

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

Still open. Round 4 left it until after the first playable version, which has
none (§11.4, answer 7; §10).

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

### 11.4 Round 4

1. **AP per character?** Each character gets around 4 AP.
2. **The AP costs?** Look good.
3. **One attack per turn, or does attacking end the turn?** Neither: the
   player can spend their AP however they want.
4. **Automatic overwatch or guard with AP left over?** Makes sense.
5. **Speeds and ranges?** Look good.
6. **Battle length: 15, 13 and 12 rounds?** Agreed.
7. **Fog of war: now or later?** Revisit it later.
8. **The first battlefield?** Hand-made first. A ruined fort would be good
   (§15).


### 11.5 Round 5

Round 5 answered the three below. The other six (2–4 and 6–8) took their
defaults: the map is the same for both players turned upside down, the centre
starts scoring in round 3, high ground is on the towers only, a target is
flanked when none of its cover lies between it and the attacker, walls and
full cover block sight, and only area abilities hit allies.

1. **The fort's shape?** Yes.
5. **Moving diagonally?** Yes, 1.5 squares. Squares also have a movement cost:
   you can go over half cover for extra movement. Each character has a
   movement allowance it can spend for 1 AP (§13.1, §13.2).
9. **What next?** The implementation plan (§17).

### 11.6 Round 6

1. **Can a character stop on low cover?** No.
2. **Cover in squares, not along edges?** Yes.
3. **A timed-out muster?** A ready-made squad.
4. **The plan's order?** Yes.
5. **Art?** Placeholder art.
6. **Where does PR 1 start?** No PR yet. The design document should merge
   first.

---

## 12. Questions (round 2)

Answered in §11.2.

---

## 13. Battle rules and the first characters (first draft)

The result of rounds 3 and 4 (§11.3, §11.4). Where an answer changed a
proposed default, the rule says so. The numbers are first guesses for playtesting, not balance.

### 13.1 The battlefield

- **Squares.** Cover sits *in* squares, not along the edges between them.
  This changed in round 5: once every square has a movement cost and low
  cover can be climbed over (§11.5, answer 5), cover has to be something you
  step across. One kind of terrain per square also makes a map a plain grid
  of letters to draw by hand.
- **Size:** 36×48 squares for two players, 48×48 for three or four (round 3).
  That's smaller than XCOM's smallest maps (48×72), because this is a phone.
- **What's on it**, and what each square costs to move into (round 5):

  | Terrain | Movement cost | Cover for a character next to it | Sight |
  |---|---:|---|---|
  | Open ground | 1 | None | Clear |
  | Low cover: rubble, low walls, fallen pillars, barrels | 3 to climb over. You can't stop on it | Half | Clear |
  | High cover: walls, trees, fallen stone | Can't be entered | Full | Blocked |
  | Tower stair | 2 | None | Clear |
  | Tower top | 1 | None, but it's high ground: +10% to hit from above | Clear |

  - **A diagonal step** costs 1.5 times the square's cost (round 5). Nobody can
    cut diagonally past the corner of high cover.
  - **Cover comes from the side the attack comes from.** A character has cover
    against an attacker when a cover square is next to it on the attacker's
    side. High cover there gives full cover; otherwise low cover gives half.
    With neither, the character is flanked (§13.3).
  - Nothing destructible in the first playable version.
- **Deployment zones** sit at opposite ends for two players, and in the
  corners for three or four, about 40 squares apart. At the movement
  allowances in §13.2, squads meet within two turns. A character can even
  reach the centre (§13.7) on its first turn, which is why the centre starts
  scoring later (§15.3).

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

**Each character has its own 4 action points (AP) per turn** (rounds 3 and
4). AP don't carry over to your next turn, except as banked reactions
(§13.4). The costs below were agreed in round 4.

| Action | AP |
|---|---:|
| Move: spend up to the character's movement allowance | 1 |
| Sneak (Scout only): the same, without setting off reactions | 2 |
| Attack: shoot or strike | 2 |
| Aimed shot (Archer only) | 3 |
| Hunker down: double the cover against shots at it, until your next turn | 1, and ends the character's turn |
| Go on overwatch or guard | All the AP it has left (§13.4) |
| Use an ability | 1–3, depending on the ability (§13.6) |

- **Movement allowance** (round 5): each AP spent on moving buys the
  character's allowance of movement points: Knight 4, most characters 6,
  Scout 8. Each square along the way costs its movement cost (§13.1). A
  move's total cost is rounded up to whole AP. Points left over from the
  move's last AP are lost when it ends. Across open ground, all 4 AP on
  moving is 16–32 squares in a turn; through rubble, much less.
- **A charge is just moving and then striking** (1 + 2 AP), so it no longer
  needs a rule of its own.
- **Spend AP however you like** (round 4). You can attack twice, attack and
  then move, or move, attack and move again. The only limits are the AP and
  each ability's cooldown. Hunkering down is the one action that ends a
  character's turn, because it's a stance held until your next turn.
- **Balance to watch.** Two attacks in a turn double what one character can
  deal. A Man-at-arms does 8 in a turn, enough to down a Mage. That's
  XCOM-style lethality, and characters' HP (5–12) is the thing to tune if it's
  too much.
- **Tap to move.** The board shades how far a character can go for 1, 2, 3 and
  4 AP, counting every square's cost. Tapping a square takes the cheapest path
  there and spends what it takes.
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

| Character | Role | Movement per AP | HP | Attack | Ability (AP, cooldown) | Points |
|---|---|---:|---:|---|---|---:|
| **Man-at-arms** | Cheap front line | 6 | 8 | Sword, melee, 4 | **Cleave:** strike two enemies next to them (2 AP, 3 turns) | 15 |
| **Knight** | Slow and very tough | 4 | 12 | Mace, melee, 4 | **Shield wall:** allies next to the Knight count as in half cover until its next turn (2 AP, 3 turns) | 25 |
| **Archer** | Long range; the overwatch specialist | 6 | 6 | Bow, 80%, range 20, 3 | **Aimed shot:** +20% to hit (3 AP, 2 turns) | 20 |
| **Scout** | Fastest and fragile; the flanker | 8 | 6 | Knives, melee, 3 | **Sneak:** move without setting off reactions (2 AP a move, no cooldown) | 20 |
| **Mage** | Fragile; hits an area | 6 | 5 | Bolt, 70%, range 10, 3 | **Fireball:** 3 damage to every character in a 3×3 area, friend or foe, up to 12 squares away, with no roll (3 AP, 3 turns) | 30 |
| **Cleric** | Support | 6 | 7 | Staff, melee, 2 | **Heal:** restore 4 HP to an ally next to them (2 AP, 2 turns). **Raise:** once per battle (3 AP) | 25 |

**The budget:** 100 points each for two players, 80 for three, and 70 each for
four (free-for-all or teams). That's 4–6 characters at two players and 3–4 at
four. You can take up to two of any one character.

*Filled in by PR 2 (§17.3)*, where this section left a number or a case
open. All are first guesses for playtesting, kept in `characters.ts` and
`rules.ts`:

- **HP and Fireball's damage**, as in the table above.
- **Ranges are measured centre to centre, as the crow flies**, so a range
  reaches out in a circle. Overwatch needs the mover in range as well as in
  sight.
- **"Next to" is touching, side or corner**, unless high cover fills both
  corners between the two squares. It's what melee, guard, healing and raising
  need.
- **Flanking's +1 damage is for shots.** Melee always hits, with no cover to
  lose, so it doesn't get it.
- **A graze does half damage, rounded up**, so it always does something. A
  chance to hit stays between 0% and 100%, but the graze band counts from the
  chance before it stops at 0: a shot at −10% can't even graze.
- **Nobody reacts to a character mid-climb.** Overwatch and guard come as the
  mover lands on a square it could stop on, so anyone they down falls where
  they could stand, and a Cleric can raise them.
- **A fireball hits the whole 3×3**, walls or not, once its centre is in range
  and in sight.
- **A shield wall moves with the Knight.** Whoever is next to it when a shot
  comes in has at least half cover. It doesn't cover the Knight itself.
- **Healing is for an ally that is hurt**, and never takes it past full HP.
- **Raising** needs the fallen ally's square to be one a character can stand
  on, with nobody standing there. The raised character acts from its owner's
  next turn. Each Cleric raises once per battle.
- **Downing your own character** (a fireball's friendly fire) scores nobody
  anything.
- **A cooldown of *n* turns** counts down at the start of each of its owner's
  turns, so the ability is back *n* turns after it was used.
- **Going on watch needs at least 2 AP**, enough for one reaction. A character
  left with 1 AP at the end of a turn just loses it.
- **The ready-made squad** (§17.2) is a Knight, two Men-at-arms, an Archer and
  a Cleric at two players, spread along the middle of the deployment zone.
  It spends the whole budget, which is fixed by the player count; a budget the
  host picks would need the ready-made squad to fit it.

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
last longer. *Agreed in round 4:*

| Players | Battle rounds | Hand-offs | Roughly |
|---:|---:|---:|---|
| 2 | 15 | 30 | 4 days |
| 3 | 13 | 39 | 5 days |
| 4 (free-for-all, or teams in alternate seats) | 12 | 48 | 6 days |

With a shared team turn (§5.2), a team battle could run 15 rounds in 30
hand-offs.

---

## 14. Questions (round 4)

Answered in §11.4.

---

## 15. The first battlefield: the Ruined Fort (sketch)

Hand-made, as round 4 asked (§11.4, answer 8). This is the two-player map,
36 squares wide and 48 long (§13.1). Standing upright, it suits a phone held
the usual way. The mission is Hold the Centre (§13.7), and the centre is the
ruined keep.

### 15.1 The layout

Each cell below stands for a block of 3×3 squares, so this is the shape of
the map rather than every wall. Player A deploys along the top edge, player B
along the bottom.

```
     A  A  A  A  A  A  A  A  A  A  A  A
     .  .  T  .  .  ,  .  .  .  T  .  .
     .  ,  .  .  .  .  .  ,  .  .  .  T
     T  .  .  ,  .  .  .  .  ,  .  .  .
     .  .  ^  #  #  G  G  #  #  ^  .  .
     .  T  #  .  o  .  .  .  .  #  T  .
     .  .  =  .  .  .  .  o  .  #  .  .
     ,  .  #  .  o  C  C  .  .  #  .  ,
     ,  .  #  .  .  C  C  o  .  #  .  ,
     .  .  #  .  o  .  .  .  .  =  .  .
     .  T  #  .  .  .  .  o  .  #  T  .
     .  .  ^  #  #  G  G  #  #  ^  .  .
     .  .  .  ,  .  .  .  .  ,  .  .  T
     T  .  .  .  ,  .  .  .  .  .  ,  .
     .  .  T  .  .  .  ,  .  .  T  .  .
     B  B  B  B  B  B  B  B  B  B  B  B
```

| Mark | What it is |
|---|---|
| `A`, `B` | The two deployment zones |
| `.` | Open ground |
| `,` | Rubble: low cover (half cover; 3 movement to climb over) |
| `T` | Trees and fallen stone: high cover (full cover; can't be entered) |
| `#` | The fort's curtain wall: it blocks movement and sight, and gives full cover to anyone beside it |
| `^` | A corner tower: high ground (+10% to hit), climbed by a stair from inside the walls |
| `G` | The broken gate: a gap 6 squares wide |
| `=` | A breach: a 3-square gap choked with rubble, which is low cover. The climb over it is what makes it slower than the gate |
| `o` | Fallen pillars and low walls in the courtyard: low cover |
| `C` | The keep's ruins: the centre, 6×6 squares |

### 15.2 How it plays

- **It's the same for both players.** Turn the map upside down and it's
  unchanged, so neither side has the better approach.
- **Three ways in** for each player:
  - **The gate** is straight at the keep. It's the shortest way, and the most
    exposed, because every tower looks down on the courtyard behind it.
  - **The near breach** is on your side of a side wall: the west wall for A,
    the east wall for B. It's slower, but covered by rubble.
  - **Round the outside** runs along the flanks of the fort, past trees and
    fallen stone, to the enemy's side of the walls. It's the Scout's route.
- **The towers are the overwatch posts.** Your two nearer towers are a short
  climb from your gate. An Archer on one covers most of the courtyard (bow
  range 20; the keep is about a dozen squares away). Taking an enemy tower is how
  you break their hold on the centre.
- **The keep has cover inside**, from fallen pillars and low walls, so the
  side holding the centre can dig in. The attacker's answer is to come from
  two directions at once and flank.

### 15.3 One fix the layout needs

The deployment zones are about 20 squares from the keep, and straight
through the gate. With 4 AP, a character moving 6 squares per AP covers 24
squares, so it could reach the centre on the very first turn. The first
player would then score before the second has moved. *Proposal:* **the centre
starts scoring in round 3**, so both squads have two turns to get into
position (§16, question 3).

### 15.4 Three and four players

The 48×48 version for three or four players (§13.1) comes with free-for-all
(§10, build order step 2), so it can wait. The same idea carries over: a
square fort with a gate facing each corner's deployment zone, and a tower
between each pair of gates.

---

## 16. Questions (round 5)

Answered in §11.5.

---

## 17. Implementation plan

Two milestones. **A** is the first playable version agreed in §10: two
players, one faction, Hold the Centre on the Ruined Fort. **B** is everything
after it, in the order §10 set.

### 17.1 Principles

- **The game stays hidden until it's ready.** From PR 3, `meta.ts` carries
  `available: false`, which keeps Realm Arena out of the game library
  (`GameLibrary` filters on it). Its setup screen can still be reached by URL
  for playtesting. PR 10 turns it on.
- **Shared files change only when a guard test requires it.** The registry
  tests (`gameRegistry.test.ts`, `serializableRegistry.test.ts`) fail as soon
  as a `@serializable` class or a `meta.ts` exists without its wiring, so
  PR 3 makes every engine one-liner at once. After that, each remaining
  shared file is touched by one PR: the recap import (PR 8), the guide and
  tutorial registries (PR 9), and What's new with the share card (PR 10).
- **What the two games share is written to be shared from the start.** The
  battlefield's geometry (terrain, paths, sight and cover) goes in
  `src/utils/games/battlefield/`. It's game-agnostic, as `DiceRoll.ts` and
  `Cards.ts` are, because Defender of the Realm is committed to reusing it
  (§10). The board component starts in `src/games/RealmArena/components/`. It
  moves to `src/components/ui/` when Defender of the Realm needs a second
  copy, as AGENTS.md's second-copy rule says.
- **Replay data from the first command.** Every command that rolls records its
  rolls (PR 3), and the starting state is rebuilt from persisted fields. Those
  are the two things recap can never get back later (`new-game.md` §7).
- **Every PR passes the gates:** `npm run build`, `npx tsc --noEmit`,
  `npm run lint` and `npm test`, plus the review crew for what it touches
  (named for each PR below).
- **No What's new line until the game is announced** (PR 10), as with Kingdom
  Builder: one line, once.

### 17.2 Engine decisions

These are the decisions the PRs rest on. They're taken now because they can't
be cheaply changed once games are being played.

- **Three commands:**
  - `RealmArenaMuster`: the squad, and where each character stands.
  - `RealmArenaAct`: one action by one character. That's a move, a sneak, an
    attack, an aimed shot, an ability, hunkering down, or going on watch.
  - `RealmArenaEndTurn`: which characters keep still rather than go on watch.

  That's one general-purpose `Act` rather than a class per action, as
  `new-game.md` recommends (Solitaire has a single move command).
- **One action per command.** A player has to see a shot land before choosing
  the next action. So every action goes to the server and comes back with its
  result. A turn is a run of `Act` commands and one `EndTurn`, like a
  Settlements & Cities turn.
- **Reactions happen inside the command that sets them off.** A move that
  crosses an enemy's watch is one `Act`. The server walks the path, resolves
  each reaction in turn (nearest watcher first), and stops the mover if
  they're downed on the way. No out-of-turn commands are needed.
- **Rolls are recorded in order.** A move can set off any number of reactions,
  so each `Act` stores the rolls it used as a list (`recordedRolls`). Rolls
  are 1–100, drawn with `randomInt`.
- **The rules take rolls as inputs.** `rules.ts` never draws a random number.
  A command draws, records, and hands the rolls to pure functions. So the
  client can show the same hit chance the server will use, and tests can hand
  in any roll.
- **The muster is sealed.** Players muster in seat order, one turn each. Until
  the last player has mustered, `gameStateToModel` sends each player only
  their own squad. Everyone else's is left out of the response entirely, not
  just hidden on screen (`new-game.md`, "Don't leak hidden information").
  Recap follows the same rule.
- **A timed-out turn ends the way the player would have ended it.** A
  turn-timeout adapter runs `EndTurn`, so every character's AP go on watch,
  as a missed turn should (§4). A timed-out muster musters a ready-made
  squad in the deployment zone, so the battle can still start (agreed in
  round 6). Each faction's ready-made squad is part of its data (PR 2).
- **No dropout adapter at two players.** A two-player duel ends when one
  player stops turning up, which is what the platform already does without
  one. The adapter comes with free-for-all (B2).
- **The squads live in plain arrays** (`Schema.Types.Mixed`), so every
  `Execute` ends by calling one `markModified` helper (`new-game.md`,
  "Gotchas").

*Filled in by PR 3*, in `RealmArenaModels.ts` and `RealmArenaLogic.ts`:

- **A sealed squad stays off the battlefield.** Each muster is kept on its
  own until the last player's, and then every squad takes the field at once,
  with fighter ids in seat order. So until then nothing in a response is
  derived from anyone else's squad, not even a count or an id. A player sees
  only their own, as `myMuster`.
- **A turn begins on the hand-off.** `CheckEndTurn` passes the turn round the
  seats and gives the next player's characters their fresh AP, so a played,
  a timed-out and a replayed turn all begin the next one the same way.
- **A request keeps only what was checked.** An `Act` stores the action as
  `check` read it, a `Muster` each pick's character and square, and an
  `EndTurn` only the player's own characters to keep still.

### 17.3 Milestone A: the first playable version

**Goal:** two players can set up a match, muster sealed squads from the first
six characters, and fight Hold the Centre on the Ruined Fort to a winner, with
recap, a guide and a tutorial.

**PR 1 — The battlefield (pure functions, no UI, no persistence).** New files
only, and nothing imports them yet.

1. `src/utils/games/battlefield/terrain.ts`: the terrain types, with their
   movement costs, cover and sight (§13.1). Also the map format: one letter
   per square, plus deployment zones and objective areas.
2. `pathfinding.ts`: the cheapest path between two squares, with 1.5×
   diagonals and no cutting corners. Also every square reachable for a given
   number of movement points, which drives the tap-to-move shading.
3. `lineOfSight.ts`: whether one square can see another.
4. `cover.ts`: the cover a target has against an attacker: none (flanked),
   half or full.
5. `src/games/RealmArena/maps/ruinedFort.ts`: the Ruined Fort at full size
   (§15). Its test checks the map is unchanged when turned upside down, and
   that every deployment square can reach the centre.
6. Unit tests for each.

Reviewers: `caveman`.

**PR 2 — The rules (pure functions).**

1. `src/games/RealmArena/characters.ts`: the six characters and their
   abilities as data (§13.6), the points budget, and the ready-made squad a
   timed-out muster uses (§17.2).
2. `src/games/RealmArena/rules.ts`, importable by the client as well as the
   server. It covers:
   - the AP a path costs;
   - hit chance, grazes and damage (§13.3);
   - which watchers react to a move, and in what order (§13.4);
   - each ability's targets and effect;
   - knock-outs and raising;
   - scoring for the centre and for knock-outs (§13.7);
   - the end of the battle and the tie-break chain (§5.1).
3. Tests. For example: an 80% shot hits on 1–80, grazes on 81–90, and misses
   on 91–100.

Reviewers: `caveman`.

**PR 3 — The engine (models, commands and wiring; no UI).**

1. `RealmArenaModels.ts`:
   - the invitation, with `CreateGame` (two seats, seat order rolled);
   - `buildInitialRealmArenaState` (the map, empty squads, the muster
     phase);
   - the game document;
   - `gameStateToModel`, with the sealed muster.
2. `apiModels.ts`: the response DTOs.
3. `RealmArenaLogic.ts`: `RealmArenaGameType` (the rotation, the battle-round
   counter, the turn limit and the winner), and the three commands, each
   recording every roll it uses.
4. `meta.ts` with `available: false`, and the engine's one-liners: the
   `GameLogic` barrel, `gameCommands.ts`, `mongodb.ts` and `GAME_META`.
5. The turn-timeout adapter, registered in `turnTimeout.ts`.
6. Tests:
   - a `makeGame()`/`cmd()` harness, per `new-game.md`;
   - a whole battle played by two scripted squads, checking AP, HP and scores
     stay consistent throughout;
   - a sealed-muster test, asserting an opponent's squad is absent from
     `JSON.stringify(response)` until both players have mustered.

Reviewers: `croupier` (the sealed muster), `gremlin`, `rulebook` (the wiring).

**PR 4 — Setting up a match.**

1. `POST /api/newgame/realmarena`: creates the invitation, following the other
   games' routes.
2. `/newgame/realmarena`: a thin setup screen, built from `GameSetupLayout`,
   `UserInviteList` and `TurnTimerSelect`. Two players for now.

It's reachable by URL only, since the game is still unavailable in the
library.

Reviewers: `locksmith` and `gremlin` (the new route), `caveman`.

**PR 5 — The board, read-only.**

1. `components/RealmArenaBoard.tsx`: the fort drawn as one ground image, with
   an SVG layer on top for characters, HP and highlights. It sits inside
   `BoardZoom`, with a deep `maxWidth` and a `focus` on the selected character
   (§13.1).
2. `/games/realmarena/[gameid]`: the board screen, built on `GameShell`,
   `useGameData`, `usePushEvents` and `useEndGame`. It shows the squads, the
   scores, the round and whose turn it is.
3. Placeholder ground drawn from the map's letters, so the art isn't holding
   anything up (PR 9).

Reviewers: `caveman`.

**PR 6 — Mustering.**

1. Picking the squad: one `AmountSteppers` row per character, up to two of
   each, with the points left shown.
2. Placing the squad in the deployment zone on the board, then sending the
   sealed `Muster`.
3. While waiting: "Bob is mustering", with nothing shown about Bob's squad.

Reviewers: `caveman`, `croupier`.

**PR 7 — Taking a turn.**

1. Selecting a character shades its reach for 1–4 AP. Tapping a square
   previews the path, flags any watcher it would set off, and sends the move.
2. Tapping an enemy shows the hit chance, graze and damage before you commit.
   Abilities are `BuildRow`s in the turn sheet.
3. Buttons for hunker down, go on watch and End turn. Each character has a
   switch to keep still rather than go on watch when the turn ends.
4. Each result (hit, graze, miss, reactions set off) is shown as it comes
   back.

Reviewers: `caveman`.

**PR 8 — Watching the other player's turn: replay and recap.**

1. The replay adapter (`replay.ts`), which rebuilds from scratch since nothing
   is shuffled. And `recap.ts`, whose events never show a squad before the
   muster is over, wired in with `import "@/games/RealmArena/recap"` in
   `src/utils/games/recap.ts`.
2. On the board:
   - `useTurnRecap` with `TurnRecapScreen`;
   - `useTurnNavigation` with `TurnNavControls`, to step through the
     opponent's turn one action at a time. The view follows each action
     through `BoardZoom`'s `focus`, as Race Cars does.
3. Tests and upkeep:
   - `replay.test.ts`, with the random-number source stubbed to throw;
   - `recap.test.ts`;
   - Realm Arena's row in the per-game table in `turn-recap-and-planning.md`.
     Planning: not offered, because every future attack would need a roll.

Reviewers: `croupier`, `gremlin`.

**PR 9 — Guide, tutorial and placeholder art.**

1. `guide.ts` (Goal, Your turn, Action points, Cover and flanking, Overwatch
   and guard), in `GAME_GUIDES`.
2. `tutorial.ts`, in `GAME_TUTORIALS`: a tour of the live board covering your
   squad, the reach shading, an enemy's hit chance, the centre, and End turn.
3. Placeholder art (round 6): the ground drawn in flat colours from the map's
   letters (PR 5), and a simple marked figure for each of the six characters.
   Real art can land later, whenever it's ready, exported to `art-masters/`
   and served through `npm run optimise-art`, without touching the rules.

Reviewers: `rulebook`, `caveman`.

**PR 10 — Turn it on.**

1. `available: true` in `meta.ts`.
2. `npm run icons`, committing `public/icons/og-game-realmarena.png`.
3. One line in the new-games group of `whatsNew.ts`.
4. A full crew pass over the whole game.

### 17.4 Milestone B: after the first playable version

In the order §10 set, and in less detail for now:

- **B1 — A second mission and battlefield.**
- **B2 — Free-for-all for three and four players:**
  - the 48×48 fort (§15.4);
  - budgets and turn limits by player count (§13.6, §13.8);
  - a dropout adapter, so a player who stops turning up has their squad
    leave while their score stands (§4).
- **B3 — Teams of two**, in alternate seats, with a team score (§5.2).
- **B4 — Unlocks** (§7). This is the first state in the app that belongs to a
  player rather than a game, so it needs its own collection and routes
  (`locksmith`, `gremlin`).
- **B5 — Fog of war**, if it's chosen (§8). It's hidden state in every
  response and every replay (`croupier`).
- **B6 — More factions.**
- **Later platform work:** the shared team turn (§5.2), and undo for a move
  that set off no reactions (`docs/undo.md`).

### 17.5 The riskiest part

The riskiest part is taking a turn on a phone (PR 7): choosing among up to
six characters, reading a 36×48 board while zoomed in, and tapping
accurately. It deserves the most attention in review and playtesting, so
it's worth getting PRs 5 and 7 onto a real phone early, even with placeholder
art.

---

## 18. Questions (round 6)

Answered in §11.6.

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
| 0.5 | Round-4 answers recorded (§11.4): every character has its own AP, spent however the player likes (with a balance note on two attacks a turn), the AP costs, automatic overwatch or guard, speeds, ranges and battle length agreed, fog of war left for later (§6, §8, §13). Adds the first battlefield, a hand-made ruined fort, with its layout, how it plays, a fix so the centre starts scoring in round 3, and the three- and four-player version (§15). Round-5 questions (§16). |
| 0.6 | Round-5 answers recorded (§11.5). Every square has a movement cost and low cover can be climbed over, so cover moves from the edges between squares into the squares themselves, with a terrain table (§13.1); each AP buys a character's movement allowance (§13.2); the fort's legend updated to match (§15.1). Adds the implementation plan: principles, the engine decisions, ten PRs for the first playable version, the milestone after it, and the riskiest part (§17). Round-6 questions (§18). |
| 0.7 | Round-6 answers recorded (§11.6): nobody stops on low cover, cover sits in squares, a timed-out muster musters a ready-made squad, the plan's order is agreed, the first playable version ships with placeholder art (PR 9), and building waits until this doc has merged. |
| 0.8 | PR 2 fills in what §13 left open: each character's HP, Fireball's damage, how ranges and "next to" are measured, and the smaller cases listed under §13.6. |
| 0.9 | PR 3 fills in what §17.2 left open: a sealed squad stays off the battlefield until every player has mustered, a turn begins on the hand-off, and a request keeps only what was checked. |
