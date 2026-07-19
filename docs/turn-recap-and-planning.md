# Turn recap & planning

Two related features let players move off the live game state:

- **Turn recap** — step backward through the *actual* turns of a game and see the
  exact board as it looked at each past turn.
- **Planning mode** — from the current state, queue *hypothetical* future turns,
  step forward/back through them, then return to the live game. (Currently only
  Snakes & Ladders.)

Both are driven by the same reconstructed timeline, so most of the machinery is
shared.

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

| Game | Recap | Planning | Notes |
|---|---|---|---|
| Snakes & Ladders | ✅ | ✅ | Pilot. Records the dice roll (`recordedRoll`). |
| Dice Cities | ✅ | ✖ | Records dice in `doDiceRoll` (roll + radio-tower reroll). Planning deferred — multi-step per-player turns. |
| Smartthink | ✅ | ✖ (by design) | No command changes: initial state seeded from the doc (solo secret code is static; 2-player codes restored by replaying `SmartthinkSetSecretCode`). Planning **intentionally disabled** — testing hypothetical guesses would leak free feedback and break the deduction game. |
| Settlements & Cities | ✅ | ✖ | Replays from a stored initial-state snapshot (board + dev-card deck aren't reconstructable). Records dice + the 7-roll discard shuffle (`SACRollDice`) and the stolen resource (`SACMoveRobber`). Recap only for games created after the change (gated on `recapAvailable`). Planning deferred — low value here. See below. |

During recap the board is read-only: interactive controls are hidden either by
gating on `nav.isLive` (Smartthink) or by passing a sentinel `currentTurn` +
no-op submit so no player's controls activate (Dice Cities).

## Adding recap to a new game

1. Export from the game's `Models.ts`:
   - a `buildInitial<Game>State(...)` that returns the deterministic starting
     `specificGameState` (reuse it in `CreateGame` to avoid drift), and
   - the `gameStateToModel` response converter.
2. Register an `IReplayAdapter` in `replay.ts` keyed by the game's
   `gameType.className`.
3. Record RNG in any command whose `Execute` consumes randomness (see pattern
   above).
4. Wire `useTurnNavigation` + `TurnNavControls` into the game page: render
   `nav.displayedState` instead of the live state, drive the History log from
   `nav.displayedHistory`, and disable interactive controls while
   `!nav.isLive`.

## Settlements & Cities

Recap is **implemented** (planning is still deferred — it holds little value in
this game). SAC could not use the reconstruct-from-scratch approach the other
games use, because **two sources of creation-time randomness are unrecoverable
from the current state**:

- `generateBoard()` randomizes hex terrain/number tokens and harbors.
- `shuffleDeck(DEV_CARD_DECK)` randomizes the dev-card deck order.

The board is static during play (only `robberHexIndex` moves) so it *could* be
read back, but the dev-card deck **shrinks** as cards are drawn and the drawn
order is lost — so the initial deck cannot be reconstructed. Replaying
`SACBuyDevCard` from a wrong deck order would diverge.

### How it's implemented

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

### Verification

Because there's no test runner wired into CI, determinism is verified by a
synthetic harness that mirrors `buildTimeline` (Execute → CheckGameOver →
CheckEndTurn), runs a command sequence with seeded RNG, then replays the
persisted commands from a fresh initial state **with `Math.random` disabled** and
asserts `recap == live`. It covers a 7-roll (discard), a robber steal, and a
dev-card draw. Since SAC is the most randomness-heavy game, also
**sanity-check recap in the live app** on a real game before relying on it.
