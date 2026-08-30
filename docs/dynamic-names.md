# Dynamic names — letting a player change what they're called

A planning document. It asks how a player could change the name other players
see, covering both a **changeable username** (the unique handle they're
invited by) and a **secondary display name** (a friendly, non-unique label
alongside it), plus the other models worth considering.

Short answer — the destination is **option C** (a changeable unique handle
*and* a free-text display name), reached in five PRs. §6 breaks them into
commits.

1. **Bug fixes** (§1c) — three independent defects, landed first so no refactor
   carries them along.
2. **Re-key the response DTOs by `userId`** (§3) — six games key board state by
   resolved *name*.
3. **Tokenise the history strings** (§4) — 89 sites bake a name into stored
   text.
4. **Make the Clerk username editable** (§5) — the feature.
5. **Add display names** (option C) — a separate pass, safe once 2 has landed.

Names are already resolved per request from Clerk on every path that matters,
so PR 4 is a UI job, not a data job — roughly one form on `/profile` and one
extracted field component.

PRs 2 and 3 are the same principle applied at two layers: **the thing you
store should be the thing that never changes.** Both are worth doing **on their
own merits, independent of this feature** — today's correctness rests on
usernames being unique and permanent, which is precisely the property we are
about to remove. Both are also cheaper than they look. Persisted game state is
already `userId`-based everywhere, so PR 2 is mostly *deleting* translation
code with no migration (§3a); and PR 3's mechanism **already exists and
ships in two games** — just duplicated, undelimited, and applied inconsistently
(§4a).

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
and correct; the fourth is the subject of §4:

| Snapshot | Where | Behaviour under a rename |
|---|---|---|
| `IGameCommand.senderUsername` | written `api/game/command/route.ts:135` | **Self-healing.** `replay.ts:301` prefers today's resolved name; rewritten next turn. |
| `GameResult.guestNames` | `guest.ts:119` → `finishGame.ts:106` | **Correct as-is.** Snapshots guests whose Clerk user gets swept after `GUEST_SWEEP_DAYS`. Migrating it would be wrong. |
| `Invitation.senderName` | written `api/lobby/route.ts:111`, read `lobbyPreview.ts:58` | **Goes stale** for the lobby's remaining TTL. Already documented as such on the field. Acceptable — a lobby is short-lived, and `lobbyPreview.ts:58` already falls back to a live Clerk read when the field is absent. |
| `gameState.history[]` | 89 `unshift`/`push` sites across 8 game folders | **Frozen forever** — except in the 2 games that already resolve ids at render (`replaceHistoryUserIds`). The inconsistency, and the fix, are §4. |

Nothing in Mongo is *keyed* on a name. **There is no migration.** The only
write worth planning is a new one, not a backfill (§5e).

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
| **0b** | **Tokenise history strings** (prerequisite, §4) | Nothing directly — history lines stop lying after a rename | Mechanism already ships in 2 games, so this is mostly *consolidation*: replaces a byte-identical duplicated helper and a naive substring replace. Also kills `MatchHistory`'s `startsWith` actor guess (§4c). Schema change is **free today** while history is test data. | 89 write sites to touch, though mechanically. Raw Mongo history becomes less readable. Changes a persisted field's shape — cheap now, expensive later. | ✅ **Do while free** |
| **A** | **Editable Clerk username** — `user.update({ username })` | One name, changeable, still globally unique | Zero new storage, zero new API routes. Propagates automatically through `nameOf`. Clerk enforces uniqueness and availability. Fixes §1c defects as a side effect. | Frees the old handle for someone else to claim → invite-by-handle can resolve to a different person (**locksmith**, §7). Needs `username` enabled as a Clerk instance attribute — verify first. | ✅ **Then this** |
| **B** | **Secondary display name** — an editable name of our own, shown to everyone (this document said `firstName`; see §6 PR 5 for why it isn't) | A friendly non-unique name; handle stays fixed | Familiar (Twitter/X). Non-unique means no "name taken" friction. Field already exists — no schema change. | Requires flipping `readableName`'s order. **Blocked until option 0 lands**, or non-unique names collapse board state (§3). Handle still unchangeable, so the original ask is only half met. | ⚠️ Viable after 0 |
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

## 4. String outputs — the same problem, one layer down

§3 fixes the *keys*. It does not fix the **89 history lines** that bake a name
into a stored string. This section is the answer to "should history store a
token and resolve it at render?" — and the answer is **yes, because the repo
is already doing it, badly, in two games.**

### 4a. What is actually stored today

`gameState.history[]` is `string[]`, persisted, and read by the live board via
`publicGameState`. Across the 8 game folders there are **89 write sites**, and
they are not consistent:

- **Most bake a name.** `${this.senderUsername} rolled a ${roll}` —
  `SnakesAndLaddersLogic.ts:155`, and the same shape in all 8 games.
- **Some write a raw `userId`.** `WorldDominationLogic.ts:79` writes
  `${riskData.currentTurn} drew a World Domination card`; `:60` writes
  `${first}`; `:357` writes `${defenderEliminated} eliminated!`. All three are
  Clerk ids.

To clean up the second group, **two games already resolve ids at render time**:

```ts
// SettlementsAndCitiesModels.ts:400 — and byte-identical at
// WorldDominationModels.ts:299
function replaceHistoryUserIds(history: string[], userIdNameMap: {...}): string[] {
    return history.map(entry => {
        let updated = entry;
        for (const [userId, username] of Object.entries(userIdNameMap)) {
            if (!userId) continue;
            updated = updated.split(userId).join(username);
        }
        return updated;
    });
}
```

Hooked in through `publicGameState`'s optional history-override parameter
(`GameData.ts:29`), which exists for exactly this.

**So the mechanism is already in production.** It arrived as a patch for a few
accidental id interpolations rather than as a design, which is why it is
duplicated, undelimited, and applied by only 2 of 8 games. The result is that a
single history array can hold both a frozen name and a live-resolved id.

### 4b. Three things wrong with the current version

1. **Duplicated verbatim** in two files — a caveman finding on its own.
2. **No delimiter.** It substring-matches raw Clerk ids, and it **re-scans its
   own output**: each replacement runs over the result of the previous one, so
   a name containing another player's id would double-substitute. Vanishingly
   unlikely, but it is luck, not design.
3. **O(entries × players)** per response, with a `split`/`join` allocation per
   player per line.

### 4c. The heuristic this would also kill

`MatchHistory.tsx:29` works out **who each line is about** by prefix-matching
the rendered name:

```ts
dotColour: playerColourFor(usernames.find(u => entry.startsWith(u)), usernames)
```

That is guesswork. It mis-attributes when one name prefixes another ("Dave" vs
"DaveT", resolved by array order), and under a rename it fails outright — the
frozen line says the old name, `usernames` holds the new one, so the line
loses its colour. A stored actor id turns this from a guess into a fact.

### 4d. Recommendation — do it, and do it now

Store the actor **structurally** and any other mentions as **delimited tokens**:

```ts
interface IHistoryEntry {
    text: string;          // "{{user_2abc}} attacked Ukraine from Ural"
    actorId?: string;      // whose line this is — kills the startsWith guess
}
```

One shared resolver in `src/utils/games/` replaces both copies of
`replaceHistoryUserIds`: a single-pass regex over `{{…}}` that does **not**
re-scan substituted output, falling back to `UNKNOWN_PLAYER_NAME` for an id it
cannot resolve (a swept guest). Rendered as React text, as today, so escaping
is unchanged.

**Why now specifically:** this changes the shape of a persisted field. Today
`gameState.history` is test data you have said can be discarded, so the schema
change costs nothing. Once real games exist you are choosing between a
migration and living with tokens-in-strings forever. **This is the cheapest
this will ever be** — which is the strongest argument for pulling it forward
into the same batch of work rather than leaving it as the "someday" item my
first draft made it.

### 4e. What this is not

Not full structured events (`{ type, params }` with a formatter registry per
line). That would mean 89 formatters plus a registry to replace 89 template
strings — the "right" design for a greenfield engine, and over-engineering
here. The recap timeline already provides structured events for the views that
need them (`replay.ts:262-269` carries `senderId`, `summary` and `timestamp`
separately). Keep the strings; fix what is baked into them.

### 4f. Two related notes

- **The other string paths are fine.** The recap/timeline regenerates its
  strings from `commandHistory` on every build, re-resolving `senderUsername`
  first (`replay.ts:301`), so it is already live. Push copy is generated at
  send time and delivered — inherently a snapshot, correctly so.
- **A perspective is baked in too, not just a name.**
  `WorldDominationLogic.ts:355` stores `you lost ${attackerLosses}` in the
  *shared* history every player reads, so an opponent sees "you lost 2" about
  someone else's losses. Pre-existing and out of scope here, but it is the same
  class of mistake — freezing a viewer-dependent value into a shared string —
  and worth a **croupier** look while this area is open.

---

## 5. How the rename is built (option A)

The design detail for the rename itself. It assumes PRs 1–3 have landed; §6
sequences the whole thing into commits.

### 5a. Verify first

Clerk's `username` must be enabled as an instance attribute or
`user.update({ username })` fails with `form_param_unknown`. `/signup` mounts
Clerk's own `<SignUp />`, so the attribute set is dashboard-controlled and not
visible in this repo. **Check before writing code.**

### 5b. The write — client-side, no API route

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

### 5c. What must be reused

Per AGENTS.md's component-reuse rule, none of this is new:

- **`ProfileIdentity`'s existing `action` slot** (`ProfileIdentity.tsx:18`),
  already used by "Remove photo" at `profile/page.tsx:142`. Put "Edit name"
  there — do **not** add a second header block.
- **The form pattern**: `ag-card ag-form-card` + `ag-section-label
  ag-field-label` + `ag-input` + `ActionButton pending/pendingLabel`. It exists
  twice already — `PasswordForm.tsx:50-71` and `ClaimAccountForm.tsx:54-90`.
  There is **no** `.ag-inline-edit` or form-row class in `ag-theme.css`;
  `ag-form-card` *is* the pattern. Don't invent a class, don't inline-style a row.
- **Validation**: ~~`isValidGuestName` / `MAX_GUEST_NAME_LENGTH`~~ — **this
  was wrong, and PR 4 did the opposite.** A guest name and a Clerk handle are
  not the same rule: `isValidGuestName` accepts `Dave Smith`, `O'Brien` and
  `ダンダン`, and Clerk's handle charset takes none of them, so reusing it
  would let a player type a name only the round trip rejects. The handle rule
  already existed — it was just stranded in the server-only `clerk.ts` — so it
  moved to `src/utils/users/username.ts` (`isValidUsername`,
  `MIN/MAX_USERNAME_LENGTH`, `USERNAME_RULE`, `slugifyUsername`), which the
  claim route and the profile form now share. That is a *moved* regex, not a
  second one; the second regex the rule was guarding against would have been
  re-deriving Clerk's charset inline in the form. **PR 5's display-name editor
  wants `isValidGuestName`** — the free-text name genuinely is that rule.
  `randomGuestName` still applies if a reroll is offered.
- **Preview text**: `profileHeading` / `personalName` / `publicHandle`. Never
  re-derive "which name shows here".

### 5d. The one extraction worth making

`join/JoinForm.tsx:340-365` is **already** a display-name field: label +
`ag-input` + `maxLength={MAX_GUEST_NAME_LENGTH}` + `isValidGuestName` gate +
`ag-die-btn`/`DieFace` reroll. A profile name editor is the second copy of
exactly that block — which is the signal to extract.

Extract `src/components/ui/DisplayNameField.tsx` (`value`, `onChange`,
optional `onReroll`, `label`) and use it in both. Note the shared piece is the
**field**, not a hook: JoinForm's name goes to the join API, the profile's goes
to Clerk. A `useDisplayName` hook would have one call site, which AGENTS.md
rule 3 says is not yet a shared piece.

**A second extraction the caveman found once PR 4 was written**, missed by the
paragraph above: the *write* was duplicated too. `UsernameForm`'s submit was a
second copy of `useProfilePicture`'s save — the same guard, reload, toast pair
and in-flight flag around one write to the signed-in Clerk user. Those four
things now live in `src/utils/hooks/useClerkUserSave.tsx`, and both callers are
a two-line `save(...)`. **PR 5.2's display-name editor is its third caller** —
`save(...)` — so it should not hand-roll the
sequence either.

### 5e. The §1c defects go first, not here

The three sweep-up items (the claim path setting no username,
`UserInviteList`'s raw reads, the dead `usernameListToUserIdList`) are
independent of the rename and are **PR 1** in §6 — their own commits, landed
before any refactor, so a bug fix never arrives tangled up with a rewrite.

### 5f. Not needed

No Mongo migration. No backfill. No new collection. No new API route — in any
phase. The one schema change in the whole plan is §4's history shape, and it
is free because that data is disposable.

---

## 6. Commit breakdown — the route to option C

Five PRs, sequenced so every commit builds green and no commit mixes a bug fix
with a refactor. Bug fixes are called out as their own commits throughout.

Pre-commit gates on **every** commit below, per AGENTS.md: `npm run build`,
`npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`). Anything touching
`src/utils/apiModels/` or a game's rules also runs `npm test`.

### PR 1 — Standalone bug fixes

Independent of everything else. Land first so the later refactors are not
carrying defects along with them.

| # | Commit | Notes |
|---|---|---|
| 1.1 | Delete the unused `usernameListToUserIdList` | Pure deletion (`clerk.ts:239`, zero callers). Also update the two stale references in `docs/account-less-play.md` (§lines 40, 357). |
| 1.2 | Resolve friend names through the shared helper | Fixes `UserInviteList.tsx:48,52,91-95` and `profile/page.tsx:284,303` reading `friend.user.username` raw. Route through `displayName()`/`publicHandle()`. Also fixes claimed guests vanishing from the invite picker's suggestions. |
| 1.3 | Give a claimed guest a real username | `api/user/claim/route.ts` — derive a candidate from their display name, uniquify against Clerk, set it in the same `updateUser` pass. Makes them findable by `usersByUsername`. They can change it once PR 4 lands. |

**Review:** `locksmith` on 1.3 (it writes to Clerk on a guest principal, and the
claim route is already rate-limited — confirm the new write sits inside that
gate). `caveman` on 1.2.

**Not player-visible enough for a "What's new" line**, except arguably 1.3 —
judgement call for `rulebook`.

### PR 2 — Re-key response DTOs by `userId` (option 0, §3)

Split **per game** rather than per layer. A commit that re-keys the server
without the client would render an empty board, so each game moves end-to-end
in one commit and stays green.

| # | Commit | Notes |
|---|---|---|
| 2.1 | Add `userIdList` to the game response DTOs | Additive; nothing reads it yet. `IGameDataResponse`, `IGameResponse`, `CreateResponse`, `CreateDataResponse`. Zero behaviour change. |
| 2.2 | Add id-based player identity helpers | `playerColourFor` by id alongside the name version; an `opponents()` overload taking ids. Additive — old callers untouched. |
| 2.3 | Key Snakes and Ladders player states by `userId` | Server (`SnakesAndLaddersModels.ts:183`) + board page + components, together. The template for the five that follow. |
| 2.4 | Key Dice Cities player states by `userId` | |
| 2.5 | Key Settlements and Cities player states by `userId` | Also `gs.playerStates[v.owner]` at `page.tsx:198`. |
| 2.6 | Key World Domination player states by `userId` | |
| 2.7 | Key Train Time player states by `userId` | |
| 2.8 | Key Outbreak player states by `userId` | Most client sites (board, hands, event tray, actions). |
| 2.9 | Key per-turn chart series by `userId` | `formatPerTurnChart` (`GameDataApi.ts:59`) maps `Map<userId, n>` → `Record<username, n>` — the same collision class as `playerStates`, one shared helper. |
| 2.10 | Compare player identity by id, not name | The 11 `currentUsername(user)` sites → `user.id`. Six get simpler. This is the commit that kills the stale-session empty board (§3c). |
| 2.11 | Remove the name-based identity helpers left unused | Cleanup. **If this commit is not a net deletion, something was rebuilt rather than removed.** |

**Review:** `croupier` on 2.3 (then spot-check one more) — every response
builder changes shape, though no new field ships. `caveman` on 2.11.
`gremlin` on 2.10.

**No "What's new" line** — internal refactor, invisible to players.

### PR 3 — Tokenise history strings (option 0b, §4)

Uses a short-lived strangler so games convert one at a time instead of one
89-site commit that cannot half-work. The transitional branch is deleted in
3.11, so the temporary complexity does not outlive the PR.

| # | Commit | Notes |
|---|---|---|
| 3.1 | Extract the duplicated history id resolver | **Bug fix (duplication).** One shared helper replacing the byte-identical copies at `SettlementsAndCitiesModels.ts:400` and `WorldDominationModels.ts:299`. Behaviour identical for now — dedup only. |
| 3.2 | Fix the resolver re-scanning its own output | **Bug fix.** Single-pass replace so a name containing another player's id cannot double-substitute (§4b). |
| 3.3 | Add `IHistoryEntry` and the token resolver | `{ text, actorId? }`, a `{{userId}}` resolver, and a normaliser that still accepts a plain `string`. Additive — no game uses it yet. |
| 3.4–3.10 | Convert one game's history to tokens | Seven commits, one per game folder writing history. Each swaps `${this.senderUsername}` for a token and sets `actorId`. Green after each. |
| 3.11 | Drop the legacy string branch and tighten the type | `IGameState.history` becomes `IHistoryEntry[]`. Schema updated. **Discard the existing history test data** rather than migrating. |
| 3.12 | Colour history lines by their recorded actor | **Bug fix.** Replaces `MatchHistory.tsx:29`'s `entry.startsWith(username)` guess, which mis-attributes when one name prefixes another (§4c). |
| 3.13 | Stop World Domination's shared history saying "you" | **Bug fix (croupier).** `WorldDominationLogic.ts:355` writes `you lost ${attackerLosses}` into the history *every* player reads. Placed here because it edits the same lines 3.6 rewrites — doing it earlier just guarantees a conflict. |

**Review:** `croupier` on 3.13 and on the PR as a whole (history is shared
state). `caveman` on 3.1 and 3.11. `rulebook` on the schema change.

**No "What's new" line** — the log looks the same to a player; it just stops
going stale.

### PR 4 — Editable username (option A, §5)

The first player-visible PR. Verify `username` is enabled as a Clerk instance
attribute **before starting** (§5a) — without it `user.update({ username })`
fails with `form_param_unknown`.

| # | Commit | Notes |
|---|---|---|
| 4.1 | Extract `DisplayNameField` from the join form | The second-copy extraction (§5d). `JoinForm.tsx:340-365` keeps working through the new component — no behaviour change. |
| 4.2 | Let a player change their username from their profile | `user.update({ username })` → `user.reload()` → toast, no API route (§5b). Reuses `ProfileIdentity`'s `action` slot, `ag-card ag-form-card` and `ActionButton`; validates with `isValidUsername` (§5c). Surfaces Clerk's `form_identifier_exists` as a readable sentence. |
| 4.3 | ~~Rate-limit username changes~~ | **Not built.** The locksmith's answer was no: the write is the browser's own call to Clerk, so `consumeRateLimit` has no route to sit on and buying one would mean a server write duplicating what Clerk already does. See §7. |
| 4.4 | Add the "What's new" line | **Required** by AGENTS.md — this is player-visible. Enhancements group, newest first. |

**Review:** `locksmith` (**blocking** — freeing an old handle means an invite
typed from memory can reach a different person; that question needs answering
before this ships), `caveman` on 4.1, `rulebook` on 4.4.

### PR 5 — Display names (option C, separate pass)

Only safe after PR 2. Non-unique names are exactly what the re-key made
survivable.

| # | Commit | Notes |
|---|---|---|
| 5.1 | Show a player's display name instead of their handle | Flips `readableName`'s order (`players.ts:64`) to display name → `username`. **This is the whole behaviour change** (§1a). It also makes guests and registered users consistent, since guests already resolve by a typed name — so this commit *removes* the guest special-case rather than adding a second one. |
| 5.2 | Let a player edit their display name | Reuses `DisplayNameField` from 4.1. Both fields now sit on `/profile`: handle (unique, how you are invited) and display name (free text, what people see). |
| 5.3 | Disambiguate duplicate display names in a game | Two players called "Dave" are now distinct but look identical. Show the handle as a tiebreak where a seat list would otherwise repeat a name. Scope depends on how it actually looks — worth deferring until 5.1 is on screen. |
| 5.4 | Add the "What's new" line | Player-visible. |

**Review:** `croupier` on 5.1 (it changes what name every response carries),
`caveman` on 5.2, `rulebook` on 5.4.

**The one thing that changed from the plan: the display name is not
`firstName`.** §2's option B named Clerk's `firstName` as the field, on the
grounds that it already exists. It exists as a *first name*, which is a
different thing:

- Clerk's own signup form collects it under that label, and `fullName` reads it
  as half of a real name — so a player calling themselves "Dave the Destroyer"
  would have had a profile subtitle reading "Dave the Destroyer Smith".
- Flipping the resolver onto it would have published, on deploy, whatever real
  name every existing player gave at signup. They typed it to identify
  themselves, not to be called it in front of strangers.
- Clerk's hosted account UI would still call it First name, teaching the
  opposite vocabulary to the profile screen.

So the display name is `publicMetadata.displayName`, a field of our own. The
consequences, all of them improvements:

- **A handle seeds it, so nothing has to backfill.** The order is
  `chosenName → publicHandle`, so a player who has chosen nothing is known by
  their username, exactly as before this PR — and the day they pick a display
  name it takes over. Nobody's name changes on deploy.
- **Clerk's `firstName`/`lastName` then went entirely** (see below). The one
  read left is inside `chosenName`, for a guest minted before the display-name
  field existed, and it is gated on the user having no handle — the only
  population it can be true of.
- **It has a route, so the name the whole table reads is server-validated.**
  `publicMetadata` is writable only from the Backend API, so
  `POST /api/user/displayname` exists — with `isValidDisplayName` and a rate
  limit on it. That closes something the `firstName` design left open and §7
  had accepted for the handle: `user.update({ firstName })` is the browser's
  own call to Clerk, so the form's validation would have been a suggestion and
  dev-tools could have sent a thousand characters of anything into every seat
  list and push at the table. `docs/account-less-play.md` §14 had already
  settled that a player does not name themselves in front of others without the
  server having a say; this keeps that true.
- **A guest is minted with one** (`createGuest` writes
  `publicMetadata.displayName`), so a guest and an account are named by one rule
  rather than two, and claiming keeps the name they have been playing under.

The handle keeps its browser-side write: Clerk enforces uniqueness on it,
answers `form_identifier_exists` in a sentence worth showing, and can step a
player up to re-verify first — all three lost if the server wrote it. `NameForm`
therefore makes two writes, handle first, because it is the half that can be
refused: losing that race leaves both names as they were.

**Three further notes from building it**, none of which changed the plan above:

- **The fallback goes through `publicHandle`, not `user.username`.** Written
  as `firstName || username` the flip would have handed a guest with no typed
  name the random account id `createGuest()` minted — the exact thing the guest
  special-case existed to prevent. `publicHandle` already answers "the handle
  this player chose, or none", so the special-case is *replaced* by it rather
  than deleted.
  `personalName` fell out as a consequence: it existed only to invert
  `readableName`'s order, and with the order flipped it is that function plus
  a null, so it became a two-line wrapper instead of a second copy of the
  preference order.
- **5.2 is one form, not two.** `UsernameForm` became `NameForm` and grew the
  display-name field above the handle, writing whichever halves changed in one
  `user.update`. Two editors would have meant two toggles, two collapsing
  sections and two copies of the submit — and they are one question asked at
  two levels of formality. It is `useClerkUserSave`'s third caller, as §5d
  predicted. `DisplayNameField` gained a `hint` slot, which both callers now
  use to state the rule the field enforces instead of silently disabling Save.
  Whoever has no handle to fall back on — a guest, or a player claimed before
  §1c's fix minted them one — is the one who cannot blank their display name;
  everyone else can clear it and go back to their handle.
  The rule itself moved out from under `utils/games/guestName.ts` into
  `utils/users/displayName.ts`, the sibling of the handle rule PR 4 un-stranded
  for the same reason: it stopped being a guest's rule the moment it became
  every player's, and a rule named for guests is how a second one gets written
  for everybody else.
- **5.3 lives at the resolver, not the screen.** A collision is only visible
  across a *set* of players, and no screen holds one — `clerk.ts` does, four
  times over. So `namesFor(users)` resolves a whole set at once and tags a
  repeated name with the handle behind it, and `buildUserDirectory`,
  `userIdListToUsernameList`/`Map` and `userListToUserIdNameMap` all go
  through it, as do the two sites that were still naming a roster one player
  at a time (the game-over push, the frozen `actorUsername` on a reaction). No
  board page learned a second way to name a player. Three consequences worth
  writing down:
  - **The tag is scoped to what the reader is looking at**, because that is
    the only place ambiguity exists. A game response tags within that game's
    seats; `buildUserDirectory` tags across the whole screen it was built for,
    so two Daves in two different rows of your games list are told apart too.
    The same player can therefore read as "Dave" on one screen and
    "Dave (@dave)" on another. That is the disambiguator doing its job, not a
    disagreement — nothing compares the strings, since every identity
    comparison goes by `userId`.
  - **Collisions are counted on what a reader sees**, not on the bytes —
    `sameName` folds case, spacing, punctuation, accents, compatibility forms
    and the Cyrillic, Greek and small-capital letters drawn the same way as
    Latin ones. Without that last part the mitigation is defeated by one
    keystroke: `Dаve` with a Cyrillic `а` is a different string and the same
    name, so two seat rows would render identically and neither would be
    tagged. Each name is still displayed exactly as its owner wrote it; the
    fold is only ever a comparison key.
  - **Nobody in a colliding group keeps the bare name.** The first version
    tagged only players who had a handle, which put the tell exactly backwards:
    a guest renaming themselves to match a registered player left the *victim*
    as "Dave (@dave)" and the impostor as a clean "Dave". A player with no
    handle now gets a number instead, assigned in userId order so it is stable
    between requests.
  - **The lobby's guest-name uniquifier reads the untagged names**
    (`userIdListToUntaggedNameList`), because it compares against a name a
    player is *about to type*: "Dave" has to read as taken even when the two
    Daves already seated are showing as "Dave (@dave)" and "Dave (@daveb)". It
    also makes room for its own suffix now rather than appending past the
    length cap, since what it returns is stored as a display name and has to
    clear the same rule a typed one does.

**Real names went with it.** Once a display name existed, nothing needed
Clerk's `firstName`/`lastName`: they came out of `UserDto` (so no real name
travels to another player at all), out of the profile subtitle and the
friends-row title, and out of `createGuest`, which had been storing a guest's
typed name in a field called *first name*. `fullName` is gone. A friends row is
now "Dave (@dave)" — the name they chose and the handle you invite them by,
which is what that row was for — and just "dave" for someone who has chosen no
display name, since printing the handle twice says nothing.

The one read that survives is the legacy guest path described above. It can be
deleted outright once no guest minted before this PR remains: they are swept
`GUEST_SWEEP_DAYS` after their last game concludes (§8), so a release cycle
past that window makes `NamedUser.firstName` and the `publicHandle(user) ?`
line in `chosenName` a two-line deletion with nothing to migrate.

**On impersonation.** §2 listed it as option C's one real cost — "a non-unique
display name can freely copy someone else's" — and §5.3 is the mitigation. It is
worth being plain about what that mitigation is and is not. It does not prevent
the copy: any player may take any name. It guarantees that where a name is
shared, *every* player carrying it is marked, by their handle or by a number, on
every surface that names them. Refusing the rename instead would mean the route
enumerating the caller's live games to know what "taken" even means, and would
still leave the two players who were already there. Marking at the resolver is
both cheaper and more complete — it covers names stored before the rule existed,
and a table a player joins after renaming.
- **`publicHandle` stopped trusting the guest flag.** `/api/user/claim` clears
  `publicMetadata.guest`, but the handle it mints only started being minted in
  PR 1. So a player who claimed before that carries a `guest_<uuid>` account id
  with no flag on it — and with `readableName` now falling back to the handle,
  and 5.3 tagging with it, that id had two fresh routes onto other players'
  screens. `publicHandle` now recognises the minted shape itself, which closes
  both and puts their profile in a state the new editor can fix.

### Sequencing summary

```
PR 1  bug fixes            ── independent, land any time
PR 2  re-key by userId     ── blocks PR 4 (stale-session bug) and PR 5 (collisions)
PR 3  tokenise history     ── blocks PR 4 (history would lie after a rename)
PR 4  editable username    ── the feature
PR 5  display names        ── the separate pass
```

PRs 2 and 3 are independent of each other and can run in parallel or either
order. Both must precede PR 4.

---

## 7. Handoffs

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

  **Answered when PR 4 shipped — verdict: ship it, nothing blocking.** All three
  answers turn on the same structural fact: the rename is the browser's own
  `PATCH /v1/me` to Clerk, so no code in this repo is on that path and *every*
  server-side policy on a rename is unimplementable without first inventing
  `POST /api/user/username`.

  **That premise expired when PR 5 landed.** The display name needed a route —
  `publicMetadata` is writable only from the Backend API — so
  `POST /api/user/displayname` now exists and shows what one costs: a file and
  a test file. The argument for leaving a *handle* change in the browser is
  therefore no longer "there is nowhere to put a policy". It is the three
  things Clerk does on that write and would stop doing if the server made it:
  enforce uniqueness, answer `form_identifier_exists` in a sentence worth
  showing a player, and step them up to re-verify a sensitive field. That is a
  narrower objection, and an honest one.

  - **Handle recycling is real and accepted.** Nothing persisted is keyed by
    handle — PR 2 saw to that — so an existing friendship or seat cannot
    transfer with a name, and both ways a typed handle is consumed need a
    further human act (a friend request must be accepted; a game invite means
    the host chose to seat them). The impersonator gains only what any invited
    player gets. The real mitigation, if the risk is ever judged to matter, is
    a svix-signed `user.updated` webhook recording freed handles and a
    quarantine window in `usersByUsername` — its own PR, not this one.
  - **No rate limit** (so commit 4.3 was not built). `consumeRateLimit` only
    fires on our routes and there is no route here; buying one means a server
    write that duplicates what Clerk already does correctly, and Clerk enforces
    its own per-IP limits on `/v1/me`. The honest cost is that
    `api/friends/invite`'s 30/hour is now a speed bump rather than a wall — the
    same question is answerable unmetered from the console, where
    `form_identifier_exists` means taken. Its comment says so now.
  - **The guest gate is UX, not a control.** Hiding the editor stops a guest
    being *offered* a handle, not from setting one — nothing server-side is
    involved. `readableName` inverts for a guest so a squatted handle isn't
    even displayed, but `usersByUsername` would still resolve it. If "a guest
    has no handle" is ever meant as a rule, it needs the route above.
  - **Case-insensitivity doesn't matter here.** Clerk enforces case-insensitive
    uniqueness, so case variants can never be two accounts. The
    `.toLowerCase()` at `friends/invite/route.ts:44` guards `usersByFilter`
    handing back a non-matching user, not case confusion. The asymmetry worth
    knowing: `lobby/route.ts:80` and `gameSetupRequest.ts:90` check only a
    count, which is safe today and would stop being safe if Clerk's `username`
    filter ever loosened toward partial matching.
  - **One accepted staleness.** `api/lobby/route.ts:111` freezes `senderName`
    onto the lobby, so a join card keeps naming a handle its creator has since
    given up. Capped by the lobby TTL, and resolving live would cost the round
    trip that snapshot exists to avoid.
- **rulebook** — the player-visible "What's new" line, when this ships.
  Deliberately not added by this document, which is planning only.

Cosmetic aside, no work needed: `avatarColor` (`utils/ui/avatar.ts:22`) is
name-seeded, so a rename changes the initials-badge hue. Worth knowing, not
worth preventing.
