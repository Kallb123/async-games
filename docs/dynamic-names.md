# Dynamic names — letting a player change what they're called

A planning document. It asks how a player could change the name other players
see, covering both a **changeable username** (the unique handle they're
invited by) and a **secondary display name** (a friendly, non-unique label
alongside it), plus the other models worth considering.

Short answer, in two phases: **first re-key the response DTOs by `userId`,
then make the Clerk username editable.**

Names are already resolved per request from Clerk on every path that matters,
so the rename itself is a UI job, not a data job — roughly one form on
`/profile` and one extracted field component.

The reason for phase one is that six games currently key their board state by
resolved *name*. Global username uniqueness is the only thing making that safe,
which means today's correctness rests on a property we are about to remove.
Even with uniqueness preserved, keying on a mutable value is a latent bug: it
works until someone renames mid-game. It is worth fixing **on its own merits,
independent of this feature** — and it turns out to be cheap, because
persisted state is already `userId`-based everywhere (§3). The mutable key
exists only in the DTO layer, so phase one is mostly *deleting* translation
code, with no migration.

---

## 1. What the code does today

Identity is thin. Clerk is the sole source of truth and **there are no user
records in Mongo** — `docs/social-features.md` §Identity says so, and it holds:
every name on screen is resolved on demand from a Clerk `userId`.

Two functions decide every name in the app:

| Layer | Where | What it does |
|---|---|---|
| **Resolution rule** | `readableName` — `src/utils/ui/players.ts:64` | `username` → `firstName` → fallback. Inverted for guests. |
| **Server lookup** | `nameOf` — `src/utils/users/clerk.ts:131` | Wraps `readableName` for every response DTO |

Everything server-side funnels through `nameOf` via `buildUserDirectory`,
`userIdListToUsernameList/Map`, `userIdListToUserIdNameMap` and
`userListToUserIdNameMap`. `CreateResponse` (`src/utils/mongodb/GameData.ts:125`)
resolves `usernameList`, `currentTurnUsername`, `winner` and `forfeitedBy` on
**every request**. The client calls `readableName` directly through
`currentUsername`, which is why a screen can compare its own name against the
server's `usernameList` at all.

**A rename therefore propagates on its own.** That is the whole finding, and it
is why this is cheap.

### 1a. The two tiers exist as fields, not as behaviour

It is tempting to say the app already has a handle/display-name split, because
`ProfileIdentity` renders `@handle · Full Name`. It does not, in the sense that
matters:

`readableName` prefers **username** for everyone who isn't a guest. So
`firstName` reaches other players only in two cosmetic places — `displayName()`
in a friends-list row, and `personalName()` on your own profile header. To an
opponent, in a game, in a push notification, in turn history, **your username
is your name and your first name is invisible.**

Making `firstName` the name everyone sees is not a small config change — it is
the feature, and it is where the risk lives (§3).

### 1b. Where a name is frozen rather than resolved

Four places snapshot a name instead of re-resolving it. Three are deliberate
and correct; the fourth is out of scope:

| Snapshot | Where | Behaviour under a rename |
|---|---|---|
| `IGameCommand.senderUsername` | written `api/game/command/route.ts:135` | **Self-healing.** `replay.ts:301` prefers today's resolved name; rewritten next turn. |
| `GameResult.guestNames` | `guest.ts:119` → `finishGame.ts:106` | **Correct as-is.** Snapshots guests whose Clerk user gets swept after `GUEST_SWEEP_DAYS`. Migrating it would be wrong. |
| `Invitation.senderName` | written `api/lobby/route.ts:111`, read `lobbyPreview.ts:58` | **Goes stale** for the lobby's remaining TTL. Already documented as such on the field. Acceptable — a lobby is short-lived, and `lobbyPreview.ts:58` already falls back to a live Clerk read when the field is absent. |
| `gameState.history[]` | 89 `unshift`/`push` sites across 8 game folders | **Frozen forever.** Names are baked into formatted strings. Out of scope per brief — this is test data today. |

Nothing in Mongo is *keyed* on a name. **There is no migration.** The only
write worth planning is a new one, not a backfill (§4a).

### 1c. Two defects this work should sweep up

Found while tracing the above, both real today:

- **Claimed guests have no handle.** `/api/user/claim` adds an email and a
  password but never sets a `username` (`api/user/claim/route.ts:74-96`). So a
  claimed guest keeps their `guest_<uuid>` account id forever, is unfindable by
  `usersByUsername`, and is **silently dropped from the invite picker** —
  `UserInviteList.tsx:48` filters on `f.user.username` being present. A
  name editor is the natural place to fix this.
- **`UserInviteList` bypasses the resolution rule.** Lines 48, 52 and 91-95
  read `friend.user.username` raw, while `profile/page.tsx:251` renders the
  same friend through `displayName()`. Two answers to one question.
  (`profile/page.tsx:284` and `:303` read it raw too.)

Also worth deleting while in the file: **`usernameListToUserIdList`
(`clerk.ts:239`) is dead code** — zero callers. Invites really resolve through
`usersByUsername` in three places: `gameSetupRequest.ts:89`,
`api/lobby/route.ts:79` and `api/friends/invite/route.ts:43`.

---

## 2. The options

### The pro/con table

| # | Option | What the player gets | Pros | Cons | Verdict |
|---|---|---|---|---|---|
| **0** | **Re-key DTOs by `userId`** (prerequisite, not a user-facing option) | Nothing directly — it unblocks the rest | Removes a mutable key that is a latent bug today. Storage is already id-based, so **no migration**. `playerByUserId` already exists with 37 call sites. Net *deletes* translation code. Makes A safe and B/C possible. | Touches six games' render paths, which is where regressions hide. Slightly less readable raw JSON (§3a). Should land as its own PR. | ✅ **Do first** |
| **A** | **Editable Clerk username** — `user.update({ username })` | One name, changeable, still globally unique | Zero new storage, zero new API routes. Propagates automatically through `nameOf`. Clerk enforces uniqueness and availability. Fixes §1c defects as a side effect. | Frees the old handle for someone else to claim → invite-by-handle can resolve to a different person (**locksmith**, §5). Needs `username` enabled as a Clerk instance attribute — verify first. | ✅ **Then this** |
| **B** | **Secondary display name** — editable `firstName`, shown to everyone | A friendly non-unique name; handle stays fixed | Familiar (Twitter/X). Non-unique means no "name taken" friction. Field already exists — no schema change. | Requires flipping `readableName`'s order. **Blocked until option 0 lands**, or non-unique names collapse board state (§3). Handle still unchangeable, so the original ask is only half met. | ⚠️ Viable after 0 |
| **C** | **Both tiers** — handle *and* display name (Discord/GitHub) | Changeable `@handle` plus a separate display name | The model users expect from Discord/GitHub. Most flexible. After option 0 the technical objection dissolves, leaving a **product** decision rather than an engineering one. | Two editors and two validation rules. Impersonation surface is wider than A: a non-unique display name can freely copy someone else's. | ⚠️ Product call, after 0 |
| **D** | **Per-game / per-lobby nickname** | A different name per table | Fun; sidesteps global uniqueness (per-lobby `uniqueGuestName` already exists). | `GameData` deliberately stores **no** names. Needs a second lookup path beside `buildUserDirectory` and a per-game override in all 8 `gameStateToModel`s. Duplicates `nameOf` once per game. Impersonation risk inside a game. | ❌ Over-engineered |
| **E** | **Own Mongo `Profile` collection** | Names owned by us, not Clerk | Full control; could hold name history. | Duplicates the entire directory layer (`buildUserDirectory`, the four `userIdListTo*` helpers, `toUserDto`). Invents a Clerk↔Mongo sync problem that **cannot exist today**. Breaks the "no user records in Mongo" rule. | ❌ Over-engineered |
| **F** | **Status quo** — no change | Nothing | No work. | Claimed guests are stuck nameless and invisible in the invite picker (§1c). A typo'd handle is permanent. | ❌ Leaves a real defect |

### Other popular methods, briefly

- **Discriminators** (`Dave#1234`) — how Discord *used* to make display names
  unique. They abandoned it for good reason: nobody remembers the digits. Would
  solve B's collision problem at the cost of the readable names that are the
  point.
- **Rename cooldown** (Twitch/Discord: one change per N days) — the standard
  mitigation for handle-churn impersonation. Cheap to add later via
  `consumeRateLimit` (the pattern already exists in `src/utils/rateLimit.ts`).
  Not needed on day one at this scale.
- **Handle reservation / name history** — holding a freed handle for N days so
  it can't be immediately re-registered by an impersonator. The proper fix for
  A's one real risk, if the risk is judged to matter. Needs storage, so defer
  until it does.

---

## 3. The mutable key — why it should go regardless

Three things identify a player by their **resolved name string**, not their id.
Global username uniqueness is what makes that safe today.

1. **Board state collapses.** `playerStates` is `Record<username,
   PlayerStateResponse>` (`GameDataApi.ts:79`) in six games —
   e.g. `SnakesAndLaddersModels.ts:183`. Two players resolving to "Dave"
   produce **one** entry; one player vanishes from the board.
2. **Colours duplicate.** `playerColourFor` is `usernames.indexOf(name)`
   (`playerColours.ts`) — both Daves get player one's colour.
3. **Opponents mis-filter.** `opponents()` filters `u !== me`
   (`players.ts:14`) — a second Dave is filtered out as "you".

The repo already knew: *"Display names are not unique, Clerk usernames are…
prefer id-based comparison anywhere it is being added"*
(`docs/account-less-play.md:383`). `uniqueGuestName` exists for exactly this,
but it is applied **once**, at `api/lobby/join/route.ts:93`, against names
already seated. A rename after the fact walks straight past it.

Option A preserves uniqueness, so it *survives* this. But "survives" is not
"safe": the invariant holds by luck of an unrelated Clerk property, and a
rename mid-game still shifts every key in the payload. **The key should be the
thing that never changes.**

### 3a. It is cheaper than it looks

The decisive fact: **persisted state is already `userId`-based in every game.**
`SettlementsAndCitiesModels.ts:570` filters `v.owner === userId`;
`TrainTimeModels.ts:260` passes `userId` to `longestRun`. The name substitution
happens *only* at the response boundary, as a uniform, clearly-marked
translation — `// Convert owner userId → username`
(`SettlementsAndCitiesModels.ts:444`), `routeOwners: gs.routeOwners.map(toUsername)`
(`TrainTimeModels.ts:276`), `owner: userIdNameMap[t.owner]`
(`WorldDominationModels.ts:337`).

So there is **no migration and no schema change** — the mutable key never
reaches Mongo. Removing the translation is deleting code.

Nor does it expose anything new. `PlayerStateResponse` already carries **both**
`userId` and `username` in the value, shipped to every player
(`Outbreak/apiModels.ts:9-10`). The name-as-key duplicates a field that is
already inside the object it points to.

Measured scope:

| Work | Sites | Notes |
|---|---|---|
| Server keyed writes | **6** | One per game, e.g. `SnakesAndLaddersModels.ts:183` |
| Client name-keyed lookups | **13** | e.g. `traintime/[gameid]/page.tsx:90` |
| `currentUsername(user)` → `user.id` | **11** | Six get *simpler* — no resolution needed |
| `playerColourFor`, `opponents()` | **2 helpers** | Need `userIdList` on the response (below) |
| Key-agnostic iteration | **35** | **Free** — `Object.entries` doesn't care |
| Migration / schema | **0** | Storage is already ids |

The one addition: `IGameDataResponse` and `IGameResponse` need a `userIdList`
parallel to `usernameList`. Note `currentTurn` is **already a userId** on the
wire (`GameData.ts:135`), so the client is half-way there already — and
`playerByUserId` (`GameDataApi.ts:91`) is already the house accessor, with 37
call sites across `GameResultData` and every game's recap.

Roughly 30 real edits, most mechanical, against a 17-file game test suite plus
the Playwright specs in `e2e/`. It should land as **its own PR before any
rename ships**, so a board regression is attributable to the refactor rather
than tangled with a new feature.

### 3b. The one genuine cost

`GameDataApi.ts:79` explains the current keying: usernames are used "for
readable JSON". That is real — debugging a payload keyed by `user_2abc…` is
worse than one keyed by `Dave`. It is a developer-experience loss, not a
correctness one, and `usernameList` plus the `username` field inside each
`PlayerStateResponse` both remain for display. Worth naming so the trade is
made deliberately.

### 3c. The stale-session bug the re-key also fixes

This is the sharpest illustration of why the key matters. Eleven client sites
resolve "me" by name via `currentUsername(user)`, and six board pages look up
*your own* state with it — `games/traintime/[gameid]/page.tsx:90`:

```ts
const me = gs?.playerStates[myUsername];   // undefined if the name is stale
```

If the browser's Clerk session still holds the old name while the server
response holds the new one, `me` is `undefined` and **the board renders
empty**. Without option 0 the only mitigation is discipline — `await
user.reload()` immediately after the write, as `useProfilePicture.tsx:38`
does — and it still leaves a window, plus the same trap for any future code
that forgets.

Keyed by `user.id`, the bug cannot occur: the id is stable, already known to
the client without a Clerk round trip, and identical on both sides. This is
the concrete payoff, not just tidiness.

---

## 4. Implementation plan — phase 2 (option A)

Phase 1 is option 0, scoped in §3a: re-key the DTOs, its own PR, no user-facing
change. What follows assumes it has landed.

### 4a. Verify first

Clerk's `username` must be enabled as an instance attribute or
`user.update({ username })` fails with `form_param_unknown`. `/signup` mounts
Clerk's own `<SignUp />`, so the attribute set is dashboard-controlled and not
visible in this repo. **Check before writing code.**

### 4b. The write — client-side, no API route

Use the `useProfilePicture` precedent (`utils/hooks/useProfilePicture.tsx:32-44`),
**not** `/api/user/claim`. Claim is server-side because it juggles a placeholder
email, a real one and a password — a credential flow. A username is one field
on the signed-in user resource:

```
user.update({ username })  →  user.reload()  →  showToast(...)
```

Zero API code. Clerk returns `form_identifier_exists` for a taken handle, which
surfaces as a sentence the player can act on — the same
`clerkErrorMessage`-shaped handling `ClaimAccountForm` already does.

### 4c. What must be reused

Per AGENTS.md's component-reuse rule, none of this is new:

- **`ProfileIdentity`'s existing `action` slot** (`ProfileIdentity.tsx:18`),
  already used by "Remove photo" at `profile/page.tsx:142`. Put "Edit name"
  there — do **not** add a second header block.
- **The form pattern**: `ag-card ag-form-card` + `ag-section-label
  ag-field-label` + `ag-input` + `ActionButton pending/pendingLabel`. It exists
  twice already — `PasswordForm.tsx:50-71` and `ClaimAccountForm.tsx:54-90`.
  There is **no** `.ag-inline-edit` or form-row class in `ag-theme.css`;
  `ag-form-card` *is* the pattern. Don't invent a class, don't inline-style a row.
- **Validation**: `isValidGuestName` / `MAX_GUEST_NAME_LENGTH`
  (`utils/games/guestName.ts:5`), and `randomGuestName` if a reroll is offered.
  No second regex.
- **Preview text**: `profileHeading` / `personalName` / `publicHandle`. Never
  re-derive "which name shows here".

### 4d. The one extraction worth making

`join/JoinForm.tsx:340-365` is **already** a display-name field: label +
`ag-input` + `maxLength={MAX_GUEST_NAME_LENGTH}` + `isValidGuestName` gate +
`ag-die-btn`/`DieFace` reroll. A profile name editor is the second copy of
exactly that block — which is the signal to extract.

Extract `src/components/ui/DisplayNameField.tsx` (`value`, `onChange`,
optional `onReroll`, `label`) and use it in both. Note the shared piece is the
**field**, not a hook: JoinForm's name goes to the join API, the profile's goes
to Clerk. A `useDisplayName` hook would have one call site, which AGENTS.md
rule 3 says is not yet a shared piece.

### 4e. Sweep-up (small, same PR)

- Set a username on the claim path so claimed guests stop being invisible (§1c).
- Route `UserInviteList`'s three raw `friend.user.username` reads through
  `displayName()`/`publicHandle()`.
- Delete `usernameListToUserIdList` — dead code.

### 4f. Not needed

No Mongo migration. No backfill. No new collection. No new API route — in
either phase. Nothing about dynamic names touches storage, because storage
never held a name in the first place.

---

## 5. Handoffs

Per AGENTS.md's review-crew boundaries, these are outside this document:

- **croupier** — option 0 changes what every game's `specificGameState` is
  keyed by. No *new* field goes over the wire (`PlayerStateResponse` already
  carries `userId` alongside `username`, and ships to all players), so the
  expectation is a clean pass — but "we changed every response builder in the
  app" is exactly the diff the croupier exists for. Worth a `trace-hidden-state`
  run on one game to confirm redaction still keys correctly.
- **caveman** — option 0 should be a net deletion. If it is not, something has
  been rebuilt rather than removed.

- **locksmith** — letting a handle change **frees the old one**. Invite-by-handle
  (`gameSetupRequest.ts:89`, `api/lobby/route.ts:79`,
  `api/friends/invite/route.ts:43`) would then resolve to a different person, so
  a friend request or game invite typed from memory could reach an impersonator.
  Also worth their eye: whether the rename endpoint needs a rate limit, and
  whether `api/friends/invite`'s case-insensitive compare (unlike the other two
  call sites) matters here.
- **rulebook** — the player-visible "What's new" line, when this ships.
  Deliberately not added by this document, which is planning only.

Cosmetic aside, no work needed: `avatarColor` (`utils/ui/avatar.ts:22`) is
name-seeded, so a rename changes the initials-badge hue. Worth knowing, not
worth preventing.
