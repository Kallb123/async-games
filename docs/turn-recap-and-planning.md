# Turn recap & planning

Three related features let players move off the live game state, and a fourth
reads the same history after the fact:

- **Turn recap** — step backward through a game's *actual* played actions (one
  step per command, not per turn — a turn spanning several commands, like
  Settlements & Cities' roll/build/build/end, shows as several steps) and see
  the exact board as it looked after each.
- **"Since you were last here"** — the per-player catch-up card shown when you
  open a game on your turn: the opponents' moves that happened while you were
  away, as a semantic event feed rather than a board. See
  [`since-you-were-last-here.md`](./since-you-were-last-here.md) for its design.
- **Planning mode** — from the current state, queue *hypothetical* future
  actions, step forward/back through them, then return to the live game.
  (Currently only Snakes & Ladders.)
- **Per-turn result charts** — the turn-by-turn lines on a finished game's
  result page (coins, resources, points…). Replay is what makes them possible:
  the numbers were never stored per turn, so they're recomputed once when the
  game ends and saved onto the `GameResult`. A chart's lines are usually the
  players, but needn't be — Outbreak plots one line per disease colour.

All four are driven by the same reconstructed timeline, so most of the
machinery is shared.

## How it works

State is stored as a single mutable snapshot that each command's `Execute`
mutates in place — the game does **not** keep per-turn history. So instead of
storing a board per turn, we **replay** the command log:

```
persisted:   gameState.commandHistory = [cmd0, cmd1, cmd2, …]   (the moves)
                    │
on request:  buildTimeline() → start from the initial state, run Execute() for
             each command in order, snapshotting after each
                    │
returned:    [ board@initial, board@cmd1, board@cmd2, … ]      (computed, not stored)
```

Recap uses the real `commandHistory`. Planning appends the player's hypothetical
commands after it. Same engine, two inputs.

### Key pieces

| Piece | File | Role |
|---|---|---|
| Replay engine | `src/utils/games/replay.ts` | `buildTimeline(gameData, userIdNameMap, plannedCommands?, onStep?, viewerId?)` reconstructs the timeline; per-game `IReplayAdapter`s provide the initial state + response conversion |
| Timeline API | `src/app/api/game/[gameid]/timeline/route.ts` | `POST` returns the snapshots (recap history + optional planned actions) |
| Navigation hook | `src/utils/hooks/useTurnNavigation.ts` | Owns view index / mode, fetches the timeline, exposes step/return/plan actions |
| Controls | `src/components/games/TurnNavControls.tsx` | Game-agnostic ⏮ ◀ ▶ / "Back to live game" / (planning) controls |
| Recap engine | `src/utils/games/recap.ts` | `buildEventFeed(gameData, userIdNameMap, forUserId)` replays the timeline through a per-game `IRecapAdapter` and windows the events to "since your last turn" |
| Recap API | `src/app/api/game/[gameid]/recap/route.ts` | `POST` returns the viewer's event feed, summary, tip and player colours |
| Recap hook + card | `src/utils/hooks/useTurnRecap.ts`, `src/components/games/TurnRecapScreen.tsx`, `src/components/games/TurnRecap.tsx` | Fetch-on-load, then the shared screen every game renders — a page passes its recap and its own call-to-action wording, nothing else |
| Per-turn stats | `computePerTurnStat` (`replay.ts`) + a game's `charts` entry in `GameResultData.ts` | Replays the finished game, sampling one value per key at each turn's end, for the result page's line charts. The keys default to the roster (one value per player); pass a game's own keys — Outbreak's four disease colours — for a series whose lines aren't players, and name those lines with `GameResultChart.series` so `LineChart` labels and colours them instead of reading the roster. A game that can't be replayed (no snapshot) yields no series rather than throwing — this runs on the final move, and a missing chart must never cost a player their last turn |

### Deterministic replay & RNG recording

Replaying a command must reproduce exactly what happened. Any command that
consumes randomness therefore **records its RNG outcome** the first time it runs,
and reuses it on replay. Pattern:

```ts
const roll = this.recordedRoll ?? DiceRoll(6);
this.recordedRoll = roll; // persisted as part of the command in commandHistory
```

Because the command object is what gets pushed into `commandHistory`, the
recorded value is persisted automatically (the schema stores commands as
`Schema.Types.Mixed`). For planning, the timeline endpoint returns the
`resolvedPlannedCommands` (with recorded RNG) so the client can resend them and
keep earlier planned rolls stable while adding new ones.

**Name the field `recorded…`, or a player can pick their own dice.** Because
every `Execute` *prefers* a recorded value over rolling fresh, a recorded field
is the one part of a command a client must never supply — and
`POST /api/game/command` deserialises the request body straight into a command
instance, so a request could otherwise arrive carrying one. The route therefore
calls `stripRecordedRandomness(command)` (in
`src/utils/apiModels/gameCommand.ts`) before `Execute`, which deletes every
property whose name starts with `recorded`. The naming convention is what makes
that work, so a new game's recorded field **must** use the prefix; a field
called `savedRoll` or `rngLog` would sail straight through.
`recordedRandomness.test.ts` guards the route's call site, but it cannot guard
your field's name.

Replay is the only legitimate source of these values, so neither `buildTimeline`
nor the timeline route strips them: their commands come from persisted
`commandHistory` (already trusted) or from a player's own planned moves, which
are never saved and only ever rendered back to that same player.

Creation-time randomness (e.g. turn-order rolls) is fine as long as its **result**
is already persisted in a stable field (like `gameState.turnOrder`) — the adapter
seeds the initial state from those persisted fields.

## Planning: what can be planned

Recap is a question about whether a game *can* be replayed. Planning is a
question about whether a hypothetical turn can be shown to a player without
telling them something the live game is keeping from them. Three questions
settle it, and the third is the one worth designing for up front.

**1. Is the randomness memoryless or stateful?** A die is memoryless: nothing
about the real roll exists anywhere before it is rolled, so a hypothetical roll
is statistically identical to the real one and discloses nothing. A deck is
stateful: its order is persisted, finite and consumed, so resolving a
hypothetical draw reads the exact thing the design is hiding. This is the whole
of Train Time's original `✖ by design` — "a hypothetical draw would deal off
the real deck and show the player the card at the top of it".

**2. If it is stateful, is the remaining *multiset* already public?** Contents
and order are different secrets. A game whose hands and discards are all public
has already disclosed *what* is left in the deck and is hiding only the order.
Such a game can safely draw from a **decoy deck** — reshuffled from the correct
remaining multiset — because a permutation of public information is still public
information. A game with hidden hands cannot: the decoy would disclose the
contents. Note that "public" means *public by design*, not merely present in
today's response; a DTO that over-shares is a bug to fix, not a licence to plan
against.

**3. Is the step that touches the deck its own command?** This is the
engineering constraint. If a deck is consumed inside the same `Execute` as a
deterministic action, planning cannot avoid it. If it has its own command class,
planning avoids it for free by never queueing that command. That is a **deck
freeze**, and it is the pattern that unblocks most of the games below.

**4. Does the plan reach the end of the game?** A game whose DTO reveals
something at game over — Train Time releases every player's tickets once
`gs.gameOver` is set — reveals it in a *planned* snapshot too, because the
snapshot is built by the same converter. A command that only ends a turn in
normal play can end the game on the last turn, so this is a question about the
plannable set, not about the UI. Train Time's `ClaimRoute` and `PassTurn` both
reach `finishTurn`, which is what sets `gameOver`.

### Where this is enforced

`IReplayAdapter.plannableCommands` — the list of command classNames a game will
run as a planned move. `POST /api/game/[gameid]/timeline` refuses the whole plan
with a 400 if it contains anything else, so the answers above are a control
rather than a note.

The field is required and has no default, so a new game has to answer the
question. **Empty is the right answer until a planning UI exists**: default deny
means the failure mode of forgetting is "planning doesn't work yet", not
"planning quietly resolves against hidden state".

`canPlan` on `TurnNavControls` is a separate, *client-side* thing: it decides
what the board offers. It is not a permission and never reaches the server — the
timeline route is a plain authenticated POST, so a board with `canPlan={false}`
is not thereby protected from a planned command sent by hand. Both need setting
to ship planning; only `plannableCommands` keeps anything out.

### Deck freeze

Queue the deterministic part of a turn — across as many players as you like —
and stop short of the command that would touch the deck. Nothing is redacted,
nothing is faked, and no recorded randomness is involved, because the only
command that consumes randomness is the one the planner declines to queue.

What this produces is not a picture of the future. It is an **action-budget and
reach calculator**: given where everyone stands and what everyone holds, what
can the table actually accomplish? For a co-op game that is the question players
argue about, and its answer does not depend on the deck at all.

The caveat has to reach the player, because the natural "improvement" someone
will later reach for is to resolve the deck. A frozen-deck plan shows a board
that **cannot occur** — in the real game the deck fires between each player's
turn. A city that is clean in the plan may be alight by the time the fourth
player gets there, and a plan that avoids disaster is not a promise that the
turn will. Label it as a budget calculator, not a forecast.

### Decoy decks

Where question 2 is a yes, planning can go further and resolve a draw from a
reshuffled copy of the remaining multiset. Two things make this less attractive
than it sounds:

- **A decoy must reproduce deck *construction*, not just composition.** Outbreak
  builds its player deck as piles with one epidemic each, so players can infer
  "an epidemic is due within k draws" from public counts. A uniform reshuffle
  destroys that and shows epidemics at plausible-but-wrong positions — which is
  worse than freezing the deck, because it is confidently wrong about the one
  variable that decides whether a plan survives.
- **It answers a weaker question.** One sample from a distribution is not a
  strategy test, and players will over-read it: the plan "worked" when it worked
  in one future out of forty.

It also puts client-supplied randomness back in play. A decoy's draws have to be
recorded so stepping back and forth doesn't reshuffle them, and
`resolvedPlannedCommands` round-trips through the browser — so the command class
that runs during planning is a class whose recorded fields arrive from a client.
`stripRecordedRandomness` (above) is what keeps that from reaching live play, and
it is a prerequisite for any decoy mode rather than an afterthought.

Where the randomness is memoryless the decoy is unambiguously right, because
there is no real ordering to diverge from: a fabricated d6 *is* the honest
hypothetical. Fires Out is the clean case.

### Cross-player planning

`POST /api/game/[gameid]/timeline` overwrites every planned command's `senderId`
with the caller — "for v1 planning we only let a user plan their own moves". The
replay engine itself has no such limit: `applyCommands` sets `state.currentTurn =
command.senderId` before every `Execute`, so a planned command from another
player already makes it that player's turn. Planning a whole table's turns is
therefore a route change, not an engine change.

It must stay opt-in per game. In a co-op game with open hands, planning a
teammate's turn discloses nothing and is the entire point. In a competitive game
it would both leak and mislead. Games opting in declare it alongside their replay
adapter; the default stays own-moves-only.

### Per-game analysis

| Game | Randomness | Multiset public by design? | Deck step separable? | Planning |
|---|---|---|---|---|
| Snakes & Ladders | die only | n/a | n/a | Shipped |
| Dice Cities | dice only — **no deck exists** | n/a | n/a | Nothing blocks full planning |
| Smartthink | none — the leak is the rules, not RNG | n/a | n/a | Out, and neither pattern helps |
| Settlements & Cities | dice + dev-card deck | No (dev cards hidden) | Yes — `SACBuyDevCard` | Deck freeze |
| World Domination | battle dice + card deck | No (cards face-down) | Yes — the draw sits in `riskEndTurn` | Deck freeze |
| Train Time | deck draws + mid-game recycle | No (hands viewer-scoped) | Yes — `ClaimRoute`/`PassTurn` are deterministic | Deck freeze |
| Solitaire | shuffled face-down deal | No | No — drawing *is* the game | Out |
| Outbreak | both decks + Intensify shuffle | **Yes** (hands and discards public by §2) | By design — see its GDD | Deck freeze (decoy rejected) |
| Fires Out | d6/d8 + POI pool | Yes (pool composition known) | Yes — `endTurn` | Deck freeze **and** decoy |

Every row above except Snakes & Ladders currently declares
`plannableCommands: []`, because none of them has a planning UI. The "Planning"
column is the analysis — what the game *could* allow — not what it does allow
today; switching one on means writing the list out alongside the UI, and the
adapter's comment in `replay.ts` carries the per-game caveats found while
auditing this.

Three of the four "deferred" games above were deferred for a reason that no
longer holds, and one was ruled out for a reason narrower than it looked:

- **Dice Cities** has no deck and no hidden information whatsoever — its only
  randomness is two dice. The stated blocker was that "a turn is a multi-step
  sequence, so a planned turn isn't one command", which the machinery retired:
  planning has always been per *command*, not per turn (`TurnNavControls`
  renders "Planned move N of M"). It is the cheapest game in the repo to
  unblock.
- **Settlements & Cities** was deferred on value, not feasibility. Its dice are
  memoryless and its only deck lives behind one command, so "given my hand, what
  can I build, and what does a 9 pay for?" is plannable today.
- **World Domination** was deferred as "four phases across many commands" —
  again a per-turn framing. The end-of-turn card draw is the only deck contact
  and it is reached only through the fortify/end-turn command, so
  reinforce → attack → occupy is plannable, with battle dice as honest
  memoryless hypotheticals. "Can I take Asia from here?" is the question the
  game is made of.
- **Train Time** should be reclassified from `✖ by design` to deck freeze. The
  design objection is sound and applies only to *draws*; `TrainTimeClaimRoute`
  and `TrainTimePassTurn` consume no randomness at all, so "can I claim these
  three routes with the cards I hold, and in what order?" leaks nothing.

Smartthink and Solitaire stay out, but for sharper reasons than "hidden
information". Smartthink's leak isn't randomness at all — `SmartthinkSubmitGuess`
compares against the *real* secret code, so a planned guess returns real
feedback. Neither pattern touches that: freezing nothing helps, and the only safe
decoy would score guesses against a fake code, which teaches the player nothing.
Solitaire's blocker is structural rather than informational — drawing from the
stock is the game, so a frozen plan is tableau shuffling only, and it has no
replay adapter and no snapshot to retrofit one onto.

## Per-game status

Three separate opt-ins, so a game can have one without the others:

- **Replay** — an `IReplayAdapter` in `src/utils/games/replay.ts`. Everything
  else is built on it, so it's the prerequisite for the other two columns.
- **Recap** — a `src/games/<Game>/recap.ts` exporting an `IRecapAdapter`,
  imported by `src/utils/games/recap.ts`, plus `useTurnRecap` + `TurnRecap` on
  the board page. This is the "since you were last here" card.
- **Planning** — `canPlan` on `TurnNavControls` plus per-game planning actions.

| Game | Replay | Recap | Planning |
|---|---|---|---|
| Snakes & Ladders | ✅ from scratch | ✅ (tip) | ✅ |
| Dice Cities | ✅ from scratch | ✅ (tip) | 🚧 unblocked, not built |
| Smartthink | ✅ from scratch | ✖ by design | ✖ by design |
| Settlements & Cities | ✅ from snapshot | ✅ (tip) | 🚧 deck freeze, not built |
| World Domination | ✅ from snapshot | ✅ (tip, `postProcess`) | 🚧 deck freeze, not built |
| Solitaire | ✖ by design | ✖ by design | ✖ by design |
| Train Time | ✅ from snapshot | ✅ (tip, `postProcess`) | 🚧 deck freeze, not built |
| Outbreak | 🚧 planned (snapshot) | 🚧 planned (tip) | 🚧 planned — crew planner |
| Fires Out | 🚧 planned (snapshot) | 🚧 planned (tip) | 🚧 planned — two modes |

Outbreak and Fires Out are designed but unbuilt; their rows record the decisions
their GDDs commit to (`docs/games/outbreak-gdd.md` §21.5,
`docs/games/fires-out-gdd.md` §17.5). The four 🚧 planning cells above them are
the [per-game analysis](#per-game-analysis) result: feasible, with the pattern
named, and nobody has written the UI.

"From scratch" means the adapter rebuilds the starting state from persisted,
never-changing fields. "From snapshot" means creation-time randomness is
unrecoverable, so the whole initial `specificGameState` is persisted at game
creation and deep-cloned back for replay — see
[Snapshot-replay games](#snapshot-replay-games) below.

### Snakes & Ladders

The pilot for all three features, and still the only game with planning.

- **Replay** — `buildInitialSnakesAndLaddersState(userIdList, reRollOnSix)`.
  The re-roll house rule is fixed at creation, so the adapter reads it back off
  the live state and replays under the rule the recorded rolls were played
  under.
- **RNG** — `SnakesAndLaddersDiceRoll.recordedRoll`.
- **Recap** — one event per roll, branching on the roll outcome
  (`sl_ladder` / `sl_snake` / `sl_nomove` / `sl_win`). The tip scans the six
  squares ahead of the viewer's live position for a ladder, then for a snake to
  warn about.
- **Planning** — `canPlan={!complete}`; planned rolls come back from the
  timeline endpoint with their RNG resolved, so stepping forward doesn't
  re-roll earlier planned turns.

### Dice Cities

- **Replay** — `buildInitialDiceCitiesState(userIdList)`, fully deterministic.
- **RNG** — `recordedRoll1`/`recordedRoll2` on both
  `DiceCitiesRequestDiceRoll` and `DiceCitiesRequestRadioTowerReroll`, threaded
  into the shared `doDiceRoll`. The roll outcome's `moneyChanges` map (every
  coin a café/restaurant/stadium moved) is what the recap reads to phrase
  "…took 2🪙 from **you**".
- **Recap** — the roll (money movement folded in), each establishment bought,
  and each of the four win-condition landmarks unlocked.
- **Planning** — `canPlan={false}`, but nothing blocks it. The original reason
  (a turn is a multi-step sequence — roll, optional re-roll, buy — so a planned
  "turn" isn't one command) doesn't hold: planning is per *command*, not per
  turn. Dice Cities has no deck, no shuffle and no redaction anywhere, so its
  only randomness is two memoryless dice and a hypothetical roll is as honest as
  a real one. Cheapest planning in the repo to switch on.

### Smartthink

- **Replay** — no command changes were needed: the initial state is seeded from
  the persisted doc (the solo secret code is static, and 2-player codes are
  restored by replaying `SmartthinkSetSecretCode`).
- **Recap and planning are both intentionally disabled.** Smartthink is a
  deduction game: recapping an opponent's guesses, or testing a hypothetical
  guess against the real code, would hand out free feedback. Neither the deck
  freeze nor the decoy helps, because the leak isn't randomness at all —
  `SmartthinkSubmitGuess` scores against the *real* secret, so there is no
  randomness to freeze, and the only safe decoy would score guesses against a
  fake code, which teaches the player nothing. It registers no
  `recap.ts` at all, and its board page mounts `useTurnNavigation` with
  `canPlan={false}` and no `useTurnRecap`.

### Settlements & Cities

- **Replay** — from a stored snapshot (see below), gated on `recapAvailable`.
- **RNG** — `SACRollDice` records `recordedRoll1`/`recordedRoll2` plus
  `recordedDiscards` for the Fisher-Yates discard on a 7; `SACMoveRobber`
  records `recordedStealIndex`. `SACBuyDevCard` needs nothing — it draws from
  the snapshot-preserved `devCardDeck`.
- **Recap** — rolls, the robber, builds, dev cards, and longest-road /
  largest-army handovers (their own row, since a bonus swing matters more than
  the build that caused it). Low-signal chatter (roads, maritime trades,
  end-turn) is skipped. Inherits the `recapAvailable` gate: a game with no
  snapshot throws on replay and `buildEventFeed` treats that as "no recap".
- **Planning** — deferred on *value*, not feasibility: turns are long sequences
  of trades and builds. Feasible as a deck freeze whenever it's wanted — the
  dice are memoryless and `SACBuyDevCard` is the only command that touches the
  dev-card deck. It is not the only exclusion, though: `SACMoveRobber` samples a
  real resource out of the victim's hand, and `SACPlayMonopoly` reads how much
  of a resource every player is holding. Both are hidden state under question 1
  even though neither touches a deck.
  "Given this hand, what can I build, and what does a 9 pay for?" is the shape
  it would take.

### World Domination

- **Replay** — from a stored snapshot (see below), gated on `recapAvailable`.
  `cloneWorldDominationState` deep-clones the persisted initial state and
  rebuilds the `playerStates` Map in `userIdList` order.
- **RNG** — `WorldDominationAttack` records `recordedAttackerDice` and
  `recordedDefenderDice` (variable-length arrays — the counts come from the
  command's own `attackerDiceCount` and the defending territory). Card draws
  need no recording: they `pop()` the snapshot-preserved `cardDeck`.
- **Recap** — deployments, battles and conquests (an elimination is folded into
  the conquest line that caused it), card cash-ins and fortifies. It's the only
  adapter using **`postProcess`**: an attack and
  the `WorldDominationOccupyTerritory` that follows it are two commands but one
  logical conquest, and `toEvents` only ever sees one command at a time, so the
  merge happens in the post-pass over the full event list.
- **Planning** — deferred, and for the same per-turn framing as Dice Cities: a
  turn spans four phases (reinforce → attack → occupy → fortify) across many
  commands. As a deck freeze it works, because the only deck contact is the
  end-of-turn card draw in `riskEndTurn`, reached only through the
  fortify/end-turn command — so reinforce → attack → occupy is plannable and
  battle dice are honest memoryless hypotheticals. What a plan can't tell you is
  which card a conquest would win. A decoy deck is *not* available here: cards
  are face-down by design, so the remaining multiset isn't public.

### Solitaire

Solo, so all three are **skipped by design**: nothing happens between your
turns, which is exactly the gap "since you were last here" exists to fill.
There's no replay adapter, the board page mounts neither `useTurnNavigation`
nor `useTurnRecap`, and the end-of-game moment is a one-off
`SolitaireVictoryScreen` instead of a recap card.

Planning is out on top of that, and structurally rather than informationally:
drawing from the stock *is* the game, so a deck freeze leaves tableau moves only.

If we ever wanted "step back through my own game" review here, it would need
both of the harder patterns below: a snapshot (the deal is shuffled) *and* a
viewer for the response converter (`gameStateToModel` redacts face-down cards).
The second of those is no longer a blocker — Train Time widened the adapter to
take a viewer (see [Viewer-scoped state](#viewer-scoped-state)) — but the
snapshot still can't be added to games already dealt.

### Train Time

Retrofitted after the fact — it was the game that prompted the "decide this up
front" section in [`new-game.md`](./new-game.md#7-turn-recap--planning), and it
is also the game that closed the viewer gap below.

- **Replay** — from a stored snapshot (see below), gated on `recapAvailable`.
  Both decks are shuffled at creation and dealt down as play goes on, so
  nothing about the opening position can be read back off the live state.
- **RNG** — `TrainTimeDrawCarriageCard.recordedShuffles`. The only randomness
  once the game is dealt is `drawFromDeck` recycling the discards into a fresh
  deck when it runs dry, which one command can trigger more than once (a market
  refill after an Engine wipe), so a `TrainTimeShuffleLog` threads through
  `drawFromDeck`/`refillMarket` and records the recycles as an ordered list.
  Ticket draws need nothing: that deck is never reshuffled.
- **Recap** — one row per turn: a route claimed (with the Long Haul lead
  call-out), the two halves of a draw folded back together by `postProcess`,
  a ticket draw as the count that stuck, a pass, and the last lap — which is
  everybody's clock, so it's the one row with `affectedIds`. **Events are
  public information only**: a face-up card taken is named, a blind draw and a
  kept ticket are only ever counts (design doc §10). The tip is the exception —
  it reads the viewer's own hand, which is why the feed replays per viewer.
- **Planning** — `canPlan={false}`. The design objection stands and is exact: a
  hypothetical *draw* would deal off the real deck and show the player the card
  at the top of it. It only ever applied to draws, though, so this is a deck
  freeze rather than a flat no — `TrainTimeClaimRoute` and `TrainTimePassTurn`
  consume no randomness at all, and "can I claim these three routes with the
  cards I hold, and in what order?" leaks nothing. A decoy is out: hands are
  viewer-scoped, so the deck's remaining multiset isn't public.
- **Result charts** — route points and longest run per turn, sampled from the
  same replay. The points line is the race as it ran; the Long Haul line moves
  in jumps as separate stretches of network finally join up, which is why it's
  worth plotting beside the points rather than as a rescaling of them.

### Outbreak and Fires Out (designed, unbuilt)

Both are co-op, both are designed for replay from day one, and both are the
reason the [planning analysis](#planning-what-can-be-planned) above exists. The
designs live with the games rather than here — `docs/games/outbreak-gdd.md` §21.5
and `docs/games/fires-out-gdd.md` §17.5 — but the shape of each is worth knowing
when reading the table:

- **Outbreak** ships a **crew planner**: queue any player's board actions, in any
  order, across the whole table, and stop at the command that draws. Its decks
  make it the one game where a decoy would be leak-free (hands and discards are
  public by design, so only order is secret) and its GDD records why that was
  rejected anyway.
- **Fires Out** gets both modes, because its randomness is two dice rather than a
  deck order: the same frozen crew planner, plus an optional hypothetical
  `endTurn` that rolls the fire. A fabricated d6/d8 discloses nothing, which is
  what Outbreak can never say about a card.

Both need the cross-player opt-in described above; neither is buildable as
own-moves-only planning, since the whole point is reading the *table's* budget.

### Viewer-scoped state

`IReplayAdapter.toResponseState(specificGameState, userIdNameMap, viewerId)`
takes the player the snapshots are being built for, because a game whose DTO is
viewer-scoped — Train Time's hands and tickets, Solitaire's face-down cards —
otherwise has to render every snapshot as if no hand were visible. Games whose
state is the same for everybody ignore the argument.

`buildTimeline` takes it as a trailing parameter and passes it straight to the
adapter. Both callers that know who is asking supply it: the timeline route
passes the authenticated caller, and `buildEventFeed` passes the player the
recap is for. `buildAllEvents` and `computePerTurnStat` pass `null`, since
neither is built for anybody in particular. A snapshot therefore only ever
carries the asking player's own secrets — everybody else stays a card count,
exactly as in live play.

Recap **events** are a different question and don't get the same latitude: they
are written once and read by whoever the feed is built for, so a `toEvents`
must only ever describe what the whole table can already see.

## Adding recap to a new game

1. Export from the game's `Models.ts`:
   - a `buildInitial<Game>State(...)` that returns the deterministic starting
     `specificGameState` (reuse it in `CreateGame` to avoid drift), and
   - the `gameStateToModel` response converter — which may take a viewer, if
     your game redacts per player (see
     [Viewer-scoped state](#viewer-scoped-state)).
   If the starting state can't be rebuilt deterministically, persist a snapshot
   instead — see [Snapshot-replay games](#snapshot-replay-games).
2. Register an `IReplayAdapter` in `replay.ts` keyed by the game's
   `gameType.className`.
3. Record RNG in any command whose `Execute` consumes randomness (see pattern
   above).
4. Wire `useTurnNavigation` + `TurnNavControls` into the game page: render
   `nav.displayedState` instead of the live state, drive the History log from
   `nav.displayedHistory`, and disable interactive controls while
   `!nav.isLive`.
5. For the "since you were last here" card, add `src/games/<Game>/recap.ts`
   exporting an `IRecapAdapter` (`toEvents`, `summarize`, optional `tip` and
   `postProcess`), import it from `src/utils/games/recap.ts`, and render
   `TurnRecapScreen` from `useTurnRecap(gameId)` on the board page (`recap.show`
   is the whole condition; the page supplies only its call-to-action wording).
   `gameRegistry.test.ts` fails if a `recap.ts` exists but isn't imported by
   the engine — it can't tell you that you *should* have written one, so this
   is a decision to make deliberately (see
   [`new-game.md`](./new-game.md) §7).

During recap the board is read-only: interactive controls are hidden either by
gating on `nav.isLive` (Smartthink, SAC, World Domination, Train Time) or by
passing a sentinel `currentTurn` + no-op submit so no player's controls
activate (Dice Cities).

## Snapshot-replay games

Settlements & Cities, World Domination and Train Time all replay from a
**persisted initial-state snapshot** rather than rebuilding their starting
state, because creation-time randomness is unrecoverable from the live state. Anything that is
shuffled at creation and then *consumed* during play (a deck that shrinks, a
hand that is dealt out) forces this: the drawn order is lost, so replaying a
draw from a reconstructed deck would diverge immediately.

All three read that snapshot's player map back through `clonePlayerStates`
(`src/utils/games/mongoMaps.ts`), which copes with the two ways Mongo hands
it over — a real `Map` on a live document, a plain object once it has been
through JSON — and rebuilds it in the order the game supplies (`userIdList`, or
Train Time's `turnOrder`), since replay iterates it to deal, discard and break
ties. Each game supplies its own per-player clone, and
that clone must **name every field**: a subdocument keeps its fields behind
getters, so `{ ...ps }` copies none of them. Train Time shipped exactly that
bug — every score in a reviewed turn read `NaN` until #338.

### Settlements & Cities

SAC could not use the reconstruct-from-scratch approach the earlier games use,
because **two sources of creation-time randomness are unrecoverable from the
current state**:

- `generateBoard()` randomizes hex terrain/number tokens and harbors.
- `shuffleDeck(DEV_CARD_DECK)` randomizes the dev-card deck order.

The board is static during play (only `robberHexIndex` moves) so it *could* be
read back, but the dev-card deck **shrinks** as cards are drawn and the drawn
order is lost — so the initial deck cannot be reconstructed. Replaying
`SACBuyDevCard` from a wrong deck order would diverge.

#### How it's implemented

A **one-time initial-state snapshot** is stored at game creation and replayed
from, with in-play RNG recorded:

1. **The initial `specificGameState` is persisted** in `CreateGame` as
   `initialSpecificGameState` (a deep clone via `cloneSACState`, a second Mongoose
   path with the same sub-schema). `buildInitialSettlementsAndCitiesState`
   deep-clones it back for replay and **rebuilds the `playerStates` Map in
   `userIdList` order** so iteration order matches the original (important for the
   discard loop below). Pre-existing games lack the field: `CreateDataResponse`
   exposes `recapAvailable`, and the game page only offers the recap controls when
   it's true.
2. The SAC replay adapter (`replay.ts`) uses that helper for its
   `buildInitialSpecificGameState` and `gameStateToResponse` for the response shape.
3. **In-play RNG is recorded** on the relevant commands (same `recorded…` pattern):
   - `SACRollDice` — `recordedRoll1`/`recordedRoll2` for the dice, **and**
     `recordedDiscards` for the Fisher-Yates discard in `sacDiscardHalf` (run per
     player with >7 cards on a 7). A small `SACRandomLog` recorder threads the raw
     draws through `sacDiscardHalf`, capturing a variable number of draws.
   - `SACMoveRobber` — `recordedStealIndex`, the index of the stolen resource in
     the victim's (deterministically reconstructed) pool.
   - `SACBuyDevCard` — **no** recording needed; it draws from the (now
     snapshot-preserved) `devCardDeck`, which is deterministic.
4. `useTurnNavigation` + `TurnNavControls` are wired into
   `src/app/games/settlementsandcities/[gameid]/page.tsx`: the board/scoreboard/hand
   render `nav.displayedState`, and interactive controls are disabled while
   reviewing (`isMyTurn` requires `nav.isLive`).

#### Verification

Vitest runs in CI (`npm test`), but there is no checked-in replay-determinism
test for SAC (Train Time's `replay.test.ts`, below, is the model for one). Determinism was instead verified with a throwaway
synthetic harness that mirrors `buildTimeline` (Execute → CheckGameOver →
CheckEndTurn), runs a command sequence with seeded RNG, then replays the
persisted commands from a fresh initial state **with `Math.random` disabled** and
asserts `recap == live`. It covers a 7-roll (discard), a robber steal, and a
dev-card draw. Since SAC is the most randomness-heavy game, also
**sanity-check recap in the live app** on a real game before relying on it.

### World Domination

World Domination hits the same wall for the same reason, one game later:

- `SortUsersByRoll` picks the running order, and territories are then dealt out
  by `shuffle(TERRITORIES.map(t => t.id))` — the *result* of the deal is in the
  live `territories` array, but ownership changes on every conquest, so it
  can't be read back.
- The World Domination card deck is shuffled at creation and `pop()`ed each
  time a player takes a territory, so — exactly like SAC's dev-card deck — the
  drawn order is gone.

It follows the SAC pattern verbatim:

1. `CreateGame` persists the starting state as `initialSpecificGameState`, and
   `CreateDataResponse` exposes `recapAvailable: !!doc.initialSpecificGameState`
   so pre-change games simply don't offer recap.
2. `buildInitialWorldDominationState` deep-clones it back through
   `cloneWorldDominationState`, which rebuilds `playerStates` in `userIdList`
   order and clones the card deck, territories and `lastBattle` by value, so
   replay never aliases the persisted document.
3. `WorldDominationAttack` records both dice arrays; nothing else in the game
   consumes randomness once the snapshot exists.

One snapshot-specific gotcha is worth calling out, since the next card game will
hit it too: the snapshot is a **second Mongoose path built from the same
sub-schema** (`makeWorldDominationStateSchemaDef`), so any schema bug hits it as
well as the live state. World Domination cards have a field literally named
`type`, which collides with Mongoose's own `{ type: <SchemaType> }` convention
and made it reinterpret the card arrays as arrays of plain strings — dropping
`id`/`territoryId` and throwing a `CastError` on real cards.
`WorldDominationModels.test.ts` is the regression test for that, and asserts the
snapshot path casts cleanly alongside the live one.

### Train Time

Both of Train Time's decks are shuffled at creation and dealt down as the game
runs, so it hits the same wall a third time — but it is the first game where
randomness also fires **mid-game**, and the first whose response is built per
viewer.

1. `CreateGame` persists the dealt state as `initialSpecificGameState` and
   `CreateDataResponse` exposes `recapAvailable`, as above.
   `cloneTrainTimeState` rebuilds `playerStates` in **turn order** rather than
   `userIdList` order, because that is the order the game was dealt in and the
   order final scoring ranks players in — a replay that iterated differently
   could break a tie the other way.
2. `makeTrainTimeStateSchemaDef()` builds both Mongoose paths, per the
   World Domination gotcha above.
3. **The mid-game recycle is recorded.** `drawFromDeck` reshuffles the discard
   pile when the deck runs dry, and a single command can hit that more than
   once, so `TrainTimeShuffleLog` (threaded through `drawFromDeck` and
   `refillMarket`) hands back the recorded recycle on a replay and a fresh
   shuffle otherwise, keeping them as an ordered list on
   `TrainTimeDrawCarriageCard.recordedShuffles`. Same shape as `SACRandomLog`,
   one level down: the recorder sits on the deck helper, so every caller is
   covered rather than each command remembering to record.
4. **Snapshots are built for a viewer** — see
   [Viewer-scoped state](#viewer-scoped-state).

#### Verification

`src/games/TrainTime/replay.test.ts` is the checked-in determinism test the
earlier snapshot games never got, and is worth copying for the next one. It
plays a full random game through the real command pipeline, then replays the
persisted log through `buildTimeline` **with `Math.random` stubbed to throw**,
and asserts the final snapshot equals the live state — so anything reaching for
fresh randomness fails the test rather than quietly dealing a different game. It
also covers both recycle paths (a blind draw and a mid-market-refill) through a
JSON round-trip of the command, that the viewer's hand is the only one shaped
in, and that a game with no snapshot is treated as having no recap. As with
SAC, still **sanity-check recap in the live app** on a real game — nothing here
has been through Mongo.
