# Robustness review

A sweep of the API layer, game engine, data models, crons and client hooks
looking for the things that break under conditions the happy path never
tries: a request body that isn't what it claims, a Clerk call that answers
less than it was asked for, a game that finished while somebody was still
mid-turn, one bad record poisoning a whole sweep.

It follows the two robustness changes that came before it — putting the
invitation-to-game handover in a transaction (#304) and stopping the silent
pushes that were costing iOS players their notifications (#303) — and picks up
where those left off. Every finding below is recorded with its status, whether
it was fixed here or deliberately left.

**Status key:** ✅ fixed · ❌ not fixed, with the reason and what it would
take.

---

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Clerk lookups didn't pass a limit, so only 10 users resolved | High | ✅ |
| 2 | A manually-ended game could still be played | High | ✅ |
| 3 | `turnTimer` was never validated server-side | High | ✅ |
| 4 | Two `findOne` results used without a null check | Medium | ✅ |
| 5 | Nothing checked a command belonged to the game it targeted | High | ✅ |
| 6 | One bad game or user aborted an entire cron sweep | High | ✅ |
| 7 | Post-commit push failures surfaced as request failures | Medium | ✅ |
| 8 | The turn-timer sweep loaded every live game | Medium | ✅ |
| 9 | `GameData` had no indexes at all | High | ✅ |
| 10 | No rate limit on the credential and enumeration endpoints | Medium | ✅ |
| 11 | `isAuthorisedCron` failed *open* on a missing secret | High | ✅ |
| 12 | The deserialiser let a body choose an instance's prototype | Low | ✅ |
| 13 | The device-token list was uncapped, against an 8KB ceiling | Medium | ✅ |
| 14 | No error boundaries anywhere | High | ✅ |
| 15 | No fetch had a timeout | Medium | ✅ |
| 16 | `useGameData` didn't guard its `res.json()` | Low | ✅ |
| 17 | `useGameData` seeded state with `{} as T` | Medium | ✅ |
| 18 | The double-submit guard read state, not a ref | Low | ✅ |
| 19 | `/api/users` redirected from a JSON route | Low | ✅ |
| 20 | The command route rebuilt a dead 50-item array per request | Low | ✅ |
| 21 | Request bodies were parsed unguarded across 19 routes | Medium | ✅ |
| 22 | `/api/dev/*` wipes were unauthenticated on preview | Low | ✅ |
| 23 | No integration tests over route handlers | Medium | ❌ |
| 24 | Seven copies of the game-setup prologue | Medium | ✅ |
| 25 | Two copies of the constant-time compare | Low | ✅ |

---

## Live bugs

### 1. Clerk lookups didn't pass a limit ✅

`usersById` and `usersByUsername` called `getUserList({ userId: [...] })` with
no `limit`. Clerk's `GET /users` answers with **ten** when nothing asks for
more — a default, not a cap — so a filtered lookup that looked like "fetch
these thirty" returned the first ten and left twenty unresolved.

Everything downstream resolves an unmatched id to `UNKNOWN_PLAYER_NAME`, so a
dashboard busy enough to name more than ten people started calling most of them
"Unknown player". `buildUserDirectory` resolves the union of every id on the
screen — live games, invitations, **and every completed game ever** — so it hit
this first and hardest. `/api/users` called `getUserList()` bare, so the invite
picker only ever offered ten users, whoever they happened to be.

The codebase already knew: `friends/route.ts` passed `limit: 500` and
`forEachClerkUser` passes `limit: 100`. The two shared helpers didn't.

**Fixed.** Both helpers go through one `usersByFilter`, which chunks the filter
into pages of 100 and asks for each with an explicit limit — chunked rather
than one large limit because the filter travels in the query string. Every
direct `getUserList` call site in the app now routes through these two helpers
rather than calling Clerk itself, so there is one place left that can get this
wrong. `/api/users` pages through `forEachClerkUser`.

*Files:* `src/utils/users/clerk.ts`, `src/app/api/users/route.ts`, and the
twelve call sites converted to the helpers.
*Tests:* `src/utils/users/clerk.test.ts` — an explicit limit on every call, and
a 250-id lookup coming back complete over three pages.

### 2. A manually-ended game could still be played ✅

`complete` was only ever enforced *incidentally*, through `currentTurn`: a won
game clears it in `CheckGameOver`, and the turn-timer cron clears it when it
abandons one. So "is it your turn?" happened to also answer "is this game still
on?" — except on the one path that doesn't clear it. `/api/game/end` marked the
game complete and left the turn where it was, and neither `/api/game/command`
nor `/api/game/taketurn` checked `complete` (`/api/game/nudge` did).

So if a player ended a game while it was somebody else's turn, that player could
keep playing it. Their moves landed on a game that had already written its
`GameResult`, and `recordGameResult` is idempotent on `gameId` — so a game that
subsequently "won" kept the `ended` result it had been given. Two records of the
same game, permanently disagreeing about how it finished.

**Fixed.** Both doors are shut. `/api/game/end` now clears `currentTurn` like
the other two end paths, and the check lives on the routes that mutate, in a
shared `requireLiveGame` guard, rather than depending on every future route
remembering.

*Files:* `src/utils/games/liveGame.ts` (new), `src/app/api/game/end/route.ts`,
`command/route.ts`, `taketurn/route.ts`.

### 3. `turnTimer` was never validated server-side ✅

`parseTurnTimerMs` answers `0` for anything not on its ladder, and `isExpired`
compares elapsed time against that — so an unrecognised timer means *every turn
has already expired*. Every `/api/newgame/*` route and the lobby route took
`turnTimer` straight off the request body into the document. The only thing that
had ever stopped this was the client sending one of the values its own dropdown
offered.

A game created with `turnTimer: "2h"` — plausible, not on the list — has every
turn expire on the timer cron's first pass and is abandoned outright after three
of them.

**Fixed.** `isValidTurnTimer` checks against the canonical ladder, and all eight
creation routes reject an unknown timer with a 400 before writing anything.

`TurnTimerSelect` kept a second hand-written copy of the ladder for its labels,
so the dropdown and the timers the server understands agreed by luck — and once
the server started rejecting unknown timers, a drifted option would have been a
dropdown entry that 400s on submit. There is now one `TURN_TIMER_OPTIONS`, with
`TURN_TIMER_VALUES` derived from it and the select mapping over it.

*Files:* `src/utils/games/TurnTimer.ts`, `src/components/ui/TurnTimerSelect.tsx`,
`src/app/api/lobby/route.ts`, the seven `newgame` routes.
*Tests:* `src/utils/games/TurnTimer.test.ts` — including the `"2h"` case and the
proof that it expires immediately.

### 4. Two `findOne` results used without a null check ✅

`taketurn/route.ts` and `command/route.ts` used the result of
`GameDataModel.findOne` straight away. Every other route in the app checks. A
bogus `gameId` was a 500 rather than a 404.

In `command` it was worse: the body was deserialised and `myString()` called on
it *before* `auth()` ran, so an unauthenticated `POST {}` threw a TypeError
before anyone had proved who they were.

**Fixed.** Both go through `requireLiveGame`, which covers all three of "was an
id given", "does it exist" and "is it live". The command route authenticates
first and reads the body second.

### 5. Nothing checked a command belonged to the game it targeted ✅

`/api/game/command` deserialises the body into a command and calls
`Execute(gameData)`. Every `Execute` opens by casting the game to its own shape
— `gameData as ISnakesAndLaddersGameData`, then straight into
`specificGameState.playerPositions`. Nothing checked the command was one of that
game's own.

A `SolitaireAutoSolve` aimed at a Train Time game passed the `currentTurn` check
and landed in Solitaire's rules holding Train Time's state: a 500 halfway
through at best, a half-applied mutation saved over a real game at worst.

**Fixed.** `gameCommands.ts` maps each game type's `className` to the commands it
owns, and the route refuses anything else with a 400. `ARCHITECTURE.md`, the
`GameLogic` barrel comment and `docs/new-game.md` were repointed at it — they all
still told a new contributor to add their classes to the deleted `registration`
array (finding 20), which would have left their commands rejected.

*Files:* `src/utils/games/gameCommands.ts` (new),
`src/app/api/game/command/route.ts`.
*Tests:* `src/utils/games/gameCommands.test.ts`, plus
`serializableRegistry.test.ts` now fails if a `@serializable` class is missing
from the map, listed under two games, or listed but no longer exists.

---

## Failure isolation

### 6. One bad game or user aborted an entire sweep ✅

The turn-timer cron's loop had no per-game `try`/`catch`, and `sendPushToUsers`
didn't catch either — `sendEach` throws outright on an FCM auth or network
failure. One Clerk 500 or one FCM blip on the third game and every game after it
went unswept until the next tick. Because each run walks the same order, a game
that failed *consistently* starved everything behind it indefinitely.

`forEachClerkUser` had the same shape, over every user in the instance.

**Fixed.** Each game is swept inside its own `try`, and the response now reports
a `failed` count alongside `expired`/`warned`/`abandoned` so a run that partly
failed says so. `forEachClerkUser` isolates each `visit` the same way.

The handler is now the loop and nothing else: the ~90 lines it was wrapping came
out into `sweepGame` and the three things it can decide to do (`abandonGame`,
`passTurnOn`, `warnTurnExpiring`), each returning what it did so the loop is
`tally[await sweepGame(game)]++`.

*Files:* `src/app/api/cron/turntimer/route.ts`, `src/utils/users/clerk.ts`.

### 7. Post-commit push failures surfaced as request failures ✅

`startGameFromInvitation` awaited the opening "your move" push *after* its
transaction committed, and the `newgame` routes awaited `sendGameInvitePush`
after `invite.save()`. A Firebase outage therefore answered "couldn't start your
game" for a game that had already started — and the natural retry created a
second invite.

**Fixed.** `sendPushToUsers` no longer throws at its caller. A push is something
that happens *because* of a turn, an invite or a game ending, never something
those are waiting on, so a send failure is logged and reported as zero devices
reached. That single change covers all ten call sites, including the cron.

The return value is now devices *reached* rather than devices attempted, which
is what the one caller that reads it (the dev test bench) actually wants.

*File:* `src/utils/firebase/pushNotification.ts`.

### 8. The turn-timer sweep loaded every live game ✅

`GameDataModel.find({ complete: false })` pulled every active game — full
`commandHistory` and all — into memory, serially, with no ordering. On a
platform with a request deadline that is one timeout away from being silently
truncated partway through, with no record of where it got to.

The first pass at this narrowed the query to games a run could plausibly act on
and sorted them oldest-turn-first, and left the rest — whole documents, serial,
no deadline — as a follow-up. This is that follow-up, and it closes the finding.

**Fixed**, in three parts.

**The query asks per timer rather than once for all of them.** A single cutoff
across the whole ladder is only ever as tight as the *shortest* timer allows —
five minutes — so a 7-day game whose turn started six minutes ago was still
read, in full, every tick, to be put straight back. `actionableTurnFilter` now
builds one `$or` branch per timer, each bounding `lastTurnTimestamp` by that
timer's own warning threshold (total minus warning: eight minutes for the
10-minute timer, six days for the 7-day one). Unlimited games are excluded by
construction rather than by an exclusion clause — they aren't on the ladder,
because they never expire and never warn.

It is still derived from `TIMER_MS` rather than written down, and still compares
`lastTurnTimestamp` as the ISO-8601 string it is (every writer produces it with
`toISOString()`, which is fixed-width and UTC, so lexicographic order is
chronological order).

**The read is projected, and the whole document is fetched only when there is
something to do.** `findSweepCandidates` reads four fields per game — `gameId`,
`turnTimer`, `lastTurnTimestamp`, `timerWarningNotificationSent` — `lean()`,
oldest turn first. On any given tick most candidates have nothing due, and those
now cost four fields instead of a whole game's `commandHistory` and state.

What made this a refactor rather than a `.select()` is that the *actions* do
need a full document — `trySave`'s optimistic concurrency, `recordGameResult`'s
`commandHistory`, the recap engine's replay for the push copy. So the decision
was separated from the action: one predicate, `needsSweeping`, asked twice.
Once against the projected candidate, to decide whether the document is worth
loading; then again against the document once loaded.

The second ask is not belt and braces. The two reads are separate queries, and
in between them the player whose turn it is may have taken it — which moves
`lastTurnTimestamp` and `currentTurn` on. Acting on the candidate's answer would
rotate the turn away from somebody who had just played, and `trySave` would not
catch it: the document in hand is the fresh one, so its version matches. The
decision has to be made against the last thing read.

That second read goes through `requireLiveGame` — the guard from finding 2 —
rather than its own `findOne`. This route mutates games, which is exactly what
that guard is for, and it already answers all three of "was an id given", "does
it exist" and "is it still live". It answers in `NextResponse`s and the cron has
no caller to send one to, so the refusal is dropped and the game left for the
next run.

**The run knows about the deadline.** `maxDuration = 60`, a `SWEEP_BUDGET_MS` of
50 seconds checked before each game is acted on, and a `SWEEP_CANDIDATE_LIMIT`
of 500 on the read itself. A run that runs out stops between games rather than
being cut off inside one, logs how many it left, and reports `unswept` (and
`capped`, if the read itself hit the limit) in its response — so a truncated run
now says so instead of looking identical to a complete one.

That is also the resumption story, and it needs no cursor: candidates come
oldest-turn-first, and every game the sweep acts on stops being a candidate
(an expired turn moves `lastTurnTimestamp`, a warning sets
`timerWarningNotificationSent`, an abandoned game sets `complete`). So the next
run's own query picks up where this one stopped.

The index from finding 9 changed shape to match: `{ complete: 1, turnTimer: 1,
lastTurnTimestamp: 1 }`, which serves each of the filter's per-timer branches
(equality, equality, range) and the sort across them.

The candidate projection and the `ISweepCandidate` type are both derived from
one `SWEEP_CANDIDATE_FIELDS` list. Written twice, dropping a name from the
projection would still type-check, `needsSweeping` would read `undefined`, and
the sweep would quietly decide every game was fine — a failure with no symptom
`tsc` or a test could see.

*Files:* `src/app/api/cron/turntimer/route.ts`, `src/utils/games/TurnTimer.ts`,
`src/utils/mongodb/GameData.ts`.
*Tests:* `TurnTimer.test.ts` holds the filter to never leaving out a game
`needsSweeping` would have acted on — swept across every timer and every
boundary either of them cares about, on a frozen clock — and to still leaving
out a turn too young for its own timer, which is what the per-timer bounds buy.
`needsSweeping` is covered directly.

`gameRouteAccess.test.ts` had to be told about this route: the cron now calls
`GameDataModel.findOne`, so the structural guard that walks every route
fetching one game started demanding a membership check from it. Being the
scheduler rather than a player is the fourth legitimate answer to that
question, and `isAuthorisedCron` is what proves it (finding 11 is why that is
worth something).

---

## Database

### 9. `GameData` had no indexes at all ✅

Every other collection declares its own — `ReactionData`, `InvitationData`,
`FriendshipData`, `GameResultData`, `RateLimitData`. `GameData` declared none,
while being queried by `gameId` on **every single turn**, by
`{userIdList, complete}` on every dashboard, by `{complete: false}` on every
cron tick, and by `inviteId` on every lobby poll. All collection scans.

`InvitationData` indexed `joinCode` and `expiresAt` but not `inviteId`,
`senderId` or `userIdList.userId`, all of which are on hot paths.

**Fixed.** Seven indexes added, each shaped to a query the app actually makes:

| Collection | Index | Serves |
|---|---|---|
| `GameData` | `{ gameId: 1 }` unique | every turn, every board load |
| `GameData` | `{ userIdList: 1, complete: 1 }` | the dashboard's live games |
| `GameData` | `{ complete: 1, turnTimer: 1, lastTurnTimestamp: 1 }` | the timer cron's filter *and* its sort |
| `GameData` | `{ inviteId: 1 }` sparse | the lobby's "what game did we become?" |
| `InvitationData` | `{ inviteId: 1 }` unique | lobby screen, accept, cancel, consume |
| `InvitationData` | `{ senderId: 1 }` | outgoing invites |
| `InvitationData` | `{ "userIdList.userId": 1 }` | incoming invites |

`gameId` and `inviteId` are unique because both are v4 UUIDs that everything
downstream treats as identifying exactly one document, and nothing had ever
enforced it.

> **⚠️ Deploy note.** A unique index fails to build if the collection already
> contains duplicates, and Mongoose logs that failure rather than raising it —
> leaving the field unindexed, which is worse than a plain index. Before this
> ships, confirm both are clean:
>
> ```js
> db.gamedatas.aggregate([{$group:{_id:"$gameId",n:{$sum:1}}},{$match:{n:{$gt:1}}}])
> db.invitations.aggregate([{$group:{_id:"$inviteId",n:{$sum:1}}},{$match:{n:{$gt:1}}}])
> ```
>
> Both should return nothing. If either doesn't, resolve the duplicates first or
> drop `unique` from that one index.

*Files:* `src/utils/mongodb/GameData.ts`, `src/utils/mongodb/InvitationData.ts`.

---

## Input validation and hardening

### 10. No rate limit on the credential and enumeration endpoints ✅

`consumeRateLimit` existed and was used in three places. It wasn't used on:

- **`/api/unlock`** — the app's front door. One shared password, unlimited
  guesses, and a correct guess unlocks the account permanently. Compared with
  `!==`, so also timing-variable.
- **`/api/user/claim`** — writes an email and a password to a Clerk account, on
  behalf of a guest nobody vouched for.
- **`/api/friends/invite`** — answers "does this username exist?" precisely
  (404 for no, a friend request for yes), which makes it a username oracle for
  anyone with a word list.

**Fixed.** Unlock gets 10 attempts an hour counted per account *and* per IP —
per account alone lets someone with a pile of signups spread the guessing out,
per IP alone rate-limits a household off one bad try — plus a constant-time
comparison. Claim gets 10 an hour per IP. Friend invites get 30 an hour per
account.

*Files:* `src/app/api/unlock/route.ts`, `user/claim/route.ts`,
`friends/invite/route.ts`.

### 11. `isAuthorisedCron` failed *open* on a missing secret ✅

```ts
return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
```

With `CRON_SECRET` unset that template literal is the string
`"Bearer undefined"` — a header anybody can send. A deployment that forgot the
secret had its crons open to the internet rather than shut, and nothing about
the app's behaviour would have told anyone.

**Fixed.** Refuses every request when the secret isn't configured, and says so
loudly in the log. The comparison is constant-time.

*Files:* `src/utils/cronAuth.ts`, `src/utils/cronAuth.test.ts`.

### 12. The deserialiser let a body choose an instance's prototype ✅

`JSON.parse` gives `{"__proto__": {...}}` a real *own* property — it does not
invoke the setter — but the reviver's `Object.assign` copies with `[[Set]]`,
which does. So a request body could hand a rehydrated command a prototype of its
own choosing and have the engine call methods off it.

Contained (it reaches the one object, not `Object.prototype`), but
`/api/game/command` deserialises raw request bodies and nothing legitimate is
called `__proto__`, `constructor` or `prototype`.

**Fixed.** The reviver copies only safe own properties.

*Files:* `src/utils/apiModels/Serialisable.ts`,
`src/utils/apiModels/serialiseSafety.test.ts`.

### 13. The device-token list was uncapped ✅

Registrations live in Clerk private metadata, which is capped at **8KB for the
whole object**. Each entry is a ~160-character FCM token plus a device
description, so somewhere past thirty the metadata write starts failing — and
it fails on the *write*, so the symptom isn't "your oldest phone stopped getting
pushes", it's "this device can never register at all", permanently, and
uncaught. Pruning only runs at 90 days, which won't save someone cycling
browsers or using private windows.

The POST path also did a read-modify-write on the whole metadata object from a
possibly-stale `currentUser()` — the exact race `removeDevices` re-reads to
avoid.

**Fixed.** `MAX_DEVICES_PER_USER = 20`, enforced in `pruneStaleTokens` so the
registration route and the nightly cron share one rule, keeping the most
recently seen. Registration goes through a new `registerDevice` that re-reads
the user first, like `removeDevices` does.

*Files:* `src/utils/firebase/deviceInfo.ts`, `deviceTokens.ts`,
`src/app/api/notificationtoken/route.ts`, `src/utils/firebase/deviceCap.test.ts`.

---

## Client resilience

### 14. No error boundaries anywhere ✅

No `error.tsx`, no `global-error.tsx`, no `not-found.tsx`. A component that
threw while rendering took the whole tree down to Next's built-in fallback,
which in production reads "Application error: a client-side exception has
occurred" and offers no route back. On a phone, with no address bar to retype a
URL into, that is the end of the session.

**Fixed.** Three boundaries over one shared `ErrorScreen`, so a dead end always
looks like the app rather than like the app falling over, and always offers a
way out. It is the same shell as its two siblings `AuthScreen` and `LegalPage` —
a `<main>` inside the root layout's `.ag-app` column, the `Brand` bar, then an
`.ag-hero` lockup — with one new `.ag-digest` rule in `ag-theme.css` rather than
inline styles.

`global-error.tsx` replaces the root layout — so it gets no font, no
`ag-theme.css`, no providers — and is therefore inline and self-contained, with
its colours from `SRGB` (the resolved token values that exist for renderers with
no stylesheet behind them).

*Files:* `src/components/ui/ErrorScreen.tsx`, `src/app/error.tsx`,
`src/app/global-error.tsx`, `src/app/not-found.tsx`.

### 15. No fetch had a timeout ✅

`fetch` has no default timeout. A connection that opens and then stalls — a
phone moving between cell and wifi, a proxy that accepts and holds — leaves a
promise that never settles. `useSubmitCommand` sets its in-flight guard and
clears it in `finally`, so a stalled command left the board locked with nothing
to tap until the player reloaded.

**Fixed.** `AbortSignal.timeout` on both paths: 20s for reads
(`fetchWithSessionRetry`), 30s for a command, which is a write. Both are
generous — the slowest legitimate response is a cold instance opening its first
Mongo connection.

*Files:* `src/utils/hooks/fetchWithSessionRetry.ts`, `useSubmitCommand.ts`.

### 16. `useGameData` didn't guard its `res.json()` ✅

`useRefreshableData` wraps the same call in a `try`. `useGameData` didn't, and
it runs inside an effect with nothing to catch it — so a 200 that isn't JSON (a
proxy's error page, a truncated body) was an unhandled rejection.

**Fixed.** Guarded, keeping the last good state rather than blanking the board.

### 17. `useGameData` seeded state with `{} as T` ✅

The cast was a lie the compiler then enforced everywhere downstream: every board
reads `gameData.specificGameState.…` on its first render, when the object is
empty, and the type said that was safe.

**Fixed.** `T | null`, initialised to `null`. Every board already
optional-chained its way around the problem, so the diff was one line per
file — **except one**, which TypeScript immediately flagged: a real unguarded
`gameData.complete` on the Settlements & Cities board that would have thrown on
first render had the surrounding condition ever been true that early. That is
exactly the bug the cast was hiding.

*Files:* `src/utils/hooks/useGameData.ts`,
`src/app/games/settlementsandcities/[gameid]/page.tsx`.

### 18. The double-submit guard read state, not a ref ✅

`if (submitting) return;` — but `setSubmitting(true)` doesn't take effect until
React re-renders, so two calls dispatched in the same tick both read `false` and
both send. That is precisely the race the rest of the hook exists to prevent.

**Fixed.** A ref decides; the state flag stays, because that is what the UI
renders from.

---

## Smaller things

### 19. `/api/users` redirected from a JSON route ✅

It called `redirect('/')` for an unauthorised caller, which reaches a fetching
client as a 307 to an HTML page that then fails to parse as JSON. Now a 403. The
empty `if (userId) { }` block went with it.

### 20. The command route rebuilt a dead 50-item array per request ✅

`var registration = [ new DiceCitiesRequestDiceRoll(), ... ]` — fifty
constructions, assigned, never read. It was written to force the `@serializable`
decorators to run, but the decorator runs when its *module* loads, not when an
instance is constructed: importing the `GameLogic` barrel (which the route does
anyway, for the types) had already registered all fifty before the array was
allocated.

It named every command without recording which game each belonged to, which is
the one thing worth recording. `gameCommands.ts` (finding 5) says that instead,
and `serializableRegistry.test.ts` now guards the map rather than the array.

### 21. Request bodies were parsed unguarded ✅

`await request.json()` throws on a body that isn't JSON, and an uncaught throw
in a route handler is a 500. Every one of those is really a 400, and each route
already had the check that says so.

**Fixed.** A shared `readJsonBody` answers `{}` for a body that isn't a JSON
object, letting each route's own "missing gameId" / "missing token" check give
the right answer. Applied across all 19 routes.

Converting them made TypeScript flag every place a body was being *trusted* as
a typed shape rather than checked — bodies cast to `ILobbyRequest`,
`TrainTimeInvitationRequest` and so on. Those casts were claims, not checks.
Real gaps it surfaced:

- `userList` was handed to Clerk without ever being checked as an array — an
  omitted field reached `usersByUsername` as `undefined` and threw on
  `.length`. Now `readUsernameList`, shared by all eight creation routes.
- `gameType.toLowerCase()` in the lobby route threw on a body that sent a
  number, before the "unsupported game" answer could be given.
- `seatCount` was `Number.isInteger`-checked but not type-narrowed.
- `notifyuser` passed an unvalidated `userId` straight to `clerkClient`.
- `notificationpreferences` indexed a `channels` object it hadn't established
  was an object.
- Solitaire's `drawMode` went from the body into the document unchecked. The
  deal reads it back as `drawMode === 'DRAW_3' ? … : …`, so anything else
  silently dealt a Draw-1 game while the record claimed something meaningless.

*Files:* `src/utils/api/requestBody.ts` (new) + 19 routes.
*Tests:* `src/utils/api/requestBody.test.ts`.

### 22. `/api/dev/*` wipes were unauthenticated ✅

They're gated on `isDevDeployment`, which is preview *and* local — not just
local. The database they reach is the dev one (`docs/environments.md`:
Production points at a different `MONGODB_URI`), so this was never a route to
production data. But a preview URL is shareable and these are `GET`s: a crawler
that follows one wipes the dev database, and so does anyone the link reaches.

**Fixed.** Signed-in required on top of the dev gate. Not a permission — a
pulse.

### 23. No integration tests over route handlers ❌

The existing test files cover the pure logic well. Every finding in this document
lived in the layer that has none: route handlers, Mongo queries, Clerk calls.

**Not fixed.** This change adds unit tests for each new pure helper
(`readJsonBody`, `readUsernameList`, `isCommandForGameType`, `isValidTurnTimer`,
`isAuthorisedCron`, the device cap, the deserialiser guard, the Clerk paging)
and extends the two structural guards, taking the suite from 406 tests to 431.
But it does not stand up `mongodb-memory-server` and a Clerk stub to exercise
the handlers end to end.

That is the right next investment and it is deliberately a separate change: it
is a test-infrastructure project rather than a fix, and folding it into this one
would have made a large diff much larger without making any of the fixes above
more likely to be correct. The findings most worth covering once it exists are
2, 4, 5 and 21 — all of them "what does this route do when handed something it
didn't expect".

---

## Found by the pre-commit review

AGENTS.md requires a `caveman` review before committing UI or game code — the
agent that guards the component-reuse rule. It was run over the whole change,
and these are what it found. Both are duplication the fixes above introduced,
which is the review doing exactly its job.

### 24. Seven copies of the game-setup prologue ✅

The most useful thing the review said. Every `/api/newgame/*` route opened with
the same block — sign in, resolve the user,
`canHostGame`, read the invitee usernames, resolve them against Clerk, confirm
they all exist — differing only in a local variable name. The fixes above had
just made it worse, adding two more copies per route (findings 3 and 21).

Seven copies meant a change to any of it was seven edits, and a new game meant
copying the block an eighth time. Which is the repo's number one rule (AGENTS.md
— "a second copy is the signal to extract the first") pointing straight at it.

**Fixed.** `readGameSetupRequest` does the prologue once and hands back the body,
the host, the resolved invitees and a validated turn timer; `requireGameHost` is
the smaller half, for the two solo routes that invite nobody. What stays in each
route is what is genuinely per-game: its party-size rule, its own settings, and
the invitation it builds. The seven routes went from ~75 lines each to ~40.

*Files:* `src/utils/api/gameSetupRequest.ts` (new), the seven `newgame` routes,
`newgame/smartthink/solo/route.ts`.

### 25. Two copies of the constant-time compare ✅

Findings 10 and 11 each grew their own local `timingSafeEqual` wrapper, in the
same change, three identical lines apiece.

**Fixed.** One `timingSafeStringEqual` in `src/utils/secrets.ts`, used by both.

### The review of finding 8's follow-up

The `caveman` pass over the finding-8 work above found the same class of thing,
and all of it is applied: the projection's field list written out twice with
nothing holding the two copies together (now one derived list, as above); the
cron re-implementing `requireLiveGame`'s three checks by hand (now calls it);
`maxDuration` and the sweep's budget as two independent numbers that had to
agree (the budget is derived from it, and the ten seconds of headroom is now
visible rather than implied); `findSweepCandidates` taking a filter and a limit
that only ever had one value each, with the prose justifying the limit in a
different file from the limit (it takes neither now, and owns both); the same
paragraph about resumption restated in four places, and the ask-twice rationale
in three; and `processed` counted from the candidate list when the tally it
sits next to already sums to it.

It also asked whether this belongs in the "What's new" notes. It doesn't: at
this collection's size the old sweep never actually ran out of time, so there is
no player-visible change to report — AGENTS.md keeps refactors out of those
notes.

The same review also caught `ErrorScreen` nesting a second `.ag-app` column
inside the root layout's (fixed — finding 14), the `readJsonBody` cast repeated
at eleven call sites (fixed — the helper is generic now), `nudge` hand-rolling
the three checks `requireLiveGame` had just been written for (fixed — it calls
it), and the docs still pointing at the deleted `registration` array (fixed —
finding 20).

---

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm test` — 438 passing across 38 files (was 406 across 33)
- `npm run build` — succeeds
