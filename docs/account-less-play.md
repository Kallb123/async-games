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

The game-creation block currently inlined in
`src/app/api/invite/accept/route.ts` (the `if/else if` chain that picks the
right `<Game>GameDataModel`, saves it, deletes the invite and sends
`GameStart` + the first `YourTurn`) has to become a shared
`startGameFromInvitation(invite, actorId)` before `lobby/start` can exist,
with the all-accept path calling the same helper. This is the single most
important refactor in the feature, and it should go one step further than
relocating the chain.

Those seven branches are a **third copy of a gameType → model map that
already exists**: `initialiseDiscriminators()` in `src/utils/mongodb/mongodb.ts`
holds exactly these seven models in a typed `Record` whose keys are a
compile-time exhaustiveness check, and `GAME_META` in `src/utils/ui/games.ts`
is the same list again. The helper wants one lookup — off an exported version
of that `Record`, or `mongoose.model(\`${invite.gameType}GameData\`)` — after
which the seven branches *and* their seven imports are deleted rather than
moved, and adding a game stops needing a line in a route at all.

**One correction worth carrying into the work:**
`src/games/gameRegistry.test.ts` does not guard this the way it looks. Its
"handles every game's game-start branch" case reads the literal path
`src/app/api/invite/accept/route.ts` and asserts that file's source contains
the string `` `${name}GameDataModel` ``. So the extraction *breaks that test
for all seven games* unless it is repointed — and if the lookup replaces the
chain, the assertion should be deleted outright, because `mongodb.ts`'s typed
`Record` is already a stricter, compile-time version of the same check.

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
chosen. Most are small; the first is not.

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
| Extract `startGameFromInvitation` | S | Low | Pure refactor; deletes the seven-branch chain rather than moving it, and repoints one assertion in `gameRegistry.test.ts`. Do it first, it stands alone |
| Position-preserving name resolution | S | Low | Fixes an existing latent bug |
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

**Suggested order.** The refactor and the name-resolution fix are independently
worth doing and unblock everything. Then lobby + code + join with *signed-in*
players only — that is a real feature on its own ("start a game, share a code,
no need to know usernames") and it proves the lobby model with zero identity
risk. Only then add the guest principal, and add push and claiming in the same
step as the guest — a guest who cannot be notified and cannot keep their game
is worse than no guest at all.

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

## 9. TL;DR

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
- **Ship it in two halves.** Codes for signed-in players first (valuable
  alone, no identity risk), then guests with push and claiming together.
- **The scope is settled** (§8): a game counts only once every player is a
  real account, the abandonment fuse is unchanged, every lobby has a
  registered host, unclaimed guests are swept a week after their last game
  ends, and spectating and moderation are both out.
- **Fix `userIdListToUsernameList` first** regardless — it drops unresolvable
  ids and misaligns the index-based name lookup in `CreateResponse` and in all
  seven games' `gameStateToModel`.
