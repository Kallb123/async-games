# Out-of-turn actions

**Status: proposal.** Nothing here is built yet, apart from the security fix in
§3.1, which ships alongside this document.

Every command in the app today is played by the player whose turn it is. That
rule is enforced in one place (the command route's turn gate) and *assumed* in
half a dozen more. This document is about cutting a small, deliberate hole in
it, so that a card the printed rules let you play "at any time" can be played
on a teammate's turn.

The motivating cards are the co-ops' specials:

| Game | Card | What §21.3's own-turn-only rule costs it |
|---|---|---|
| Outbreak | **Airlift** | The most of any Outbreak card (`outbreak-gdd.md` §21.3). You can only move a teammate while you are active, which is exactly when they can't use the move. |
| Outbreak | Government Grant, One Quiet Night, Resilient Population | Less — they are usually played in anticipation — but still only on one turn in N. |
| Banned Islet | **Helicopter Lift** | The escape can only be called on the holder's turn, so a team that is ready waits a full round for the holder to come back round. A lift that moves a teammate is only available on the holder's turn. |
| Banned Islet | **Sandbags** | Its whole point is reacting to a flood (`banned-islet.md` §21.3). Out-of-turn play recovers some of that; §5 says how much. |

The same hole is what Settlements & Cities' trading proposal needs to let a
player accept an offer on somebody else's turn
([`settlements-and-cities.md`](./games/settlements-and-cities.md) §10.3–10.4).
That section already worked through the security and replay consequences for
one command; this document generalises them into a platform mechanism, so the
co-ops and SAC trading are built on one path rather than two.

---

## 1. Recommendation in one paragraph

Take **Option A** (§4): a command *class* declares that it may be played out of
turn (`readonly playableOutOfTurn = true`). The route accepts such a command
from any seated, non-dropped player, and sends it down the **same pipeline with
four invariants the route enforces** rather than trusting each command to
remember them: it can't end or hand off the turn, can't run a follow-up, can't
touch the turn timer, and can't clear the sender's missed-turn count. The
server stamps it `recordedOutOfTurn`, which is how replay, recap and the
per-turn charts know not to treat it as the start of the sender's turn.
Everything about *which* card and *which* phase stays in the command's own
`Execute`, which can tell it is being played out of turn by the same test the
route used (`data.currentTurn !== this.senderId`) — a test that stays true on
replay once replay stops overwriting `currentTurn` for stamped commands. Ship
the engine first, then give the active player's screen a way to notice the
board moved under them, then turn it on for Outbreak and Banned Islet one
game at a time.

---

## 2. Where "one active player" is assumed today

Before choosing a design it's worth listing every place that would silently do
the wrong thing if a command arrived from someone other than `currentTurn`.
Each row is a thing the recommended design has to answer.

| # | Where | What it assumes | Consequence if ignored |
|---|---|---|---|
| 1 | `src/app/api/game/command/route.ts` — the `currentTurn` gate | Only the active player sends commands. It is also the only membership check most commands get: being `currentTurn` implies being seated. | The obvious one. Note that the existing `ignoresTurnGate` bypass skips membership too; an out-of-turn path must check it explicitly. |
| 2 | `ignoresTurnGate` in `src/utils/apiModels/gameCommand.ts` | The flag is the class's to declare. | It wasn't — see §3.1. Fixed in this PR. |
| 3 | `src/utils/games/replay.ts`, `applyCommands` | `state.currentTurn = command.senderId` before every command: *"Every command was executed on its sender's turn."* | A replayed interrupt makes the interrupter the active player for that step. If it is the last command, the review's "live" snapshot names the wrong active player; if any `Execute` or `CheckEndTurn` reads `currentTurn`, the replay diverges from the live game with no test failing. SAC §10.4 calls this "the landmine". |
| 4 | `replay.ts`, `replayTurnByTurn` | A change of `senderId` between consecutive commands is a new turn. | An interrupt splits one turn into three on the result page's per-turn charts, and misplaces event markers (Outbreak's epidemic icons). |
| 5 | `src/utils/games/recap.ts`, `buildEventFeed` | "Since you were last here" is everything after the viewer's own last event. | An interrupt the viewer played counts as "being here", and hides everything before it. Arguably right (they *were* here) — but a decision, not an accident. §5.6. |
| 6 | Route post-processing | Any valid command is the active player acting: it clears the sender's `missedTurnCounts`, and on `turnOver`/`timerRestarts` restarts the clock and pushes `YourTurn`. | An interrupt would reset the abandon ladder for a player who never takes their own turns, and a command that returned `turnOver` would pass the turn from someone who isn't holding it. |
| 7 | `ICommandOutcome.followUpCommand` (`commandPipeline.ts`) | The follow-up runs "exactly as if the player had sent it" — on their own turn. | A follow-up from an interrupt would run as the interrupter with the turn gate already behind it. |
| 8 | **The games' own phase-finishing helpers** | `maybeFinishDrawPhase(data, ps)` (Outbreak) and `maybeFinishFloodPhase(data, ps, …)` (Banned Islet) are passed the *sender's* player state and ask "is the hand back at the limit?" | This is the sharpest one. If the active player is in `phase: 'discard'` and a teammate plays a special, the helper checks the *teammate's* hand (under the limit), decides the discard is done, and runs the infect/flood phase — ending the active player's turn for them without their discard. Both `OutbreakPlayEvent` and `BannedIsletPlayCard` call these unconditionally today. |
| 9 | Client: `isPlayersTurn(...)` in each board page | Controls exist only on your turn. The turn sheet is inside `ReadOnlyPanel`; `OutbreakEventTray` renders only when `isMyTurn`; the map's click handler is `undefined` off turn. | No way to play the card, even once the server allows it. |
| 10 | Client: `useGameData`'s `waitingOnOpponent` poll | *"On the viewer's own turn nothing can move until they act."* | The active player's open board never shows the teammate's Airlift until they reload. Worse, their next command is built from a stale board (§5.7). Data-only pushes are banned (`sendPushToUsers`), so a push can't be the refresh signal on its own. |

Things that **don't** need to change, checked:

- **`requireLiveGame`** already refuses a finished game (409), so an out-of-turn
  command can't be played after a win the way SAC §10.3 feared — that gap has
  since been closed.
- **Optimistic concurrency.** `trySave` turns a `VersionError` into a 409, so
  an interrupt racing the active player's own command can't silently
  overwrite it; the loser resyncs (`useSubmitCommand`).
- **Hidden information.** Both co-ops have open hands, so an out-of-turn play
  discloses nothing a teammate couldn't already see. (SAC trading is where
  this bites, and §10.2a of its document covers it.)
- **The turn-timeout cron** plays the *active* player's stalled turn and never
  reads who sent the commands before it.
- **`isDropped`** already runs before the turn gate's consequences, so a dropped
  player can't use an out-of-turn path to come back.

---

## 3. What this PR already does

### 3.1 Security fix: `ignoresTurnGate` could be claimed by a request body

`ignoresTurnGate(command)` read `command.ignoresTurnGate` off the command
instance. That instance is the request body, rehydrated by `deserializeJSON`,
whose reviver `Object.assign`s every posted property onto a fresh instance of
the named class (`readonly` is compile-time only). So any seated player could
post

```json
{ "className": "SACRollDice", "gameId": "…", "senderId": "<me>", "ignoresTurnGate": true }
```

and pass the turn gate with **any** command class, not only `RaceCarsUndo`.
`SACRollDice.Execute` never checks whose turn it is — it relies on the gate,
as the architecture intends — so that body rolls the dice on another player's
turn. The same goes for every command in every game that trusts the gate. The
route test added alongside the fix fails on the old code (the forged roll is
accepted on the other player's turn) and passes on the new.

This is exactly the hole SAC §10.3 predicted for a body-controlled `offTurn`
field. The shipped flag had it.

**The fix** reads the flag off a *fresh* instance of `command.constructor`.
`constructor` is one of the three keys `Serialisable.ts` refuses to copy, so it
is always the class that was really constructed, and a fresh instance carries
only what that class declares. The existing `readonly ignoresTurnGate = true`
declarations and the source-scan tripwire test are unchanged.

Every class-declared marker the route reads **must** be read this way. §5.1
factors it into one helper so the out-of-turn flag can't repeat the mistake.

---

## 4. Options

### Option A — a per-class exception, same endpoint *(recommended)*

The shape suggested in the brief: specific commands take a different logical
path through the same `POST /api/game/command` when the sender isn't
`currentTurn`.

- A command class declares `readonly playableOutOfTurn = true`, read through the
  same fresh-instance helper as `ignoresTurnGate`.
- The route, seeing a sender who isn't `currentTurn`, lets the command through
  only if its class declares the flag, and only after an explicit membership
  check.
- It runs through `runCommand` with an `outOfTurn` option that enforces the
  invariants of §5.2 centrally.
- The command's `Execute` decides everything else — which card, which phase —
  because it is the only place that knows the game's rules.

**For:** one endpoint, one pipeline, one recorded history, replay and recap for
free once §5.4 lands; the per-game logic stays in the per-game file, and the
engine stays game-agnostic. It is exactly the SAC §10.3 design, generalised.
**Against:** the flag is class-wide, so a class that mixes on-turn and
out-of-turn kinds (`OutbreakPlayEvent` has `play`, `retrieve` and
`forecastOrder`) has to police the split inside `Execute`. That's a few lines,
and a test per kind.

### Option B — dedicated interrupt command classes

The same route mechanism as A, but with new classes that only ever run out of
turn — `OutbreakInterruptEvent`, `BannedIsletInterruptCard` — sharing the
existing `apply…` helpers.

**For:** the flag describes the whole class, so the tripwire list reads as "these
are the interrupts" and a reviewer can't miss an on-turn kind leaking through.
**Against:** two classes for one card, and a choice the client has to make
("am I on turn? then send the other class"); the history, recap and replay
adapters each grow a second case for what a player sees as the same act. The
duplication rule in `AGENTS.md` points at A.

**Verdict:** A, with B as the fallback if a class's out-of-turn split in
`Execute` turns out to be hard to review. The two are compatible — the route
work is identical.

### Option C — a separate endpoint

`POST /api/game/[gameid]/interrupt`, like the reaction or nudge routes.
**Rejected**, for the reasons SAC §10.3 already gives for a trade route: it
re-implements the deserialise → strip → gate → execute → record → save → push
sequence the command route owns, and anything that mutates state outside
`commandHistory` is invisible to replay. It would drift within a release.

### Option D — let the active player spend a teammate's card

No out-of-turn path at all: widen `OutbreakPlayEvent`/`BannedIsletPlayCard` with
a `fromUserId`, so whoever is active can play a special out of *any* teammate's
hand. Consistent with the existing deviations ("Airlift needs no consent";
"the Navigator moves a teammate without consent") and with open hands.

**For:** zero engine or route change, no replay change, no client polling
change. A day's work per game.
**Against:** it takes the decision away from the card's holder, which is the
opposite of what the printed rules give them. It fixes Helicopter Lift's escape
(whoever is active can call it) but not the thing Airlift is for — the holder
noticing, between turns, that a teammate is in the wrong place.

**Verdict:** a legitimate interim if Option A slips, and possibly worth
keeping *alongside* A as a house rule toggle. Not a substitute.

### Option E — reaction windows

After the step a card wants to react to (Banned Islet's flood draw, Outbreak's
epidemic between *Infect* and *Intensify*), the command pauses in a new
`phase: 'reaction'`, and teammates get a window to respond before a follow-up
resumes it — the same hold-then-follow-up shape as SAC's undo hold
(`docs/undo.md` §5).

**For:** the only option that restores the card's *timing* — Sandbags played
in response to the flood card that would sink a tile.
**Against:** each window stalls the table for however long it's open. The
Banned Islet GDD already rejected a pause for the forced swim on exactly this
ground. It needs a timer, a "nobody wants to" resolution, and a cron path.

**Verdict:** out of scope for this plan. Revisit only if the out-of-turn cards
still feel weak once A ships.

### Option F — standing orders

A player arms a conditional in advance — "if the flood draw would sink Fools'
Landing, Sandbag it" — stored in `specificGameState` and consumed by the
engine inside the drawing command's own `Execute`.

**For:** timing without stalling; async-native.
**Against:** a small rules language per card, a UI to author it, and a
hidden-information question in any competitive game (an armed order is a
secret). Recorded like any command (`GameArmOrder`), and consumed
deterministically, so replay would cope.

**Verdict:** the interesting long-term answer to Option E's problem, and a
separate design document when it is wanted.

### Comparison

| | Holder decides | Recovers timing | Engine change | Replay change | Client change | Cost |
|---|---|---|---|---|---|---|
| **A** per-class exception | ✅ | Between commands | Route + pipeline | Yes (§5.4) | Yes | Medium |
| B dedicated classes | ✅ | Between commands | Same as A | Same as A | Same as A | Medium+ |
| C separate endpoint | ✅ | Between commands | New route | Breaks | Yes | High, rejected |
| D spend a teammate's card | ❌ | No | None | None | Small | Low |
| E reaction windows | ✅ | ✅ | Pipeline + cron | Yes | Large | High |
| F standing orders | ✅ (in advance) | ✅ | Per game | Small | Large | High |

**What no between-commands option recovers.** Outbreak's draw and infect
phases and Banned Islet's draw and flood phases are resolved atomically, inside
one `OutbreakEndTurn` / `BannedIsletEndTurn`. There is no moment between the
flood card and the sink when anyone else's command could land. Under A:

- **Airlift and Helicopter Lift** recover almost everything — moving a teammate
  is rarely time-critical to the second.
- **One Quiet Night and Resilient Population** recover their "any time" — both
  are played ahead of the thing they soften.
- **Sandbags** recovers "dry a tile on a teammate's turn, before *their* draw",
  but still can't answer a flood card as it's drawn. That needs E or F.
- **Forecast** stays own-turn-only (§5.5).

---

## 5. The recommended design in detail

### 5.1 The declaration

`gameCommand.ts` gets one helper that every class-declared marker goes through:

```ts
/** A marker only the command's class can set — never the request body (see §3.1). */
function declaredByClass(command: IGameCommand, marker: string): boolean {
    const declaringClass = (command as object).constructor as new () => unknown;
    return (new declaringClass() as Record<string, unknown>)[marker] === true;
}

export const ignoresTurnGate    = (c: IGameCommand) => declaredByClass(c, "ignoresTurnGate");
export const playableOutOfTurn  = (c: IGameCommand) => declaredByClass(c, "playableOutOfTurn");
```

`playableOutOfTurn` is deliberately **not** the same flag as `ignoresTurnGate`.
`RaceCarsUndo` isn't an interrupt: it acts on the turn it is undoing, it
*restores* `currentTurn`, and it is trusted to police its own authority
entirely. An out-of-turn command is the opposite — a genuine act by a player
who isn't holding the turn, which must leave the turn exactly where it was.
The route treats them differently (§5.2), so they are declared differently.

A tripwire test like `ignoresTurnGate.test.ts` lists every class declaring
`playableOutOfTurn`, so adding one needs a reviewer to see its `Execute` gate.

SAC's trading proposal calls the same idea `offTurn` and suggests a route-side
allowlist. Both are safe; the class declaration keeps the route free of game
names (§6's "the engine is game-agnostic"), and the tripwire *is* the
allowlist. SAC §10.3 should be updated to point here when trading is built.

### 5.2 The route and the pipeline

```
auth → readCommand → stripRecordedRandomness → requireLiveGame
const onTurn = userId === gameData.currentTurn
if (!onTurn):
    if ignoresTurnGate(cmd)              → as today (RaceCarsUndo)
    else if playableOutOfTurn(cmd):
        userId ∉ userIdList              → 403 "Not a player in this game"   ← new
        → out-of-turn path
    else                                 → 400 "Not your turn in this game"
isDropped / senderId / isCommandForGameType checks                          ← unchanged
cmd.recordedOutOfTurn = !onTurn && playableOutOfTurn(cmd)                   ← server-stamped
runCommand(gameData, gameType, cmd, { outOfTurn: cmd.recordedOutOfTurn })
```

A class that declares `playableOutOfTurn` is still played *on* turn through the
ordinary path — the flag widens who may send it, it doesn't change what it does
for the active player. `Airlift` played on your own turn stays exactly what it
is today.

The **out-of-turn invariants**, enforced in `runCommand` (so replay and the
route share them) and in the route, never left to each command:

1. **No hand-off.** `CheckEndTurn` is skipped. If `Execute` returns
   `turnOver: true` without the game being over, that's a bug in the command
   (row 8 in §2 is exactly such a bug waiting to happen): the outcome is
   treated as an invalid move, and the document isn't saved.
2. **No follow-up.** An outcome's `followUpCommand` is ignored — the same rule
   the pipeline already applies to a follow-up of a follow-up.
3. **`CheckGameOver` still runs.** A Helicopter Lift that calls the escape out
   of turn ends the game through the ordinary game-over branch: `finishGame`,
   the result, the pushes.
4. **The route leaves the clock alone.** No `lastTurnTimestamp` restart, no
   `timerWarningNotificationSent` reset, no `YourTurn` push, and **no
   `missedTurnCounts` reset** for the sender: playing a card on a teammate's
   turn isn't taking your own, and a player who only ever interrupts should
   still climb the abandon ladder.

### 5.3 Telling the command it is out of turn

`Execute` needs to know, because the rules differ (§5.5). The test is the
one the route used:

```ts
const outOfTurn = data.currentTurn !== this.senderId;
```

No new field on the command, no new parameter on `Execute`, and nothing the
client can supply. It gives the same answer on replay once §5.4 stops replay
overwriting `currentTurn` for stamped commands — which is why the two have to
land in the same PR.

### 5.4 Recording and replay

- **`recordedOutOfTurn`**, stamped by the route *after* `stripRecordedRandomness`
  (so a client can't forge it — the `recorded…` prefix gets that for free). It
  joins `RECORDED_FOLLOW_UP_TO_ID` as an exception in `consumedRandomness`,
  because it marks how a command was played, not a random outcome. It must be
  excluded there, or every interrupt reads as having consumed randomness, and
  the undo guards (`docs/undo.md` §6) refuse it for the wrong reason.
- **`applyCommands`** sets `state.currentTurn = command.senderId` only for an
  unstamped command. A stamped one runs with `currentTurn` left where the
  previous command's `CheckEndTurn` put it, which is where it really was.
- **`replayTurnByTurn`** doesn't treat a stamped step as a turn boundary, and
  doesn't let it move `previousSenderId`. The interrupt's effects are sampled
  at the end of the turn it happened in.
- **Planning** (`timeline` route) is untouched: it clamps every planned command
  to the caller and only plans the caller's own turn.

### 5.5 The two games' rules

**Outbreak — `OutbreakPlayEvent`:**

| Kind / card | Out of turn? | Why |
|---|---|---|
| `play` Airlift, Government Grant, One Quiet Night, Resilient Population | ✅ while the active player's phase is `actions` or `discard` | §12's "any time", within what between-commands can mean. |
| `play` Forecast | ❌ | It moves the *game's* phase to `forecast` and needs a second command to resolve. Out of turn, that locks the active player out of their own turn until the forecaster comes back, and the turn-timeout adapter would resolve it with the identity order on the active player's clock. |
| `retrieve` (Contingency Planner) | ❌ | Costs an action; actions are an on-turn resource. |
| `forecastOrder` | ❌ | Only the Forecast's player can finish it, on their own turn. |
| Any kind while phase is `forecast` | ❌ | Already refused today: never mid-resolution of another card. |

A card is spent from the *sender's* hand or Contingency slot, as today. Out of
turn, `Execute` **must not** call `maybeFinishDrawPhase` — the draw phase
belongs to the active player (§2 row 8). The Medic's passive clear on an
airlifted Medic (`withMedicNote`) works unchanged.

**Banned Islet — `BannedIsletPlayCard`:**

| Card | Out of turn? | Notes |
|---|---|---|
| Helicopter Lift (move) | ✅ in `actions` or `discard` | The holder decides where the team goes, between anyone's commands. |
| Helicopter Lift (escape call) | ✅ | The win condition is still checked at the moment it's played (`isEscapeReady`). Ends the game through invariant 3. |
| Sandbags | ✅ in `actions` or `discard` | "Shore up anywhere, free", on any turn. |

Out of turn, `Execute` **must not** call `maybeFinishFloodPhase` (§2 row 8).
Its `recordedFloodShuffles` is only ever filled by that call, so an
out-of-turn play consumes no randomness at all.

Both games put the decision in their isomorphic `rules.ts`
(`outOfTurnPlayable(gs, cardId)` or similar), so the board screen offers only
what the server will accept — the same rule `docs/new-game.md` sets for every
legality question.

**History copy.** The line stays the player's own ("{{bea}} played Airlift,
moving a teammate from Atlanta to Lagos"). A table reading the log a day later
benefits from knowing it happened on someone else's turn, so append it when
stamped — "…, on {{ann}}'s turn" — in the history line and `myString()` alike,
so the log, the review and the recap keep one vocabulary
(`turn-recap-and-planning.md`, "What each action is called").

### 5.6 Recap

`buildEventFeed` windows on the viewer's own last event. A player who
interrupted since their last turn would get a feed starting after the
interrupt. **Recommended:** window on the viewer's last *on-turn* event — the
"since you were last here" card is about your turn, and an Airlift you played
two hours into a teammate's turn doesn't mean you saw everything after it. It
needs the recap adapters' events to carry whether their step was stamped; the
replay step already has the command, so `replayEvents` can pass it through.

The interrupt itself shows in everyone's feed as an ordinary event by its
actor, which it is.

### 5.7 The active player's screen

Two problems, one cause: the active player's board doesn't poll, so it doesn't
see an interrupt.

1. **Staleness.** They see the teammate's Airlift only on reload. Fix:
   `useGameData`'s poll condition gains "…or it's my turn in a game that has
   out-of-turn commands". Which games those are is client metadata — a
   `hasOutOfTurnPlays` in the game's `meta.ts`, next to the rest of what the
   client knows about a game — rather than a new field on the response.
2. **Stale intent.** A command is built against the board the player saw, but
   runs against the board as it is now. If a teammate airlifted them between
   the two, "Drive to Lagos" may still be legal from the new city and mean
   something they never chose. Fix: an optional `expectedCommandCount` on a
   command, set by the client from the history length it rendered; the route
   answers 409 "The board changed — take another look" when it doesn't match.
   It is a request field that can only make the sender's *own* request fail, so
   it needs no server trust. `useSubmitCommand` already resyncs on any refusal.
   Send it only from boards of games with `hasOutOfTurnPlays`, at first.

A *visible* push to a player an interrupt affected ("Bea airlifted you to
Lagos") is a nice-to-have. It needs a notification channel with a sender behind
it (the rule at the top of `notificationPreferences.ts`), so it arrives as its
own PR if it's wanted — not bundled with the refresh work.

### 5.8 The board screens

Off turn, the turn sheet stays inside `ReadOnlyPanel` — nothing about the
active player's sheet becomes tappable. The out-of-turn affordance is the
specials themselves:

- **Outbreak:** `OutbreakEventTray` renders outside the `ReadOnlyPanel`
  whenever the viewer holds a card `outOfTurnPlayable` says yes to, not only
  when `isMyTurn`. The page's `onCityClick` is live while an out-of-turn
  targeting (`OutbreakEventTargeting`) is armed, and only for its targets.
- **Banned Islet:** the special-card flow at the top of the page (the
  `BannedIsletPlayCard` builder around `page.tsx:208`) gets the same treatment:
  armed from the viewer's own hand, off turn, and the board's
  `onPositionClick` is live only for that pick.

If the two pages grow the same "armed out-of-turn pick" state machine, that is
the signal to extract it into `src/utils/hooks/` rather than copy it — the
component-reuse rule. They likely will: both are "a card from my hand, a
target on the board, submit".

---

## 6. Implementation plan

Each PR is independently shippable and leaves `main` green. Commits are listed
in order. Every code PR runs `npm run build`, `npx tsc --noEmit`,
`npm run lint` and `npm test`, plus the review crew named against it.

### PR 1 — Security fix and this plan *(this PR)*

1. **Read `ignoresTurnGate` off the command's class, not the request body.**
   `gameCommand.ts`; `ignoresTurnGate.test.ts` rewritten to use real rehydrated
   commands, and its tripwire now also asks every registered class the way the
   route does; a route test that a forged flag gets "Not your turn" and nothing
   is recorded.
2. **Docs: plan out-of-turn actions.** This document.

Crew: `locksmith`.
What's new: none — a fix to a hole no player should have been using.

### PR 2 — Engine: the out-of-turn path

No game uses it yet, so nothing a player can see changes.

1. **Factor class-declared markers through `declaredByClass`.** `ignoresTurnGate`
   moves onto it; `playableOutOfTurn` is added. Unit tests for both, including
   forged-body cases.
2. **Add `recordedOutOfTurn`.** The constant, its exclusion in
   `consumedRandomness`, tests.
3. **`runCommand`'s `outOfTurn` option.** Skip `CheckEndTurn` and follow-ups;
   refuse `turnOver` without game over. Unit tests with a test-double command.
4. **The route's out-of-turn branch.** Membership check; stamp; call
   `runCommand` with the option; no clock, missed-turn or `YourTurn` side
   effects. Route tests for each invariant, each refusal (stranger, dropped,
   undeclared class), the game-over branch, and a forged `recordedOutOfTurn`.
   The tests need a declared command; a test-only class registered in the test
   file, and added to `COMMANDS_BY_GAME_TYPE` by the test's own stub, keeps real
   games out of it. If that proves awkward, move this commit into PR 4 and
   test against Outbreak.
5. **Replay: an out-of-turn command doesn't take the turn.** `applyCommands`
   and `replayTurnByTurn`. Tests: a timeline with an interrupt last ends on the
   right `currentTurn`; per-turn stats count one turn, not three.
6. **Recap: window on the viewer's last on-turn event.** Tests.
7. **Tripwire test** for `playableOutOfTurn` (initially empty list).
8. **Docs.** `ARCHITECTURE.md` §4 and §6 (the pipeline steps), the replay line
   in `turn-recap-and-planning.md` ("Every command was executed on its sender's
   turn" stops being true), and a pointer from SAC §10.3–10.4 to here.

Crew: `locksmith`, `gremlin`, `croupier` (replay and recap adapters).
What's new: none.

### PR 3 — The active player sees the board move

1. **`hasOutOfTurnPlays` in `GameMeta`**, false everywhere.
2. **`useGameData` polls on your own turn in such a game.** Test the poll
   condition.
3. **`expectedCommandCount`.** Route check (409), `useSubmitCommand` sends it
   for games with the flag, route tests (match, mismatch, absent).

Crew: `gremlin`, `caveman`.
What's new: none — nothing uses it yet.

### PR 4 — Outbreak: event cards on a teammate's turn

1. **`outOfTurnPlayable` in `Outbreak/rules.ts`**, with tests for the §5.5
   table.
2. **`OutbreakPlayEvent` plays out of turn.** Declare `playableOutOfTurn`;
   refuse Forecast, `retrieve` and `forecastOrder` out of turn; skip
   `maybeFinishDrawPhase` out of turn; the "on {{name}}'s turn" copy. Tests: each
   card out of turn; the active player's `discard` phase is left open by a
   teammate's play (§2 row 8's regression test); an interrupt then a replay
   gives the same board.
3. **Add to the tripwire list.**
4. **Board screen.** `OutbreakEventTray` off turn, and off-turn targeting on
   the map. `hasOutOfTurnPlays: true` in `meta.ts`.
5. **Recap adapter** copy for an interrupt, if it needs any beyond the history
   line.
6. **Docs and player copy.** `outbreak-gdd.md` §21.3: replace the
   own-turn-only deviation with what §5.5 allows and why Forecast stays
   own-turn. The game guide's "Your turn" section. The tutorial, if a step
   says "only on your turn".
7. **What's new** — one enhancements line, e.g. *"Outbreak: play Airlift and
   other event cards on a teammate's turn"*.

Crew: `rulebook`, `croupier`, `caveman`, `gremlin`.

### PR 5 — Banned Islet: specials on a teammate's turn

The same shape as PR 4, for `BannedIsletPlayCard`: `outOfTurnPlayable` in
`rules.ts`; declare the flag; skip `maybeFinishFloodPhase` out of turn; an
out-of-turn escape ends the game through the ordinary game-over branch (route
test); the board screen's special-card pick off turn, extracted into a shared
hook with Outbreak's if it came out the same (§5.8); `banned-islet.md` §21.3
rewritten (Sandbags' "loses the most" note updated to what it now recovers and
what it still can't); guide; tutorial; its own What's new line — *"Banned
Islet: call the Helicopter Lift or throw Sandbags on a teammate's turn"*.

PRs 4 and 5 stay **separate branches, each with its own What's new line** —
decided, for smaller reviews. PR 5 reuses whatever shared hook PR 4 extracted
for the off-turn card pick rather than growing its own.

Crew: `rulebook`, `croupier`, `caveman`, `gremlin`.

### Later, optional

- **PR 6 — Tell the moved player.** A visible push for a player an interrupt
  moved, on a new notification channel with its preferences toggle.
- **PR 7 — Settlements & Cities trade acceptance** adopts `playableOutOfTurn`
  instead of SAC §10.3's route allowlist. Its own design already exists; the
  engine work would be done.
- **Option D as a house rule**, if tables ask for it.
- **Option F (standing orders)** as its own design document, if Sandbags
  still feels weak after PR 5.

---

## 7. Decisions and open questions

**Decided:**

- **An interrupt is allowed during the active player's `discard` phase**, as
  well as their `actions` phase. A teammate's card doesn't touch the discard,
  and invariant 1 (§5.2) plus the games' own "never finish a phase out of
  turn" rule (§5.5) stop it from closing the phase.
- **Outbreak and Banned Islet ship as two PRs** (§6, PRs 4 and 5).

**Open:**

1. **Should an interrupt appear in the active player's "since you were last
   here" feed on their *next* turn?** It will, as an ordinary event. If that
   reads oddly ("Bea played Airlift" during your own turn), the recap adapter
   can drop events that happened within the viewer's own turn.
2. **Rate.** Out-of-turn plays are bounded by the cards in a hand, so no rate
   limit is proposed. A future out-of-turn command that isn't a spend-once
   card (a trade offer, a chat-like ping) will need one.
3. **Forecast out of turn**, via a variant that resolves in one command (the
   player submits the new order along with the play, having seen the six cards
   in a preview)? That would need the preview to be a read-only route that
   reveals the top of the infection deck to one player — a hidden-information
   change worth its own review. Not in this plan.
