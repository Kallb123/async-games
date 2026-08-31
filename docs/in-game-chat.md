# In-game chat — implementation plan

A per-game message thread: the players in one game can talk to each other from
the board screen, and a message reaches the others as a push notification the
way a nudge or a reaction does.

This is the planning document. Nothing here is built yet. Read
[`AGENTS.md`](../AGENTS.md) first — the component-reuse rule shapes most of the
decisions below — and [`ARCHITECTURE.md`](../ARCHITECTURE.md) §5–§8 for the data
model, the response-shaping contract and the push plumbing this leans on.

**Out of scope, deliberately:** moderation, profanity filtering, blocking and
reporting. See §9 for the one existing repo decision that touches this, and what
this plan does about it.

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
| Name resolution | `src/utils/users/clerk.ts` (`userIdListToUserIdNameMap`) | One Clerk call per response; no name is ever stored on a message. |

One piece of history worth knowing: `notificationPreferences.ts` opens with a
comment saying a `chat` channel used to sit in the list **with nothing sending
on it**, and was removed for it. This plan puts the sender behind the switch
before the switch goes back.

---

## 2. What the player gets

- A 💬 button in the in-game top bar, on every multiplayer game. A dot on it
  when there are messages the player hasn't seen.
- Tapping it opens the thread over the board: messages oldest-first, each with
  its sender's name in that player's seat colour, a relative timestamp, and a
  composer at the bottom.
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

- **No `senderUsername`.** Names are resolved live from Clerk on the way out
  (`ARCHITECTURE.md` §5, `docs/dynamic-names.md`): a player who renames renames
  everywhere, including in messages they sent last week. `ReactionData` freezes
  a name only because it needs one to build a push for a *recipient* it may not
  otherwise resolve; the chat push is built from `currentUser()`, who is right
  there.
- **The index is the read.** One query — `find({ gameId }).sort({ timestamp: -1
  }).limit(N)` — served entirely by `{ gameId: 1, timestamp: -1 }`.
- **`messageId` is a v4 UUID**, so the client has a stable React key and an
  idempotency handle if a retry is ever added.

### Deletion

Messages must not outlive their game.

- **Account deletion** (`src/app/api/user/delete/route.ts`): that route already
  deletes every game the user was in (`GameDataModel.deleteMany({ userIdList:
  userId })`). Collect those `gameId`s *before* the delete and add
  `ChatMessageModel.deleteMany({ gameId: { $in: gameIds } })` beside the
  existing `ReactionModel` line. That covers every message the user sent **and**
  every message anyone sent to them, because chat only exists inside games they
  were a player of — so no `senderId` index is needed.
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

1. `auth()` — 401 if not signed in (401, not 400, so `fetchWithSessionRetry`
   can retry a cookie-refresh race, per `[gameid]/route.ts`).
2. `dbConnect()`, load the game by `gameId` — 404 if missing.
3. **`gameData.userIdList.includes(userId)` — 403 otherwise.** This is the whole
   access control for chat, so it is the line to get right.
4. Read the newest `CHAT_PAGE_SIZE = 50` messages, reverse to oldest-first.
5. Resolve the roster once with `userIdListToUserIdNameMap(gameData.userIdList)`
   — every sender is a player, so there is no second Clerk call.

```ts
export interface IChatMessageResponse {
    messageId: string;
    senderId: string;    // stable key: the client colours by seat, not by name
    senderName: string;  // resolved live
    text: string;
    timestamp: string;
}
export interface IChatResponse { success: boolean; messages: IChatMessageResponse[]; }
```

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
8. Return `{ success: true, message: IChatMessageResponse }` so the client can
   render the sent line without a refetch.

Both handlers are membership-gated and both take the `gameid` from the path, so
neither trusts a `gameId` in the body. Worth a `locksmith` and a `gremlin` pass
before it merges, per `AGENTS.md`.

---

## 6. Client

### The panel: `src/components/games/GameChat.tsx`

Sits beside `MatchHistory` and `TurnRecap` — game-agnostic components that every
board screen shows. It owns:

- `useGameChat(gameId, { open })` (below) for data and sending;
- the message list: one row per message, `Avatar` for the sender, the sender's
  name tinted by `playerColourForId(senderId, userIdList)` (the same helper the
  scoreboard and `MatchHistory` colour by, so a player is one colour everywhere),
  `formatRelativeTime` from `src/utils/ui/time.ts` with `useNowToTheMinute()`
  for the timestamp;
- the composer: a `.ag-input` and an `.ag-btn ag-btn--primary`, disabled while
  empty, over-length or sending;
- the empty state, in the `.ag-log-empty` idiom;
- `Skeleton` on first load and `Refreshable` around the list on a refetch —
  the `isLoading` / `isRefreshing` split `useRefreshableData` exists to give.

Message text is rendered as text. React escapes it; nothing here goes near
`dangerouslySetInnerHTML`.

New CSS is a small `.ag-chat-*` block appended to `ag-theme.css`, in `--ag-*`
tokens, next to `.ag-log`. No inline styles for colour, spacing or surfaces.

### The hook: `src/utils/hooks/useGameChat.ts`

```ts
useRefreshableData<IChatResponse>(`/api/game/${gameId}/chat`, CHAT_EVENTS, {
    pollWhileWatching: open,
});
```

plus a `send(text)` that POSTs, appends the returned message optimistically and
refreshes. `pollWhileWatching` is gated on the panel being open, for the reason
`useGameData` gates its own polling on waiting for an opponent: a closed panel
has nothing to wait for, and every tick is a request per watching player. A
message arriving while the panel is shut still lands as a push, which is what
`CHAT_EVENTS` refetches on.

`CHAT_EVENTS = ['ChatMessage'] as const` goes in `usePushEvents.ts` beside the
other event groups.

### Where it mounts: `GameShell`, once

This is the part to get right, and the reason to look at `showLog` first: the
"turn history" toggle is hand-rolled in **eight** game screens — a `useState`, a
`GameOption` row and a render block in each. Chat must not become the ninth
copy of that shape.

So `GameShell` — the shared in-game chrome every board already wraps itself in,
and used by nothing else — grows one optional prop:

```tsx
interface GameShellProps {
    …
    /** The game's chat thread. Omitted (or a single-seat game) renders no chat. */
    chat?: { gameId: string; userIdList: string[] };
}
```

`GameShell` renders the 💬 top-bar button (left of the existing `right` slot,
reusing `.ag-game-topbar-btn` and its `--on` state) and the panel when open. It
holds only `open`; `GameChat` owns the fetching, so the shell stays the dumb
frame it is today. Nothing renders when `chat` is absent or
`userIdList.length < 2` — which is how Solitaire gets no chat without naming
Solitaire anywhere.

Every board screen already has both values in scope. The wiring per game is one
prop:

```tsx
<GameShell … chat={{ gameId, userIdList }}>
```

Eight screens, one line each, no new state and no new menu row in any of them.

### Unread marker

The dot on the button needs "what has this player already seen". Phase 1 keeps
it in `localStorage` under `ag-chat-read:<gameId>` (an ISO timestamp, written
when the panel opens); unread = messages newer than it from somebody else.

Per-device, and that is the known cost: read on your phone, the dot lingers on
your laptop. The alternative is a server-side read marker — a fourth small
collection or a `Map` on the game — and it is not worth one before anyone has
asked, because the badge is a nicety and the push already did the telling. §10
records what a server-side marker would unlock (an unread count on the
dashboard), for when that is the thing being asked for.

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

## 9. Guests

`docs/account-less-play.md` §8 records a decision this plan has to answer to:

> per [`docs/social-features.md`](./social-features.md) §7 — never open a text
> channel to strangers before blocking and reporting exist — guest seats stay
> out of any future chat feature until that work is done.

Moderation is out of scope here, so that work is still not done. **Phase 1
therefore honours the existing decision the cheap way: a guest account can read
the thread but not post**, with the composer replaced by the existing
`ClaimAccountOffer` — claim your account and you can talk. `isGuest(user)` on
the client for the composer, `user.publicMetadata.guest !== true` on the POST
route for the gate that actually holds.

This is a decision to *confirm*, not one to assume. A guest reaches a table only
by a join code the host shared with them, so they are a stranger to the app
rather than to the people at the table — which is arguably not the case §8 was
written about. If the owner would rather guests could talk, it is one condition
to delete in each place; the plan takes the conservative reading because
overturning a written decision is not this PR's to make silently.

### Outbreak

`OutbreakHands.tsx` says the game's "shared table, shared brain" pillar means
"there is no chat window telling teammates what you're holding" — which is why
every hand is public there. A general chat window is exactly the thing that
comment says Outbreak does without.

Recommendation: **ship chat in Outbreak anyway, and update that comment.** The
pillar it protects is that the *board* shows everything, so a player never has
to be told what is in a hand — and that stays true. Players in a co-op game will
coordinate in WhatsApp regardless; the honest position is that the board is not
trying to prevent table talk, only to make it unnecessary. If the owner disagrees,
`GameShell` simply isn't given `chat` on that one screen — a one-line opt-out,
which is another reason the wiring is a prop rather than something automatic.

---

## 10. Phases

**Phase 1 — the thread.** §3 model + deletion wiring, §4 validation module, §5
routes, §6 panel + hook + `GameShell` prop + the eight one-line wirings, §7 push
and channel. This is the whole feature as described above; it is not worth
shipping half of it, since a chat nobody is notified about is a chat nobody
uses.

**Phase 2 — the polish, once phase 1 has been used.**

- Older messages: a `before` cursor on the GET, and a "load earlier" control.
  Deliberately not in phase 1 — fifty messages is a long conversation for a
  game, and a cursor nobody has hit the end of is speculative work.
- Server-side read markers, which is what an unread count on the dashboard
  game rows would need.
- A "somebody messaged" line in the "since you were last here" recap.

**Phase 3 — only if the product goes there.** Blocking, reporting and anything
moderation-shaped. Out of scope for this work, and the gate that §9's guest
decision is waiting on.

---

## 11. Definition of done (phase 1)

- `npm run build`, `npx tsc --noEmit`, `npm run lint` (`--max-warnings 0`) all
  clean. The engine is untouched, but run `npm test` anyway — it is four
  commands and CI runs all four.
- **Tests.** `src/utils/chat.test.ts` over `normaliseMessage` (empty, blank,
  over-length, non-string, blank-line collapsing). A route test in the
  `src/app/api/game/gameRoutes.test.ts` style covering: a non-player gets 403 on
  both verbs, an over-length body gets 400, the rate limit gets 429, a stored
  message comes back with the sender's *current* name, and the sender gets no
  push.
- **Reviews**, per `AGENTS.md`: `locksmith` and `gremlin` on the routes,
  `caveman` on the panel and the `GameShell` change, `rulebook` on the
  registry/upkeep edits (channel list, `usePushEvents`, account deletion,
  What's new).
- **Docs.** `ARCHITECTURE.md` §5 gains `ChatMessage` beside `GameResult` in the
  data-model section, and §8 gains the `chat` channel. This document gets a
  status line at the top saying it shipped, as `since-you-were-last-here.md`
  does.
- **What's new.** One line in *Enhancements* — something like *"Talk to your
  opponents"* / *"Every game now has a chat thread: tap 💬 on the board to say
  something, and the others get a nudge on their phone."* — with the oldest line
  dropped if the group runs past five.
