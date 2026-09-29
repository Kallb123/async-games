# Defender of the Realm — Game Design Document

**Status:** Concept, v0.3. §7 records the answers from rounds 1 and 2.
Round 2 ruled out Proposals 1–3 (§12) as they stood and brought two new
proposals: sealed battle plans (§13) and a campaign of battles (§14). §15
compares the two and recommends one. Nothing is decided yet; §16 lists the
questions that would decide it.
**Working title:** Defender of the Realm (see §17)
**Genre:** Turn-based fantasy strategy: an overworld of factions, cities and
armies, with tactical squad battles
**Inspirations:** *Heroes of Might and Magic* (the overworld) and *XCOM* (the
battles)
**Players:** 2–6, competitive, winner by conquest
**Session shape:** a week or more, with players checking in a few times a day

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

| From *Heroes of Might and Magic* | From *XCOM* |
|---|---|
| A shared overworld map with resources to claim and places to visit | A small grid battlefield with terrain and cover |
| Factions, each with its own cities and troop roster | Units that act one at a time, 6–10 per side (§7, answer 7) |
| Cities that grow buildings, which unlock and produce troops | Troop types defined by abilities, not just stats |
| Resources gathered from mines and the map, spent on buildings and recruits | Positioning, flanking and turn-by-turn tactical decisions |
| Armies that move a limited distance per turn (heroes still to be decided) | A battle of about 20 turns (answer 7) |
| Neutral forces guarding the map (answer 4) | Troops that survive a battle carry over, wounds and all (answer 9) |

---

## 3. The core problem: asynchronous play

Every other game on this platform is asynchronous. There is no real-time
connection. A player takes their turn when a notification arrives, and a turn
timer moves the game on if they don't (`ARCHITECTURE.md` §4, §7). Defender of
the Realm has two layers that don't share a clock, and that's what makes it
hard.

### 3.1 Two time scales

One overworld turn will usually hold many tactical turns. A battle runs for
about 20 turns (answer 7), while the overworld needs only one turn from each
player. The overworld is the big, slow layer. Battles are small and quick,
but they have far more turns.

On this platform, every hand-off costs a notification and a wait while
someone picks up their phone. §9 works out what that costs in real time.

### 3.2 Battles at the same time

Several players share one overworld, so battles can overlap: A against B
while C fights D, or A against neutrals while B fights C. The overworld is one
shared state, so this raises a lot of questions:

- **What does the rest of the world do while a battle is still going?** Wait
  for it, or carry on?
- **What happens to the armies in the battle?** They're no longer where they
  stood, and their fate hasn't been decided yet. Can anyone else interact
  with them, or with the city they were defending?
- **What about players who aren't in any battle?** They shouldn't have to wait
  on someone else's fight. But their turn may hang on how it ends.
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
  idea in §4.

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

This is the extreme the concept is trying to avoid. It stays useful for
neutral forces (answer 4) and as an option for one-sided fights (answer 6);
see §11, mode B1.

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
  - A 20-turn battle takes 20 overworld turns: more than two weeks of game
    time in HOMM terms, and more than the whole match in real time (§9).
    This alone rules it out, given answer 13.
  - The armies in a battle are shut out of the overworld for that whole time.
  - Turns become uneven. A player in three battles has a heavy turn. A player
    in none has a light one.
  - It raises questions of its own. Can reinforcements march into a battle
    that's still going? Can a third army join in?

### 4.3 Further ideas

See §10–§15.

---

## 5. What a good answer has to do

The test to judge proposals against, updated with the answers in §7:

1. **Battles are played, not simulated**, at least the ones against other
   players.
2. **Nobody sits idle waiting on a battle they aren't in.**
3. **A turn fits into a spare minute or two**, like waiting for a bus or for
   the kettle to boil (round 2, answer 1). No turn asks a player to fight a
   whole battle in one sitting.
4. **A battle is over within one overworld turn** (answer 13). If it runs
   longer, the overworld holds until it's over (round 2, answer 1). A battle
   doesn't have to wipe an army out to be over.
5. **The overworld stays consistent.** A battle ending later can't make an
   earlier action invalid.
6. **An absent player isn't treated unfairly**, especially a defender who
   didn't choose to fight.
7. **The less a player takes part, the less luck decides the result**
   (answer 10).
8. **It fits the platform.** Where it needs something new, as Kingdom Builder
   needed its tick, the cost is named and worth paying.

---

## 6. Out of scope for now

Factions, the unit roster, abilities, the economy, map generation and victory
conditions all wait until the async model is settled, because it limits each
of them. It sets how many units a battle can hold, how long a battle can run,
and how much one overworld turn can ask of a player.

---

## 7. Questions and answers

Round 1 is §7.1–§7.5 (answers 1–16). Round 2 is §7.6 (round-2 answers 1–5).

### 7.1 Shape of a match

1. **How many players share an overworld, and is it competitive?**
   2–6 players.
2. **How long should a match last?** A week or more. It depends how long
   players pause between turns.
3. **How often do players check in?** A few times a day.

### 7.2 Who fights whom

4. **Are there neutral forces?** There could be, and battles against them
   could auto-resolve.
5. **Does the defender fight by hand?** Ideally both the attacker and the
   defender take part by hand. That may be impossible, so consider
   alternatives, such as standing orders that run an "autobattle".
6. **Is auto-resolve acceptable as an option?** Consider a variety of options:
   auto-resolve (which drops all tactical input) and autobattles run from
   standing orders.

### 7.3 Size and feel of a battle

7. **How big is a battle?** 6–10 units a side. A unit could be one figure
   with its own HP, or a troop whose number of soldiers is its HP. A battle
   takes about 20 turns.
8. **Heroes, or squads of soldiers?** Heroes are still to be decided.
9. **Do units carry over between battles?** Yes.
10. **How much luck?** It depends on the overall solution. With less player
    involvement, battles should be more predictable, so there are fewer
    surprises.

### 7.4 The overworld

11. **Strictly turn by turn, or everyone at once?** Hard to avoid turn by
    turn, as orders could conflict. The exception would be if the overworld
    became less physical: more of a connecting "pick your upgrades" step
    between battles.
12. **Fog of war?** Possibly, depending on how the overworld is set up.
13. **Can the world carry on during a battle?** That would be difficult. A
    battle really needs to resolve within one overworld turn. That doesn't
    mean an army has to be wiped out.

### 7.5 Everything else

14. **Factions?** Start with one. In the end there should be as many factions
    as the maximum number of players, so every player can be different. Each
    faction feels different, with its own abilities.
15. **How does a match end?** The overworld decides who wins. Usually that
    means conquering every other player.
16. **Anything not wanted?** Open to different solutions, to see how it could
    all fit together.

### 7.6 Round 2

1. **Should battles feel like XCOM, or should both players decide
   mid-battle?** Getting close to XCOM would be nice, but it will be
   difficult. Turns need to be fast: people check in while waiting for a bus
   or for the kettle to boil, so they can't be asked to fight a whole battle
   in one go. And if a battle overflows into several turns, the overworld
   really has to hold.
2. **Is "about 20 turns" 20 each, or 20 in total?** Battles could vary a lot,
   from 20 turns in total to 20 turns each.
3. **Is a forced siege turn before attacking a city acceptable?** Yes.
4. **Are 10–20 rounds enough overworld for six players?** A full six-player
   match could run longer. That's OK overall.
5. **Heroes?** Can still be decided later.

Round 2 also brought two new proposals, written up in §13 and §14.

---

## 8. What the answers settle

| Settled | Consequence |
|---|---|
| 2–6 players, week-plus matches, a few check-ins a day | Every hand-off costs hours (§9) |
| Battles against neutrals may auto-resolve | Most battles need no second player; only battles between players are hard |
| 6–10 units a side, about 20 turns | Too many turns to hand back and forth (§9), but the turns can stay if each hand-off covers several of them |
| Units carry over | A battle's losses matter afterwards. A **troop whose number of soldiers is its HP** suits this well: the losses show, and a city refills them by recruiting |
| A battle ends within one overworld turn, without needing a wipe-out | Battles need a **turn limit** and a way to **withdraw**. If the defender still holds at the limit, the attacker falls back |
| Luck shrinks as player involvement shrinks | An autobattle is (nearly) deterministic. A battle a player fights by hand can carry hit chances |
| The overworld decides the match, by conquest | Battles are the means; cities are what's won and lost |
| A turn fits into a minute or two (round 2) | No sitting can hold a whole battle. That rules out Proposal 1 (§12.2) |
| If a battle runs long, the overworld holds (round 2) | Most battles should end within one exchange of orders. A longer battle has to say what it holds (§13.4) |
| Battles run anywhere from 20 turns in total to 20 each (round 2) | Counting a **battle round** as one turn for each side, that's 10–20 battle rounds. One set of orders can't always cover a whole battle |
| A forced siege turn is fine (round 2) | Attacking a city always gives the defender a turn to respond |
| Six-player matches may run longer (round 2) | The one-at-a-time overworld pace (§9) is acceptable |

---

## 9. The hand-off budget

A rough sum, to show which ideas can fit. Assume each player checks in about
four times a day, so a hand-off waits about three hours on average (longer
overnight).

| What has to happen | Hand-offs in a row | Real time, roughly |
|---|---:|---|
| One overworld round, 2 players, one after another | 2 | ~6 hours |
| One overworld round, 6 players, one after another | 6 | ~18 hours, about a day |
| A 20-turn battle, the two sides taking turns | 20 | ~60 hours: two and a half days or more |
| A 20-turn battle played in four phases, both sides planning at once | 4 | ~16 hours |
| A battle one player fights during their own turn | 0 | 10–15 minutes in one sitting, too long for a check-in (round 2, answer 1) |

What follows from it:

1. **Answers 3, 5, 7 and 13 can't all hold if both sides play every turn by
   hand.** A battle where the two sides take turns runs to several days:
   longer than a whole round, even at six players. So a battle can't be a
   plain back-and-forth between two absent players.
2. **The 20 turns can stay. What has to shrink is how often a player is asked
   to act.** Each time a player is asked, their input has to cover several
   tactical turns, or the whole battle.
3. **Taking turns one after another, six players get about one round a day.**
   A one-to-two-week match is then about 10–20 rounds, nowhere near HOMM's
   hundred-plus days. The overworld has to be designed for a small number of
   big turns, unless rounds are played by everyone at once (§12, O2).
   Round 2 accepts this: six-player matches can run longer.
4. **Each check-in has to be small as well** (round 2). So each hand-off has
   to cover several battle turns (point 2) *and* be quick to give. That means
   orders that are mostly defaults, adjusted only where it matters (§10).

---

## 10. Standing orders: the piece every option needs

Whatever else is chosen, every army needs **standing orders** (a
*doctrine*): what its units do in a battle when nobody is directing them.
They're needed for:

- the defender who isn't there when they're attacked (answer 5),
- a phase or turn that's missed because its deadline passed,
- neutral forces, if they're fought on the tactical map rather than
  auto-resolved,
- the autobattle itself (answer 6).

So this is the one part of the tactical layer that every proposal builds. The
rule for all of them: **a unit always has orders; a player who is present
overrides them.**

A sketch of what an army's standing orders could hold, set at any time on the
overworld:

- **Deployment:** where each unit starts on its side of the battlefield.
- **Stance:** hold the line, advance, or skirmish and keep distance.
- **Target priority:** nearest, weakest, spellcasters first, and so on.
- **Ability rules:** when each troop type uses its ability, such as "heal an
  ally below half strength" or "shield the front rank once the enemy is in
  range".
- **Withdrawal point:** fall back once the army is down to a set strength.
  This is how a battle ends without a wipe-out (answer 13).

Each faction ships a few ready-made doctrines ("Hold the walls", "Charge",
"Skirmish"), so no one has to write their own, and the ability rules are a
natural place for a faction's character to show.

---

## 11. Ways to fight a battle

Five modes, from least to most player involvement. A proposal (§12) picks
which ones it uses where.

### B1 — Auto-resolve

The server compares the two armies with a formula and applies losses. No
tactical map.

- **Hand-offs:** none. **Luck:** none, or very little.
- **Good for:** neutrals (answer 4), and a "quick combat" button for a fight
  one side can't lose (answer 6).
- **Against:** no tactics at all (§4.1).

### B2 — Autobattle from standing orders

Both sides fight on the real tactical map, with real abilities, entirely on
their standing orders (§10). The server plays out all 20 turns at once, and
both players watch the replay.

- **Hand-offs:** none. **Luck:** little or none (answer 10).
- **For:** still a real battle, with positions, abilities and terrain. The
  tactics move to before the battle: what you recruit, how you deploy, and
  the orders you set. Proven by *Dominions*, whose battles run on scripted
  orders; by auto-battlers such as *Teamfight Tactics*; and by *Final
  Fantasy XII*'s gambits.
- **Against:** nobody makes a decision mid-battle. It's something you watch,
  not play. And the defender's orders were written before they knew who would
  attack.

### B3 — The attacker commands; the defender's orders fight back

The attacker plays the battle like XCOM, turn by turn, during their own
overworld turn. The enemy's turns are the server playing out the defender's
standing orders, the way Outbreak's infect step is the game playing itself.

- **Hand-offs:** none beyond the attacker's own turn. The battle is over
  before that turn ends.
- **Luck:** can carry XCOM-style hit chances, as the attacker is there to
  react to them.
- **For:** the most XCOM-like mode, because XCOM itself is one player against
  a computer opponent. The battle fits inside a turn. Proven by *Clash of
  Clans*, where you attack a base someone else built, defended by rules they
  set.
- **Against:** the defender makes no decisions mid-battle. Their part is
  preparation: garrison, fortifications, deployment and orders. A person
  usually beats a scripted opponent, so the defender needs built-in
  advantages (walls, deploying first, holding at the turn limit). A turn with
  a battle in it is long: a 20-turn battle is perhaps 10–15 minutes on a
  phone, so a battle has to be able to pause and resume within the turn.
- **Round 2 rules this out** for battles between players. It asks for a whole
  battle in one sitting (§12.2).

### B4 — Phased battles, both sides planning at once

Both sides give orders for the next five or so turns at the same time: moves,
targets, abilities, and conditional orders such as "watch this lane and fire
at anything that crosses it". The server plays those turns out together.
Both players see what happened, then plan the next phase. Standing orders
fill any gaps, such as a target that died before it was reached.

- **Hand-offs:** about four per side for 20 turns, both sides at the same
  time. Each phase has a deadline. A side that misses it fights that phase on
  standing orders.
- **Luck:** moderate. Each phase gets the players' attention, but they can't
  react within it.
- **For:** both players make real decisions mid-battle, and neither waits on
  the other's individual moves, only on the phase. Proven by *Laser Squad
  Nemesis*, which Julian Gollop (the designer of the original *X-COM*) built
  for simultaneous play by email, and by *Frozen Synapse*.
- **Against:** it feels like planning and then watching, not XCOM's
  move-by-move. Resolving both sides at once is **a different rulebook** from
  taking turns (overwatch, reactions and initiative all work differently), so
  it has to be chosen up front; it can't be added on later to B3. Orders
  submitted in secret are hidden state, which this app's other games mostly
  avoid by revealing choices in turn order. A battle takes most of a day in
  real time (§9).
- **A variant with fewer hand-offs**, the leapfrog, is in §13.4.

### B5 — Both sides take turns by hand (XCOM proper)

Ruled out by §9 as the normal way to play. It's only possible when both
players happen to be online together. A later extra, perhaps: "your opponent
is online — fight it live?", falling back to another mode if they don't
answer within a few minutes. The platform has no live connection, so this
costs the most and should wait.

---

## 12. Proposals

### 12.1 Three ways to run the overworld

- **O1 — One player at a time.** The platform default, and the shape answer
  11 prefers. No orders can conflict, and only one battle can start at a
  time. The cost is pace: about one round a day at six players (§9).
- **O2 — Everyone at once, in rounds.** Shaped like *Diplomacy*: every player
  writes their orders at the same time. At a deadline, or once everyone has
  submitted, the orders resolve together. Conflicting orders are settled by
  rules, and **where two armies collide, the rule is a battle.** That answers
  answer 11's worry: the conflicts are where battles come from. The pace
  doesn't fall as players are added. Kingdom Builder's timer-driven rounds are
  a precedent in this app.
- **O3 — A campaign map.** Answer 11's "less physical" idea: a small map of
  provinces, where between battles each player picks upgrades, recruits and
  chooses whom to strike. In practice this is O2 on a much smaller board. It's
  simpler, but it gives up the HOMM feel of exploring and marching, which is
  much of the reason for the concept. It's kept as a fallback, not proposed.

### 12.2 Proposal 1 — "Your turn, your battle" (O1 + B3)

> **Set aside after round 2.** The attacker has to fight the whole battle in
> one sitting, which round-2 answer 1 rules out. Spreading the battle over
> several of the attacker's check-ins would stall the rotation for everyone
> else. Its siege turn and its "everyone fights the battles they start" carry
> into Proposal 4.

The overworld goes one player at a time. A battle against another player is
fought by the attacker, by hand, during their own turn, against the
defender's standing orders. Neutrals auto-resolve (B1), or can be fought by
hand, since that's you against the computer anyway. Any fight can be
autobattled (B2).

- **Attacking a city takes two turns.** First you arrive and lay siege. The
  defender's own turn then comes round before your next one, so they can
  reinforce, set orders for this particular attacker, or sally out. Then you
  assault. This costs no extra hand-offs, because the defender's turn was
  coming anyway. It's also Kingdom Builder's "losing is visible, not sudden"
  pillar.
- **An army caught in the open** fights on whatever orders its owner left it.
- **Nothing is ever mid-battle on the map.** Every battle ends within the turn
  that started it, so §3.2's questions don't come up.
- **Everyone gets to fight by hand.** Over a match, each player attacks as
  well as defends, so everyone plays the battles they choose to start.

### 12.3 Proposal 2 — "Orders, then battle" (O2 + B4)

> **Set aside after round 2, kept as a fallback.** The overworld stays one
> player at a time (answer 11; Proposal 4 assumes it). This comes back if the
> six-player pace turns out to be the problem after all.

Each round has two steps:

1. **Orders.** Every player moves armies, recruits and builds, at the same
   time. The step ends at a deadline (say eight hours), or earlier once
   everyone has submitted.
2. **Battles.** The server carries out every move. Wherever enemy armies meet,
   a battle starts, and every battle in the round is fought at once, in
   phases (B4). When the last one ends, the next round begins.

- **Both players fight every battle by hand**, in phases.
- **Two battles at once is normal:** every battle in the round happens in the
  same step, and the world waits for them all (answer 13).
- **Pace:** a round with no battles takes about one check-in (~6 hours); with
  battles, about a day.
- **Against:** it's the biggest thing to build, as both layers resolve at
  once. Moves feel less like HOMM, because you don't see what a move did until
  the round resolves. Collisions involving three or more players need careful
  rules. A player with no battle waits through the battle step.

### 12.4 Proposal 3 — "Battles alongside" (O1 + B4)

> **Absorbed into Proposal 4.** Proposal 4 is this proposal with the first
> exchange of orders taken on the players' own turns, so it costs no extra
> hand-offs. Its locking rule and its deadline become §13.4's "hold the
> pieces".

The overworld goes one player at a time, as in Proposal 1. A battle against
another player is fought by both sides in phases (B4), beside the overworld:

- **The armies and the place they're fighting over are locked** until the
  battle ends: nobody can move them, recruit into them or attack them. The
  rest of the rotation carries on, and so do the rest of the two realms.
- **The battle must end before the attacker's next overworld turn.** Each
  phase has a deadline. Any phases still unplayed when the attacker's turn
  comes round are played out at once on standing orders.
- **At two or three players** that leaves little time, so the rotation waits
  for the battle instead. The only people waiting are the ones fighting it.
- **Against:** a battle becomes a small game of its own, with its own turns,
  running beside the main one. "Locked" becomes a rule that everything on the
  overworld has to respect.

### 12.5 Side by side

| | P1 — Your turn, your battle | P2 — Orders, then battle | P3 — Battles alongside |
|---|---|---|---|
| Overworld | One player at a time | Everyone at once, in rounds | One player at a time |
| Who fights a battle between players | Attacker, against the defender's orders | Both, in phases | Both, in phases |
| How a battle feels | XCOM: move by move | Plan, then watch it play out | Plan, then watch it play out |
| Extra hand-offs per battle | None | About 4 each, at the same time | About 4 each, at the same time |
| Over within an overworld turn (answer 13) | Yes: within the attacker's turn | Yes: the round waits for it | Yes: before the attacker's next turn |
| Two battles at once | Can't happen | Normal | Happens; locked armies keep them apart |
| Overworld pace, 6 players | ~1 round a day | ~1 round a day with battles, more without | ~1 round a day |
| Fit with the platform | Best: one active player | New: secret orders, rounds for both layers | Medium: battles are side games |
| Build cost | Lowest | Highest | Middle to high |
| After round 2 | Set aside: a whole battle in one sitting | Fallback | Absorbed into Proposal 4 |

### 12.6 Round 1's recommendation

Round 1 recommended Proposal 1. Round-2 answer 1 ruled it out, because it asks
for a whole battle in one sitting. §15 has the current recommendation.

---

## 13. Proposal 4 — Sealed battle plans (from round 2)

> **As proposed.** The overworld is turn-based, like HOMM. When a battle
> starts, the attacker lays out orders for each unit in their army on a
> tactical map: move, sneak, shoot, use abilities. When the rotation reaches
> the defender, they set out their orders too. Then the orders are carried out
> and the combat plays out automatically and predictably. Battlefields are
> fairly small, so battles resolve quickly.

### 13.1 How a battle goes

1. **A's turn: contact.** A's army moves onto B's army, or lays siege to B's
   city (the forced siege turn, round-2 answer 3). A battlefield is drawn from
   the ground where they meet. B's units stand where B's standing orders
   deploy them (§10). A sees that, places their own units in their entry
   zone, and gives each unit its orders. A's orders are sealed. A then
   finishes the rest of their turn.
2. **Other players' turns.** The two armies, and the city if there is one,
   are **locked**. Nobody can move them, recruit into them or attack them.
3. **B's turn begins with the battle.** B sees the battlefield and where A's
   units stand, apart from any that sneaked in, but not A's orders. B gives
   their own. When B submits, the battle plays out and B watches it. B then
   takes the rest of their turn knowing the result.
4. **A's next check-in** opens on the replay.

Against neutrals, the neutrals' orders are their standing orders, so the
battle plays out as soon as A submits, within A's own turn. A defender who is
away when their turn times out fights on their standing orders.

**Positions are public; orders are sealed.** The attacker places their units
after seeing the defender's deployment, so they choose the flank. The
defender gives orders after seeing the attacker's placement, so they choose
the response. Neither ever sees the other's orders before they play out. That
evens out who plans first.

### 13.2 What orders look like

XCOM's overwatch is already a standing order ("shoot the first enemy that
moves where I can see"), so XCOM's vocabulary carries over well into orders:

- **Move**, **Sneak** (slower, and unseen until it attacks or is spotted), or
  **Charge**.
- **Attack** a particular unit, or by rule: the nearest, the weakest, or
  whoever enters this area.
- **Overwatch** a lane or an area.
- **Hunker down** in cover.
- **Use an ability** on a target, or when something happens ("heal whoever
  drops below half strength").
- **Fall back.**

Orders chain together: "move to that wall, then overwatch the gate."

Every unit starts with its standing order already filled in, so a player only
changes the few that matter. That's what keeps a turn to the length of a
kettle boiling (§5, point 3). An order aimed at something that's gone, such as
a target that died or a tile someone else took, falls back on the standing
orders.

### 13.3 Resolving orders

Both sides' orders play out together, one battle round at a time. Within a
round, units act in a fixed order (by speed, with ties alternating between
the sides), so the same orders always give the same result (answer 10). This
is the simultaneous rulebook from §11 B4, chosen up front. The only
uncertainty left is the opponent: you don't know their orders. That makes it
a battle of wits, not a roll of the dice.

### 13.4 Battles longer than one set of orders

A set of orders goes stale once the fighting starts. Battles run 10–20 battle
rounds (round-2 answer 2), so a set of orders should cover a **phase** of
about five battle rounds, and a long battle needs two to four phases.

**The leapfrog.** Whoever submits second in a phase plays it out, watches it,
and in the same sitting plans the next phase from what they just saw. Then
the other player sees the same result and gives their orders for that phase,
which plays it out, and so on. Every hand-off finishes one phase and starts
the next. Both sides always plan each phase from the same position, without
seeing the other's orders. Four phases take five hand-offs. The cost is that
a sitting holds two sets of orders: the one that finishes this phase and the
one that starts the next.

Round-2 answer 1 says that when a battle overflows, the overworld has to
hold. There are two ways to read that:

| What holds | How | Cost |
|---|---|---|
| **The pieces** | After the first phase, the battle messages its two players directly, outside the rotation, with a deadline for each phase. A missed phase plays out on standing orders. Anything unfinished when the attacker's next turn comes round plays out on standing orders at once. Only the locked armies and city wait. | A battle becomes a small game with its own turns, running beside the main one. The platform's one-player-at-a-time turn doesn't do that today (§3.3). |
| **The world** | The rotation stops until the battle ends, and the phases go back and forth between the two players. | At six players, four people wait on two. |

At two players the difference hardly matters: the rotation already goes back
and forth between the two players in the battle.

**The simplest first version is a single phase.** Each side gives one set of
orders. Whatever is left after it plays out on standing orders straight away
(§11 B2). Every battle is then over on the defender's turn, and nothing is
ever held past one round. Phases can come later, if playtesting shows that
one set of orders decides too little.

### 13.5 For and against

**For**
- It keeps the HOMM overworld whole, along with the conquest that happens
  there.
- The first exchange of orders costs no extra hand-offs. It rides the
  rotation, the same wait the forced siege turn already has.
- Every turn is short: watch what happened, then adjust a few orders.
- Battles are predictable (answer 10). The drama comes from reading your
  opponent.
- One battle screen serves every kind of fight. Against neutrals, or an
  absent defender, the battle plays out at once against their standing
  orders.
- It has been done before: *Laser Squad Nemesis* and *Frozen Synapse*
  (§11 B4). *Dominions* scripts the opening turns of its battles in much the
  same way.

**Against**
- It isn't XCOM's move by move: you plan, then watch. The feel of a battle
  lives in the replay, so the replay has to make every shot, and every order
  that fired, easy to follow.
- Giving 6–10 units their orders on a phone in a minute or two is the hardest
  screen in the game. Defaults do most of the work, but the order screen is
  where this proposal lives or dies.
- Sealed orders and sneaking units are hidden state. They must never reach the
  other player before they play out.
- A defender attacked by two players in one round starts their turn with two
  battles to plan.
- Long battles need phases. Phases need an answer to "what holds" (§13.4),
  and a way for a battle to message its players outside the rotation.

---

## 14. Proposal 5 — The campaign of battles (from round 2)

> **As proposed.** The overworld becomes less about movement and turns. It's a
> single "prepare" phase between a series of battles, and the battles decide
> the winner. The battles are the focus, with real XCOM-style turn-based
> combat, and every player fights.

### 14.1 How a campaign round goes

1. **Prepare.** Everyone at once, in one short sitting: recruit, heal and
   train troops, build in your city, and choose whom to attack.
2. **Battle.** Each attack is a battle between two players, taking turns
   XCOM-style. One turn moves your whole squad, which takes a minute or two
   and fits a check-in. Every battle in the round is fought at the same time.
3. **Results.** Territory changes hands. Survivors carry their wounds and
   experience into the next prepare step.

This is XCOM's own structure, a strategy layer between tactical missions,
made multiplayer.

For conquest to mean anything, the prepare step still needs somewhere to
conquer: a small map of provinces, where you pick a neighbour to strike. That
is answer 11's "less physical" overworld (§12.1, O3). Choices stay sealed
until everyone has prepared, which makes the prepare step a small version of
§12.1's O2.

### 14.2 For and against

**For**
- Real XCOM combat: move by move, with reaction fire and hit chances. Players
  are fully involved, so luck is fine (answer 10).
- Every battle turn is short.
- Each battle is exactly the two-player, one-at-a-time shape the platform
  already has.
- Most players are fighting at any one time, so during the battle step few
  are waiting on someone else's battle.
- Nothing overlaps. The overworld is the prepare step, and it waits for every
  battle by design (answer 13).

**Against**
- **It's slow.** A battle of 10–20 battle rounds is 20–40 hand-offs: about
  two and a half to five days at three hours each (§9). A campaign round then
  takes three to six days, so a two-week match gives each player three to
  five battles. Battles would need to sit at the short end of round-2 answer
  2, with a turn limit and a timer on each tactical turn. A missed turn plays
  out on standing orders.
- **The round waits for its slowest battle.** Players who finish early have
  to wait. They could fill the gap with battles against neutrals, which need
  nobody else and so go at their own pace. Those need a computer opponent
  good enough to play XCOM properly, which is a big thing to build.
- **Some players end up without a battle.** A player nobody attacked, or the
  odd one out when the player count is odd, has no fight. Battles against
  neutrals fill that gap too.
- **It gives up the HOMM half** of the pitch: marching, exploring and an
  economy on the map. The overworld shrinks to a menu.

---

## 15. Proposals 4 and 5 compared

| | P4: Sealed battle plans | P5: The campaign of battles |
|---|---|---|
| The overworld | HOMM: turn by turn, with marching, cities and resources | A prepare step between battles, on a small map of provinces |
| A battle | Plan orders, then watch them play out | XCOM: taking turns, move by move |
| Luck | None: the opponent is the uncertainty | Hit chances, as in XCOM |
| A player's turn | Watch the last phase, adjust a few orders, take an overworld turn | Move your squad, or prepare |
| Hand-offs per battle | 1 (one phase, riding the rotation) to about 5 (four phases) | 20–40 |
| How long a battle takes | Within a round with one phase; half a day to a day with more | Two and a half to five days |
| Battles in a two-week match | Many: any turn can start one | Three to five per player |
| What holds during a battle | The armies and city in it | The whole overworld, by design |
| Hardest part to build | The order screen, and a replay that's easy to follow | A computer opponent for neutral battles, and the pacing |
| Fit with the platform | Needs sealed orders; phases need battles to message players outside the rotation | Needs one match to hold several two-player battles at once |

### 15.1 Recommendation

**Proposal 4, starting with a single phase.**

The real question is which half is the heart of the game.

- **Proposal 4 keeps the realm.** That's the half where conquest happens, and
  it gives every battle its stakes. Battles stay quick and frequent. The cost
  is XCOM's move by move.
- **Proposal 5 keeps XCOM.** It pays for that with the realm and with pace:
  a few big battles spread over weeks.

Build Proposal 4 one step at a time:

1. One set of orders per side per battle, finished on standing orders.
2. See in playtesting whether that's enough.
3. Add leapfrog phases only if battles feel decided too early.

The order screen is the riskiest piece, so it's the first thing worth
prototyping, before factions, the economy or the map.

If move-by-move XCOM is the part you most want, Proposal 5 is the honest way
to get it, and the rest of the design should shrink around it.

---

## 16. Questions (round 3)

1. **The heart of the game:** is it the realm (Proposal 4: plan-and-watch
   battles, and lots of them), or the battle (Proposal 5: move-by-move XCOM,
   with a few big battles over weeks)?
2. **For Proposal 4:** when a battle runs past one set of orders, what should
   hold? Only the armies and city in the battle, with the battle messaging its
   two players outside the rotation, or the whole rotation?
3. **For Proposal 4:** is "positions public, orders sealed" the right
   balance? That means the attacker chooses the flank after seeing the
   defender's deployment, and the defender gives orders after seeing where the
   attacker placed their units.
4. **For Proposal 4:** is it worth trying a first version where each side
   gives one set of orders and standing orders finish the battle, before
   adding phases?
5. **For Proposal 5:** would three to five battles per player over two weeks
   feel like a campaign, or too few?

---

## 17. Working title

"Defender of the Realm" is close to existing titles. There's the board game
*Defenders of the Realm* (Richard Launius, 2010) and the computer game
*Defender of the Crown* (1986). It's fine as a working title, but check it
before release.

---

## Revision history

| Version | Change |
|---|---|
| 0.1 | Concept recorded; the async problem set out; the two ideas raised so far (§4) written up; open questions listed. |
| 0.2 | Round-1 answers recorded (§7) and their consequences listed (§8); the hand-off budget (§9); standing orders as the shared foundation (§10); five battle modes (§11); three proposals and a recommendation (§12); round-2 questions (§13). The working title moves from §8 to §14. |
| 0.3 | Round-2 answers recorded (§7.6) and added to §5, §8 and §9; Proposals 1–3 given a status after round 2 (§12); the two round-2 proposals written up: sealed battle plans (§13, including the leapfrog and what holds during a long battle) and the campaign of battles (§14); compared, with a new recommendation (§15); round-3 questions (§16). The working title moves from §14 to §17. |
