# Undo

How a player takes back a move they've just made, and the ten-second hold on
the turn hand-off that makes taking it back possible at all.

**Status: built, piloted on Settlements & Cities.** All five of §12's PRs are
in — the dead `Undo` interface removed, the snapshot-and-restore engine work,
the hold, the board's Undo button and countdown, and this documentation. The
pilot is **placing settlements and roads** — all four of them: the two setup
placements and the two main-phase builds. Every other game, and every other
Settlements & Cities command, is out of scope here and gains nothing until
someone opts it in a line at a time (§14, §16). Seven more games have since
opted in by hand: Race Cars (§16, "The second game"), Banned Islet (§16,
"The third game"), Outbreak (§16, "The fourth game"), Train Time (§16,
"The fifth game"), Dice Cities (§16, "The sixth game"), Fires Out (§16,
"The seventh game"), Realm Arena (§16, "The eighth game") and World
Domination (§16, "The ninth game") — nine games in all, counting
Settlements & Cities.

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
  today end itself the instant the build landed. A city, a bank trade and the
  development cards that draw nothing — Knight, Road Building, Year of Plenty —
  work the same way (§6): trade away your last four lumber for the wrong
  resource and you get it back. Now it holds for ten seconds
  first, with the same countdown, because "I've just spent my last brick on the
  wrong edge" is exactly the moment you want it back.
- **Nothing else changes.** Rolling, the robber, buying a dev card and
  Monopoly are not undoable (§6), and a turn that ends on one of those ends exactly as it does
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
what that one should trigger — because at the handful of games that plausibly
want undo (nine, as it turned out), a real abstraction does appear, and it isn't this one.

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
anything else does not, and the stale stack becomes unreachable. Nothing has
to be cleared, and a command added later cannot break the invariant by
omission — it breaks it by existing, which is the safe direction.

The one place that does clear it is the push itself. A push sets the anchor
again, so a push onto a stale stack would bring its old entries back within
reach: road, Knight, road, undo, undo would pop the first road's snapshot and
quietly reverse the Knight after all. So `sacPushUndo` (and Race Cars'
`raceCarsCommitUndo`) starts a fresh stack whenever the anchor isn't the
command just behind it. A chain of undos therefore only ever takes back
commands that were played one straight after another, which is also what the
shared recap engine relies on when it pairs each undo with the newest command
still standing (§10).

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

The same hold serves a game whose turn only ever ends on the player's own tap,
with no server-side hold at all: Fires Out's End turn runs the Advance Fire, so
it can never be undone and nothing about it can be held server-side, yet a
player who taps it a moment after a move they regret should still get the ten
seconds. That is the manual hold alone, and `useManualEndTurnHold`
(`src/utils/hooks/`) is the one place it lives — Settlements & Cities and
Fires Out both go through it (§11, §16).

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

### The pilot's four, and what has joined them

| Command | Undoable | Why |
|---|---|---|
| `SACPlaceSettlementSetup` | ✅ | Pure placement. In the second setup round it also grants starting resources, which the snapshot restores. |
| `SACPlaceRoadSetup` | ✅ | Pure placement; ends the setup turn, so it is the one that needs the hold. |
| `SACBuildSettlement` | ✅ | Spends four known resources on a known vertex. |
| `SACBuildRoad` | ✅ | Spends two known resources on a known edge. Also covers a free road from Road Building — `pendingRoadBuilding` is restored with the rest of the state. |
| `SACMaritimeTrade` | ✅ | Added after the pilot: swaps known resources with the bank at a rate read off the board. A trade that spends a player's last tradeable hand ended the turn with no chance to take it back; it now holds like a build. |
| `SACBuildCity` | ✅ | Added after the pilot: spends five known resources on a settlement already on the board. |
| `SACPlayKnight` | ✅ | Added after the pilot. Playing the card draws nothing; it arms a robber move, and that move (a random steal) is its own, non-undoable command — so the Knight can only be taken back before the robber moves. Largest Army is restored with the rest of the state. |
| `SACPlayRoadBuilding` | ✅ | Added after the pilot. Arms two free roads, each undoable on its own, so the card and both roads unwind one at a time — the reason `UNDO_STACK_DEPTH` is 3. |
| `SACPlayYearOfPlenty` | ✅ | Added after the pilot: two resources of the player's own choosing from the bank. Nothing drawn, no other hand touched. |

### And what is not, with the reason in each case

| Command | Why not |
|---|---|
| `SACRollDice` | Randomness. Taking a roll back is re-rolling it. |
| `SACMoveRobber` | The steal is random, and the victim has already been told they were robbed. |
| `SACBuyDevCard` | The buyer has seen the top of the deck. Undo would be a free peek. |
| `SACPlayMonopoly` | Draws nothing, but it tells the player exactly how much of that resource every opponent was holding, and has already emptied those hands. Undo would make that a free look at everyone's cards, played again later. |
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
`UNDO_STACK_DEPTH = 3` — a Road Building card and the two free roads it grants,
placed back to back, is the deepest ordinary run to unwind (§6; a build slipped
in between pushes the card out of reach), and it covers a setup
settlement and its road as well. It was 2 until Road Building became undoable;
each level is bytes on every save, so it stays at what a real sequence needs. The stack is emptied on every turn hand-off, in the two places that
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
- **Except for a game recorded before the hold.** Its log has no `SACEndTurn`
  after a setup road, or after a move that left nothing else to do: those
  ended the turn outright. Replayed under today's rules the hold never
  closes, the next move is refused and so is every move after it, so the
  match review and the result charts of a game started before then stopped a
  round or two in. The replay adapter's `closeUnrecordedHold`
  (`sacUnrecordedHoldEnd`) closes such a hold the way those rules did, as its
  holder, before the recorded command it wouldn't have let through — and
  leaves no step, command or line of its own, since the old rules ended the
  turn inside the move that holds today. Only a hold that is its holder's
  own, their snapshot on top of the stack: every hold since was closed by a
  recorded command, and the Special Build Phase's hand-offs clear the undo
  state like any other, so it never fires for those.
- **No recap event.** Replay retains `SACUndo`, but the shared recap engine
  treats undo as an edit: it suppresses the Undo and every event produced by
  the newest command still standing — the one immediately before it, unless
  that was itself an undo, in which case several undos in a row each take the
  next command back off the same stack. The recap therefore shows neither a
  building that is no longer on the board nor a bookkeeping row about taking
  it back. The same rule serves every game that supports undo.
- **No step in the review, where a game asks.** The turn recap's timeline has
  one step per command, so an action taken back would play and then snap back.
  A replay adapter that sets `omitUndoneSteps` (Realm Arena's does) leaves out of
  the timeline it returns every undo and every command one took back, using the
  recap's pairing (`utils/games/undoPairs.ts`). The step after a dropped pair plays from the one
  before it, which is the same board. `onStep` still sees the whole replay, and
  the history log keeps the lines. Other games keep every step.
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
  than sending straight away. That is `useManualEndTurnHold(canUndo, myTurn,
  gs.autoEndTurnAt)` — it returns the deadline to count toward (the server's
  when it set one, else its own), what the End turn button calls, and a
  `clear`. Once tapped, the hold runs to its end even if `canUndo` turns false
  under it — a teammate's out-of-turn play in Settlements & Cities moves the
  anchor, and the player still asked for the turn to end. The local deadline
  is dropped the moment `myTurn` is false, so a turn that has moved on cannot
  leave a stale deadline to fire a later End turn at once. It was written inline in
  Settlements & Cities' turn sheet until Fires Out wanted the same thing.
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
- **`Recap omits an undo`** — the shared recap replay drops the Undo and the
  events of the command it reversed (the newest one not already undone, so
  undos in a row each reach one further back), covered once by the engine test.

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

- **The rest of Settlements & Cities.** Every command that neither draws
  nor reveals a hidden hand has since opted in (§6). What is left — the roll,
  the robber, buying a card and Monopoly — stays out for the reasons in §6's
  second table.
- **Other games.** Nothing here is wired into any other game. Dice Cities' card
  purchases, Train Time's route claims, Banned Islet's and Outbreak's actions
  and World Domination's troop movements (not its combat) are all plausible
  candidates — and all of them have since opted in (§16). None of them needs the engine to change again to *work* — but at
  that many, the copies stop being a pattern and start being duplication.
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
- A roll, a robber move, a card bought and a Monopoly cannot be taken back, and a
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

### What nine games would actually share

Per game, an undo is seven pieces. Only some of them repeat.

| Piece | At nine games |
|---|---|
| `clone<Game>State` | **Already exists in seven of eleven games**, with the same `(gs, userIdList)` signature — Banned Islet, Outbreak, Train Time, World Domination, Race Cars, Fires Out and Settlements & Cities all export one, because the replay engine already wanted it. Stays per-game; there is nothing to share that isn't already shared. |
| `undoStack` / `undoAnchorId` on the state | **Identical nine times.** The fields hold opaque state; nothing about them is game-shaped. |
| The push at the top of each undoable command | **Identical nine times** but for the cloner it names. |
| The undo command | **Identical nine times** but for the cloner and the cast. This is the one that matters. |
| `canUndo` on the response | **One expression, nine times.** |
| Which commands are undoable | **Never shareable.** It is a rules judgement, and the roadmap proves it: movement but not combat, a purchase but not the draw that follows it. |
| The ten-second hold | **Partly.** Two games auto-end a turn today — Settlements & Cities via `sacFinishTurn`'s follow-up, Dice Cities via `settleRoll`/`noActionsAvailable` returning `turnOver` from three call sites — and they do it in two different shapes. The others may never need it. |

### The one to promote: the undo command

Not because of line count — the hand-written commands are about 150 lines
against roughly 110 for a generic one plus its registrations, which is a wash.
Because of **invariant count**. The undo command is where the anchor check, the
"is this your move" check, the depth cap and the `markModified` live, and those
four decide whether a player can rewind somebody else's move or a move that
consumed randomness. Nine copies of that is how a later one ends up subtly
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
2. **Dice Cities had no `cloneDiceCitiesState`.** It was the one of the games that
   never needed one: its replay adapter rebuilds the opening state from the
   creation parameters (`buildInitialDiceCitiesState(userIdList, enabledDocks,
   bankTotal, theme)`) rather than cloning a stored snapshot. Its undo started
   with writing that cloner, in the shape of the other seven (§16, "The sixth
   game").

### What stays per-game even at nine

- **The cloner.** Already per-game, already written, already tested by replay.
- **Which commands opt in.** Nine different rules answers; the only shared part
  is the CI guard that no `undoable` command executes into a `recorded` field,
  which becomes one test over every game instead of six.
- **The hold.** Two shapes across two games is not enough to know what the
  abstraction is, and several of the nine may never auto-end a turn at all. If it
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

### The second game: Race Cars

Written by hand, deliberately, per the trigger above — command adjustments
only (§4-§8's shape), with no hold (§5) yet. `RaceCarsMove` (picking a
destination once the roll is known) and `RaceCarsSlipstream` (taking or
declining a tow) opt in the same way Settlements & Cities' four commands do:
`readonly undoable = true`, a snapshot before the first mutation, and
`RaceCarsUndo` reads the same anchor `SACUndo` does. `cloneRaceCarsState`
already existed (§16's table above), so it moved from `RaceCarsModels.ts` to
`rules.ts` — the one file both it and the new command already import without
importing each other — rather than being duplicated.

Diffing `RaceCarsUndo.Execute` against `SACUndo`'s, as the trigger asks, turns
up two real differences, both because a Race Cars turn carries randomness a
Settlements & Cities placement never does:

- **The push is conditional, not unconditional.** `RaceCarsMove` and
  `RaceCarsSlipstream` can themselves roll again mid-command — entering one of
  §14's slicks rolls a d6 — and can end the race outright by crossing the
  line, neither of which any of SAC's four commands can do. Both commands
  clone the pre-move state up front as usual, but only actually push it once
  the leg is known to have crossed no slick and no finish line
  (`raceCarsCommitUndo`, called or not, in `RaceCarsLogic.ts`). A command that
  sometimes rolls and sometimes doesn't cannot answer "did this consume
  randomness" with one static declaration; the anchor still only ever points
  at a push that passed the test.
- **`RaceCarsUndo` restores `data.currentTurn`, which `SACUndo` does not.**
  Both games' Undo commands restore `specificGameState` — `roundIndex` /
  `roundOrder` / `round` included — but `currentTurn` lives on `IGameData`,
  outside the snapshot, and only `CheckEndTurn` writes it. SAC's pilot leaves
  this stale on the one placement that ends its own turn
  (`SACPlaceRoadSetup`) until §5's hold lands, because in SAC nothing
  player-facing reads `currentTurn` instead of the phase/step fields the
  snapshot already restores. Race Cars is a worse place to leave that gap:
  *both* undoable commands end the turn in the ordinary case (no tow offered,
  a tow taken or declined with nothing behind it) rather than SAC's one rare
  placement, and the board's own turn-sheet visibility reads `currentTurn`
  directly. So `RaceCarsUndo` sets `data.currentTurn = this.senderId` on a
  successful restore — safe because the anchor already guarantees at most one
  hand-off happened since the snapshot, and it was this command's own target
  that caused it.
- **`RaceCarsUndo` was exempt from `/api/game/command`'s own "is it your turn"
  gate; `SACUndo` never was.** (Since removed — see the end of this bullet.) That gate runs *before* any command's `Execute`,
  against whatever the previous request already saved — so the instant a move
  ends its own turn, `currentTurn` is the next driver by the time the sender's
  own follow-up request could physically arrive, and the gate refuses it
  before `RaceCarsUndo` (or the `data.currentTurn` restore two bullets up)
  ever runs. This is the same gap named above, one layer further out: SAC's
  pilot leaves it in place for its one rare placement, planning to close it
  with §5's hold instead. Race Cars can't wait for that hold — the gap would
  swallow the ordinary case for *both* undoable commands, not one rare one —
  so `RaceCarsUndo` declared `readonly ignoresTurnGate = true`
  (`gameCommand.ts`'s `ignoresTurnGate`, checked nowhere else) and the route
  let it through, trusting `Execute`'s own anchor-and-ownership check —
  itself strictly narrower than "is it your turn" — to police who may
  actually run it. `SACUndo` does not opt in, on purpose: its one gap stays
  exactly as open as it always was, closed by the hold when that lands rather
  than by a gate every game's Undo would otherwise inherit for free.

  **Since removed.** Once §5's hold landed on Race Cars (below), an undoable
  leg no longer handed the turn off, so its driver's undo arrives while they
  are still `currentTurn` and passes the ordinary gate. The only legs that
  still hand off outright — oil or the line — are never undoable, and the
  anchor check refuses them anyway. The exemption let no legitimate request
  through, and because the route read the flag off the rehydrated request
  body, any command could claim it and be played on another player's turn.
  The gate has no exemptions now; see
  [`out-of-turn-actions.md`](./out-of-turn-actions.md) §3 for the whole story
  and for how a future exemption should be declared.

Three commands' worth of real behavioural difference from `SACUndo` — the
conditional push, the `currentTurn` restore, and (until the hold made it
unnecessary) a turn-gate exemption — not the shape
§16 expected a second game to be identical in. That's the signal to keep
writing the third one by hand too, rather than promoting a `GameUndo` that
can't express "sometimes I don't push" or "this one polices its own turn"
without becoming the per-game logic it was meant to replace.

### §5's hold, on Race Cars

Race Cars asks for a move or a tow every ordinary turn (§7), never a rare
placement, so unlike SAC's pilot — where only its one setup road ever ends
its own turn — *both* `RaceCarsMove` and `RaceCarsSlipstream` end their turn
in the common case: no tow offered, a tow taken with nothing further behind
it, or a decline. §5's hold therefore applies far more often here than it
does in SAC, and that difference is the whole story below.

- **One helper, not `sacFinishTurn`'s "is there anything left to do" check.**
  Race Cars has no such check — whether a leg ends the turn is already
  decided (`towOffered`, or a decline's unconditional `turnOver: true`), so
  `raceCarsFinishTurn(data, trigger, outcome)` only asks the anchor's own
  staleness test: if `outcome.turnOver` is true and `gs.undoAnchorId ===
  trigger.id` (this leg is the one `raceCarsCommitUndo` just made reachable),
  it holds — `gs.autoEndTurnAt = now + UNDO_WINDOW_MS`, `turnOver: false` —
  otherwise the outcome passes through unchanged. A leg that rolled for oil or
  crossed the line never matches (§6, `raceCarsCommitUndo` never moved the
  anchor for it), so it still ends the turn immediately, exactly as before
  this PR. Both `RaceCarsMove` and `RaceCarsSlipstream` route their one
  turn-ending return through it; `RaceCarsSlipstream`'s decline is always
  undoable; so it always holds first too.
- **`RaceCarsEndTurn` — the one command Race Cars gained no other way to
  reach.** The game has never had a manual "End turn": a turn has always
  ended itself the instant nothing was left to decide. The hold changes that
  for the first time, so it needed a command to close one — valid only while
  `gs.autoEndTurnAt` is set, checked against `driverOnTurn` like every other
  command, and passing the ordinary turn gate: the held driver is still
  `currentTurn`, since holding is precisely *not* advancing it. It is the board's own
  "Pass now" and the client's expired countdown alike, and the stalled-turn
  sweep's own way of closing a hold nobody came back to finish (§9, below).
- **A guard SAC's placements didn't need.** `RaceCarsMove` and
  `RaceCarsSlipstream` leave `phase`/`roll` exactly where the held leg left
  them — nothing resets either until the hold closes — so the ordinary
  "is this the right phase" check alone would let the same driver drive a
  second leg on the same roll for as long as the window stayed open. Both
  commands' `Execute` now refuse outright while `gs.autoEndTurnAt` is set,
  before that check ever runs. `RaceCarsGameType.CheckEndTurn` clears the
  field unconditionally whenever it runs with `turnOver: true` — which,
  thanks to `raceCarsFinishTurn`, only ever happens once a hold is genuinely
  closing — so nothing is left behind to lock the next driver's first move.
- **The turn-timer backstop needs one branch SAC's doesn't.** SAC's adapter
  never inspects `autoEndTurnAt`: its main-phase "nothing left to decide"
  test just comes out true a second time and reaches the same `SACEndTurn`
  by the path it already had. Race Cars has no such test — `phase`/`roll`
  don't change during a hold — so its adapter checks `gs.autoEndTurnAt`
  before it ever asks `conservativeTurn` for a plan, and returns
  `RaceCarsEndTurn` directly when a hold is open, the same way SAC's own
  setup branch does.
- **Redacted the same way `canUndo` is, for the same reason.** Nothing in
  Race Cars is hidden (§2's fourth pillar), so `autoEndTurnAt` isn't closing
  a leak the way it is in SAC — but there is still nothing for anyone but the
  held driver to do with it, gated on the identical `topEntry?.by ===
  viewerId && gs.undoAnchorId === lastCommandId` test `canUndo` already runs,
  so the two can never disagree about who a hold belongs to.
- **What replay does *not* reproduce exactly, inherited from SAC.**
  `gs.autoEndTurnAt` is stamped from `Date.now()` inside `Execute`, same as
  SAC's, so a recap or match-review step built by replaying a hold-opening
  command gets a deadline ten seconds from *whenever that replay ran* rather
  than the one the live table actually saw. `canUndo` doesn't share the
  problem — it is reconstructed from command ids, which replay reproduces
  exactly — so only the timestamp's value is off, never whether a hold reads
  as open. Real, and already true of SAC's own recap today; not fixed here
  because doing so would mean recording the deadline on the triggering
  command the way a die roll is recorded, and that field would itself read as
  consumed randomness to `consumedRandomness` — a change to the shared
  convention, not a one-game fix, and worth raising with whoever builds
  Race Cars' own hold-countdown UI before it is built on top of this gap.

### The third game: Banned Islet

Also written by hand, per the trigger above — and the one that behaves most
like the pattern §4-§8 describe, because nothing Banned Islet asks for in its
action phase is random and none of it ends a turn.

- **What is undoable.** Every `BannedIsletAction` — a move, a shore up, a
  give, a capture, the Pilot's flight, the Navigator's push, and a pass — and a
  `BannedIsletPlayCard` played in the action phase (Sandbags, or a Helicopter
  Lift that doesn't win). Both declare `readonly undoable = true`; the source
  scan in `src/games/BannedIslet/undo.test.ts` holds that list to exactly those
  two, and the guard beside it holds them to no `recorded…` field.
- **What is not.** `BannedIsletEndTurn` draws two treasure cards and floods;
  `BannedIsletDiscard` always closes the turn and floods. A special played
  mid-discard can close the turn and run the flood too, so `BannedIsletPlayCard`
  only pushes when it was played in the action phase — the same "sometimes I
  push, sometimes I don't" shape as Race Cars' oil check, decided by the phase
  it starts in rather than by what the command rolled. The Helicopter Lift that
  wins sets `complete` outside `specificGameState` and pushes nothing, like a
  Race Cars leg that crosses the line. And a special a teammate plays on
  somebody else's turn ([`out-of-turn-actions.md`](./out-of-turn-actions.md)
  §5.5) pushes nothing and **empties the stack**: its sender has no Undo off
  turn, and every snapshot the active player holds was taken before it, so the
  second of two undos would otherwise restore a board from before the card and
  hand it back.
- **No hold (§5).** A Banned Islet turn has never ended itself: only
  `BannedIsletEndTurn` hands off, and the player sends it. So there is no
  `autoEndTurnAt`, no countdown and no "Pass now" — Undo simply stays available
  until the player does something that isn't undoable. For the same reason
  `BannedIsletUndo` has no `currentTurn` to put back, unlike `RaceCarsUndo`.
- **Depth three.** `UNDO_STACK_DEPTH` is `ACTIONS_PER_TURN`, so a player can take
  all three of a turn's actions back one at a time. `CheckEndTurn` empties the
  stack on every hand-off — nothing on it could be restored past a draw anyway
  — and the dropout adapter empties it too, because a snapshot taken before a
  player left would put their pawn back on the island.
- **The cloner moved.** `cloneBannedIsletState` moved from
  `BannedIsletModels.ts` to `rules.ts`, for the same reason Race Cars' did: the
  undo command needs it, and `rules.ts` is the one file both it and the models
  import without importing each other. `BannedIsletModels.ts` re-exports it.
- **Hidden information.** The snapshot carries both deck orders — the one thing
  this game hides — and is never sent: `gameStateToModel` builds its return
  field by field, and its allowlist test now names `canUndo` and nothing else
  new. `canUndo` is the same expression Race Cars and Settlements & Cities use.
- **Recap.** The shared recap engine removes an Undo together with every row
  from the command it reversed. Plain moves and shore-ups were
  already silent; an undone capture now disappears rather than leaving either
  the capture or a compensating row behind.
- **The button.** Three games showing the same Undo button was the signal to
  extract it: `src/components/ui/UndoButton.tsx`, which Settlements & Cities and
  Race Cars now use too. It sits beside End turn once the actions are spent, and
  above Pass while they aren't.

Diffing `BannedIsletUndo.Execute` against `SACUndo`'s and `RaceCarsUndo`'s: the
anchor check, the owner check, the pop and the restore are line for line the
same, and it differs from Race Cars' only by *not* restoring `currentTurn`. The
per-game differences live in the pushing commands — whether they push, and
whether a hold follows — which is where §16 predicted they would stay.

### The fourth game: Outbreak

Banned Islet's shape again, almost line for line — the two games share a turn
structure (actions, then a draw that nobody can take back) — and written by
hand for the same reason the third was.

- **What is undoable.** Every `OutbreakAction` — any of the four moves, a
  station, a treatment, a shared card, a cure, the Dispatcher's and the
  Operations Expert's abilities, and a forfeit — and an `OutbreakPlayEvent`
  that retrieves a card (the Contingency Planner) or plays one in the action
  phase: Airlift, Government Grant, One Quiet Night and Resilient Population.
  Both declare `readonly undoable = true`; the source scan in
  `src/games/Outbreak/undo.test.ts` holds that list to exactly those two, and
  the guard beside it holds them to no `recorded…` field.
- **What is not.** `OutbreakEndTurn` draws, may resolve an epidemic (the one
  recorded shuffle in the game) and infects; `OutbreakDiscard` always closes
  the draw phase and infects. **Forecast is never undoable**, in any phase: it
  turns up the top six infection cards, and a snapshot can put them back but
  can't make the player forget them. Its ordering step pushes nothing either,
  so after a Forecast the anchor no longer matches and nothing before it can be
  reached. An event played mid-discard can close the draw phase and run the
  infection, so — as with Banned Islet's specials — `OutbreakPlayEvent` only
  pushes when it was played in the action phase. The fourth cure wins the game
  in `CheckGameOver`, outside `specificGameState`, so `OutbreakAction` doesn't
  push for it, like the winning Helicopter Lift.
- **No hold (§5)**, no `currentTurn` to restore, depth `ACTIONS_PER_TURN` (four),
  the stack emptied by `CheckEndTurn` and the dropout adapter — all for Banned
  Islet's reasons.
- **The cloner moved.** `cloneOutbreakState` moved from `OutbreakModels.ts` to
  `rules.ts`, as Banned Islet's and Race Cars' did; `OutbreakModels.ts`
  re-exports it. The three copies of the tests' `baseState` became
  `src/games/Outbreak/testFixtures.ts` on the way.
- **Hidden information.** Every hand is public here, so the only secrets in a
  snapshot are the two deck orders, and the snapshot is never sent:
  `gameStateToModel` builds its return field by field and gains `canUndo`
  alone — the same expression the other three games use.
- **Recap.** The shared recap engine removes an Undo together with every row
  from the command it reversed. An undone cure, station or event
  card therefore disappears completely; a plain move remains silent as it was
  going forward.
- **The button.** `UndoButton`, beside End turn once the actions are spent and
  above Forfeit while they aren't — Banned Islet's placement.

### The fifth game: Train Time

The narrowest opt-in so far, and the first since Race Cars to need §5's hold.

- **What is undoable.** A `TrainTimeClaimRoute`, and nothing else. A claim
  spends cards onto the discard pile, and only a draw ever shuffles that, so
  nothing about it is random. Every other action is a draw of some kind — blind
  carriage cards, a face-up card the market refills behind, destination tickets
  whose faces the player has now seen, and the keep that answers them — and none
  of those can be un-seen. The source scan in `src/games/TrainTime/undo.test.ts`
  holds the list to that one command, and the guard beside it holds it to no
  `recorded…` field.
- **What is not, even of a claim.** The claim that ends the game — the last
  turn of the last lap, or one that leaves no route short enough for anyone —
  is scored by `CheckGameOver` straight away, outside `specificGameState`, so it
  pushes nothing and hands off at once, as every claim used to. It is the
  winning Helicopter Lift again.
- **The hold (§5).** A claim is the whole of a turn, so it always ends one:
  Race Cars' shape rather than Banned Islet's. It sets `autoEndTurnAt` and
  returns `turnOver: false`; `TrainTimeEndTurn`, valid only while that hold is
  open, is the board's *Pass now* and what it sends by itself when the countdown
  runs out. Every other command refuses while the hold is open — the claim has
  already reset the draw counter behind it, so without that a player could claim
  and then draw two cards. `CheckEndTurn` empties the stack and closes the hold
  on every hand-off, and the dropout adapter does too. Depth one: a turn only
  ever has one claim in it.
- **The last lap is announced when the hold closes.** A claim that leaves its
  player on two trains or fewer starts the last lap in the state straight away,
  where the snapshot can take it back, but its log line waits for
  `TrainTimeEndTurn`: the history is outside `specificGameState`, and a table
  told the game is ending by a claim that was then taken back would have no way
  to un-read it. A hold the turn timer passes on (below) never gets the line;
  the board's own "last lap" marker still shows.
- **No turn-timer adapter, and what that costs.** Train Time registers no
  turn-timeout adapter — an expired turn is the cron stepping `currentTurn` on
  and restarting the clock — so, unlike Race Cars and Settlements & Cities, a
  hold nobody comes back to is not closed by a command. The turn still moves on;
  what is left behind is a hold and an anchor that still match, because no
  command ran. In a two-seat game where both players time out, the turn comes
  straight back round with the claim still the last command. So each stack
  entry records the `lastTurnTimestamp` of the turn it was pushed in, and
  `liveUndoEntry` (in `board.ts`) refuses one whose turn clock has since moved —
  which every hand-off does, the command route's and the cron's alike. The
  command guards, `TrainTimeUndo`, `TrainTimeEndTurn` and `canUndo` all go
  through it, so a stale hold neither undoes a claim two turns old nor locks its
  player out of the turn they are now owed. Registering an adapter instead would
  have changed what every other expired Train Time turn does: with no command to
  play for a turn that isn't held, an adapter can only decline it.
- **The cloner moved.** `cloneTrainTimeState` moved from `TrainTimeModels.ts` to
  `board.ts`, Train Time's equivalent of the other games' `rules.ts`: the one
  file both the logic and the models import without importing each other.
  `TrainTimeModels.ts` re-exports it.
- **Hidden information.** The snapshot carries both decks and every hand and
  is never sent: `gameStateToModel` builds its return field by field and gains
  `canUndo` and `autoEndTurnAt` alone, both false or null for everyone but the
  claimer. `canUndo` is worked out by `CreateDataResponse`, not inside
  `gameStateToModel`, because it needs the command log and the turn clock; a
  replayed step never offers it.
- **Recap.** A claim taken back leaves no row at all: shared recap replay drops
  every row carrying the claim's command id (including the last lap it tripped)
  and the undo itself, since the board says none of it happened.
- **The countdown.** Race Cars' `RaceCarsUndoHold` became
  `src/components/ui/UndoHold.tsx` — the Pass now / Undo pair, the countdown
  and the auto-fire — which `RaceCarsUndoHold` now wraps and Train Time's turn
  sheet uses in place of its action picker while a hold is open.

### The sixth game: Dice Cities

Train Time's shape — a move that always ends the turn, a hold, and a turn
timer with no adapter behind it — and the first opt-in to share code with an
earlier one rather than repeat it.

- **What is undoable.** A purchase: `DiceCitiesRequestCardPurchase` and the five
  landmark unlocks. A purchase spends known coins on a card anyone can see in
  the market, and nothing about it is random. The roll, the Radio Tower's
  re-roll and the Harbour's +2 are dice, and the TV Station and the Business
  Centre are answers to dice, so none of them pushes anything. The source scan
  in `src/games/DiceCities/undo.test.ts` holds the list to those six, and the
  guard beside it holds them to no `recorded…` field.
- **What is not, even of a purchase.** The landmark that wins the game is
  scored by `CheckGameOver` straight away, outside `specificGameState`, so it
  pushes nothing and hands off at once — the winning Helicopter Lift again.
- **The hold (§5).** A purchase is the last thing a turn does, so it sets
  `autoEndTurnAt` and returns `turnOver: false`; `DiceCitiesEndTurn`, valid
  only while that hold is open, is the board's *Pass now* and what it sends by
  itself when the countdown runs out. A purchase has already cleared
  `hasRolled` for whoever rolls next, so the roll is the one command that
  would otherwise get through a hold, and it refuses while one is open; every
  other command already refuses on `hasRolled` or on a selection that isn't
  pending. `CheckEndTurn` empties the stack and closes the hold on every
  hand-off, and the dropout adapter does too. Depth one.
- **No hold on a doubles turn.** With the Amusement Park, doubles bring the
  turn straight back to the roller, so a purchase then has no hand-off to
  hold. It does what `CheckEndTurn`'s doubles branch would have done for it
  (clears `awaitingDoubleReroll`; `hasRolled` is already clear) and returns
  `turnOver: false`, and stays undoable — Banned Islet's shape — until the
  bonus roll makes the anchor stale. Two costs, both deliberate: the bonus
  turn no longer restarts the turn timer (a `turnOver` would, and would also
  make the snapshot's turn clock stale the instant it was pushed); and it is
  what keeps a game recorded before undo replaying correctly, since that log
  goes straight from such a purchase to the same player's roll, which a hold
  would refuse.
- **Staleness is Train Time's.** Dice Cities registers no turn-timeout
  adapter, so each stack entry records the turn clock it was pushed in and
  `liveUndoEntry` refuses one the clock has since moved past. That test, the
  `undoEntryFor` / `holdOpenFor` pair both games' commands ask it through, and
  `UNDO_WINDOW_MS` moved to `src/utils/games/undo.ts` rather than being
  copied; Train Time, Race Cars and Settlements & Cities re-export the
  constant from there. A replay follows that clock through the
  `recordedTurnStartedAt` every command is stamped with, so a log where the
  timer passed a held turn on and round again, back to the buyer, replays
  their next roll as the live table played it — Train Time's claims likewise.
  (A replay used to hold one clock for the whole game and refuse that roll; a
  log recorded before the stamp still does.)
- **The cloner.** `cloneDiceCitiesState` lives in `DiceCitiesLogic.ts`, the
  only file that needs it — replay doesn't (§16, above).
- **Hidden information.** Nothing in Dice Cities is hidden. The snapshot still
  never leaves the server — `gameStateToModel` builds its return field by field
  and gains `canUndo` and `autoEndTurnAt` alone, worked out by
  `CreateDataResponse` from the command log and the turn clock, both false or
  null for everyone but the buyer. A replayed step never offers it.
- **Recap and charts.** A purchase taken back leaves no recap row: shared recap
  replay drops it and the undo together. A landmark taken back comes off
  the result page's buildings chart too — `computePerTurnEvents` now hands a
  detector the markers recorded so far, and `detectLandmarkEvent` takes the
  buyer's last one back when an undo knocks a landmark down.
- **The board.** While a hold is open, `UndoHold` is the whole turn sheet under
  the roll readout; on a doubles turn, Undo sits under the roll button until
  the dice are thrown.

### The seventh game: Fires Out

Outbreak's shape — actions, then an End turn nobody can take back — and the
first opt-in where the line between undoable and not runs *through* one
command rather than between commands: every move in Fires Out is one
`FiresOutAction`, told apart by its `kind`.

- **What is undoable.** A move, a door, an extinguish, a chop, a drive, a
  Paramedic's treat, a Hazmat Technician's on-site disposal and a crew change
  — every kind in `UNDOABLE_KINDS` (`FiresOutLogic.ts`). `FiresOutAction`
  declares `readonly undoable = true`; the source scan in
  `src/games/FiresOut/undo.test.ts` holds the list to that one command, and
  the guard beside it holds every kind that pushed to no `recorded…` field.
- **What is not.** `endTurn` runs the Advance Fire and replenishes POIs, and
  `deckGun` rolls for where the shot lands, so neither kind ever pushes — and
  since `endTurn` is the only hand-off, no snapshot survives one. Nor does
  **anything that turns a POI face up**: a move onto a face-down marker
  (§10.1 of the GDD) and the Imaging Technician's remote `reveal`. A snapshot
  could put the marker back face down, but the crew has already seen whether
  it was a victim, and taking the move back would be a free look. This is
  decided off the board rather than off the kind — `revealedAnyPoi` (in
  `rules.ts`) compares the snapshot with the state after the action, and any
  marker face down before and face up or gone after means no push — so a kind
  added later that happens to reveal a marker is covered without remembering
  to be. It is Race Cars' "sometimes I push" shape again, decided by what the
  command turned up rather than what it rolled. Last, the action that ends the
  game — the seventh rescue, or the chop that brings the building down — is
  settled by `CheckGameOver` outside `specificGameState` and pushes nothing,
  the winning Helicopter Lift once more.
- **The hold is client-side (§5's manual End turn)**, no `currentTurn` to
  restore: a turn only ever ends on the player's own End turn, which is itself
  random (the Advance Fire) and so is never undoable and never held by the
  server — there is no `autoEndTurnAt` and no command or wire change. Tapping
  End turn while `canUndo` opens a ten-second hold instead of sending
  (`useManualEndTurnHold`, in the board screen); the sheet shows `UndoHold`
  with **Pass now** (sends the `endTurn` at once), **Undo** (a `FiresOutUndo`,
  which also closes the hold) and the countdown, whose end sends the `endTurn`
  by itself. While it runs the rows and the board take no further action. With
  nothing to undo, End turn sends at once. The stack is emptied by `applyEndTurn` rather than
  `CheckEndTurn`, because a solo crew's hand-off from one figure to the next
  never gets as far as `CheckEndTurn` (it returns `turnOver: false`); and by
  the dropout adapter, because a snapshot taken before a player left would
  hand their figures back to them. Depth `AP_PER_TURN` (four): an ordinary
  turn of 1-AP actions, one at a time. A turn run on banked or specialist AP
  can hold more actions than that, which only costs reach.
- **The cloner moved.** `cloneFiresOutState` moved from `FiresOutModels.ts` to
  `rules.ts`, as Outbreak's and Banned Islet's did, and `FiresOutModels.ts`
  re-exports it. `rules.ts` takes the state's type with an `import type`, so it
  still never loads the models at runtime.
- **Hidden information.** Every face-down POI's identity and the POI pool's
  order are the secrets here, and a snapshot carries both. It is never sent:
  `gameStateToModel` builds its return field by field and gains `canUndo`
  alone — the same expression the other games use.
- **Recap and charts.** The shared recap engine drops an undo together with the
  command it reversed. A rescue taken back comes off the result page's
  damage chart too: `detectRescueEvent` takes its own last marker back when an
  undo lowers `rescued`, as Dice Cities' `detectLandmarkEvent` does for a
  landmark.
- **The button.** `UndoButton`, beside End turn in one `.ag-action-grid` row —
  End turn is always on the sheet here, so it never needs a row of its own.

### The eighth game: Realm Arena

Fires Out's shape again — a run of actions, then an End turn nobody can take
back — and the line between undoable and not runs through one command,
`RealmArenaAct`, as Fires Out's does. What decides it here is not only the
action's kind but what the action set off.

- **What is undoable.** A move, a sneak, hunkering down, going on watch, a
  shield wall, a heal, a raise, a Purify, a Hunter's mark, a healing draught,
  a throw and a Demolish — `UNDOABLE_KINDS` (`RealmArenaLogic.ts`) — and only
  when the action rolled nothing and every event it produced is in
  `PEACEFUL_EVENTS`: something moved, healed, rose, braced or went on watch,
  and nobody was struck, shot, downed or scored off. A throw or a Demolish
  counts only when it landed on nobody; a smoke pot always does (its cloud is
  on the thrower). A fire flask or a Demolish that lands on nobody but blasts
  low cover away (realm-arena.md §22, §23.3) still counts: the cover hurt
  nobody, and the snapshot holds what was blasted, so it comes back too. A
  mark only makes its target easier to hit, which hurts nobody, so it counts.
  Taking back an item's use puts the item back, since the snapshot holds it
  like everything else. `RealmArenaAct` declares `readonly undoable = true`;
  the source scan in `src/games/RealmArena/undo.test.ts` holds the list to
  that one command, and the guard beside it holds every action that pushed to
  no `recorded…` field.
- **What is not.** No attack, ever: an attack, an aimed shot, a crippling
  shot, a cleave, a shield bash, a fireball, or a flask or a Demolish that
  lands on someone, even a thunder flask that only stuns. A shot rolls, and a
  strike, a fireball or a flask hits someone both sides have watched it land
  on. Nor a move that sets off a watcher: an overwatch shot rolls, and a
  guard's strike — which rolls nothing — is still an attack on the mover, so a
  move into a watcher's sight stays made while the same move along an
  unwatched path can be taken back. That is decided off the events, not the
  kind, so it is Fires Out's `revealedAnyPoi` shape: whatever the command turned
  up decides. In fog of war (realm-arena.md §27) that is meant literally: an
  action after which the player's squad sees an enemy it didn't see before
  (`revealed`) stays done, or a player could step round a corner, look, and
  step back for free — and a move that found an unseen enemy in its way, and
  went round it, is never peaceful anyway. And anything that isn't peaceful **empties the stack**, not just
  moves the anchor: a move after an attack would otherwise push on top of the
  snapshots from before it, and undoing that move would put the anchor back in
  reach of a board from before the attack — a second go at its roll. None of
  it can end the game — only a knock-out or the last round's
  End turn does — so there is no winning-move exception to make. And the muster
  is out: it seals a squad and hands the turn on at once, so taking it back
  would need §5's hold for a choice nobody has asked to revisit.
- **`recordedRolls` is absent when nothing rolled.** It used to be written as
  `[]` on every action, which `consumedRandomness` reads as a roll by its key
  alone; a peaceful action now leaves it off. A replay of an older log still
  reads an empty array as "no rolls", so nothing recorded changes meaning.
- **No hold (§5)**, no `currentTurn` to restore: a turn only ever ends on the
  player's own End turn, or on the turn timer's, which plays the same
  `RealmArenaEndTurn`. `CheckEndTurn` empties the stack on every hand-off, so
  both are covered. The dropout adapter (free-for-all, B2) empties it too,
  because a snapshot taken before a player left would put their squad back.
  Depth `undoDepthOf(gs)`: one character's whole turn of one-AP moves, for
  the character with the most AP the battle's own catalogue can give it —
  four today, more under a catalogue with bonus AP (Slash and Dash). A turn
  spread over the squad can hold more than that, which only costs reach.
- **The cloner.** `cloneRealmArenaState` lives in `RealmArenaLogic.ts`, the
  only file that needs it — replay rebuilds the opening state from the seat
  order, as Dice Cities' did (§16).
- **Hidden information.** The snapshot is only ever taken in the battle, when
  the sealed musters are already empty and every squad is on the field. It is
  never sent anyway: `gameStateToModel` builds its return field by field and
  gains `canUndo` alone — the same expression as the other games.
- **Recap.** The shared recap engine drops an undo together with the command
  it reversed, so an action taken back leaves no row — nor a step in the
  review (`omitUndoneSteps`, §10).
- **The button.** `UndoButton`, beside End turn in `RealmArenaTurnEnd`'s
  `.ag-action-grid` row — End turn is always on the sheet during a battle turn,
  as in Fires Out. Taking an action back also clears the results card that
  showed what it did.

### The ninth game: World Domination

Train Time's and Dice Cities' shape — a turn-ending move that holds, a clocked
stack — but the first where several moves *before* the
turn-ender are undoable too, so the stack is deep (a run of placements), and the
first where the line between undoable and not is the game's whole premise:
**combat is dice, and combat never comes back.**

- **What is undoable.** `WorldDominationDeployArmies` (setup, reinforce and the
  top-up an attack-phase cash-in leaves), `WorldDominationCashInCards`,
  `WorldDominationOccupyTerritory`, `WorldDominationEndAttackPhase`,
  `WorldDominationFortify` and `WorldDominationSkipFortify`. Each spends armies
  or cards the player already holds, at a value read off the board, on spots
  they chose. A cash-in draws nothing — the cards are in the hand and the set
  pays what `cardSetsCashedIn` says — and it is no tell to take it back: the
  table was already told what the set paid. The source scan in
  `src/games/WorldDomination/undo.test.ts` holds the list to those six, and the
  guard beside it holds them to no `recorded…` field.
- **What is not, and why.** `WorldDominationAttack` rolls, so it never pushes —
  and, as in Realm Arena (§16, above), it also **empties the stack**, not just
  moves the anchor. A deployment made after a battle would otherwise sit on top
  of the snapshots from before it, and undoing that chain would put the board
  back to before the roll: a second go at it. After a battle the only thing
  reachable is what was played *since* it — the occupation of a conquest, say,
  whose snapshot is taken after the battle, so undoing it restores
  `pendingOccupation` while the conquest, the dice and `lastBattle` stay made.
  Only an attack can end the game (the last territory, scored by `CheckGameOver`
  outside any snapshot), so there is no winning-move exception to make. The end
  turn and the undo command themselves are not moves.
- **The hold (§5).** A fortify, a skipped fortify and the last placement of a
  setup allotment each end the turn, and each is a deliberate choice. Instead of
  `turnOver: true` they push, set `autoEndTurnAt` and return `turnOver: false`;
  `WorldDominationEndTurn`, valid only while `holdOpenFor` says the hold is the
  sender's own, is the board's *Pass now* and what it sends by itself when the
  countdown runs out. `CheckEndTurn` then does what the move used to do — the
  setup advance, or `riskEndTurn` — and empties the stack and the deadline on
  every hand-off. Every other command refuses while a hold is open
  (`holdOpenFor` at the top of each), so the move can't be added to: a second
  fortify, a deployment into a spent setup allotment. A skipped fortify now marks
  `fortifyUsed` as a fortify does, so the board offers nothing while it holds;
  the guards read the *hold*, not that flag, so a hold the turn timer moved past
  can't lock out the player who inherits the phase.
- **The end-of-turn card draw happens after the hold.** `riskEndTurn` draws from
  the hidden deck when the player conquered this turn. It runs only from
  `CheckEndTurn` after `WorldDominationEndTurn`, never inside the held move, so
  taking a fortify back can neither reveal a card nor leave one in a hand it
  has to come out of. The recap shows the card on the end turn, and still on the
  fortify or skip of a game recorded before the hold.
- **The turn timer closes a held turn.** A player who closed the app inside the
  hold would otherwise leave it open: the cron's plain step gave the next seat a
  spent setup pool (and every later pass repeated it, so setup never finished),
  or the fortify phase with their reinforcements and the conqueror's card draw
  skipped. So World Domination registers a turn-timeout adapter that builds one
  command, `WorldDominationEndTurn`, while `holdOpenFor` says the hold is live —
  recorded like any other, so a replay sees it too — and nothing otherwise.
  `plainAdvanceOtherwise` makes that "nothing" fall back to the plain advance, as
  if no adapter were registered (`noAdapter`, not `declined`), so every other
  expired turn does what it always did. That is also why each entry still records
  the `lastTurnTimestamp` it was pushed in, as Train Time's and Dice Cities' do:
  `liveUndoEntry` (through `undoEntryFor` / `holdOpenFor`) refuses one the clock
  has moved past. A push onto an entry that isn't live (not the pusher's, or from
  an earlier turn) starts a fresh stack rather than building on it, and always
  writes `autoEndTurnAt` — null for a move that holds nothing — so a deadline a
  timed-out turn left behind can never be read as the next move's own. The
  adapter makes `/api/game/taketurn` refuse the game, which is wanted: its plain
  step would bypass the hold and the card draw. The dropout adapter leaves the
  stack alone: a drop is recorded in `gameState`, not `specificGameState`, and
  changes nothing on the board, so no snapshot can put a seat back, and clearing
  would close another player's live hold without a hand-off. A hold is closed
  only by the board (the countdown), by *Pass now*, or by that adapter when the
  turn timer expires, so a player who leaves mid-hold keeps the next seat waiting
  until their own timer runs out — the same backstop §9 accepts for every game
  with a hold.
- **Depth.** `UNDO_STACK_DEPTH` is ten, in `board.ts`: a reinforcement can be
  placed one army at a time, so unlike the one-purchase games this has to reach
  back over a whole run of taps, with a cash-in and the end of the attacks on
  the same run. Each level is roughly 5 KB of JSON on every save; battles and
  hand-offs empty the stack, so it never builds up. Dropping the oldest only
  ever costs reach.
- **The cloner moved.** `cloneWorldDominationState` moved from
  `WorldDominationModels.ts` to `board.ts`, as Train Time's did: the logic
  needs it at runtime and the models import the logic through the `GameLogic`
  barrel, so importing it the other way would be a cycle. `board.ts` takes the
  state's types with `import type`; the models re-export it. The snapshot is the
  whole state (`undoStack: []`, `undoAnchorId: null` in the literal so a snapshot
  never nests one), and the schema's `undoStack` entries hold it as `Mixed`,
  with `?? []` at every read for a game stored before undo.
- **Hidden information.** Every hand and the card deck are in each snapshot and
  none of it is ever sent: `gameStateToResponse` builds its return field by field
  and gains `canUndo` and `autoEndTurnAt` alone, worked out by `CreateDataResponse`
  from the command log and the turn clock (`undoEntryFor`), both false/null for
  everyone but the mover. A replayed step never offers it. `hiddenHands.test.ts`
  and `undo.test.ts` pin it: no `undoStack`, no `undoAnchorId`, no card from
  the snapshot or the deck on the wire for any viewer. One leak is accepted:
  taking back a cash-in leaves its public "(+2 bonus armies on <territory>)"
  history line, so the table learns one territory card the player still holds.
  That is the player's own information, given away by their own choice to cash
  in and then undo, and it is accepted.
- **Replay and old logs.** A game recorded before the hold ended its turn inside
  the fortify, the skip or the last setup placement, so its log has no
  `WorldDominationEndTurn`. Replayed under today's rules the hold would never
  close and every later move would be refused. The replay adapter's
  `closeUnrecordedHold` (`worldDominationUnrecordedHoldEnd`) closes it the way
  the old rules did — a `WorldDominationEndTurn` from the holder, before any
  recorded command but the holder's own end turn or undo — and leaves no step or
  line of its own. The same goes for a log that *ends* on one of those moves —
  an in-flight game from before the hold — where no later command exists to close
  it: once the loop is done, if the live game's `currentTurn` has moved on from the
  replay's, the replay closes the hold the same way and the last step shows the
  hand-off (and the card it drew). A hold still open live has the same player on
  turn in both, so it is left alone; the hook is shared with Settlements & Cities
  and takes a null `next` for this case. Commands carry `recordedTurnStartedAt`
  like every game's, so a clocked entry goes stale in a replay at the point it
  did live.
- **Command version 2.** `commandVersion` in World Domination's `meta.ts` went
  from 1 to 2 (`docs/command-versions.md`). A tab still running the old bundle
  would send a Fortify, a SkipFortify or a last setup placement that used to end
  the turn and now only holds it, with no countdown on its screen; the bump has
  it reload instead. Recorded commands of version 1 or none replay as before,
  through `closeUnrecordedHold` above.
- **Recap and charts.** The shared recap engine drops an undo together with the
  command it reversed, so a deployment, cash-in, occupation or fortify taken back
  leaves no row. World Domination has no marker-style result chart to take back:
  its two charts read `armies` and `totalArmiesDeployed` straight off each step's
  state, and an undo restores both with the snapshot.
- **The board.** While a hold is open, `UndoHold` (Pass now, Undo, the countdown,
  and `WorldDominationEndTurn` sent by itself at zero) is the whole turn sheet and
  the map takes no taps. Otherwise `UndoButton` shares an `.ag-action-grid` row
  with *Done attacking*, *Skip fortifying* and the *Cancel* of a half-made
  attack or fortify, and sits alone in a row under the deploy, occupy and dice
  sheets. An undo clears whatever territory was selected on the map.
