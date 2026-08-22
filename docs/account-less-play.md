# Account-less play — join-by-code lobbies

A planning document. It asks whether Async Games could take the Jackbox
onboarding trick — *the host puts a four-letter code on screen, everyone else
types it in, picks a name, and plays* — and use it to cut the sign-up wall in
front of a first game.

Short answer: **the joining half transplants almost for free; the returning
half is the real work.** Jackbox's code works because everybody is in the same
room at the same time and the session dies when the TV turns off. Async Games
is the exact opposite: a game lasts days, and the only thing that pulls a
player back is a push notification addressed to an identity. A code that gets
someone *into* a game but gives them no way to be told it's their move produces
an abandoned game, not an onboarded player. Everything below is organised
around that distinction.

---

## 1. What the infrastructure assumes today

Identity in this codebase is remarkably thin, which is good news. From
[`ARCHITECTURE.md`](../ARCHITECTURE.md) §5 and §10:

> **User identity is never stored beyond a Clerk `userId`.** Usernames are
> resolved on demand.

Mongo stores opaque strings. `IGameData.userIdList`, `currentTurn`,
`turnOrder`, `winner`, `IGameCommand.senderId`, `Friendship.requesterId`,
`GameResult.playerIds` — every one of them is a `string` that happens to
contain a Clerk id. Nothing in the engine parses it, and the command
pipeline never asks Clerk who anyone is in order to run a move.

That means a guest does **not** need a parallel data model. It needs to be a
*principal* — something that can own one of those strings. There are exactly
five places where the app stops treating an id as opaque:

| # | Choke point | Where | What it does with the id |
|---|---|---|---|
| 1 | **Session → id** | `await auth()` in ~40 API routes; `useAuthGuard` on the client | Turns a request into a `userId`, or rejects it |
| 2 | **id → name** | `src/utils/users/clerk.ts` (`userIdListToUsernameList/Map/ImageMap`, `usernameListToUserIdList`) | Clerk lookup for every response DTO |
| 3 | **id → devices** | `sendPushToUsers(users: User[])`, `getDeviceTokens(user)` in `src/utils/firebase/` | Reads FCM tokens from Clerk `privateMetadata` |
| 4 | **id → preferences** | `getNotificationPreferences(user)` | Reads Clerk `privateMetadata` |
| 5 | **id → access** | `user.publicMetadata.unlocked` | The invite-only gate |

Five choke points is a small surface. **That is the whole finding**: the cost
of account-less play is not spread across the codebase, it is concentrated in
those five, plus a lobby model. Everything else — the command pattern, the
replay engine, the turn timer, the DTOs — is already identity-agnostic and
needs no changes at all.

---

## 2. Two problems wearing one hat

Splitting the Jackbox idea in half clarifies the sizing enormously:

**Joining is easy.** A code, a name box, a seat in a lobby. All of it is new
code in one place, none of it touches the engine.

**Returning is the product.** A guest who closes the tab has no account, no
email, and (unless we ask for it) no push permission. If they can't be told
"it's your move" and can't find the game again, a join-by-code game is a
one-turn novelty that leaves a half-played game rotting until the turn timer
abandons it — and it burns a real player's game, not just the guest's.

So an account-less player needs *some* durable handle. Ranked by how little we
ask of them:

1. **A signed session cookie** (long-lived, `httpOnly`) — costs the guest
   nothing, survives tab closes, dies with the browser profile or a private
   window. Enough for "come back to the same device".
2. **Web push permission** — works per-browser with no account at all, which
   is the interesting part: a guest *can* be notified it's their turn. Costs
   one permission prompt, and iOS requires the PWA be installed first, so it
   will not be there for everyone.
3. **A resume link** the guest can save/share to themselves (`/resume/<token>`)
   — no prompt, works cross-device, but relies on them actually saving it.
4. **An email address, no password** — one field, magic-link resume. This is
   the point where "account-less" starts becoming "an account", and it should
   be the *optional upsell after the first turn*, not the entry fee.

The recommendation is 1 + 2 as the baseline, 3 as the fallback shown on screen,
and 4 offered once — after the guest has taken their first turn and has
something to lose. Asking for anything up front reintroduces exactly the wall
this feature exists to remove.

---

## 3. Where the guest identity lives — three options

### Option A — a claimable Clerk user (recommended)

Create a real Clerk user server-side when the guest joins
(`clerkClient().users.createUser()`), give them a session with a sign-in
token, and mark them `publicMetadata.guest = true`.

- **Choke points touched: 0.** Every one of the five above keeps working
  unchanged, because the guest *is* a Clerk user. Devices, preferences,
  usernames, `auth()` — all free.
- **Claiming is trivial and lossless.** "Keep this game" = adding an email and
  password to the user that already exists. The `userId` never changes, so the
  guest's games, `GameResult` rows and friendships survive the upgrade
  intact. No merge logic, which is where account-linking projects normally
  die.
- **Costs:** Clerk bills by monthly active user, so every abandoned guest is a
  billable ghost — needs a sweeper that deletes unclaimed guest users after N
  days (the `staledevices` cron is the model). Clerk usernames are unique
  across the instance, so a guest typing "Dave" needs a suffixed real username
  under a separate display name. And Clerk has no first-class anonymous
  session, so this leans on `createUser` + sign-in tokens working the way we
  expect — **verify against current Clerk docs before committing to it.**

### Option B — a guest principal in Mongo

A `GuestPlayer` collection keyed by a `guest_<uuid>` id, a signed cookie for
the session, and a `resolveViewer(request)` helper that returns either a Clerk
id or a guest id.

- **Choke points touched: all five.** `auth()` calls become `resolveViewer()`;
  `clerk.ts` gains a merge step that fills guest names from Mongo;
  `sendPushToUsers` stops taking Clerk `User[]` and takes a
  `PushRecipient { id, tokens, prefs }` that both kinds of player can satisfy;
  the unlock gate needs a guest branch.
- **Upside:** no Clerk bill for guests, and total control over lifecycle.
- **Downside:** it creates a second identity system, and every future feature
  has to remember both. Claiming a guest account becomes a genuine data
  migration (rewrite `userIdList`, `turnOrder`, `currentTurn`, `senderId`
  across every command in `commandHistory`, `GameResult.playerIds`) — the kind
  of rewrite the `Mixed` command history makes especially awkward.

### Option C — device-local identity only (rejected)

No server principal; the browser holds a name and a random id. Rejected
immediately: the server could not authorise a turn, so anyone with a game URL
could play anyone's move. The command route's `userId !== command.senderId`
guard exists precisely to stop that.

**Recommendation: A.** It is the option that makes account-less play a
*configuration* of the existing identity system rather than a second one, and
the lossless claim path is worth more than the MAU line. Option B is the right
answer only if guest volume makes the Clerk bill the dominant cost — and by
then the sweeper's numbers will say so.

---

## 4. The lobby is an Invitation with a code

The instinct is to add a `Lobby` model. Don't. An `Invitation`
(`src/utils/mongodb/InvitationData.ts`) is *already* a lobby: it holds the
game type, the turn timer, the per-game settings, the player list with an
accept flag each, and — critically — the per-game `CreateGame()` that seeds
initial state and rolls turn order. Every game already has an invitation
discriminator. A second model would mean a second `CreateGame()` per game,
which is the duplication this repo's first rule exists to prevent.

What an invitation lacks is a **code** and the idea of an **empty seat**:

```ts
// added to IInvitationData
joinCode?: string;     // "PLUM" — present only on open lobbies
openSeats?: number;    // seats anyone with the code may claim
expiresAt?: string;    // ISO; abandoned lobbies self-destruct
```

Then:

- `POST /api/lobby` — host (signed in, unlocked) creates an invitation with a
  code and `openSeats`, no named invitees required.
- `POST /api/lobby/join` — public. Takes `{ code, name }`, mints the guest
  principal, appends `{ userId, inviteAccepted: true }` to `userIdList`,
  decrements a seat.
- `POST /api/lobby/start` — host starts when ready, rather than waiting for
  every named invitee to accept.

The game-creation block currently inlined in
`src/app/api/invite/accept/route.ts` (the `if/else if` chain that picks the
right `<Game>GameDataModel`, saves it, deletes the invite and sends
`GameStart` + the first `YourTurn`) has to move into a shared
`startGameFromInvitation(invite, actorId)` before `lobby/start` can exist. It
is roughly forty lines and there must be exactly one copy — this is the single
most important refactor in the whole feature, and it is also a **hard
requirement of the new-game checklist**: `gameRegistry.test.ts` asserts every
game has a game-start branch in the accept route, so if that chain gets copied
the test now guards two places and a new game silently starts in only one.

The all-accept path in `invite/accept` then calls the same helper, and a
lobby's seats and a named invite's acceptances are the same field, so the home
dashboard's incoming/outgoing invite lists keep working with no changes.

### The code itself

- **Alphabet:** uppercase minus the ambiguous glyphs — no `I`, `O`, `0`, `1`.
  22 symbols, 4 characters = ~234k codes.
- **Uniqueness is only needed among *live* lobbies**, which will be a handful.
  A unique index with a partial filter on open lobbies plus retry-on-duplicate
  is enough; no coordination, no counter.
- **Expiry:** a TTL index on `expiresAt` reaps abandoned lobbies, which also
  frees the code. This is the mechanism that keeps a 234k space from ever
  filling.
- **The code dies at game start.** It is a door into a lobby, never a door
  into a running game — otherwise it is a permanent "anyone can join your
  game" URL.
- **Guessing:** 234k with a handful live is a poor target, but a script can
  still walk it. Rate-limit joins per IP and bound the lobby's lifetime; both
  are cheap and both are needed before this is public.

---

## 5. Landmines in the current code

These are things reading the code turned up that will bite whichever option is
chosen. Most are small; the first is not.

**`userIdListToUsernameList` silently drops unknown ids.** It pushes a name
only for ids Clerk returns, so an unresolvable id makes the returned array
*shorter than the input* rather than leaving a hole. `CreateResponse` then does
`usernameList[userIdList.indexOf(currentTurn)]` — with a misaligned array, that
is the wrong player's name against the wrong seat, and it fails silently. Any
id the resolver can't answer for (a guest under Option B, a swept guest under
Option A, a deleted user *today*) triggers it. Fix it to be position-preserving
with a placeholder before adding any new kind of id — it is a latent bug in its
own right.

**Display names are not unique, Clerk usernames are.** Two guests both typing
"Dave" would collide, and parts of the client identify "me" by name
(`currentUsername(user)` in the board pages) rather than id. Enforce
uniqueness within the lobby at join time — "Dave (2)" — and prefer id-based
comparison anywhere it is being added.

**`useAuthGuard` bounces anyone without a Clerk user to `/login`.** Guest
screens need the same treatment the landing page already gets via
`allowSignedOut`, extended to mean "a guest session counts as authorised". One
hook, one option — do not let a second guard grow beside it.

**The access gate is Clerk-only.** `publicMetadata.unlocked` is what
`/unlockaccess` flips. A guest has, by construction, not passed it. The
resolution: **the gate belongs on lobby creation, not lobby joining** — an
unlocked host vouches for everyone holding their code. That keeps the
invite-only property (nobody gets in without a real user's involvement) while
letting the guest through.

**The turn-timer cron resolves the whole `userIdList` through Clerk** to
notify players. Under Option B that needs the recipient abstraction; under
Option A it is already fine.

**`GameResult.playerIds` will contain guest ids**, and profile/stats pages
read them back. Decide early whether a guest's results count toward anyone's
head-to-head record, and make sure a stats page can render a player it cannot
resolve — which is the same position-preserving fix as above.

**Friends and nudges assume both parties are Clerk users.** Simplest v1: a
guest can play but cannot be friended or nudged, and the UI hides those
affordances for guest seats rather than failing on them.

---

## 6. UI surface

Per [`AGENTS.md`](../AGENTS.md), this reuses the design system rather than
growing a parallel one. Existing pieces that already cover most of it:

- `GameSetupLayout` + `TurnTimerSelect` — the host's lobby screen is the
  existing setup screen with the player picker swapped for a seat list.
- `usePlayerList` — the host can still invite named friends *and* leave open
  seats; the picker is unchanged, it just no longer has to fill every slot.
- `Avatar` (+ `src/utils/ui/avatar.ts`) — a guest gets initials and a
  deterministic colour from their name with no extra work; guests have no
  profile picture, which `profileImageUrl` already returns `null` for.
- `GameLibrary` — the public landing page already renders it for signed-out
  visitors. A guest arriving via a code lands somewhere that already works.
- `ag-*` classes — list rows, pills, cards. The seat list, the code display and
  the join form are all compositions of existing classes.

Genuinely new, and small:

- **A code display** (host's screen — big, monospaced, tap-to-copy).
- **A code entry field** (4 boxes / one input) on `/join`.

Keep both local to their screen until something else needs them; extract on the
second use, per the repo's "second copy is the signal" rule.

The **"What's new" note** for this belongs in *enhancements* when it ships —
the doc alone is internal and does not earn a line.

---

## 7. Sizing

| Piece | Size | Risk | Notes |
|---|---|---|---|
| Extract `startGameFromInvitation` | S | Low | Pure refactor; do it first, it stands alone |
| Position-preserving name resolution | S | Low | Fixes an existing latent bug |
| Lobby fields + code generation + TTL | S | Low | Additive schema, `Invitation` discriminator untouched |
| `/api/lobby` create / join / start | M | Med | Join is the first public write endpoint — rate limiting matters here |
| Guest principal (Option A) | M | Med | Sits or falls on Clerk's createUser + sign-in-token flow |
| Guest principal (Option B) | L | High | Second identity system; all five choke points |
| Guest session + `useAuthGuard` | S | Low | One cookie, one hook option |
| Lobby + join screens | M | Low | Mostly composition of existing pieces |
| Guest push + notification permission | M | Med | The feature's whole value; iOS needs the PWA installed |
| Claim-your-account prompt | S | Low | Trivial under A, a migration under B |
| Guest sweeper cron | S | Low | Model it on `cron/staledevices` |

**Suggested order.** The refactor and the name-resolution fix are independently
worth doing and unblock everything. Then lobby + code + join with *signed-in*
players only — that is a real feature on its own ("start a game, share a code,
no need to know usernames") and it proves the lobby model with zero identity
risk. Only then add the guest principal, and add push and claiming in the same
step as the guest — a guest who cannot be notified and cannot keep their game
is worse than no guest at all.

---

## 8. Open questions

- **Does a guest's game count?** Toward `GameResult`, head-to-head, and the
  real player's stats — or is it an exhibition match? Leaning: it counts, and
  becomes fully attributed if the guest claims their account.
- **What happens when a guest goes quiet?** They will, more than signed-in
  players will. The `missedTurnCounts` abandonment path already handles it, but
  a guest seat probably deserves a shorter fuse than a real player's.
- **How many guests per game?** All-guest games are possible under this design
  and are also the abuse case (free anonymous storage). Capping open seats
  below the game's max, or requiring one unlocked player, is the cheap answer.
- **How long does an unclaimed guest live?** Drives the sweeper, the MAU bill
  under Option A, and how long a "resume" link keeps working.
- **Does the code survive into the game as a spectator link?** Tempting, and a
  different feature with different safety questions. Keep it out of v1.
- **Moderation.** [`docs/social-features.md`](./social-features.md) §7 already
  says: never open a text/state channel to strangers before blocking and
  reporting are real. A join code is exactly such a channel — a guest-authored
  display name is user-generated content visible to a real player, so name
  filtering is table stakes, and chat must stay off for guest seats until that
  work exists.

---

## 9. TL;DR

- **The infrastructure is unusually ready for this.** Identity is an opaque
  string everywhere that matters; only five places actually resolve it.
- **A lobby is an `Invitation` with a code and open seats**, not a new model —
  reusing it inherits every game's `CreateGame()` for free. Extracting the
  shared game-start helper out of `invite/accept` is the prerequisite.
- **Make the guest a claimable Clerk user** (Option A). It touches none of the
  five choke points and makes "keep my account" an update rather than a
  migration. Re-check Clerk's current capabilities before betting on it.
- **The code solves joining; it does not solve returning.** Push permission,
  a durable session, and a claim prompt after the first turn are what turn a
  join-by-code game into an onboarded player.
- **Ship it in two halves.** Codes for signed-in players first (valuable
  alone, no identity risk), then guests with push and claiming together.
- **Fix `userIdListToUsernameList` first** regardless — it drops unresolvable
  ids and misaligns every index-based name lookup downstream.
