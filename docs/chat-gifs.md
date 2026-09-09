# GIFs in chat — design notes

How a player could send a GIF in a game's chat thread, what that costs, and
which parts of it work on which platform.

This is a **design document, not an implementation plan** — nothing here has
shipped. Read [`docs/in-game-chat.md`](./in-game-chat.md) first: chat's model,
routes, panel and push channel all exist, and everything below hangs off them.
[`AGENTS.md`](../AGENTS.md)'s component-reuse rule shapes most of §6.

The headline: **there are two entirely different features hiding behind "GIF
support"**, and they cost different orders of magnitude. §1 separates them,
§2 explains why the Android keyboard — the obvious way in on a phone — is the
expensive one and not the cheap one, and §3 onwards designs the cheap one in
full.

---

## 1. Two mechanisms, one of which is a different feature

| | What we receive | Where the bytes live | Moderation | Platforms |
|---|---|---|---|---|
| **A. In-app picker** | a catalogue **id**, resolved to a URL server-side | somebody else's CDN | the provider's content filter | every platform, identically |
| **B. Keyboard / paste / drop** | a `File` of image bytes | **ours** — a blob store we don't have | ours | Android WebView only, version-dependent |

The distinction is the whole design. A picker stores a *reference*: a message
gains six small fields and the app never handles an image byte, never runs an
upload route, never grows a storage bill, and never has to decide whether a
frame is acceptable. Note what the client sends in that first column — an id,
never a URL. §4 is why that one word carries most of the security of this
design. Keyboard insertion stores a *file*: it needs a blob store
(Vercel Blob or S3), an authenticated upload route, content-type sniffing that
doesn't trust the client's `Content-Type`, a size cap, a per-player quota, a
deletion path wired into `/api/user/delete` alongside the `ChatMessageModel`
purge, and our own answer to "what if it's a picture of something awful".

Two more things follow from that table:

- **B is not a shortcut to A.** A GIF a keyboard hands over arrives as pixels.
  Even though GBoard's catalogue *is* Tenor's, there is no id or URL in what
  `commitContent` delivers, so we cannot cheaply turn a keyboard GIF back into
  a reference and take path A's costs. It is bytes or nothing.
- **A subsumes B on the phone.** A picker in the composer puts the same
  catalogue one tap away as the keyboard's GIF tab, on every platform, with a
  known-good rendering path — so B buys familiarity, not capability.

**Recommendation: build A. Treat B as a later, optional enhancement** that
lands on top of the same message shape (§3's attachment), so nothing has to be
redesigned if it ever ships. §9 sizes it.

---

## 2. Why the Android keyboard is the hard path

A soft keyboard inserts a GIF through `InputConnection.commitContent()`
(API 25+, or `InputConnectionCompat` below that). It only offers the GIF tab as
*insertable* when the focused editor advertises image MIME types in
`EditorInfo.contentMimeTypes`. In a WebView, the app does not decide that —
Chromium's own `onCreateInputConnection` does, per focused element.

That has three consequences for us:

1. **A plain `<input>` is the wrong element.** Chromium advertises rich content
   for editors it treats as rich — in practice a `contenteditable`, not
   `<input type="text">`, which is what the composer uses today
   (`GameChat.tsx`'s `ag-chat-composer`). Swapping a controlled `<input>` for a
   `contenteditable` is not a small change: it means owning caret handling,
   paste sanitisation, the `maxLength` that `MAX_MESSAGE_LENGTH` currently gets
   for free, and the placeholder. That is a lot of bespoke editor for one
   feature — exactly the kind of thing the caveman is for.
2. **We cannot pin the behaviour.** `capacitor.config.ts` wraps the live
   deployment in the *device's* system WebView, so what a keyboard offers
   depends on a Chromium version and a keyboard we don't ship and can't
   version-gate. Different phone, different answer. Whatever we build here has
   to be **feature-detected and degrade silently**, never advertised.
3. **When it does work, it arrives as a paste.** Chromium surfaces inserted
   content as a `paste` event whose `clipboardData.files` holds the image —
   the same shape as a genuine clipboard paste. So *one* handler covers
   keyboard insertion, clipboard paste and drag-and-drop, which is the one
   piece of good news in this section: if we ever pay for path B's storage, we
   pay for the client side once.

Where it isn't supported, GBoard's own fallback takes over (it declines to
insert, or copies the GIF and leaves the player to paste it) — which is a
mediocre experience we neither control nor can improve.

`android/app/src/main/java/com/asyncgames/app/MainActivity.java` is a bare
`BridgeActivity`. Nothing here needs native code; a Capacitor plugin
overriding `onCreateInputConnection` could force the MIME advertisement, but
that is native code in a repo that has none, to make an already-optional path
slightly less optional.

### 2a. iOS, for completeness

There is no `ios/` target — iOS players are on Safari or an installed PWA.
There is no iOS equivalent of `commitContent` for web content: the GIF
keyboards copy to the clipboard and expect a paste. So iOS is covered by
exactly the same `paste` handler as §2's point 3, and by the picker.

---

## 3. The data model: an attachment beside the text

`ChatMessageData` gains one optional nested field. It does **not** become a
union, and `text` does not go away — a GIF with a line of text under it is a
normal message, and keeping `text` where it is means the thread, the unread
marker, the `before` cursor and the `{ gameId: 1, timestamp: -1 }` index are
all untouched.

```ts
export interface IChatAttachment {
    provider: 'tenor',   // named, so a second catalogue is additive
    mediaId: string,     // the provider's own id — for the share ping (§5) and for dedupe
    url: string,         // the animated file, https, on an allow-listed host (§4)
    stillUrl: string,    // the first frame — reduced-motion, and tap-to-play (§6)
    width: number,       // intrinsic size, so the row can reserve its box (§7)
    height: number,
    alt: string          // the provider's content description
}

export interface IChatMessageData {
    messageId: uuidString,
    gameId: string,
    senderId: string,
    text: string,                    // may now be empty, if `attachment` is set
    attachment?: IChatAttachment,    // absent on every message written before this shipped
    timestamp: string
}
```

Three decisions worth writing down:

- **A nested Schema, not `Schema.Types.Mixed`.** Mixed would take whatever the
  route handed it, which is precisely the property we don't want next to a
  client-supplied URL (§4). A message is created, never mutated, so none of
  `markModified`'s usual nested-document trouble applies.
- **Store the URL *and* the id — but neither comes from the client.** Both are
  copied off the provider's own response by the server (§4). The URL, because a
  provider's URL shape is not ours to reconstruct and a stored message must
  still render in a year; the id, because the share ping (§5) needs it, because
  it is the stable handle if we ever want to re-resolve a dead URL, and because
  it is the *only* field the client gets a say in.
- **Store the dimensions.** Not for tidiness — §7. Without them the thread
  jumps every time a GIF loads.

Absent-not-null keeps every existing message valid with no migration, the same
way the rest of the app's optional DTO fields do.

---

## 4. What the client is allowed to send: an id, not a URL

The first draft of this document had the client send the resolved URL and the
server check it against a hard-coded host allowlist. That works, but it makes
the allowlist **load-bearing**: it is the only thing standing between a player
and an `<img src>` of their choosing in every opponent's browser, which hands
that host each opponent's IP and user-agent, works as a read receipt, and can
point at a decompression bomb instead of a GIF. A gate that important should
not be a string comparison we have to get right — `endsWith` alone is defeated
by `evil-media.tenor.com.example`, and that is the *easy* mistake to spot.

**So the client sends a catalogue id and the server resolves it.** The URL
stored on the message is copied off the provider's own response, so there is no
client-supplied URL anywhere in the design and nothing for an allowlist to be
the last line of defence against. Three ways to do that, in increasing order of
how well they work:

### 4a. An index into a remembered result set

The client sends "the third result of search *X*"; the server kept that result
set and looks it up. This is the strongest *guarantee* of the three: the item
is provably real **and** provably one our own filtered search offered.

It is also the one with server-side state, and the state is what spoils it:

- It needs a TTL, and its expiry is a bad failure. A player opens the picker,
  gets distracted, taps a GIF ten minutes later, the result set has been
  reaped, and the send fails for a reason they cannot understand or fix.
- A type-ahead picker churns result sets, so an index is only meaningful
  against a specific one — the payload is really `{ searchId, index }`, every
  keystroke invalidates the last set, and every tab and device needs its own.
- It is more moving parts than 4c for a guarantee 4c also provides.

### 4b. An id, re-resolved from the provider on send

The client sends `{ provider, mediaId }` and the POST route asks Tenor for that
id (v2's **Posts** endpoint, `/v2/posts?ids=` — v1's "GIF" endpoint renamed).
No state, no index races, and the id is validated by the one party qualified to
do it: if Tenor resolves it, it is real, and the URLs come back from Tenor
rather than from the client.

Two costs, one of them subtle:

- It proves "a real Tenor item". It does **not** prove "an item our content
  filter approved" — a player can send any valid id, including one they found
  under a query our filter would have blocked, or one from outside the picker
  entirely. Tenor's `contentfilter` defaults to `off`, and whether it is
  honoured on a by-id lookup at all is unconfirmed and should be verified
  rather than assumed. A filter applied only at search time is not a filter.
- It puts a third-party round trip on the **user-blocking** send path. The chat
  POST defers everything slow into `after()`, but this cannot be deferred —
  the resolution *is* the message content. A Tenor wobble becomes a failed
  send, where storing a reference would have succeeded.

### 4c. An id, plus a durable catalogue — recommended

The search route has already fetched the item *and* applied our content filter,
so it writes what it learned down. A new small collection, keyed by media id:

```ts
export interface IGifCatalogueData {
    provider: 'tenor',
    mediaId: string,     // unique with provider — the client's only input
    url: string,         // all four copied off the provider's response,
    stillUrl: string,    // never off a request body
    width: number,
    height: number,
    alt: string,
    expiresAt: Date      // a TTL index, so this stays a cache and not a ledger
}
```

The POST then takes only `{ provider, mediaId }`, reads that row, and copies
its fields onto the message. Why this beats both of the above:

- **The catalogue is durable, not per-search.** "Did our own filtered search
  ever serve this item?" becomes a persistent fact rather than a session one —
  so it carries 4a's filter guarantee with no TTL race, no `searchId`, and no
  index churn.
- **The normal send touches no third party.** It is one indexed local read of a
  row our own search route wrote seconds earlier, so the send path is not
  coupled to Tenor's uptime the way 4b's is.
- **An unrecognised id is a plain 400** — a comprehensible refusal, not a
  mysterious one, and nothing a picker-driven send can hit.
- The row is also the dedupe and analytics handle (§5) for free.

Give it the `expiresAt` + `expireAfterSeconds: 0` TTL index that
`RateLimitData` and `InvitationData` already use, so it stays bounded by what
players actually browse. Eviction is safe by construction: the *message* keeps
its own denormalised copy forever, so a reaped catalogue row can never break a
GIF that has already been sent.

### 4d. Where the allowlist ends up

It does not disappear — it **demotes**, which is the whole point. It moves off
client input and onto the provider's own response, inside the search route: ten
lines asserting that the URLs Tenor handed us are `https:` on an expected host,
with no credentials and a bounded length. That catches a config error pointing
at the wrong base URL, or a spoofed or compromised upstream. Defence in depth,
not the defence.

And its failure mode inverts, which is the answer to "an allowlist may fail".
As the gate on client input, getting it wrong lets an attacker in. As an
assertion on a trusted upstream, the worst it does is refuse a legitimate GIF.

### 4e. What still gets validated

`src/utils/chat.ts` — the module the composer and the POST route already share
so their limits can't drift — gains:

- `normaliseGifRef(value): { provider, mediaId } | null` — `provider` in the
  known set, `mediaId` matching the provider's id shape and length-capped.
  That is the entire client-supplied surface of this feature, and it is two
  string checks.
- a relaxed `normaliseMessage`, so an empty `text` is legal *when an attachment
  is present*. The POST's check becomes "a valid message, or a valid gif ref,
  or 400".
- `describeMessage(message)` (§8), so the push copy and any future preview
  cannot word a GIF-only message differently.

The fields copied off the catalogue row still get the cheap sanity checks
before they are written onto a message — positive integer dimensions under a
cap, a trimmed and length-capped `alt` — because a row written by an earlier
version of the search route is not the same trust level as one written by this
one. `alt` is stored as text and rendered through React's escaping; nothing in
chat goes near `dangerouslySetInnerHTML`.

`next.config.mjs`'s `images.remotePatterns` does **not** need the provider
added, because §6 renders a GIF with a plain `<img>` rather than `next/image`.
The repo sets no `Content-Security-Policy` today; if one is ever added, its
`img-src` is the real belt to §4d's braces and should list the same hosts from
the same constant.

---

## 5. The picker's data: a proxied search route

A new `GET /api/gif/search?q=…` (and `?trending`), because the provider's API
key must not ship to the client — and, per §4c, because this route is now also
what populates the catalogue.

Tenor is the recommended provider: it is Google's, it is free at our volume,
its content filter is server-side, and — pleasingly, given where this question
started — **it is GBoard's own catalogue**, so the picker offers a phone player
the same GIFs the keyboard would have.

The route is an ordinary member of `src/app/api/`, so it follows the gates the
locksmith and gremlin passes will look for:

- `auth()` first — signed-in only. It is not gated on membership of a game,
  because searching for a GIF isn't a per-game act, but that makes the rate
  limit the only thing between us and somebody using our key as their own
  free GIF API.
- `consumeRateLimit('gifSearch', userId, …)` — a search-per-keystroke picker
  makes this the app's chattiest endpoint by an order of magnitude, so debounce
  hard on the client *and* limit on the server; the limiter is the one that
  actually holds.
- `q` length-capped and passed as a query parameter, never interpolated into
  the upstream URL by hand.
- `contentfilter=high` and `media_filter` set so the upstream returns only the
  small variants we render — **pinned in the route, not chosen by the caller**,
  or the filter becomes a client-supplied field and §4c's guarantee evaporates.
- `AbortSignal.timeout(…)` on the upstream fetch, and a provider failure
  answers with an empty list and a flag the picker shows as "GIFs
  unavailable" — a wobble at Tenor must not break the composer, which is the
  same "a push failure never undoes the message" instinct the chat POST
  already has.
- The response is **mapped down** to the fields the picker renders — never the
  provider's JSON passed through, which would leak whatever else it carries and
  couple our client to their schema.
- §4d's host assertion on each item's URLs, dropping any item that fails rather
  than failing the search.
- Results are the same for everybody, so the response can carry a real
  `Cache-Control` with `s-maxage` — the one endpoint in the app where a shared
  cache is correct, precisely because it is not per-viewer.

### 5a. Populating the catalogue without paying for it

The upsert of §4c's rows goes in the route's `after()`, as a single
`bulkWrite` with `ordered: false`, guarded — it is bookkeeping, and nothing the
searcher is waiting on. Two things keep the write amplification honest:

- A CDN-cached search response doesn't re-run the route at all, so a popular
  query pays for its upsert once and then never again. The catalogue converges
  on what players actually browse.
- Only the items the picker will render are upserted, and the page size is
  ours to set.

One decision is genuinely still open: **what a send does on a catalogue miss.**
Either refuse with a 400 (strict — and it costs nothing real, since the picker
served the row seconds ago), or fall back to §4b's Tenor resolution with the
content check applied then (forgiving, at the price of reintroducing the
third-party dependency on that one path). Recommendation: start strict, and
only add the fallback if the refusal is ever actually seen.

Tenor also asks for a `registershare` ping when a result is really sent. That
belongs in the POST route's existing `after()` block, next to the push fan-out
and guarded the same way: it is analytics, and it must never be able to fail a
message that already saved.

---

## 6. Rendering, and what gets reused

The good news first: **`RecapTimelineEvent.title` is already
`React.ReactNode`**, and `GameChat` already passes `message.text` into it. A
GIF message is `title: <ChatGif … />` — or the GIF with the text under it — and
`RecapTimeline` needs no change at all. No new list, no second thread
component, nothing that duplicates the avatar-marker-and-rail picture.

What's genuinely new is two pieces, and both earn it by having two callers:

- **`src/components/ui/ChatGif.tsx`** — one attachment rendered. Used by the
  thread row *and* by the picker's own result grid, which is the second copy
  AGENTS.md says to extract on.
- **`src/components/games/GifPicker.tsx`** — the search field and result grid,
  opened from a button in `ag-chat-composer`. Panel chrome comes from the
  `ag-*` classes the composer and `ag-log` already use; the search field is
  `ag-input`, the results a grid, the trigger an `ag-btn ag-btn--ghost`. New
  `ag-theme.css` classes for the grid and the row's GIF box, using the existing
  tokens — no inline hex.

Rendering rules, each of which is a real decision rather than a detail:

- **A plain `<img>`, not `next/image`.** The optimiser does not optimise
  animated images, the provider already serves a correctly sized variant, and
  routing it through `/_next/image` would bill us to pass bytes through
  unchanged. This is also why §4 leaves `remotePatterns` alone.
- **Reserve the box from the stored dimensions** (`aspect-ratio`, a
  `max-height` so a tall GIF can't take the whole panel, and a `max-width` of
  the row). §7 is why.
- **Honour `prefers-reduced-motion`**: show `stillUrl` and let a tap play. That
  is not a nicety for animated content — it is the accessibility requirement
  for it, and it doubles as the data-saving default worth considering for every
  player on a phone, since a thread of auto-playing GIFs is the single heaviest
  thing this app would ever render.
- `loading="lazy"` and the `alt` from the provider, so a loaded-earlier page of
  history doesn't fetch fifty GIFs at once and a screen reader gets the
  description.

---

## 7. The bug this creates, before it's written

`GameChat`'s follow-the-thread behaviour is a `useLayoutEffect` keyed on the
newest message's id that sets `scrollTop = scrollHeight` before paint. An image
with no reserved height has **zero** intrinsic size at that moment, so the
effect measures a thread that is short by the height of the GIF, scrolls to the
bottom of *that*, and then the bytes arrive and push the newest message back off
the bottom of the panel. Every incoming GIF would look like a scroll glitch.

The reserved aspect-ratio box in §6 is the fix, and it is the reason §3 stores
`width` and `height` on the message rather than reading them off the loaded
image: **the row's height has to be known before the image loads, not after.**

Two smaller ones in the same area:

- A GIF that 404s (a provider expiring a URL, a blocked host) must degrade to a
  caption, the way `Avatar` falls back to its initials badge on `onError` —
  a degraded message, never a broken row.
- The `before` cursor and `hasMore` paging are untouched, but "load earlier"
  prepending fifty rows of *unknown* height is the same measurement problem
  one page up; reserved boxes solve that too.

---

## 8. Push, recap and the unread dot

- **Push copy stays in `notificationContent.ts`**, which is the only place any
  notification's words are written. `buildChatNotification` takes the message
  and reads "Ann sent a GIF" when there is no text, or the text when there is.
  Worth a shared `describeMessage()` in `src/utils/chat.ts` so the push and any
  future preview can't word it differently.
- **`PushNotification.imageUrl` already exists** and already flows to Android,
  APNs and the web service worker — so a chat push *could* carry the GIF's
  still. Recommendation: don't. Today that field carries the game's art, a chat
  push would have to give that up, Android renders only a still frame anyway,
  and the notification tray is not where anybody wants to look at a GIF.
  Cheap to change later; flagging it as the owner's call.
- **The unread dot, the dashboard badge and the recap line need nothing.** The
  recap route's `chat` field is `{ count, senders }` — a count and some names,
  no message text — so it is already agnostic about what a message contains.
  Same for the server-side read marker.
- **Deletion needs nothing.** `/api/user/delete` already `deleteMany`s a
  player's games' chat messages. Because a GIF is a reference and not a blob,
  there is no second store to purge — which is the strongest practical argument
  for path A over path B.

---

## 9. Moderation, honestly

`docs/in-game-chat.md` §9 settled that guests chat, on the grounds that a seat
at a table was *invited*, not matchmade, and that
`docs/social-features.md`'s "never open a text channel to strangers before
blocking and reporting exist" was written about open matchmaking. That
reasoning carries over to GIFs unchanged — the people who can send one are the
same people who can already send 500 characters.

What does change is the surface: 500 characters is something a player typed, a
GIF is one pull from a catalogue of millions. Three things keep that bounded,
and they are all already in the design above rather than being extra work:

1. **The catalogue (§4c) is the moderation boundary.** A message can only
   reference an item our own filtered search actually served — so the set a
   player can pick from is one the server defined, not one they can address
   directly. Arbitrary URLs would be the version of this feature that genuinely
   needs moderating; this is not, and that is a property of the mechanism
   rather than of a check we remembered to write.
2. **`contentfilter=high` (§5)** does the bulk of it upstream, and is pinned in
   the route where a client can't relax it. §4b is the variant where this
   guarantee would have leaked, and §4c is why it doesn't.
3. **We store the `mediaId` (§3)**, so a reported message can be identified
   rather than just deleted — and, because the catalogue is keyed by the same
   id, a single row is the place to blocklist an item everywhere at once.

This does not remove phase 3 — blocking and reporting — from the roadmap; it
makes it slightly more valuable and still not a hard dependency for a table of
invited players.

---

## 10. Where it works, once built

| Platform | Picker (A) | Paste | Drag-and-drop | Keyboard insert |
|---|---|---|---|---|
| Desktop web | ✅ | needs B | needs B | n/a |
| Android, Chrome tab | ✅ | needs B | n/a | needs B, and a `contenteditable` |
| Android, Capacitor app | ✅ | needs B | n/a | needs B, `contenteditable`, and a WebView that plays along |
| iOS Safari / installed PWA | ✅ | needs B | n/a | n/a (clipboard only) |

One column works everywhere and costs a nested schema field, a validated
allowlist, a proxied search route and two components. The other three share one
client-side handler and a blob store, an upload route, a quota, a deletion path
and a moderation policy — and even then the last column is a maybe that depends
on the phone.

---

## 11. If it gets built: the commits

1. **Model + validation.** `IChatAttachment` on `ChatMessageData`, the
   `GifCatalogue` model and its TTL index, `normaliseGifRef` and the relaxed
   `normaliseMessage` in `src/utils/chat.ts`, the host-assertion constant, and
   unit tests on the rejections (unknown provider, a malformed id, both text
   and ref empty). No route changes yet — nothing can send one.
2. **The POST route accepts a ref.** `{ provider, mediaId }` read through
   `normaliseGifRef`, resolved against the catalogue, 400 on an unknown id,
   the resolved fields denormalised onto the message; the existing membership
   gate and rate limit unchanged, and the route test extended to cover a
   forged id and a catalogue miss.
3. **The thread renders one.** `ChatGif`, the reserved box and its `ag-*`
   classes, the `onError` caption fallback, reduced-motion, and `GameChat`
   passing a node into the title it already accepts. Verify §7's scroll
   behaviour with a tall GIF, which is the thing most likely to be wrong.
4. **The search route.** `/api/gif/search`, auth + rate limit + timeout +
   mapped response + pinned content filter + cache header + the `after()`
   catalogue upsert, and a route test for the unauthenticated, over-limit and
   upstream-failed cases.
5. **The picker.** `GifPicker` in the composer, debounced, degrading to
   "GIFs unavailable", plus the `registershare` ping inside the POST's
   existing `after()`.
6. **Push copy and docs.** `describeMessage`, the `buildChatNotification`
   branch and its test; amend `docs/in-game-chat.md` to point here; **one**
   "What's new" line under enhancements, for the branch as a whole.

Reviewers, by what each commit touches: `locksmith` and `gremlin` on 2 and 4,
`caveman` on 3 and 5, `rulebook` on 6. `croupier` has nothing to do here —
chat is public to the table by construction, and a GIF adds no hidden state.

Before each commit: `npm run build`, `npx tsc --noEmit`, `npm run lint`
(`--max-warnings 0`), and `npm test` for 1 and 2.
