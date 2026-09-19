# Undo

How a player takes back a move they've just made, and the ten-second hold on
the turn hand-off that makes taking it back possible at all.

**Status: built, piloted on Settlements & Cities.** All five of §12's PRs are
in — the dead `Undo` interface removed, the snapshot-and-restore engine work,
the hold, the board's Undo button and countdown, and this documentation. The
pilot is **placing settlements and roads** — all four of them: the two setup
placements and the two main-phase builds. Every other game, and every other
Settlements & Cities command, is out of scope here and gains nothing until
someone opts it in a line at a time (§14, §16).

So everything below now describes code rather than a plan, and the design
reasoning — §4's rejected options, §5's rejected server-side holds — is kept
because it is the reasoning the code is shaped by: the day a snapshot-per-command
stack looks like the wrong call, this is where to read why it was the call.

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
16. [When this becomes an abstraction](#16-when-this-becomes-an-abstraction)

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

- *"only on non-random actions"* — §6. It is enforced by a machine-checked
  invariant, not by each game remembering.
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
  the same replay. Everything below is that shape, applied to a game with
  opponents. What is *not* built is a shared undo abstraction over the two:
  the pattern repeats, the code doesn't (§4).
- **Settlements & Cities already has a whole-state deep cloner.**
  `cloneSACState(gs, userIdList)` (`SettlementsAndCitiesModels.ts:108`) copies
  an entire `ISACSpecificGameState` into independent plain objects, rebuilding
  the `playerStates` `Map` in `userIdList` order via `clonePlayerStates` —
  ordering replay already depends on. It is what seeds
  `initialSpecificGameState` and the replay engine's starting state, so its
  round trip through Mongoose is already proven in production. §7 uses it
  unchanged as the snapshot.
- **`ICommandOutcome.followUpCommand`** (`src/utils/apiModels/gameCommand.ts`)
  is how Settlements & Cities already ends a turn on the player's behalf. The
  hold in §5 is a change to *whether* that follow-up is returned, and needs no
  new field on the outcome and no branch in `commandPipeline.ts`.
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
- **`useNow`** is the shared per-second ticker every live readout already reads
  from, and `formatRemainingUntil(deadline, now)`
  (`src/utils/games/TurnTimer.ts:216`) is already the deadline-shaped formatter
  beside it — minute-coarse, so §11 adds one seconds-resolution sibling next to
  it rather than a component.
- **`ag-actionsheet`, `ActionButton` and `ag-hint`** are the band, the button
  and the small print that every game's action panel is already built from.

## 3. What the engine does not give us yet

- **`IGameCommand.Undo` is a trap, not a feature.** The interface declares
  `Undo(gameData: IGameData): void` and **59** command classes implement it,
  plus three test doubles. **Two** of them do anything, both in Dice Cities and
  both calling `undoRollPayout` for the re-roll path. The other 57 are
  `console.error("Command Undo not implemented yet")`, an empty body, or — worse
  — a bare `gameData.gameState.commandHistory.pop()`, which is not an undo of
  anything and would corrupt the replay log if it ever ran. A feature called
  undo must not be built next to a method called Undo that means neither. PR 1
  removes the member from the interface and the 57 stubs with it, and leaves
  Dice Cities' two real inverses as what they always were: a private detail of
  that game's re-roll.
- **No shared statement of the window.** Ten seconds has to be one constant
  that the server stamps a deadline with and the client counts down to.
- **No seconds-resolution countdown label.** Every formatter in `TurnTimer.ts`
  is minute-coarse, because until now nothing on screen counted in seconds.

Nothing else. In particular the engine needs **no** new `ICommandOutcome` field
and **no** change to `commandPipeline.ts`: the hold is expressed by a game
declining to return a follow-up it would otherwise have returned, which the
pipeline already handles as the ordinary case.

## 4. The shape of an undo — three options, one chosen

### Option A — per-command inverses (`Undo()` as declared)

Each command knows how to reverse itself. This is what the interface has always
implied.

**Rejected.** It is a second, hand-written copy of every command's rules, kept
in sync by hope. `SACBuildSettlement.Undo` would have to give back four
resources, free the vertex, restore `remainingSettlements` *and* recompute
longest road — and the moment `Execute` grows a line, the inverse silently
stops matching. 57 stubs is the evidence: nobody has ever managed to write
these, and the two that exist are for commands with a two-field payout. The
repo's own rule is that a second copy of logic is a defect.

### Option B — undo by replay

Drop the last command off `commandHistory` and rebuild `specificGameState` by
replaying the rest through `buildTimeline`'s engine.

**Rejected, though it is the tempting one.** Three costs, and the third is
fatal:

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

Exactly Solitaire's answer, and — because Settlements & Cities already owns a
whole-state cloner — with less new code than Solitaire needed.

- **No engine changes for the undo itself.** No new route, no pipeline branch,
  no new outcome field. `SACUndo` is a move like any other: it goes through the
  existing route, gets its sender and timestamp stamped by the server, is
  checked against `COMMANDS_BY_GAME_TYPE`, lands on `commandHistory`, and
  writes a history line.
- **No new snapshot type, and no include/exclude list to maintain.** The
  snapshot *is* `cloneSACState(gs, userIdList)`. A field added to
  `ISACSpecificGameState` later is restored by default, and TypeScript makes the
  cloner the one place that has to be told about it — omission fails the
  compiler rather than failing a player. A hand-picked field list would be
  Option A's drift wearing a different hat.
- **Replay is free.** Replaying the game re-pushes the same snapshots and
  re-pops them, so the match review reconstructs an undone turn exactly.
- **`commandHistory` stays append-only.** An undo is a thing that happened, not
  a thing that unhappened.
- **The log stays honest.** "{{u1}} built a settlement" then "{{u1}} took back
  their last move". No history surgery, and nothing an opponent could have seen
  is retracted behind their back.

**Why not extract a shared undo helper with Solitaire.** The two games' pushes,
pops, snapshot shapes and `canUndo` are all game-shaped; the only lines that are
genuinely identical are `markDirty` (§9) and a two-line push/pop, and a generic
`undoStack<T>` wrapper over those would be an abstraction with no behaviour in
it. This is the case AGENTS.md's "a second copy is the signal to extract the
first one" is *not* about: the pattern repeats, the code doesn't.

Solitaire is not the second copy. The second *multiplayer* game is, and §16 says
what that one should trigger — because at the five or six games that plausibly
want undo, a real abstraction does appear, and it isn't this one.

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

The anchor also does most of §6's work for it: an undo can only ever reach the
command directly behind it, and only a command that pushed a snapshot ever sets
the anchor. That is why the undoability rule below is one declaration plus one
CI guard, and not a runtime inspection of the command being undone.

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
               return no followUpCommand; leave currentTurn where it is
```

The client renders the countdown from `autoEndTurnAt` and, when it reaches
zero, submits an ordinary `SACEndTurn`. Three things make that safe:

- **`autoEndTurnAt` is the permission, not just the display.** `SACEndTurn`
  gains one branch: in the **setup** phase it is valid only while
  `autoEndTurnAt` is set and `pendingRoadSetup` is false. A client cannot forge
  that — it is server state written by the placement — so `SACEndTurn` still
  cannot be used to skip a setup placement. Its main-phase guards are unchanged,
  where it was already legal.
- **Undoing clears it.** `autoEndTurnAt` is part of the cloned state, so
  restoring a snapshot puts it back to `null` and the countdown vanishes from
  the board in the same response.
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
| `SACBuildRoad` | ✅ | Spends two known resources on a known edge. Also covers a free road from Road Building — `pendingRoadBuilding` is restored with the rest of the state. |

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

- **Declared.** A command opts in with `readonly undoable = true` and a
  `sacPushUndo` call. Nothing is undoable by default.
- **Proven in CI.** A guard test (§13) plays every command that declares
  `undoable` and asserts the executed instance carries no own property whose
  name starts with `recorded` — the same prefix `stripRecordedRandomness`
  already keys off, exposed as `consumedRandomness(command)` beside it in
  `gameCommand.ts`. A command that grows a recorded field later fails the build
  the moment it does.

There is deliberately **no runtime check** on the command being undone. The
anchor (§4) means an undo can only reach the command immediately behind it, and
only a snapshot-pushing command ever sets the anchor — so a runtime gate could
only fire for a command that both pushes a snapshot *and* consumes randomness,
which is exactly what the CI guard catches before it ships. Adding it anyway
would be a third declaration of one fact, and would mean rehydrating the tail of
`commandHistory` inside `Execute` — the
`deserializeJSON(JSON.stringify(lastCommand))` dance Dice Cities already needs
for its own reasons, bought for nothing.

## 7. State and command surface

### `specificGameState` — three new fields, none of them sent

```ts
// SettlementsAndCities/board.ts — ISACSpecificGameState

/**
 * Snapshots of the whole state, newest last, pushed by the undoable commands
 * (SACPlaceSettlementSetup, SACPlaceRoadSetup, SACBuildSettlement,
 * SACBuildRoad) before they mutate anything. `by` is whose move it was — the
 * response builder reads it to decide who may be told about an undo (§8).
 * Capped at UNDO_STACK_DEPTH; the oldest is dropped, which only ever costs
 * reach, never correctness.
 */
undoStack: { by: string, state: ISACSpecificGameState }[];

/**
 * The id of the last command that pushed or popped a snapshot. SACUndo
 * refuses unless this matches the tail of commandHistory — which is how a
 * stack goes stale the moment anything else is played, without every other
 * command having to remember to clear it. See §4.
 */
undoAnchorId: string | null;

/**
 * When a turn that is ready to end is being held open so its player can
 * still take their last move back (§5). ISO. Null the rest of the time, and
 * cleared with the rest of the turn in sacAdvanceMainTurn/sacAdvanceSetup.
 */
autoEndTurnAt: string | null;
```

### The snapshot is `cloneSACState`

No new interface. `sacPushUndo(sacData, command)` is:

```ts
gs.undoStack.push({ by: command.senderId, state: cloneSACState(gs, sacData.userIdList) });
if (gs.undoStack.length > UNDO_STACK_DEPTH) gs.undoStack.shift();
gs.undoAnchorId = command.id;
```

and the restore is:

```ts
const entry = gs.undoStack.pop()!;
const { undoStack: _s, undoAnchorId: _a, ...restored } = entry.state;
Object.assign(gs, restored);
gs.undoAnchorId = this.id;
```

`cloneSACState` gains three lines for the new fields — `undoStack: []`,
`undoAnchorId: null` (so a snapshot never nests a stack) and
`autoEndTurnAt: gs.autoEndTurnAt ?? null` (so restoring one clears the
countdown). Nothing else about it changes, and every existing caller
— `CreateGame`'s `initialSpecificGameState`, the replay adapter's seed —
keeps working.

Cloning the *whole* state rather than the parts a placement touches is
deliberate and is the opposite of a worry: the anchor means only the command
directly behind you can be undone, and no random command ever pushes a
snapshot, so `devCardDeck`, `lastRoll*` and the robber are byte-identical
between the snapshot and now — restoring them is a no-op, and *not* restoring
them is a hand-maintained list that silently stops covering a field somebody
adds next year.

**Size and depth.** A cloned state is six to eight kilobytes of JSON.
`UNDO_STACK_DEPTH = 2` — a setup settlement and its road is the depth the game
actually needs, and it covers a two-build main-phase run as well. It costs one
character to raise when somebody hits the wall, and bytes on every save until
then. The stack is emptied on every turn hand-off, in the two places that
already know the turn passed.

### `apiModels.ts` — two new response fields

```ts
/** True when the viewer has a move of their own they can still take back. */
canUndo: boolean;
/**
 * When this viewer's turn will pass on its own unless they take their last
 * move back first (§5). ISO, or null. Only ever sent to the player it is
 * being held for — see §8.
 */
autoEndTurnAt: string | null;
```

`undoStack` and `undoAnchorId` are not in `ISACSpecificGameStateResponse` and
never go out. `gameStateToResponse` builds its return object field by field, so
they are absent by construction rather than by being deleted.

### The command

```ts
@serializable
export class SACUndo implements IGameCommand {
    readonly className = 'SACUndo';
    myString() { return 'took back their last move'; }
    // Execute:
    //   refuse unless gs.undoAnchorId === last commandHistory entry's id
    //   refuse unless gs.undoStack.at(-1)?.by === this.senderId
    //   pop, Object.assign the restored state back, set undoAnchorId = this.id
    //   history: playerHistory(this.senderId, 'took back their last move')
    //   → { validMove: true, turnOver: false }
}
```

One line in `COMMANDS_BY_GAME_TYPE` under `SettlementsAndCitiesGameType`, which
`serializableRegistry.test.ts` will demand anyway.

### Where the two shared pieces go

No new module. Each lands beside the thing it belongs to:

- `consumedRandomness(command)` and the `recorded` prefix it shares with
  `stripRecordedRandomness` go in `src/utils/apiModels/gameCommand.ts`, which
  is where that convention already lives and is documented at length. A
  game-utils file exporting the engine's own convention back to the engine
  would be an inverted dependency invented to make a thin file look populated.
- `UNDO_WINDOW_MS` goes in `src/games/SettlementsAndCities/board.ts`, which is
  already the file both the server rules and the client screens import this
  game's constants from (`NO_RESOURCES`, `SAC_RESOURCES`). It moves somewhere
  shared when a second game opts in — extract on the second use, not the first.

## 8. Hidden information

The croupier's questions, answered before they are asked.

- **The undo stack never leaves the server.** It is a copy of every player's
  resources, dev cards and the remaining deck. It is absent from
  `ISACSpecificGameStateResponse`, and `publicGameState.test.ts` already holds
  the shared shape.
- **`canUndo` is the viewer's own.** Computed as
  `gs.undoStack.at(-1)?.by === viewerId`, so it answers "have *you* got
  something to take back" and is false for everyone else and for a viewerless
  replay. That it exists at all is not a leak — the move it would undo is a
  settlement or a road, which the whole table can see on the board.
- **`autoEndTurnAt` is redacted the same way**, and by the same expression: it
  is sent only when `gs.undoStack.at(-1)?.by === viewerId`, and null otherwise,
  including for a viewerless recap snapshot. A held turn in the main phase is
  held because its player can afford nothing, which is precisely what
  `hideAutoEndedRoll` already keeps from the table.

  Keyed off the stack's owner rather than off `currentTurn` — which would be
  the more obvious reading, since the two are equal whenever a hold exists —
  because `gameStateToResponse(gs, userIdNameMap, viewerId)` and
  `IReplayAdapter.toResponseState` are handed the state and the viewer and
  nothing else. Widening both signatures to carry `currentTurn` through every
  game would be a much bigger change than reusing the expression `canUndo`
  needs anyway, and it is also why there is no separate `autoEndTurnFor` field:
  the stack already records who.
- **The setup hold is not sensitive, and is redacted anyway.** In setup the
  turn always ends after the road; there is no hand to infer. It is still sent
  only to its own player, because there is nothing for anyone else to do with
  it and one rule is easier to keep than two.
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
- **The snapshot must be a copy, not a view.** This is the bug a hand-written
  snapshot invites — a `playerStates` `Map` stored by reference "remembers"
  whatever the command then does to it — and reusing `cloneSACState` is what
  retires it: `clonePlayerStates` already rebuilds the map with cloned entries
  and already has its own test. §13 keeps a regression test anyway, because the
  day someone "optimises" the clone away is the day it comes back.
- **Mongoose `Mixed` tracking.** `undoStack` is an array inside
  `specificGameState` (Solitaire declares its own as `Schema.Types.Mixed`), and
  the restore assigns whole fields onto a tracked path. Whether Settlements &
  Cities needs an explicit `markModified('specificGameState')` for either is the
  one thing to establish before PR 2 lands rather than after — the only
  `markModified` on the write path today is `gameState.commandHistory` in the
  command route. **If it does need one, that is the fourth copy of the identical
  three-line `markDirty` helper** (`FiresOutLogic.ts:62`,
  `TrainTimeLogic.ts:44`, `SolitaireLogic.ts:60`) and therefore the moment to
  lift it into `src/utils/games/`, porting the three onto it — not the moment to
  paste it again.
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
  "took back a settlement"/"took back a road" (from what the restore put back),
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

No new component. The pieces already exist, and the only genuinely new code is
a five-line pure formatter.

- **`secondsUntil(deadline, now)`** *(new)* in
  `src/utils/games/TurnTimer.ts`, beside `formatRemainingUntil` and
  `formatRemainingTimeShort`. Every formatter in that file is minute-coarse
  ("less than a minute"), because until now nothing on screen counted in
  seconds; this is the sibling that does. Null before hydration, like the rest,
  fed by `useNow()` — the per-second ticker, where the others take
  `useNowToTheMinute()`.
- **The undo bar is the action panel it already sits in.**
  `SettlementsAndCitiesActions.tsx` already owns the `ag-actionsheet` band and
  the End-turn `ActionButton` at its foot. Undo is another `ActionButton`
  (`ag-btn ag-btn--light`, the same skin Solitaire's undo wears), the countdown
  is a `<p className="ag-hint">`, and *Pass now* is the End-turn button it
  already renders under a different label. No new file, no new `ag-*` class.
- **Solitaire's undo button stays where it is.** It is three lines of
  `ActionButton` in a flex row with Draw and Hint, with no deadline, no
  countdown and no hand-off — a solo game has none. Building a shared bar around
  a deadline and then porting Solitaire onto it would mean a component growing a
  second mode for a caller that exists only to make it shared. If the two ever
  converge, they converge later, on evidence.
- **The board screen** renders from `gs.canUndo` / `gs.autoEndTurnAt` and
  submits through the `submitCommand` it already has. No new hook: the countdown
  is a deadline plus `useNow`, and the submit is the one every other button on
  that screen uses.
- **A manual *End turn* after an undoable move** sets a local deadline of
  `Date.now() + UNDO_WINDOW_MS` and shows the same two controls (§5), rather
  than sending straight away.
- **Nothing off-turn.** Off-turn the panel is already inert behind
  `ReadOnlyPanel`, and `canUndo` is false for a viewer who is not the mover.

## 12. The PRs

Each leaves `npm run build`, `npx tsc --noEmit`, `npm run lint` and `npm test`
green and is reviewable on its own. The bulleted lines inside each PR are its
commits. Reviewers named per PR are the crew in `AGENTS.md`.

---

### PR 1 — Stop pretending commands can undo themselves

Deletion plus one predicate. Strongly negative diff, no behaviour change.
*Review: caveman.*

- **`Remove Undo from the command contract`** — drop
  `Undo: (gameData: IGameData) => void` from `IGameCommand`
  (`src/utils/apiModels/gameCommand.ts:63`) and delete the 57 stub
  implementations across the eleven `<Game>Logic.ts` files and the three test
  doubles (`commandPipeline.test.ts:41`, `turnTimeout.test.ts:37`,
  `replay.test.ts:73`). Every one of them either logs "not implemented yet",
  has an empty body, or pops `commandHistory` — which is not an undo and would
  corrupt the replay log. `grep "\.Undo("` across `src/` finds one call site,
  and it is Dice Cities' own, below.
- **`Keep Dice Cities' two real inverses where they belong`** — the exceptions
  are `DiceCitiesRequestDiceRoll.Undo` (`DiceCitiesLogic.ts:175`) and
  `DiceCitiesRequestHarbourBonus.Undo` (`:483`), both genuinely used by the
  re-roll path, dispatched polymorphically through `isRollPayoutCommand` /
  `RollPayoutCommand` from the single call site at `:842`. Both are renamed
  `undoPayout(gameData)` and stop claiming to implement an interface member;
  the union, the narrowing helper and the call site are untouched, and the
  existing test at `DiceCitiesLogic.test.ts:440` follows the rename.

  **Both bodies stay byte-identical.** The dice-roll one pops `commandHistory`
  and the harbour one deliberately does not — the comment at `:484` says why
  ("the log needs this entry to replay the turn"). That asymmetry is load-bearing
  for replay, so it is not tidied up inside a PR advertised as pure deletion.
- **`Say what "non-random" means in one place`** — `consumedRandomness(command)`
  and the `recorded` prefix it shares with `stripRecordedRandomness`, in
  `gameCommand.ts` beside them. Unit tests: a command carrying `recordedRoll1`
  is randomness, one carrying only `recordedFollowUpToId` is not, a plain
  command is not.

---

### PR 2 — Settlements & Cities can take a placement back

Server-side undo, no hold yet. After this PR the four placements are undoable
whenever the turn is plainly still yours, which is every case except the one
that ends the turn — so the feature is real and testable before §5 lands.
*Review: caveman, croupier, gremlin.*

- **`Snapshot the state with the cloner that already exists`** — `undoStack` /
  `undoAnchorId` on `ISACSpecificGameState` and the Mongoose sub-schema, seeded
  in `buildInitialSettlementsAndCitiesState` and in `testFixtures.ts`'s
  `makeState`; `undoStack: []` and `undoAnchorId: null` added to
  `cloneSACState`'s literal so a snapshot never nests a stack; `UNDO_WINDOW_MS`
  and `UNDO_STACK_DEPTH` in `board.ts`; and `sacPushUndo` / the restore of §7.
  This is the commit that establishes whether `markModified('specificGameState')`
  is needed — see §9, including what to do if it is.
- **`Push a snapshot before each of the four placements`** —
  `readonly undoable = true` and one `sacPushUndo` call at the top of
  `SACPlaceSettlementSetup`, `SACPlaceRoadSetup`, `SACBuildSettlement` and
  `SACBuildRoad`, after their validation and before their first mutation.
- **`Add the SACUndo command`** — the class of §7, plus its line in
  `COMMANDS_BY_GAME_TYPE`. `serializableRegistry.test.ts` fails without it.
- **`Tell the player they can undo, and nobody else`** — `canUndo` on
  `ISACSpecificGameStateResponse` and `gameStateToResponse`, scoped by the top
  entry's `by`; nothing else added to the response.
- **`Test the undo`** — `undo.test.ts` beside `autoEndTurn.test.ts`: §13's
  first block, plus the CI guard that no command declaring `undoable` executes
  into a `recorded` field.

---

### PR 3 — Hold a turn that is about to end

The §5 hold. *Review: caveman, croupier, gremlin.*

- **`Hold the hand-off while there is something to take back`** —
  `autoEndTurnAt` on the state, the sub-schema and `cloneSACState`, cleared in
  `sacAdvanceMainTurn` / `sacAdvanceSetup` along with the undo stack and the
  rest of the turn. `sacFinishTurn` sets the deadline and returns no follow-up
  when `gs.undoStack.length > 0`; when the stack is empty it returns the
  follow-up exactly as it does today. No change to `ICommandOutcome` and none
  to `commandPipeline.ts`.
- **`End a setup turn with the command that ends every other turn`** —
  `SACPlaceRoadSetup` returns `turnOver: false` and sets the deadline (via the
  same `sacFinishTurn`, whose setup guard is lifted for this one case);
  `SACEndTurn` gains its setup branch, valid only while `autoEndTurnAt` is set
  and `pendingRoadSetup` is false, writing "finished placing" rather than
  "ended their turn". `CheckEndTurn`'s existing setup branch already does the
  right thing from there.
- **`Send the deadline to the player it is being held for`** —
  `autoEndTurnAt` on the response, gated on the same
  `gs.undoStack.at(-1)?.by === viewerId` that `canUndo` uses, with
  `hideAutoEndedRoll`'s comment extended to name its new neighbour.
- **`Test the hold`** — §13's second block, including the assertion that
  `autoEndTurn.test.ts` is untouched.

---

### PR 4 — The board shows it

*Review: caveman, rulebook.*

- **`Count down in seconds`** — `secondsUntil(deadline, now)` in
  `TurnTimer.ts` with its unit tests, beside the minute-coarse formatters it
  joins.
- **`Wire undo into the Settlements & Cities action panel`** — the Undo
  `ActionButton`, the `ag-hint` countdown and the *Pass now* relabelling in
  `SettlementsAndCitiesActions.tsx`; `SACUndo` submitted through the existing
  `submitCommand`; `SACEndTurn` fired on expiry after re-reading the deadline;
  a manual *End turn* routed through the same window when there is a snapshot
  to keep.
- **`Recap reads an undo`** — the `SACUndo` case in `recap.ts`'s `toEvents`
  and its test in `recap.test.ts`.

---

### PR 5 — Say so

*Review: rulebook.*

- **`Document undo`** — this file moved from plan to description (present
  tense, the rejected options kept as the record of why), plus the
  `ARCHITECTURE.md` §6 paragraph pointing at it. No `AGENTS.md` component
  inventory line: §11 adds no component.
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
   game actually needs, and the reason `UNDO_STACK_DEPTH` is 2 rather than 1.
3. **The snapshot is a copy, not a view.** Place a settlement, mutate
   `gs.playerStates` afterwards, undo, and assert the restored player state
   carries the pre-placement values. `clonePlayerStates` already makes this
   true and already has its own test at `SettlementsAndCitiesModels.test.ts:101`;
   this is the regression test for the day someone hand-rolls the snapshot
   again.
4. Undo is refused after something else has happened: build a road, play a
   Knight, undo → `validMove: false`, board unchanged. (The anchor.)
5. Undo is refused for a player who is not the mover, and after their turn has
   passed.
6. A roll cannot be undone: `SACRollDice` pushes no snapshot, so a hand-built
   `SACUndo` straight after a roll finds no matching anchor and is refused.
7. **The guard.** Every command class declaring `undoable` is executed against a
   fixture and asserted to carry no `recorded…` own property
   (`consumedRandomness`). This is §6's whole enforcement, so it fails CI rather
   than a player.
8. A full turn plays and replays byte-for-byte with an undo in the middle of
   it — `buildTimeline` over the real `commandHistory`, in the shape
   `autoEndTurn.test.ts` already uses.

**PR 3 — the hold**

9. A build that leaves its player with nothing sets `autoEndTurnAt` and does
   *not* pass the turn; no `SACEndTurn` is on `commandHistory`.
10. Undoing that build clears `autoEndTurnAt` and the turn is still theirs.
11. A *roll* that leaves its player with nothing still ends the turn
    immediately, with no deadline — `autoEndTurn.test.ts` unchanged and green,
    which is the assertion that matters most in this PR.
12. Setup: the road sets the deadline; `SACEndTurn` is accepted in setup only
    while it is set, refused before the settlement is placed and refused after
    the turn has passed; `setupStep` advances exactly once.
13. `gameStateToResponse` sends `autoEndTurnAt` and `canUndo` to the held
    player, and `null`/`false` to everyone else and to a viewerless replay —
    beside the existing `hideAutoEndedRoll` cases in
    `SettlementsAndCitiesModels.test.ts`.
14. The turn-timer adapter still resolves a held turn: `turnTimeout.test.ts`
    gains a game left with `autoEndTurnAt` in the past and asserts
    `resolveStalledTurn` returns `'advanced'`.

**PR 4** — `secondsUntil` is a pure function tested directly (a future deadline,
a passed one, a null `now`). The panel changes are rendered through
`react-dom/server` in the house client-hook style only if they grow logic worth
asserting on.

## 14. What this does not reach

- **Other Settlements & Cities commands.** `SACBuildCity` and
  `SACMaritimeTrade` are both non-random and both one line each once the shape
  has had a game's worth of play: `readonly undoable = true` and a
  `sacPushUndo` call. Deliberately not in the pilot.
- **Other games.** Nothing here is wired into any other game. Dice Cities' card
  purchases, Train Time's route claims, Banned Islet's and Outbreak's actions
  and World Domination's troop movements (not its combat) are all plausible
  candidates. None of them needs the engine to change again to *work* — but at
  that many, the six copies stop being a pattern and start being duplication.
  §16 says what to promote, when, and what the pilot does now so that promotion
  is mechanical.
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
- The undo stack and the anchor never leave the server, and a held deadline
  reaches only the player it belongs to.
- A match with an undo in it replays byte-for-byte in the match review.
- A player whose browser dies mid-countdown loses nothing but the ten seconds;
  the existing turn-timer adapter finishes the turn with no cron changes.
- `IGameCommand` no longer declares a method that 57 classes pretend to
  implement, and Dice Cities' two real inverses behave exactly as before.
- No new component, no new module, and no new field on `ICommandOutcome`.
- `npm run build`, `npx tsc --noEmit`, `npm run lint` and `npm test` are green,
  and the What's new note is one line.

## 16. When this becomes an abstraction

§4 argues against extracting a shared undo with Solitaire, and that argument
holds for exactly as long as there is one multiplayer game doing this. It does
not survive the roadmap. If Dice Cities can take back a card purchase, Train
Time a route claim, Banned Islet and Outbreak an action, and World Domination a
troop movement (its combat is dice, so never), then there are six, and six
copies of an ownership check is not a pattern — it is duplication with a
plausible excuse.

So: what gets promoted, when, and what does the pilot do now so that promotion
is mechanical rather than a rewrite.

### What six games would actually share

Per game, an undo is seven pieces. Only some of them repeat.

| Piece | At six games |
|---|---|
| `clone<Game>State` | **Already exists in seven of eleven games**, with the same `(gs, userIdList)` signature — Banned Islet, Outbreak, Train Time, World Domination, Race Cars, Fires Out and Settlements & Cities all export one, because the replay engine already wanted it. Stays per-game; there is nothing to share that isn't already shared. |
| `undoStack` / `undoAnchorId` on the state | **Identical six times.** The fields hold opaque state; nothing about them is game-shaped. |
| The push at the top of each undoable command | **Identical six times** but for the cloner it names. |
| The undo command | **Identical six times** but for the cloner and the cast. This is the one that matters. |
| `canUndo` on the response | **One expression, six times.** |
| Which commands are undoable | **Never shareable.** It is a rules judgement, and the roadmap proves it: movement but not combat, a purchase but not the draw that follows it. |
| The ten-second hold | **Partly.** Two games auto-end a turn today — Settlements & Cities via `sacFinishTurn`'s follow-up, Dice Cities via `settleRoll`/`noActionsAvailable` returning `turnOver` from three call sites — and they do it in two different shapes. The others may never need it. |

### The one to promote: the undo command

Not because of line count — six hand-written commands are about 150 lines
against roughly 110 for a generic one plus its registrations, which is a wash.
Because of **invariant count**. The undo command is where the anchor check, the
"is this your move" check, the depth cap and the `markModified` live, and those
four decide whether a player can rewind somebody else's move or a move that
consumed randomness. Six copies of that is how the fifth one ends up subtly
different from the first, and nothing fails until somebody notices in a game.

The shape is not a new idea in this repo, which is the point:

```ts
// src/utils/games/undo.ts — a fourth createAdapterRegistry, beside
// registerReplayAdapter, registerRecapAdapter and registerTurnTimeoutAdapter.
export interface IUndoAdapter {
    className: string;                       // gameType.className
    /** The game's own whole-state cloner — the one replay already made it write. */
    cloneState(gameData: IGameData): unknown;
    /** Assign a popped snapshot back. Almost always Object.assign(gs, restored). */
    restoreState(gameData: IGameData, snapshot: unknown): void;
}
```

…and one `@serializable GameUndo` command that looks its adapter up by
`gameData.gameType.className`, exactly as `resolveStalledTurn` already looks up
a turn-timeout adapter. Every game's entry is then three lines: the two state
fields, one `registerUndoAdapter({...})`, and `undoable = true` on the commands
that qualify.

`pushUndo(gameData, command)` and the `canUndo` expression ride along in the
same module, for the same reason.

### Two things that will block it, worth knowing before game #2

Neither is a reason not to do it. Both are reasons not to discover them halfway
through the PR.

1. **`COMMANDS_BY_GAME_TYPE` forbids a shared command today, on purpose.**
   `serializableRegistry.test.ts` asserts *"A command listed under two games
   would let either game run it"* and fails on any `className` listed twice —
   a guard that exists because every other `Execute` opens by casting the game
   to its own shape, so a command reaching the wrong game reaches rules written
   for state it isn't holding. A universal `GameUndo` is the first command for
   which that rationale genuinely does not apply: it never casts, it looks its
   game up. But relaxing that guard — a `SHARED_COMMANDS` list, allowed for any
   game type that registers an undo adapter — is a change to a security
   boundary, and **it is the locksmith's call, not the caveman's.** Raise it
   with them when game #2 lands, not in a PR description.
2. **Dice Cities has no `cloneDiceCitiesState`.** It is the one of the six that
   never needed one: its replay adapter rebuilds the opening state from the
   creation parameters (`buildInitialDiceCitiesState(userIdList, enabledDocks,
   bankTotal, theme)`) rather than cloning a stored snapshot. Undo there starts
   with writing that cloner — about thirty lines in the shape of the other
   seven — which is a real cost to budget, not a surprise to hit.

### What stays per-game even at six

- **The cloner.** Already per-game, already written, already tested by replay.
- **Which commands opt in.** Six different rules answers; the only shared part
  is the CI guard that no `undoable` command executes into a `recorded` field,
  which becomes one test over every game instead of six.
- **The hold.** Two shapes across two games is not enough to know what the
  abstraction is, and four of the six may never auto-end a turn at all. If it
  does generalise, the field probably belongs on the base `IGameData` beside
  `lastTurnTimestamp` rather than in each game's state — the base engine already
  owns `currentTurn` and the timer — but that is a bigger change than this
  paragraph should pretend, and it needs a second real example first.

### The trigger, and what the pilot owes it

**Promote at game #2, not at game #6, and not now.** Write the second game's
undo by hand, deliberately, then diff its `Execute` against `SACUndo`'s. If the
two differ only in the cloner and the cast, promote in that same PR — the diff
is mechanical and both call sites are in front of you. If they differ in any
other way, that difference is the thing the abstraction would have hidden, and
the wait was worth it.

Three things the pilot does **now** to make that a rename rather than a rewrite,
none of which costs anything today:

- **Name the fields as the shared helper would**: `undoStack`, `undoAnchorId`.
  Already the plan.
- **Keep `SACUndo.Execute` free of Settlements & Cities**, save for the
  `cloneSACState` call and the cast. No SAC-specific guard, no phase check, no
  game-specific history line — "took back their last move" is already generic.
  If the pilot needs a SAC-only rule inside `Execute`, that is the signal the
  generic command will not work and §16 should be rewritten, not worked around.
- **Keep `UNDO_WINDOW_MS` a single exported constant** (§7 puts it in
  `board.ts`), so moving it is one import change per file rather than a hunt for
  a literal `10_000`.
