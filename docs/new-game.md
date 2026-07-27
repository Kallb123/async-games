# Adding a new game

This is the step-by-step companion to [`ARCHITECTURE.md`](../ARCHITECTURE.md)
§12 ("Adding a new game"). Read that section first for the *why* — this doc is
the practical checklist plus the gotchas that only show up once you've
actually built one. It's written from experience adding **Solitaire**, the
first solo game, alongside the existing multiplayer games (Snakes & Ladders,
Dice Cities, Smartthink, Settlements & Cities, World Domination).

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
   fewer classes to wire into the registration array, less duplicated
   validation logic.

## The checklist

Everything below lives in one new folder, `src/games/<Game>/`, except the
handful of one-line additions to shared files in the last step.

### 1. Domain layer — `src/games/<Game>/<Game>Models.ts`

- `<Game>InvitationModel`: a `Schema` discriminating `InvitationModel`, with a
  `CreateGame(invite, userIdList)` method that rolls turn order (if relevant)
  and returns the initial `IGameData`, built by:
- `buildInitial<Game>State(...)` — the deterministic starting
  `specificGameState`. Reused by `CreateGame` *and*, if you add turn recap
  later, the replay adapter.
- `<Game>GameDataModel`: a `Schema` discriminating `GameDataModel`, with a
  `CreateDataResponse()` method that calls:
- `gameStateToModel(specificGameState)` — converts internal state to the
  client-facing DTO shape. **Redact anything the player shouldn't see yet**
  (see "Don't leak hidden information" below).
- *(Optional)* `compute<Game>ResultStats(gameData)` +
  `format<Game>ResultStats(stats)` + a schema def, if your game has
  interesting per-game stats worth recording in `GameResult` (see
  `ARCHITECTURE.md` §5, "Match results"). Skip this if there's nothing
  game-specific worth tracking beyond the base win/loss/turns fields.

### 2. Response DTOs — `src/games/<Game>/apiModels.ts`

`I<Game>GameStateResponse` (the shape `gameStateToModel` produces) and
`I<Game>GameDataResponse extends IGameDataResponse`.

### 3. Rules — `src/games/<Game>/<Game>Logic.ts`

- One `@serializable class <Game>GameType implements IGameType`:
  `CheckEndTurn` (advance `currentTurn`, or a no-op for solo games) and
  `CheckGameOver` (set `complete`/`winner` when finished).
- One `@serializable` class per command, `implements IGameCommand`. Each
  `Execute` validates against current state, returns
  `{ validMove: false }` and mutates nothing if illegal, or mutates
  `specificGameState` in place, appends a line to `gameState.history`, and
  returns `{ validMove: true, turnOver }`.
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
  multiplayer games) `useTurnNavigation`/`TurnNavControls`/`useTurnRecap`.
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
| `src/utils/mongodb/mongodb.ts` | the discriminator key in both union types, and the model in both records inside `initialiseDiscriminators()` |
| `src/app/api/invite/accept/route.ts` | an `else if` branch instantiating `<Game>GameDataModel` |
| `src/app/api/game/command/route.ts` | every command/game-type instance in the `registration` array |
| `src/utils/mongodb/GameResultData.ts` | *(only if you added `compute<Game>ResultStats`)* the discriminator + wire it into `GAME_RESULT_STATS` |

### 7. (Optional) Turn recap / planning

If your game should support "since you were last here" recap or planning
mode, add `src/games/<Game>/recap.ts` (an `IRecapAdapter`) and register an
`IReplayAdapter` in `src/utils/games/replay.ts`. Both are opt-in — see
[`docs/turn-recap-and-planning.md`](./turn-recap-and-planning.md). A solo
game with no "away time" to recap (nothing happened without you — you're the
only player) can skip this entirely; build a one-off victory/summary screen
instead, shown when `complete` flips true.

## Gotchas (learned the hard way on Solitaire)

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
of the shared accept route beyond the one `<Game>GameDataModel` branch every
game needs regardless (Solitaire's `SolitaireModels.ts` /
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
   wiring line if you forgot one of the additions in step 6.
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
5. Run the **`caveman`** agent (or its `caveman-review` skill) against the new
   files before committing, per `AGENTS.md` — it catches missed reuse and
   copy-pasted markup that the checks above don't.
