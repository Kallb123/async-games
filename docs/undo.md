# Undo

A plan for letting a player take back a move they've just made, and for the
ten-second hold on the turn hand-off that makes taking it back possible at all.

The pilot is **placing settlements and roads in Settlements & Cities** — all
four of them: the two setup placements and the two main-phase builds. Every
other game, and every other Settlements & Cities command, is out of scope here
and gains nothing until someone opts it in a line at a time.

> Related: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §6 (the command pipeline) and
> §9 (replay); [`docs/turn-recap-and-planning.md`](./turn-recap-and-planning.md)
> for the replay engine this feature deliberately does *not* use.

## Contents

1. [What a player gets](#1-what-a-player-gets)
2. [What the engine already gives us](#2-what-the-engine-already-gives-us)
3. [What the engine does not give us yet](#3-what-the-engine-does-not-give-us-yet)
4. [The shape of an undo — three options, one chosen](#4-the-shape-of-an-undo--three-options-one-chosen)
5. [The ten-second hold](#5-the-ten-second-hold)
6. [What is undoable, and what enforces it](#6-what-is-undoable-and-what-enforces-it)
7. [State and command surface](#7-state-and-command-surface)
8. [Hidden information](#8-hidden-information)
9. [Robustness](#9-robustness)
10. [Turn recap & planning](#10-turn-recap--planning)
11. [UI surface](#11-ui-surface)
12. [The PRs](#12-the-prs)
13. [Testing](#13-testing)
14. [What this does not reach](#14-what-this-does-not-reach)
15. [Definition of done](#15-definition-of-done)

---

## 1. What a player gets

One sentence, and the whole feature falls out of it:

> **After an action that involved no luck, you get ten seconds to take it back —
> and if your turn was about to end, it waits for you.**

In Settlements & Cities that reads:

- **Setup.** Tap the wrong vertex and an **Undo** button appears under the
  board. Take the settlement back, place it where you meant to. Place the road
  and the turn is ready to pass — so instead of passing, a countdown runs:
  *"Turn passes in 8s · Undo · Pass now"*. Undo takes the road back (the
  settlement is still yours to undo after it); Pass now skips the wait.
- **Main phase.** Build a road or a settlement and the same Undo appears. If
  that build left you with nothing else to buy, build or trade, the turn would
  today end itself the instant the build landed. Now it holds for ten seconds
  first, with the same countdown, because "I've just spent my last brick on the
  wrong edge" is exactly the moment you want it back.
- **Nothing else changes.** Rolling, the robber, dev cards and trades are not
  undoable (§6), and a turn that ends on one of those ends exactly as it does
  today, with no countdown and no delay.

Two clauses of the ask are worth pinning down because they decide the design:

- *"only on non-random actions"* — §6. It is enforced by the engine, not by
  each game remembering.
- *"unless the turn isn't ready to end"* — a turn mid-sequence has nothing to
  hold. A setup settlement with its road still outstanding, a pending robber
  move, free roads left from a Road Building card: the turn was never about to
  pass, so there is no countdown. Undo is simply available until you do
  something else. The existing guard at the top of `sacFinishTurn` already draws
  exactly this line, and the hold reuses it rather than restating it.

## 2. What the engine already gives us

More than it looks like, and one piece of it is a working undo.

- **Solitaire already has undo, and it is the pattern to copy.**
  `SolitaireUndo` (`src/games/Solitaire/SolitaireLogic.ts`) is an ordinary
  `@serializable` command: every mutating command pushes a snapshot of the
  board-only fields onto `specificGameState.undoStack`, and `SolitaireUndo.Execute`
  pops one and assigns it back. It goes through `POST /api/game/command` like
  any other move, is recorded on `commandHistory`, writes its own history line,
  and replays deterministically — because the stack it pops from was rebuilt by
  the same replay. `ISolitaireUndoSnapshot` even documents which fields are
  deliberately left out of a snapshot and why. Everything below is that shape,
  applied to a game with opponents.
- **`ICommandOutcome.followUpCommand`** (`src/utils/apiModels/gameCommand.ts`)
  is how Settlements & Cities already ends a turn on the player's behalf. The
  hold in §5 is a change to *when* that follow-up runs, not to what it is.
- **`stripRecordedRandomness`** already encodes the convention the undoability
  rule needs: a field whose name starts with `recorded` is randomness a command
  consumed. §6 reuses the prefix rather than inventing a second marker.
- **The turn timer is already the backstop** for a turn that stops moving.
  Settlements & Cities registers an `ITurnTimeoutAdapter`
  (`src/utils/games/turnTimeout.ts`) that plays a stalled turn through the
  game's own commands, including `SACEndTurn`. §9 leans on this and adds
  nothing to the cron.
- **`gameStateToResponse` already redacts per viewer**, and already has the
  exact precedent §8 needs: `hideAutoEndedRoll` keeps "this turn ended because
  its player could afford nothing" away from everybody but that player.
- **`useSubmitCommand`** already serialises one command at a time per client
  and resyncs from the server on any failure, so the undo button needs no
  submit path of its own.
- **`useNow`** is the shared ticker every live readout on screen already reads
  from, so the countdown needs no timer of its own either.

## 3. What the engine does not give us yet

- **`IGameCommand.Undo` is a trap, not a feature.** The interface declares
  `Undo(gameData: IGameData): void` and 58 command classes implement it. **One**
  of them does anything: `DiceCitiesRequestDiceRoll.Undo` calls
  `undoRollPayout`, which the re-roll path genuinely uses. The other 57 are
  `console.error("Command Undo not implemented yet")` or — worse — a bare
  `gameData.gameState.commandHistory.pop()`, which is not an undo of anything
  and would corrupt the replay log if it ever ran. A feature called undo must
  not be built next to a method called Undo that means neither. PR 1 removes
  the member from the interface and the 57 stubs with it, and leaves Dice
  Cities' one real inverse as what it always was: a private detail of that
  game's re-roll.
- **No way for a command to say "hold the follow-up".** The pipeline runs a
  `followUpCommand` immediately or not at all.
- **No shared statement of the window.** Ten seconds has to be one constant
  that the server stamps a deadline with and the client counts down to.
- **No undo affordance in the shared UI.** Solitaire's undo button is local to
  its own board.

## 4. The shape of an undo — three options, one chosen

### Option A — per-command inverses (`Undo()` as declared)

Each command knows how to reverse itself. This is what the interface has always
implied.

**Rejected.** It is a second, hand-written copy of every command's rules, kept
in sync by hope. `SACBuildSettlement.Undo` would have to give back four
resources, free the vertex, restore `remainingSettlements` *and* recompute
longest road — and the moment `Execute` grows a line, the inverse silently
stops matching. 57 stubs is the evidence: nobody has ever managed to write
these, and the one that exists is for a command with a two-field payout. The
repo's own rule is that a second copy of logic is a defect.

### Option B — undo by replay

Drop the last command off `commandHistory` and rebuild `specificGameState` by
replaying the rest through `buildTimeline`'s engine.

**Rejected, though it is the tempting one.** Three costs, and the third is
fatal for the pilot:

1. `buildTimeline` returns *response-shaped* snapshots, not the mongo-shaped
   state a document can be saved from. Undo would need a new export of the
   internal state and a careful write-back through Mongoose's `Map` casting.
2. It only works for a game carrying `initialSpecificGameState` — `recapAvailable`
   in the response. Every game created before recap support would silently have
   no undo.
3. It rewrites history. `commandHistory` is append-only and everything
   downstream assumes it: the recap engine, the "your move" push body, the match
   review's per-command steps, and the `recordedFollowUpToId` correlation that
   stops a replay regenerating a follow-up it should be reading. Deleting an
   entry from it to serve a ten-second convenience is the wrong trade.

### Option C — a snapshot, restored by a command *(chosen)*

Exactly Solitaire's answer. An undoable command pushes a snapshot of the
mutable parts of `specificGameState` before it mutates them; `SACUndo` is an
ordinary command that pops one and assigns it back.

Everything falls out of that:

- **No engine changes for the undo itself.** No new route, no pipeline branch,
  no special case in `runCommand`. `SACUndo` is a move like any other: it goes
  through the existing route, gets its sender and timestamp stamped by the
  server, is checked against `COMMANDS_BY_GAME_TYPE`, lands on `commandHistory`,
  and writes a history line.
- **Replay is free.** Replaying the game re-pushes the same snapshots and
  re-pops them, so the match review reconstructs an undone turn exactly.
- **`commandHistory` stays append-only.** An undo is a thing that happened, not
  a thing that unhappened.
- **The log stays honest.** "{{u1}} built a settlement" then "{{u1}} took back
  their last move". No history surgery, and nothing an opponent could have seen
  is retracted behind their back.

The one thing it costs is bytes: a snapshot is a copy of the mutable state.
§7 bounds that.

### Which command can be undone — the anchor

A snapshot is only valid while nothing else has happened since it was taken.
Undoing a road placed *before* a Knight was played would restore player states
from before the Knight too, quietly reversing it.

Rather than making every non-undoable command remember to clear the stack — a
rule twelve `Execute`s would have to keep, and one would eventually forget —
the stack carries an **anchor**:

- `gs.undoAnchorId` is set to the command's own `id` every time a snapshot is
  pushed, and to `SACUndo`'s own `id` every time one is popped.
- `SACUndo.Execute` refuses unless `gs.undoAnchorId` equals the id of the last
  entry on `commandHistory`. Inside `Execute` the current command has not been
  recorded yet, so that entry is the previous move.

So a build followed immediately by an undo matches; a build followed by
anything else does not, forever, and the stale stack simply becomes
unreachable. Nothing has to be cleared, and a command added later cannot break
the invariant by omission — it breaks it by existing, which is the safe
direction.

## 5. The ten-second hold

Today a Settlements & Cities turn ends itself in two places:

| Where | How |
|---|---|
| Main phase, player can afford nothing | `sacFinishTurn` returns `followUpCommand = new SACEndTurn()`, which the pipeline runs straight away |
| Setup, road placed | `SACPlaceRoadSetup.Execute` returns `turnOver: true` |

Both have to wait when there is something to take back. The mechanism is one
deadline on the state and one extra branch on the command that already ends a
turn:

```
build/placement lands
  └─ is there a snapshot to undo?          no  → behave exactly as today
       yes
       └─ is the turn ready to end?        no  → no countdown; undo stays
            yes                                  available until the next action
            └─ set gs.autoEndTurnAt = now + UNDO_WINDOW_MS
               leave currentTurn where it is, run no follow-up
```

The client renders the countdown from `autoEndTurnAt` and, when it reaches
zero, submits an ordinary `SACEndTurn`. Three things make that safe:

- **`autoEndTurnAt` is the permission, not just the display.** `SACEndTurn`
  gains one branch: in the **setup** phase it is valid only while
  `autoEndTurnAt` is set and `pendingRoadSetup` is false. A client cannot forge
  that — it is server state written by the placement — so `SACEndTurn` still
  cannot be used to skip a setup placement. Its main-phase guards are unchanged,
  where it was already legal.
- **Undoing clears it.** `autoEndTurnAt` is part of the snapshot, so restoring
  the snapshot puts it back to `null` and the countdown vanishes from the board
  in the same response.
- **Nothing schedules anything.** There is no server-side timer, no `after()`
  sleeping ten seconds, no new cron branch. The deadline is a value; whoever
  next looks at the game acts on it.

### Why a manual "End turn" waits too

A turn that ends because its player could afford nothing is, today, byte-for-byte
identical to one they chose to end — `autoEndTurn.test.ts` exists to hold it
that way, because the difference is a statement about that player's hand.

A hold that applied only to the automatic ending would give that away again, in
a new channel: an `SACEndTurn` landing 10.0s after a build, every time, says the
game sent it. So **the window applies to the hand-off, not to how it was
triggered**: after an undoable command, tapping *End turn* starts the same
countdown client-side and sends the command when it closes. Both endings land at
the same offset and look the same to everyone else.

Ten seconds at the end of a turn in a game whose turn timers start at ten
minutes is not a cost worth optimising away, and "Pass now" is there for a
player who disagrees — available identically in both cases, which is what keeps
it from becoming the tell instead. §8 records what is left.

### Rejected: holding it server-side

Two alternatives were considered and dropped:

- **`after()` sleeping ten seconds and then re-reading and saving the game.**
  Doubles the function duration of every auto-ended turn, and a killed instance
  loses the hand-off with nothing watching.
- **A new cron branch that ends held turns.** The external scheduler runs about
  every fifteen minutes, so it would not be a ten-second hold; and the
  candidate filter (`actionableTurnFilter`) is built off the timer ladder on the
  base document, which a field on `specificGameState` cannot join. §9 shows the
  backstop we already have is enough.

## 6. What is undoable, and what enforces it

### The pilot's four

| Command | Undoable | Why |
|---|---|---|
| `SACPlaceSettlementSetup` | ✅ | Pure placement. In the second setup round it also grants starting resources, which the snapshot restores. |
| `SACPlaceRoadSetup` | ✅ | Pure placement; ends the setup turn, so it is the one that needs the hold. |
| `SACBuildSettlement` | ✅ | Spends four known resources on a known vertex. |
| `SACBuildRoad` | ✅ | Spends two known resources on a known edge. Also covers a free road from Road Building — `pendingRoadBuilding` is in the snapshot. |

### And what is not, with the reason in each case

| Command | Why not |
|---|---|
| `SACRollDice` | Randomness. Taking a roll back is re-rolling it. |
| `SACMoveRobber` | The steal is random, and the victim has already been told they were robbed. |
| `SACBuyDevCard` | The buyer has seen the top of the deck. Undo would be a free peek. |
| `SACPlayKnight` / `RoadBuilding` / `YearOfPlenty` / `Monopoly` | A played card is announced, Monopoly has already emptied other hands, and a Knight has a robber move behind it. Taking one back is a statement about a hidden hand. |
| `SACMaritimeTrade`, `SACBuildCity` | Neither is random and both could be added — deliberately held back so the pilot is the two placements that were asked for, and the shape gets one game's worth of play before it spreads. §14. |
| `SACEndTurn`, `SACUndo` | The hand-off itself, and undo itself. Neither is a move to reverse. |

### The enforcement

Two independent gates, because "the author remembered" is not one:

1. **Declared.** A command opts in with `readonly undoable = true`. Nothing is
   undoable by default.
2. **Proven.** `SACUndo.Execute` refuses if the command it would take back
   carries any own property whose name starts with `recorded` (other than
   `recordedFollowUpToId`). That is the same prefix `stripRecordedRandomness`
   already keys off, lifted into a shared `consumedRandomness(command)` in
   `src/utils/games/undo.ts` so the convention has one home. A command that
   grows a recorded field later stops being undoable the moment it runs,
   whatever its flag still says.

And a guard test (§13) plays every command that declares `undoable` and asserts
the executed instance carries no recorded fields — so gate 2 fails in CI rather
than in front of a player.

## 7. State and command surface

### `specificGameState` — three new fields, none of them sent

```ts
// SettlementsAndCities/board.ts — ISACSpecificGameState

/**
 * Snapshots of the mutable state, newest last, pushed by the undoable
 * commands (SACPlaceSettlementSetup, SACPlaceRoadSetup, SACBuildSettlement,
 * SACBuildRoad) before they mutate anything. Capped at UNDO_STACK_DEPTH;
 * the oldest is dropped, which only ever costs reach, never correctness.
 */
undoStack: ISACUndoSnapshot[];

/**
 * The id of the last command that pushed or popped a snapshot. SACUndo
 * refuses unless this matches the tail of commandHistory — which is how a
 * stack goes stale the moment anything else is played, without every other
 * command having to remember to clear it. See §4.
 */
undoAnchorId: string | null;

/**
 * When a turn that is ready to end is being held open so its player can
 * still take their last move back (§5). ISO. Null the rest of the time.
 * `autoEndTurnFor` is who it is being held for — read only by the response
 * builder, which sends the deadline to that player and to nobody else (§8),
 * exactly as lastRollAutoEndedBy already works.
 */
autoEndTurnAt: string | null;
autoEndTurnFor: string | null;
```

```ts
/**
 * Everything the four undoable commands can touch, and deliberately nothing
 * else. Excluded on purpose: hexes, harbors, expansions, victoryTarget and
 * randomTiles (immutable after setup); devCardDeck, lastRoll* and the robber
 * (only a random command moves them, and none of those is undoable — so
 * leaving them out is what stops an undo ever rewinding a roll); and
 * undoStack/undoAnchorId themselves.
 */
export interface ISACUndoSnapshot {
    senderId: string;          // whose move this was — the response reads it (§8)
    vertices: ISACVertex[];
    edges: ISACEdge[];
    playerStates: Map<string, ISACPlayerState>;
    longestRoadOwner: string | null;
    pendingRoadSetup: boolean;
    lastSetupSettlementVertex: number | null;
    pendingRoadBuilding: number;
    autoEndTurnAt: string | null;
    autoEndTurnFor: string | null;
}
```

**Size.** 54 vertices and 72 edges of two fields each, plus up to six player
states: three to five kilobytes of JSON per snapshot. `UNDO_STACK_DEPTH = 6`
bounds it at roughly 30 KB on a document that already carries a full
`commandHistory`, and it is emptied on every turn hand-off (there is nothing
left to undo once the turn has passed, and `CheckEndTurn` is the one place that
knows the turn passed). Two is the depth the game actually needs — a setup
settlement and its road — and six is room for a main-phase build run without
being a reason to think about it.

Whole arrays rather than "just the vertex that changed", for the reason Option
A was rejected: a targeted snapshot is a per-command inverse wearing a
different hat, and it drifts the same way. Solitaire copies its whole board
every move for the same reason.

### `apiModels.ts` — two new response fields

```ts
/** True when the viewer has a move of their own they can still take back. */
canUndo: boolean;
/**
 * When this viewer's turn will pass on its own unless they take their last
 * move back first (§5). ISO, or null. Only ever set for the player it is
 * being held for — see §8.
 */
autoEndTurnAt: string | null;
```

`undoStack`, `undoAnchorId` and `autoEndTurnFor` are not in
`ISACSpecificGameStateResponse` and never go out. `gameStateToResponse` builds
its return object field by field, so they are absent by construction rather
than by being deleted.

### The command

```ts
@serializable
export class SACUndo implements IGameCommand {
    readonly className = 'SACUndo';
    myString() { return 'took back their last move'; }
    // Execute:
    //   refuse unless gs.undoAnchorId === last commandHistory entry's id
    //   refuse unless the stack's top snapshot's senderId === this.senderId
    //   refuse if consumedRandomness(that last command)
    //   pop, assign every field back, set undoAnchorId = this.id
    //   history: playerHistory(this.senderId, 'took back their last move')
    //   → { validMove: true, turnOver: false }
}
```

One line in `COMMANDS_BY_GAME_TYPE` under `SettlementsAndCitiesGameType`, which
`serializableRegistry.test.ts` will demand anyway.

### `src/utils/games/undo.ts` — the shared half

Small on purpose. Only what is genuinely cross-game lives here; the snapshot
shape and the restore are the game's own, as Solitaire's are.

```ts
export const UNDO_WINDOW_MS = 10_000;           // §5, read by server and client
export const RECORDED_PREFIX = "recorded";      // moved here; gameCommand.ts imports it
export function consumedRandomness(command: unknown): boolean;
```

## 8. Hidden information

The croupier's questions, answered before they are asked.

- **The undo stack never leaves the server.** It is a copy of every player's
  resources and dev-card counts. It is absent from
  `ISACSpecificGameStateResponse`, and `publicGameState.test.ts` already holds
  the shared shape.
- **`canUndo` is the viewer's own.** Computed as
  `gs.undoStack.at(-1)?.senderId === viewerId`, so it answers "have *you* got
  something to take back" and is false for everyone else and for a viewerless
  replay. That it exists at all is not a leak — the move it would undo is a
  settlement or a road, which the whole table can see on the board.
- **`autoEndTurnAt` is redacted exactly like `lastRollAutoEnded`.** A held turn
  in the main phase is held because its player can afford nothing, which is
  precisely what `hideAutoEndedRoll` already keeps from the table. The response
  sends the deadline only when `autoEndTurnFor === viewerId`, and null
  otherwise — including for a viewerless recap snapshot, which counts as
  everybody else for the same reason the roll does.
- **The setup hold is not redacted, and does not need to be.** In setup the
  turn always ends after the road; there is no hand to infer. It is still sent
  only to its own player, because there is nothing for anyone else to do with
  it.
- **What is left, stated plainly.** An `SACEndTurn` that lands ten seconds after
  a build is, in the main phase, weak evidence that the game sent it — which is
  weak evidence about that player's hand. §5 closes it by giving the manual
  hand-off the same window and the same *Pass now* escape, so both endings have
  the same distribution of offsets and the same way out. What remains is that
  players who *did* hold something back tend to tap *Pass now* more often, which
  is a behavioural tell over many turns rather than a readable bit, and is not
  worth a second mechanism. **Flag this section to the croupier explicitly when
  PR 3 goes up** — it is the one place this feature moves information, and it
  should be somebody else's call whether the residue is acceptable.
- **The undone move stays in the log.** "built a settlement" then "took back
  their last move" — two lines, both true, in front of everybody. The
  alternative (deleting the first line) would mean an opponent who read the log
  during the ten seconds knows something the log now denies, which is worse than
  honest.

## 9. Robustness

The gremlin's questions.

- **The client dies during the countdown.** The turn stays with its player and
  `autoEndTurnAt` sits in the past. If they come back inside their turn timer,
  their board reads the past deadline and sends the `SACEndTurn` immediately —
  which is the normal path, one tick late. If they never come back, their
  ordinary turn timer expires and the cron's existing Settlements & Cities
  timeout adapter ends the turn (`if (gs.specialBuildActive) … ; if (!gs.hasRolled)
  … ; return new SACEndTurn()`). **The backstop is the one we already have, and
  it needs no change.** The cost is that a player who is away for their entire
  turn timer banks a missed turn — which is exactly what a player away for their
  entire turn timer should bank, held turn or not.
- **The undo and the auto-fired end turn race.** The board's countdown is
  derived from `gs.autoEndTurnAt` in the current game data, and an undo's
  response clears it, so the timer stops as part of the same state update.
  `useSubmitCommand`'s in-flight ref already refuses a second command while one
  is on the wire, so a tap at 9.9s and a fire at 10.0s cannot both leave the
  browser. The fire re-reads the deadline immediately before sending and stands
  down if it has gone. Worst case the end turn wins the race and the player
  loses their undo, which is the same outcome as tapping half a second later.
- **Two tabs.** Both can count down; the first `SACEndTurn` to arrive ends the
  turn and the second is refused ("Not your turn in this game"), which
  `useSubmitCommand` already answers by resyncing. A second `SACUndo` behind a
  first is refused by the anchor check, because the first one moved the anchor.
- **Optimistic concurrency.** `SACUndo` is an ordinary command saved through
  `trySave`, so a losing write is the existing 409 and refresh, not a silent
  overwrite.
- **Mongoose `Mixed` tracking.** `undoStack` and the restored state are inside
  `specificGameState`; the command route's existing `markModified` covers
  `gameState.commandHistory`, and Settlements & Cities' commands already rely
  on the document's own tracking of `specificGameState` — the restore assigns
  whole fields (`gs.vertices = snapshot.vertices`), which is top-level
  reassignment on a tracked path. The `playerStates` `Map` is the one to watch
  in review: snapshot it as a new `Map` of cloned player states, never as a
  reference to the live one, or the "snapshot" mutates along with the state it
  is supposed to remember. **This is the single likeliest bug in the whole
  feature** and it gets its own test (§13).
- **A game that has never seen this code.** Every new field is optional at the
  read site: `gs.undoStack ?? []`, `gs.undoAnchorId ?? null`,
  `gs.autoEndTurnAt ?? null`. An in-flight game simply has no undo until its
  next placement, and no migration is needed.

## 10. Turn recap & planning

- **Replay needs nothing.** `SACUndo` is on `commandHistory` like any other
  command; replaying it re-pops a snapshot that the same replay re-pushed. The
  hold changes nothing either: `autoEndTurnAt` is set and cleared by commands
  that replay in order.
- **One recap event.** `recap.ts`'s `toEvents` gets a `SACUndo` case emitting
  "took back a settlement"/"took back a road" (from what the snapshot restored),
  because without it a recap would show an opponent building something that is
  not on the board — the build's own event with nothing following it. Glyph
  `↩️`.
- **Planning is unaffected.** `plannableCommands` does not list any of the four,
  and does not gain `SACUndo`. A planned move is never saved, so there is
  nothing to take back.
- **`autoEndTurn.test.ts` still passes unchanged.** Its two games turn on a roll
  that leaves its player broke — `SACRollDice` pushes no snapshot, so there is
  nothing to undo, so the follow-up fires immediately exactly as it does today.
  That the existing invariant test is untouched by PR 3 is the main evidence
  the hold is narrow.

## 11. UI surface

Everything goes through pieces that already exist, and one new shared primitive
that is new because there are two callers for it by the end of PR 4.

- **`src/components/ui/UndoBar.tsx`** *(new)* — the strip that sits under the
  board while an undo is live: an `ActionButton` for **Undo**, and, when a
  deadline is passed in, the countdown line and a **Pass now** button beside it.
  It reads `useNow` rather than owning a ticker, takes
  `deadline: string | null` and fires `onExpire` once when it passes. It draws
  with existing `ag-*` classes (`ag-actionsheet`, `ag-build-row`) and adds no
  new ones beyond one modifier for the countdown's emphasis.
  Solitaire's board adopts it in PR 4 for its own undo button — which is the
  point at which it is a shared component rather than a speculative one.
- **The Settlements & Cities board screen** renders it from
  `gs.canUndo` / `gs.autoEndTurnAt` and submits through the `submitCommand` it
  already has. No new hook: the countdown is a deadline plus `useNow`, and the
  submit is the one every other button on that screen uses.
- **A manual *End turn* after an undoable move** sets a local deadline of
  `Date.now() + UNDO_WINDOW_MS` and shows the same bar (§5), rather than
  sending straight away.
- **Nothing off-turn.** Off-turn the board is already inert behind
  `ReadOnlyPanel`, and `canUndo` is false for a viewer who is not the mover.

## 12. The PRs

Each leaves `npm run build`, `npx tsc --noEmit`, `npm run lint` and `npm test`
green and is reviewable on its own. The bulleted lines inside each PR are its
commits. Reviewers named per PR are the crew in `AGENTS.md`.

---

### PR 1 — Stop pretending commands can undo themselves

Pure deletion plus one small shared module. No behaviour change, and the
diff is strongly negative. *Review: caveman.*

- **`Remove Undo from the command contract`** — drop
  `Undo: (gameData: IGameData) => void` from `IGameCommand`
  (`src/utils/apiModels/gameCommand.ts`) and delete all 57 stub
  implementations across the eleven `<Game>Logic.ts` files and the three test
  doubles (`commandPipeline.test.ts`, `turnTimeout.test.ts`,
  `replay.test.ts`). Every one of them either logs "not implemented yet" or
  pops `commandHistory`, which is not an undo and would corrupt the replay
  log. Nothing calls them.
- **`Keep Dice Cities' one real inverse where it belongs`** — the single
  exception, `DiceCitiesRequestDiceRoll.Undo` (`DiceCitiesLogic.ts:175`), is
  genuinely used by the re-roll path. It stays, renamed
  `undoPayout(gameData)` and no longer claiming to implement an interface
  member, with its call site at the re-roll updated and its existing test
  (`DiceCitiesLogic.test.ts:440`) following it. The stray
  `commandHistory.pop()` inside it goes: the re-roll's caller does not want
  the roll unrecorded, and nothing else did either.
- **`Say what "non-random" means in one place`** — add
  `src/utils/games/undo.ts` with `UNDO_WINDOW_MS`, the `recorded` prefix moved
  out of `gameCommand.ts` (which now imports it, so `stripRecordedRandomness`
  and the undo gate cannot disagree), and `consumedRandomness(command)`. Unit
  tests: a command carrying `recordedRoll1` is randomness, one carrying only
  `recordedFollowUpToId` is not, a plain command is not.

---

### PR 2 — Settlements & Cities can take a placement back

Server-side undo, no hold yet. After this PR the four placements are undoable
whenever the turn is plainly still yours, which is every case except the one
that ends the turn — so the feature is real and testable before §5 lands.
*Review: caveman, croupier.*

- **`Snapshot what a placement changes`** — `ISACUndoSnapshot` in `board.ts`,
  `undoStack` / `undoAnchorId` on `ISACSpecificGameState` and the Mongoose
  sub-schema, seeded in `buildInitialSettlementsAndCitiesState` and in
  `testFixtures.ts`'s `makeState`. A `sacPushUndo(gs, command)` helper in
  `SettlementsAndCitiesLogic.ts` that deep-copies vertices, edges and the
  `playerStates` map — cloned entries, never references — and sets the anchor.
- **`Push a snapshot before each of the four placements`** —
  `readonly undoable = true` and one `sacPushUndo` call at the top of
  `SACPlaceSettlementSetup`, `SACPlaceRoadSetup`, `SACBuildSettlement` and
  `SACBuildRoad`, after their validation and before their first mutation.
- **`Add the SACUndo command`** — the class of §7, plus its line in
  `COMMANDS_BY_GAME_TYPE`. `serializableRegistry.test.ts` fails without it.
- **`Tell the player they can undo, and nobody else`** — `canUndo` on
  `ISACSpecificGameStateResponse` and `gameStateToResponse`, scoped by the top
  snapshot's `senderId`; nothing else added to the response.
- **`Test the undo`** — `undo.test.ts` beside `autoEndTurn.test.ts`: the six
  cases in §13's first block.

---

### PR 3 — Hold a turn that is about to end

The §5 hold. *Review: caveman, croupier, gremlin.*

- **`Hold the hand-off while there is something to take back`** —
  `autoEndTurnAt` / `autoEndTurnFor` on the state and the sub-schema, added to
  `ISACUndoSnapshot`, and cleared in `sacAdvanceMainTurn` /
  `sacAdvanceSetup` along with the rest of the turn. `sacFinishTurn` sets the
  deadline and returns no follow-up when `gs.undoStack.length > 0`; when the
  stack is empty it returns the follow-up exactly as it does today.
- **`End a setup turn with the command that ends every other turn`** —
  `SACPlaceRoadSetup` returns `turnOver: false` and sets the deadline (via the
  same `sacFinishTurn`, whose setup guard is lifted for this one case);
  `SACEndTurn` gains its setup branch, valid only while `autoEndTurnAt` is set
  and `pendingRoadSetup` is false, writing "finished placing" rather than
  "ended their turn". `CheckEndTurn`'s existing setup branch already does the
  right thing from there.
- **`Send the deadline to the player it is being held for`** —
  `autoEndTurnAt` on the response, gated on `autoEndTurnFor === viewerId` in
  the shape of `hideAutoEndedRoll`, with that function's comment extended to
  cover both.
- **`Test the hold`** — §13's second block, including the assertion that
  `autoEndTurn.test.ts` is untouched.

---

### PR 4 — The board shows it

*Review: caveman, rulebook.*

- **`Add the undo bar`** — `src/components/ui/UndoBar.tsx` per §11, and port
  Solitaire's own undo button onto it in the same commit. If writing it proves
  the two are different components wearing one hat, keep them apart and say so
  in the commit message.
- **`Wire it into the Settlements & Cities board`** — render from
  `gs.canUndo` / `gs.autoEndTurnAt`, submit `SACUndo` through the existing
  `submitCommand`, fire `SACEndTurn` on expiry after re-reading the deadline,
  and route a manual *End turn* through the same bar when there is a snapshot
  to keep.
- **`Recap reads an undo`** — the `SACUndo` case in `recap.ts`'s `toEvents`
  and its test in `recap.test.ts`.

---

### PR 5 — Say so

*Review: rulebook.*

- **`Document undo`** — this file moved from plan to description (present
  tense, the rejected options kept as the record of why), plus the
  `ARCHITECTURE.md` §6 paragraph pointing at it and the `AGENTS.md` line under
  the shared-components inventory for `UndoBar`.
- **`Tell players`** — one line in the **Enhancements** group of
  `src/utils/ui/whatsNew.ts`, `game: "settlementsandcities"`, newest first,
  dropping the oldest if the group runs past ten. One line for the branch, as
  AGENTS.md requires — the hold and the undo are one player-visible change, and
  the wording covers both:

  > **title:** "Take it back"
  > **detail:** "Placed a settlement or a road you didn't mean to in
  > Settlements & Cities? Tap Undo and put it where you meant. And if that was
  > the last thing you could do, your turn now waits ten seconds before it
  > passes, so you get the chance."

- **`Mention it in the guide`** — one clause in the Settlements & Cities
  `guide.ts` "Your turn" section.

## 13. Testing

**PR 2 — `src/games/SettlementsAndCities/undo.test.ts`**

1. A setup settlement is placed and undone: the vertex is empty again,
   `remainingSettlements` is back, and in the second setup round the starting
   resources are back too.
2. Undo twice in setup: road, then settlement, both restored — the depth the
   game actually needs.
3. **The snapshot is a copy, not a view.** Place a settlement, mutate
   `gs.playerStates` afterwards, undo, and assert the restored player state
   carries the pre-placement values. This is the §9 `Map`-aliasing bug, and
   this test is the only thing between it and production.
4. Undo is refused after something else has happened: build a road, play a
   Knight, undo → `validMove: false`, board unchanged. (The anchor.)
5. Undo is refused for a player who is not the mover, and after their turn has
   passed.
6. A roll cannot be undone: `SACRollDice` pushes no snapshot, and a hand-built
   `SACUndo` straight after a roll is refused.
7. A full turn plays and replays byte-for-byte with an undo in the middle of
   it — `buildTimeline` over the real `commandHistory`, in the shape
   `autoEndTurn.test.ts` already uses.

**PR 3 — the hold**

8. A build that leaves its player with nothing sets `autoEndTurnAt` and does
   *not* pass the turn; the follow-up `SACEndTurn` is not on `commandHistory`.
9. Undoing that build clears `autoEndTurnAt` and the turn is still theirs.
10. A *roll* that leaves its player with nothing still ends the turn
    immediately, with no deadline — `autoEndTurn.test.ts` unchanged and green,
    which is the assertion that matters most in this PR.
11. Setup: the road sets the deadline; `SACEndTurn` is accepted in setup only
    while it is set, refused before the settlement is placed and refused after
    the turn has passed; `setupStep` advances exactly once.
12. `gameStateToResponse` sends `autoEndTurnAt` to the held player and `null`
    to everyone else and to a viewerless replay — beside the existing
    `hideAutoEndedRoll` cases in `SettlementsAndCitiesModels.test.ts`.
13. The turn-timer adapter still resolves a held turn:
    `turnTimeout.test.ts` gains a game left with `autoEndTurnAt` in the past
    and asserts `resolveStalledTurn` returns `'advanced'`.

**PR 4** — the countdown is a pure deadline-to-label function tested directly;
the bar itself is rendered through `react-dom/server` in the house client-hook
style if it grows any logic worth asserting on, and otherwise is not tested.

## 14. What this does not reach

- **Other Settlements & Cities commands.** `SACBuildCity` and
  `SACMaritimeTrade` are both non-random and both one line each once the shape
  has had a game's worth of play: `readonly undoable = true` and a
  `sacPushUndo` call. Deliberately not in the pilot.
- **Other games.** Nothing here is wired into any other game. Train Time's
  route claims, World Domination's deployments and Outbreak's actions are all
  plausible candidates; each needs its own snapshot shape and its own answer to
  §6, and none of them needs the engine to change again.
- **Redo.** No.
- **Undoing across a turn boundary.** Never: once the hand-off has happened the
  next player has been told, and may have opened the board.
- **A configurable window.** Ten seconds is a constant. If it wants to become a
  setting, it becomes one after somebody has played with ten.

## 15. Definition of done

- The four placements can be taken back, and the two that end a turn hold it
  for ten seconds first, with a countdown and a *Pass now* on screen.
- A roll, a robber move, a dev card and a trade cannot be taken back, and a
  turn ending on one of them behaves exactly as it does today —
  `autoEndTurn.test.ts` passing unchanged is the proof.
- The undo stack, the anchor and who a held turn is held for never leave the
  server, and a held deadline reaches only the player it belongs to.
- A match with an undo in it replays byte-for-byte in the match review.
- A player whose browser dies mid-countdown loses nothing but the ten seconds;
  the existing turn-timer adapter finishes the turn with no cron changes.
- `IGameCommand` no longer declares a method that 57 classes pretend to
  implement.
- `npm run build`, `npx tsc --noEmit`, `npm run lint` and `npm test` are green,
  and the What's new note is one line.
