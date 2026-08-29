# Dynamic names — letting a player change what they're called

A planning document. It asks how a player could change the name other players
see, covering both a **changeable username** (the unique handle they're
invited by) and a **secondary display name** (a friendly, non-unique label
alongside it), plus the other models worth considering.

Short answer: **make the Clerk username editable, and stop there.** Names are
already resolved per request from Clerk on every path that matters, so this is
a UI job, not a data job — roughly one form on `/profile` and one extracted
field component. The tempting second half, a separate non-unique display name,
is where the cost is: six games key their board state by resolved *name*, so
two players who both call themselves "Dave" silently collapse into one entry.
Global handle uniqueness is what keeps that invariant today, and it is free.

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
| `Invitation.senderName` | written `api/lobby/route.ts:111`, read `lobbyPreview.ts:58` | **Goes stale** for the lobby's remaining TTL. Already documented as such on the field. Acceptable; see §5. |
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
| **A** | **Editable Clerk username** — `user.update({ username })` | One name, changeable, still globally unique | Zero new storage, zero new API routes. Propagates automatically through `nameOf`. Clerk enforces uniqueness and availability. Keeps `playerStates`/colour/`opponents()` invariants for free. Fixes §1c defects as a side effect. | Frees the old handle for someone else to claim → invite-by-handle can resolve to a different person (**locksmith**, §5). Needs `username` enabled as a Clerk instance attribute — verify first. | ✅ **Do this** |
| **B** | **Secondary display name** — editable `firstName`, shown to everyone | A friendly non-unique name; handle stays fixed | Familiar (Twitter/X). Non-unique means no "name taken" friction. Field already exists — no schema change. | Requires flipping `readableName`'s order, which is the whole risk. **Non-unique names break three invariants** (§3): board state collapses, colours duplicate, opponents mis-filter. Handle still unchangeable, so the original ask is only half met. | ❌ Not alone |
| **C** | **Both tiers** — handle *and* display name (Discord/GitHub) | Changeable `@handle` plus a separate display name | The model users expect from Discord/GitHub. Most flexible. | A + B's costs together: two editors, two validation rules, plus B's collision problem. Buys a uniqueness problem the repo avoids by construction. The only cheap version — handle is what everyone sees, display name stays cosmetic — **is just A with an extra input**. | ⚠️ Later, if asked |
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

## 3. Why a non-unique display name is the expensive half

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

**Under option A none of this needs touching.** Under B or C, all three need
re-keying by `userId` first — that is the prerequisite work, and it is
substantially larger than the feature itself.

### The related client risk (applies to A too, mildly)

Eleven client sites resolve "me" by name via `currentUsername(user)` — and six
board pages look up *your own* state with it, e.g.
`games/traintime/[gameid]/page.tsx:90`:

```ts
const me = gs?.playerStates[myUsername];
```

If the browser's Clerk session still holds the old name while the server
response holds the new one, `me` is `undefined` and the board renders empty.
Mitigation is the existing one: `await user.reload()` immediately after the
write, exactly as `useProfilePicture.tsx:38` does. The window is small and
self-correcting, but it is why the rename must reload the user rather than
just optimistically updating local state.

---

## 4. Implementation plan (option A)

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

No Mongo migration. No backfill. No new collection. No new API route.

---

## 5. Handoffs

Per AGENTS.md's review-crew boundaries, two concerns are outside this document:

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
