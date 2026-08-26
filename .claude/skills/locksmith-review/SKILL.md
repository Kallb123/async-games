---
name: locksmith-review
description: >-
  Locksmith's security review checklist for the Async Games repo. Use when
  reviewing a diff, a new API route, or an auth/identity change for security
  risks — e.g. "is this route safe?", "did I check the caller owns this?",
  "security review", "can a player forge this?", "does this need a rate
  limit?". Carries the repo's real gates (auth() + membership checks,
  isAuthorisedCron, timingSafeStringEqual, consumeRateLimit, readJsonBody,
  stripRecordedRandomness) and the finding format. The locksmith agent depends
  on this skill; humans can invoke it directly too.
---

# Locksmith review

The one question: **what can a signed-in stranger make this do?** Every player
in this app is an authenticated user with a browser dev-tools console. They can
replay any request, change any field in it, and call any route in any order.
The client is not a gate — it is a suggestion.

Scope: authentication, authorisation, forged input, secrets, rate limits,
privilege. **Hidden-game-state leaks are the croupier's job** — if the finding
is "the wire carries an opponent's cards", hand it to `croupier-review`.

## Step 1 — Know what changed

- Branch/PR: `git diff main...HEAD --stat`, then read each changed file.
- Working tree: `git status` + `git diff`.
- Pay special attention to anything under `src/app/api/**`, `src/utils/users/`,
  `src/utils/mongodb/`, `src/middleware.ts`, and any file reading
  `process.env`.

## Step 2 — The checklist

### A. Every route establishes who is asking

`await auth()` from `@clerk/nextjs/server`, reject when there's no `userId`.
Clerk middleware authenticates; it does **not** authorise. A route with no
check of its own is open to every signed-in account in the world.

### B. Every route that loads one game proves the caller is in it

This is the IDOR class, and this repo has had it: `GET /api/game/[gameid]`
once authenticated the caller and then handed the game to anyone holding its
id. Game ids travel in push links and shared URLs. One of these four gates
must be present in any route that reaches a single game:

```ts
gameData.userIdList.includes(userId)          // membership
userId !== gameData.currentTurn               // stronger: it's your turn
GameDataModel.findOne({ gameId, userIdList: userId })  // query-scoped
isAuthorisedCron(request)                     // not a player at all
```

`requireLiveGame()` (`src/utils/games/liveGame.ts`) finds and liveness-checks a
game — it knows **nothing about the caller**, so a route using it still needs
its own membership gate. `src/utils/apiModels/games/gameRouteAccess.test.ts`
enforces this by walking the tree; a new route with none of the four fails CI.
Flag a missing gate as **LOCK PICKED** even so — read the code, don't rely on
the test having run.

### C. The body is a claim, not a guarantee

- Parse with `readJsonBody<T>()` (`src/utils/api/requestBody.ts`) — it returns
  `Partial<T>` on purpose, and `{}` for a body that isn't JSON, so the route's
  own "missing field" check answers instead of a 500. A raw
  `await request.json()` typed as a request interface is a lie to the compiler
  → **LOCK PICKED**.
- **Every field is checked before use.** `turnTimer` goes through
  `isValidTurnTimer`; invitee lists through `readUsernameList`; ids through the
  shape the route expects.
- **Never let a client supply a trusted field.** `/api/game/command`
  deserialises the request body straight into a real command instance, so any
  property the rules read is attacker-controlled unless something strips it.
  `stripRecordedRandomness` (`src/utils/apiModels/gameCommand.ts`) exists
  because `this.recordedRoll ?? DiceRoll(6)` otherwise lets a player POST
  `{"recordedRoll": 6}` and pick their own dice.

  **It strips by naming convention, not by a list** — it deletes every own
  property whose key `startsWith("recorded")`. So the check on a new command
  that consumes randomness is: *is the field named `recorded*`?* The existing
  ones are `recordedRoll`, `recordedRolls`, `recordedShuffles`,
  `recordedDiscards`, `recordedAttackerDice`, `recordedDefenderDice`,
  `recordedStealIndex`. A replay-recorded value under any other name —
  `preRolledDice`, `shuffleSeed`, `dealtOrder` — is silently **not stripped**
  and the client picks its own outcome → **LOCK PICKED**. The fix is to rename
  the field, not to special-case it.
- A command must belong to the game it targets (`COMMANDS_BY_GAME_TYPE` in
  `src/utils/games/gameCommands.ts`) and to the caller
  (`userId !== command.senderId` → refuse).
- Deserialisation only copies safe own properties — `__proto__`,
  `constructor`, `prototype` are dropped (`Serialisable.ts`). Anything new that
  `Object.assign`s a parsed body onto an instance needs the same treatment.

### D. Secrets

- Compare shared secrets with `timingSafeStringEqual`
  (`src/utils/secrets.ts`), never `!==` — a plain compare leaks the secret a
  byte at a time.
- **Fail closed on a missing secret.** `isAuthorisedCron` refuses every request
  when `CRON_SECRET` is unset; it used to compare against the template literal
  `` `Bearer ${process.env.CRON_SECRET}` ``, which with the variable unset is
  the string `"Bearer undefined"` — a header anyone can send. Any new
  env-var-backed gate that treats "not configured" as "allow" →
  **LOCK PICKED**.
- `NEXT_PUBLIC_*` is compiled into the browser bundle. `MONGODB_URI`,
  `CLERK_SECRET_KEY`, `FIREBASE_PRIVATE_KEY`, `CRON_SECRET` and
  `ACCESS_PASSWORD` must never be read from a `'use client'` module or echoed
  into a response. (The Firebase *client* config is public by design — not a
  finding.)
- Never log a secret, a session token, or an FCM token. Devices are identified
  to the client by `deviceIdForToken` — the token's last 12 characters — so raw
  tokens never leave the server.

### E. Rate limits and oracles

`consumeRateLimit(scope, identifier, limit, windowMs)`
(`src/utils/rateLimit.ts`) with `clientIp(request.headers)`. A new endpoint
needs one when it:

- **checks a credential** — `/api/unlock` is one shared password against every
  account, so it is limited 10/hour **per account *and* per IP**: per-account
  alone lets someone with a pile of signups spread the guessing out, per-IP
  alone rate-limits a household off one bad try. New credential checks copy
  both.
- **answers a question about someone else's existence** —
  `/api/friends/invite` returns 404 for "no such username" and a request for
  "yes", which is a username oracle with a word list behind it (30/hour per
  account).
- **writes to a Clerk account on behalf of an unvouched caller** —
  `/api/user/claim` (10/hour per IP).

Unlimited guesses at a credential or an enumeration answer → **LOCK PICKED**.

### F. Privilege and identity

- **`publicMetadata` is readable by the client** — it is where `unlocked` and
  `guest` live, and it is fine for both because neither is a secret and the
  server re-checks them. Never put anything confidential there;
  `privateMetadata` holds the notification tokens and preferences.
- Authorisation reads go through the shared helpers — `canHostGame`,
  `isAuthorised` (`src/utils/users/clerk.ts`), `isGuest`
  (`src/utils/ui/players.ts`) — not a hand-rolled second copy of the
  metadata check.
- **Client-side guards are UX, not security.** `useAuthGuard` redirecting a
  signed-out visitor does not protect the route it was guarding; the API route
  must refuse independently.
- Guests (`publicMetadata.guest === true`) are real Clerk accounts with reduced
  rights — they may play, they may not host. A new privileged action needs to
  answer whether a guest may take it.

### G. Dev-only and destructive surfaces

`/api/dev/*` wipes and `/api/notifyuser` are gated on `isDevDeployment`
(`src/utils/devEnvironment.ts`), which is **false wherever the environment
can't be identified** — locked down rather than wide open. A new destructive or
diagnostic route needs the same gate, the same way round.

### H. Server/client boundary

`src/app/api/serverModuleGraph.test.ts` fails a route whose runtime import
chain reaches a `'use client'` module. Watch the reverse too: a client
component importing a module that touches Clerk's backend SDK, Mongo, or
`process.env` secrets drags them toward the bundle.

## Step 3 — Report

Group by severity. Blunt headline, precise substance. Every finding gets a
`file:line`, the concrete attack (who sends what, and what they get), and the
fix — naming the existing helper wherever one exists.

```
LOCKSMITH CHECKS THE DOORS 🔐

LOCK PICKED 🔓
- src/app/api/game/notes/route.ts:22 — loads the game by id and returns it with
  no membership check. Any signed-in user with a game id from a shared link
  reads a game they're not in. Add `if (!gameData.userIdList.includes(userId))
  return 403`, as its five sibling routes do.
- src/games/TrainTime/TrainTimeLogic.ts:64 — `this.drawnCard ?? drawCard()`
  reads a replay-recorded field that isn't named `recorded*`, so
  stripRecordedRandomness doesn't delete it and a player can POST their own
  draw. Rename it `recordedDraw`.

LOCK JIGGLES 🔍
- src/app/api/friends/search/route.ts:14 — precise "no such user" answer with no
  consumeRateLimit. Same oracle as /api/friends/invite; copy its 30/hour
  per-account limit.

LOCKED 🔐
- /api/lobby/join scopes its findOne to the caller's seat, so a non-player's
  claim comes back empty rather than needing a second check. Good.
```

Nothing wrong → say so plainly and stop. Do not invent a finding to look
thorough; a route that authenticates, authorises, validates and rate-limits
earns a **LOCKED** and nothing more.

## Locksmith does NOT

- Edit files. Review and report only.
- Chase hidden-state leaks (croupier), crash-resistance (gremlin), convention
  (rulebook), or duplication (caveman) — hand those over by name.
- Flag the public Firebase client config, `publicMetadata.unlocked`, or
  `NEXT_PUBLIC_*` values as leaked secrets. They are public by design.
- Report a theoretical risk with no reachable path. Name the request an
  attacker sends, or drop the finding.
