# In-game chat — implementation plan

A per-game message thread: the players in one game can talk to each other from
the board screen, and a message reaches the others as a push notification the
way a nudge or a reaction does.

This was the planning document. **Phase 1 is implemented** — it shipped in full
across the seven commits §11 lays out, so read §1–§9 for the *why*, and treat the
code as the current state where the two disagree. **Phase 2 is now planned but
not built**: §13 designs it and breaks it into commits, led by the server-side
read marker, because that is what puts unread chat on the dashboard. Phase 3's
moderation is still deliberately ahead. Read
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

**Phase 2 — the polish, once phase 1 has been used.** Designed in full in §13,
which orders it and breaks it into seven commits. In short, and in the order it
gets built:

- **Server-side read markers, first.** Phase 1's unread dot is a `localStorage`
  timestamp, so it knows only what *this browser* has seen. Moving the marker to
  the server is what unlocks an unread count on the dashboard game rows — the
  one signal a player who has muted the `chat` channel can get without opening
  the game (§7) — and it is also the boundary the recap line below wants.
- An unread badge on the dashboard's turn cards and "waiting on others" rows,
  which is the thing the marker is for.
- Older messages: a `before` cursor on the GET, and a "load earlier" control.
  Deliberately not in phase 1 — fifty messages is a long conversation for a
  game, and a cursor nobody has hit the end of is speculative work.
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

---

## 13. Phase 2 — the read marker, and the dashboard it unlocks

Phase 1 shipped a thread you have to go and look at. Phase 2's job is to make
the app tell you there is something in it. Everything below hangs off one small
change: **the "how far have I read" marker moves from `localStorage` to the
server.**

### 13.1 Why the marker goes first

Phase 1's dot is honest about what it knows: `ag-chat-read:<gameId>` is a
timestamp in *one browser*, so reading a thread on your phone leaves the dot lit
on your laptop, and no other screen in the app can ask the question at all. §6
recorded that as the known cost and §7 named the consequence — a player who
turns the `chat` channel off gets no signal anywhere outside the board screen,
because the dashboard cannot know what they have read.

So the marker is not one of three equal polish items; it is the thing the other
two are waiting on:

- **The dashboard badge** needs a server-side "unread since" per player per
  game. There is no other way for `buildDashboard` to answer it.
- **The recap line** ("3 messages while you were away") wants a boundary, and
  "since you last read the thread" is a better one than "since your last turn":
  in an async game those are hours apart, and a player who read the thread at
  breakfast should not be told about it again at lunch.
- **Paging** wants nothing from it, which is why it is last.

Building it first also means the board's dot gets *better* on the way past
(it clears across devices), rather than staying as it is until something else
needs it.

### 13.2 Two decisions, settled

**Read markers are private.** The marker records what *you* have read, and
nothing on the wire tells anyone else about it — no ticks, no "Seen by Ann", no
per-message reader list. That keeps this a plumbing change with a badge on the
end rather than a social feature with a privacy question in it, and it means the
croupier's answer for the whole phase is short: the only read state a response
carries is the viewer's own. If "seen by" is ever wanted, it is a phase-3-shaped
conversation and it needs its own opt-out; nothing here forecloses it, because
the storage already has the per-player rows it would read.

**The dashboard gets a count on the existing rows**, not a chat surface of its
own. An unread pill on the "It's your move" cards and the "Waiting on others"
rows, tapping through to the board where the thread already lives. A
conversations section that reads and sends from the home screen is a second
mount of the whole feature for a screen whose job is "what needs you next"; if
it turns out people want to reply without opening the game, that is a separate
proposal with its own plan.

### 13.3 Storage: `ChatReadData`

**`src/utils/mongodb/ChatReadData.ts`** — a second small flat collection, one
row per player per game:

```ts
export interface IChatReadData {
    gameId: string;
    userId: string;
    readAt: string;   // ISO — the newest message this player has seen
}

ChatReadSchema.index({ gameId: 1, userId: 1 }, { unique: true });
ChatReadSchema.index({ userId: 1 });
```

Two indexes because there are two reads, and they are asked from opposite ends:
the board asks "this player, in this game" (the unique index, which is also what
enforces one row per seat), and the dashboard asks "every marker this player
has" (`{ userId: 1 }`, one query for the whole home screen).

Three alternatives, and why not:

- **A `readBy` array on `ChatMessage`.** Wrong grain and a hot write: one marker
  per player per game is `O(seats)`, a per-message reader list is
  `O(messages × seats)`, and it turns an append-only collection into one every
  read rewrites. The append-only property is worth keeping — it is why phase 1's
  thread cannot lose a message to a concurrent anything.
- **A field on `GameData`.** The same argument §3 makes about messages, and it
  is *worse* here: a marker is written every time somebody looks at a thread, so
  under `trySave`'s optimistic concurrency the thing it would race is a turn.
  A badge must never be able to make somebody's move lose.
- **A denormalised `unreadCount` on the marker, incremented by the POST.** A
  write per recipient per message, and a second source of truth that drifts the
  first time a push handler dies halfway. The count is cheap to derive (§13.5);
  derive it.

**Deletion.** Markers must not outlive their game, exactly as messages must not
(§3). `src/app/api/user/delete/route.ts` already reads the user's `gameId`s
before deleting the games and runs `ChatMessageModel.deleteMany({ gameId: { $in:
gameIds } })`; the marker delete is the line beside it, on the same ids, in the
same before-the-games position and for the same reason (a partial failure stays
recoverable, because the retry can still find the games). Two `deleteMany` calls
sharing a variable is not the duplication the caveman is looking for — a helper
wrapping one line with one caller would be the finding — but the *comment* above
them should now say "chat" rather than "messages", so the next collection keyed
by `gameId` gets added to the list rather than forgotten.

### 13.4 API: reading and writing the marker

**The marker rides the GET the panel already polls.** `IChatResponse` gains one
field:

```ts
export interface IChatResponse {
    success: boolean;
    messages: IChatMessageResponse[];
    readAt: string | null;   // this viewer's marker; null if they never opened it
}
```

One extra indexed lookup on a request the board already makes, and the dot then
comes from the same response as the messages it is counting — so there is no
window where the two disagree. Nobody else's marker is in there (§13.2).

**`POST /api/game/[gameid]/chat/read`** — its own route file under the existing
`[gameid]/chat/` folder, because it is a different resource and folding a
"mark read" verb into the message POST would mean one handler doing two things
behind a body flag.

1. `auth()` — the same retryable 401 as the sibling handlers, for the same
   reason (§5).
2. `normaliseReadAt(body.readAt)` — new in `src/utils/chat.ts`, beside
   `normaliseMessage` and tested with it: a string that parses as a date, or
   `null`. 400 on null.
3. `dbConnect()`, load the game, **`userIdList.includes(userId)` — 403**. The
   same one line that is the whole of chat's access control.
4. Rate limit: `consumeRateLimit('chatRead', `${gameId}:${userId}`, 60, 5 *
   60_000)` → 429. An open panel only posts when the newest message *changes*,
   so real traffic is bounded by the 20-per-5-minutes message limit already;
   sixty is headroom, and its job is to stop a loop, not to shape behaviour.
5. Clamp to now — `readAt = min(readAt, new Date().toISOString())` — and apply
   it with `$max`:

```ts
ChatReadModel.findOneAndUpdate(
    { gameId, userId },
    { $max: { readAt } },
    { upsert: true },
)
```

Three properties worth having, all from that one line. `$max` on an ISO string
is a lexical comparison, which for ISO-8601 *is* chronological, so the marker is
**monotonic** — two tabs racing, or a request arriving out of order, can never
move it backwards and re-light a dot the player already cleared. It is
**idempotent**, so the client can post the same value as often as it likes. And
the upsert makes first-read and later-read the same code path. Two concurrent
upserts on a row that does not exist yet both hit the unique index; that is a
duplicate key, and the fix is the retry-without-upsert the repo already writes
twice (`consumeRateLimit`, the join-code generator) via `isDuplicateKeyError`.

**Why the client sends the value rather than the server reading its own newest.**
The tidier-looking version takes no body and sets the marker to the newest
message in the game, which cannot be forged at all. It is wrong in a small way:
a message that lands between the client's render and the request would be marked
read by a player who never saw it, and its dot would never light. Sending what
the client actually rendered has no such window. The locksmith question that
raises — a player can post any timestamp — has a short answer: the clamp caps it
at now, and the only thing a forged marker can do is suppress *the forger's own*
badge. There is no other player's state behind this route and nothing to escalate
into; it is a preference they could equally express by muting the channel.

**No push, no notification, nothing after the response.** Marking read is the
one thing in this feature that tells nobody.

### 13.5 The dashboard read

`buildDashboard` (`src/utils/dashboard.ts`) already reads three collections in
one `Promise.all` and partitions in memory, precisely so the home screen is one
consistent snapshot. The badge is a fourth read in the same shape, plus one
aggregate that depends on it:

```ts
const markers = await ChatReadModel.find({ userId }).exec();          // { userId: 1 }
const readAt = new Map(markers.map(m => [m.gameId, m.readAt]));

const counts = await ChatMessageModel.aggregate([
    { $match: { $or: games.map(game => ({
        gameId: game.gameId,
        senderId: { $ne: userId },
        ...(readAt.has(game.gameId) ? { timestamp: { $gt: readAt.get(game.gameId) } } : {}),
    })) } },
    { $group: { _id: '$gameId', count: { $sum: 1 } } },
]);
```

The `$or` is one clause per *live* game the player is in — a handful, and each
clause is served by the `{ gameId: 1, timestamp: -1 }` index phase 1 already
added, so this reads index entries and no documents. It has to be an `$or`
rather than one `$match` because the boundary is per game. A player with no
marker in a game counts every message from somebody else, which is the same
first-time signal the board's dot gives.

The marker read can join the existing `Promise.all`; the aggregate cannot,
because it needs both the game list and the markers. That makes the home screen
two round trips deep instead of one — worth noting rather than hiding, and
still far short of the twenty-odd Clerk calls the docstring says this function
exists to have removed.

`IGameResponse` gains `unreadChatCount?: number`, mapped on in `buildDashboard`
rather than inside `CreateResponse`: the schema method knows nothing about chat
and should keep it that way, and the dashboard is the only caller that has the
counts to hand.

```ts
myTurn: games.filter(…).map(game => ({
    ...game.CreateResponse(directory),
    unreadChatCount: counts.get(game.gameId) ?? 0,
})),
```

**At scale.** `$sum: 1` counts every unread entry, and a thread nobody has read
for a month could be hundreds. That is still index-only work and the badge caps
its display at `9+`, so the cost is bounded in practice; if it ever shows up
slow, the cheaper question is the boolean one — `distinct('gameId', …)` for "has
unread" — and the badge degrades to the same dot the top bar uses. Write the
count; keep that fallback in the comment.

### 13.6 Client

**The board (`useGameChat`).** The hook stops calling `useStoredValue` and reads
`data.readAt` instead. `hasUnread` is the same expression it is today with the
marker coming from a different place, and the effect that advanced the
`localStorage` value now POSTs to `/chat/read` — still gated on `open`, still
firing only when the newest message changes, and still *not* fired by the plain
GET, because the shell mounts this hook on every board open whether or not the
panel is showing. A failed POST is logged and dropped: the dot staying lit for
another minute is the correct failure, and there is nothing to retry that the
next open will not do anyway.

`useStoredValue` stays where it is — the dismissible banner and the guest-moved
flag still use it, which is what it was extracted for.

**Migration: there isn't one.** A browser holding an `ag-chat-read:<gameId>`
value and no server marker sees one stale dot per game, cleared by opening the
thread once. Seeding the server from `localStorage` on first mount would be a
POST-on-mount and a one-release-only code path to delete later, for one dot.
Leave the old keys to rot; `localStorage` is per-browser and nothing reads them.

**The dashboard.** One new primitive, `src/components/ui/UnreadChatBadge.tsx`,
because there are two call sites the moment it exists and that is the repo's
stated trigger for extracting: `MyTurnList`'s turn card (which already places an
`.ag-turn-card-badge` in the same corner for the turn timer — the two must not
land on each other) and `TheirTurnList`'s list row (beside
`.ag-list-row-time` and the 👉 nudge button). It renders nothing at zero, `9+`
past nine, and carries the count in an `aria-label` rather than leaving a
screen reader to read "3" next to a game name. One `.ag-chat-badge` block in
`ag-theme.css`, in `--ag-*` tokens, with a modifier for the coloured card
where the row's ink colour is wrong.

`ChatMessage` joins `DASHBOARD_EVENTS` in `usePushEvents.ts`, so a message that
buzzes a phone refreshes the home screen behind it. That is a one-line
improvement rather than the mechanism: the chat push is throttled to one per
recipient per game per ten minutes (§7), so the badge's real liveness is the
dashboard's existing `pollWhileWatching`.

### 13.7 The commits

Seven again, in this order. Each builds, type-checks, lints and leaves the app
working. The first four are the read receipts and the dashboard the owner asked
for first; 5 and 6 are independent of each other and of everything before them.

#### 1. `Remember where each player got to in a thread`

`src/utils/mongodb/ChatReadData.ts` (§13.3) with both indexes,
`normaliseReadAt` in `src/utils/chat.ts` with its cases in
`src/utils/chat.test.ts`, and the marker delete in
`src/app/api/user/delete/route.ts` beside the existing chat delete (§13.3).

Nothing reads or writes a marker yet — deliberately the same shape as phase 1's
commit 3: the model arrives already carrying the rule that stops it outliving
its game, rather than that rule arriving later as a fix.

*Gates: build, tsc, lint, `npm test`. Reviewer: `gremlin` (the deletion path,
and the ordering that keeps a half-failed delete recoverable).*

#### 2. `Keep a player's place in a thread on the server`

`src/app/api/game/[gameid]/chat/read/route.ts` — auth, membership, validation,
the `chatRead` limit, the clamp and the `$max` upsert with its duplicate-key
retry (§13.4) — plus `readAt` on the GET's response, and route tests in
`src/app/api/game/chatRoutes.test.ts` alongside phase 1's.

The tests that matter: a non-player gets 403, a bad body gets 400, a future
timestamp is clamped to now, a marker never moves backwards (post newer, then
older — assert the newer one stands), a first post upserts and a second updates,
and the GET carries **the caller's own** marker and no one else's.

Reviewable as pure access control and pure storage semantics; nothing renders
differently at the end of it.

*Gates: build, tsc, lint, `npm test`. Reviewers: `locksmith` (a new mutating
route) and `gremlin` (the upsert race).*

#### 3. `Clear the chat dot on every device, not just this one`

`useGameChat` moves off `useStoredValue` and onto `data.readAt` + the POST
(§13.6). One hook changes; `GameShell`, `GameChat` and the seven board wirings
are untouched, which is the payoff for phase 1 having put the fetch in the
shell.

This is the first commit of the phase a player notices, and the change is small
enough to say in one line: reading the thread on your phone now clears the dot
on your laptop.

*Gates: build, tsc, lint. Reviewers: `caveman` (one source of truth for the dot
— the `localStorage` marker goes, it does not linger as a fallback) and
`gremlin` (a failed POST must leave the panel working).*

#### 4. `Show unread messages on the dashboard`

`buildDashboard`'s two reads and the `unreadChatCount` mapping (§13.5),
`IGameResponse.unreadChatCount`, `UnreadChatBadge` used by both turn lists,
`.ag-chat-badge` in `ag-theme.css`, and `ChatMessage` in `DASHBOARD_EVENTS`.

A `buildDashboard` test for the count: a game with unread messages, a game read
up to date, a game whose only recent message is the viewer's own (zero — you do
not have unread mail from yourself), and a game with no marker at all.

**This is the commit the phase exists for**, and the answer to §7's open gap: a
player who has muted the `chat` channel now learns there is something to read
without opening the game.

*Gates: build, tsc, lint, `npm test`. Reviewers: `caveman` (one badge component,
two call sites — not two pills), `croupier` (the dashboard response is a DTO,
and it must carry the viewer's own count and nothing about anyone else's read
state) and `gremlin` (the `$or` and the aggregate under a player with many
games).*

#### 5. `Load the earlier part of a long thread`

`?before=<ISO>` on the GET — the same `{ gameId: 1, timestamp: -1 }` read with a
`timestamp: { $lt: before }` clause — a `hasMore` flag in the response, a
`loadEarlier` on the hook and a "Load earlier" control above the first row in
`GameChat`.

One thing to get right, and it is the reason this is not a two-line change:
`useRefreshableData` owns `data` and hands out no setter, which is exactly why
phase 1 refused an optimistic append (§6). Older pages need state of their own
in `useGameChat`, prepended to the live window. That is safe where the
optimistic append was not, and the difference is worth stating in the code:
older pages are **immutable and disjoint** from the polled window, so there is
no reconciliation to get wrong — the live fetch stays the single source of truth
for the tail, and the accumulated pages are only ever appended to at the front.
Reset them when `gameId` changes.

*Gates: build, tsc, lint, `npm test` (the cursor's route tests). Reviewers:
`caveman` (the second copy of the list is the thing to justify) and `gremlin`
(an empty page, a `before` that is not a date, a thread shorter than one page).*

#### 6. `Say who spoke while you were away`

`IRecapResponse` gains `chat?: { count: number; senders: string[] }`, built in
the recap route from the viewer's `ChatReadData` marker and a count of newer
messages from other players, and rendered by `TurnRecap` as one line above the
timeline ("💬 3 messages from Ann and Tom").

It is **not** an `IGameEvent`. Recap events are derived by replaying
`commandHistory` (§8, `docs/since-you-were-last-here.md` §3): a chat message has
no command, cannot be replayed, and must not become reaction-able — dropping a
🎉 on somebody's sentence is a different feature. A separate field keeps the
event feed exactly what it is.

The senders' names are resolved from the `userIdNameMap` the recap route already
builds for the roster, so this resolves nothing of its own — the same rule §5
sets for the thread.

*Gates: build, tsc, lint, `npm test`. Reviewers: `croupier` (a change to a
response builder) and `caveman` (a line, not a second thread).*

#### 7. `Say what's new, and write phase 2 down`

- `src/utils/ui/whatsNew.ts` — one *Enhancements* line, something like *"Chat
  now follows you around: the home screen shows how many messages are waiting in
  each game, and reading a thread anywhere clears it everywhere."* Drop the
  oldest line if the group runs past five.
- `ARCHITECTURE.md` §5 — the `ChatRead` collection beside `ChatMessage`, and the
  `/chat/read` route in the same paragraph as the chat routes.
- `docs/social-features.md` — the in-game chat row gains the unread badge.
- This document — §13's status line flips to shipped, the way §10's phase 1
  bullet did.

Docs-only and last, so every line describes something already true in the same
PR.

*Gates: build, tsc, lint. Reviewer: `rulebook`.*

#### If it has to be split

**After 4** is the clean cut, and it is where the owner's ask is delivered: the
marker is on the server, the dot works across devices and the dashboard counts
what is waiting. 5 and 6 are each a standalone follow-up with no dependency on
the other. What must not be split for long is **3 from 2** (a server marker
nothing writes) or **7 from 4** (a player-visible change with no What's new
line, which is the one upkeep rule `AGENTS.md` states outright).

### 13.8 Definition of done (phase 2)

- `npm run build`, `npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`) and
  `npm test` all clean. The engine is untouched again, and CI runs all four
  anyway.
- **Tests**, per commit above: `normaliseReadAt` in `chat.test.ts`; the marker
  route's 403 / 400 / clamp / monotonicity / upsert cases and the GET's
  own-marker-only case in `chatRoutes.test.ts`; the four `buildDashboard` count
  cases; the cursor's paging cases.
- **Reviews**: `locksmith` and `gremlin` on the new route, `croupier` on the
  dashboard and recap responses, `caveman` on the badge component and the paging
  state, `rulebook` on the upkeep commit.
- **Docs and What's new** land in commit 7, and nothing player-visible ships
  ahead of them by more than a day.
