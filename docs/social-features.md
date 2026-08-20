# Social features — plan, sizing & risk

A planning document. It maps out which social features matter for an
**asynchronous** turn-based gaming platform, sizes each one (complexity, size,
risk), and orders them into rough phases.

**Status update (2026-07-23):** Phase 0 is largely complete. Implemented:
player turn nudges, turn/action reactions, notification channel toggles per
user, `GameResult` storage (the structural foundation from §5), and match
history on user profiles. These form the backbone for Tier 2 features (profiles,
stats) and later phases.

The framing that runs through the whole document: async play is *lonely by
default*. There's no shared session, no lobby, no "you're both online right
now" moment — two people might touch the same game hours or days apart. Social
features are what replace the ambient presence a realtime game gets for free.
So the goal isn't to bolt on a chat box; it's to make an opponent feel *present*
across a gap in time.

---

## 1. What already exists

Some social plumbing is already in the codebase. New work should extend these,
not duplicate them (see [`AGENTS.md`](../AGENTS.md) — component reuse is the #1
rule, and it applies to server models and API contracts too).

| Capability | Where | State |
|---|---|---|
| **Friends** — request / accept / remove, list with incoming/outgoing | `src/utils/mongodb/FriendshipData.ts`, `src/app/api/friends/**` | Built. Flat `requester/recipient/accepted` record; list endpoint already aggregates each friend's **last action timestamp** across their games. |
| **User directory** | `src/app/users/page.tsx`, `src/app/api/users/` | Built. Browse users to friend / invite. |
| **Game invitations** | `src/utils/mongodb/InvitationData.ts`, `src/app/api/newgame/**`, `src/app/api/invite/**` | Built. Per-game invite → all-accept → `CreateGame()`. |
| **Push notifications** | `src/utils/firebase/pushNotification.ts`, `FirebaseForeground.tsx` | Built. `sendPushToUsers()` + a `window` `CustomEvent` fan-out. Events: `NewInvite`, `InviteAccepted`, `GameStart`, `YourTurn`, `TurnExpiringSoon`, `GameOver`, `TurnNudge`, `TurnReaction`. |
| **Notification preferences** | `src/utils/mongodb/UserProfile.ts`, `src/app/api/user/preferences/**` | Built. Per-user toggles for notification channels (push, in-app, etc.) and event-type batching. Checked before sending. |
| **Turn nudges** | `src/utils/mongodb/GameData.ts`, `src/app/api/game/nudge/**` | Built. One-tap "your move!" nudge per turn, limited to 1 per opponent per turn cycle. Sends `TurnNudge` FCM event. |
| **Turn/action reactions** | `src/utils/mongodb/GameData.ts`, `src/app/api/game/reaction/**` | Built. Emoji reactions on turns. Append-only per-turn store, sent in `TurnReaction` FCM event. |
| **Match history & GameResult** | `src/utils/mongodb/GameResult.ts`, `src/app/api/user/history/**` | Built. Durable, append-only record written on game-over (command pipeline + timeout cron). Survives game deletion; powers profiles, stats, and head-to-head. |
| **User profiles** | `src/app/users/[userId]/page.tsx`, `src/app/api/user/[userId]/**` | In progress. Public profile page with match history, per-game W/L stats, streaks. Built on `GameResult` store. |
| **Turn recap / "since you were last here"** | `docs/turn-recap-and-planning.md`, `docs/since-you-were-last-here.md`, `src/utils/games/replay.ts` | Recap engine built; per-player "what happened while away" screen is planned. |
| **Identity** | Clerk (`userId`, username, first/last name) | Built. No user records in Mongo — names resolved on demand. Anything "profile"-shaped that isn't in Clerk metadata is net-new storage. |

The two big load-bearing facts for everything below:

1. **There is no realtime channel.** The only server→client push is FCM, and
   it's mostly used for *silent data messages that trigger a re-fetch*. Any
   "live" social feel has to be built on that same fetch-on-push pattern — no
   sockets.
2. **Friendship, the FCM event bus, and the invite flow are the three
   foundations.** Almost every feature below is a new event type, a new small
   model, or a new screen hung off one of these three. That's what keeps most
   of them *small*.

---

## 2. The features that matter (and why), by priority

Async platforms live or die on **re-engagement** (do people come back to take
their turn?) and **retention of the social graph** (do people have opponents
worth coming back for?). The features are ordered by how directly they serve
those two, tempered by cost.

### Tier 1 — Presence & re-engagement (highest value, mostly small)

These make an absent opponent feel present and pull players back into a game.
They lean almost entirely on infrastructure that already exists.

- **In-game messaging / turn notes.** A lightweight per-game message thread, or
  even just a one-line "note" attached to a turn ("nice roll!", "ugh"). This is
  the single most-requested social feature in async games (see: Words With
  Friends, Chess.com correspondence). It's what makes a 3-day-per-turn game feel
  like a conversation rather than a spreadsheet.
- **Reactions / nudges.** One-tap emoji reactions to a turn, and a "your move!"
  nudge that pings an opponent whose turn it is. Nudges directly attack the
  core async failure mode — stalled games — and are almost free given FCM.
- **Rich turn notifications.** Notifications that say *what happened*
  ("Sarah built the Amusement Park — one from winning") instead of a generic
  "your turn". Overlaps heavily with the planned recap event model; largely a
  matter of feeding better strings into the existing push.
- **Friends activity / "who to play" surface.** Use the *already-computed*
  last-action timestamp to show which friends are active, who you have no game
  with, and a one-tap rematch/invite. Turns the friends list from a roster into
  a launcher.

### Tier 2 — Identity & status (medium value, medium cost)

Give players something that's *theirs* and a reason to care about outcomes.

- **Player profiles.** A public profile: display name, avatar, games played,
  win/loss per game, current streak, "member since", maybe favourite game.
  Identity is the hook that makes friending and stats meaningful. Cost comes
  from needing a **new stats store** (Clerk metadata is the wrong place for
  aggregates).
- **Stats & head-to-head records.** Per-game and per-opponent W/L/D, longest
  streak, "you've beaten Tom 4–2 at Dice Cities". Head-to-head is a strong
  retention lever between friends.
- **Match history feed.** A personal list of finished games with result and
  opponents — the backbone that profiles and stats render from.

### Tier 3 — Community & competition (higher value ceiling, higher cost)

Worth it once the graph is dense enough to feed them; premature otherwise.

- **Leaderboards / ranked play (Elo-style).** Per-game rankings, seasons.
  High engagement ceiling, but needs a rating system, anti-abuse thinking, and
  a matchmaking story to be fair. Do *not* build before there's enough volume.
- **Tournaments / leagues.** Structured multi-game events. Big feature; a
  platform on top of the platform. Explicitly out of scope for early phases.
- **Spectating / sharing.** Read-only shared game links, "share result" cards.
  Cheap-to-medium and good for organic growth (a shared result is an invite).
- **Public / open matchmaking.** "Find me any opponent" for a game, rather than
  inviting a known friend. Solves the cold-start "I have no one to play"
  problem but introduces stranger-safety concerns (blocking, reporting, abuse).

### Cross-cutting: Safety & moderation

The moment players can send **free-text** to people who aren't already friends
(messaging + open matchmaking), you need **blocking, reporting, and profanity
handling**. This isn't optional and isn't free — it's a hard dependency for any
feature that opens a text channel to strangers. Friends-only messaging defers
most of this; open messaging does not.

---

## 3. Sizing — complexity, size & risk per feature

Scales are relative to this codebase. **Size** ≈ engineering effort (S = a
day-ish, M = a few days, L = a week+, XL = multi-week). **Complexity** = design
subtlety / number of moving parts. **Risk** = chance of touching load-bearing
invariants (the game engine, the serialisable registry, data-model migrations,
security) or shipping something users hate.

| Feature | Complexity | Size | Risk | Status | Primary reason for the rating |
|---|---|---|---|---|---|
| Reactions / nudges | Low | **S** | Low | ✓ Built | New FCM event + tiny append-only store or a counter. No engine contact. |
| Notification preferences | Low | **S** | Low | ✓ Built | Per-user channel toggles checked before push. Reduces notification spam. |
| Rich turn notifications | Low–Med | **S** | Low | Not started | Reuses the recap event model; only changes notification *strings*, not shapes. |
| Friends activity / rematch surface | Low | **S–M** | Low | Not started | Last-action data already aggregated; mostly a new screen + one query. |
| Match history feed | Low–Med | **M** | Med | ✓ Built | Durable `GameResult` record written on game-over. Survives game deletion. |
| Player profiles | Medium | **M** | Med | In progress | Profile page + stats read model built on `GameResult` store. Risk: privacy defaults. |
| In-game messaging (friends-only) | Medium | **M** | Med | Not started | New `Message` model, thread UI, unread state, new event. Risk: read/unread correctness, notification spam, light moderation. |
| Stats & head-to-head | Med–High | **M–L** | Med–High | **Aggregate store + write path on game-over.** Risk: correctness, back-fill, keeping it in sync as the source of truth is game docs. |
| Spectating / share links | Medium | **M** | Med | Read-only tokenised view + response shaping that leaks no private state. Risk: **authz** — must not expose hidden info (e.g. Smartthink secret code, opponents' hands). |
| Blocking / reporting / moderation | Med–High | **M–L** | High | Cross-cutting: touches messaging, invites, matchmaking, and every user-facing list. Risk: security + must be retrofitted everywhere at once. |
| Open / public matchmaking | High | **L** | High | Matchmaking queue + stranger safety (needs blocking/reporting first) + abuse vectors. |
| Leaderboards / ranked (Elo) | High | **L** | High | Rating math, seasons, fairness, anti-abuse, matchmaking interplay. Easy to get subtly wrong. |
| Tournaments / leagues | Very High | **XL** | High | A scheduling/bracket subsystem on top of everything else. Out of near-term scope. |

### The two structural costs that recur

Most of the risk on this board reduces to two questions the codebase currently
answers "no" to:

1. **"Where do aggregates and cross-game social data live?"** Today there is
   *no* user document in Mongo (identity is Clerk-only) and no finished-game
   record — stats would have to be recomputed from `GameData` every time. Every
   Tier-2/3 feature (profiles, stats, leaderboards, match history) wants a
   durable, indexed read model. **Introducing that store is the single biggest
   one-time cost**, and it should be designed once, deliberately, rather than
   grown per-feature. See §5.
2. **"How does content reach strangers safely?"** The instant free-text or
   game state flows to someone who isn't already a mutual friend, moderation
   and authz stop being optional. This gates messaging-to-strangers, share
   links, and open matchmaking.

Everything that avoids *both* of those (reactions, nudges, richer
notifications, friends-only messaging, the rematch surface) is genuinely small
and low-risk because it reuses the friendship graph and the FCM bus that
already exist.

---

## 4. Suggested phasing

Ordered to ship value early, defer remaining structural costs until justified,
and never open a stranger channel before moderation exists.

**Phase 0 — Presence wins (small, low risk, high felt value)** ✓ Mostly complete
Nudges ✓ → reactions ✓ → notification preferences ✓ → richer turn
notifications (to start) → friends activity/rematch surface (to start). The
first three are shipped and in use; the last two are highest-value next steps.
All ride existing FCM + friendship infra and have proven the best
value-to-cost ratio on the board. Structural foundation (`GameResult` +
`UserProfile`) now in place for Phase 2.

**Phase 1 — Conversation (friends-only) & richer notifications**
Next priorities: richer turn notifications (what actually happened in the game,
not "your turn"), in-game messaging between players already in a game together
(no stranger-safety dependency yet), and the friends activity / rematch surface.
Messaging adds unread state and a `NewMessage` event. Introduce *minimal*
moderation (report + block) as a forward investment, scoped to existing
relationships.

**Phase 2 — Identity & profiles** ✓ Foundation in place
On top of the `GameResult` + `UserProfile` foundation (§5 — now implemented):
match history feed ✓ → user profiles (in progress) → stats & head-to-head.
Profiles are the public identity face of the platform; completing them + stats
closes out Tier 2's core value proposition.

**Phase 3 — Reach & competition (only after moderation is real)**
Share/spectate links → open matchmaking → leaderboards/ranked. Each depends on
the moderation groundwork and the read model from earlier phases. Tournaments
remain out of scope until there's clear demand.

---

## 5. The one architectural decision to make deliberately

**Status: Implemented.** The structural foundation is in place:

- **`GameResult`** — Append-only record written **once, on game-over**, in the
  command pipeline's game-over branch (`src/app/api/game/command/route.ts`) and
  in the cron timeout path. Captures game ID, players, outcome, timestamp, and
  game-specific metadata. Survives game deletion and is cheap to aggregate.
- **`UserProfile`** — Document keyed by Clerk `userId` holding denormalised
  aggregates (games played, per-game W/L/D, streaks) plus profile prefs
  (privacy, favourite game). Updated incrementally on `GameResult` write, not
  recomputed on read. Clerk stays the identity source of truth; this is a
  *read model*, not a second identity store.
- **No back-fill needed** — `GameResult` records started from a known point; no
  migration required for existing games.

This means profiles, stats, head-to-head, and leaderboards are all thin readers
over the same store instead of four bespoke aggregations. Match history on
profiles and per-game W/L are already using this model; head-to-head and
leaderboards plug in the same way.

---

## 6. UI reuse notes

Per [`AGENTS.md`](../AGENTS.md), social UI must reuse the design system, not
grow a parallel one. Relevant existing pieces:

- `src/components/ui/` — `Avatar` (already deterministic-coloured via
  `src/utils/ui/avatar.ts`), `GameThumb`, `GameSetupLayout`.
- `src/utils/hooks/usePlayerList` — the invite picker; a "rematch" / "invite
  friend" flow should reuse it, not rebuild a user picker.
- `src/utils/ui/players.ts` — opponent summaries.
- `ag-*` classes in `src/app/ag-theme.css` for list rows, cards, pills, toggles
  — a message thread, reaction pills, a profile card, and a leaderboard row
  should all be composed from these tokens, not hand-styled.

New shared primitives worth extracting early (they'll each be used by more than
one feature): a **message-thread / activity-row** component, a **stat tile**
(profiles + head-to-head + leaderboards all want it), and a **presence/last-seen
badge** (friends list + profiles + player headers). Extract on the second use,
per the repo's "second copy is the signal" rule.

---

## 7. Open questions

- **Notification volume.** Messaging + reactions + nudges multiply push
  traffic. Need per-user preferences and sensible batching before Phase 1 ships
  broadly, or notifications become noise and get muted (killing the async loop).
- **Privacy defaults.** Are profiles/stats public, friends-only, or opt-in?
  This decision shapes the `UserProfile` schema and every read path — settle it
  before Phase 2.
- **Moderation depth.** Block+report is the floor. Do we need proactive
  profanity filtering / rate limiting before *friends-only* messaging, or only
  before *stranger* messaging? (Leaning: minimal for friends-only, mandatory
  for open matchmaking.)
- **Guest / not-yet-unlocked users.** The app has an access gate
  (`publicMetadata.unlocked`, `ARCHITECTURE.md` §10). Do social features respect
  it, and how do invites to not-yet-unlocked users behave?

---

## 8. TL;DR

- **Phase 0 is mostly complete.** Nudges ✓, reactions ✓, and notification
  preferences ✓ are shipped. Next: richer turn notifications and a friends
  "who to play" surface (both still S-sized, low-risk, reuse FCM + friendship
  graph).
- **Structural foundation is in.** `GameResult` (durable game-over record) and
  `UserProfile` (incremental aggregates) are built and running (§5). Match
  history is live; profiles are coming. Profiles, stats, head-to-head, and
  leaderboards all plug into this same store.
- **Messaging is the flagship Phase 1 feature** but crosses into moderation;
  do it friends-only first (within existing games) to defer stranger-safety.
  Introduce minimal reporting + blocking here as forward-looking investment.
- **Never open a text/state channel to strangers** (open messaging, share
  links, public matchmaking) before blocking + reporting are real and tested.
- **Highest-ceiling, highest-risk** features — ranked/Elo and tournaments —
  come last and only with real volume behind them.
