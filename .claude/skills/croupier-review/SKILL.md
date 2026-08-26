---
name: croupier-review
description: >-
  Croupier's hidden-information review for the Async Games repo — does the
  server send a player anything they should not be able to see? Use when
  reviewing a response builder, a DTO, a command outcome, a game's
  specificGameState, a replay/recap snapshot, or a push notification — e.g.
  "does this leak hidden state?", "can the client read the secret code?", "is
  my hand redacted?", "check the wire", "croupier review". Carries the repo's
  redaction contract (CreateDataResponse(viewerId), publicGameState,
  counts-for-opponents, the plannable allowlist) and the finding format. The
  croupier agent depends on this skill; humans can invoke it directly too.
---

# Croupier review

The one question: **can a player open dev-tools and read something the game is
keeping from them?**

Cards dealt face down stay face down. In an async game there is no shared
table — every player's view is a JSON response built by the server, and a leak
is invisible on screen precisely because the UI only ever renders the count.
Both leaks this repo has actually had (World Domination's territory cards,
Settlements & Cities' resource composition and dev cards) looked perfect in the
browser and shipped every opponent's hand in the payload.

So: **assert on the wire, not on the typings.** A TypeScript interface that
omits a field is not redaction. `JSON.stringify(response)` is the truth.

## Step 1 — Know what changed

- Branch/PR: `git diff main...HEAD --stat`, then read each changed file.
- The files that matter most: any `src/games/<Game>/<Game>Models.ts`
  (`CreateResponse`, `CreateDataResponse`, `gameStateToResponse`), any
  `apiModels.ts`, any `ICommandOutcome` subtype in a `<Game>Logic.ts`, any
  `IReplayAdapter`, `src/utils/mongodb/GameData.ts`, and
  `src/utils/firebase/notificationContent.ts`.

## Step 2 — Name the secrets

Before checking anything, write down what *this* game hides and from whom. A
field is hidden state if a player could gain by knowing it early. In the games
that exist today:

| Game | Hidden from opponents |
|---|---|
| Smartthink | the secret code (until the game ends) |
| Settlements & Cities | resource composition, dev card identities |
| World Domination | territory cards |
| Train Time | hand, kept destination tickets |
| Any game with RNG | the recorded roll/draw of a move not yet played |

Anything not on a game's list is public and needs no redaction — do not
manufacture a finding by declaring a public field secret.

## Step 3 — The checklist

### A. Documents are never sent raw

`CreateDataResponse(viewerId)` / `CreateResponse()` build a DTO. Two specific
hazards:

- **`gameState`** must go through `publicGameState(gameState, history?)`
  (`src/utils/mongodb/GameData.ts`), which returns `{ turnOrder, history }` and
  drops `commandHistory`. That log holds every move ever played, secret fields
  and recorded RNG included. TypeScript cannot hold this line on its own —
  excess-property checks don't apply to whole-object assignment or spreads, so
  `gameState: doc.gameState` type-checks and ships everything → **CARDS FACE
  UP**.
- **`specificGameState`** must go through the game's own
  `gameStateToResponse(state, names, viewerId)`. Spreading the Mongoose
  sub-document, or `.toObject()`ing it into the response, ships the internal
  shape → **CARDS FACE UP**.

### B. `viewerId` is required, and it is actually used

The parameter is non-optional *so that a new game has to answer the question*.
Check three things:

1. It is threaded all the way down — route → `CreateDataResponse` →
   `gameStateToResponse`. A signature that takes `viewerId` and never reads it
   is the leak, and it type-checks fine.
2. **The viewer gets their own hidden state; everyone else gets a count.** The
   established shape:
   ```ts
   resourceCount: total(ps.resources),
   resources: userId === viewerId ? { ...ps.resources } : undefined,
   ```
   An opponent entry carrying identities rather than a count →
   **CARDS FACE UP**.
3. **`viewerId` can be `null`** — recap and result replays build snapshots with
   nobody in particular asking. Null must mean *nobody's* hidden state, not
   *everybody's*. Counts still have to be right.

### C. The same redaction on the replay path

`IReplayAdapter.toResponseState` takes the same `viewerId` so recap and
planning snapshots are redacted exactly like the live response. A new adapter
that reuses the raw state converter, or drops the viewer on the way through,
leaks through recap even when the live response is clean → **CARDS FACE UP**.

### D. Planning is an oracle unless it is allowlisted

Planning replays hypothetical commands against the real reconstructed state, so
an unfiltered plan answers questions the live game is keeping from the planner
— a planned Smartthink guess is scored against the real secret code, which
solves the game. `plannableCommands` is a per-game **allowlist, default deny**
(`src/utils/games/replay.ts`). Adding a command to a game's `plannableCommands`
is a leak decision: it is only safe if resolving that command consumes no
hidden state and no un-recorded randomness. A new entry with neither → **CARDS
FACE UP**.

### E. Command outcomes and history lines

Both go to the client, and both are easy to overlook:

- `ICommandOutcome` subtypes carry extra data back to the mover (dice results,
  peg feedback). The response goes to whoever POSTed the command — fine — but
  check nothing rides along that the *next* fetch would have redacted.
- **`gameState.history` is a public log read by everyone in the game.** A
  history line that says what a player drew, kept or was dealt leaks it in
  plain English past every other check. "Priya drew a card" is fine; "Priya
  drew Wheat" is not, unless the game plays it face up.

### F. Randomness not yet resolved

The `recorded*` fields (`recordedRoll`, `recordedShuffles`,
`recordedStealIndex`, …) exist so replay reproduces a move. A recorded value
for a move that hasn't been played yet — a pre-rolled die, a
pre-shuffled deck order persisted at game creation — is next turn's answer
sitting in the response. Deal it when it's played, or keep it out of the DTO.

### G. The guards, and the list you must edit

- `src/utils/apiModels/games/publicGameState.test.ts` holds
  `RESPONSE_BUILDERS`, an **explicit** list of every file implementing
  `CreateDataResponse` — games are listed by hand there deliberately, so that
  adding a game without adding it to the list is a failure rather than a silent
  pass. A new game's `Models.ts` missing from that array → **CROUPIER
  SQUINTS** (the guard isn't guarding it).
- `src/utils/apiModels/games/hiddenHands.test.ts` is the pattern to copy for a
  new game with hidden state: give the hidden thing an id no other field could
  contain, then assert `JSON.stringify(response)` does **not** contain it, for
  the viewer, for an opponent, and for `null`. A game that redacts with no such
  test → **CROUPIER SQUINTS**.

### H. Pushes say what happened, to the right person

`src/utils/firebase/notificationContent.ts` builds "your move" copy by replaying
the game and describing the event the player missed. That copy lands on a lock
screen. It must describe only what its recipient may see — the same redaction
question, in prose.

## Step 4 — Report

Group by severity. Every finding names the **field**, the **viewer who
shouldn't see it**, and the **line of the response that carries it** — plus the
fix.

```
CROUPIER WATCHES THE DEAL 🃏

CARDS FACE UP 🃏
- src/games/TrainTime/TrainTimeModels.ts:212 — every player entry carries
  `hand`, so `GET /api/game/[gameid]` hands each player every opponent's
  cards; the UI only renders a count, so nothing on screen shows it.
  Follow SAC: `handCount: ps.hand.length`, `hand: userId === viewerId ?
  [...ps.hand] : undefined`.
- src/games/TrainTime/TrainTimeModels.ts:190 — `gameState: doc.gameState`
  ships commandHistory, which holds every drawn card. Use
  publicGameState(doc.gameState).

CROUPIER SQUINTS 👀
- src/utils/apiModels/games/publicGameState.test.ts:16 — TrainTimeModels.ts
  isn't in RESPONSE_BUILDERS, so the shared shape guard skips it. Add the line.

DECK SEALED 🂠
- WorldDomination's toResponseState passes viewerId straight through, so recap
  snapshots redact the same way the live response does. Good.
```

Nothing leaks → say so plainly and stop. A game that shapes counts for
opponents, threads `viewerId`, and has a `hiddenHands`-style test earns a
**DECK SEALED** and nothing more.

## Croupier does NOT

- Edit files. Review and report only.
- Guard the doors — auth, IDOR, forged request fields and rate limits are the
  **locksmith's** job. (One overlap worth naming: a client-supplied
  `recordedRoll` is the locksmith's; a *server-sent* one is the croupier's.)
- Judge whether the game rules are correct, only whether the wire says too much.
- Call a public field a leak. Turn order, history of *public* moves, counts,
  usernames and scores are meant to be seen.
- Accept a type signature as proof. If the finding can't be shown in
  `JSON.stringify(response)`, it is not a leak.
