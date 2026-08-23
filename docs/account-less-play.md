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

1. **A long-lived session cookie** — costs the guest nothing, survives tab
   closes, dies with the browser profile or a private window. Enough for "come
   back to the same device". Under the recommended option below this is *not*
   new work: it is the Clerk session the app already runs on. Only Option B
   has to build one.
2. **Web push permission** — works per-browser with no account at all, which
   is the interesting part: a guest *can* be notified it's their turn. Costs
   one permission prompt, and iOS requires the PWA be installed first, so it
   will not be there for everyone.
3. **A resume link** the guest can save/share to themselves — no prompt, works
   cross-device, but relies on them actually saving it. Again not new work
   under Option A: a Clerk sign-in token *is* a resume link. A bespoke
   `/resume/<token>` route is Option B's baggage, and building one beside a
   Clerk session would be the same "second identity system" mistake Option B
   is marked down for.
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

- **Choke points touched: one — the access gate.** Four of the five keep
  working unchanged, because the guest *is* a Clerk user: devices,
  preferences, usernames and `auth()` all come free. The exception is #5: a
  guest is a Clerk user who has *not* passed `publicMetadata.unlocked`, so
  `useIsAuthorised` (`src/utils/hooks/useAuthGuard.ts`) and the server-side
  check in `src/app/api/users/route.ts` need to accept `guest === true` as a
  second way to be authorised. That is a one-line predicate change, not a
  system — see §5.
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
  `sendPushToUsers` stops taking Clerk `User[]` and takes the
  `PushTarget { userId, token }` it already builds internally
  (`src/utils/firebase/revokedTokens.ts`) — the seam is "accept targets
  instead of deriving them from `User[]`", not a new recipient type; and the
  unlock gate needs a guest branch.
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
expiresAt?: string;    // ISO; abandoned lobbies self-destruct
```

Note what is *not* there: an `openSeats` counter. An open seat already has a
representation — an `IUserIdAcceptance` entry with a placeholder id and
`inviteAccepted: false`. A counter that must be decremented in lockstep with
an array append is a second source of truth for the same fact, and it would
also make open seats invisible to the screens that render an invitation's
player list from `userIdList` (`OutgoingInviteList`, via
`/api/user/outgoinginvites`). Seats live in the array; "how many are open" is
a `filter`.

Then:

- `POST /api/lobby` — host (signed in, unlocked) creates an invitation with a
  code and `openSeats`, no named invitees required.
- `POST /api/lobby/join` — public. Takes `{ code, name }`, mints the guest
  principal, appends `{ userId, inviteAccepted: true }` to `userIdList`,
  decrements a seat.
- `POST /api/lobby/start` — host starts when ready, rather than waiting for
  every named invitee to accept.

**The shared start path already exists** (#241). Turning an invitation into a
live game used to be inlined in `src/app/api/invite/accept/route.ts`; it is now
`startGameFromInvitation(invite, actorId, userList)` in
`src/utils/games/startGame.ts` — build the game document, save it, delete the
invitation, send `GameStart`, and send the opening `YourTurn` to whoever is up
first unless they triggered the start. `lobby/start` and `lobby/join` call that
same function, so there is one place a game comes into existence.

The seven-branch `if/else` chain that picked a `<Game>GameDataModel` was
deleted rather than moved — it was a third copy of a gameType → model map the
codebase already had. `mongodb.ts` now exports that record as
`GAME_DATA_MODELS` with a `gameDataModelFor(gameType)` lookup, and
`gameRegistry.test.ts`'s "game-start branch" case is gone with it (the
discriminator case above it already scans `mongodb.ts`, and the typed keys make
it a compile-time check on top). **A new game no longer needs a line in any
route** — worth knowing before adding one to the lobby routes below.

The dashboard's incoming/outgoing invite lists then keep rendering lobbies
without a schema fork, because a seat is just a `userIdList` entry. They are
not free of changes, though: those routes resolve names through
`userIdListToUsernameList`, so the placeholder and guest ids a lobby
introduces make the name-resolution fix in §5 a **prerequisite**, not a
tidy-up.

### When does the lobby start?

Today an invitation starts the game the moment every entry in `userIdList` has
`inviteAccepted: true` — there is no host action in the flow at all. **Keeping
that predicate is the whole trick.** An open seat is an unaccepted entry, so a
lobby starts when the last seat is claimed, using the existing check verbatim.

So a lobby is *sized*, not open-ended: the host picks a party — "Dave, plus two
open seats" — and the game starts when Dave accepts and both seats fill. Named
invitees and open seats coexist happily, because they are the same field. (The
host is not in `userIdList`; they are `senderId`, concatenated in
`CreateGame(invite, userIdList.concat(senderId))`, so the seat count is
opponents.)

A host can't always predict how many friends turn up, so there is one override:
a **"start now"** button. The cheap way to express it is *not* a second start
path — it **deletes the unclaimed seats**, which makes the existing all-accept
predicate true, and then calls the same `startGameFromInvitation`. One start
condition, one code path; the button edits the seat list rather than bypassing
the rule. It stays disabled while the party is under the game's minimum, which
`partySizeOutOfRange` already knows from `GameMeta.players` (§6).

Two mechanics follow from open seats being contended:

- **Claiming a seat has to be atomic.** `GameDataSchema` sets
  `optimisticConcurrency: true`; `InvitationSchema` does **not**. Two guests
  submitting the code at the same instant would each read the lobby, each
  append, and one would silently overwrite the other — or both would take the
  last seat and the party would exceed the game's maximum. The join must be a
  single conditional update that matches an unclaimed seat, not a
  read-modify-write. "Start now" racing a join is the same problem and wants
  the same treatment.
- **A claimed seat is a real acceptance**, so the last guest to join is the one
  whose request starts the game — exactly as the last invitee to accept does
  today, including the "skip the first `YourTurn` push for whoever triggered
  it" branch already in the accept route.

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
chosen. The first has since been fixed (#240) and is kept here for the
reasoning; the rest are still ahead.

**`userIdListToUsernameList` silently dropped unknown ids — fixed.** It used
to push a name only for ids Clerk returned, so an unresolvable id made the
returned array *shorter than the input* rather than leaving a hole.
`CreateResponse` then does `usernameList[userIdList.indexOf(currentTurn)]` —
with a misaligned array, that was the wrong player's name against the wrong
seat, and it failed silently. Any id the resolver can't answer for (an
open-seat placeholder, a guest under Option B, a swept guest under Option A,
a deleted user *today*) triggered it.

It was not one call site: every game's `gameStateToModel` builds its
`userIdNameMap` by zipping the two arrays positionally
(`userIdNameMap[userId] = usernameList[i]`) — all seven of them. Both
`userIdListToUsernameList` and `userIdListToUsernameMap`
(`src/utils/users/clerk.ts`) now stay position/key-complete: an unresolvable
id gets the placeholder `UNKNOWN_PLAYER_NAME` ("Unknown player") instead of
being dropped, so every call site keeps its alignment. `usernameListToUserIdList`
(username → id, the reverse direction) is unaffected — it has no callers yet,
and there is no meaningful id to place as a stand-in — so revisit it if a
caller appears.

**Display names are not unique, Clerk usernames are.** Two guests both typing
"Dave" would collide, and parts of the client identify "me" by name
(`currentUsername(user)` in the board pages) rather than id. Enforce
uniqueness within the lobby at join time — "Dave (2)" — and prefer id-based
comparison anywhere it is being added.

**The access gate is the one choke point a guest really does hit — and the
guard's predicate, not its redirect, is where it lives.** Under Option A a
guest *is* signed in, so `allowSignedOut` — the escape hatch the landing page
uses — never comes into play. The redirect they actually hit is the one to
`/unlockaccess`, because `useIsAuthorised` requires
`publicMetadata.unlocked === true` (and `src/app/api/users/route.ts` applies
the same rule server-side). The mechanism is one line in that predicate —
`unlocked === true || publicMetadata.guest === true` — not a second guard
beside it.

The policy behind it: **the gate belongs on lobby creation, not lobby
joining.** An unlocked host vouches for everyone holding their code, which
keeps the invite-only property (nobody gets in without a real user's
involvement) while letting the guest through.

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

**The host's lobby screen** is the existing setup screen with the player
picker joined by a seat list: `GameSetupLayout` + `TurnTimerSelect` +
`usePlayerList` (unchanged — it already keeps a trailing empty slot and filters
blanks, so "not every slot has to be filled" is behaviour it has today, not a
change), with `PartySizeHint` and its `partySizeOutOfRange` already owning the
min/max messaging that bounds the host's open-seat count (§8).

**The seat list filling up live** is `IncomingInvitesList` with different rows:
`useRefreshableData` + `usePushEvents`' invite events for the refresh loop, and
`ListSection` (first-load skeleton, refetch shimmer, `useAnimatedList` grow-in)
+ `ListRow` + `Avatar` for the rows. An unclaimed seat is `PendingTag`
(`.ag-pending-tag`) or the `.ag-dashed-add` placeholder; the join control is
`.ag-pill-action--accept`. `Refreshable` and `Skeleton` sit under all of it.
A guest gets initials and a deterministic colour from `Avatar` +
`src/utils/ui/avatar.ts` with no extra work, and has no profile picture — which
`profileImageUrl` already returns `null` for.

**The `/join` screen** for a code-holder with no account is `AuthScreen`, which
already owns the signed-out screen lockup (`Brand` + copy + card); the field is
`.ag-input`. `GameLibrary` already renders for signed-out visitors on the
landing page, so a guest arriving via a code lands somewhere that works.

**Getting a guest notified** is almost entirely built: `useFcmToken`,
`useNotificationPermission` (including its `'unsupported'` state),
`NotificationOffer` and `InstallOffer` over the shared `OfferCard`, and
`BottomBanner` — the iOS "install the PWA first" pitch is already written. The
work is rendering the existing banner on the guest's screen at the right
moment, not building the offer.

Genuinely new, and small:

- **A code display** (host's screen — big, monospaced, tap-to-copy). The
  "Copied!" flash is `useResettingState`, not a bespoke `setTimeout`.
- **A code entry field** (4 boxes / one input) on `/join`. Join errors go
  through `useToast` like every other flow.

Keep both local to their screen until something else needs them; extract on the
second use, per the repo's "second copy is the signal" rule.

The **"What's new" note** for this belongs in *enhancements* when it ships —
the doc alone is internal and does not earn a line.

---

## 7. Sizing

| Piece | Size | Risk | Notes |
|---|---|---|---|
| ~~Extract `startGameFromInvitation`~~ | S | Low | **Done** (#241) — `src/utils/games/startGame.ts`, plus `GAME_DATA_MODELS`/`gameDataModelFor` in place of the seven-branch chain |
| ~~Position-preserving name resolution~~ | S | Low | **Done** (#240) — `UNKNOWN_PLAYER_NAME` placeholder keeps every positional zip aligned |
| Lobby fields + code generation + TTL | S | Low | Additive schema, `Invitation` discriminator untouched |
| `/api/lobby` create / join / start | M | Med | Join is the first public write endpoint — rate limiting matters here |
| Guest principal (Option A) | M | Med | Sits or falls on Clerk's createUser + sign-in-token flow |
| Guest principal (Option B) | L | High | Second identity system; all five choke points |
| Guest access predicate | S | Low | One line in `useIsAuthorised` + the same rule in `/api/users`; under Option A there is no cookie to build |
| Lobby + join screens | M | Low | Mostly composition of existing pieces |
| Guest push + notification permission | S | Med | The feature's whole value — but the offer banners and permission hook already exist; this is wiring, not building |
| Claim-your-account prompt | S | Low | Trivial under A, a migration under B |
| "Start now" button | S | Low | Deletes unclaimed seats, then the existing start path; plus an atomic seat claim on `Invitation` |
| `unclaimedPlayerIds` on `GameResult` + claim `$pull` | S | Low | One filter on stats reads, one indexed update on claim |
| Guest sweeper cron | S | Low | Model it on `cron/staledevices`; reads the existing `{ playerIds: 1, endedAt: -1 }` index |

**The shape of the order** — codes for signed-in players first (a real feature
on its own, with zero identity risk), then guests, with push and claiming
landing alongside the guest rather than after them. §10 breaks that into
commits.

---

## 8. Decisions

These were open; they are now settled. What each one still costs is noted.

**A game counts once every player is a registered account.** A game with an
unclaimed guest in it is an exhibition match — it does not feed anyone's
head-to-head record or win rate — and it starts counting if and when the guest
claims their account.

The cheap mechanism, given `GameResult` is append-only and written once: store
an `unclaimedPlayerIds: string[]` alongside `playerIds` at write time. A result
counts when that array is empty, so stats queries add one filter and never have
to ask Clerk whether a player is a guest. Claiming an account is then a single
indexed update — `$pull` the id from every result carrying it — with no
recomputation and nothing to backfill. Under Option A the ids never change, so
the record the guest played under is the record they inherit.

**The abandonment fuse stays exactly as it is.** A guest who goes quiet is
handled by the same `missedTurnCounts` counter and the same
`MAX_CONSECUTIVE_MISSED_TURNS` ceiling in the turn-timer cron as anyone else.
No guest-specific timing, no new code.

**Every lobby has at least one registered user: the host.** Lobby creation sits
behind the unlocked gate and a guest never sees that interface, so an all-guest
game is impossible by construction rather than by a rule someone has to
remember. The host chooses how many seats to open, bounded above by the game's
maximum via `PartySizeHint`. This also disposes of the abuse case §4 raised —
free anonymous storage would need a real, unlocked account to open the door
first.

**An unclaimed guest is swept a week after their last game concludes.** Note
the key: *concludes*, not "was created" — a guest in a live game is never
swept, however long the game runs. `GameResult`'s existing
`{ playerIds: 1, endedAt: -1 }` index answers "when did this guest's last game
end" in one query, which is the whole of the sweeper's read; model the job on
`cron/staledevices`. Two edges worth handling:

- A guest who joined a lobby that never started has no `GameResult` at all.
  Sweep them on the lobby's own `expiresAt` instead.
- Deleting the Clerk user makes their id unresolvable, so their name vanishes
  from the *other* player's finished game — the position-preserving fix in §5
  turns that into a "Guest" placeholder rather than a misaligned list, which is
  the floor. Above the floor, and cheap: copy the guest's display name onto the
  `GameResult` when it is written. That store is already explicitly designed to
  outlive the game document, so a name it can render without Clerk is in
  keeping with what it is for.

**No spectators.** The code dies at game start (§4) and nothing else opens a
read-only door into a running game.

**No moderation in scope.** Recorded as a deliberate boundary, with one
residual: a guest-typed display name is still text a real player sees, so the
join endpoint should cap its length and character set. That is input
validation, not moderation. And per
[`docs/social-features.md`](./social-features.md) §7 — never open a text
channel to strangers before blocking and reporting exist — guest seats stay out
of any future chat feature until that work is done.

---

## 9. Implementation plan

The two prerequisites this document called out are done, so the rest is
buildable in order:

- **#240** made `userIdListToUsernameList`/`Map` position- and key-complete,
  filling `UNKNOWN_PLAYER_NAME` for an id Clerk can't resolve. Open-seat
  placeholders and guest ids can now flow through the response builders
  without misaligning anyone's name.
- **#241** extracted `startGameFromInvitation(invite, actorId, userList)` into
  `src/utils/games/startGame.ts` and replaced the seven-branch model chain with
  `gameDataModelFor()`. There is now one place a game comes into existence, and
  the lobby routes below call it rather than repeating it.

### 9.1 The commits

Each step leaves `npm run build`, `npx tsc --noEmit` and `npm test` green and is
reviewable on its own. Steps 1–6 are API-only; **step 7 is the first a human can
play**, and steps 1–7 are a complete, shippable feature for signed-in players
before any guest exists.

**1 — The join code, as a pure module.** `src/utils/games/joinCode.ts`: the
22-symbol alphabet (uppercase minus `I`, `O`, `0` and `1`),
`generateJoinCode()`, and `normaliseJoinCode()` — someone typing `plum` or
`pl um` must reach the same lobby as someone typing `PLUM`, and that rule
belongs beside the alphabet rather than in a route. Ships with
`joinCode.test.ts` in the same shape as `TurnTimer.test.ts`: the alphabet
excludes every ambiguous glyph, normalisation is idempotent, and a generated
code always normalises to itself. Nothing imports it yet.

**2 — Lobby fields on the invitation.** `joinCode` and `expiresAt` on
`IInvitationData` and `InvitationSchema` — the *base* schema, so every game's
discriminator inherits them and no `CreateGame` changes. A partial unique index
on `joinCode` scoped to documents that have one, and a TTL index on `expiresAt`
to reap abandoned lobbies. Both fields optional, so every existing invitation
stays valid. Nothing writes them yet: the index build lands on its own rather
than tangled with behaviour.

**3 — The open seat.** `src/utils/games/lobby.ts` holds the one convention: a
seat is a `userIdList` entry whose `userId` is a placeholder, with
`isOpenSeat()`, `openSeats(invite)` and the claim filter beside it. The screens
that already render an invitation's players learn to show "Open seat" rather
than the `UNKNOWN_PLAYER_NAME` the resolver would now hand them —
`/api/user/outgoinginvites`, `/api/user/incominginvites`, and the
`OutgoingInviteList` / `IncomingInvitesList` rows. Pure helpers get unit tests;
the rendering is visible from step 4.

**4 — Creating a lobby.** `POST /api/lobby`: the game's existing invite payload
plus `openSeats: n`, behind the same signed-in + unlocked checks the `newgame`
routes use — this is the gate that guarantees every lobby has a registered host
(§8). It writes the code (retrying on the duplicate-key error the partial index
throws — no coordination, no counter), `expiresAt`, and n placeholder seats.
The per-game settings ride along unchanged, because a lobby *is* that game's
invitation discriminator.

> Out of scope, deliberately: the seven `POST /api/newgame/<game>` routes are
> near-identical and differ only in their settings block, so there is a real
> refactor available here. It is a bigger prize than this feature and should be
> its own change rather than smuggled in — `/api/lobby` sits beside them.

**5 — Claiming a seat, and starting.** `POST /api/lobby/join`, signed-in players
only for now: normalise the code, find the open lobby, and claim a seat with a
**single conditional update** that matches the lobby *and* an unclaimed seat.
Not read-modify-write — `InvitationSchema` has no `optimisticConcurrency` where
`GameDataSchema` sets it, so two joiners racing would otherwise lose one of the
two, or both take the last seat and overflow the game's maximum. If that claim
filled the lobby and every named invitee has accepted, the route calls
`startGameFromInvitation`: same predicate, same helper, so a lobby and a named
invite start identically.

**6 — "Start now".** `POST /api/lobby/start`, host only. It `$pull`s the
unclaimed seats, then runs the same all-accept check and the same
`startGameFromInvitation`. There is deliberately no second start rule — the
button edits the seat list until the existing predicate is true. Refused below
the game's minimum player count, the bound `partySizeOutOfRange` already
applies on the setup screen.

**7 — The screens.** The first playable commit. Host side: the existing setup
screen (`GameSetupLayout` + `UserInviteList`/`usePlayerList` + `TurnTimerSelect`
+ `PartySizeHint`) gains an open-seat count, and after creation shows the lobby
— the code large and tap-to-copy (`useResettingState` for the "Copied!" flash),
the seat list from `ListSection` + `ListRow` + `Avatar` + `PendingTag` /
`.ag-dashed-add`, refreshing via `useRefreshableData` + `usePushEvents` exactly
as `IncomingInvitesList` does. Joiner side: `/join`, a code field (`.ag-input`)
on `AuthScreen`, errors through `useToast`. First `whatsNew.ts` line, under
enhancements.

**8 — The guest principal.** `src/utils/users/guest.ts`: create a Clerk user
with `publicMetadata.guest = true` and a generated unique username, mint a
sign-in token, hand the client the ticket. `useIsAuthorised` gains one clause —
`unlocked === true || publicMetadata.guest === true` — and `/api/users` applies
the same rule server-side, so the app keeps one authorisation predicate rather
than growing a second guard.

> This is the risky commit, and it is deliberately alone and late. If Clerk's
> `createUser` + sign-in-token flow doesn't behave as Option A assumes, this is
> where the plan forks to Option B (§3) — and steps 1–7 have already shipped a
> working feature regardless.

**9 — A guest's game doesn't count yet.** `unclaimedPlayerIds: string[]` on
`GameResultData`, filled by `recordGameResult` from whichever `playerIds` are
still guests, with an is-empty filter added to the stats reads. It also copies
each guest's display name onto the record, so a swept guest's name survives in
the other player's history (§8). This lands *before* any guest can play, so
there is never a window in which a guest game is recorded as counting.

**10 — Guests can join.** `/api/lobby/join` accepts `{ code, name }` from a
signed-out visitor: validate the name (length and character set — input
validation, not moderation, per §8), suffix it for per-lobby uniqueness, mint
the guest, claim the seat through the same conditional update as step 5. This
is the app's first public write endpoint, so per-IP rate limiting lands here
too. `/join` gains the name field. Friend and nudge affordances hide for guest
seats rather than failing on them.

**11 — Bringing the guest back.** The point of the whole feature. On the
guest's first board screen, offer notifications through the kit that already
exists — `NotificationOffer` over `OfferCard` in `BottomBanner`,
`useNotificationPermission`, `useFcmToken` — with `InstallOffer` first on iOS,
where a PWA install is a precondition for web push. Under Option A their FCM
token lands in Clerk `privateMetadata` like anyone else's, so `sendPushToUsers`
needs no change at all. A sign-in-token resume link is the fallback for anyone
who declines. Second `whatsNew.ts` line: guests can play.

**12 — Claiming an account.** After the guest's first turn, offer to keep it:
adding an email and password to the Clerk user they already are. The id never
changes, so games, results and turn history carry over with no migration — the
only writes are dropping `guest` from their metadata and `$pull`-ing their id
out of every `GameResult.unclaimedPlayerIds`.

**13 — Sweeping unclaimed guests.** `GET /api/cron/staleguests`, modelled on
`cron/staledevices`: same `CRON_SECRET` bearer auth, same `vercel.json`
registration, same "rewrite only what actually changed" pass. For each guest,
the most recent `endedAt` across the `GameResult` documents carrying their id —
one query on the existing `{ playerIds: 1, endedAt: -1 }` index — and delete
them a week after it. A guest with no results at all is swept on their lobby's
`expiresAt` instead. Deleting the Clerk user is safe by then, because step 9
already copied their name onto the record.

### 9.2 What to check as you go

- **Every commit:** `npm run build`, `npx tsc --noEmit`, `npm test`. CI runs all
  three on PRs to `main`.
- **UI commits (3, 7, 10, 11, 12):** a `caveman` review before committing, per
  [`AGENTS.md`](../AGENTS.md). Steps 7 and 10 are where the reuse rules bite
  hardest, because a lobby screen is almost entirely composition.
- **Player-visible commits (7 and 11):** a `whatsNew.ts` line in the same PR,
  newest first, oldest dropped once the group runs past five. Steps 1–6, 8, 9,
  12 and 13 are internal and earn none.
- **Tests:** this repo has no route or database harness — the suite is two
  registry scans plus pure unit tests. So the *pure* modules this feature adds
  (`joinCode.ts`, `lobby.ts`'s seat helpers, the name validator) carry tests in
  the `TurnTimer.test.ts` shape, and the routes are verified by hand. Don't
  invent an integration harness here; if one is wanted, that is its own work.
- **Two things no test will catch**, so check them deliberately: the seat-claim
  race (two joins with the same code at the same instant must not both take the
  last seat, nor both start the game), and a started or expired lobby rejecting
  a code someone still has open on screen.
- **`ARCHITECTURE.md`** §4's lifecycle and §5's `IInvitationData` both describe
  behaviour these commits change — update it in the step that changes it (2 and
  5), not in a catch-up commit at the end.

---

## 10. TL;DR

- **The infrastructure is unusually ready for this.** Identity is an opaque
  string everywhere that matters; only five places actually resolve it.
- **A lobby is an `Invitation` with a code and open seats**, not a new model —
  reusing it inherits every game's `CreateGame()` for free. Extracting the
  shared game-start helper out of `invite/accept` is the prerequisite.
- **It starts on the predicate that already exists.** An open seat is an
  unaccepted `userIdList` entry, so a lobby starts when the last one is
  claimed — no new start rule. "Start now" deletes the empty seats so that
  same predicate becomes true, rather than adding a second path.
- **Make the guest a claimable Clerk user** (Option A). It touches one of the
  five choke points — the unlocked gate, a one-line predicate — and makes
  "keep my account" an update rather than a migration. It also means no second
  session cookie and no bespoke resume route: Clerk already owns both.
  Re-check Clerk's current capabilities before betting on it.
- **The code solves joining; it does not solve returning.** Push permission,
  a durable session, and a claim prompt after the first turn are what turn a
  join-by-code game into an onboarded player.
- **Ship it in two halves** (§9 breaks it into thirteen commits). Codes for
  signed-in players first — steps 1–7, a complete feature on their own with no
  identity risk — then guests with push and claiming together. The one commit
  that could invalidate the approach (the Clerk guest principal) is isolated
  and late, so everything before it ships regardless.
- **The scope is settled** (§8): a game counts only once every player is a
  real account, the abandonment fuse is unchanged, every lobby has a
  registered host, unclaimed guests are swept a week after their last game
  ends, and spectating and moderation are both out.
- **Fix `userIdListToUsernameList` first** regardless — it drops unresolvable
  ids and misaligns the index-based name lookup in `CreateResponse` and in all
  seven games' `gameStateToModel`.
