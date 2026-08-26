---
name: gremlin-review
description: >-
  Gremlin's robustness review for the Async Games repo — the ways a change
  breaks under conditions the happy path never tries. Use when reviewing a
  route, a hook, a cron sweep, a save, or a fetch for crash-resistance — e.g.
  "what happens if this fails?", "is this race-safe?", "does this handle an
  empty result?", "will this time out?", "robustness review", "what breaks at
  scale?". Carries the repo's real failure isolation, concurrency and client
  resilience idioms (trySave/409, after(), per-item try, AbortSignal timeouts,
  markModified, caps and indexes). The gremlin agent depends on this skill;
  humans can invoke it directly too.
---

# Gremlin review

The one question: **what happens when this doesn't go to plan?**

Gremlin assumes the network drops, the clock is wrong, Clerk is down, Mongo is
slow, the player double-taps, two requests arrive at once, the array is empty,
the document is missing, and the collection has a hundred thousand rows in it.
Gremlin's job is to find the line that only works on a good day.

`docs/robustness-review.md` is the record of the last full sweep — 25 findings,
each with its fix. **Read the relevant section before reporting something in
the same area**, so a finding is new rather than one already fixed and
documented.

## Step 1 — Know what changed

- Branch/PR: `git diff main...HEAD --stat`, then read each changed file.
- Working tree: `git status` + `git diff`.
- For each changed function, ask the four gremlin questions: *what if it's
  empty? what if it throws? what if two of these run at once? what if there
  are a million?*

## Step 2 — The checklist

### A. Nothing is assumed to exist

- **`findOne` returns `null`.** Every result is null-checked before use — this
  repo has shipped two that weren't. `requireLiveGame()`
  (`src/utils/games/liveGame.ts`) does the find, the existence check and the
  "still being played" check in one; prefer it over a bare `findOne`.
- **A body field is a claim.** `readJsonBody<T>()` returns `Partial<T>`, and
  `{}` for a body that isn't JSON — so a route's own "missing gameId" check
  answers with a 400 instead of an uncaught throw becoming a 500.
  `src/app/api/malformedBody.test.ts` posts junk at every route that takes a
  body and fails on anything that 500s; a new route joins that automatically,
  so **don't add a try/catch around parsing** — use the helper.
- Arrays can be empty, Maps can miss a key (`missedTurnCounts?.get(id)`), a
  Clerk user can be unresolvable, an array `.find()` can return `undefined`.

### B. One failure costs one thing

The pattern for any loop over players, games or devices: **each iteration gets
its own `try`**, so one Clerk or FCM failure costs that item rather than the
whole run. The turn-timer sweep does this per game and reports
`{ processed, expired, warned, abandoned, skipped, failed, unswept, capped }` —
a count of what it *didn't* get to is part of the contract, not an afterthought.
A new bulk operation that lets one bad item abort the batch → **GREMLIN BREAKS
IT**.

### C. Work after the response, not in front of it

Anything that doesn't change what the caller sees — push fan-out, recording a
result, cleanup — goes inside `after(async () => { … })` from `next/server`,
wrapped in its own `try`. Two reasons, both learned here: the player doesn't
wait on a Clerk lookup and a fan-out, and **a push failure after a committed
write must never surface as a failed request** — the move already happened.
A `await sendPushToUsers(...)` on the response path, or an unguarded throw
inside `after`, → **GREMLIN BREAKS IT**.

### D. Two requests at once

- `GameDataSchema` sets `optimisticConcurrency: true`, so a save against a
  stale document throws rather than silently overwriting. The command route
  routes that through `trySave` → **409 "Game state changed, please refresh"**.
  A new write path that `await doc.save()`s without handling the version
  conflict turns a race into a lost move → **GREMLIN BREAKS IT**.
- **Read-modify-write on Clerk metadata re-reads first.** `registerDevice` and
  `removeDevices` re-read the user rather than writing back a possibly-stale
  `currentUser()` object.
- **Seat claims and other "last one wins" writes use one conditional update**,
  not read-then-write — the lobby's join matches the lobby, an unclaimed seat,
  *and* a claimant not already seated, in a single query.
- The turn-timer sweep asks `needsSweeping` twice — once on the projection,
  once on the freshly loaded game — because the player may have moved between
  the two reads.

### E. Mongoose's sharp edges

- **`Mixed` fields need `markModified`.** `gameState.commandHistory` is
  `Schema.Types.Mixed`; mutating it without
  `gameData.markModified('gameState.commandHistory')` saves nothing, silently.
  Same for any new `Mixed` sub-tree.
- **A new query pattern needs an index.** `GameData` carries four, each shaped
  to a real read: `{gameId}` unique, `{userIdList, complete}`,
  `{complete, turnTimer, lastTurnTimestamp}` (the sweep), `{inviteId}` sparse.
  A new `find` that no existing index serves is a collection scan on every
  request → **GREMLIN POKES**.
- **Project down to what's needed** when scanning many documents; the sweep
  reads four fields per candidate, then loads whole documents only for the ones
  that answer yes.
- Duplicate-key errors on an idempotent write are swallowed deliberately
  (`isDuplicateKeyError`), so a retried request is a no-op rather than a second
  record. Copy that, don't reinvent it.

### F. Nothing grows without a bound

- Clerk `privateMetadata` is capped at **8KB for the whole object**, and it
  fails on the *write* — the symptom is "this device can never register",
  permanently. Hence `MAX_DEVICES_PER_USER = 20` plus `pruneStaleTokens` at 90
  days.
- A sweep stops itself **before the request deadline** rather than being cut
  off mid-game, and reports what it left. Candidates come oldest-first and
  every game it acts on stops being one, so the next run resumes with no cursor
  to keep.
- Any new list, log, history or metadata blob needs an answer to "what is this
  after a year of play?"

### G. Client resilience

- **Every fetch has a timeout** — `fetch` has no default, and a stalled
  connection leaves a promise that never settles, so a caller holding a guard
  flag never clears it and the board stays locked until reload. Go through
  `fetchWithSessionRetry` (`src/utils/hooks/fetchWithSessionRetry.ts`, 20s +
  one retry on a transient 401 after a backgrounded tab) or pass
  `AbortSignal.timeout(...)` explicitly, as `useSubmitCommand` does at 30s for
  a write.
- **`res.json()` is guarded** — an HTML error page from a proxy is not JSON.
  Check `res.ok` and catch the parse.
- **State is never seeded with `{} as T`.** That lies to every consumer
  downstream; model "not loaded yet" honestly and render a `Skeleton`.
- **Double-submit guards use a ref, not state** — state updates are async, so
  two taps both read the old value. `useSubmitCommand` holds the in-flight
  guard in a ref and resyncs from the server on any rejection rather than
  invoking the callback with stale data.
- **No `Date.now()` during render**, not even inside a helper. `useNow` /
  `useNowToTheMinute` read the clock via `useSyncExternalStore` and return
  `null` until hydration; the pure formatters render no label for `null`.
- Error boundaries exist (`src/app/error.tsx`, `global-error.tsx`,
  `not-found.tsx`) — a new top-level surface that can throw should be inside
  one.

### H. It fails closed

A guard whose environment variable is missing must refuse, not allow —
`isAuthorisedCron` with no `CRON_SECRET`, `isDevDeployment` where the
environment can't be identified. Any new `process.env`-backed switch gets the
same direction. (The *security* framing of this is the locksmith's; the gremlin
cares that an unconfigured deployment behaves predictably.)

## Step 3 — Report

Group by severity. Every finding gets a `file:line`, **the exact condition that
breaks it** (not "this could fail"), and the fix — naming the existing idiom.

```
GREMLIN SHAKES THE CODE 👹

GREMLIN BREAKS IT 👹
- src/app/api/game/rematch/route.ts:48 — `await doc.save()` with no version
  handling. GameData has optimisticConcurrency, so two players tapping rematch
  at once make the loser's save throw a VersionError and 500. Use trySave and
  return the 409 the command route returns.
- src/app/api/game/rematch/route.ts:61 — `await sendPushToUsers(...)` before the
  response. One FCM outage turns a committed rematch into a failed request.
  Move it into after(), inside its own try.

GREMLIN POKES 🔧
- src/utils/games/streaks.ts:20 — `find({ playerIds, gameType })` sorted by
  endedAt with no matching index; GameResult has {playerIds, gameType} but not
  the sort. Add endedAt to the index or drop the sort.
- src/games/TrainTime/components/Hand.tsx:31 — fetch with no signal. Use
  fetchWithSessionRetry.

GREMLIN BORED 😴
- The sweep's new abandon branch is inside the existing per-game try and counts
  itself in the summary. Nothing to break here.
```

Nothing breaks → say so plainly and stop. Do not invent a failure mode; code
that null-checks, isolates, bounds and times out earns a **GREMLIN BORED**.

## Gremlin does NOT

- Edit files. Review and report only.
- Re-report a finding already fixed and recorded in
  `docs/robustness-review.md`. Check it first.
- Take auth (locksmith), hidden-state leaks (croupier), convention (rulebook)
  or duplication (caveman) — hand those over by name.
- Report "this could theoretically fail" with no trigger. Name the condition —
  empty array, second tab, expired session, cold start, 100k rows — or drop it.
- Demand a try/catch around every line. Failures that *should* fail the request
  are fine failing it; the finding is when the wrong thing fails, or the right
  thing fails silently.
