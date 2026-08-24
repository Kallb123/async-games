# Turn recap & planning

Three related features let players move off the live game state:

- **Turn recap** — step backward through the *actual* turns of a game and see the
  exact board as it looked at each past turn.
- **"Since you were last here"** — the per-player catch-up card shown when you
  open a game on your turn: the opponents' moves that happened while you were
  away, as a semantic event feed rather than a board. See
  [`since-you-were-last-here.md`](./since-you-were-last-here.md) for its design.
- **Planning mode** — from the current state, queue *hypothetical* future turns,
  step forward/back through them, then return to the live game. (Currently only
  Snakes & Ladders.)

All three are driven by the same reconstructed timeline, so most of the
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
returned:    [ board@initial, board@turn1, board@turn2, … ]     (computed, not stored)
```

Recap uses the real `commandHistory`. Planning appends the player's hypothetical
commands after it. Same engine, two inputs.

### Key pieces

| Piece | File | Role |
|---|---|---|
| Replay engine | `src/utils/games/replay.ts` | `buildTimeline(gameData, userIdNameMap, plannedCommands?)` reconstructs the timeline; per-game `IReplayAdapter`s provide the initial state + response conversion |
| Timeline API | `src/app/api/game/[gameid]/timeline/route.ts` | `POST` returns the snapshots (recap history + optional planned turns) |
| Navigation hook | `src/utils/hooks/useTurnNavigation.ts` | Owns view index / mode, fetches the timeline, exposes step/return/plan actions |
| Controls | `src/components/games/TurnNavControls.tsx` | Game-agnostic ⏮ ◀ ▶ / "Back to live game" / (planning) controls |
| Recap engine | `src/utils/games/recap.ts` | `buildEventFeed(gameData, userIdNameMap, forUserId)` replays the timeline through a per-game `IRecapAdapter` and windows the events to "since your last turn" |
| Recap API | `src/app/api/game/[gameid]/recap/route.ts` | `POST` returns the viewer's event feed, summary, tip and player colours |
| Recap hook + card | `src/utils/hooks/useTurnRecap.ts`, `src/components/games/TurnRecap.tsx` | Fetch-on-load + the shared catch-up card every game renders |

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

Creation-time randomness (e.g. turn-order rolls) is fine as long as its **result**
is already persisted in a stable field (like `gameState.turnOrder`) — the adapter
seeds the initial state from those persisted fields.

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
| Dice Cities | ✅ from scratch | ✅ (tip) | ✖ deferred |
| Smartthink | ✅ from scratch | ✖ by design | ✖ by design |
| Settlements & Cities | ✅ from snapshot | ✅ (tip) | ✖ deferred |
| World Domination | ✅ from snapshot | ✅ (tip, `postProcess`) | ✖ deferred |
| Solitaire | ✖ by design | ✖ by design | ✖ by design |
| Train Time | 🚧 not yet | 🚧 not yet | 🚧 not yet |

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
- **Planning** — `canPlan={false}`. A turn is a multi-step sequence (roll,
  optional re-roll, buy), so a planned "turn" isn't one command.

### Smartthink

- **Replay** — no command changes were needed: the initial state is seeded from
  the persisted doc (the solo secret code is static, and 2-player codes are
  restored by replaying `SmartthinkSetSecretCode`).
- **Recap and planning are both intentionally disabled.** Smartthink is a
  deduction game: recapping an opponent's guesses, or testing a hypothetical
  guess against the real code, would hand out free feedback. It registers no
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
- **Planning** — deferred; low value in a game whose turns are long sequences
  of trades and builds.

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
- **Planning** — deferred. A turn spans four phases (reinforce → attack →
  occupy → fortify) across many commands, same shape of problem as Dice Cities.

### Solitaire

Solo, so all three are **skipped by design**: nothing happens between your
turns, which is exactly the gap "since you were last here" exists to fill.
There's no replay adapter, the board page mounts neither `useTurnNavigation`
nor `useTurnRecap`, and the end-of-game moment is a one-off
`SolitaireVictoryScreen` instead of a recap card.

If we ever wanted "step back through my own game" review here, it would need
both of the harder patterns below: a snapshot (the deal is shuffled) *and* a
viewer for the response converter (`gameStateToModel` redacts face-down cards).

### Train Time

**Not implemented yet** — no replay adapter, no `recap.ts`, and the board page
mounts neither hook. It's the first multiplayer game built since recap landed
that doesn't have it, which is what prompted the "decide this up front" section
in [`new-game.md`](./new-game.md#7-turn-recap--planning). Treat the list below
as the to-do rather than the design:

1. **It must be a snapshot game.** `buildInitialTrainTimeState` shuffles both
   the carriage deck and the ticket deck, and both are dealt down as play goes
   on, so the starting order can't be read back. Persist
   `initialSpecificGameState` in `CreateGame` and expose `recapAvailable`,
   exactly as SAC and World Domination do.
2. **Record the mid-game reshuffle.** `drawFromDeck` recycles the discard pile
   into a fresh shuffled deck when the deck runs dry
   (`state.deck = shuffle(state.discard)`), and `refillMarket` can trigger a
   variable number of draws per command. That's the same shape as SAC's
   per-player discard loop, so use the same fix: a `SACRandomLog`-style
   recorder threaded through the helper, capturing a variable-length draw log
   on the command.
3. **Thread a viewer through the response converter** — see below. Train Time's
   `gameStateToModel(gs, userIdNameMap, viewerId)` redacts hands and tickets
   per viewer, and `IReplayAdapter.toResponseState` has no viewer to give it.

### Viewer-scoped state (a known gap)

`IReplayAdapter.toResponseState(specificGameState, userIdNameMap)` takes no
viewer, because every game that has an adapter today converts state the same
way for everybody. A game whose DTO is viewer-scoped — Train Time's hands and
tickets, Solitaire's face-down cards — can't use that signature as-is: it would
have to pass `null` and render every snapshot as if no hand were visible.

The information is available where it's needed (both the timeline and recap
routes authenticate the caller), so the fix is to widen the adapter signature
to take the viewer's userId and pass it down from `buildTimeline`. Do that as
part of the first game that needs it rather than working around it per-game.

## Adding recap to a new game

1. Export from the game's `Models.ts`:
   - a `buildInitial<Game>State(...)` that returns the deterministic starting
     `specificGameState` (reuse it in `CreateGame` to avoid drift), and
   - the `gameStateToModel` response converter.
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
   `TurnRecap` from `useTurnRecap(gameId)` on the board page.
   `gameRegistry.test.ts` fails if a `recap.ts` exists but isn't imported by
   the engine — it can't tell you that you *should* have written one, so this
   is a decision to make deliberately (see
   [`new-game.md`](./new-game.md) §7).

During recap the board is read-only: interactive controls are hidden either by
gating on `nav.isLive` (Smartthink, SAC, World Domination) or by passing a
sentinel `currentTurn` + no-op submit so no player's controls activate (Dice
Cities).

## Snapshot-replay games

Settlements & Cities and World Domination both replay from a **persisted
initial-state snapshot** rather than rebuilding their starting state, because
creation-time randomness is unrecoverable from the live state. Anything that is
shuffled at creation and then *consumed* during play (a deck that shrinks, a
hand that is dealt out) forces this: the drawn order is lost, so replaying a
draw from a reconstructed deck would diverge immediately.

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
test for SAC. Determinism was instead verified with a throwaway
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
