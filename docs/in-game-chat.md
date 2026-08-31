# In-game chat — implementation plan

A per-game message thread: the players in one game can talk to each other from
the board screen, and a message reaches the others as a push notification the
way a nudge or a reaction does.

This is the planning document. Nothing here is built yet. Read
[`AGENTS.md`](../AGENTS.md) first — the component-reuse rule shapes most of the
decisions below — and [`ARCHITECTURE.md`](../ARCHITECTURE.md) §5–§8 for the data
model, the response-shaping contract and the push plumbing this leans on.

**Out of scope, deliberately:** moderation, profanity filtering, blocking and
reporting. §9 records the two decisions the owner has settled — guests chat, and
Outbreak gets chat — each of which corrects something the repo's docs currently
say. §11 breaks the whole build into commits.

---

## 1. Why, and what already exists

`docs/social-features.md` §2 puts in-game messaging at the top of Tier 1 and
says why: async play is *lonely by default*. Two players might touch the same
game hours apart, and a three-day-per-turn game with nothing but a move log
reads like a spreadsheet. Every other Tier 1 feature — nudges, reactions, rich
turn notifications — has shipped. This is the one left.

Almost all of the plumbing exists. Chat is a new small model, a new pair of
routes, one shared panel and one push channel, hung off things already built:

| Piece | Where | What chat takes from it |
|---|---|---|
| Per-game social record | `src/utils/mongodb/ReactionData.ts` | The shape to copy: a flat collection keyed by `gameId`, **not** a field on `GameData`. See §3. |
| Membership-gated per-game route | `src/app/api/game/[gameid]/reaction/route.ts` | Auth → load game → `userIdList.includes(userId)` → act → push. |
| Rate limiting | `src/utils/rateLimit.ts` (`consumeRateLimit`) | Both limits in §5: messages per player, and pushes per recipient. |
| Push transport + copy | `src/utils/firebase/pushNotification.ts`, `notificationContent.ts` | `sendPushToUsers` + one new builder. Every notification's copy is written in `notificationContent.ts`, never at the call site. |
| Notification preferences | `src/utils/firebase/notificationPreferences.ts` | A new `chat` channel and its Settings row. |
| Push → refetch on the client | `src/utils/hooks/usePushEvents.ts`, `useRefreshableData.ts` | `CHAT_EVENTS`, and the two loading flags the panel renders with. |
| Shared game chrome | `src/components/ui/GameShell.tsx` | Where the chat button and panel mount — **once**, not once per game. See §6. |
| The thread's rows | `src/components/ui/RecapTimeline.tsx`, `src/components/games/MatchHistory.tsx` | The message list. A chat thread is the recap timeline at a third size, not new markup. See §6. |
| Per-browser storage | `src/utils/hooks/useStoredValue.ts` | The unread read-marker: get/set one string, the `localStorage` throw swallowed. See §6. |
| Name resolution | the game response the board already holds (`usernameList` / `userIdList`) | No name is stored on a message, and none is resolved by the chat route either — see §5. |

One piece of history worth knowing: `notificationPreferences.ts` opens with a
comment saying a `chat` channel used to sit in the list **with nothing sending
on it**, and was removed for it. This plan puts the sender behind the switch
before the switch goes back.

---

## 2. What the player gets

- A 💬 button in the in-game top bar, on every multiplayer game. A dot on it
  when there are messages the player hasn't seen.
- Tapping it opens the thread below the board, where the match-history log
  opens: messages oldest-first, each dotted in its sender's seat colour, with
  the sender's name and a relative timestamp, and a composer at the bottom.
- Sending pushes a notification to the other players — "Ann in Train Time",
  body: the message — throttled per recipient so a conversation doesn't buzz a
  phone once per line (§5).
- The thread stays readable after the game finishes, so "gg" has somewhere to
  go.
- Settings gets a **Chat messages** notification toggle alongside the existing
  seven.

Solitaire has one seat, so it gets no chat button at all.

---

## 3. Storage: a new flat collection, not a field on `GameData`

**`src/utils/mongodb/ChatMessageData.ts`** — modelled on `ReactionData`:

```ts
export interface IChatMessageData {
    messageId: uuidString;
    gameId: string;
    senderId: string;      // Clerk userId
    text: string;          // as typed, trimmed; rendered as text, never HTML
    timestamp: string;     // ISO
}

ChatMessageSchema.index({ gameId: 1, timestamp: -1 });
```

Why not `gameState.chat` on the game document, which would come along for free
in `CreateDataResponse`:

- **`GameData` is saved under optimistic concurrency.** Every mutating route
  goes through `trySave`, which reports `false` on a `VersionError`
  (`GameData.ts`). A message and a turn landing together would make one of them
  lose — and the one that loses would be somebody's *move*. A separate document
  cannot collide with a turn.
- **The command route loads the whole game document on every move.** Chat lines
  grow without bound and are read by nobody in that path.
- **It is the shape the app already uses for exactly this.** Reactions are a
  per-game social record kept beside the game rather than inside it. A second
  one should not invent a second pattern.

Three properties fall out of the schema:

- **No `senderUsername`.** A message stores who sent it, never what they were
  called (`ARCHITECTURE.md` §5, `docs/dynamic-names.md`): a player who renames
  renames everywhere, including in messages they sent last week. The name is put
  back on at the very last moment — by the client, from the roster the board
  already holds (§5) — so chat resolves no names of its own at all.
  `ReactionData` freezes a name only because it needs one to build a push for a
  *recipient* it may not otherwise resolve; the chat push is built from
  `currentUser()`, who is right there.
- **The index is the read.** One query — `find({ gameId }).sort({ timestamp: -1
  }).limit(N)` — served entirely by `{ gameId: 1, timestamp: -1 }`.
- **`messageId` is a v4 UUID**, so the client has a stable React key and an
  idempotency handle if a retry is ever added.

### Deletion

Messages must not outlive their game.

- **Account deletion** (`src/app/api/user/delete/route.ts`): that route already
  deletes every game the user was in (`GameDataModel.deleteMany({ userIdList:
  userId })`). Chat is keyed by *game*, and the existing `ReactionModel` line
  beside it is keyed by *user* (`{ $or: [{ actorId }, { recipientId }] }`), so
  this is a new step rather than one more line of the same shape: read the
  user's `gameId`s (`GameDataModel.find({ userIdList: userId })`, projected to
  `gameId`) **before** the games are deleted, then
  `ChatMessageModel.deleteMany({ gameId: { $in: gameIds } })`.
  Worth the extra read: it takes every message in those games, not just the
  departing player's, so nobody's half of a conversation is left orphaned in a
  collection whose game no longer exists. Keying it by `senderId` instead would
  be one line and would leave exactly that behind.
- There is no other path that deletes a game today. If one is added, it deletes
  chat too; note it in that route rather than sweeping later.

---

## 4. Shared validation: `src/utils/chat.ts`

Mirrors `src/utils/reactions.ts` — one module the client and the server both
import, so the composer's limit and the route's limit cannot drift:

```ts
export const MAX_MESSAGE_LENGTH = 500;

/** The message as it will be stored, or null if it isn't one. */
export function normaliseMessage(value: unknown): string | null;
```

`normaliseMessage` trims, rejects a non-string, rejects empty, rejects anything
over `MAX_MESSAGE_LENGTH` after trimming, and collapses runs of blank lines so
one message can't be a screenful. That is input validation, not moderation: the
text itself is never inspected.

The client uses `MAX_MESSAGE_LENGTH` for the counter and the disabled Send
button; the route uses `normaliseMessage` as its gate. Unit-tested directly.

---

## 5. API

Two handlers in one file, `src/app/api/game/[gameid]/chat/route.ts` — the same
folder shape as the existing `[gameid]/reaction` and `[gameid]/recap` routes.

### `GET /api/game/[gameid]/chat`

1. `auth()` — 401 if not signed in. The convention is split: follow
   `[gameid]/route.ts`, which returns 401 with a comment explaining why
   (`fetchWithSessionRetry` retries a 401, and only a 401, so a tab whose
   session cookie is still refreshing recovers instead of bouncing home). The
   sibling `[gameid]/reaction/route.ts` returns 400 and is the outlier; a GET
   the board polls wants the retryable code.
2. `dbConnect()`, load the game by `gameId` — 404 if missing.
3. **`gameData.userIdList.includes(userId)` — 403 otherwise.** This is the whole
   access control for chat, so it is the line to get right.
4. Read the newest `CHAT_PAGE_SIZE = 50` messages, reverse to oldest-first, and
   return them. **No name resolution here** — see below.

```ts
export interface IChatMessageResponse {
    messageId: string;
    senderId: string;    // the client already knows this game's roster
    text: string;
    timestamp: string;
}
export interface IChatResponse { success: boolean; messages: IChatMessageResponse[]; }
```

**Why the response carries no `senderName`.** The obvious version of this route
resolves the roster with `userIdListToUserIdNameMap(gameData.userIdList)`, the
way every `CreateDataResponse` does. That is an uncached Clerk lookup per
request — and this endpoint is *polled* every 10 seconds while the panel is
open, per watching player, which would make a quiet conversation the app's
chattiest Clerk caller.

It buys nothing, because the board screen already has the answer: `usernameList`
and `userIdList` come back from `/api/game/[gameid]` positionally aligned, and
the client hands both to the panel (§6). Every sender is a player in this game,
so the roster names all of them. The poll is then one indexed Mongo query and no
Clerk call at all, and names still track a rename — the game response resolves
them live and refetches on its own events.

This is not the frozen-name trap §3 avoids: nothing is *stored*, and nothing
stale is sent. The name simply arrives by the road it was already travelling.

Note for a croupier pass: the response carries nothing from `specificGameState`
and nothing derived from it. Chat lives in its own collection precisely so it
can't pick game state up by accident, and it never touches `publicGameState`,
the replay adapters or the recap feed.

### `POST /api/game/[gameid]/chat`

1. `auth()` + `currentUser()`.
2. `normaliseMessage(body.text)` — 400 on null.
3. Load the game, membership check as above.
4. **Not `requireLiveGame`.** That helper exists to stop *moves* landing on a
   finished game; a "gg" after the last turn is the single most obvious message
   in an async game, and a finished game's document is not deleted. Chat is
   allowed as long as the game document exists.
5. Rate limit — `consumeRateLimit('chat', `${gameId}:${userId}`, 20, 5 * 60_000)`
   → 429. Twenty messages per five minutes is far above conversation and far
   below a flood; the fixed window is the same approximation the nudge limit
   already accepts.
6. Save the message.
7. Push to the other players (§7), guarded by its own limit.
8. Return `{ success: true, message: IChatMessageResponse }` — the stored
   message, for the route test to assert on. The client refetches rather than
   rendering it directly; see §6 on why there is no optimistic append.

Both handlers are membership-gated and both take the `gameid` from the path, so
neither trusts a `gameId` in the body. Worth a `locksmith` and a `gremlin` pass
before it merges, per `AGENTS.md`.

---

## 6. Client

### The panel: `src/components/games/GameChat.tsx`

Sits beside `MatchHistory` and `TurnRecap` — the game-agnostic components every
board screen shows — and is **presentational**: it is handed
`{ messages, isLoading, isRefreshing, send }` and owns no fetching of its own
(see "where it mounts" below). `RefreshableState` in `useRefreshableData.ts` is
declared for exactly this: "a presentational component handed data someone else
fetched".

It is the `MatchHistory` shape plus a composer, because a chat thread is the
same picture as a match history:

- the `.ag-log` block with an `.ag-hand-title` ("Chat"), and `.ag-log-empty`
  when there is nothing yet — the same wrapper `MatchHistory` uses;
- the rows are **`RecapTimeline`** (`compact`), whose own comment says the
  recap list and the match history "are the same picture at two sizes, so they
  are the same component". A chat thread is the third size: `dotColour` from
  `playerColourForId(senderId, userIdList)` — so a player is one colour on the
  board, the scoreboard, the log and the thread — `title` the message text, and
  `detail` the sender's name (`nameForUserId`-style lookup across the
  `userIdList` / `usernameList` pair the panel is handed, since the response
  carries no name — §5) and `formatRelativeTime(timestamp, useNowToTheMinute())`,
  which is precisely the call `TurnRecap` already makes.
  No `Avatar`: the GET carries no image URL, so every badge would fall back to
  initials, and the coloured dot is already how this app says whose line it is;
- the composer: an `.ag-input` and an `.ag-btn ag-btn--primary`, disabled while
  empty, over-length or sending;
- `Skeleton` on first load, `Refreshable` around the rows on a refetch — the
  `isLoading` / `isRefreshing` split `useRefreshableData` exists to give.

Message text is rendered as text. React escapes it; nothing here goes near
`dangerouslySetInnerHTML`.

That leaves almost no new CSS: one composer flex row (and, if the compact
timeline reads too tall for a conversation, a `.ag-chat` type tweak beside
`.ag-log` in `ag-theme.css`, in `--ag-*` tokens). If a `.ag-chat-*` block starts
growing past that, the row has stopped being a timeline row and the reuse should
be re-argued rather than quietly abandoned.

**The thread renders inline**, where `MatchHistory` renders — in `GameShell`'s
children, below the board. Nothing in `ag-theme.css` does panel-over-board
today, so floating it means inventing positioning and scrim CSS for one screen.
If it later has to float, the sheet to reuse is `InfoModal`'s `.ag-modal`, not a
new one.

### The hook: `src/utils/hooks/useGameChat.ts`

```ts
export function useGameChat(gameId: string, open: boolean) {
    const { data, isLoading, isRefreshing, refresh } =
        useRefreshableData<IChatResponse>(`/api/game/${gameId}/chat`, CHAT_EVENTS,
            { pollWhileWatching: open });
    …
}
```

`send(text)` POSTs and then `await refresh()`. **No optimistic append:**
`useRefreshableData` owns `data` and exposes no setter, so an optimistic list
means a second copy of the messages inside this hook, merged with the hook's own
and rendering the sent line twice until the refetch reconciles it. A refetch
after a POST the player just waited on is imperceptible and has one source of
truth. (§5's POST response still returns the stored message — for the route test
to assert on, not for the client to render.)

`pollWhileWatching` is gated on the panel being open, for the reason `useGameData`
gates its own polling on waiting for an opponent: a closed thread has nothing to
wait for, and every tick is a request per watching player. `CHAT_EVENTS =
['ChatMessage'] as const` goes in `usePushEvents.ts` beside the other event
groups, and covers the closed panel — as long as the hook is still mounted,
which is why it lives in the shell and not in the panel.

### Where it mounts: `GameShell`, once — and the log with it

This is the part to get right, and the reason to look at `showLog` first: the
"turn history" toggle is hand-rolled in **eight** game screens, and it is three
pasted pieces each — a `useState`, a `history` `GameOption` row, and a
`{showLog && <MatchHistory …/>}` block:

```
outbreak 58/283/450 · snakesandladders 37/178/265 · worlddomination 43/226/330
settlementsandcities 62/304/440 · dicecities 40/160/227 · solitaire 27/86/164
traintime 57/242/477 · smartthink 33/118/174
```

Chat must not become the ninth copy of that shape. So `GameShell` — the shared
in-game chrome every board wraps itself in, and used by nothing else — grows two
optional props, and the second one is what makes this change a net deletion:

```tsx
interface GameShellProps {
    …
    /** The game's chat thread. Omitted (or a single-seat game) renders none.
     *  The roster pair is how a message gets a name and a colour (§5). */
    chat?: { gameId: string; userIdList: string[]; usernameList: string[] };
    /** The match-history log, behind the shell's own toggle. */
    log?: { entries: IHistoryEntry[]; userIdList?: string[]; oldestFirst?: boolean };
}
```

`GameShell` then owns:

- `useGameChat(gameId, open)` — **one** fetch, feeding both the thread and the
  unread dot. The dot has to know about messages while the panel is shut, so the
  hook cannot live inside the panel;
- the 💬 top-bar button, reusing `.ag-game-topbar-btn` and its `--on` state. It
  is a button rather than a `GameOptionsMenu` row (the documented home for
  top-bar actions) for one reason worth writing down: **an unread dot cannot be
  seen inside a closed kebab menu.** The log toggle has no badge and stays a
  menu row;
- the `log` toggle as a `GameOption`, and `<MatchHistory>` below the children —
  the same markup, moved once instead of pasted eight times.

All three values are already in scope on every board screen. Nothing
chat-shaped renders when `chat` is absent or `userIdList.length < 2` —
which is how Solitaire gets no chat button without Solitaire being named
anywhere. Solitaire still passes `log`, so it is **seven** chat wirings and
eight log wirings. Per screen:

```tsx
<GameShell … chat={{ gameId, userIdList, usernameList }} log={{ entries: nav.displayedHistory, userIdList }}>
```

and each screen deletes its `showLog` state, its history menu row and its render
block.

If folding the log in makes the PR too wide to review, it is a clean follow-up —
but then say so here, because a `GameShell` that owns a chat panel *next to*
eight hand-rolled log panels is the exact smell this section opens by naming.

### Unread marker

The dot needs "what has this player already seen". Phase 1 keeps it in
`localStorage` under `ag-chat-read:<gameId>` (an ISO timestamp written when the
panel opens); unread = messages newer than it, from somebody else.

`localStorage` access throws in private mode and with site data blocked, and
that try/catch is already written twice — `useDismissibleBanner` and
`useGuestMoved`. This would be the third, so **extract first**: generalise
`useDismissibleBanner` into a `useStoredValue(storageKey)` hook (get/set a
string, throws swallowed), and have the banner and `useGuestMoved` (both storing
`'1'`) and the chat marker (an ISO) share it. One try/catch in the repo.

Per-device is the known cost: read on your phone, the dot lingers on your
laptop. A server-side marker is a fourth collection for a badge nobody has asked
for yet, and the push already did the telling — §10 records what it would
unlock, for when that is the thing being asked for.

---

## 7. Push notifications

A new event and a new channel:

- **Event `ChatMessage`**, data `{ event, gameId, link: gameNotificationLink(url,
  gameId) }` — so tapping it opens the board, and `dispatchPushEvent` fires the
  window event `CHAT_EVENTS` listens for.
- **Channel `chat`**, added to `ALL_NOTIFICATION_CHANNELS`, to
  `DEFAULT_PREFERENCES.channels` (default **on**), to the explicit key list in
  `getNotificationPreferences` (it enumerates every key — a channel missed there
  reads as `undefined`), and to `NOTIFICATION_CHANNELS` for the Settings row:
  *"Chat messages — When someone messages you in one of your games"*.
- **Copy** in `notificationContent.ts`: `buildChatNotification(senderName,
  gameData, text)` → title `"${senderName} in ${friendlyName}"`, body the
  message through the existing `truncate`, artwork from `gameNotificationImage`
  via the shared `gamePush` helper. The message is the body: unlike a turn
  notification there is nothing better to say than what was said.

Recipients are `userIdList` minus the sender, resolved with `usersById`.
`sendPushToUsers` already drops anyone with the channel off.

**Throttling, per recipient.** A back-and-forth conversation must not be one
push per line. Before pushing to a recipient, gate on
`consumeRateLimit('chatPush', `${gameId}:${recipientId}`, 1, 10 * 60_000)` — at
most one chat push per player per game per ten minutes. The message is still
stored and still shows up in the thread; only the buzz is suppressed. This is
the direct answer to `social-features.md` §7's "notification volume" open
question, and it reuses the limiter rather than adding a scheduler.

Every push here carries a real notification, so it does not touch the
"data-only pushes cost an iOS player their subscription" invariant documented in
`usePushEvents.ts`.

### What the toggle turns off — and what it doesn't

Worth stating plainly, because the answer is a design property rather than an
accident: **turning the `chat` channel off costs a player the interruption, not
the messages.**

`isChannelEnabled` is checked inside `sendPushToUsers`, per recipient, at send
time. The message is stored either way, and every read path is independent of
push:

- opening the board fetches the thread — `useGameChat` mounts in `GameShell`,
  so the GET fires on every board open whatever the preferences say;
- returning to the tab refetches it — `useRefreshableData` always passes
  `refreshOnVisible: true`; it is hardcoded, not a caller option;
- an open panel polls every ten seconds (`pollWhileWatching`), which needs no
  push at all.

So a muted player still sees the unread dot when they next open that game, and
still watches a live conversation if they sit in it.

This is not only the muted-player path. Because the push above is throttled to
one per recipient per game per ten minutes, **the poll is the primary liveness
mechanism for an open thread even with the channel on** — during a
back-and-forth, everyone's open panel is being kept current by the poll and by
nothing else. Push's job is strictly "you are not looking at this screen".

The real gap is that a muted player gets no signal *outside* the board screen:
the dashboard shows no unread count, so they find messages by opening the game.
Defensible for someone who deliberately muted it, and it is the strongest
argument for pulling phase 2's server-side read marker forward — that, not the
transport, is what would give a muted player a passive signal.

---

## 8. Where this does *not* reach

Named so a reviewer can check them off rather than wonder:

- `gameState.history` — chat is not a move and writes no log line.
- `commandHistory`, the replay engine, `IReplayAdapter`, the recap feed and
  turn planning. Chat is not replayed and not snapshotted per turn.
- `publicGameState` / `CreateDataResponse` — the game response is unchanged, so
  no game screen's DTO changes and no existing hidden-state guard is touched.
- `GameResult` — a finished game's record says nothing about chat.
- The turn-timer cron. A message is not a turn and must never reset a timer:
  saying "one sec, thinking" is not taking your turn.

---

## 9. Two decisions, settled

Both of these were open questions on the first draft of this plan. The owner has
answered both, and the answers are recorded here because each one overturns
something already written down elsewhere in the repo — so each carries a doc to
correct (see §11's last commit).

### Guests are in

`docs/account-less-play.md` §8 says:

> per [`docs/social-features.md`](./social-features.md) §7 — never open a text
> channel to strangers before blocking and reporting exist — guest seats stay
> out of any future chat feature until that work is done.

**Decided: guests chat like anyone else.** A guest is not a stranger who found
their way to a table; they got there because somebody at that table shared a
join code with them. The principle §7 states — don't open a text channel to
strangers before blocking and reporting exist — is untouched by this, because it
was written about open matchmaking. It simply never applied to a seat somebody
was invited into.

So there is no `isGuest` branch anywhere in this feature: no guest check on the
POST route, no `ClaimAccountOffer` standing in for the composer, no
guest-specific copy. That is a smaller implementation than the one it replaces,
which is usually the sign of the right call.

Two consequences to carry out rather than assume:

- `docs/account-less-play.md` §8 is now wrong and gets amended to point here.
- The claim-your-account nudge stays exactly where it already is
  (`BottomBanner`). Chat is not the place to sell an account upgrade.

### Outbreak is in

`OutbreakHands.tsx` says the game's "shared table, shared brain" pillar means
"there is no chat window telling teammates what you're holding", which is why
every hand is public there.

**Decided: Outbreak gets chat like every other game.** The pillar that comment
protects is that the *board* shows everything, so a player never has to be told
what is in a hand — and that stays true with a chat panel next to it. A co-op
table will coordinate somewhere regardless; the board's job is to make that
coordination unnecessary, not to prevent it.

Consequence: that comment gets rewritten in the same PR, so the next person
reading it isn't told the app has no chat window while the chat window is
sitting one component away. The `GameShell` opt-out (just don't pass `chat`)
stays available for any game that ever does want it, but no game uses it.

## 10. Phases

**Phase 1 — the thread.** §3 model + deletion wiring, §4 validation module, §5
routes, §6 panel + hook + the two `GameShell` props (chat on seven screens, the
log moved off all eight) + the `useStoredValue` extraction, §7 push and channel.
This is the whole feature as described above; it is not worth shipping half of
it, since a chat nobody is notified about is a chat nobody uses. §11 breaks it
into the seven commits that build it, and says where it can be cut if the diff
turns out too wide to review in one go.

**Phase 2 — the polish, once phase 1 has been used.**

- Older messages: a `before` cursor on the GET, and a "load earlier" control.
  Deliberately not in phase 1 — fifty messages is a long conversation for a
  game, and a cursor nobody has hit the end of is speculative work.
- Server-side read markers, which is what an unread count on the dashboard
  game rows would need — and the one thing that would give a player who has
  muted the channel a signal outside the board screen (§7).
- A "somebody messaged" line in the "since you were last here" recap.

**Phase 3 — only if the product goes there.** Blocking, reporting and anything
moderation-shaped. Out of scope for this work. Note that nothing in §9 is
waiting on it any more: the reason to gate a text channel is open matchmaking
between strangers, which this app does not have.

---

## 11. The commits

Seven commits, in this order. Each one builds, type-checks, lints and leaves the
app working — nothing here is a half-landed state that the next commit has to
rescue. The gates and reviewers named per commit are the ones from §12.

### 1. `Move the turn-history log into the game shell`

`GameShell` gains the `log?` prop, renders `MatchHistory` below its children and
owns the toggle as a `GameOption`; all eight board screens drop their `showLog`
state, their history menu row and their render block.

No chat in this commit at all. It goes first because it is the mechanism chat
needs (§6) and because landing it alone makes it reviewable as what it is: a
~24-piece deletion with no behaviour change. If any of this PR gets bounced,
this part still deserves to land.

*Gates: build, tsc, lint. Reviewer: `caveman`.*

### 2. `Remember one thing per browser, in one place`

Extract `useStoredValue(storageKey)` out of `useDismissibleBanner` — get/set a
string with the `localStorage` throw swallowed — and move `useDismissibleBanner`
and `useGuestMoved` onto it.

Also no chat, also no behaviour change. It comes before the panel so the unread
marker in commit 5 is a *use* of a shared hook rather than a third copy of the
try/catch that arrives with it (§6).

*Gates: build, tsc, lint. Reviewer: `caveman`.*

### 3. `Store a chat message`

`src/utils/mongodb/ChatMessageData.ts` (§3), `src/utils/chat.ts` with
`MAX_MESSAGE_LENGTH` / `normaliseMessage` (§4), `src/utils/chat.test.ts`, and
the account-deletion step in `src/app/api/user/delete/route.ts` (§3).

Nothing reads or writes a message yet, which is deliberate: the model arrives
with the rule that keeps it from outliving its game, rather than that rule
arriving later as a fix. The unit test is the first thing in the feature that
proves anything.

*Gates: build, tsc, lint, `npm test`. Reviewer: `gremlin` (the deletion path).*

### 4. `Read and write a game's chat over the API`

`src/app/api/game/[gameid]/chat/route.ts` — both handlers, the membership gates,
the `chat` rate limit — plus its route tests (§12).

**No push yet.** The endpoint stores and returns messages and nothing else, so
this commit can be reviewed as pure access control: who may read this thread,
who may post to it, and what a bad body does. That is the review this feature
most needs, and mixing a notification into it would bury it.

*Gates: build, tsc, lint, `npm test`. Reviewers: `locksmith` and `gremlin`.*

### 5. `Show the chat thread on the board`

`GameChat`, `useGameChat`, `CHAT_EVENTS` in `usePushEvents.ts`, the `chat` prop
on `GameShell` with its 💬 button and unread dot, the seven board-screen
wirings, and the composer CSS in `ag-theme.css` (§6).

At the end of this commit the feature works: players can talk, and an open
thread stays live on the poll. It is silent when you are not looking, which is
what commit 6 is for — and a good state to actually use for a day before adding
the buzz.

*Gates: build, tsc, lint. Reviewer: `caveman` (the reuse in §6 is the whole
point of this commit).*

### 6. `Tell players when someone messages them`

The `ChatMessage` push and the `chat` channel (§7): `buildChatNotification` in
`notificationContent.ts`, the channel in `ALL_NOTIFICATION_CHANNELS`, the
defaults, the explicit key list in `getNotificationPreferences`, the Settings
row, and the send + per-recipient throttle at the end of the POST handler.

The commit that puts the sender behind the switch `notificationPreferences.ts`
says was removed for not having one.

*Gates: build, tsc, lint, `npm test` (the route test gains the "sender gets no
push" and throttle cases). Reviewers: `rulebook` (channel wiring is a registry)
and `gremlin` (a push failure must not lose the message).*

### 7. `Say what's new, and correct the docs that said chat wouldn't happen`

- `src/utils/ui/whatsNew.ts` — one *Enhancements* line (§12).
- `ARCHITECTURE.md` §5 (the `ChatMessage` collection) and §8 (the `chat`
  channel).
- `docs/account-less-play.md` §8 — amend the "guest seats stay out of any future
  chat feature" paragraph to point at §9's decision.
- `src/games/Outbreak/components/OutbreakHands.tsx` — rewrite the "there is no
  chat window" line, per §9.
- `docs/social-features.md` §1 — in-game messaging moves into the "what already
  exists" table, and Tier 1 is done.
- This document — a status line at the top saying it shipped, as
  `since-you-were-last-here.md` has.

Docs-only, and last, so every line of it describes something already true in the
same PR.

*Gates: build, tsc, lint. Reviewer: `rulebook`.*

### If it has to be split

Two clean cuts. **After 2** — the two prep commits are a standalone
"tidy the game shell" PR that stands on its own merits. **After 6** — the
feature works and the docs follow, though not for long: a player-visible change
without its What's new line is exactly what `AGENTS.md` asks not to happen, so
7 should follow within the day rather than becoming a someday.

What must *not* be split: 5 from 4 for long (an endpoint nothing calls), or 6
from 5 for long (a chat nobody is told about is a chat nobody uses).

---

## 12. Definition of done (phase 1)

- `npm run build`, `npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`) all
  clean. The engine is untouched, but run `npm test` anyway — it is four
  commands and CI runs all four.
- **Tests.** `src/utils/chat.test.ts` over `normaliseMessage` (empty, blank,
  over-length, non-string, blank-line collapsing). A route test in the
  `src/app/api/game/gameRoutes.test.ts` style covering: a non-player gets 403 on
  both verbs, an over-length body gets 400, the rate limit gets 429, a stored
  message comes back carrying a `senderId` and **no** name (the guard against the
  frozen-name trap creeping back in), and the sender gets no push. A guest posts
  like anyone else, so there is nothing guest-shaped to test — which is the point
  of §9.
- **Reviews**, per `AGENTS.md`: `locksmith` and `gremlin` on the routes,
  `caveman` on the panel and the `GameShell` change, `rulebook` on the
  registry/upkeep edits (channel list, `usePushEvents`, account deletion,
  What's new). This plan has had one `caveman` pass already — §6's reuse of
  `RecapTimeline`, the single fetch in the shell, the dropped optimistic append
  and the `useStoredValue` extraction are its findings; the implementation
  should not quietly undo them.
- **Docs and What's new.** All of it lands in §11's commit 7 — `ARCHITECTURE.md`
  §5 and §8, the two documents §9's decisions overturn, the Outbreak comment,
  `social-features.md`'s table, and a status line at the top of this file as
  `since-you-were-last-here.md` has. The What's new line goes in *Enhancements*:
  something like *"Talk to your opponents — every game now has a chat thread:
  tap 💬 on the board to say something, and the others get a nudge on their
  phone."*, with the oldest line dropped if the group runs past five.
