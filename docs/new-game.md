# Adding a new game

This is the step-by-step companion to [`ARCHITECTURE.md`](../ARCHITECTURE.md)
§12 ("Adding a new game"). Read that section first for the *why* — this doc is
the practical checklist plus the gotchas that only show up once you've
actually built one. It's written from experience adding **Solitaire**, the
first solo game, and **Train Time**, alongside the earlier multiplayer games
(Snakes & Ladders, Dice Cities, Smartthink, Settlements & Cities, World
Domination).

For the component-reuse rules you must follow while building the UI, see
[`AGENTS.md`](../AGENTS.md) — this doc assumes you've read it.

## Before you write any code

1. **Reuse first.** Check `src/components/ui/`, `src/utils/ui/`,
   `src/utils/hooks/`, and the `ag-*` classes in `src/app/ag-theme.css` for
   anything your game's UI needs — a picker, a stat tile, a modal pattern, a
   toggle row. Building a new game is exactly when the temptation to hand-roll
   something is highest; resist it the same as anywhere else in the codebase.
2. **Decide multiplayer vs. solo.** This affects the turn timer (see
   "Solo games" below) and whether `CheckEndTurn` needs to actually advance
   `currentTurn` or can be a no-op.
3. **Sketch `specificGameState` and the moves.** Write down the shape of your
   game's state and the list of distinct player actions *before* opening an
   editor. Prefer a small number of generic, parameterized commands (e.g.
   Solitaire's one `SolitaireMoveCard { source, destination, count }` covering
   every zone-to-zone transition) over one class per near-identical move —
   fewer classes to wire into the command registry, less duplicated
   validation logic.
4. **Decide your recap story now, not later.** Turn recap and the
   "since you were last here" card are opt-in *features*, but they are not an
   opt-in *design consideration* — they replay your command history, so they
   constrain how state and commands are built. Three decisions are nearly free
   while you're writing the game and expensive-to-impossible afterwards:

   - **Can the starting state be rebuilt from persisted fields?** If anything
     is shuffled at creation and then consumed during play (a deck that
     shrinks, a hand dealt face-down), the answer is no and you need a
     persisted `initialSpecificGameState` snapshot — decided in `CreateGame`,
     on day one.
   - **Does every `Execute` that touches `Math.random` record its outcome?**
   - **Does your response converter redact per viewer?** That's fine — the
     replay adapter takes a viewer — but the converter still has to be a pure
     function of state, name map and that viewer.

   The reasons these can't wait, and what each costs, are in
   [§7](#7-turn-recap--planning) — read it *before* step 1, not after step 6.

## The checklist

Everything below lives in one new folder, `src/games/<Game>/`, except the
handful of one-line additions to shared files in the last step.

### 1. Domain layer — `src/games/<Game>/<Game>Models.ts`

- `<Game>InvitationModel`: a `Schema` discriminating `InvitationModel`, with a
  `CreateGame(invite, userIdList)` method that rolls turn order (if relevant)
  and returns the initial `IGameData`, built by:
- `buildInitial<Game>State(...)` — the deterministic starting
  `specificGameState`. Reused by `CreateGame` *and* by the replay adapter that
  turn recap needs, so keep it a pure function of persisted fields. If it
  shuffles anything that gets consumed during play, persist an
  `initialSpecificGameState` snapshot here too — see §7(a), and note that this
  is the one decision you cannot make retroactively.
- `<Game>GameDataModel`: a `Schema` discriminating `GameDataModel`, with a
  `CreateDataResponse(viewerId)` method — the viewer is the signed-in player the
  response is for, and it's required so a game with hidden information can't
  inherit the everybody-sees-everything view by accident — that calls:
- `gameStateToModel(specificGameState)` — converts internal state to the
  client-facing DTO shape. **Redact anything the player shouldn't see yet**
  (see "Don't leak hidden information" below). Keep it a pure function of its
  arguments: state, the username map, and — if your game redacts per player —
  the viewer, which the replay adapter passes down (§7(c)).
- *(Optional)* `compute<Game>ResultStats(gameData)` +
  `format<Game>ResultStats(stats)` + a schema def, if your game has
  interesting per-game stats worth recording in `GameResult` (see
  `ARCHITECTURE.md` §5, "Match results"). Skip this if there's nothing
  game-specific worth tracking beyond the base win/loss/turns fields.
  Add `format<Game>Charts(stats)` too if a number is worth watching *move* —
  a score, a resource, a race. Those series aren't stored per turn by the
  game; `computePerTurnStat` replays the finished match to recover them, so
  they're free once your game replays at all (§7).

### 2. Response DTOs — `src/games/<Game>/apiModels.ts`

`I<Game>GameStateResponse` (the shape `gameStateToModel` produces) and
`I<Game>GameDataResponse extends IGameDataResponse`.

### 3. Rules — `src/games/<Game>/<Game>Logic.ts`

- One `@serializable class <Game>GameType implements IGameType`:
  `CheckEndTurn` (advance `currentTurn`, or a no-op for solo games) and
  `CheckGameOver` (set `complete`/`winner` — and, for a co-op game, an
  `endReason` of `'teamwin'`/`'teamloss'` — when finished).
- One `@serializable` class per command, `implements IGameCommand`. Each
  `Execute` validates against current state, returns
  `{ validMove: false }` and mutates nothing if illegal, or mutates
  `specificGameState` in place, appends a line to `gameState.history` — built
  with `playerHistory(this.senderId, ...)` so the line names its player by
  token, never by a name that can change (`src/utils/games/history.ts`) — and
  returns `{ validMove: true, turnOver }`.
- **Any `Execute` that consumes randomness records its outcome on the command**
  (`this.recordedRoll ?? DiceRoll(6)`) — §7(b). Do this as you write the
  command, not as a later pass: commands already in `commandHistory` can never
  be given the field retroactively.
- If your validation logic is non-trivial (legal-move computation, sequence
  checks, scoring formulas), put it in a separate pure `rules.ts` module
  instead of inlining it in the command classes — see "Isomorphic rules
  modules" below for why.

### 4. Metadata — `src/games/<Game>/meta.ts`

A `GameMeta` object: `url`, `name`, `categories` (from
`GAME_CATEGORIES` in `src/utils/ui/games.ts` — add a new category there if
none fit, it's a single source of truth other UI derives from), `players`,
`tagline`, `accent`, `glyph` (or `art` if you have real artwork), `available`.

### 5. UI

- `src/games/<Game>/components/` — board + action components, built from
  `src/components/ui/` primitives wherever the shape matches.
- `src/app/newgame/<game>/page.tsx` — a thin setup screen using
  `GameSetupLayout` + `UserInviteList` + `TurnTimerSelect` (skip the latter two
  for a solo game — see below).
- `src/app/games/<game>/[gameid]/page.tsx` — a thin board screen using
  `GameShell`, `useGameData`, `usePushEvents`, `useEndGame`, and (for
  multiplayer games) `useTurnNavigation`/`TurnNavControls`/`useTurnRecap`
  (§7).
- `src/games/<Game>/guide.ts` *(optional)* — a `GameGuide` (a title plus a
  handful of `{heading, body}` sections) for the how-to-play popup. The board
  screen shows it with `useGameGuide('<game>')`, a `key: 'guide'` row in its
  `GameOption`s, and `{gameGuide.open && <GameGuideModal guide={…} …/>}` — the
  same six lines on every board that has one. Keep it to five sections, `Goal`
  first, then `Your turn`, matching the existing guides.
- `src/app/api/newgame/<game>/route.ts` — creates the `Invitation` document.

### 6. Wire the shared files

Each of these is a single addition to a file *outside* your game folder, and
each is checked automatically by `src/games/gameRegistry.test.ts` or
`src/utils/apiModels/games/serializableRegistry.test.ts` — get the wiring
wrong and `npm test` fails with a message naming the exact file/line to add,
rather than the game breaking silently at runtime.

| Shared file | What to add |
|---|---|
| `src/utils/apiModels/GameLogic.ts` | `export * from "@/games/<Game>/<Game>Logic";` |
| `src/utils/ui/games.ts` | import the `meta.ts`, add it to `GAME_META` |
| `src/utils/mongodb/mongodb.ts` | the discriminator key in both union types, and the model in both records (`GAME_DATA_MODELS` and `INVITATION_MODELS`) |
| `src/utils/games/gameCommands.ts` | the game type's `className` as a key, its command `className`s as the list |
| `src/utils/mongodb/GameResultData.ts` | *(only if you added `compute<Game>ResultStats`)* the discriminator + wire it into `GAME_RESULT_STATS`, with a `charts` entry if you added per-turn series |
| `src/utils/ui/gameGuides.ts` | *(only if you added a `guide.ts`)* import it and add it to `GAME_GUIDES` — the popup can't record itself as seen without this, so it re-shows every visit |

### 7. Turn recap & planning

Whether your game *ships* recap is a choice. Whether you *design for* it isn't
— see step 4 of "Before you write any code". Both the "since you were last
here" catch-up card and the step-back-through-past-turns controls work by
replaying `commandHistory` from the starting state, so a game that wasn't built
with replay in mind can only get recap for games created *after* the retrofit.
Existing games are stuck without it forever: you can't go back and record dice
rolls that were rolled months ago.

That asymmetry is the whole reason this section sits in the checklist rather
than in a "nice to have later" pile. The full design is in
[`docs/turn-recap-and-planning.md`](./turn-recap-and-planning.md); this is the
decision you have to make and the four things it costs.

#### First, decide

| Your game is… | Do this |
|---|---|
| Multiplayer | Design for replay (below) and ship at least the recap adapter. Every multiplayer game except Smartthink has one. |
| Multiplayer, but hidden-information/deduction | Design for replay anyway, then deliberately **opt out** of recap and planning, and write down why — Smartthink's recap would hand out free feedback about the secret code. Say so in the per-game table in `turn-recap-and-planning.md`. |
| Solo | Skip all of it. Nothing happens while you're away, so there's no gap to recap; build a one-off victory/summary screen shown when `complete` flips true (see `SolitaireVictoryScreen`). |

Planning adds a question of its own: can a *hypothetical* turn be shown
to a player without disclosing what the live game is hiding? The answer
turns on whether your randomness is memoryless (dice) or stateful (deck
order), and on whether the step that touches the deck is its own
command. That last one is a command-surface decision you cannot cheaply
reverse, so read
[what can be planned](./turn-recap-and-planning.md#planning-what-can-be-planned)
alongside this section rather than after shipping.

Then record the outcome in the per-game table in
[`turn-recap-and-planning.md`](./turn-recap-and-planning.md#per-game-status) —
whether it's ✅, ✖ by design, or 🚧 not yet. A game missing from that table is
the bug this section exists to prevent.

#### Then, build for it

**a. A reproducible starting state.** Export `buildInitial<Game>State(...)`,
use it in `CreateGame`, and make it a pure function of persisted fields.
If creation-time randomness is *consumed* during play — a shuffled deck that
shrinks, a hand dealt down, tickets drawn — it can't be read back off the live
state, and you must instead persist the whole starting state:

```ts
// in CreateGame
initialSpecificGameState: clone<Game>State(specificGameState, turnOrder),
```

plus a second Mongoose path using the *same* sub-schema factory, and
`recapAvailable: !!doc.initialSpecificGameState` on the response so games
created before the field simply don't offer recap. Build your
`clone<Game>State` on `clonePlayerStates` (`src/utils/games/mongoMaps.ts`),
passing a per-player clone that **names every field** — a Mongoose subdocument
keeps its fields behind getters, so `{ ...ps }` silently copies none of them and
your replayed players start with `undefined` everywhere. Settlements & Cities,
World Domination and Train Time are the reference implementations — and
Train Time is the cautionary tale, retrofitted a release late, so every game
already dealt by then has no recap and never will. **Do this at creation
time even if you're not shipping recap yet** — it is one field, it costs
nothing, and it's the only part that cannot be added retroactively.

**b. Recorded RNG on every command that rolls.** The first execution records
its outcome onto the command, and replay reuses it:

```ts
const roll = this.recordedRoll ?? DiceRoll(6);
this.recordedRoll = roll; // persisted with the command in commandHistory
```

Commands are stored as `Schema.Types.Mixed`, so the recorded field persists for
free. Watch for randomness hidden inside shared helpers and for a *variable*
number of draws per command (SAC's discard-on-7 loop, a deck reshuffle during a
market refill) — thread a small recorder object through the helper and store
the resulting draw log on the command, the way `SACRandomLog` and Train Time's
`TrainTimeShuffleLog` do.

**c. A replay-friendly response converter.** `gameStateToModel(state,
userIdNameMap, viewerId)` must be a pure function of its arguments.
`IReplayAdapter.toResponseState` passes the viewer down from `buildTimeline`,
so a **viewer-scoped DTO is fine** — if your game redacts per viewer (hands,
face-down cards, secret tickets), take the third argument and shape in that
player's secrets and nobody else's, the way Train Time does. Don't reach for
the live document to fill the gap locally.

Recap **events** are the one place this doesn't apply: they describe what
happened to whoever reads the feed, so `toEvents` must stay to what the whole
table can see (Train Time names a face-up card taken, never a blind draw).

**d. The adapters and the wiring.**

| File | What to add |
|---|---|
| `src/utils/games/replay.ts` | `registerReplayAdapter({ className, buildInitialSpecificGameState, toResponseState })` |
| `src/games/<Game>/recap.ts` | an `IRecapAdapter`: `toEvents` (one replayed command → display events), `summarize`, optional `tip` (the green advice box) and `postProcess` (fold two commands that are one logical action into one row) |
| `src/utils/games/recap.ts` | `import "@/games/<Game>/recap";` — **`gameRegistry.test.ts` fails without it**, since an unimported adapter never registers and the feed silently returns nothing |
| `src/app/games/<game>/[gameid]/page.tsx` | `useTurnRecap(gameId)` + `<TurnRecapScreen …>` (one `if (recap.show)` early return; the page supplies only its call-to-action wording), and `useTurnNavigation` + `TurnNavControls` for the step-back controls; render `nav.displayedState`, drive the log from `nav.displayedHistory`, and disable interactive controls while `!nav.isLive` |

Add a `recap.test.ts` alongside the adapter (see `DiceCities/recap.test.ts`) —
it's plain snapshot-in, events-out, so it needs no Mongo or Clerk. If your game
records RNG, add a `replay.test.ts` too (see `TrainTime/replay.test.ts`): it
replays a played-out game with `Math.random` stubbed to throw, which is the only
cheap way to know a recorded outcome actually covers every random path.

**Planning mode** (queueing hypothetical future turns) is a further opt-in on
top of replay, and it takes two: `plannableCommands` on your replay adapter,
which is what the server will actually run, and `canPlan` on `TurnNavControls`,
which is what the board offers. `plannableCommands` is required and starts
empty — leave it empty until you have done the
[what can be planned](./turn-recap-and-planning.md#planning-what-can-be-planned)
analysis, because planning replays your commands against the game's real state
and anything on that list resolves against real hidden information. Only Snakes
& Ladders has planning today. Getting (a)–(c) right is what keeps the option
open.

## Gotchas (learned the hard way on Solitaire)

**Recap code can be added later; recap *data* cannot.** The adapters, the
route, the card — all of that can be bolted on any time. What can't is the
`initialSpecificGameState` snapshot and the `recorded…` fields on commands:
those are written *as a game is played*, so a game that ships without them has
its history permanently un-replayable, and every table already in flight when
you retrofit is excluded for good. Settlements & Cities and World Domination
both carry a `recapAvailable` flag precisely because their pre-change games can
never be recapped. Pay the one field and the `?? DiceRoll(6)` up front even if
recap itself is a later milestone.

**`Schema.Types.Mixed` doesn't auto-track in-place mutations.** If any part of
your `specificGameState` is `Schema.Types.Mixed` (reach for this when a zone's
shape is a plain nested array/object, not a `Map` of per-player subdocuments),
Mongoose only notices a *top-level reassignment* of that field
(`state.stock = newArray`), not `state.stock.push(...)` or
`state.tableau[i].splice(...)`. Every command that mutates a Mixed field must
call `gameData.markModified('specificGameState')` before returning — the same
reason the command route itself calls `markModified('gameState.commandHistory')`
after pushing onto it. Easiest to write one small `markDirty(gameData)` helper
and call it at the end of every `Execute`. (Games using
`Schema.Types.Map`-of-subdocuments, like Snakes & Ladders'
`playerPositions`, don't need this — subdocument mutations *are* tracked.)

**Solo games still go through the invite/accept engine — don't fork it.**
`IInvitationData.userIdList` is the *invitee* list, not including the sender,
and `/api/invite/accept`'s "has everyone accepted?" check
(`inviteData.userIdList.every(...)`) is vacuously `true` for an **empty**
list. So a solo game's `POST /api/newgame/<game>` creates an invitation with
`userIdList: []` and returns its `inviteId`; the setup page immediately calls
the existing, unmodified `POST /api/invite/accept`, which completes on that
very first call. This reuses 100% of the existing engine — no special-casing
of the shared accept route at all (Solitaire's `SolitaireModels.ts` /
`src/app/api/newgame/solitaire/route.ts` /
`src/app/newgame/solitaire/page.tsx` are the reference implementation). Also
hardcode `turnTimer` to `UNLIMITED_TURN_TIMER` (from
`src/utils/games/TurnTimer.ts`) for a solo game and skip `TurnTimerSelect` in
setup — there's no opponent to time out against, and the cron job already
treats `unlimited` as never-expiring.

**Isomorphic rules modules save you from duplicating validation logic.**
If the client needs to compute "what are my legal moves right now" (a
picker/hint UI, like Solitaire's tap-to-move sheet), write that logic as pure
functions in a `rules.ts` that has no server-only imports, and import it from
both the command classes (server-side `Execute`) and the client components.
This works as long as the functions only ever need to know *whether* a card
is present, not its hidden identity — which is exactly what "don't leak
hidden information" (below) already guarantees.

**Don't leak hidden information over the wire.** If any part of your state is
supposed to be secret from the player (face-down cards, an opponent's
in-progress selection), make sure `gameStateToModel` actually redacts it in
the DTO, not just in what the UI happens to render — the raw network response
is trivially inspectable. Solitaire's `gameStateToModel` strips `rank`/`suit`
from any card with `faceUp: false`, and sends the stock as a bare
`stockCount: number` rather than an array of opaque objects, since individual
stock cards are never individually inspectable or targetable anyway.

The failure mode to watch for is subtler than "we forgot": it is a DTO that was
correct on screen and wrong on the wire. World Domination and Settlements &
Cities both shipped *every* player's hand to every player for months, and
neither looked broken, because both board screens only ever rendered a count
for opponents. Two rules that would have caught it:

- **Send the count, not the contents.** Hand *size* is usually public and
  usually all the scoreboard needs; identities almost never are. Give every
  player a `<thing>Count`, and send the thing itself only to its owner —
  `cardCount`/`cards` in World Domination, `resourceCount`/`resources` in
  Settlements & Cities, `handCount`/`myHand` in Train Time.
- **Assert on the serialised response, not the typings.** A per-player field
  that is `undefined` for everyone else is only redacted if it's absent from
  `JSON.stringify(response)`. See
  `src/utils/apiModels/games/hiddenHands.test.ts`.

And take care that the *derived* views stay honest too: your recap adapter reads
the same redacted snapshots, so compute its deltas from the public counts
(Settlements & Cities' monopoly and discard rows do) rather than from a
composition that is only present for one player.

**Build genuinely reusable pieces, not per-game copies, for anything a future
game might also need.** Solitaire needed a "card" concept; since more card
games are likely, the deck/shuffle domain logic went in
`src/utils/games/Cards.ts` (parallel to the existing `DiceRoll.ts`) and the
visual card went in `src/components/ui/PlayingCard.tsx` (parallel to
`Dice.tsx`/`DieFace.tsx`) — both fully game-agnostic, neither importing
anything Solitaire-specific. Ask "could the *next* game reuse this
unmodified?" before putting something game-specific in `src/games/<Game>/`.

## Verification

Before considering the game done:

1. `npx tsc --noEmit` and `npm run build` must pass.
2. `npm test` must pass — `serializableRegistry.test.ts` and
   `gameRegistry.test.ts` scan the source and fail with the exact missing
   wiring line if you forgot one of the additions in step 6. Note what it
   *can't* check: it verifies a `recap.ts` you wrote is imported by the engine,
   but nothing fails if you never wrote one. Recap coverage is on you, not on
   CI — which is exactly how games have shipped without it before.
3. Consider adding a `<Game>Logic.test.ts` alongside your rules module (see
   `SettlementsAndCitiesLogic.test.ts` or `SolitaireLogic.test.ts` for the
   pattern: a tiny in-memory `makeGame()`/`cmd()` harness, no real Mongo/Clerk
   needed, since `Execute`/`CheckGameOver` only ever touch the plain
   `IGameData`-shaped object you hand them). This is especially valuable if
   you can't get a real dev environment (Mongo URI, Clerk keys) running to
   playtest by hand — a full-game simulation test (auto-play using your own
   legal-move computation until a win or a clean stalemate, asserting card/
   resource conservation throughout) catches state-corruption bugs that
   `tsc`/`build` never will.
4. Play a full game by hand in a real dev environment if you can — the
   automated checks catch wiring and logic bugs, not "does this feel right."
   If you shipped recap, open the game as a second player and check the
   catch-up card and the step-back controls on a real game — replay
   determinism has no automated guard.
5. Run the **`caveman`** agent (or its `caveman-review` skill) against the new
   files before committing, per `AGENTS.md` — it catches missed reuse and
   copy-pasted markup that the checks above don't.
