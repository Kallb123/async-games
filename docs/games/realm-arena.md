# Realm Arena — Game Design Document

**Status:** v1.53. Split out of Defender of the Realm in its third round of
design, when one concept became two games
([`defender-of-the-realm.md`](./defender-of-the-realm.md) §17). It's being
built first (§10). §11 records every answer. §13 has the battle rules and the
first characters, and §15 the first battlefield, a ruined fort. §17 is the
implementation plan and where it stands. Milestone A, free-for-all and C1–C3
(status effects §20, items §21, destructible low cover §22) are built, and so
is C4, battle visuals (§26): hit text, and the shots, the fireball, the flasks
and the strikes played out on the board. So is C5, character mastery earned
by what a character does (§23): mastery from results, the rank-1 options, and
the screens that show them. Figures are drawn as character art, facing the
way they last stepped (§26.5). From Milestone B, free-for-all (B1–B2) and fog
of war (B5, §27) are built: a host can have a battle fought in fog, where each
player sees only what their squad can. PR 10 turned it on: it's in the game
library, at command version 2. A finished battle's result tells the battle
(§28): the points race, each squad's health, the damage by character and a
record of what each squad did. Co-op against the computer (B8, §29) is built:
the players as one team, and an enemy of the host's choosing, played by game
AI, that takes a turn after each of theirs. §30 is what came after it, all
built: Banned Islet, Outbreak and Fires Out on co-op's shared ending,
remembering where an enemy was last seen, a wave-survival mission,
achievements, difficulty and solo play (§30.6), one player against one
warband.
**Working title:** Realm Arena (see the appendix)
**Genre:** Turn-based tactical squad battles, XCOM-style
**Players:** 1–4: free-for-all or two teams of two, co-op for two or three,
or solo against the computer
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
| After launch: status effects, then items bought at muster, then destructible low cover, then character mastery (Milestone C, §17.4) | §11.7, answers 1–2 |
| Progression is per character: playing a character widens what you can muster it with (§7, §23) | §11.7, answer 3 |
| Mastery is earned by what a character does: a little for being there, more for every attack and ability (§23.1) | §11.10, answer 2 |
| Battle visuals come next, before mastery: hit text, then the Archer's shot and the fireball in flight (§26) | §11.10, answer 3 |
| Fog of war, as the host's choice when setting up a battle (§8, §27) | B5 |

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

*Changed in round 7:* progression is **character mastery** (§23). Unlocks are
earned per character, by playing that character, and widen what you can
muster it with. Round 10 made it earned by what the character does in battle:
its attacks, abilities and items, with only a little for being there (§23.1). The principles below still hold: sidegrades, earned across all
your matches, no permanent death, a starter set that plays well. What changed
is that you earn them for a character, not for the game as a whole, and the
first ones are new ways to equip a character rather than new characters.

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

## 8. Fog of war

*Decided in B5* (§27): **both.** The host chooses, when setting up a battle,
whether it's fought in fog of war, and the setup screen starts with fog on.
Without it, the middle ground below: line of sight still decides who can
shoot whom, and everything else is in plain sight. What fog hides, and what
it doesn't, is §27.

Round 4 left it until after the first playable version, which has none
(§11.4, answer 7; §10). The case for and against, as it stood:

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

*Changed in round 7* (§11.7): after the first playable version is launched,
depth comes before breadth. Status effects, items, destructible low cover and
character mastery (Milestone C, §20–§23) come next, and character mastery
replaces step 3's unlocks. Teams, fog of war, factions and a second mission
follow, in that order. Round 10 (§11.10) put battle visuals (§26) before
mastery.

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

### 11.7 Round 7

Asked after free-for-all (B2) shipped. The game was compared with XCOM and
Final Fantasy Tactics, to find what's missing that matters most.

1. **What comes after PRs 9 and 10?** Status effects, then items that cost a
   few points at muster, then destructible low cover, then upgrades per
   character per player (Milestone C, §17.4).
2. **And the rest of Milestone B?** Not asked. Teams, fog of war, factions
   and the second mission keep their order and wait until after Milestone C.
3. **Progression?** Upgrades per character, per player: using a character
   unlocks more flexibility with it (§23).

### 11.8 Round 8

Asked once the board was drawn isometrically, about giving the ground real
heights (§25).

1. **What's the smallest step of height?** A quarter of a full height. A
   quarter gives no cover, a half or three quarters gives half cover, and a
   full height gives full cover.
2. **Climbing?** A step up or down of a quarter is an ordinary step, half or
   three quarters is a climb that costs extra, and a full height can't be
   climbed except by a stair. A Scout can climb a full height, and no more.
3. **Standing on a raised block?** The terrain still decides whether a
   square can be stood on, so low cover stays climb-over-only. The map's
   data should carry more than terrain and height later, so it's built to
   take more facts about a square.
4. **Sight?** Anything a full height above both characters blocks it. Trees
   block it whatever their height.
5. **High ground?** Half a height above the target.

### 11.9 Round 9

Two of round 8's open questions (§25.5), answered.

1. **Melee across a height?** Only within a quarter of each other's height.
2. **Parapets?** A tower top gets half cover from the parapet round it. A
   tower whose parapet is ruined, or missing on a side, gives no cover from
   that side, and that's fine.

### 11.10 Round 10

Asked after destructible low cover (C3) shipped.

1. **The plan's size?** The implementation plan and the sections that go
   with it were far too big. They're now summarised (§17, §20.3–§22.3). The
   code holds the detail and cites the sections.
2. **How is mastery earned?** By actions, not by being in a battle. Being
   there can earn a small amount of XP, and every ability or attack should
   earn more (§23.1).
3. **What next?** Visuals, before mastery: hit text showing the damage, or a
   miss, and animations for the fireball and the Archer's shot (§26).

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
- **What's on it**, and what each square costs to move into (round 5,
  heights from round 8, §25). A height is in quarters of a full height,
  above the ground the terrain stands on:

  | Terrain | Height | Movement cost | Cover for a character next to it | Sight |
  |---|---:|---:|---|---|
  | Open ground | 0 | 1 | None | Clear |
  | Low cover: rubble (½), low walls (¾) | 2–3 | 1, plus a climb on and a climb off. You can't stop on it | Half, by its height | Clear |
  | Wall | 4 | Can't be entered | Full, by its height | Blocked between characters on the ground (§25) |
  | Parapet: the wall round a tower top | 8 | Can't be entered | Half to whoever is on the tower top, by its height | Blocked between characters on the ground |
  | Trees | 6 | Can't be entered | Full, whatever the heights | Always blocked |
  | Tower stair | 3 | 2, and never a climb | By height | By height |
  | Tower top | 6 | 1 | By height; it's high ground over anyone half a height below | By height |

  - **A diagonal step** costs 1.5 times the square's cost (round 5). Nobody can
    cut diagonally past the corner of high cover.
  - **Cover comes from the side the attack comes from.** A character has cover
    against an attacker when a cover square is next to it on the attacker's
    side. High cover there gives full cover; otherwise low cover gives half.
    With neither, the character is flanked (§13.3).
  - Nothing destructible in the first playable version. Low cover can be
    blasted away from Milestone C (§22). High cover never can.
- **Deployment zones** sit at opposite ends for two players, and in the
  corners for three or four, about 40 squares apart. At the movement
  allowances in §13.2, squads meet within two turns. A character can even
  reach the centre (§13.7) on its first turn, which is why the centre starts
  scoring later (§15.3).

**A big board on a small screen.** At phone width, the isometric map — 84
squares corner to corner — works out at under 10 pixels a square. That's fine for seeing the whole battle, and far too
small to tap. So the whole map is the overview, and the board spends most of
its time zoomed in:

- `BoardZoom` steps from the whole map down to a close zoom (its `maxWidth`),
  deep enough that about seven squares fill the width and each one is
  comfortable to tap. Pinch and ctrl-wheel zoom as usual.
- Selecting a character brings the view to the near part of where it could
  move — half its reach each way, zoomed exactly to fit that rather than to a
  step, since a full turn's reach runs most of the map's width. Picking a
  target from the list brings the view in close on the caster and the target,
  a square and a half round them, zoomed exactly to fit too. A replay of other
  players' turns follows the action. All of them use `BoardZoom`'s `focus`,
  the way Race Cars follows a car.
- With none of those claiming the view, it rests on the player's own side: the
  board opens on every standing character of theirs — the whole team in co-op,
  their own squad in a free-for-all (`friendlySquares`) — zoomed exactly to fit
  them, and comes back to them on returning to the live board and on letting a
  character go (deselecting it, or its last AP spent). With nobody on the
  field, as in the muster, the board stays fitted to the column. Fog of war
  never hides a player's own side, so this shows nothing it shouldn't. This is
  the board's `home`, the lowest of its focuses.
- The flat ground is better drawn as one image than as a shape per square, because
  a 48×48 board has 2,304 of them. Kingdom Builder's tile sheet is a
  precedent.
- **The board is drawn isometrically** (`src/utils/ui/isometric.ts`): each
  square a 2:1 diamond, the shape every isometric tile sheet uses, standing
  at its own height (§25) — the height the rules play, not a picture of it.
  A full height is a cube, and every face is drawn as a stack of quarter
  slices, so tile art can come in slices. The flat ground and anything
  shaded on it are a path per kind; what stands up — raised squares and
  figures — is painted back to front, so a wall hides whoever is behind it,
  and a character something hides is drawn again faintly over it, still
  there to tap. A tap goes to the front-most square drawn under it. Fitted to
  a phone the diamond is an overview, padded to a frame tall enough to pan
  in, and the deepest zoom brings about seven squares across.
- **The view turns a quarter either way**, from a pair of buttons in the
  frame's top corner, so a player can see round the far side of a tower or a
  wall and pick out a character standing behind it. It's the same isometric
  board with the grid turned before it's drawn: squares keep their numbers, so
  nothing but the drawing knows. The turn is the viewer's own, on this screen
  only — nobody else's board turns with it — and whatever was in the middle of
  the frame stays there through it.

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
  cover between you) loses its cover. A shot at a target further than two
  thirds of its weapon's range is a long shot, and takes off 20 more (§30.13).
  It's shown as one percentage before you commit.
- **Range.** A weapon can't shoot past its range. Past two thirds of it, a
  shot is a long shot at −20% (§30.13); closer than that there's no fall-off to
  work out. Ranges are in the character table (§13.6), scaled to the bigger
  board.
- **Grazes.** A shot that misses by 10 or less grazes, for half damage. An 80%
  shot is then 80% hit, 10% graze and 10% clean miss.
- **Damage is fixed per weapon.** A sword always does 4, so the only luck is
  hit, graze or miss. Flanking adds +1 damage, instead of XCOM's critical
  hits. Characters have about 5–12 HP.
- **Melee** needs to be next to the target, within a quarter of its height
  (§25.2), and hits 80% of the time (§30.13): it lands for its full damage or
  misses, with no graze. Until command version 7 it always hit, with no roll.

### 13.4 Reactions: overwatch and guard

- **Going on overwatch** (ranged) **or guard** (melee) spends all the
  character's remaining AP and banks them until your next turn.
- **Each reaction costs 2 AP from the bank** (round 3). So 4 banked AP buy two
  reactions, and 2 or 3 buy one. A character that only moved once still has a
  shot saved up.
- **Overwatch:** a shot at −15% at an enemy that moves where it can see.
  **Guard:** a strike at an enemy that steps into its melee reach: next to
  it, within a quarter of its height (§25.2).
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
- **A Cleric can raise a downed ally** next to them, at half HP, and again four
  turns later (§30.13). Being raised doesn't take back the points already
  scored. Until command version 7 it was once per battle.
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
| **Cleric** | Support | 6 | 7 | Staff, melee, 2 | **Heal:** restore 4 HP to an ally they can see within 12 squares (2 AP, once a turn, no cooldown). **Raise:** bring a downed ally back at half HP (3 AP, 4 turns) | 25 |

**The budget:** 100 points each for two players, 80 for three, and 70 each for
four (free-for-all or teams). That's 4–6 characters at two players and 3–4 at
four. You can take as many of any one character as the points buy.

*Filled in by PR 2 (§17.3)*, where this section left a number or a case
open. All are first guesses for playtesting, kept in `characters.ts` and
`rules.ts`:

- **HP and Fireball's damage**, as in the table above.
- **Ranges are measured centre to centre, as the crow flies**, so a range
  reaches out in a circle. Overwatch needs the mover in range as well as in
  sight. A character beside full cover can look down either side of it: the
  cover does not block an angled line leaving their square, though looking
  straight through it and every piece of full cover further away still do.
- **"Next to" is touching, side or corner**, unless high cover fills both
  corners between the two squares. It's what melee, guard, a healing draught
  and raising need. A heal is aimed as a fireball is: at an ally in sight
  within 12 squares.
- **Flanking's +1 damage is for shots.** Melee has no cover to lose (a strike
  is made from next door), so it doesn't get it.
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
  next turn. A Cleric's Raise has a cooldown of four turns (§30.13).
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
- **An assist** scores every other enemy who took HP off the fallen since it
  last stood up — by any attack, a blast, or burning they set — half the
  knock-out, rounded up (2–3 points), once each however often they hurt it.
  Without it, a free-for-all only paid the player who landed the last blow,
  so nobody wanted to soften up a character a third player could finish.
  The downer's own side never scores one, since the knock-out already scores
  for it, so in a duel and in co-op — where only one side can hurt a
  character — there are none, and an assist is only ever beside a knock-out:
  a character downed by its own side, or by a fire whose setter has left,
  scores nobody. A character downed forgets who hurt it, so one raised starts
  owing nobody, though a heal doesn't; a player who drops scores none for the
  hurt their squad did before it left. Who hurt a character stays on the
  server: it's never sent. It applies to every battle, those already being
  fought among them, with no command version: no command means anything
  different, and no battle fought before it had done any damage, so every
  replay of one scores as it did.

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
| `#` | The fort's curtain wall between the towers: it blocks movement and sight, and gives full cover to anyone beside it |
| `P` | The parapet round a tower top: half a height above the tower, so half cover to whoever is up there (§25.2) |
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

*Built in B1* as the Four-Gate Fort, for four players only. Three players
get a round fort of their own (§19).

---

## 16. Questions (round 5)

Answered in §11.5.

---

## 17. Implementation plan

Two milestones built the game so far. **A** is the first playable version
agreed in §10: two players, one faction, Hold the Centre on the Ruined Fort.
**B** and **C** come after it (§17.4). Milestone A, B1, B2, B5 and C1–C5
are built, and PR 10 has turned the game on.

This section keeps what the code still rests on, the principles and the
engine decisions, and a few lines for each PR. The detail of what each PR
settled is in the code and its tests, which cite these sections.

### 17.1 Principles

- **Hidden until it's ready.** Until PR 10, `meta.ts` carried
  `available: false`, which kept Realm Arena out of `GameLibrary` while its
  setup screen could still be reached by URL for playtesting. PR 10 turned
  it on.
- **Shared files change only when a guard test requires it.** The registry
  tests fail as soon as a `@serializable` class or a `meta.ts` exists without
  its wiring, so PR 3 made every engine one-liner at once.
- **Shared from the start.** The battlefield's geometry is in
  `src/utils/games/battlefield/`, because Defender of the Realm will reuse it
  (§10). The board moves to `src/components/ui/` when a second game needs it.
- **Replay data from the first command.** Every roll is recorded, and the
  starting state is rebuilt from persisted fields (`turnOrder`, and the
  mastery snapshot since C5, §23.3).
- **Every PR passes the gates** (`build`, `tsc`, `lint`, `test`) and the
  review crew for what it touches.
- **No What's new line until the game is announced** (PR 10).

### 17.2 Engine decisions

These are the decisions that can't be cheaply changed once games are being
played.

- **Four commands.** `RealmArenaMuster` is the squad and where each character
  stands. `RealmArenaAct` is one action by one character. `RealmArenaUndo`
  takes back an `Act` that rolled nothing and hurt nobody (`docs/undo.md`
  §16). `RealmArenaEndTurn` names the characters that keep still rather than
  go on watch. One general `Act` replaces a class per action.
- **One action per command**, so a player sees a shot land before choosing
  the next action.
- **Reactions happen inside the command that sets them off.** The server
  walks the path, resolves each reaction (nearest watcher first), and stops
  the mover if it's downed on the way. No out-of-turn commands are needed.
- **The rules take rolls as inputs.** A command draws 1–100 rolls, records
  them in order on itself (`recordedRolls`) and hands them to `rules.ts`, which
  never draws. So the client shows the same odds the server uses.
- **The muster is sealed.** Players muster in seat order. Until the last one
  has, each player sees only their own squad (`myMuster`), and nothing in a
  response is derived from anyone else's, not even a count. Then every squad
  takes the field at once, with fighter ids in seat order. Replay and recap
  keep the seal.
- **A timed-out turn ends the way the player would have ended it:** `EndTurn`,
  with every character going on watch. A timed-out muster gets the faction's
  ready-made squad.
- **The End turn that hands the turn on begins the next turn.** It gives the
  next seat fresh AP, counts effects down and burns (§20.3). It steps past a
  seat that has dropped or has nobody standing, and ends the round when it
  goes back round the table.
- **No drop at two players.** A duel ends when one player stops turning up.
  The dropout adapter (B2) has a `minPlayers` of two.
- **The squads live in plain arrays** (`Schema.Types.Mixed`), so every
  `Execute` ends with one `markModified` helper.
- **A request keeps only what was checked.**

### 17.3 Milestone A: the first playable version

**Goal:** two players set up a match, muster sealed squads from the first six
characters, and fight Hold the Centre on the Ruined Fort to a winner, with
recap, a guide and a tutorial.

- **PR 1, the battlefield.** Terrain, pathfinding, line of sight and cover in
  `battlefield/`, and the Ruined Fort, tested to be unchanged upside down.
- **PR 2, the rules.** `characters.ts` and `rules.ts`, which settled the cases
  listed under §13.6.
- **PR 3, the engine.** Models, commands, wiring and the turn-timeout
  adapter, which settled §17.2's sealed squad and hand-off.
- **PR 4, setting up a match.** `POST /api/newgame/realmarena` and a thin
  setup screen.
- **PR 5, the board, read-only.** Inside `BoardZoom`, with a `focus` on the
  selected character. The viewer's own sealed squad is drawn hollow where it
  will stand.
- **PR 6, mustering.** It starts from the ready-made squad, so a player happy
  with it musters in two taps. A character is placed by tapping to pick it up
  and tapping to put it down. A squad left as it starts is no secret, which
  is accepted: the seal stops counter-picks, not guesses.
- **PR 7, taking a turn.**
  - The first tap lines an action up, and a second tap sends it: the path, its
    AP and the watchers it would set off, or the chance to hit, graze and
    damage.
  - An enemy tapped while moving lines up an attack on it.
  - Stances (hunker down, watch, shield wall) go on the first tap.
  - The keep-still switches start on watch.
  - The sheet shows the last action's result with its rolls.
  - What's used most sits nearest the board. Directly under it come End turn
    (with Undo, and Deselect while a character is selected), the lined-up
    action's Cancel and send buttons with its odds, everyone it could be aimed
    at, and the selected character's actions. The squad, the last action's
    result and the keep-still switches follow.
  - A character is deselected once an action leaves it with nothing to do:
    its last AP spent, on watch, hunkered down or knocked out on the way.
  - End turn asks first while any character still has AP to spend, even
    where it would go on watch with it.
  - The battlefield runs edge to edge, with no frame round it.
  - Each enemy in reach wears its chance to hit, previewed from the end of a
    lined-up move.
- **PR 8, replay and recap.**
  - A recap row is the line the log already wrote.
  - The feed tells everything one character did in a turn as one row: its
    actions' lines, joined by "then". The match history keeps a row per
    command, so every line of the log can still be reacted to.
  - A muster's row says only that it happened.
  - The review follows each action by the characters it changed.
  - Planning is out by design: `plannableCommands` stays empty, since a
    planned `Act` would let a player choose their own rolls.
- **PR 9, guide, tutorial and art.** Two isometric tile sheets at the rules'
  heights, with open ground as one pattern of grass. The tour opens on
  whichever phase the match is in.
- **PR 10, turn it on.** `available: true`, the share card, one What's new
  line and a full crew pass. The game launched at command version 2, and
  nothing older replays (`oldestReplayableCommandVersion: 2`): every battle
  recorded before it, as version 1 or with no version, was a playtest played
  while the rules were changing under it (§25.5), so it goes without a recap
  rather than getting a wrong one. A later rule change bumps the version and
  keeps the old branch (`docs/command-versions.md`). It launched without
  achievements, which are left for later (`docs/achievements.md` §11).

### 17.4 Milestones B and C: after the first playable version

| Step | What | Status |
|---|---|---|
| B1 | Battlefields for three and four players (§19) | Built |
| B2 | Free-for-all for three and four players | Built |
| C1 | Status effects (§20) | Built |
| C2 | Items bought at muster (§21) | Built |
| C3 | Destructible low cover (§22) | Built |
| C4 | Battle visuals: hit text, then the shot and the fireball in flight (§26) | Built |
| C5 | Character mastery, earned by what a character does (§23) | Built. Replaces B4 |
| B3 | Teams of two, in alternate seats, with a team score (§5.2) | After C |
| B5 | Fog of war, as the host's choice (§8, §27) | Built |
| B6 | More factions | The Swarm, as a co-op enemy (§31); a squad choosing its own faction, from those the host allows (§32) |
| B7 | A second mission and battlefield | After C |
| B8 | Co-op against the computer (§29) | Built: sides, the battlefields, factions as data, the planner, the enemy's turn, the end of it and the screens (§29.2–§29.9) |
| B9 | After co-op: the shared ending for Banned Islet, Outbreak and Fires Out, last seen in fog, Hold Out, achievements, difficulty and solo (§30) | Built, with battle size beside difficulty (§30.5) |

**What B2 settled:**

- The party's size picks the map.
- A round ends with the last seat still playing.
- A dropped player's squad leaves the battlefield. Nobody scores it, raises
  it, or is left facing it on watch. Their score stands, but the winner is the
  best-placed player still there, and their undo snapshots go with them.
- Nobody is dropped from a duel or during the muster.

**Later platform work:** the shared team turn (§5.2).

### 17.5 The riskiest part

The riskiest part is still taking a turn on a phone (PR 7): choosing among up
to six characters, and tapping accurately on a big board while zoomed in.
Playtest it on a real phone.

---

## 18. Questions (round 6)

Answered in §11.6.

---

## 19. Battlefields for three and four players

The first step of free-for-all (§17.4 B1). §15.4 sketched one 48×48 fort with
a gate facing each corner, for three or four players. Drawing it showed it
works for four and not for three, so there are two maps.

### 19.1 One map or two?

*Decided:* **one map per player count.** A map's fairness rests on where the
squads start, and a square grid can only be fair to a number of seats it can
turn into each other.

- **Four seats on squares are exact.** A quarter turn is one of a square
  grid's own moves: every path, line of sight and cover square turns with it.
  Four corners round a fort that's unchanged by a quarter turn are four
  identical positions, as two ends of a map that's unchanged upside down are
  (§15.2).
- **Three seats in four corners aren't.** Leave one corner empty and the
  seat between the other two has a rival on each side, about 40 squares away,
  while the two either side of it each have one rival that close, one across
  the diagonal (about 57) and an empty quarter of the map to slip round. In
  free-for-all the seat in the middle is the one squeezed.
- **Three seats can't be exact on squares at all.** A third of a turn isn't
  one of a square grid's moves, and cost is the reason: a diagonal step costs
  1.5, so a walk at a slant costs up to 12% more than the same distance
  straight. Seats a third of a turn apart walk at different slants.

So the three-player map is fair by measurement instead of by shape: mirrored
left to right, so two of its seats are exact twins, and the third held level
with them by numbers its test checks (§19.2).

The ids sit beside the Ruined Fort's in `REALM_ARENA_MAPS`. Free-for-all (B2)
picks the map from the player count (`mapForPlayers`), so the host never has
to.

### 19.2 The two maps

Both are 48×48 (§13.1), Hold the Centre on a 6×6 keep (§13.7), with the
fort's terrain (§15.1). Each seat's deployment zone is 8×8, and the seats go
clockwise round the map, so the next player in the turn order is the one on
your left.

**The Four-Gate Fort** (`maps/fourGateFort.ts`), for four players, is §15.4
as sketched:

- Each player musters in a corner. The fort's corners have fallen, so each is
  a gate facing a corner, straight at the keep.
- A tower stands in the middle of each wall, between two gates, climbed from
  inside and looking down into the keep. Every player has a tower either side
  of their gate.
- Each wall has a rubble breach clockwise of its tower, so every player has a
  slower, covered way in beside their gate, and round the outside to a
  neighbour's.
- It's unchanged by a quarter turn, which the test checks, so all four
  corners are the same. The quickest walk from a zone to the keep is 21
  squares, and to a neighbour's zone 33.

**The Ring Fort** (`maps/ringFort.ts`), for three players:

- Two players muster in the top corners and one in the middle of the bottom
  edge, the points of a triangle round the keep.
- The curtain wall is round, because a circle looks the same from every
  side, as a square doesn't. It has a gate facing each player, a tower between
  each pair of gates, and a rubble breach either side of each tower. Each
  player has their gate, the breaches beside it and a tower on each flank.
- It's unchanged mirrored left to right, so the two top seats are twins.
- The bottom seat walks straight up to the keep while the top two walk in at
  a slant, which costs more (§19.1). So the keep sits three rows above the
  middle of the map, to make their walks the same. Its test holds the three
  seats level:

  | Checked | Top seats | Bottom seat | Allowed |
  |---|---:|---:|---:|
  | Quickest walk to the keep | 17 | 17 | equal |
  | Average walk from the zone to the keep | 22.3 | 20.6 | within 2 |
  | Quickest walk to another seat's zone | 33 (to each other), 34.5 (to the bottom) | 34.5 | within 2 |

  The averages differ because a square zone facing the keep at a slant has a
  far corner, and one facing it straight doesn't. It's less than a third of an
  AP, for a character placed in the zone's far corner.

Both maps have a test that every deployment square can reach the keep, that
nothing standable is sealed off, and that every tower looks down into the
keep. The Ruined Fort's test shares those checks (`maps/testFixtures.ts`).

### 19.3 Open questions

- **Teams on the Four-Gate Fort.** Teams take alternate seats (§5.2), which
  puts teammates in opposite corners, each with an enemy on either side.
  That's even, but means a team can't hold a side of the map together.
  Adjacent corners would need the team-turn order and the corners to be
  chosen together (B3).
- **Where the bottom seat goes on the Ring Fort.** Seat order is rolled
  (§17.3 PR 3), so nobody chooses it. The playtest should watch whether the
  bottom seat, with nothing behind its flanks, plays differently enough to
  matter.

---

## 20. Status effects (C1)

The first part of Milestone C. Today the only thing that happens to a
character is losing HP, apart from two stances it takes itself. XCOM and Final
Fantasy Tactics both get much of their depth from conditions: a stunned
soldier, a burning one, a target marked for the rest of the squad. A few
effects give every existing action more to weigh, and they're what items (§21)
and mastery options (§23) are built from.

### 20.1 The effects

The numbers are first guesses for playtesting, like §13's.

| Effect | What it does | Count | Comes from |
|---|---|---:|---|
| **Burning** | 1 damage at the start of each of its owner's next two turns | 2 | Fireball (everyone it hits), a fire flask (§21) |
| **Stunned** | Its banked AP are lost as it's stunned, so it can't react until its owner's next turn, which it starts with 2 AP instead of 4 | 1 | A thunder flask (§21), Shield bash (§23) |
| **Slowed** | Its movement allowance is halved, rounded up, for its owner's next turn | 2 | Crippling shot and Frost bolt (§23) |
| **Marked** | +15% to hit it, for every attacker, reactions included, until its owner's turn after next | 2 | Hunter's mark (§23) |
| **Corroded** | +10% to hit it, for every attacker, reactions included, for two of its turns; a heal clears it | 2 | The Spitter's acid spit, the Bloater's Burst (§31) |

**The count works exactly as a cooldown's does** (§13.6), and shares its
code. It goes down by one at the start of each of the affected character's
own turns, and the effect is gone when it reaches 0. Burning and Stunned act
at that moment, before counting down. So:

- a count of 1 ends at the start of the owner's next turn, which is how
  Stunned takes its AP and then lifts;
- Slowed needs a count of 2 to last through the owner's next turn, rather
  than lifting before the character has moved;
- Marked is counted on the *target's* turns. Marked on your turn, it survives
  the target's next turn start and so lasts through your next turn too.

The two stances become effects too. Hunkered down and Shield wall already end
at the start of their owner's next turn, so they move into the same field with
a count of 1. That removes two booleans from the character rather than adding
a third and fourth.

### 20.2 Rules

- **Effects don't stack.** Applying one a character already has resets it
  to the longer of the two durations. Two fire flasks mean burning for longer,
  not twice the damage.
- **A shot applies its effect only on a hit**, not a graze or a miss.
  Anything that doesn't roll (a strike, a fireball, a flask) always does.
- **Heal also puts out burning and clears slowed, stunned and corroded (§31.2).** That's the
  answer to effects, and it gives the Cleric a reason to heal a character
  that isn't badly hurt.
- **A downed character loses every effect.** A raised one comes back clear.
- **A knock-out by burning** scores for the owner of whoever set it alight.
  So burning remembers who caused it. Burning that downs your own character
  scores nobody anything, as a fireball's friendly fire doesn't (§13.6).
- **Effects are public**, like everything else on the battlefield — on every
  character the viewer can see, in fog of war (§27). Each
  figure shows its effects as small marks, and the unit's box spells them
  out.
- **The hit chance shown includes Marked**, and the shaded reach includes
  Slowed. Both come from `rules.ts`, as today, so the board and the server
  agree.

### 20.3 Engine

*Built.* The engine as it stands:

- `Fighter.effects` holds the counts, and remembers who last set the fighter
  burning. The two stances are folded into it. The counts go down with the
  cooldowns' code.
- **The End turn that hands on begins the next turn** (§17.2), not
  `CheckEndTurn`. Only a game over that `CheckGameOver` finds actually
  finishes a match, so a squad burned out at the start of its turn has to be
  found there. The hand-off passes on again past a squad that is burned out,
  and nothing burns once the turn limit has been played out.
- **Burning gets its own line in the log**, after the End turn's line. End
  turn's outcome carries every event, so the recap reads the centre's points
  from those events.
- New events: `effect` (applied, refreshed or cleared by a heal; an effect
  running out is silent) and `burned`. `afflicted` is the one way an effect
  is put on. A mark would also be an `effect` event.
- **A stunned character can't go on watch.** A heal can be used on an ally
  that isn't hurt but has something to clear.

### 20.4 PRs

Both built. **PR 1** added the rules and the engine above. **PR 2** added the
board:

- Every effect has a mark drawn on a coin. They share one sheet, rendered from
  an SVG master by `npm run ra-marks`.
- A figure shows its marks down its left. The unit's box and the selected
  character's card spell them out.
- The recap has a row for burning as a turn begins.
- The guide explains burning.

## 21. Items (C2)

XCOM's grenades, medkits and smoke are its most-used tools. They're answers
to cover, to attrition and to a squad dug in on overwatch, which §13.4 already
flagged as the balance to watch. Here they're bought at muster from the same
points budget, so an item always costs a body or an upgrade somewhere else.

### 21.1 The rules

- **One item per character**, chosen at muster, for a few points. One slot
  keeps turns short and the muster screen small. More slots are a mastery
  option (§23), not a default.
- **Each item is used once.** It's gone after that, whether it did anything
  or not.
- **Throwing** needs the target square in range (6 squares) and in sight,
  and doesn't roll, as a fireball doesn't. An area hits friend and foe.
- **The budget is unchanged.** Items compete with characters for the same
  points, at 5 points each, so a squad trades a fraction of a character for
  two or three items. The ready-made squad carries none, and still spends
  the whole budget.
- **Carried items are public** once the battle starts, like everything else
  on the battlefield (in fog of war, on every character the viewer can see, §27). During the muster they're part of the sealed squad, so
  `myMuster` carries them for their owner only (§17.2).

### 21.2 The first four items

| Item | Points | AP | What it does |
|---|---:|---:|---|
| **Fire flask** | 5 | 2 | Thrown at one square. 2 damage and Burning to whoever is there. Blasts the low cover on and next to that square, once low cover can be blasted (§22) |
| **Thunder flask** | 5 | 2 | Thrown at a 3×3 area. Stuns everyone in it. No damage |
| **Smoke pot** | 5 | 1 | Thrown at a 3×3 area. Until the thrower's next turn, a character standing in the smoke is −20% to hit, and overwatch can't fire at a mover entering it |
| **Healing draught** | 5 | 1 | The carrier, or an ally next to it, gets 3 HP back and loses Burning, Slowed and Stunned. It never takes a character past full HP |

The smoke pot lasts until the thrower's next turn, which is exactly how a
shield wall works, so it's built the same way. The cloud lives on the
thrower, as a `smoke` effect with a count of 1 and the square it was thrown
at. `shotOdds` and `reactionsTo` project it onto the 3×3 around that square,
as they project a shield wall onto the squares next to a Knight
(`shielded`). The battle state stays `{ field, fighters }`, and nothing new
needs persisting or expiring. The one thing given up: a thrower who is
downed takes their smoke with them, as a downed Knight takes the shield wall.
Smoke doesn't block sight, which keeps `lineOfSight.ts` the same pure
function of the ground.

### 21.3 Engine and muster

*Built.*

- **Items are data:** `ITEMS` in `characters.ts`. `MusterPick` has an optional
  `item`, which `musterRefusal` checks against the budget (`musterPoints`).
  `Fighter.item` is the item a fighter carries, or none.
- **Two new `Act` kinds.** A throw is `{ kind: "throw", fighter, at }`, aimed
  at a square like Fireball. A draught is `{ kind: "draught", fighter, target }`,
  aimed at an ally like Heal, but only one next to its carrier. Its carrier
  can drink it, which Heal can't do for the Cleric.
- **Reused, not rebuilt.** `areaAround` (once `fireballArea`) is every 3×3.
  Heal and the draught share `healRefusal`, and with Purify (§23) one
  heal-and-clear resolver, `mend`. Fireball, the flasks and Demolish share
  `land`, and Fireball, the flasks and Hunter's mark `aimRefusal`.
- **The smoke lives on the thrower, as the square it landed on.** It isn't an
  effect, because an effect happens to the character it's on. It clears
  as a count of 1 would, and goes with the thrower if the thrower is downed.
  `smokeSquares` is what `shotOdds`, `reactionsTo` and the board read. Clouds
  don't stack. A guard strikes into smoke all the same.
- **An item is used up as soon as it's used**, whatever it hits. A throw that
  hurts nobody, and a draught, can be undone, and the item goes back.
- **The muster screen** buys the items beside the squad, a stepper for each
  of the four under the characters' steppers, so every point is spent on the
  one screen; a squad can't buy more items than it has characters. Placing
  hands them down the squad one each, and a character picked up offers the
  items bought as `BuildRow`s: taking one from whoever carries it hands them
  its own item, or nothing, in exchange. Nothing is bought or left behind
  while placing, so the points never change there. Placing also lists the
  squad as a box each, as the battle's list under the board does: tapping one
  picks that character up and brings the board's view to it.

### 21.4 PRs

Both built. **PR 1** added the rules above. **PR 2** added the muster and the
board:

- Each item is drawn on a parchment tile, on the same sheet as the smoke cloud.
- A figure wears its item by its right shoulder.
- The turn sheet has a `Throw` or `Aim` row for the item.
- The smoke is drawn as a cloud you can see through.
- The recap has a `ra_thrown` row.
- The guide covers the items.

## 22. Destructible low cover (C3)

In XCOM, blowing cover away is the answer to an enemy dug in behind it.
Without it, whoever holds the keep's fallen pillars has an edge the attacker
can only flank round. Destructible low cover gives the attacker a second
answer and makes Fireball and the fire flask a choice between hurting people
and opening ground.

### 22.1 The rules

- **Only low cover can be destroyed:** rubble, low walls and pillars. Walls
  and trees never can, so a map's shape, its sight lines and the fairness
  its tests prove (§19) all stay as drawn.
- **A blasted square becomes scorched ground**, which plays exactly as open
  ground and is drawn differently, so it's clear something was there. It costs 1 to move into, can be stood on, and gives no
  cover.
- **What blasts it:** Fireball, every low cover square in its 3×3; a fire
  flask, its square and the squares next to it; and Demolish (§23), one square
  next to a Knight.
- **Blasting needs no roll** and happens after the damage. So a character
  in the blast loses its cover only for the next attack, not for the one that
  blasted it.

### 22.2 Engine

*Built.*

- **Low cover is `destructible`**, a flag on its `TERRAIN` entries. Scorched
  ground is the letter `_`: open ground under another name.
- **The battle state keeps `blasted`**, in the order the squares went.
  `battlefieldWith(field, blasted)` clears each destructible square named in
  it to scorched ground, and ignores anything else, so no list can blast a
  wall. `battlefieldOf(map, blasted)` is the battlefield as it stands, and
  the server, the board, the recap and a replay all read it.
- **What blasts is data:** `blasts` on Fireball and on the fire flask (the
  3×3, `area`), and on Demolish (the square it's aimed at, `target`, §23.2).
  `blastedBy` is the cover something would clear, and both the resolver and
  the turn sheet's preview use it.
- **The `blasted` event** names the squares and who blasted them. It comes
  after the damage, the knock-outs and the effects.
- The map tests still hold, because blasting only removes cover, never walls.
- A fire flask or a Demolish that blasts but hurts nobody can still be
  undone. The snapshot holds what was blasted.

### 22.3 PRs

One PR, built. It added the rule, the helper, the event, and scorched ground
drawn from its own sheet (`npm run ra-marks`). When a fireball or flask is
lined up, the board shades the cover it would blast, and the sheet counts it.
The guide got a line too.

## 23. Character mastery (C5)

*Agreed in round 7* (§11.7, answer 3): **playing a character unlocks more
flexibility with that character.** This replaces the game-wide unlocks of §7.
It's closest to Final Fantasy Tactics' jobs: you get more out of a Knight by
fielding Knights. It keeps §7's principles: options, not power, so a newer
player isn't outgunned. There are no named characters with levels and wounds
to keep track of.

*Changed in round 10* (§11.10, answer 2): **mastery is earned by what a
character does, not by being in a battle.** Being there earns a little, and
every attack and ability earns more. Round 10 also put battle visuals (§26)
first, so mastery moved from C4 to C5.

### 23.1 How it's earned

- **Mastery is experience (XP), per player and per character.** It's earned
  in battles that count as played (the achievements' rule: at least two
  turns), win or lose.
- **Acting earns XP, and being there earns a little.** As built in
  `mastery.ts` (`XP_WEIGHTS`, `RANK_XP`):

  | What the character did in the battle | XP |
  |---|---:|
  | Fought in it (once, however many of that character were mustered) | 2 |
  | Each attack: a shot, an aimed shot, a strike, or a reaction on overwatch or guard | 3 |
  | Each ability used: Cleave, Shield wall, Fireball, Heal, Raise, and the options of §23.2 | 5 |
  | Each item used | 3 |

- **An action earns the same whatever it rolls.** A miss earns as much as a
  hit, and a knock-out earns nothing extra. XP pays for using the character,
  so the dice don't decide who progresses. Winning doesn't count either.
- **Moving, hunkering down and going on watch earn nothing.** Every
  character can do them, so paying for them would just pay for being there
  under another name. A watch earns XP when its reaction fires.
- **Two of the same character** pool their actions into the one mastery.
- **Three ranks:** rank 1 at 60 XP, rank 2 at 180 and rank 3 at 450. A
  character that's used, attacking about once a turn and using its ability
  when it can, earns about 30–50 XP in a two-player battle. That's rank 1 in
  about two battles and rank 3 in about ten, round 7's pace. A character kept
  at the back gets there more slowly.
- **The weights and thresholds are data**, and XP is worked out from the
  counts stored for each battle (§23.3). Retuning them reprices every
  player's history at once, with nothing to migrate.
- **Balance to watch.** The support characters earn mostly through abilities
  with cooldowns, and a Knight holding the keep may attack little. If the
  playtest shows one character's mastery lagging well behind the others, raise
  its ability's weight.

### 23.2 What an option is

- **An option swaps one part of a character's kit for another**: its weapon,
  or one ability. It's picked per figure at muster, like an item, and costs
  the same points as the kit it replaces. A character with no option picked
  is the starter character of §13.6.
- **An option is a sidegrade.** It never adds HP, accuracy or AP outright.
  Anything it adds, it pays for by giving something else up.
- **The options picked are public once the battle starts**, like items (in
  fog of war, on every character the viewer can see, §27).
  During the muster they're sealed with the rest of the squad.

The rank-1 options, built from effects, items and blasting:

| Character | Option | Replaces | What it does |
|---|---|---|---|
| Man-at-arms | **Shield bash** | Cleave | Strike one enemy next to them for 2, and stun it (2 AP, 3 turns) |
| Knight | **Demolish** | Shield wall | Blast one low cover square next to them, and strike everyone else beside it for 2, friend or foe (2 AP, 2 turns) |
| Archer | **Crippling shot** | Aimed shot | A shot at normal accuracy that slows on a hit (3 AP, 2 turns) |
| Scout | **Hunter's mark** | Sneak | Mark an enemy it can see within 12 squares (1 AP, 2 turns) |
| Mage | **Frost bolt** | Bolt | Damage 2 instead of 3, and slows on a hit |
| Cleric | **Purify** | Raise | Clear every effect from allies within 1 square, itself among them, and give each 2 HP (2 AP, 3 turns) |

The rank-2 and rank-3 options will be designed once C1–C3 have been played.
Two already fit: a **second item slot** (the item still has to be paid for) and a
**second weapon option** per character.

### 23.3 Engine

- **Each fighter keeps a tally** of its attacks, abilities and items used.
  One helper in `RealmArenaLogic.ts` (`tallied`) counts them for each action:
  the action itself for the character taking it, and each reaction it set
  off, read from its events, for the watcher during another player's command. The tally is public, like the rest of the
  battlefield (in fog of war, that of every character the viewer can see,
  §27), and undo restores it with the snapshot.
- **Mastery is read from game results, not from a new collection.** C5 gives
  Realm Arena's `GameResult` stats of its own: a schema, its discriminator in
  `GameResultData.ts`, and a writer. For each player and kind of character
  fielded, the writer records a row holding the tallies of every one of that
  kind, pooled. A player's XP is then the weights
  of §23.1 applied to an aggregation over their results. Nothing stores XP,
  so it can't get out of step with the games behind it.
- **A battle snapshots each player's ranks when it's created**, from which
  the options they unlock follow (see below). The
  `Muster` check reads only that snapshot, so a rank reached mid-battle
  changes nothing, and a replay checks a muster the same way years later.
  `buildInitialRealmArenaState` takes the snapshot as a second input, so the
  starting state is no longer rebuilt from the seat order alone (§17.1). The
  replay adapter passes the snapshot back from the persisted field.
- **What PR 1 settled:**
  - **The tally counts the action, not its events, for the actor.** An
    attack or aimed shot is an attack, a cleave is one ability however many
    it strikes, and a throw or a draught is an item. A sneak is a move and
    earns nothing. Only the reactions are read off the events: each `shot` or
    `struck` marked as a reaction is an attack for its watcher. A fighter
    has no tally until it first earns something.
  - **The result keeps a row per player and kind of character**: that they
    fought with it, and the tallies of every one of that kind pooled. A
    battle given up during the muster has no rows.
  - **A dropped player earns nothing from that battle.** Their squad leaves
    the battlefield (§17.4 B2), and its tallies go with it.
  - **The snapshot is ranks, not options.** No option exists until PR 2, and
    the options a rank unlocks are data keyed by rank, so the battle keeps
    each player's rank with each character (`mastery`, only ranks above 0).
    An option, once given a rank, keeps it, so a replay still checks an old
    muster the way it was checked.
  - **XP counts the same battles a profile does**: those that count as
    played, and none with an unclaimed guest at the table, until they claim.
    One aggregation for the whole party, on the `playerIds` and `gameType`
    index, with each result cut to the party's own rows before they're
    unwound. It reads one result per battle the party has fought, which is
    tens of milliseconds at thousands of battles. If a record ever outgrows
    that, the next step is a running total per player written beside each
    result.
  - **A rank can go down.** A deleted account takes its results with it,
    the other players' rows among them (as it takes its wins from their
    profile), so a player's XP from those battles goes too. A battle already
    created keeps the ranks it snapshotted.
  - **A battle starts even when mastery can't be read.** The lookup has three
    seconds on the database and half a second more to answer (`withTimeout`,
    for a driver that never reaches the server); past that, or on an error,
    nobody is ranked, and the log says so. It's the whole
    party's lookup, so everyone has the starter characters alike, and ranks
    only unlock options.
  - **The result page shows each character's XP from the battle.** The
    profile's totals and ranks came in PR 3.
- **What PR 2 settled:**
  - **Options are data**: `OPTIONS` in `characters.ts`, each naming its
    character, its rank and what it swaps, an ability or the weapon. `kitOf`
    is a character's weapon and abilities with its option swapped in, and
    the rules read a fighter's kit through it (`weaponOf`, `abilitiesOf`), so
    a Man-at-arms with Shield bash can't Cleave and one without can't bash.
    The new abilities sit in `ABILITIES` beside the starter ones. Frost bolt
    is a weapon with an `effect`.
  - **The pick carries the option** (`MusterPick.option`), and so does the
    fighter (`Fighter.option`), absent on a starter character. A ready-made
    squad has none.
  - **The muster is checked against the snapshot.** `musterRefusal` takes
    the player's own ranks from the battle's `mastery`, and refuses an option
    that isn't that character's, or that the rank hasn't unlocked. Nothing in
    the request is read for a rank. The response carries the viewer's
    own ranks from the snapshot (`mastery`), so the muster screen checks with
    the server's own rule. Since PR 10 it carries nobody else's: a profile's
    ranks are for its owner and their friends, and a stranger can join a
    battle.
  - **Each option is an `Act` of its own**: `shieldBash`, `cripplingShot`
    and `huntersMark` are aimed at a character, `demolish` at the square of
    cover, and `purify` needs nothing aimed. Frost bolt is the Mage's attack,
    and its overwatch, as before.
  - **An effect from a shot comes only on a hit**, Crippling shot's and
    Frost bolt's alike, and Frost bolt's on overwatch too. Shield bash always
    stuns whoever it doesn't down. A crippling shot is shot at the bow's
    usual odds, with nothing of the aimed shot's bonus.
  - **Demolish strikes everyone beside the cover but the Knight, friend or
    foe**, as every blast does, then the cover goes, after the damage (§22).
    It's told as a `demolished` event, then the `blasted` one. Who it strikes
    (`demolishArea`), the cover it can be aimed at (`coverNextTo`) and what a
    shot leaves on a hit (`shotEffect`) are one helper each in `rules.ts`, which
    the board's preview reads too.
  - **Hunter's mark is aimed as a fireball is**, at an enemy in sight within
    12 squares, and told as a `marked` event, then the `effect`.
  - **Purify reaches the Cleric and every ally next to it**, as a draught does,
    and only those it would do something for: hurt or afflicted. "Every
    effect" means every affliction (burning, stunned, slowed and marked), not
    a stance an ally took itself, so a shield wall or hunkering down stands.
    Each ally reached is a `healed` event `via` Purify, as a draught's is
    `via` the draught. Nobody beside it needing it refuses it.
  - **Undo**: a Hunter's mark, a Purify and a Demolish that strikes nobody
    can be taken back, the cover with it, like a throw. A shield bash and a
    crippling shot never can.
  - **The board plays them already.** The turn sheet's rows come from the
    fighter's kit, so a figure mustered with an option shows that option's
    row, aims it, and previews it. Nothing could be mustered with one until
    PR 3's muster screen.
- **What PR 3 settled:**
  - **The muster offers options beside items.** A character picked up while
    placing the squad shows its options above the items it can carry. Each
    option sits under the part of the character's own kit it swaps out, a
    `BuildRow` for that part marked taken until an option replaces it, so the
    player sees what they'd give up. Tapping a row takes it, and tapping the
    character's own part goes back to the starter character. One the
    player's rank hasn't unlocked is greyed, with the rank that unlocks it,
    so the muster also shows what's still to earn. A weapon an option swaps
    in can bring its own mark: Frost bolt's is frost, not the Mage's fire. Each
    character's step names its rank, read from the battle's snapshot, the
    same ranks the server checks the muster against.
  - **The profile's section lists all six characters**, once the player has
    fought a battle: each one's XP, how much more the next rank needs, its
    rank and the options it has unlocked. One never fought with is greyed at
    0 XP. A player who has never fought has no section at all. Both profile
    screens show it, a friend's too, since ranks are public.
  - **The profile reads it the way a battle's creation does**, one
    aggregation for the one player, alongside the rest of the profile, and
    with the same limits: on the database, and on the wait for a driver that
    never answers. It fails soft, as the achievements do: a read
    that fails shows no section, and the next one asks again.
  - **The guide's first section tells it**: what earns XP, the XP rank 1
    needs (read from `RANK_XP`, so a retune can't leave it behind), what an
    option is, and that the profile shows the ranks.
- **Ranks and unlocked options are public**, like the rest of a profile. Only
  the options picked for a squad are sealed, with the rest of the muster.
- **The client never claims an option.** It sends the pick, and the server
  refuses an option the player hasn't unlocked.
- **The muster screen** shows each character's rank and unlocked options
  beside the item picker. The profile gets a Realm Arena section showing each
  character's XP and how far it is from the next rank.

### 23.4 PRs

1. **Mastery from results**, built: the tally, the result stats and their
   writer, the aggregation into XP, the snapshot at creation, and the replay
   adapter reading it back. Reviewers: `gremlin` (the cost of the aggregation
   on a long record), `rulebook` (the wiring of the result stats).
2. **Options**, built: the rank-1 options as data and rules, the muster check
   against the snapshot, and the board playing them. Reviewers: `caveman`,
   `locksmith` (an option claimed but not unlocked).
3. **Screens**, built: options at muster, the profile section and the guide
   text. Reviewers: `caveman`, `rulebook`.

## 24. Questions (round 7)

Open, and worth settling before each part is built:

1. **Effects (§20):** are these four the right ones to start with? Poison and
   a positive effect (blessed: +10% to hit) are the obvious next ones.
2. **Items (§21):** are one slot and 5 points right? At 100 points, three
   items cost 15, as much as a Man-at-arms.
3. **Smoke (§21.2):** is −20% and no overwatch into it enough, or should it
   block sight? If it blocked sight, sight would depend on the battle, not
   just the map, and every replay and every preview would have to carry it.
4. **Blasting (§22):** should a fireball blast cover at all, or only the
   flask and Demolish? With Burning, a fireball already does 5 damage over
   two turns, enough to down a Mage, so one that also strips cover may be
   too strong for 30 points.
5. ~~**Mastery (§23):** one per battle fought, or more for what a character
   did?~~ *Answered in round 10:* it's earned by actions (§23.1).
6. **Mastery (§23):** do rank-1 options belong in the tutorial and guide from
   the start, or only once a player has unlocked one?

---

## 25. Elevation

Round 8 (§11.8) gives the ground real heights. A map is no longer only
which terrain each square holds, but how high each square stands, and the
height is what cover, sight, climbing and high ground are read from. That
is what makes maps other than a fort on a plain possible: a hill, a ridge, a
sunken road, a keep on a mound — and, later, maps generated rather than
drawn.

### 25.1 Heights

- **A height is counted in quarters of a full height**, a character's own:
  `FULL_HEIGHT` is 4. Every height is a whole number of quarters.
- **A square's top is its ground plus its terrain.** The map gives the
  ground (§25.3); each terrain stands its own height above it (§13.1's
  table): a wall a full height, rubble a half, a tower top one and a half,
  and the parapet round it two.
  So a wall on a hill is a full height above the hill.

### 25.2 Rules

- **Cover comes from the rise**: how far the square beside a character, on
  the attacker's side (§13.1), rises above the character's own square. A
  quarter gives none, a half or three quarters half, a full height or more
  full. Trees give full cover whatever the heights. The rise is measured
  from the character, not the attacker, so a wall still covers whoever is
  behind it against an archer on a tower who can see over it.
- **Sight** is blocked by anything a full height above both characters:
  a wall between two characters on the ground, but not between a tower top
  and the ground beyond the wall. Trees block it whatever the heights. Low
  cover and characters never do.
- **Climbing.** A step up or down of a quarter is an ordinary step. Half or
  three quarters is a climb, which costs 1 more movement point
  (`CLIMB_COST`). A full height or more can't be climbed, except onto or off
  a stair, which is never a climb by as much as the stair itself rises — so
  a stair beside a cliff doesn't scale it. A **Scout** climbs a full height, and no
  more. A diagonal step can't cut past a corner that can't be entered, or
  that stands a full height above both its ends.
  - Crossing one square of low cover costs what it did: 2 to climb on, and 2
    to climb off onto open ground, against 3 and 1 before.
- **High ground** is half a height or more above the target: +10% to hit
  (§13.3). It's no longer only the tower top.
- **Melee** — a strike, Cleave, and a guard reaction — needs the two
  characters within a quarter of each other's height (round 9), so nobody on
  the ground strikes someone on a tower top beside them. A healing draught,
  raising and the shield wall still only need them next to each other, and a
  heal only needs its ally in range and in sight.
- **Parapets.** The wall round a tower top is a parapet, standing half a
  height above the top, so whoever is up there has half cover from that
  side by its height alone (round 9). A side where the parapet is missing,
  or fallen to an ordinary wall, gives none: the Ring Fort's towers are open
  on the side facing the courtyard.
- **Standing** is still the terrain's to say (§11.6, answer 1): low cover is
  climbed over, never stood on, whatever its height.

### 25.3 The map's data

- **A battlefield in memory is a tile per square** (`Tile` in
  `src/utils/games/battlefield/terrain.ts`): its terrain and its elevation
  — the top, in quarters — so a new fact about a square is a new field on
  `Tile` rather than another parallel array.
- **A map as written down is a set of layers**, each a string per row with
  a character per square: `rows` for the terrain, as before, and an optional
  `elevation` for the ground under it, one base-36 digit (`0`–`9`, then
  `a`–`z`) of quarters a square. Left out, the map is flat. A new fact about
  squares is a new optional layer.
- **Not an object per square.** A 48×48 map is 2,304 squares; as JSON
  objects it can't be read, drawn or reviewed by hand, while a layer can be
  — and a layer is already plain data, so a map generator can produce one
  and a battle could store one, the day a map is generated rather than
  shipped as code (today a battle stores the map's id, §17.2).

### 25.4 What changed on the three forts

- **Tower tops see over the curtain wall**, which now blocks sight only
  between characters on the ground. Every wall touching a tower top is now a
  parapet, half a height above it, so whoever is up there has half cover
  from every side but the stair's — and, on the Ring Fort, the courtyard's.
- **A tower is only climbed by its stair.** The old rules let a character
  step onto a tower top from any open square beside it; a tower top
  one and a half heights up can't be. The Ring Fort's flank towers each had
  a second stair drawn that only touched the tower diagonally, past a wall
  corner, and so could never be used; it moves one square up, beside the
  tower, so each flank tower has a stair on both sides as drawn. Its
  fairness tests hold as before.

### 25.5 Open questions

1. **A map generator**: what kinds of map, and does a generated battle store
   its map rather than an id?
2. **A tower with one stair** (the Ruined Fort's, the Four-Gate Fort's) can
   be shut by an enemy standing on the stair: whoever is on the tower top
   can't come down until it moves. Is that a tactic, or should every tower
   have two ways down?
3. **Old battles.** Maps are stored by id, so these rules reach every stored
   battle, and a replay of a playtest battle from before them can go wrong
   (a step onto a tower top from the ground is now refused, a strike across
   a height is too, and walls touching the towers are now parapets).
   *Settled by PR 10* (§17.3): the game launched at command version 2, and a
   battle holding an older command isn't replayed, so a playtest battle goes
   without a recap rather than getting a wrong one, and a later rule change
   can tell old moves from new.

---

## 26. Battle visuals (C4)

*Asked for in round 10* (§11.10, answer 3), before mastery. Today an
action's result is text. The sheet lists what the last action did, with its
rolls, and a figure's HP bar gets shorter. Nothing on the board shows *this*
arrow hitting *that* Knight for 3, or a fireball landing. C4 adds that: numbers
that rise off the figures, and the shot or the fireball flying to get there.

It changes no rule. Everything it draws comes from events the server already
sends (`BattleEvent` in `rules.ts`).

How the board draws and times it — and a review of what should change there —
is kept apart, in [`../isometric-animations.md`](../isometric-animations.md).

### 26.1 What the player sees

- **Hit text** rises off the figure it happened to and fades within about a
  second. Its colours are the design system's tokens:

  | Event | Text |
  |---|---|
  | A hit | **−3**, in the danger colour |
  | A graze | **−2** with "Graze" under it, in amber |
  | A miss | **Miss**, muted |
  | A strike | **−4** |
  | Burning, as a turn begins | **−1** with the burning mark |
  | A heal or a draught | **+4**, in green |
  | An effect put on | its name under the number ("Stunned") |
  | Knocked out | **Down**, after the damage |
  | A stance taken | **Hunker down** or **Shield wall**, with the stance's mark beside it |
  | A watch kept | **Overwatch** over an archer or a mage, **On guard** over a melee fighter, all of a turn's together |
  | A reaction fired | **Overwatch** over the shooter as its arrow is loosed, **Guard** over the fighter as its slash starts |

- **Words for what the camera is looking at.** The review pans to a character
  that hunkers, raises a wall, goes on watch or reacts, and none of those
  put anything on the board but a stance's mark on the figure: the words are
  said over the character itself, in the same text as "Down" and "Spotted"
  (the "word" tone), so a player needn't look down to the log to see what
  they are. They are said only for what the viewer was told, and over a
  character whose square isn't known they are skipped. A reaction's word
  lands as it fires, so the hit's own timing doesn't move.
- **The Archer's shot.** An arrow flies from the Archer to the target on a
  shallow arc, quickly (about 0.4 s). On a hit it stops in the figure. On a
  graze it glances off. On a miss it flies past and lands beyond the target.
  An aimed shot and an overwatch shot fly the same way.
- **The fireball.** A ball of fire flies on a higher, slower arc (about 0.6 s)
  from the Mage to the square it was aimed at. It bursts across the 3×3 in a
  flash and a ring of flame. The numbers rise from everyone it hit at once,
  and the scorched squares (§22) appear as the burst fades.
- **Then the rest, almost for free.** With a flight and a burst built, the
  Mage's bolt is a quick spark in a straight line. A flask is a thrown pot on
  the fireball's arc, with its own burst: fire, a thunderclap's flash, a puff
  of smoke. A strike is a short slash over the target. The two the round asked
  for come first (§26.3).
- **In order.** One action can set off several things, like a move that draws
  two overwatch shots, or a fireball that downs two characters. They play one
  after another, in the order of the events, each starting as the last one
  lands. An overwatch shot flies to where the mover was when it was shot,
  which is the end of the path so far, not where it stopped.
- **A move walks.** The character is drawn crossing the path the viewer was
  told, a square about every 0.11 s, turned to face each step and rising and
  falling with the ground, and arrives where the path ends. Its resting figure
  (HP bar, AP, effect marks and all) stays hidden until it gets there. A walk
  starts as the last thing landed, and what comes after waits for it: an
  overwatch shot fired part-way through a move flies once the first leg has
  walked, at the square the mover stopped on, and the rest of the move walks
  once the shot has landed. In fog of war only the squares the viewer saw are
  walked, and a mover that came into sight on the way is drawn as it stands
  after. A path of fewer than two squares plays nothing. With
  `prefers-reduced-motion` set a character is simply where it ended up.
- **A figure downed by the action stays drawn until its hit lands**, and
  then fades, so the arrow has something to hit. One downed partway through a
  move stands on the square it fell on only once it has walked there.
  Otherwise the board shows the state after the action, as it does today.
- **A caption says what is happening.** While an action plays, a pill over
  the foot of the board says it in a sentence — "Alice's Man-at-Arms struck
  your Knight for 4" — and turns to the next as each thing starts to play: a
  move as the walk sets off, a shot as it's loosed, "Your Knight is down" as
  it falls. It is the same wording as the action's results (`eventLines`'
  `sentence`), so in fog of war a shooter out of sight is "a character out of
  sight" there too. Each caption is a cue on the timeline (`CaptionCue`,
  `captionAt`), so it keeps in step however the playback is squeezed, and the
  last one stays for as long as the step is shown. Live, in a review, and for
  each of a co-op warband's actions alike; the view frames the action clear
  of it (`BoardZoom`'s focus `inset`).
- **When it plays.** It plays when the player's own action comes back, and
  when a review steps through another player's turn (§17.3 PR 8). The review
  is where most players will see their own squad get hurt. Opening the game
  doesn't replay anything by itself.
- **It never gets in the way.** The board can be used while it plays, and the
  next action cuts it short. However much one action set off, its whole
  playback fits in about four and a half seconds: the walks are hurried
  first, then the gaps between blows, then the text, and what flies keeps
  its time (the longest run, twenty-six straight squares, is 2.75 s of it
  before any hurrying). With
  `prefers-reduced-motion` set, nothing flies, bursts or walks: the hit text
  appears in place and fades.

### 26.2 Building it

- **A pure timeline.** One function in `ui.ts` turns an action's events, and
  the fighters before it, into timed cues. A cue is a flight from one point to
  another, a burst over some squares, a text on a figure, or a walk along a
  path, each with a start and a length. It's tested like the rest of `ui.ts`:
  the order, a walk before the shot that follows it, an overwatch shot aimed at
  the right square, a miss landing beyond the target, and the playback cap.
- **One layer on the board, one clock.** `RealmArenaFx` draws the flights,
  bursts, slashes and hit text in an overlay SVG stacked over the board's, with
  the same viewBox, so it zooms, pans and turns with the view (§13.1) without
  its frames repainting the board. It uses the same isometric projection, at
  each figure's height. The arrow, the fireball and the burst are drawn art: an
  SVG master rendered by `npm run ra-marks`, like the effects and items. A walk
  is the board's own: the figure and its HP bar slid between the middles of the
  path's squares, drawn in the depth order at the square it is nearest, so a
  wall in front of that square hides it. Everything that moves — the walk, the
  flights, the text, the fades, the knocks and the shake — reads one playback
  clock (`PlaybackClock`, run by `usePlayback`'s single frame loop), which sets
  SVG attributes a frame at a time with no React render, and is paused while
  the view glides to the action. The resting figure of whoever walks stays
  hidden until the walk's end.
- **The review needs each step's events.** A replayed snapshot carries the
  state after a command, not the command's outcome. The difference between two
  snapshots shows the damage but not a miss, so it isn't enough. The timeline
  route already resolves every command to build its snapshot, so the replay
  adapter can opt in to sending that command's events with the snapshot. Only
  Realm Arena opts in. Its events are all public once the battle starts,
  since the log tells every one of them — except, in fog of war, what the
  viewer's squad didn't see (§27.2). A muster's outcome carries none.
- **Play, and a co-op End turn's parts.** The review can play itself: Play
  steps forward one recorded action at a time, resting on each for as long as
  the board takes to play it, until it reaches the current position, and Stop
  takes its place while it runs. The recap screen's "Replay from your last
  turn" starts the same walk from the step before the viewer's last command.
  Starting it scrolls the board into view. Nothing guesses how long a step
  takes: the board says when a playback has played (`onPlayed`), and the page
  rests half a second's beat (`STEP_BEAT_MS`) before moving to the next part,
  or telling the review hook the step is over (`awaitsStepEnd`, `stepEnded`).
  A part with nothing to play rests a floor (`STEP_MIN_MS`) instead. The cues
  wait for the view: the board's playback clock stands still, as it stands at
  its start, until `BoardZoom` says the glide to it has all but landed
  (`onFocused`, three-quarters of the way through it), so the action starts as
  the view eases in rather than after a glide that has nearly arrived, however
  long a slow phone takes over it.
  In co-op the warband takes its whole turn inside the player's End turn, so
  that one step's outcome also carries `parts`: the player's End turn with the
  burning that began the warband's turn, one part for each action the
  warband took, and its End turn with the next seat's burning. Each part
  has the events it plays and, except the last, the board it left, drawn
  for the viewer through the same fog as the snapshot (§27). Whenever such a
  step is shown, play or step by hand, the page plays the parts one after
  another: each part's cues start from the board the part before left, the
  board, units, scores and stats are drawn as that part left them, and the
  zoom follows each part's own changes (every part has its own playback and
  follow key). The follow is by kind: the player's End turn and each of the
  warband's actions are followed, the hand-off is not (it moved everyone's AP,
  not anyone in particular), whether or not the part before it was left out.
  A move is framed over its whole path, from where the mover began to where it
  ended, with the zoom that just fits it (`moveFrame`; the first `moved` event
  of the part to the last of the same character's), so a route round a wall
  stays in frame. In fog of war, a move that came into sight or went out of it
  is framed over the stretch the viewer saw instead — from where its told path
  begins, or to where it ends — which is what the board walks; a move told with
  no path frames nothing. A move too long to frame that way (`TRACK_SPAN`) is
  followed instead: the view frames where it starts, as close as a character
  selected with nowhere to go, and follows the walker as it goes, smoothed
  so it glides along the way the walk goes rather than round every corner (`track`, the board's `WalkCamera`), until a player's own touch on
  the board takes the view back; with reduced motion nothing walks, so it
  frames where the move ended. Anything else is framed round whoever
  acted and whoever it reached, as the part's events name them (`toldSquares`),
  with the zoom that just fits them and as close as a target picked to aim at
  (`aimFocus`): a heal three squares off fills the frame, and two shots at the
  same target are framed alike; told squares spread over more than half the
  battlefield fall back on the viewer's side, as below. Only a part told nothing that places it follows
  every character it changed (`actionSquares`), as deep as they all fit. A turn beginning is not a character doing something: AP going
  up (everyone's fresh allowance) is not a change `actionSquares` follows, only
  AP spent, banked AP changing, and a new square, hit points or effects. A part
  with nothing to follow (the hand-off), or whose squares span more than half
  the battlefield across or down (`spreadWide`), takes the view to the viewer's
  own side instead (`friendlySquares`), zoomed exactly to fit them and keyed by
  the part as usual so it still glides again for each; a move is always kept.
  The dock says which part it is on ("the Renegades' action 2 of
  5"). A step with no parts is one part, so the two take the same path.
  Live, the player's own co-op End turn plays the same way as it comes back:
  the command's response carries the step its review would show them
  (`step`, the replay adapter's `snapshotOutcome` for the sender, so it tells
  them nothing a review wouldn't), and the page plays its parts one after
  another, each with its own view and the board as it left it, resting a beat
  between, rather than the warband's whole turn squeezed into one playback.
  The turn's controls wait until the last part, whose board is the live one;
  a part the board never says has played is let go of a few seconds after it
  should have ended.
- **Somewhere out of sight.** A followed step or part that told of something
  other than a score, and that the board can place nowhere — no move to frame
  (`moveFrame`), no character it changed (`actionSquares`), no cue — is
  unplaced (`isUnplaced`): in fog of war, an enemy's action the viewer was
  told only the cost of. The view still falls back on the viewer's own side,
  and the board lays a large half-transparent "?" over the middle of its
  frame — outside the zoom, so it stays centred as the board pans — for as
  long as the step is shown, fading in and out and settling in afresh for each
  step. A step spread wide is placed, only wide, and gets no mark; the
  hand-off and anything live get none either. With `prefers-reduced-motion`
  set it just appears and goes.
- **Kept local for now.** Hit text could suit other games, such as World
  Domination's battles. It stays in `src/games/RealmArena/components/` until
  a second game wants it (AGENTS.md's second-copy rule).

### 26.3 PRs

1. **Hit text.** *Built.* `battleCues` in `ui.ts` and `RealmArenaFx` on the
   board, on the player's own actions and End turn as they come back, and on
   each step of the review. What it settled:
   - The beats are 0.45 s apart and a piece of text lasts a second, so five
     fit the three seconds before anything is shortened.
   - An effect goes under the number that came with it ("−3", "Burning").
     A flask that does no damage names its effect on its own, on everyone it
     lands on at once. A heal that clears an effect says "Cured" under it, and
     one that only clears says "Cured" alone.
   - A Raise is "+N" with "Raised" under it. A stance, a watch, a smoke pot
     and a score play nothing. (A move played nothing here; it walks now.)
   - The text rises from where the character stood when it happened, so an
     overwatch hit rises mid-path, where PR 2's arrow will land.
   - A replayed snapshot carries the events as `outcome` through the replay
     adapter's `snapshotOutcome`, less a shot's roll, which the log never
     tells — and, in fog of war, built per viewer (§27.3). Only Realm Arena opts in.
   - The player's own playback is dropped once it has played, so leaving a
     review doesn't play it again.
2. **The shot and the fireball.** *Built.* The arrow and the fireball with its
   burst, then the bolt, the flasks and the strike, and a figure downed by the
   action staying drawn until its hit lands. What it settled:
   - Each thing an action did lands at least 0.45 s after the last, and sets
     off no sooner than the last one landed. Its text rises as it lands.
   - A shot is a bolt if the Mage fired it and an arrow otherwise. A hit
     sticks in the figure and fades; a graze glances off, turned upward; a miss
     is aimed just over the head and flies on past, coming down beyond.
   - A fireball or a flask flies to the square it was aimed at and bursts
     there, whoever it hit, so a smoke pot or a flask thrown at nobody still
     plays. A fireball, a thunder flask and a smoke pot burst over the 3×3; a
     fire flask over its one square. The smoke pot's burst is its own cloud.
   - A strike is a slash across its target, its damage rising as the slash
     lands.
   - Cover a burst blasts away stands, drawn from the battlefield as the
     action found it, until the burst fades, and then fades off the scorched
     ground. A downed figure does the same over its fallen one.
   - Everything is moved a frame at a time on the one playback clock, by
     setting SVG attributes, never by CSS keyframes: what flies turns to face
     the way it's going, a burst, a slash and the text rise and fade, and a
     fall and blasted cover fade. The board's pulses (a wave's zones, a
     lined-up HP change) are drawn after everything else: a keyframed opacity
     in the middle of the depth order is a compositor layer that drags
     everything in front of it into more, which on a phone shows as black
     flashes and a stuttering board.
   - The art is `fx.svg`, rendered to one sheet with the rest by
     `npm run ra-marks`. A flask in flight is drawn bare, without the tile its
     mark has.

The game isn't announced yet, so neither PR gets a What's new line (§17.1).

### 26.4 Open questions

1. **Should opening the game play the last few actions** of the other players'
   turns, instead of leaving them to the review?
2. **Should figures walk their path?** Nobody has asked for it, but it would
   make an overwatch shot mid-move easier to read.

### 26.5 Figures

Each figure is its character's art — rendered from a model in code
(`art-masters/realmarena/characters`, `npm run ra-characters`) — in its
owner's colour, from whichever of eight directions it faces. It faces the way
it last stepped (`Fighter.facing`, set as it walks); before its first move it
faces the middle of the map. Facing is only for the eye: no rule reads it, so
there's no flanking or facing bonus. A downed figure lies on its square, and a
figure on watch stands in a dashed ring.

---

## 27. Fog of war (B5)

*Built.* §8 weighed it; this is what was built. Every rule in §13–§26 still
holds, in fog or out of it. Fog changes what each player is told and, in one
place — moving — what a player can be held to knowing.

### 27.1 The rules

- **The host chooses.** The setup screen has a *Fog of war* switch, on to
  start with. It's fixed when the battle is created and stored with it
  (`fog`), so a replay plays it the same way, and every battle from before it
  is a battle without fog.
- **A character sees 20 squares** (`SIGHT_RANGE`), wherever its line of sight
  is clear (§25.2): the same line a shot needs. An Archer or a Scout, the
  overwatch specialist and the scout, sees 25; a Knight, slow and buttoned up
  in armour, sees 15 (`sight` on `CHARACTERS`, read by `sightOf`). Each sees
  at least as far as anything it can use reaches — its weapon, its abilities
  and its options, any item — so anything a character could shoot, aim or
  throw at, it can see. Fog takes nothing away from what can be done, only
  from what's known. A test holds every character to that.
- **A player sees what their squad sees**: their own characters, wherever
  they are, and every other character, standing or fallen, on a square one of
  their standing characters can see. A fallen character sees nothing. In
  free-for-all every squad sees for itself; teams (B3) will share their sight.
- **An enemy out of sight in a move's path is found and gone round.** A path
  is checked against what its player can see, so one may run through an enemy
  they can't. Stopping short there would leave the mover stranded in the
  open with its AP spent, so it doesn't: it takes the cheapest way round to
  the square it was sent to, within the AP it has. When there's none — the
  enemy stands on that square, or the way round costs too much — it goes as
  near to it as it can — nearest to walk to, not as the crow flies, so it
  never loops round a wall for a square only a crow would call closer. Either
  way it pays for the path it walks, not the one sent (`routed`), which may be
  more than the move's preview showed: the preview can only show the path as
  sent. The way round keeps clear only of the enemies the player
  now knows of, so its shape gives nobody else away; one it crosses that it
  couldn't see is found and gone round too. Each is told as a `spotted`
  event, before the move: "their Scout found Bob's Knight in its way, and went
  round". Watchers out of sight react as ever, along the path walked, and the
  path's preview can only flag the ones the player can see.
- **What's been seen can't be unseen.** An action after which the player's
  squad sees an enemy it didn't see before can't be undone (`revealed`), or a
  player could step round a corner, look and step back. Seeing nobody is taken
  back with the move, though: nearly every move changes what a squad sees, so
  refusing undo for any new ground would take undo out of fog altogether. A
  look that finds an empty corner — or a flask that lands on no one where the
  player can't see — is a small gift, and an accepted one. A move that finds an
  enemy in its way never can be: it showed the player that enemy.
- **The board remembers the last sighting.** When an enemy leaves a player's
  sight, a translucent figure stays on the first hidden square of its path —
  where it entered the fog, facing the way it stepped in — never on a square in
  sight, where it would stand beside whoever is really there. It is only a
  stale marker, not the enemy's current position or state. As soon as that
  square is visible again the marker goes; the real character is shown if it
  is there, otherwise the square is empty. An enemy seen lying down leaves no
  marker.
- **The fog lifts when the battle ends.** The last state, the results and
  the whole log show everyone.

### 27.2 What fog hides, and what it doesn't

- **Hidden: where everyone else is, and the state they're in.** An enemy out
  of sight isn't on the wire as a live character — not its current square,
  HP, AP, effects or item. Its viewer-specific last sighting is sent only as
  the small stale marker described above.
- **Not hidden: the ground.** Cover blasted away is gone for everyone (§22):
  a blast is heard across the field, and the board and the rules read one
  battlefield. A smoke cloud is seen wherever any of its 3×3 is in sight,
  whether or not its thrower is, and not otherwise — even on a thrower in
  sight. Spotting a new cloud counts as spotting an enemy for undo.
- **Hidden: what happened out of sight, in the log, the recap and the
  review too.** A player is told what their side saw (`toldTo`): anything
  their own side or an ally did, anything done to one of theirs, and of
  everyone else only what a character of theirs saw — a shot or a blow whose
  shooter or target was in sight, a character in sight going down, being
  healed or going on watch, a move that crossed a square they see, a blast
  landing where they see some of it. Something nobody of theirs saw isn't
  told at all, not even that it happened: an enemy hunkering down out of
  sight leaves no line in their log, no row in their recap and no step in
  their review. Told part of something, they're told that part, and a
  character in it they didn't see is "a character out of sight": a shot at
  one of theirs from the fog says "Bob shot Alice's Knight with a character
  out of sight (65%): a hit for 3" — that they were hit, and the odds, not
  who fired. That a turn ended is everyone's, so an End turn's line is told to
  all, less the characters going on watch that the viewer can't see. The
  scoreboard shows how many of another squad the viewer can see, not how
  many stand.
- **Not hidden: the scores.** The scoreboard is everyone's, so a point scored
  out of sight is told as the log's "scored 3 for the knock-out", though not
  who was knocked out or by whom. Points hint at a fallen character's cost.
- **Not hidden: whose turn it is**, and that it ended, with the turn's
  timestamps. Nor how many commands have been played, which every response
  carries as a count (`commandCount`) for out-of-turn plays: a player who
  watches it can tell that something was done out of sight, never what.
- **Accepted: fighter ids.** Ids count from 0 in seat order (§17.2), so an id
  seen hints at how big the squads before it are. The log names every
  character the viewer saw act anyway.
- **Hidden: a watch out of sight.** Neither the log nor a review tells a
  viewer that a character they can't see went on watch, let alone the AP it
  banked — how many reactions are waiting.
- **Accepted: a shot's odds.** A shot from out of sight at one of the
  viewer's characters is told with its chance to hit, as the sheet showed it
  before the move: a hint at the cover between them, not a square. A shot
  between two squads the viewer can't see isn't told at all.
- **Accepted: a shield wall out of sight.** A Knight's shield wall covers an
  ally beside it whether or not the shooter sees the Knight. The odds shown
  before a shot can't count a Knight the player can't see; the server does.

### 27.3 Engine

- **`viewOf(state, player)`** (`rules.ts`) is the battle as one player knows
  it: their squad, everyone it sees, and the clouds it sees whose throwers it
  doesn't (`clouds`). Without fog it's the battle itself. `check` reads the
  player's view, so what can be done is decided by what can be seen; and a
  view read again is itself, so the board, which only holds a view, checks
  with the server's own rule.
- **The response** (`gameStateToModel`) is the viewer's view while the battle
  is fought, and everything once it's over. A viewer with no squad — a replay
  built for nobody — sees no one. The muster's seal (§17.2) is untouched.
- **What a player is told** of a command is one rule, `toldTo`, read from
  the battle after it: whom their side saw take part (`witnessed` — their
  side, anyone on a square it sees, anyone whose move crossed one), and every
  event about one of them. The log, the recap, the review and an action's own
  outcome are all cut by it, so the four never disagree.
- **The log** is written per player (`writeLine`): each line carries the
  line as each player was told it (`IHistoryEntry.perViewer`) — narrated
  from only their events, a character they didn't see named as one out of
  sight — and a player it doesn't list isn't told it. The shared resolver
  picks the viewer's line for every response, review step and push
  (`resolveHistory`), so nobody else's ever reaches the wire, and nobody in
  particular is told none. An Undo is told to whoever was told the move it
  takes back. As the battle ends every `perViewer` is dropped
  (`tellEveryone`) — by the game type, and by `finishGame` for a battle
  abandoned or ended by hand: the fog lifts, and the whole log is everyone's.
- **A review** (§26.2) is told per viewer: `stepOutcomeToModel`, through the
  replay adapter's `snapshotOutcome`, asked for the timeline's viewer, keeps
  only what `toldTo` tells. Someone else's move keeps the squares the viewer
  saw, and only when it ends on one — one that ends out of sight is told with
  no path, and the board loses the mover there. A step that told the viewer
  nothing — no line of their log — is left out of their timeline
  (`omitUntoldSteps`), or its summary would say that something was done, and
  what kind of thing. A step kept for the part of it the viewer saw — or for
  the points it scored, or the cover it blasted — calls another side's action
  only "acted" (`stepSummary`): its kind, a fireball say, would name the
  character behind it. A blast's line counts only the characters it hit that
  the viewer saw.
- **The recap** is built for its viewer (the recap adapter's `toEvents` is
  handed them): each command's outcome carries what each player was told of
  it (`recap.told`, and for the enemy's turn each step's), never sent, so an
  action they were told nothing of has no row, and one they were told part
  of takes its kind, glyph and who it hurt from that part. A reaction is
  looked up among the rows the player reacting was told, and the push quotes
  the move to its player as they were told it, never as the player reacting
  was.
- **What can't be seen isn't said to be empty.** The centre's readout and the
  recap's tip say the centre is out of sight, not empty, when nobody is seen
  there and the viewer's squad can't see all of it; and a recap row doesn't
  count another squad's characters on watch.
- **An action's own outcome** goes back to its sender whole: the only squares
  in it are the sender's own moves and aims, so it tells nothing the log
  doesn't. A character it names that the sender can't see is "a character out
  of sight".
- **The board** dims every square the viewer's squad can't see
  (`unseenSquares`), raised or flat, under whatever else is shaded there.

---

## 28. Battle results

A finished battle's result page tells the battle, as Settlements & Cities'
does its game: not only who won and each character's XP (§23.3), but how the
points came, who did the damage and what each squad went through.

### 28.1 What the result shows

- **Points per round**: a line a player, their score at the end of every
  battle round, with a skull on a player's line in the round each of their
  characters was downed — so a jump in somebody else's line has its cause on
  the chart.
- **Squad health per round**: the HP each squad had standing at the end of
  every round, which shows who was winning the fight when the points were
  level.
- **Damage by character**: a bar for each kind of character in the battle,
  the damage it dealt to enemies, stacked by whose it was.
- **Battle record**: a table, a column a player — points for the centre,
  for knock-outs and, when anybody scored one, for assists (§13.7), enemies
  downed, their own characters downed, damage dealt and taken, HP healed,
  shots taken and the share that landed (a graze counts), reactions on
  watch, and friendly fire when anybody did some.
- **Each player's lines**: their score and where it came from, knock-outs and
  losses, damage and healing, their top fighter — the kind that dealt the most
  — and each character's XP, as before.

### 28.2 How it's read

- **From the game-end replay, not from new state.** Nothing about the record
  is kept as the battle is played. The result replays the battle once, and a
  recorder (`battleRecorder`, `battleRecord.ts`, driven by `recordBattle.ts`,
  which reads only a finished battle) watches every step: the events
  its command returned, and the state after it. Damage is the HP a hit actually
  took, so a hit for 4 on a character with 2 left deals 2. Burning is credited
  to whoever set it alight, as its knock-out is (§20.2). A blast landing on an
  ally is friendly fire, not damage dealt.
- **Rounds are the battle's own**, read off `roundsPlayed`, not the replay's
  turns, so the muster isn't a round and a seat stepped past doesn't shift
  them. A step counts towards the round it began in: an End turn that closes a
  round, and burning as the next begins, are that round's.
- **Undo is followed.** The only thing an undoable action can add to a record
  is healing. The recorder keeps the record as it stood before each action the
  game's own undo stack still holds, and puts it back when one is undone.
- **A replay that drifts is left out.** If the replay doesn't end on the
  scores the battle did, the result keeps the XP alone, as a result recorded
  before the record did.
- **Nothing in it is hidden.** Everything the record reads is told by the
  log, and the fog has lifted by the time anybody reads it (§27). A shot's roll
  is never read: only whether it hit, grazed or missed.
- **A dropped player keeps their record**: the replay saw what their squad did
  before it left, though their characters are gone from the final battlefield.

## 29. Co-op against the computer (B8)

*Built; the proposal was reviewed by the caveman (§29.13).* The players fight together, as
one team, against a squad the game plays itself. Turns stay individual: each
player takes their own turn, as now, and the enemy moves straight after each
one, inside the command that ended it — as the island floods after every turn
in Banned Islet and the infection spreads after every turn in Outbreak.
Nobody waits on the computer, and nobody's turn is shared.

"The computer" is game AI: rules written in code that read the battle and pick
an action. No language model is involved, and nothing leaves the server.

### 29.1 What the players see

- **The host chooses the mode.** The setup screen gains *Free-for-all* or
  *Co-op against the computer*. Co-op is for two or three players. Solo (one
  player against the computer) comes after it (§30.6). There is one
  difficulty to start with; more come with §30.5.
- **The host chooses whom they fight**: a faction, or *Random* (§29.3). The
  players fight as the Realm; the enemy can be any faction, so once there's a
  second one (B6) it can be humans against monsters.
- **Co-op is fought on a battlefield of its own** (§29.2): the team along one
  edge and the enemy along the other, as in a duel on the Ruined Fort.
- **The enemy fields one warband per player.** A warband is a squad of its
  own (§29.6), with a deployment zone of its own opposite a player's. So a
  three-player team faces three warbands, and the enemy's turn after each
  player's moves one of them.
- **The players muster as now**, sealed from each other until the last one
  has (§17.2). Every squad, a player's or a warband, musters 80 points: four
  characters, the three-player budget (§13.6). The battle lasts as long as a
  free-for-all of the same number of players (§13.8): 15 rounds for two, 13
  for three. The warbands' turns run inside the players' (§29.4), so they add
  no hand-offs.
- **The team is one side.** Teammates are allies: they share their sight in
  fog, a Cleric heals and raises a teammate's character as its own, a shield
  wall covers them, and nobody's overwatch fires at a teammate. A fireball or
  a flask still hits whoever is under it, as now.
- **Each player still scores**, for the centre and for knock-outs, and the
  team's score is the sum. Downing a teammate's character scores nobody, as
  downing your own doesn't (§13.6). Nobody scores an assist (§13.7): only
  the knock-out's own side can have hurt a character.

### 29.2 The battlefields

The free-for-all maps don't fit co-op. Their zones are spread round the map so
that every squad faces every other, and co-op is two sides. On the Four-Gate
Fort, three warbands — twelve characters — would deploy in one 8×8 corner and
come out of one gate, while the team closed in on them from three. So co-op
has a battlefield for each size of team.

- **A line battle.** The team deploys along one edge, a zone per player, side
  by side; the enemy along the far edge, a zone per warband, each one opposite
  a player's. That's the Ruined Fort's shape (§15), widened: the Ruined Fort is
  already the battlefield for a team of one, which is where solo will be
  fought (§29.10).
- **Fair by shape.** Each map is unchanged by a half turn, as the Ruined Fort
  is (§15.2), so every warband's zone and approach is exactly a player's. Its
  test checks it, with the checks every map shares (`maps/testFixtures.ts`):
  every zone reaches the keep, nothing standable is sealed off, every tower
  looks into the keep.
- **Wider, not deeper.** The front grows with the team, and the walk from a
  zone to the keep doesn't, so the sides still meet within two turns (§13.1)
  and a turn's planning is no slower (§29.7). The depth is the Ruined Fort's
  and the free-for-all maps' 48.

| | Team | Size | Zones | Characters | Squares a character |
|---|---:|---|---|---:|---:|
| Ruined Fort (as now) | 1 | 36 × 48 | 36 × 3 a side | 10 | 173 |
| **Twin-Gate Fort** | 2 | 48 × 48 | 24 × 3 each | 16 | 144 |
| **Three-Gate Fort** | 3 | 64 × 48 | about 21 × 3 each | 24 | 128 |
| Four-Gate Fort (free-for-all, for comparison) | — | 48 × 48 | 8 × 8 each | 16 | 144 |

Hold Out has a battlefield of its own as well, the Sacked Fort, with the
team in the middle and the warbands round the edges (§30.9).

- **The fort** is the Ruined Fort's, stretched: a curtain wall across the
  middle of the map with a gate facing each zone on each side, a tower between
  each pair of gates and at each end, rubble breaches beside the towers, and
  the keep in the middle. Each player has their own gate and a tower on
  either hand; teammates have a breach between them to reach each other.
- **One keep**, 6×6, scored as Hold the Centre (§13.7). The players at the
  ends walk further to it than the one in the middle. In a free-for-all that
  would be unfair; in co-op it's a team's plan, and the ends hold the flanks.
- **No new art.** A map is a grid of letters drawn from the tile sheets
  (§17.3 PR 9), so a new map is code and its test.
- **A bigger board on a phone.** The Three-Gate Fort is 112 squares corner to
  corner against the Four-Gate Fort's 96, so the whole-map overview is a
  little smaller. The close zoom, the focus on a selected character and
  everything a player taps are unchanged (§13.1).
- **The map is picked by the mode and the party** (`mapFor(players, coop)`,
  beside `mapForPlayers`), and stored with the battle as now. Their ids join
  `REALM_ARENA_MAPS` and `DEPLOYMENT_NAMES`.

**What PR 2 settled:**

- Each map is fixed by a half turn, and by nothing else: its trees and rubble
  outside the walls differ lane to lane, so teammates' approaches match only
  in their walls, gates, towers and breaches. Every warband's matches a
  player's exactly.
- The deployments list the team's zones west to east, then the warbands'
  west to east, so warband *k* stands directly opposite player *k*. The half
  turn carries player *k*'s zone to the warband opposite the last player but
  *k*.
- The Three-Gate Fort's middle zone is 22 squares wide and its ends 21: 64
  doesn't split in three, and the half turn needs the ends alike.
- Each player has their own gate between two towers, with a rubble breach by
  each tower: the breaches by an inner tower are the way across to a teammate,
  and a player at an end has theirs in the side wall. The three checks every
  map shares hold — every zone reaches the keep, nothing standable is sealed
  off, every tower top looks into the keep — and so does the Ruined Fort's
  own: the courtyard is reached only through the gates and the breaches.
- The keep is the Ruined Fort's, square for square, so the middle of the
  Three-Gate Fort walks to it as the Ruined Fort does (19 squares at the
  quickest), and the ends five or so squares further.
- `mapFor` is in place but nothing calls it with `coop` until PR 4a, so no
  battle is fought on either fort yet.

### 29.3 The enemy's faction

The enemy is a faction, chosen by the host, so that when there's a second
faction (B6) — monsters, say — a co-op battle can be the Realm against them.
Nothing in the computer is written for a faction, so a new one needs nothing
from it (§29.7).

- **The host picks one, or Random.** The setup screen lists every faction
  and *Random*, in an `OptionChoiceSection`. While the Realm is the only
  faction there's nothing to choose, so the section hides itself, as
  `ThemeSelect` renders nothing for a game with no themes; it appears the day
  a second faction is added, with no other change.
- **Random is drawn once, when the battle is created**, and stored with it as
  the faction it came out as (`coop.enemy`), never as "random". So a replay
  rebuilds the same enemy, and the draw is made on the server, where no
  client can choose it.
- **A faction the host picked is known from the start**: the setup line names
  it, and the muster shows it. The enemy can't counter-pick (its warbands are
  ready-made, §29.7), so the players may.
- **A random enemy stays hidden until one of its characters is seen.** The
  players muster not knowing whom they'll face, so Random is a real gamble
  rather than a coin toss. Without fog, that's the moment the squads take the
  field. In fog (§27), it's the first time anyone on the team sees an enemy
  character: the team shares its sight (§29.1), so it learns the enemy
  together.

**Keeping a random enemy hidden.** Until it's seen, the faction is hidden
information, kept as a squad is during the muster (§17.2):

- **Seen once, known for good.** The battle stores when the enemy was first
  seen (`coop.enemySeen`), set by whichever command first puts an enemy
  character in the team's view: the last muster without fog, otherwise an
  action, an End turn or the enemy's own turn walking into sight. It's never
  unset. An action that shows an enemy can't be undone already (§27.1), so
  undo can never take the sighting back.
- **Off the wire until then.** The response carries `coop.enemy` only once
  `enemySeen` is set; before that, the board shows "an unknown enemy" on the
  scoreboard and the muster. A review is built from the state at each step,
  so a step before the sighting doesn't carry it either — nor does a part of
  a co-op End turn (§26.2) drawn from a board before it.
- **The log doesn't give it away.** Fog's log tells what the team saw happen
  (§27.2) — "the Renegades' Archer fired on overwatch" — and a character's
  kind is its faction. So until the enemy is seen, `ownerToken` and `narrate` call
  the enemy "the enemy" and each of its characters "an enemy character":
  "an enemy character fired on overwatch at Alice's Knight". A history line
  is kept as it was written, so those lines stay as the team knew them; lines
  written after the sighting name everyone.
- **Accepted: points and ids.** A knock-out scores a fifth of the character's
  points (§13.7), and fighter ids hint at how many characters the squads
  before them have (§27.2). A fireball into the fog that downs an unseen enemy
  tells the team its points' worth, and the ids in a review hint at the
  enemy's numbers; either might narrow down a faction. Both are told today in
  fog, for the same reasons, and the team still hasn't seen what it fought.
  With a second faction (§31) a knock-out's points do tell one from the
  other, so a knock-out of one of the enemy's, like a hit on the team, now
  counts as the sighting (§31.3).
- **The fog lifts when the battle ends** (§27.1), and the faction with it.
- **The players are the Realm**, as in every battle today. Choosing their own
  faction is B6's, for free-for-all and co-op alike.

**What a faction is.** Today the Realm is one object, `REALM`, holding the
ready-made squads, and every character is the Realm's. A faction becomes:

- **`FACTIONS`**, by id, beside `CHARACTERS` in `characters.ts`, with `REALM`
  kept as `FACTIONS.realm` so nothing that reads it changes. An id, once
  stored, is never renamed, as a map's isn't (§19.1); an id no release knows
  reads as the Realm, as an unknown map reads as the Ruined Fort.
- **A faction's own roster** (`characters`): the characters it can muster.
  Character ids stay unique across every faction, so a fighter still needs
  only its `character`, and every rule reads `CHARACTERS` as it does now. A
  muster is checked against its faction's roster.
- **Its ready-made squads** (`readyMade`), as now, held to the budget by the
  test that holds the Realm's. The warbands are its squad for 80 points
  (§29.7).
- **What the enemy is called** (`enemyName`): "the Renegades" for the Realm
  fighting the Realm, the faction's own name for any other. The log, the
  board's labels and the results name the enemy's characters by it — "the
  Renegades' Archer" — through `ownerToken` and `nameFor` (§29.6).

**What PR 2 settled:** `FACTIONS` holds the Realm alone, with its six
characters as its roster and "the Renegades" as its `enemyName`; `REALM` is
`FACTIONS.realm`. A test holds every character to exactly one faction's
roster, and every faction's ready-made squads to its own roster and the
budget. `musterRefusal` is handed the faction and refuses a character outside
its roster; the server and the muster screen both hand it the Realm, which
every player fights as, and the muster lists the faction's roster. Reading a
stored faction id, with an unknown one as the Realm, waits for PR 4a, which
stores the first one.

**What a second faction will bring**, which is B6's work, not this plan's —
and which the Swarm brought (§31):
its characters and their abilities, its ready-made squads, and its figures
(`npm run ra-characters`). One thing in it touches the computer: a new
ability is a new kind of action, and the planner has to know what it's aimed
at — an enemy, an ally, a square, itself — to list the ways it could be used
(§29.7). So each kind of action declares its aim in one table beside the
targeting helpers in `tactics.ts`, which the board's taps read too, and a
test fails if a kind has none. A monster's ability is then usable by the
computer, and by a player, the day it's added.

### 29.4 The enemy's turn

- **After every player's turn, one warband takes a turn.** The warbands go in
  their own rotation, one after each player's turn, stepping past any with
  nobody left standing. With every player still in, each warband acts once a
  round, between the players, as a team in alternate seats would (§5.2): A1,
  enemy, A2, enemy.
- **A warband's turn is a player's turn**: it begins with `startTurn`, takes
  actions one at a time, each checked and applied by the same code a player's
  `RealmArenaAct` runs, and ends as a player's End turn does, with every
  character with AP left going on watch (§6). The rules don't know a computer
  is playing.
- **It happens inside the player's End turn.** `RealmArenaEndTurn` ends the
  player's turn, plays the next warband's, and begins the next player's
  (`handOff`). So the command that ends a turn is the one the next player is
  notified about, as today, and the enemy's turn is in its outcome for the
  board to play out (§26) and the recap to tell.
- **A turn the player missed still gets its enemy turn.** A timed-out turn is
  an End turn (§17.2), so it runs the enemy's too.
- **A dropped player** leaves as in a free-for-all (§17.4 B2), and the
  warbands carry on. With fewer players' turns, each warband acts a little
  less often. That's a small mercy for a team a player short, and it needs no
  rule of its own. The warbands stay out of `turnOrder`, so the rotation, the
  turn timer and the dropout adapter need nothing new.

*Considered and set aside:* one enemy owner whose whole squad moves after
every player's turn. It would need no warbands and no rotation, but every
enemy figure would act once per player — three times a round against three
players — which no budget can balance.

### 29.5 Winning and losing

- **The battle ends** at the turn limit, or when one side has nobody standing
  — the same rule as now, read by side instead of by squad (§5.1, §29.6).
- **The team wins** if its score beats the enemy's. Level scores go to the
  side with more points' worth still standing, as §5.1's first tie-break. If
  that is level too, the enemy holds the field and the team loses. This is
  `standings` read by side (§29.6), not a tally of its own.
- **It's one ending for everybody**, `teamwin` or `teamloss`, as Banned Islet,
  Outbreak and Fires Out end: `winner` is empty and `endDetail` gives the
  final score ("The team 41, the enemy 33"). Those three games each write that
  ending by hand today; this one writes it with a shared `endAsTeam(data,
  reason, line, detail?)` beside `finishGame` in `src/utils/games/`, which the
  other three can move onto afterwards. The result's wording is
  `finishedGameCopy`'s (`src/utils/ui/players.ts`), which already words a
  co-op ending.
- **Mastery is earned as in any battle** (§23.1): a co-op battle is a battle.
  Mastery is read for `gs.seats`, which the warbands aren't in, so they earn
  nothing without a line of code saying so.

### 29.6 Sides: one change shared with teams

Every rule that asks "is this an enemy?" asks today whether two characters
have different owners. Co-op needs it asked by side, and so will teams of two
(B3). So both are built on one change, made first and on its own:

- **`sideOf(state, owner)`** is the building block: the side an owner fights
  on, read from `sides` on `BattleState`. A battle without `sides` is a
  free-for-all, where every owner is a side of its own, so nothing changes
  for any battle fought so far. **`allied(state, a, b)`** is `sideOf(a) ===
  sideOf(b)`.
- **Every friend-or-foe question goes through them**, wherever it is asked:
  - in `rules.ts`: an enemy to attack, a watcher that reacts, sight under fog
    (`squadSight`, `viewOf`), a heal, a raise, a Purify, a shield wall, a
    path's way round (`routed`), the centre's holders, `squadsStanding`,
    `isBattleOver`, and `standings` and `standingPoints`, which rank sides;
  - in `RealmArenaLogic.ts`: `revealed`;
  - on the board: `useTurnDraft` (tapping a teammate mustn't aim an attack)
    and the turn sheet's warning that a fireball would catch your own;
  - in `battleRecord.ts`: friendly fire and knock-out credit, with the record
    keyed by `sideOf`, so the enemy is one column of its warbands added
    together;
  - and the test fixtures.

  "Whose character is this?" — the actor is the player's own, its turn
  begins — stays an owner check, since a player still moves only their own
  squad.
- **One builder makes the battle.** Today `battleOf` (the server), the board
  page and `recap.ts` each build a `BattleState`. All three go through one
  builder that adds `sides` from the persisted `seats` and `coop`, so the
  board's previews (`check`, the targets, the reach) see teammates as the
  server does. Nothing new is stored on a fighter, and replay rebuilds it.
- **The warbands are owners too**: `ai:0`, `ai:1`, …, which no Clerk id can
  ever be. The board already names and colours every owner through
  `nameFor` and `colourFor` (built once on the board page); those two learn
  the enemy, which is named by its faction's `enemyName` (§29.3) and wears
  one colour, whichever warband. The log is written on the server as
  `{{userId}}` tokens, which the shared resolver would show as an unknown
  player, so `narrate` and the history line go through one
  `ownerToken(owner)` in `RealmArenaLogic.ts` that writes the enemy's name as
  plain text.

**What PR 1 settled:**

- `sides` maps an owner to its side, and an owner it doesn't name is a side
  of its own. It's never stored or sent: `battleFrom` builds every
  `BattleState`, and no battle has sides until co-op (PR 4a) gives it some.
- The centre is held by a side, and scores a player at the end of their turn
  only when some of their own are in it: an ally's character alone holds it
  for the side but scores nobody that turn.
- The battle is over when at most one side has someone standing, read off the
  fighters, so a side whose owners aren't seated — the warbands — counts.
  `squadsStanding` stays per player: it says whose turns are left.
- `standings` ranks sides by their players' scores added together, then
  points' worth standing, then the side's latest seat; teammates rank
  together, by their own scores and then the later seat.
- A side's fog-of-war review tells an ally's doings in full, as its own.
- The battle record credits friendly fire and knock-outs by side, and still
  keeps a row per owner: the enemy as one column is PR 4b's.

### 29.7 How the computer plays

**Principles.** These are what make the enemy fair, testable and safe to
improve:

- **The same rules.** Every action the computer takes goes through `check`
  and `act`, exactly as a player's does. It can't do anything a player
  couldn't.
- **The same view.** It plans from `viewOf(battle, its side)`, never from the
  battle, so in fog it knows only what its warbands see (§27). The planner is
  handed only the view, so it can't cheat by mistake.
- **The same dice.** Its rolls are drawn and recorded as a player's are
  (§17.2). It never sees a roll before it acts.
- **One action at a time.** It picks the best action, takes it, sees the
  result — the shot hit, the overwatch downed the mover — and plans again
  from there, as a player does.
- **Deterministic.** Ties are broken by fighter id, then by square, and
  nothing in it draws a random number. The same view always gets the same
  action, which is what makes it testable.
- **Recorded, not replayed.** The actions it chose are stored on the End turn
  (`recordedEnemyActions`), beside the rolls they used. A replay applies the
  recorded actions and never runs the planner, so the computer can be
  improved at any time without a command version (`docs/command-versions.md`)
  and without changing a battle already fought. Being a `recorded…` field,
  it's stripped from every request (`stripRecordedRandomness`): no client can
  choose the enemy's moves.

**The tactics it reads with are the board's.** The board already asks the
questions the planner needs: which enemies an action can reach (`targetsOf`),
every target from a square with its chance (`attackOptions`), the battle with
a character stood somewhere else (`standingAt`), a shot's chance (`hitChance`),
the overwatch on a path with its odds and damage (`reactionPreviews`), and
where a fireball or a flask can land (`rangeSquares`). They're rules, not
presentation, but live in `ui.ts`, which also pulls in the art. They move to a
small `tactics.ts` beside `rules.ts`, which both the board and the planner
import, rather than the planner growing a second copy.

**What it can do next.** For each of the warband's standing characters, the
planner lists the single actions it could take now, and keeps only those
`check` allows:

- an attack or aimed shot at each enemy it can see, each ability and option
  at each target or square it could be aimed at (a fireball or a flask at
  each square in `rangeSquares` with an enemy in its 3×3), its item, and
  hunkering down;
- a move to one of the squares it can reach this turn (`reachOf`), the best
  dozen by the same score below (§29.7, *Thinking fast enough*);
- ending the warband's turn, which is always on the list. When nothing
  scores better than stopping, the turn ends.

There is no plan of a move and then an action. A move is worth what the
square lets the character do next (the **Threat** term below), so the planner
moves to a firing position and, planning again from there, fires.

**Judging an action.** The planner plays the action out on a copy of the
battle, with `act`, and scores the battle that results. One scoring function
judges every action, so there is no code per ability: a Cleric heals because
a healthier squad scores higher, and a Mage holds a fireball that would
catch its own side because the friendly damage costs more than the enemy
damage earns.

- **A shot is judged on its odds.** It is played out three times, with a roll
  that hits, one that grazes and one that misses, and the three results are
  weighed by the chance of each (`shotOdds`). A fireball, a flask and a
  strike roll nothing, so they're played out once.
- **A move is judged on the overwatch it walks into.** The move is played out
  with every reaction missing, and the expected damage of the reactions on
  its path (`reactionPreviews`) is taken off. In fog it can only count the
  watchers it can see; walking into an ambush it couldn't see is fair.

**The score of a battle**, from the computer's side, adds up:

| Term | Rewards |
|---|---|
| **Points** | Its side's score less the team's: a knock-out is worth what it scores, and the centre what it will score at the turn's end (§13.7). This is what makes it finish a wounded character rather than spread damage |
| **Strength** | Its characters' points' worth standing, scaled by the HP each has left, less the same for the team's. Healing, damage and friendly fire all show up here |
| **Exposure** | Less the damage each of its characters could take next turn: the best expected hit any enemy it can see could make on it from where that enemy stands (`attackOptions` from the enemy's side). This is what puts it in cover, keeps it from being flanked, and makes a Knight's shield wall worth raising |
| **Threat** | The damage each of its characters with AP left could deal from where it stands (`attackOptions`), and a little for the rest — so it moves to where it can shoot, an Archer holds a firing position, and a watcher stands where it covers the ground |
| **The objective** | Being nearer the centre, by walking distance, weighing more as the round it starts scoring (§13.7) comes nearer. Without an enemy in sight, this is what moves it |

Each term has one weight, the same for every character. A character's
weapon already tells the terms how it fights: a melee character's Threat is
next to an enemy, an Archer's is at range. If the playtest shows a character
playing out of character — a Cleric in the front line — a weight per
character is the first thing to add, not before.

**Thinking fast enough.** A warband's turn runs inside a player's request, so
it has to be quick. A 48×48 map gives a character a few hundred squares it
could reach:

- Before any move is played out, the reachable squares are ranked by the
  Exposure, Threat and Objective terms of the battle with the character
  standing there — the same score, without playing out the path's overwatch —
  and only the best dozen are played out.
- *Since built:* a turn keeps what it can from one plan to the next
  (`TurnMemo`). A square's Exposure and Threat for a character don't read
  where it stands now or the AP it has, so they're kept until it or an enemy
  is hurt, an enemy moves or comes into sight, a shield wall or smoke cloud
  goes up or down, or the ground is blasted; and Hold Out's walk from the
  hunted squares (§30.3) is kept until those squares change. A plan with the
  memo chooses exactly what one without it would, which its test holds.
- A turn is capped at four actions a character, more than its AP could ever
  pay for, so it always ends.
- *Target:* a warband's turn plans in under 250 ms on the Four-Gate Fort, and
  a test holds it there. If it doesn't, the dozen gets smaller first; a cache
  of line of sight and odds within a turn comes only if that isn't enough.
  (It came as the turn's memo, above, which keeps each square's Exposure and
  Threat rather than the sight and odds under them.)

**When something goes wrong**, the player's End turn still succeeds. An
action the planner chose that `check` refuses ends that warband's turn there,
and so does an error thrown while planning; both are logged. What it did
before is kept and recorded, so a replay still matches.

**Its squads.** Each warband is the enemy faction's ready-made squad for 80
points (`readyMade`, §29.3) — for the Realm, the one a timed-out muster
already gets — whose test holds it to the budget exactly. When the last player
musters, each warband joins the musters as `{ owner: "ai:k", picks }`, and
`RealmArenaMuster` puts every squad on the field as it does now, ids in seat
order with the warbands last. Each is placed in its own zone with
`readyMadeMuster`, as a timed-out player's squad is. Nothing about them is
stored beyond the fighters they become and the faction they came from, so
there's no table of warbands to keep and replay reads them as it reads any
squad. The enemy has no options, since nobody has earned it any (§23).

**Any faction, no code for any.** The planner reads characters only through
the rules — their weapons, abilities and AP — and every action through
`check` and `act`, so it plays a faction it has never seen. The only thing it
needs told is what a new kind of action is aimed at (§29.3), and a test makes
sure it is.

**What PR 3 settled:**

- `tactics.ts` holds the six helpers and `shotOf`, and `ACTION_AIMS`: each
  kind of action's aim — a path, nothing, one enemy, one ally, several
  enemies (a cleave: two, each where an attack could be aimed), or a square —
  with the range it's aimed in. A throw's range is the item's own. The
  board's taps and shading read it, as the planner does, and a test fails
  for an ability without one.
- The weights: a point scored is worth 1, and so is a point's worth of
  strength; Exposure and Threat are worth half, and a character with no
  attack's AP left keeps a quarter of its Threat; the Objective is 1 for each
  AP of walking to the centre, scaled by the round over the round the centre
  scores from, until it does.
- Exposure and Threat read each pair's odds once (`shotOdds`, a weapon's
  reach) rather than through `attackOptions`, which asks `check` about every
  character on the battlefield for each.
- The planner drops the view's fog: a view seen again is the same view, so it
  learns nothing, and every `check` it asks is spared working that out.
- A fireball or a throw is listed at each square in range with anyone in its
  3×3, its own side included, so a smoke pot can cover its own.
- Each of the dozen squares is played out the cheapest way there, and, where
  that sets off a reaction, the cheapest way that keeps out of every square a
  watcher it can see would react on (`watchedSquares`, and `reachOf`
  `avoiding` them). The cheapest way to a square never goes round an
  overwatch lane; this is how the planner does.
- The walk from each square to the centre is a search of the whole map, made
  once per battlefield and kept. It isn't the cache of sight and odds held in
  reserve above.
- The squares a watcher would react on are worked out once a plan, for every
  character of the warband, and the way round them only for a character whose
  cheapest way to one of its dozen squares crosses them.
- The dozen stays a dozen. Eight was quicker but missed the covered way: the
  squares beside a watcher outrank the rest before their overwatch is counted.
- A warband's turn on the Four-Gate Fort, against three squads on watch,
  plans in about 130–220 ms on average; the slowest turn reaches about
  250–450, and the Three-Gate Fort, three warbands against three squads, is
  quicker a warband. The test holds the average under 250 ms and every turn
  under 500, so one slow turn on a busy test runner doesn't fail it. If the
  slowest turns matter in a real request, the cache of sight and odds within
  a turn is next. (Since built, as the turn's memo, above, with the cheaper
  searches and copies of revision 1.46: whole battles against the planner
  run about three times quicker, every choice unchanged.)
- For the turn loop (PR 4a): the cap of four actions a character is its, but
  every action costs at least 1 AP, so the planner can't loop on its own. An
  action the battle refuses should end the warband's turn rather than be
  asked for again: the same view gets the same action. A deadline on the
  loop, ending the warband's turn once it's passed, is a cheap guard on the
  request's time.
- A round that isn't one is read as round 1, rather than scoring every battle
  NaN, which nothing beats.
- The puzzle of the flanked enemy sets it against one in half cover: on flat
  ground, the wall that gives full cover blocks the shot too.

### 29.8 Engine

- **`coop: { enemy }`** on the invitation and the state, absent in a
  free-for-all, beside `fog` (§27.1). On the invitation `enemy` is a faction
  id or `"random"`; on the battle it's always a faction id, Random drawn as
  the battle is created (§29.3). The setup route checks it — two or three
  players, and a faction that exists or Random — like everything a request
  sends. The players' seats are the
  map's first zones and the warbands' the rest, and `RealmArenaMuster` holds a
  co-op squad to 80 points, whatever the party's size.
- **`tactics.ts`**: the six helpers above, moved out of `ui.ts` (§29.7).
- **`ai.ts`**, beside `rules.ts`: `nextAction(view, owner, round): Action |
  undefined`. Pure and browser-safe, reading `rules.ts` and `tactics.ts`.
  Everything in §29.7 lives here.
- **Two shared steps** come out of the commands: `applyAction(data, owner,
  action, roll)` — check, clean, act, the mastery tally, what was blasted,
  the scores and the log line, everything `RealmArenaAct` does after its turn
  check apart from undo — and `applyEndTurn(data, owner, keepStill)`. The two
  commands call them, and so does the warband's turn, so a warband's fireball
  blasts cover and a player's overwatch on the enemy's turn still earns its
  mastery.
- **`handOff`** plays the next warband's turn between the player who ended and
  the next player: `startTurn`, then one action at a time — the next recorded
  action on a replay, `nextAction` otherwise; one loop either way — through
  `applyAction`, until there is none or the battle is over, then
  `applyEndTurn`. The warbands' rotation is stored (`coop.nextWarband`, on
  the state). The rounds count the players' seats, as now, so `battleRounds`
  needs no change.
- **`RealmArenaEndTurn`** records what the warband did on itself:
  `recordedEnemyActions`, and their rolls in `recordedRolls` after any of the
  player's own. Its outcome carries the enemy's turn as `{ action, events }`
  per action, so the recap can tell it action by action (§29.9).
- **`CheckGameOver`** ends a co-op battle with `endAsTeam` (§29.5).
- **What's told**: the enemy's turn is in the End turn's events, so every
  viewer gets it through `stepOutcomeToModel`, cut to what their side saw
  (§27.3). The End turn's own response to its sender goes through the same
  cut — the warband's moves out of the team's sight aren't in it. A random
  enemy's faction stays off the wire until it's seen (`coop.enemySeen`,
  §29.3).
- **No new command, no command version.** A co-op battle is a new kind of
  battle, and nothing about a free-for-all changes.

**What PR 4a settled:**

- `coop` on the invitation is `{ enemy }`, a faction id or `"random"`
  (`coopInviteOf`), and anything else is no co-op: the invitation's schema
  holds it to that, so a lobby's settings, which reach the model unread, are
  held to it too. The setup route refuses anything else sent for it, and a
  team that isn't two or three. A lobby can still fill to four; four play a
  free-for-all, and the setup log says so.
- On the battle it's `coop: { enemy, nextWarband }`, with Random drawn by
  `CreateGame` and stored as what it drew. The setup log names a faction the
  host picked and says only "an enemy drawn at random" for Random. A stored
  id no release knows reads as the Realm (`factionById`).
- `musterSize(players, coop)` is the party size a squad musters for — three
  in co-op — and the budget, the ready-made squads (the warbands', a
  timed-out player's, the muster screen's starting squad) and the response's
  `budget` all read it. (Since §30.5 they read `budgetOf` and
  `warbandBudgetOf`, which move it by the battle's size and the difficulty,
  and `readyMadeSquad`, keyed by points.)
- `battleFrom` takes the seats and whether it's co-op, and builds the two
  sides itself: every seat on one, and a warband for each seat (`ai:k`,
  `warbandOwner`) on the other. The response carries `coop` as a flag, and
  the board and the recap's tip hand it in with the seats. Whom the team
  fights stays off the wire until PR 4b, which keeps a random enemy hidden.
- The rotation steps past a warband with nobody standing as its turn would
  begin, and a warband's turn is played only if the battle isn't over
  already. It's capped at four actions a character it has standing, and
  stops planning after two seconds — between actions: one call to the
  planner isn't cut short. A refused action, or a planner or an action that
  throws, ends it, logged, and its End turn still runs, so neither a player's
  End turn nor the turn timer's can fail on it.
- `RealmArenaEndTurn` keeps `recordedEnemyActions` in co-op whatever
  happened — an empty list when no warband took an action, or no turn at
  all — so a replay never asks the planner, and the warband's rolls in
  `recordedRolls`, the player's End turn rolling none of its own. A replay
  takes the recorded actions and stops where they do.
- The outcome a command returns its own sender goes through the game type
  (`IGameType.outcomeFor`), which the command route asks: Realm Arena cuts it
  to what the sender's side saw while the fog lasts (`toldTo`, moved beside
  the game type for it). Every other game sends its outcome whole, as before.
  Rolls stay in the sender's, as before — the board's readout shows them,
  and a roll once made hides nothing — and a review step still drops them.
  The move is saved before this runs, so a game whose `outcomeFor` throws
  tells its sender nothing of what the move did, rather than failing it.
- A warband's lines in the log carry no `actorId`, so nobody can react to
  the computer or be pushed about it, and name it by its owner token until
  `ownerToken` (PR 4b). The End turn's outcome carries the enemy's events
  among its own; the per-action `{ action, events }` comes with the recap's
  rows in 4b. `CheckGameOver` still ranks the players alone until `endAsTeam`.
  Until those rows, the recap's End turn row scores only its own player's
  centre points, and folds the enemy's lines in with burning's; and its tip
  still measures a player against the best score of anyone else, a warband's
  or a teammate's. All three are 4b's.
- The whole-battle tests seed the rolls, and time each player's turn with the
  warband's after it: about 130 ms on average, under 300 at worst. The
  scripted team wins none of the 20.

**What PR 4b settled:**

- `endAsTeam(data, reason, line, detail?)` is in `src/utils/games/endAsTeam.ts`,
  pure, beside `finishGame`, so a game's rules can import it. `CheckGameOver`
  ends a co-op battle through it (`endInCoop`): the winning side is
  `standings` over the seats and then the warbands, so a battle level on
  points and points' worth standing goes to the enemy. The log's last two
  lines are the score — "The battle is over: the team 7 points (Alice 3, Bob
  4), the Renegades 5" — and "The team wins the battle" or "loses" above it;
  `endDetail` is "7 points to 5", or on level scores "5 points each, with
  more of the team left standing" or "…, and the enemy held the field".
- A random enemy is `coop.random`, written as the battle is created so a
  replay rebuilds it, and `coop.enemySeen`, set by the first command after
  which any seat's view (`viewOf`, which a side shares) holds a warband
  character: every action, a turn's start, an End turn and the last muster
  ask, a player's and a warband's alike. A faction the host picked has no
  `random`, so it's known from the start (`enemyKnown`). The response carries
  `enemy` once it's known, or once the battle is over; a review step is built
  from the state then, so one before the sighting doesn't.
- `ownerToken(owner, coop)` names a player by their token and a warband by
  its faction's `enemyName` in plain text, or "the enemy" while it's hidden.
  A warband's characters are "the Renegades' Archer", or "an enemy character"
  while it's hidden — and, in the enemy's own lines, "one of its characters"
  rather than "their Archer", since the kind is the faction. A line written
  before the sighting keeps what it said; the line of the command that saw
  the enemy is the last one not to name it.
- Nor does a hidden enemy's deed name its kind: an ability is a kind of
  character's, so the log says it "used an ability" — a fireball, a Demolish,
  a heal, a raise, a mark, a shield wall — and "moved" for a sneak. On the
  wire and in the recap the same deeds are told `unnamed`: a sneak as a move,
  and a shield wall, a mark, a heal or a raise not at all (`toldTo`'s
  `hidden`); the recap tells a blast as the hits it made. Accepted: a fireball
  or a flask that lands on the team is told, as it is in any fog, and the
  team sees it land; a shot is told apart from a strike; an effect on the
  team's own characters shows. The response names the enemy whenever a view
  holds one of its characters, whatever the flag says.
- The End turn's outcome carries its parts for the recap as `recap`: the
  enemy's turn — what burning did as it began, each `{ action, events }`, and
  what its End turn did, each part one line of the log (`enemyLineCount`),
  which is how the recap pairs them — and `started`, what happened as the next
  player's turn began. `outcomeFor` leaves it out of the sender's response,
  and a review reads `events` only.
- The recap's action row is one builder (`actionRow`), a player's or the
  enemy's. The enemy's rows are the warband's own (`actorId` its owner), keyed
  by the End turn's command, so the feed folds what each of its characters did
  into one row as it does a player's; a row when its End turn held the centre;
  and its burning a row of its own, apart from the next player's — which is
  nobody's, or as the sender's it would close their recap's window after the
  enemy's turn. The recap's dot is neutral for a row nobody seated did, and a
  reaction to one pushes nobody. The tip measures the team's score against
  the enemy's.
- A side's score is `sideScore`, its owners' added together: the ending and
  the tip read it.
- The battle record has a column a player and, in co-op, one more for the
  enemy, keyed `enemy` (`ENEMY_SIDE`): the warbands' rows, scores, centre
  points, HP and losses added together, and a record whose enemy score isn't
  the battle's is left out as a player's is. Burning lit and suffered in one
  step — an End turn now holds the enemy's turn and the next player's start —
  is credited to whoever lit it. The result's stat groups name it "The
  enemy", and PR 5 draws it on the charts and in the table (§29.9).
- The co-op tests check each ending and its detail, the enemy named in the
  log, a row per enemy action in the recap and one per character in the feed,
  and the record's enemy column; `hiddenHands.test.ts` steps a battle in fog a
  command at a time and holds the faction off every response, review step and
  line before the sighting.

### 29.9 Screens

- **Setup**: the mode as an `OptionChoiceSection`, as Banned Islet's and Fires
  Out's difficulty already are, and under it, for co-op, the enemy's faction
  or Random as another (§29.3), hidden while there's only one faction — shown
  since the Swarm made two (§31). On the
  screen that has fog of war's switch, with `GameSetupLayout` as now.
- **The board**: the enemy's characters in its own colour and named by its
  faction (`nameFor`, `colourFor`); the muster names the enemy the players
  will face, or "an unknown enemy" for a random one not yet seen (§29.3); the
  scoreboard shows the team's total
  against the enemy's, with each player's share under it.
- **The enemy's turn plays out** on the board as any other turn does (§26),
  and the recap gives it a row per action. `recap.ts` builds a player's
  action row from a `RealmArenaAct`'s line and events; that builder comes out
  into one function, and the End turn's row maps each of the enemy's
  `{ action, events }` through it, rather than growing a second.
- **The result**: `finishedGameCopy`'s wording for the whole team, the points
  race with the team and the enemy as two lines, and the battle record as
  now, the enemy as one column.
- **The guide** gains a short section on co-op; the tutorial is unchanged,
  since a co-op turn is a turn.

**What PR 5 settled:**

- The setup screen's *Mode* is free-for-all or co-op, and co-op holds the
  party to two or three while it's chosen — the invite list, the open seats
  and the party-size line read it — so a lobby can no longer fill to four for
  a co-op battle. Under it, *Enemy* lists every faction and Random, and hides
  itself while there's one; the host fights the Realm's Renegades until then.
  `COOP_PLAYERS`, `fitsCoop` and `RANDOM_ENEMY` move to `characters.ts`, so
  the screen reads them without the server's models.
- The enemy is named by `enemyNameOf` beside `FACTIONS` — its `enemyName`, or
  "the enemy" while it's unknown — which `ownerToken` and the board both use.
  The board names a warband's characters by it ("the Renegades' Archer"),
  numbered across the warbands as one squad ("Archer 2"), and draws them, and
  the warbands' deployment zones, in one colour (`ENEMY_COLOUR`): the board
  is handed every owner in the map's deployment order, warbands
  (`warbandsFor`) after the players.
- The scoreboard is two pills: the team's total, each player's share under
  it and each one's squad or muster when it's opened, and the enemy's, with
  how many of it stand or are in sight. The centre names the side that holds
  it. During the muster a line names whom the team will face, or says the
  enemy was drawn at random and is still unknown.
- A finished co-op battle's subtitle and banner are the team's, in
  `finishedGameCopy`'s words with the score as its detail.
- On the result, the points race and the squads' health are the team's line
  against the enemy's (`TEAM_COLOUR`, `ENEMY_COLOUR`), each character downed
  marked on its side's line. The damage by character stacks the enemy's
  share over the players', and the battle record has the enemy's column after
  theirs: a bar chart and a table can now name a series after the players
  (`extraSeries`), which a free-for-all's never sends. The enemy is "The
  enemy" there: the result keeps no faction.
- The guide's sixth section is co-op. The one What's new line is left out of
  this PR, at the owner's request.

### 29.10 PRs

| PR | What | Review |
|---|---|---|
| 1 | **Sides.** `sideOf`, `allied`, the one battle builder, and every friend-or-foe question in §29.6 read by side, on the server and the board. A free-for-all is unchanged, which the existing tests show; new tests put two owners on one side. The groundwork for teams (B3) too | `caveman`, `croupier` (sight) |
| 2 | **The co-op battlefields** (§29.2): the Twin-Gate and Three-Gate Forts, their tests, and `mapFor`. **Factions as data** (§29.3): `FACTIONS` with the Realm in it, a roster and an `enemyName` each, and the muster checked against its faction | `caveman`, `rulebook` |
| 3 | **The planner.** `tactics.ts` moved out of `ui.ts`, with each kind of action's aim (§29.3), `ai.ts`, the puzzles and the never-cheats test (§29.11). Not wired to anything | `caveman` |
| 4a | **The enemy's turn.** `coop` from setup to state, Random drawn, `applyAction` and `applyEndTurn` out of the commands, the warbands mustered, their turn in `handOff`, recorded and replayed, and the whole-battle tests (§29.11). The setup route takes `coop`; the screen doesn't offer it yet | `caveman`, `locksmith`, `gremlin`, `croupier` |
| 4b | **The end of it.** `endAsTeam`, the co-op ending, the record by side, `ownerToken`, the recap's rows for the enemy's turn, and a random enemy kept hidden until it's seen (§29.3) | `caveman`, `croupier` |
| 5 | **The screens** (§29.9), the enemy's faction picker among them, the guide, and the one What's new line | `caveman`, `rulebook` |
| Later | Built in §30 (B9): Banned Islet, Outbreak and Fires Out moved onto `endAsTeam`; remembering where an enemy was last seen in fog; *Hold Out*, a wave-survival mission; achievements; difficulty; solo against the computer | |

### 29.11 Testing the computer

- **Puzzles** (PR 3). Small battles set up in a test, each with one right
  answer: it shoots the flanked enemy rather than the one in full cover; it
  finishes a wounded character; it heals a hurt ally; it moves into cover
  rather than stopping in the open; it goes round an overwatch lane when a
  covered way exists; it doesn't fireball a 3×3 with its own in it when
  another target will do; it heads for the centre before it scores.
- **It never cheats** (PR 3). Moving an enemy it can't see anywhere else on
  the map never changes its choice.
- **It never breaks** (PR 4a). Whole battles on every map, against every
  faction in `FACTIONS`, with seeded rolls,
  the team played by the test fixtures' scripted player
  (`playScriptedBattle`), run to the end without a refused action, each
  warband's turn inside the time budget.
- **It plays well** (PR 4a). Against that scripted team it wins nearly every
  battle (19 of 20, seeded). That's a floor that catches a change that makes
  it worse, not a measure of how good it is; the playtest is that.
- **Replay holds** (PR 4a). A recorded co-op battle replays to the same end
  with the planner swapped for one that throws.
- **A random enemy stays hidden** (PR 4b). In fog, every response, review
  step and log line before the first sighting is free of the faction and of
  any of its characters' names, and the one after it carries them; without
  fog, the faction is there from the moment the squads take the field. One of
  `hiddenHands.test.ts`'s checks, as every hidden field is.

### 29.12 Open questions

- **Is Hold the Centre the right mission for co-op?** It needs nothing new,
  which is why it's proposed. A mission made for co-op — survive the waves,
  carry the relic out — could follow with the second mission (B7). *Survive
  the waves is planned, as Hold Out (§30.3).*
- **Difficulty.** One level to start. If the playtest wants more, the simplest
  lever is the warbands' size — the ready-made squad, one character more or
  one fewer — chosen with the same `OptionChoiceSection`. *Built (§30.5),
  with the existing ready-made squads as the three sizes.*
- **Does the enemy want a Mage and a Cleric?** The ready-made squad for 80
  points has neither, so the enemy wouldn't fireball or heal.
  If the playtest misses them, the answer is a second ready-made list for the
  enemy, held to the budget by the same test, not a new mechanism.
- **One keep on a wide front?** The Three-Gate Fort's ends are a long walk
  from the keep. If the playtest finds the flank players idle, the fix is a
  mission with a point to hold in each lane — the second mission (B7) — not a
  narrower map.
- **How big is big enough?** The sizes in §29.2 keep the squares a character
  has near the free-for-all's. If co-op wants more room to manoeuvre, the maps
  get wider, not deeper, and the phone's overview is what pays.
- **Teams on the same plan.** With sides built, teams of two (B3) is the
  free-for-all with two sides of two, and could follow co-op closely.

### 29.13 What the review changed

The caveman reviewed the first draft of this plan. What changed:

- The warband's turn shares `applyAction` and `applyEndTurn` with the
  commands rather than calling `act` bare, which would have dropped the
  mastery tally, blasted cover and the log.
- The planner reads the board's tactics helpers, moved to `tactics.ts`,
  rather than its own copies.
- Sides reach every friend-or-foe question — the board, the battle record and
  `revealed` included — through `sideOf`, which can group, with one battle
  builder for the server, the board and the recap.
- The co-op ending is a shared `endAsTeam`, and its wording
  `finishedGameCopy`'s.
- The enemy's names go through the existing `nameFor` and a server-side
  `ownerToken`.
- The warbands are the ready-made squads, mustered as any squad is, with no
  table of their own; difficulty waits for the playtest.
- The planner lost its move-then-action plans, its table of temperaments, its
  second scoring function for squares and its cache, each until a test or the
  playtest shows the need.
- *After the review:* co-op gets battlefields of its own (§29.2). The first
  draft put the enemy in the free-for-all maps' last zone, which on the
  Four-Gate Fort would have crammed three warbands into one corner against a
  team coming from three.
- *After the review:* the enemy is a faction the host picks, or Random
  (§29.3), so that a second faction can be fought without touching the
  computer. A random enemy stays hidden until the team sees one of its
  characters.
- The tests use the scripted player the fixtures already have, and the
  whole-battle tests move to PR 4a, which has the turn loop they need. PR 4
  is split, and the caveman reviews it.

## 30. After co-op: the next six PRs (B9)

*Built.* Co-op against the computer (§29) is built. What came next is the
work §29.10 left for later, plus a second mission for co-op, broken into PRs
in the order they're built. Each one is a branch of its own, passes the gates
(`build`, `tsc`, `lint`, `test`), and gets the crew listed beside it (§30.7).
Every player-visible PR adds its one What's new line. PR 1 adds none: the
only change it makes that a player could see is to Fires Out, which nobody
has played yet (§30.1).

| PR | What | Depends on |
|---|---|---|
| 1 | Banned Islet, Outbreak and Fires Out end through `endAsTeam` (§30.1) | — |
| 2 | Remembering where an enemy was last seen, in fog (§30.2) | — |
| 3 | *Hold Out*, a wave-survival mission for co-op (§30.3) | 2 |
| 4 | Realm Arena's first achievements, co-op's among them (§30.4) | 3 |
| 5 | Difficulty and battle size (§30.5) | 3, 4 |
| 6 | Solo against the computer (§30.6) | 5 |

PR 1 touches no Realm Arena code and can be built alongside any of the
others. The rest go in order: the waves hunt the team by where it was last
seen (PR 2), the achievements reward holding out (PR 3), difficulty adds one
achievement and sizes the waves (PRs 3–4) — battle size comes with it — and
solo is offered with every choice the others add already on its setup
screen.

### 30.1 PR 1: Banned Islet, Outbreak and Fires Out on the shared ending

Co-op's ending was written once, as `endAsTeam` (`src/utils/games/endAsTeam.ts`,
§29.5), so that the co-ops that came before it could move onto it. Banned
Islet, Outbreak and Fires Out each still write `complete`, `winner`,
`endReason`, `currentTurn` and the closing history line by hand — Banned
Islet and Outbreak `endDetail` too, in two functions each that are line for
line the same as each other's.

- **The wins.** Banned Islet's `endInEscape` and Outbreak's win in
  `CheckGameOver` become `endAsTeam(data, "teamwin", line)`, with the line
  each writes today.
- **Fires Out** ends in one place, its `CheckGameOver`, in a win and two
  losses. Each becomes `endAsTeam` with the line it writes today. The two
  losses also gain a detail, as Banned Islet's and Outbreak's have: "the
  building collapsed" or "too many victims were lost". Today a Fires Out loss
  doesn't say which it was, so the banner, the result page and the push all
  read the same for both. `FiresOutModels` already forwards `endDetail`, so
  the detail reaches all three with nothing more on the wire.
- **The losses.** Each game's `endInTeamLoss(data, reason, detail = reason)`
  becomes `endAsTeam(data, "teamloss", \`The team loses — ${reason}.\`, detail)`.
  The `reason`/`detail` split stays exactly as it is — `endDetail` must never
  carry a `{{userId}}` token — and so do the comments that say why. Whether
  the two one-line wrappers survive is the caveman's call; the shared part is
  `endAsTeam`.
- **The screens.** Banned Islet's and Outbreak's boards word a defeat by hand ("💀 The team lost",
  "The team lost — {detail}."). Those read `finishedGameCopy`
  (`src/utils/ui/players.ts`), as Realm Arena's board does, so the subtitle,
  the banner, the home page and the result page can't word one ending four
  ways. Each game keeps its own win line ("Four relics off a sinking island,
  and everyone aboard!") and the fallback for a game that ended before a
  reason was recorded. Fires Out's banner does the same: its loss reads
  `finishedGameCopy` with the detail, falling back to "The crew couldn't make
  it out in time." for a game that ended before one was recorded, and its win
  keeps "The crew rescued everyone!".
- **Nothing changes for a Banned Islet or Outbreak player.** Every log line,
  `endDetail` and banner reads as it did, so stored games and replays are
  untouched and no command version is needed. Those games' existing ending
  tests are the proof, and pass unchanged. Fires Out's log lines are
  unchanged too, so its replays are as well. Its new detail is a test per
  loss, holding each to its clause and to no `{{userId}}` token.
- **No What's new line.** Fires Out's loss detail and banner are the only
  changes a player could see, and nobody has played Fires Out yet, so there's
  nobody to tell.
- **`endAsTeam`'s comment** stops naming the three as writing theirs by
  hand: every co-op ends through it.

### 30.2 PR 2: where an enemy was last seen

In fog (§27), an enemy that steps out of sight vanishes from the board as if
it had never been there. A player has to remember where the Archer ducked
behind the wall; the computer can't remember at all, so a warband that loses
sight of a character forgets it existed and walks out in front of it. Both
get a memory.

**The rules.**

- **A side remembers each enemy it has seen**: the square it was last seen
  on, its kind, its owner, whether it was standing or down, and the round.
  Nothing else — not its HP, its AP or its effects, which will have changed.
- **Seen again, the memory moves with it.** While an enemy is in sight its
  memory is simply where it stands.
- **Looked at and gone, the memory is dropped.** When the square an enemy was
  last seen on comes into sight and it isn't there, the side knows it has
  moved, and stops remembering it. So a remembered enemy always means "last
  seen here, and nobody has looked since".
- **A side, not a player.** In co-op the team remembers together, as it sees
  together (§29.1); in a free-for-all every player remembers for themselves.
- **Only in fog.** Without fog there's nothing to remember. The fog lifts at
  the end of the battle (§27.1), and the memories with it.
- **No rule reads it.** `check`, `act` and every friend-or-foe question go on
  reading the view (`viewOf`). A memory is a note, not a sighting: aiming at a
  remembered enemy is still aiming at a square the player can't see.

**What the player sees.** A remembered enemy is drawn where it was last seen,
faded and ringed as a sealed squad is during the muster (§17.3 PR 5), with
"last seen in round N" on its unit box. Tapping it selects nothing it could
act on. The centre's readout and the scoreboard's "in sight" counts are
unchanged: a memory isn't a sighting.

**What the computer does with it.** The planner is handed its side's
memories beside its view (`nextAction(view, owner, round, memory)`). In Hold
the Centre, an enemy it saw this round or last counts towards Exposure (§29.7)
as though it still stood there, at half weight — so a warband no longer walks
into the open in front of an Archer that has just stepped back behind a wall.
It still plans from the view: a memory is only what its own side saw.
Hold Out (PR 3) uses the memories to hunt.

**Engine.**

- **Stored on the state**, `lastSeen`, keyed by side (`sideOf`) and then
  fighter id, in a `Schema.Types.Mixed` field like the squads. It's noted by
  the same function that notes a random enemy's first sighting
  (`noteSighting`, which becomes `noteSightings`), already run after every
  command that can change what anyone sees: each action, a turn's start, an
  End turn, a warband's turn and the last muster. A dropped player's squad
  leaves the memories as it leaves the battlefield.
- **Undo needs nothing.** An action that shows a new enemy already can't be
  undone (§27.1), and an undo restores the whole state, memories included.
- **Replay needs nothing.** The memories are rebuilt by the commands, as
  every other part of the state is. The planner reads them, but a replay
  never runs the planner (§29.7), so no command version is needed, and a
  battle fought before this PR gains its memories when it's next replayed.
- **On the wire**: the response carries the viewer's side's memories of the
  enemies it can't now see (`lastSeen`), and nothing of anyone else's. A
  warband's memories never leave the server: they'd tell a player whether
  they had been seen. A review step carries the memories as they were at that
  step, built from the state there.

**Tests.** A memory moves, is dropped when its square is seen empty, and is
shared by a co-op team but not by free-for-all players; an undone move leaves
it as it was. A new puzzle (§29.11): the warband won't step into the open in
front of an Archer it saw last round behind the wall. The never-cheats test
grows a second half: moving an enemy the warband neither sees nor remembers
changes nothing. `hiddenHands.test.ts` holds every other side's memories —
the warbands' above all — off every response and review step.

### 30.3 PR 3: *Hold Out*, surviving the waves

§29.12 asked whether Hold the Centre is the right mission for co-op, and named
surviving the waves as the first co-op mission of its own. This is it.

**The rules.**

- **The host picks the mission** in co-op: *Hold the Centre*, as now, or
  *Hold Out*. It's stored with the battle (`coop.mission`), absent for Hold
  the Centre, so every battle fought so far is one.
- **Same battlefields.** Hold Out is fought on the co-op forts (§29.2), the
  team along one edge and the warbands opposite, mustered as now. No new map
  and no new art. (Since joined by a battlefield of its own, the Sacked Fort,
  §30.9.)
- **The enemy comes in waves.** The warbands take the field as now: that's
  the first wave. At the start of every third round (4, 7, 10, 13 …) the next
  wave arrives: each warband is brought back up to strength, a fresh
  character standing in its deployment zone for each of its own that is down.
  So the enemy never outnumbers its starting strength, which keeps the board
  and the planner's time (§29.7) where they are; every knock-out still buys
  the team time until the next wave. (Since grown: each wave brings a
  warband one character more than the last, §30.10.)
- **Where a wave stands.** Each fresh character is placed as its warband's
  ready-made squad is (`readyMadeMuster`), on the first free standable square
  of the zone; one with no free square waits for the next wave. A team
  character stood in an enemy zone blocks those squares, which is a tactic,
  not a bug.
- **A wave is told.** The log says "A fresh wave of the Renegades arrives"
  (or "of the enemy", while a random enemy is unseen, §29.3), to everyone,
  as a turn ending is (§27.2). In fog the fresh characters are seen only if
  they're in sight. Their fighter ids continue from the last, which hints at the wave's
  size as ids always have (§27.2), and is accepted as it is there.
- **Winning and losing.** The team wins if anyone of it is standing when the
  last round ends, and loses the moment nobody is. A warband wiped out
  between waves doesn't end the battle: its turn is stepped past until the
  next wave refills it (§29.4's rotation already does). The enemy having
  nobody standing ends it only after the last wave. The ending is
  `endAsTeam`'s, with "held out for all 13 rounds" or "overrun in round 9" as
  its detail.
- **The score still counts.** The keep and knock-outs score as in any battle
  (§13.7), so the result's points race, the team's score and each player's
  share all still mean something, and the keep, walled and central, is where
  a team means to hold out anyway. The score doesn't decide the result.
- **How long.** As long as Hold the Centre for the same team (§29.1): 15
  rounds for two, 13 for three. The every-third-round spacing and the length
  are the first numbers the playtest tunes.

**The computer hunts.** In Hold the Centre a warband's Objective is the keep
(§29.7). In Hold Out it's the team: the walk to the nearest team character it
can see, or failing that the nearest it remembers (PR 2), and only with
neither the keep, where the team is likeliest to be. A wave arriving out of
sight of everyone still finds the team. The walk is a search from the team's
squares made once a plan, rather than the keep's search made once a
battlefield (§29.7, *What PR 3 settled*), and the time-budget test holds it.

**Engine.**

- `coop.mission` from the invitation to the state, checked by the setup route
  like everything a request sends, named in the setup log, and on the wire
  for every viewer (`mission`).
- The wave lands in `handOff` as a round begins (where `roundsPlayed`
  goes up), before the next seat's `startTurn`, so the fresh characters stand
  with full AP for the warband's next turn. A small pure helper
  (`waveOf(state, warband)`) says who arrives and where, beside the warbands'
  muster in `RealmArenaLogic.ts`.
- **A wave is a rule, not the planner's.** It draws nothing, so nothing is
  recorded: a replay brings the same wave at the same moment. That also means
  changing when or how a wave arrives changes battles already fought, so it
  takes a command version (`docs/command-versions.md`), unlike improving the
  planner.
- `isBattleOver` learns the mission: in Hold Out, the enemy with nobody
  standing ends the battle only once no wave is left to come.
- Mastery (§23.1), the battle record (§28) and the recap (§29.9) need
  nothing: fresh characters are fighters like any other, their knock-outs
  score and earn as any do, and a wave is a log line the recap already tells.
- **Screens.** The setup gains *Mission*, an `OptionChoiceSection` under co-op,
  as the enemy's is. The board's scoreboard shows the round the next wave
  comes in. The guide's co-op section gains a paragraph.

**Tests.** A wave refills each warband to its squad and no further (since grown, §30.10), stands
where `readyMadeMuster` would, waits with no room, and is told; a battle with
the enemy wiped out goes on to the next wave and ends after the last; the
endings and their details; whole battles of Hold Out on both co-op forts
never break, and replay to the same end with the planner swapped for one that
throws (§29.11). The scripted team (`playScriptedBattle`) is expected to lose
most of them, which is a floor, as in §29.11, not a measure.

### 30.4 PR 4: achievements

Realm Arena launched without achievements (§17.3 PR 10). This PR gives it its
first, written to `docs/achievements.md` §11's checklist: an
`achievements.ts` beside `meta.ts`, typed
`GameAchievement<IRealmArenaSpecificGameStateResponse>[]`, one line in
`GAME_ACHIEVEMENTS`, browser-safe, and its null view pinned in
`hiddenHands.test.ts` in the same commit.

| Id | Title | Earned by | Kind |
|---|---|---|---|
| `realmarena.recruit` | Recruit | Play 5 battles | career |
| `realmarena.warlord` | Warlord | Win 5 battles | career |
| `realmarena.shoulder-to-shoulder` | Shoulder to Shoulder | Win a battle against the computer | match, `end` |
| `realmarena.none-left-behind` | None Left Behind | Win a battle against the computer with every one of the team's characters standing at the end | match, `end` |
| `realmarena.last-stand` | Last Stand | Win a battle of Hold Out | match, `end` |
| `realmarena.lone-wolf` | Lone Wolf | Win a battle of Hold Out in Solo | match, `end` |
| `realmarena.hold-the-keep` | Hold the Keep | Win a battle of Hold Out on the Sacked Fort | match, `end` |
| `realmarena.broken-tide` | Broken Tide | Win a battle of Hold Out by downing the whole last wave before the last round is over | match, `end` |
| `realmarena.unbroken` | Unbroken | Win a battle of Hold Out with every one of the team's characters standing at the end | match, `end` |

The titles may change; the ids never do (§11). PR 5 adds *Against the Odds*
(§30.5). The four Hold Out rungs after Last Stand came later, so the mission
has more than one thing to chase, and take Realm Arena past §11's three to six
deliberately: a game with a free-for-all, two co-op missions and Solo has more
distinct ways of playing to reward than most. They read only what is already on the wire once the fog lifts:
Solo is a team whose fighters all belong to one player (the response carries
no solo flag), the Sacked Fort is a `map` id starting `sackedFort`, and the
last wave was beaten early when the warbands fielded someone and none of them
is standing — a Hold Out battle only ends that way once the last wave has
landed (`holdOutEnding`).

- **Every match check is an `end` check.** In fog, the null viewer sees
  nobody on the battlefield while the battle is fought (§27.3), so a
  `turnEnd` check could only read the scores. Once the battle is over the fog
  lifts for every viewer, so an `end` check reads every fighter, the mode and
  the mission.
- **What they read, all on the wire for every viewer:** `coop`, `mission`
  (on the wire since PR 3, whose scoreboard reads it), `fighters` and the
  seat's `outcome`. A co-op team's win is a win for every seat, which
  `outcomeFor` already says (docs/achievements.md §3.2), so "win" needs
  nothing co-op-specific.
- **Free-for-all** gets the two career rungs. Match achievements that reward a
  way of fighting a free-for-all are left for a later PR.
- **The null view's pin** is its exact key set, including `lastSeen` empty
  and the enemy absent until the battle is over, and it's the first for
  Realm Arena: the random enemy's test (§29.11) holds the faction off every
  viewer's response, the null viewer's included, but doesn't pin its keys.

### 30.5 PR 5: difficulty and battle size

*As planned, before battle size joined it; what was built is under* What PR
5 settled *below, which wins where the two differ.* §29.12 named the lever:
the warbands' size. The existing ready-made squads already come in three
sizes (§13.6), so difficulty needs no new squad:

| Difficulty | Each warband | Points |
|---|---|---:|
| Easy | the four-player ready-made squad | 70 |
| Normal | the three-player ready-made squad, as now | 80 |
| Hard | the duel's ready-made squad, five characters with a Cleric | 100 |

- **The players still muster 80 points**, whatever the difficulty. The
  muster's line says what the enemy fields: "The Renegades field 100 points a
  warband."
- **It applies to both missions.** In Hold Out each wave refills a warband to
  its difficulty's squad (and, since §30.10, grows it).
- **The planner plays its best at every difficulty.** A computer told to
  play badly reads as a broken one; a smaller enemy is fair and legible.
  *Considered and set aside:* switching off Exposure, or the move ranking's
  dozen, on Easy.
- **Engine.** `coop.difficulty`, absent for Normal, so every battle so far is
  Normal; checked by the setup route and named in the setup log; the
  warbands' muster reads `factionById(enemy).readyMade[sizeFor(difficulty)]`.
  It's on the wire for every viewer (`difficulty`), since the host picked it
  in the open. A replay reads it from the state. No command version: nothing
  about a Normal battle changes.
- **Screens.** *Difficulty*, an `OptionChoiceSection` under co-op, as Banned
  Islet's and Fires Out's are; the setup line and the result name it.
- **One achievement**: `realmarena.against-the-odds`, *Against the Odds*, win
  a battle against the computer on Hard. `difficulty` joins the null view's
  pin (and, as built, `size`).
- **Tests.** Each difficulty musters its squad for every warband and every
  wave; an old battle with no `difficulty` is Normal; the setup route refuses
  anything else; the whole-battle tests run at all three.

**What PR 5 settled:**

- **Battle size joins difficulty**, for every mode: *Small*, *Normal* (every
  battle so far) or *Large*, an `OptionChoiceSection` on the setup screen,
  stored as `size`, absent for Normal, checked by the setup route (anything
  but `small` or `large` is refused), named in the setup log ("a large
  battle, so each player musters 100 points' worth") and on the wire for
  every viewer. It moves every squad's budget, the players' and the
  warbands' alike.
- **Budgets are a ladder** (`BUDGETS`): 50, 60 … 120 points, a rung apart,
  and every faction has a ready-made squad for each rung, keyed by points
  rather than party size. A battle's size moves every squad two rungs from
  the party's normal budget (§13.6); a difficulty then moves a warband from
  the players' — Easy one rung down, Hard two up — so Normal-sized battles
  give the 70, 80 and 100 above.

  | Size | Duel | Three | Four | Co-op team | Easy | Normal | Hard |
  |---|---:|---:|---:|---:|---:|---:|---:|
  | Small | 80 | 60 | 50 | 60 | 50 | 60 | 80 |
  | Normal | 100 | 80 | 70 | 80 | 70 | 80 | 100 |
  | Large | 120 | 100 | 90 | 100 | 90 | 100 | 120 |

- **The new squads** are 50 (two Men-at-arms and an Archer), 60 (a Knight, a
  Man-at-arms and an Archer), 90 (a Knight, a Man-at-arms, an Archer and a
  Mage), 110 (a Knight, a Man-at-arms, an Archer, a Scout and a Mage) and 120
  (a Knight, an Archer, a Scout, a Mage and a Cleric). The 70-, 80- and
  100-point squads are the ones every battle before mustered, unchanged, so a
  replay musters them again; a test holds them.
- **No squad has more than five characters.** A six-character 120 made a
  large battle on Hard's slowest warband turns take over a second; at five,
  the slowest is about three-quarters of one and the average across every
  size and difficulty stays under 250 ms. The whole-battle test holds every
  turn under 1.5 s. If a large battle's turns matter in a real request, the
  cache of sight and odds (§29.7) is next. (Since built, as the turn's memo,
  §29.7, revision 1.46.)
- **The ending names the difficulty** unless it's Normal ("12 points to 8, on
  Hard"), so the banner, the result and the push all say it.
- `buildInitialRealmArenaState` takes what the host chose as one settings
  object (`RealmArenaSettings`), and a replay reads it back off the state
  (`settingsOf`).

### 30.6 PR 6: solo against the computer

One player against one warband, on the Ruined Fort (§29.2 already maps a team
of one there).

- **The setup screen's *Mode* gains *Solo*.** Solo hides the invite list,
  the party size and the turn timer, and keeps fog, the enemy, the mission and
  the difficulty. It starts the battle with `useStartSoloGame`, as Solitaire
  and Fires Out's solitaire mode do: an invitation with nobody in it, accepted
  at once (`docs/new-game.md`, solo games). `meta.ts`'s players become 1–4,
  so the library reads "1–4 players", and the setup route still holds a
  free-for-all to two or more.
- **Engine: co-op with a team of one.** `COOP_PLAYERS.min` becomes 1, so the
  battle is a co-op battle in every rule: one side, one warband opposite,
  `endAsTeam`'s ending. The battle lasts a duel's 15 rounds, a round being one
  player's turn and one warband's as a duel's is two players'
  (`battleRounds` reads two for one).
- **The turn never leaves the player.** With one seat, the muster and the
  End turn hand the turn to the seat that ended it. As Fires Out found
  (fires-out-gdd.md §17.6 step 12), that's no hand-off: they return
  `turnOver` only with more than one seat, and `timerRestarts` always, so
  nobody is pushed "your move" a moment after their own, and turn-end
  achievements are still judged. The undo stack is cleared at the End turn
  itself rather than in `CheckEndTurn`, which only runs on `turnOver`: an
  undo across the enemy's turn would undo the enemy's turn.
- **The timer is unlimited** (`UNLIMITED_TURN_TIMER`), as Solitaire's: there's
  nobody to time out against, so a solo battle is never swept, warned or
  dropped, and simply waits.
- **Mastery is earned as in any battle** (§29.5). A player could farm it
  against the computer; it buys sidegrades only (§23), so that's accepted for
  now and is the first thing to revisit if the playtest finds it.
- **What needs checking rather than changing:** the recap (nothing happens
  while a solo player is away, and the enemy's turn plays out on the board as
  the End turn's outcome), the result page and stats with one seat, and that
  `countsAsPlayed` treats an abandoned solo battle as it does any solo game
  (docs/achievements.md §8).
- **Tests.** A solo battle from setup to its end: the muster and every End
  turn keep the turn with the player without a push, the warband plays after
  every turn, the timer is unlimited, and the whole-battle and replay tests
  run on the Ruined Fort.

**What PR 6 settled:**

- **`meta.players` reads "1–4 players"**, and the library shows Realm Arena
  under *Solo*, but `minPlayers` stays 2: it's the invite flow's bound, which
  the setup and lobby routes read, and solo never goes through it. Fires Out
  draws the same line, and the guard test that holds `players` to the bounds
  names both.
- **The request says it's solo** (`solo: true`), as Fires Out's names a crew
  size, rather than solo being read off an empty invite list: a host who
  invited only themselves is refused as the party of one they are. A solo
  request must carry `coop`, invite nobody and name no battlefield — the
  Sacked Fort is built for two or three — and is stored with the unlimited
  timer whatever it sent. Nobody is pushed an invitation.
- **`turnEnded`** is the muster's and the End turn's outcome: `turnOver`
  with more than one seat, `timerRestarts` always. A free-for-all or a co-op
  team's battle is unchanged by the second: the command route already
  restarts the clock on `turnOver`.
- **The End turn clears the undo stack itself**, in every battle, as well as
  `CheckEndTurn` on a hand-off. The test shows why: without it, an undo after
  an undone move restores the battle from before the warband's turn.
- **The setup screen** has *Solo* as the third mode, without the invite list,
  the open seats, the turn timer, the party hint or the battlefield; *Start
  the battle* deals it at once. The board says the player fights alone, and a
  solo battle's rematch link comes back to *Solo* (`RA_SOLO_PARAM`).
- **Nothing else needed changing.** The recap, the result, the battle record
  and the stats read a battle with one seat as they are: the whole-battle
  test fights Hold the Centre and Hold Out (in fog) to their ends, replays
  them without the planner, and reads their results.

### 30.7 Review

| PR | Review |
|---|---|
| 1 | `caveman`, `rulebook` |
| 2 | `caveman`, `croupier` (the memories on the wire), `gremlin` |
| 3 | `caveman`, `locksmith` (the setup route's new field), `gremlin`, `croupier` (a wave in fog) |
| 4 | `rulebook`, `croupier` (the null view) |
| 5 | `caveman`, `locksmith`, `rulebook` |
| 6 | `caveman`, `locksmith`, `gremlin`, `rulebook` |

### 30.8 Open questions

- ~~**Does Hold Out want its own battlefield?**~~ Yes: the Sacked Fort
  (§30.9), picked by the host, with the team in the middle and the enemy
  round the edges. The gate forts stay a choice.
- ~~**Do the waves want to grow?**~~ Yes: every wave brings a warband one
  character more than the last (§30.10).
- **Is the memory too generous?** A remembered enemy is kept until its square
  is seen empty, however long ago it was seen. If old ghosts clutter the
  board, they fade after a few rounds.
- **Should difficulty reach free-for-all?** It's a co-op choice, since only
  co-op has a computer to tune.

### 30.9 The Sacked Fort: a battlefield for Hold Out

§30.8 asked whether Hold Out wants its own battlefield. On the gate forts the
team walks to the keep and the enemy comes at it from one side, which turns
the mission into a line to hold. The Sacked Fort turns it round: **the team
starts in the middle, and the enemy closes in from every edge**, where its
waves land too.

**The host picks it.** Under Hold Out, the setup gains *Battlefield*: the
Sacked Fort (the default there) or the gate fort for the team's size, as
before. It's stored with the battle as `coop.map: "sackedFort"`, absent for
the gate forts, so every battle fought so far is one, and `mapFor(players,
coop, map)` turns it into the map for the team's size. The setup route, and
the invitation's setter, take it only with Hold Out: on Hold the Centre a team
mustered on the keep would hold the centre from round one.

**The map.** 54 squares square, unchanged by a quarter turn, so no edge has the
easier approach. It's the Ruined Fort's walls (§15) after the enemy has already
been through them once, and it's built not to be held:

- **The keep**, 12 × 12 in the middle, is a ring of low walls — half cover,
  climbed over — with a broken wall pillar at each corner and four wide gaps.
  The team musters inside it, side by side across its middle: the west and
  east halves for two, three zones of 4 × 6 for three. The keep's centre still
  scores as in any battle (§13.7), and the score still doesn't decide Hold Out.
- **The curtain wall** round it has, on every side, a gate six squares wide
  and, either side of it, a breach in the open and one over rubble: five ways
  through each side. A wall can be held against one side; this one is
  attacked from four.
- **A tower at each corner**, climbed from inside, out where the enemy
  arrives: whoever climbs one has left the keep to do it.
- **The ground outside** is the gate forts': clumps of trees and rubble
  between the walls and the edge.

**The enemy's zones.** The edge, three squares deep, as four strips that turn
into each other a quarter at a time (a pinwheel, so every edge square is in
exactly one). For a team of two, one warband takes the north and south edges
and the other the east and west; for three, every edge is cut in thirds and
each warband takes one third of every edge — the second warband the thirds in
the middle, facing every gate. So a warband is a zone in several parts, and
two things learned that:

- **A deployment zone may be several areas** (`BattlefieldMap.deployments`
  takes one area or a list), kept as drawn (`Battlefield.deploymentAreas`)
  so the board outlines each part.
- **`readyMadeMuster` deals a squad round the parts** in turn, each part's
  share spread along the middle of its long side, so the first wave comes from
  every edge its warband has, and each later one refills the same squares
  (`waveOf`). A zone of one area is spread exactly as before, so no battle
  already fought musters differently.

**Measured.** The quickest walk from any warband's zone to the team's is 19
squares, past a scout's two moves and a strike (17); an archer can still
shoot on the enemy's first turn where it has a line, which is the pressure the
mission wants. The scripted team (§29.11) is overrun a round or so later than
on the gate forts, and the planner's turns cost about what they do there: the
slowest, a large battle on Hard for three, a little over a second.

**Tests.** `maps/sackedFort.test.ts`: the quarter turn, the team in the keep
round its centre, the warbands round the whole edge with every square once and
each from more than one side, a ready-made warband on every side its zone
reaches, the shared reach checks, the first-turn walk, and the wall's gaps.
`coop.test.ts`: the setting (Hold Out only), the battle created on the right
map with its setup lines, whole Hold Out battles on it for both teams with and
without fog, and a replay on it.

### 30.10 Growing waves, and Hold Out's own result

§30.8 asked whether the waves want to grow. A wave that only refills leaves
the later rounds no harder than the first, and a team that downs nobody faces
no wave at all — the log says one arrives, and nobody does. So each wave now
grows the enemy.

**The rule.** The wave landing as round *r* begins brings each warband up to
its squad **and one character more for every wave landed so far**, its own
muster not counted (`wavesLanded`): one more at round 4, two at round 7, and so
on. The extra characters are the squad's own, in its order, the first again
after the last (`waveStrength`), so a Realm warband on Normal grows by a
Knight, then a Man-at-arms, an Archer and a Scout. Strength only rises, so a
wave always has someone to bring, however few of the enemy are down. It
stands as any wave does (§30.3): its warband's ready-made places for the
grown squad first, then the rest of the zone, and anyone with no room waits
for the next wave. Every faction's strongest last wave fits every warband's
zone on every Hold Out battlefield, which a test holds.

**Engine.** A wave changes how an End turn plays, so it takes a command
version (§30.3, `docs/command-versions.md`): version 5. The End turn hands its
version to `handOff`, and an End turn from before it lands a wave that only
refills, on a replay too. The planner's time holds: a large battle on Hard
against the Swarm for three, the most characters any battle fields, plans its
slowest turn in about three-quarters of a second.

**The result.** A battle of Hold Out tells its own story on the result page,
read off the game-end replay with the rest of the record (§28):

- **The record** gains, for Hold Out alone, every wave — the round it landed,
  how many of the enemy it brought, and how many each player downed until the
  next landed — how many of each side stood at the end of every round, and
  the battle's length (`HoldOutRecord`). Absent from any other battle, and
  from a result recorded before it, which shows what it always did.
- **Stats** open with a *Hold Out* group above the players': how it ended
  ("Held out for all 15 rounds", "Beat the last wave in round 13 of 15",
  "Overrun in round 9 of 15"), the waves faced with how many of the enemy took
  the field and how many the team downed, and a line for each wave.
- **Charts** gain *Characters standing per round*, the team's line against
  the enemy's with each wave marked where it landed (a pennant, `wave`), and
  *Enemies downed by wave*, a bar a wave stacked by who downed them.

### 30.11 The team rallies, and the next wave is told

Growing waves (§30.10) made the late rounds a grind the team could only lose
slowly, and a wave's size and place were a surprise every time. Three changes
give the team a little back.

**The rally.** As each wave lands, every character of the team still standing
regains half its HP, rounded down, never past full (`rally`). The downed stay
down: only a Cleric raises them. The log says "The team rallies: everyone
standing regains half their HP" after the wave's own line. It's a rule, so it
takes a command version (§30.3): version 6. An End turn from before it lands a
wave that heals nobody, on a replay too.

**How many are coming.** The enemy's line on the scoreboard says the round the
next wave lands and how many it would bring if it landed now
(`nextWaveOf`, on the wire as `nextWave`): each warband's strength for that
wave, less who of it is standing, as far as its zone has room — what
`waveOf` would place. It moves as the team downs the enemy, which is the
point. In fog of war the team can't count who is down out of sight, so it's
told only the most the wave could bring ("up to 10"), and while a random enemy
is unseen not even that: a squad's size names its faction (§29.3). Absent
outside Hold Out's battle, after the last wave, and once the battle is over.

**Where they'll land.** The round before a wave, every warband's deployment
zone is lit on the board, breathing, in its colour: the area, not the squares
a fresh character will take. The zones are the battlefield's, public from the
start, so this tells nobody anything new — it only says when to look.

**Tests.** The rally heals by half rounded down, never past full and never
the downed, and an End turn of version 5 heals nobody; the count follows who
is down, is a ceiling in fog and absent while a random enemy is unseen, and
goes once the battle is over (`coop.test.ts`, and the null viewer's response
pinned in `hiddenHands.test.ts`).

### 30.12 Measuring balance

Hold Out's numbers — the wave spacing, the squads, the rally — are tuned by
playtest, and a playtest of three is a handful of battles. So the balance
harness fights hundreds: `npm run ra-balance` plays whole co-op battles from
the muster to their end through the command pipeline, the planner (§29.7)
playing the team as well as the warbands, and reports for each scenario —
team size, enemy, mission, battlefield, difficulty, size, fog — how often the
team wins (with a 95% interval), the round it ends in, how much of each side
falls, and round by round how many of the team are still standing.

- **A floor and a comparison, not a player's odds.** The planner plays the
  team by its own score with no plan beyond the next action; people should do
  better. What it measures well is a change: battle *k* of a scenario rolls
  from seed *k*, so the same seeds before and after a change differ only
  where the rules do (and where a warband's turn met its two-second deadline).
- **On demand in CI.** The *Realm Arena balance* workflow takes the same
  choices as inputs, splits the battles across runners, and puts the merged
  report on the run's summary page, keeping every battle's sample as an
  artifact (`npm run ra-balance -- --merge` re-reads them).
- **Where it lives.** `scripts/lib/realmArenaBalance.ts` (the battle and the
  statistics), `scripts/realmarena-balance.ts` (the command line and the
  workers), `.github/workflows/realmarena-balance.yml`.
- **What it has found.** The first experiments — which changes make Hold Out
  winnable, and by how much — are in
  [`realm-arena-balance.md`](./realm-arena-balance.md).

### 30.13 The rebalance (command version 7)

Hold Out was unwinnable (§30.12, and [`realm-arena-balance.md`](./realm-arena-balance.md)):
the team lost before the first wave, because melee always hit and an attack
costs 2 of a character's 4 AP, so a Ravager or a Knight took out a fragile
character in one enemy turn, and the team had no way to get anyone back. Five
changes, the first two for Hold Out alone and the rest for every mode.

**Hold Out only**

- **The team has 50% more HP.** Every character of the team (never a
  warband's) is mustered with its table HP × 1.5, rounded up (`teamHp`:
  Man-at-arms 12, Knight 18, Archer 9, Scout 9, Mage 8, Cleric 11), kept on the
  fighter as `maxHp`. Every full HP the rules read is `maxHpOf(fighter)`: the
  heals, Purify and the draught stop at it, a Raise gives back half of it
  (rounded up), the rally is half of it (rounded down), the computer values a
  point of HP by it (a team character's HP is worth two thirds as much), and the
  board's bars, the unit boxes and the muster sheet read it too. Hold the
  Centre, a duel, a free-for-all and Solo's Hold the Centre are as they were.
- **The computer's warbands muster one step smaller.** `warbandBudget` takes a
  further `HOLD_OUT_ENEMY_STEPS` (−1) rung down the budget ladder (§30.5), so
  on Normal the warbands of a 2- or 3-player Hold Out muster 70 points, not
  80. The ladder stops at its ends, so Easy on a Small battle musters 50. It's
  the same budget the first muster and every wave refills to (`warbandSquad`),
  so the scoreboard's count of the next wave follows it.

**Every mode**

- **Melee hits 80% of the time.** A melee strike rolls against
  `MELEE_ACCURACY` (80), through the same roll a shot takes: recorded in
  `recordedRolls` in the order it's drawn, handed back on a replay. The roll is
  a hit or a miss: no graze, no flanking bonus. What is on the target adds to
  it as it does to a shot — Hunter's mark's +15% "for every attacker" and
  Corroded's +10% — but cover, height and smoke don't: they are ranged
  things, and whoever strikes is next door. Everything that strikes one
  enemy with its weapon's reach rolls: a weapon's attack, each of a Cleave's two
  blows (a roll each), a Shield bash (which stuns only on a hit), a Rend, and a
  guard's reaction. What lands on an area without a roll — a Burst, a Demolish's
  splash, a fireball, a flask — still does. A miss is a `struck` event with
  `missed` and no damage; the log says "and missed", the board says "Miss",
  and the recap files it as a miss. The odds are read where a shot's are: the
  turn sheet, the target list, a guard's preview of a move (`strikeChance`,
  `hitChance`, `reactionPreviews`) and the planner's expected harm.
- **Long shots, −20%.** A ranged weapon's shot at a target more than two thirds
  of its range away (`LONG_RANGE_NUMERATOR`/`LONG_RANGE_DENOMINATOR`, `isLongShot`, in whole numbers so
  exactly two thirds isn't one) takes `LONG_RANGE_PENALTY` (20) off, measured
  by the distance the range check uses. It is every ranged weapon's — the bow,
  the Mage's bolt and Frost bolt, a Spitter's acid — in `shotOdds`, so an aimed
  shot, a crippling shot and overwatch have it, and so do the planner and the
  turn sheet, which says "long range −20%".
- **Heal is once a turn.** No cooldown, but a Cleric can't Heal twice in one of
  its owner's turns: `Ability.oncePerTurn`, written on the fighter as
  `usedThisTurn` and wiped as its owner's next turn begins (`startTurn`). The
  turn sheet reads "Used this turn". Regrowth is as it was.
- **Raise is on a four-turn cooldown**, not once a battle: it counts down as
  every cooldown does (§13.6), and the character it raised acts from its
  owner's next turn as before.

**Versioning.** These change what a move means, so the game goes to command
version 7 (`BALANCE_VERSION`). A stale client is told to reload
(`docs/command-versions.md`). Unlike the rules versioned by the command
(growing waves, the rally), these have to be the same for every move of a
battle — a melee strike can't start missing in the middle of one — so a battle
is stamped with the version it was **created** under
(`specificGameState.rulesVersion`, kept in the settings a replay rebuilds it
from, on the wire for the board's previews, and in an undo snapshot). A battle
without the stamp, or with a lower one, plays by the old rules to the end:
melee always hits and rolls nothing, no long-shot penalty, Heal on a
two-turn cooldown, Raise once per battle, and no `maxHp` or smaller warbands.
`battleFrom` reads the stamp into `BattleState.balanced`, which the rules,
the planner and the board all read; the abilities' old limits are
`UNBALANCED_LIMITS` in `rules.ts`, as `abilityRules` reads them, since the
`ABILITIES` table is the current rules. What a stale battle's turn sheet *says*
(the table's descriptions) is the current wording.

**Tests.** `balance.test.ts` pins each rule against a battle with the rules and
one without; `rules.test.ts`, `coop.test.ts`, `stats.test.ts`, `undo.test.ts`
and `hiddenHands.test.ts` follow them.

---

## 31. The Swarm: a second faction (B6)

The first faction that isn't the Realm, and the one §29.3 was built to take:
a brood of chitinous beasts, after the Zerg and the Tyranids. It's fought in
co-op, as the host's pick or as Random; the players still fight as the Realm,
and a squad choosing its own faction — the Swarm in a free-for-all — is the
rest of B6.

### 31.1 What it's like

- **More of them, each cheaper and weaker.** No Swarm character costs more
  than 20 points or has more than 9 HP, so a ready-made squad fields more
  bodies than the Realm's at every budget: four at 50 points against three,
  eight at 120 against five. A knock-out scores a fifth of what was downed
  (§13.7), so each one is worth less too.
- **Acid.** The Spitter's spit and the Bloater's burst leave a new
  affliction, *Corroded* (§31.2), which makes a character easier to hit. It's
  the Swarm's answer to cover, as burning is the Mage's.
- **No items.** Like every warband, it musters a ready-made squad and carries
  nothing (§29.7).

### 31.2 The characters

| Character | Points | HP | Move | Weapon | Ability |
|---|---|---|---|---|---|
| Skitterling | 10 | 4 | 8, climbs a full height | Claws: melee, 2 | — |
| Ravager | 20 | 9 | 5 | Scything talons: melee, 4 | Rend |
| Spitter | 15 | 5 | 5 | Acid spit: 70%, range 12, 2, corrodes on a hit | — |
| Bloater | 10 | 6 | 4 | Barbs: melee, 1 | Burst |
| Broodmother | 20 | 8 | 5, sight 25 | Talons: melee, 3 | Regrowth |

- **Skitterling:** the fast, weak one — it outruns everything but a Scout and
  climbs as a Scout does, and dies to one good hit.
- **Ravager:** the strong one, slower and bulkier. **Rend** (3 AP, cooldown 3)
  strikes one enemy next to it for 6, always.
- **Spitter:** the ranged one, its tail raised over its head as a scorpion's
  — or a chimera's — is, spitting acid from the gland at its tip.
- **Bloater:** a sac of acid on legs. **Burst** (1 AP, once) splashes
  everyone on the eight squares round it, friend or foe, for 3 and corrodes
  whoever stands; then the Bloater is down, by its own hand, which scores
  nobody anything — and its knock-out's points are nobody's either. It needs
  an enemy beside it.
- **Broodmother:** the leader. **Regrowth** (2 AP, cooldown 2) is a shorter
  Heal: 3 HP to an ally it can see within 8 squares, clearing what a heal
  clears.

**Corroded:** +10% to every shot at the character, overwatch included, for
two of its turns; it counts down as every effect does (§20.1). It's healed —
a Heal, a Regrowth, a healing draught or a Purify washes it off — and doesn't
stack, but it adds to Marked's +15%: what an effect adds to hit is now read
from `EFFECTS` for every effect that has one, rather than from Marked alone.

### 31.3 How it's built

- **Data.** The five characters, three abilities and the effect are lines in
  `characters.ts`, and `FACTIONS.swarm` lists them with a ready-made squad
  for every rung of `BUDGETS`, each spending the whole budget, held there by
  the test that holds the Realm's.
- **The abilities reuse the shapes already there.** Rend is a strike for the
  ability's damage, as Shield bash is. Regrowth is Heal with its own range and
  HP: the check and the act for the two are one `case`, reading `ABILITIES`.
  Burst is new: it lands on `burstArea` — the 3×3 round the Bloater but its
  own square — as a fireball lands, told as a `burst` event, then wounds the
  Bloater for all it has left.
- **The computer needed one line each** in `ACTION_AIMS` (§29.3): Rend at an
  enemy in weapon reach, Regrowth at an ally in its range, Burst at itself.
  The planner judges them as it judges anything else, and the puzzles hold it
  to bursting among two enemies, rending the enemy beside it and mending a
  hurt ally.
- **A hidden enemy** (§29.3): a Burst is told as a fireball is — a blast that
  says what it did to whom — and the recap tells it as the hits it was. With
  two factions a hit tells them apart — a Rend's 6 is no Realm blow, and
  Corroded is only the Swarm's — and so does a knock-out's points (§13.7).
  Every Swarm weapon reaches less far than a character sees, but a victim the
  blow downs sees nothing, and a Realm Archer can hit from beyond a Knight's
  sight, so a hit from out of sight would tell "not the Swarm". So the enemy
  is known the moment it **hurts the team or loses a character**, seen or not
  (`felt`, beside `noteSighting`). A line written before then calls what an
  enemy's turn or overwatch left on someone "afflicted" rather than naming
  the effect.
- **Figures** are modelled in code like the Realm's (§26.5), from the same
  kit with a shell, a belly, bone and glowing acid added to its palette and a
  many-jointed `limb`. The owner's colour is the plating on each one's back.
  The Spitter's shot flies as a gobbet of acid, and a Burst splashes a pool of
  it over the 3×3.
- **The profile** listed mastery for the Realm's characters only while
  nobody could muster the Swarm's; it lists every faction's now (§32).

## 32. Choosing a faction (B6)

The rest of B6: a squad is mustered from a faction its player chooses, among
those the host allows — the Swarm in a free-for-all, or a team of Realm and
Swarm in co-op.

- **The host allows the factions** on the setup screen: a toggle for each,
  every one on to start with. They aren't exclusive — any of them, so long as
  at least one stays on: the last one left on can't be turned off, and the
  route refuses a list with none (or a faction it doesn't know). Stored on the
  battle as `factions`, in `FACTION_IDS` order, only when it's more than the
  Realm — absent is the Realm alone, every battle from before it among them
  (`playableFactions`). A lobby's settings reach the invitation unread, so
  its schema holds them to the same rule (`playableFactionsOf`).
- **Each player picks one as they muster**, above the squad's steppers, when
  more than one is allowed. Changing it starts the squad again from that
  faction's ready-made one. `RealmArenaMuster` carries the `faction`; the
  server holds it to the host's list and the squad to its roster
  (`musterRefusal`). A muster that names none is the battle's first faction —
  the Realm, for every muster recorded before the choice — so no command means
  anything new, and the command version stands.
- **Sealed with the squad.** The faction is kept on the muster, which nobody
  else is sent until every player has mustered; once the squads are on the
  field their characters tell it anyway. The allowed list is sent during the
  muster only.
- **A timed-out muster** gets the first allowed faction's ready-made squad.
- **Mastery** is earned by any character, so the profile lists every faction's.

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
| 1.0 | PR 5 fills in how the board shows the muster: the viewer's own sealed squad is drawn hollow where it will stand, and nobody else's is drawn at all. |
| 1.1 | PR 6 fills in the muster: it starts from the ready-made squad, a squad is placed by picking a character up and putting it down, and a squad left as it starts is no secret. |
| 1.2 | PR 7 fills in taking a turn: a tap lines an action up and a second tap sends it, an enemy tapped while moving lines up an attack on it, stances go when tapped, the keep-still switches start on watch, and the last action's result is shown with its rolls. |
| 1.3 | PR 8 fills in replay and recap: a recap row is a line the log already wrote, a muster's row says only that it happened, the review follows each action by what it changed, and planning is out by design. |
| 1.4 | Targets in reach: a count on each unit's box, and the selected character's three likeliest targets floated over the board, read from the end of a lined-up move. |
| 1.5 | Each enemy in the selected character's reach wears its chance to hit above its figure on the board, previewed from the end of a lined-up move like the list. |
| 1.6 | Battlefields for three and four players (§19): one map per player count, since three seats can't be made identical on squares. The Four-Gate Fort for four, unchanged by a quarter turn; the Ring Fort for three, mirrored, with its third seat held level by measured walks. The milestone plan puts them first, as B1 (§17.4). |
| 1.7 | B2 fills in free-for-all: the party's size picks the map (§19.1), a round ends with the last seat still playing, a dropped player's squad leaves the battlefield while their score stands, and nobody is dropped from a duel or during the muster. |
| 1.8 | Round 7 (§11.7): after launch, Milestone C comes before the rest of Milestone B: status effects (§20), items bought at muster (§21), destructible low cover (§22) and character mastery (§23), which replaces game-wide unlocks (§7, B4). Round-7 questions (§24). |
| 1.9 | The board is drawn isometrically, each square raised by its terrain's height (§13.1). |
| 1.10 | Round 8 (§11.8): elevation (§25). Heights in quarters; cover, sight, climbing and high ground read from them; a tile per square and an optional elevation layer on the map; the Ring Fort's dead flank-tower stairs moved beside their towers. |
| 1.11 | Round 9 (§11.9): melee needs the two within a quarter of each other's height, and the wall round a tower top is a parapet giving half cover (§25.2). |
| 1.12 | PR 9 fills in the guide, the tour and the art: the battlefield is drawn from two isometric tile sheets at the rules' heights, open ground as one pattern of grass, and the tour follows whichever phase the match opens in. |
| 1.13 | The view turns a quarter either way, so a player can see round a tower (§13.1). |
| 1.14 | C1 PR 1 fills in status effects' rules and engine (§20.4): the End turn begins the next turn, so burning can end the battle; heal is for an ally hurt or affected; a stunned character can't go on watch. |
| 1.15 | C1 PR 2 fills in the board for status effects (§20.4): a drawn mark for each effect on figures, unit boxes and the selected character's card, the recap's row for burning as a turn begins, and the guide's text on burning. |
| 1.16 | C2 PR 1 fills in items' rules (§21.4): items as data, the throw and the draught, the smoke kept on the thrower as the square it landed on rather than as an effect, a draught its carrier can drink, and a throw that lands on nobody undoable. |
| 1.17 | C3 fills in destructible low cover (§22.3): low cover is flagged destructible, `battlefieldWith` clears it to scorched ground, the state keeps what was blasted, a flask that blasts but hurts nobody can still be undone, and scorched ground is drawn from its own sheet. |
| 1.18 | Round 10 (§11.10). The implementation plan is summarised: §17 keeps the principles, the engine decisions and a few lines a PR, with a status table for Milestones B and C, and the engine and PR parts of C1–C3 (§20.3–§22.3) are cut to what was built. Mastery is earned by actions, as XP: a little for fighting in a battle, more for each attack, ability and item (§23.1), counted by a tally on each fighter (§23.3). Battle visuals come next, as C4 (§26): hit text, then the Archer's shot and the fireball in flight. Mastery becomes C5. |
| 1.19 | C4 PR 1 fills in hit text (§26.3): the beats and the cap, an effect's name under its number, what a heal and a Raise show, text rising where the hit happened, and the events a replayed snapshot carries. A downed figure staying drawn until its hit lands moves to PR 2, with the arrow it's for. |
| 1.20 | C4 PR 2 fills in the shot and the fireball (§26.3): when each part sets off and lands, how a hit, a graze and a miss end, a throw at nobody still flying and bursting, the burst's spread, blasted cover standing until its burst fades, and drawn art for all of it. C4 is built; C5 is next. |
| 1.21 | C5 PR 1 fills in mastery from results (§23.3): the tally counts the action for the actor and reactions for the watcher, the result keeps a row per player and kind of character, a dropped player earns nothing from the battle, the battle keeps ranks rather than options, XP counts the battles a profile does, and a battle starts with nobody ranked if mastery can't be read. |
| 1.22 | C5 PR 2 fills in options (§23.3): options are data, swapping a fighter's kit, checked at muster against the battle's own snapshot of ranks, which the response carries; each is an action of its own; Demolish strikes everyone beside the cover but the Knight; Purify reaches the Cleric too and clears every affliction but no stance; a mark, a Purify and a Demolish on nobody can be undone. |
| 1.23 | C5 PR 3 fills in the screens (§23.3): the muster offers a character's options above its items, locked ones greyed with the rank that unlocks them; the profile lists all six characters' XP, rank and unlocked options for a player who has fought, read under a time limit and failing soft; the guide tells how mastery is earned. C5 is built. |
| 1.24 | The muster buys items on the squad step, beside the characters, so every point is spent on one screen; placing hands them out one each and lets the player pass them between characters (§21.3). |
| 1.25 | Figures are drawn as character art in the owner's colour, facing the way they last stepped, lying down once downed (§26.5). Facing is only visual: no rule reads it. |
| 1.26 | The recap tells everything one character did in a turn as one row (§17.3 PR 8). |
| 1.27 | B5, fog of war (§8, §27): the host's choice at setup, on to start with. A character sees 20 squares where its sight is clear — an Archer or a Scout 25, a Knight 15 — at least as far as anything it can use reaches; a player sees their squad and whoever it sees, live and in a review, until the battle ends; a move that finds an enemy out of sight in its path goes round it, or as near to where it was sent as it can, paying for the way it went; an action that shows an enemy can't be undone. Fog hides where, and the log still tells what. |
| 1.28 | The muster's characters and items each have an ⓘ opening their stats — HP, movement, sight and points, and each weapon's, ability's, option's and item's AP, damage, range, chance to hit, cooldown and area — and `/admin/realmarena` shows every one at once, for balancing (docs/admin-tools.md). |
| 1.29 | No cap on any one character: the budget is the only limit on a squad (§13.6). The muster heads its items "Consumables", and placing lists the squad as boxes that pick a character up and zoom the board to it (§21.3). |
| 1.30 | A Cleric's Heal is aimed as a fireball is, at an ally in sight within 12 squares, rather than one next to it (§13.6). The healing draught still reaches only its carrier and an ally next to it (§21). |
| 1.31 | PR 10 turns the game on (§17.3): it's in the game library with a share card and a What's new line, at command version 2, and no battle recorded before it replays (§25.5). The crew's launch pass cuts a battle's ranks on the wire to the viewer's own (§23.3) and accepts a third player reading a shot's odds in fog (§27.2). |
| 1.32 | Battle results (§28): the result page charts the points race round by round with each character downed marked on its owner's line, each squad's health, the damage each kind of character dealt and a table of everything each squad did, all read off the game-end replay. |
| 1.33 | Co-op against the computer (§29), planned and reviewed by the caveman: two or three players as one team against warbands played by game AI, one taking a turn after each player's, inside the End turn, on battlefields of its own — line battles, the team along one edge and a warband opposite each player, unchanged by a half turn (§29.2). The enemy is a faction the host picks, or Random, drawn as the battle is created and kept hidden — off the wire and unnamed in the log — until the team first sees one of its characters; factions become data, so a second one — monsters — can be fought with nothing new in the computer (§29.3). Built on sides (`sideOf`, `allied`), which teams (B3) will share. The computer plays by the same rules, view and dice as a player, one action at a time, judging each by playing it out and scoring the result with the board's own tactics helpers; its actions are recorded, so it can be improved without changing a battle already fought. Its warbands are its faction's ready-made squads. |
| 1.34 | B8 PR 1 builds sides (§29.6): `sideOf`, `allied` and the one battle builder, `battleFrom`; every friend-or-foe question asked by side on the server and the board; the centre held by a side but scored by a player with their own in it, the battle over with one side standing, and standings ranked by side. |
| 1.35 | B8 PR 2 builds the co-op battlefields (§29.2) — the Twin-Gate and Three-Gate Forts, unchanged by a half turn, a warband opposite each player, and `mapFor` — and factions as data (§29.3): `FACTIONS` with the Realm in it, a roster and an `enemyName` each, and the muster checked against its faction's roster. |
| 1.36 | B8 PR 3 builds the planner (§29.7): the board's tactics helpers move to `tactics.ts` with `ACTION_AIMS`, each kind of action's aim, which the board and the planner both read; `ai.ts`'s `nextAction` lists what a warband could do, plays each out with `act` and scores the battle it leaves; a move also goes round the squares a watcher would react on; the puzzles, the never-cheats test and the time budget hold it. Nothing calls it yet. |
| 1.37 | B8 PR 4a builds the enemy's turn (§29.4, §29.8): `coop` from the setup route to the state, Random drawn as the battle is created; every squad mustered at 80 points and a warband opposite each player as the last one musters; `applyAction` and `applyEndTurn` out of the commands; the next warband's turn inside each player's End turn, recorded there and replayed without the planner; the End turn's own response cut to what the sender's side saw in fog. The whole-battle tests: it never breaks, it plays well, and replay holds. |
| 1.38 | B8 PR 4b builds the end of it (§29.3, §29.5, §29.6, §29.9): `endAsTeam` and the team's ending, with the final score as its detail; a random enemy hidden until the team sees it (`coop.random`, `coop.enemySeen`), off the wire and named "the enemy" in the log through `ownerToken` until then; the End turn's outcome holding the enemy's turn step by step, and the recap's rows for it built as a player's are; the battle record with the enemy as one column. |
| 1.39 | B8 PR 5 builds the screens (§29.9): the setup's mode and its hidden enemy picker, co-op's party of two or three; the enemy named and coloured as one on the board, the scoreboard as the team's total against the enemy's, and the team's ending; the result's races as the team's line against the enemy's, and the enemy beside the players in the damage chart and the battle record; the guide's co-op section. B8 is built. |
| 1.40 | The next six PRs after co-op (§30, B9): Banned Islet, Outbreak and Fires Out end through `endAsTeam` and word a defeat with `finishedGameCopy`, and a Fires Out loss says which of its two it was; a side remembers where it last saw each enemy in fog, drawn faded on the board and read by the planner, and never sent to anyone else; *Hold Out*, a co-op mission where every third round each warband is brought back up to strength and the team wins by having anyone standing at the end, hunted by warbands that head for the team they see or remember; Realm Arena's first achievements, every match check an `end` check since fog hides the battlefield from the null viewer until it's over; difficulty as the warbands' size, from the existing ready-made squads (70, 80 or 100 points); and solo, co-op with a team of one on the Ruined Fort, whose turn never leaves the player. |
| 1.41 | Assists (§13.7): every other enemy who hurt a character since it last stood up scores half its knock-out, rounded up, when it's downed — so in a free-for-all softening up a character a third player finishes is still worth it. Never the downer's side, so none in a duel or co-op. Every battle scores them, those already being fought too: none had done any damage. The battle record counts them, and the result shows them when anybody scored one (§28.1). |
| 1.42 | Fog of war reaches the log, the recap and the review (§27.2–§27.3): a player is told only what their side saw, by one rule (`toldTo`); each line of the log is written per player (`perViewer`), naming a character they didn't see as one out of sight, and a line nobody of theirs saw isn't told at all; the recap and its reactions are built per viewer, and a review leaves out a step that told its viewer nothing. The fog lifts on the log as the battle ends. |
| 1.43 | B9 PR 5 builds difficulty and battle size (§30.5): Easy, Normal or Hard warbands, and Small, Normal or Large battles in every mode, from a ladder of budgets 50–120 points with a ready-made squad of at most five characters for each; *Against the Odds* for a win on Hard. |
| 1.44 | The Swarm, a second faction (§31, B6): five characters — the Skitterling, the Ravager, the Spitter, the Bloater and the Broodmother — cheaper and weaker than the Realm's, so its ready-made squads field more of them; Rend, Regrowth and Burst; and Corroded, +10% to hit, from its acid. Fought in co-op, picked by the host or drawn at Random; a squad choosing its own faction is next. |
| 1.45 | Choosing a faction (§32, B6): the host allows any of the factions on the setup screen, at least one, and each player picks one of them as they muster, held to its roster; a timed-out muster takes the first. |
| 1.46 | The warbands plan about three times quicker, every choice unchanged (§29.7): a turn keeps each square's Exposure and Threat, and Hold Out's walk to the team, from one plan to the next (`TurnMemo`); that walk is one search from every hunted square (`costsFrom`); and the path search, the copy an action resolves on, the smoke check and the walk for cover each do less. |
| 1.47 | Growing waves, and Hold Out's own result (§30.10): every wave brings a warband one character more than the last (command version 5), and the result page tells a battle of Hold Out by its waves — how it ended, what each wave brought and how many of it the team downed, and who stood each round. |
| 1.48 | B9 PR 6 builds solo (§30.6): co-op with a team of one, one warband opposite on the Ruined Fort for a duel's 15 rounds, with no turn timer; the muster and the End turn keep the turn with the player without a push, and the End turn clears the undo stack. Solo is the setup screen's third mode, and the library lists the game as 1–4 players. B9 is built. |
| 1.49 | The team rallies, and the next wave is told (§30.11): everyone of the team standing regains half their HP as each Hold Out wave lands (command version 6), the scoreboard says how many the next wave brings, and the warbands' zones are lit the round before it. |
| 1.50 | More Hold Out achievements (§30.4): *Lone Wolf* for winning it in Solo, *Hold the Keep* on the Sacked Fort, *Broken Tide* for downing the whole last wave before the last round is over, and *Unbroken* with every one of the team's characters standing. |
| 1.51 | The review plays itself (§26.2): Play in the review dock steps through the match on its own, the recap screen replays from the player's last turn, and a co-op End turn's step carries its parts — the End turn, each of the warband's actions and the hand-off, each with what the viewer was told and the board as they saw it after — so the enemy's turn plays one action at a time. Moves walk along their told path and the view frames each move from start to end, or over the stretch seen of one that crossed the edge of sight (§26.1, §26.2); the playback cap is four and a half seconds. Stances, watches and reactions say what they are over the character ("Hunker down", "Shield wall", "Overwatch", "On guard", "Guard"), and a followed step with nothing the viewer can place shows a faint "?" over the board (§26.1, §26.2). | When nothing says where to look, the view rests on the player's own side rather than the whole board: the board opens on their squad (the whole team in co-op), and a review step that has nothing to follow or is spread over more than half the battlefield goes there too; a turn beginning's fresh AP no longer counts as an action to follow.
| 1.52 | Measuring balance (§30.12): `npm run ra-balance` and the *Realm Arena balance* workflow fight hundreds of co-op battles with the planner playing both sides and report win rates, how long the team lasts and how each round goes. |
| 1.53 | The rebalance (§30.13, command version 7): melee hits 80% of the time, a long shot (past two thirds of its range) is −20%, a Cleric's Heal is once a turn instead of on a cooldown and its Raise is on a four-turn cooldown instead of once a battle, and in Hold Out the team has 50% more HP against warbands a step smaller. A battle keeps the rules it was created under. |
