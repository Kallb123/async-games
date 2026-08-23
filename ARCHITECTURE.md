# Architecture

This document describes how **Async Games** is structured — the moving parts,
how a turn flows through the system, how games are modelled, and where to make
changes. It is aimed at contributors (human or AI) who need to understand the
codebase before touching it.

For day-to-day conventions and the component-reuse rules, see
[`AGENTS.md`](./AGENTS.md). For the turn-recap / planning subsystem in depth,
see [`docs/turn-recap-and-planning.md`](./docs/turn-recap-and-planning.md).

---

## 1. What the app is

Async Games is a portal for playing **turn-based games asynchronously** — you
take your turn whenever you like, the opponent is notified, and they take theirs
later. There is no live socket connection or shared session; the game lives in
the database, and each turn is a discrete authenticated HTTP request that mutates
persisted state and fans out push notifications.

Currently implemented games:

| Game | Slug (`url`) | Category | Players |
|---|---|---|---|
| Dice Cities | `dicecities` | Dice | 2–4 |
| Smartthink (Mastermind) | `smartthink` | Word/logic | 2–8 |
| Settlements & Cities (Catan-like) | `settlementsandcities` | Strategy | 3–4 (2–6 with expansions) |
| Snakes & Ladders | `snakesandladders` | Dice | 2–6 |
| Train Time | `traintime` | Strategy / Cards | 2–5 |

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | **Next.js 16** (App Router), React 19 |
| Language | TypeScript (strict) |
| Auth | **Clerk** (`@clerk/nextjs`) |
| Persistence | **MongoDB** via **Mongoose 9** |
| Push notifications | **Firebase Cloud Messaging** (client SDK + `firebase-admin`) |
| Styling | Custom `ag-*` design system (`src/app/ag-theme.css`) + Bootstrap 5 (legacy, in-game boards only) |
| Animation | `framer-motion` |
| Hosting | **Vercel** |
| Scheduled work | Vercel Cron (daily backstop) + external cron service (e.g. cron-job.org) hitting `/api/cron/turntimer` |

There is no separate backend service — everything runs inside Next.js. API
routes under `src/app/api/**` are the server; pages under `src/app/**` are the
client.

## 3. Repository layout

```
src/
├── app/                        # Next.js App Router: pages + API routes
│   ├── layout.tsx              # Root layout: ClerkProvider, global CSS, PWA meta
│   ├── page.tsx                # Home: the dashboard when signed in (my turn /
│   │                           #   their turn / invites), the public landing page when not
│   ├── ag-theme.css            # "Game Night" design system — tokens + ag-* classes
│   ├── globals.css
│   ├── login/  unlockaccess/  users/  profile/   # top-level screens
│   ├── newgame/                # game library + per-game setup screens
│   │   ├── page.tsx            # library grid
│   │   └── <game>/page.tsx     # one setup screen per game
│   ├── games/<game>/[gameid]/  # the live board screen for each game
│   └── api/                    # server endpoints (see §5, §6)
│       ├── game/               # taketurn, command, end, list endpoints, [gameid]
│       ├── newgame/<game>/     # create an invitation for a game
│       ├── invite/             # accept / cancel invites
│       ├── friends/            # friends system
│       ├── cron/turntimer/     # turn-timer enforcement (external cron target)
│       ├── notifyuser/  notificationtoken/       # push plumbing
│       └── dev/  unlock/  users/  utils/         # misc
│
├── components/                 # cross-game React components
│   ├── ui/                     # reusable presentational primitives (Avatar, GameThumb, …)
│   └── *.tsx                   # dashboard lists, providers, toasts, dev tools,
│                                #   TurnNavControls / GameHistoryList (game-agnostic)
│
├── games/<Game>/               # EVERYTHING about one game lives here
│   ├── <Game>Models.ts         # Mongoose discriminator + CreateGame + state builders
│   ├── apiModels.ts            # response/DTO interfaces sent to the client
│   ├── <Game>Logic.ts          # rules: the @serializable command classes + IGameType
│   ├── meta.ts                 # library/home-card metadata (name, art, accent, players)
│   ├── ui.ts                   # (optional) pure presentation helpers specific to this game
│   ├── components/             # board + action React components for this game
│   └── (board.ts / cards.ts …) # static game data
├── games/gameRegistry.test.ts   # asserts every game folder is wired into the
│                                #   shared files outside it (see §12)
│
├── utils/
│   ├── apiModels/              # the generic game engine (see §6) — game-agnostic only
│   │   ├── gameCommand.ts      # shared contracts: ICommandOutcome / IGameCommand / IGameType
│   │   ├── GameLogic.ts        # barrel: re-exports gameCommand + every game's <Game>Logic.ts
│   │   └── GameDataApi.ts      # shared response/DTO types + uuidString
│   ├── apiModels/games/serializableRegistry.test.ts  # asserts every @serializable class is wired
│   ├── mongodb/                # base schemas: GameData, InvitationData, FriendshipData, connection
│   ├── firebase/               # client app + admin SDK + push helper
│   ├── games/                  # cross-game helpers: DiceRoll, TurnTimer, replay engine
│   ├── hooks/                  # usePlayerList, useFcmToken, useTurnNavigation
│   └── ui/                     # cross-game glue only: games.ts (aggregates each game's
│                                #   meta.ts into one lookup), avatar.ts, players.ts
│
└── middleware.ts               # Clerk auth middleware
```

One thing is worth internalising about this layout: **`src/games/<Game>/` is the
single home for a game** — domain/persistence (Mongoose models, DTO shapes,
static data), rules (the command/game-type classes), and presentation (board +
action components, per-game UI helpers, library metadata) all live in one
folder. This is deliberate: the previous layout spread one game's code across
`src/games/<Game>/`, `src/components/games/<Game>/`, and
`src/utils/apiModels/games/<Game>Logic.ts`, so adding or understanding a game
meant touching three unrelated trees. `src/components/` and `src/utils/`
now hold only what's genuinely cross-game — shared primitives, the
game-agnostic engine, and small aggregator files that stitch each game's own
exports (its rules module, its metadata) into one barrel/lookup. Next.js App
Router still requires `page.tsx`/`route.ts` files to live at fixed paths under
`src/app/**`, so those remain thin screens that import their game's
components/helpers from `src/games/<Game>/` rather than owning any game logic
themselves.
- **`src/utils/apiModels/` is the engine.** Game *rules* live in `GameLogic.ts`
  as command classes; everything else composes them.

## 4. Core concept: async turns

There is no realtime connection. The lifecycle of a game is:

```
Invite ──► (all accept) ──► Game created ──► [ turn ─► turn ─► turn … ] ──► Game over
```

1. **Invite.** A player creates an invitation (`POST /api/newgame/<game>`), which
   persists an `Invitation` discriminator document and pushes a notification to
   the invitees.
2. **Accept.** Each invitee accepts (`POST /api/invite/accept`). When *everyone*
   has accepted, the route hands the invitation to
   `startGameFromInvitation()` (`src/utils/games/startGame.ts`): the
   invitation's `CreateGame()` builds the initial game document (rolling for
   turn order, seeding the initial state), the game's discriminator model —
   looked up in `GAME_DATA_MODELS` — is saved, the invitation is deleted, and a
   `GameStart` push goes out (plus the opening `YourTurn` push, unless the
   player who triggered the start is the one up first). That helper is the
   single game-start path, so any future route that starts a game shares it.
3. **Play.** On each turn the active player submits a **command**
   (`POST /api/game/command`). The server validates it's their turn, executes the
   command against the persisted game, checks for game-over / end-of-turn,
   persists, and notifies the next player (see §6).
4. **Timeout.** If a player doesn't move within their game's turn timer, the cron
   job advances the turn for them (see §7).

The client is largely a **thin renderer**: it fetches game state
(`GET /api/game/[gameid]`), renders the board, submits commands, and refreshes
when a push notification event arrives (foreground events are re-dispatched as
`window` `CustomEvent`s, see §8).

## 5. Data model & persistence

### Connection

`src/utils/mongodb/mongodb.ts` exposes `dbConnect()`, which caches the Mongoose
connection on `global` (so hot-reload / serverless invocations reuse one
connection). Every API route calls `await dbConnect()` before touching the DB.

`src/utils/mongodb/mongodb.ts` also defines `GAME_DATA_MODELS` and
`INVITATION_MODELS`, module-scope `Record`s mapping every game's discriminator
key to its model (`gameDataModelFor(gameType)` / `invitationModelFor(gameType)`
look one up). Importing this file evaluates those records, which is what
registers the discriminators with Mongoose. The discriminator key unions
double as a **compile-time exhaustiveness check** — add a game to the union
but forget to wire its model and TypeScript fails the build.

### Mongoose discriminators

Games and invitations share a base schema and specialise via Mongoose
[discriminators](https://mongoosejs.com/docs/discriminators.html):

- **`GameData`** (`src/utils/mongodb/GameData.ts`) is the base game document.
  Each game defines `<Game>GameDataModel = GameDataModel.discriminator(...)` in
  its `Models.ts`, adding a game-specific `specificGameState` sub-schema.
- **`Invitation`** (`src/utils/mongodb/InvitationData.ts`) is the base invite.
  Each game defines `<Game>InvitationModel` with a `CreateGame()` method that
  produces the initial `IGameData`.
- **`Friendship`** (`src/utils/mongodb/FriendshipData.ts`) is a flat
  requester/recipient/accepted record — no discriminator.

The base `IGameData` shape:

```ts
interface IGameData {
    gameId: uuidString;
    gameType: IGameType;              // { gameType, friendlyName, url, className, … }
    userIdList: string[];            // Clerk user IDs of all players
    turnTimer: string;               // '10m' | '1h' | '1d' | … (see TurnTimer.ts)
    currentTurn: string;             // Clerk user ID whose turn it is ("" when over)
    lastTurnTimestamp: string;       // ISO — when the current turn started
    timerWarningNotificationSent: boolean;
    gameState: {
        turnOrder: string[];         // user IDs, decided at creation
        history: string[];           // newest-first human-readable log
        commandHistory: IGameCommand[]; // every move, stored as Schema.Types.Mixed
    };
    complete: boolean;
    winner: string;                  // winning user ID
}
```

Key modelling decisions:

- **`commandHistory` stores the full move log** as loosely-typed `Mixed`
  documents. Combined with the serialisable command registry (§6), this makes the
  game *replayable* from scratch — the basis of turn recap / planning (§9).
- **`specificGameState` is per-game** and only exists on the discriminator. The
  base engine never reads it; only the game's own command classes and its
  `gameStateToModel` converter do.
- **State is a single mutable snapshot.** Commands mutate `specificGameState` in
  place; the game does *not* keep a board-per-turn. Per-turn boards are
  reconstructed by replay when needed.
- **User identity is never stored beyond a Clerk `userId`.** Usernames are
  resolved on demand via `src/utils/users/clerk.ts` helpers
  (`userIdListToUsernameList/Map`) when building responses.

### Response shaping

Documents are never sent raw to the client. `CreateResponse()` (list summary) and
`CreateDataResponse()` (full game) methods convert a document into a DTO: they
resolve usernames via Clerk and run the game's `gameStateToModel` to turn
internal Maps/IDs into a client-friendly, username-keyed shape. DTO interfaces
live in `src/utils/apiModels/GameDataApi.ts` and each game's `apiModels.ts`.

### Match results (`GameResult`)

`src/utils/mongodb/GameResultData.ts` defines a small, flat **`GameResult`**
model — the durable read model behind future match statistics (win/lose/draw,
head-to-head) on profile pages, per `docs/social-features.md` §5. It is *not*
a discriminator: unlike `GameData`, it's cross-game, and the base engine never
reads it back.

```ts
interface IGameResultData {
    gameId: uuidString;
    gameType: string;    // gameData.gameType.gameType, e.g. "DiceCities"
    url: string;         // gameData.gameType.url, e.g. "dicecities"
    playerIds: string[]; // gameData.userIdList
    winner: string;      // gameData.winner; "" means draw / no winner
    endedAt: string;     // ISO, when the record was written
}
```

Key properties:

- **Append-only.** One record is written per finished game, via
  `recordGameResult(gameData)`, and never updated afterwards. Because it's a
  separate collection from `GameData`, match history/stats survive deletion of
  the underlying game.
- **Written once, from every place a game currently becomes `complete`:**
  the command pipeline's game-over branch (§6, step 8) and the manual
  surrender endpoint (`POST /api/game/end`). It is *not* yet written from the
  turn-timer cron job (§7) — that job only advances an expired turn today and
  has no branch that marks a game complete, so there's nothing to hook into
  until a forfeit-on-timeout feature exists.
- **Idempotent on `gameId`.** The schema has a unique index on `gameId`;
  `recordGameResult` swallows the resulting duplicate-key error, so calling it
  twice for the same game (e.g. a retried request) is a no-op rather than a
  second record.
- **Indexed for the two read patterns stats need**, both keyed off the
  multikey `playerIds` array:
  - `{ playerIds: 1, endedAt: -1 }` — "my match history", most recent first,
    and the basis for per-player win/lose/draw aggregation (derived from
    `winner` — no separate per-player result field is stored).
  - `{ playerIds: 1, gameType: 1 }` — per-game stats for a player, and
    head-to-head lookups between two players via `playerIds: { $all: [A, B] }`.

## 6. The game engine: command pattern

Game rules are expressed as classes implementing two interfaces. The two
interfaces themselves live in `src/utils/apiModels/gameCommand.ts`; each game's
rule classes live alongside the rest of that game, in its own
`src/games/<Game>/<Game>Logic.ts` (`DiceCitiesLogic.ts`, `SmartthinkLogic.ts`,
`SnakesAndLaddersLogic.ts`, `SettlementsAndCitiesLogic.ts`).
`src/utils/apiModels/GameLogic.ts` is a **barrel** that re-exports the shared
contracts plus every game's rules module, so the rest of the app imports rules
from that one path regardless of which game they belong to.

### `IGameCommand` — a single move

```ts
interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    senderId: string;        // who played it
    senderUsername: string;
    readonly className: string;

    myString(): string;                                   // human summary (for history/logs)
    Execute(gameData: IGameData): Promise<ICommandOutcome>; // validate + mutate state
    Undo(gameData: IGameData): void;                      // (partially implemented)
}
```

`Execute` is the heart of the rules. It **validates** the move against current
state and returns `{ validMove: false }` if illegal (nothing is mutated), or
mutates `specificGameState`, appends to `gameState.history`, and returns
`{ validMove: true, turnOver: bool }`. Subclasses extend `ICommandOutcome` to
carry extra data back to the client (e.g. dice results, Mastermind peg feedback).

Examples: `SnakesAndLaddersRequestDiceRoll`, `DiceCitiesRequestCardPurchase`,
`SmartthinkSubmitGuess`, `SACBuildSettlement`.

### `IGameType` — per-game turn/end rules

```ts
interface IGameType {
    gameType: string; friendlyName: string; url: string; readonly className: string;
    CheckEndTurn(gameData, commandOutcome): void;   // decide/advance whose turn is next
    CheckGameOver(gameData): boolean;               // set complete/winner if finished
}
```

`CheckEndTurn` typically advances `currentTurn` around `turnOrder`, but games can
override the flow (e.g. Smartthink hands the turn permanently to the codebreaker
once the secret code is set).

### Serialisation registry

Commands and game types cross the wire and the DB as JSON, but must be rehydrated
back into real class instances (so `Execute`/`CheckEndTurn` can run). This is
handled by `src/utils/apiModels/Serialisable.ts`:

- The `@serializable` decorator registers each class by its `className`.
- `deserializeJSON(json)` is `JSON.parse` with a reviver that, whenever it sees an
  object with a registered `className`, constructs the real class instance and
  copies the properties in.

Every command / game-type class is annotated `@serializable`. This is what makes
the loosely-typed `commandHistory` and `gameType` documents executable again.

Because the decorator runs on **module load**, a game's rule module must actually
be imported for its classes to register — the barrel's `export *` lines do that,
and importing anything from `GameLogic.ts` therefore populates the whole registry.
A class that is defined but never wired in (its module missing from the barrel, or
its class missing from the command route's `registration` array) can't be
rehydrated, and would silently fail to replay or execute. That invariant is guarded
by a test — `src/utils/apiModels/games/serializableRegistry.test.ts` scans the
source for every `@serializable` class and asserts each one is registered after
importing the barrel and referenced by the command route (see §13).

### The command pipeline (`POST /api/game/command`)

`src/app/api/game/command/route.ts` is the single entry point for all moves,
regardless of game:

```
1. deserializeJSON(request body)          → a real IGameCommand instance
2. auth() — must be signed in
3. load game by gameId
4. guard: userId === gameData.currentTurn  (it's your turn)
   guard: userId === command.senderId      (not acting for someone else)
5. outcome = await command.Execute(gameData)
   └─ if !outcome.validMove → 401
6. push command onto gameState.commandHistory (markModified)
7. gameType = deserializeJSON(gameData.gameType)
8. if gameType.CheckGameOver(gameData):  save, record GameResult, push win/lose
   notifications, return
9. gameType.CheckEndTurn(gameData, outcome)
10. if turnOver: bump lastTurnTimestamp, reset warning flag
11. save
12. if turnOver: push 'YourTurn' to the next player
13. return { outcome, gameData: CreateDataResponse() }
```

The route imports and instantiates every command/game-type class once (the
`registration` array) purely to ensure the `@serializable` registry is populated
before deserialising the incoming body.

> **The engine is game-agnostic.** The command route, the replay engine, and the
> cron job never branch on game type — they call `Execute` / `CheckEndTurn` /
> `CheckGameOver` polymorphically. Game-specific logic is confined to the command
> classes and each game's `Models.ts`.

## 7. Turn timer & cron

`src/utils/games/TurnTimer.ts` defines the timer buckets (`10m` … `7d`) and pure
helpers: `isExpired`, `isWarningThreshold` (fires at 20% remaining, min 5 min),
and `formatRemainingTime`. The client-facing `formatRemainingTimeShort` takes the
current time as an argument instead of reading the clock — see §11 on `useNow`.

`GET /api/cron/turntimer` (`src/app/api/cron/turntimer/route.ts`) is the
enforcement job. It:

- authenticates via `Authorization: Bearer $CRON_SECRET`,
- loads all `complete: false` games, and for each:
  - if the turn is **expired**, advances `currentTurn`, resets the timer and
    sends a `YourTurn` push to the new player;
  - else if within the **warning window** and not yet warned, sends a
    `TurnExpiringSoon` push and sets `timerWarningNotificationSent`.
- returns `{ processed, expired, warned }`.

**Why external cron:** Vercel Hobby limits crons to once/day, so `vercel.json`
registers only a daily backstop (`0 0 * * *`). For sub-day timers, an external
scheduler (e.g. cron-job.org) is configured to hit the endpoint every ~15 minutes
with the `CRON_SECRET` bearer header. See the README for setup.

## 8. Push notifications (Firebase Cloud Messaging)

Push is the mechanism that makes async play feel live.

**Server → device.** `src/utils/firebase/pushNotification.ts` exposes
`sendPushToUsers(users, data, notification?)`. It collects each user's stored FCM
tokens (from Clerk `privateMetadata.notificationTokens`) and sends via
`firebase-admin`. `data` always carries an `event` field; omitting `notification`
sends a **silent data-only** message used to refresh client state. The admin SDK
is initialised in `src/utils/firebase/adminFirebase.ts` from `FIREBASE_*` env
vars.

**What the pushes say.** Every piece of user-visible push copy is built by
`src/utils/firebase/notificationContent.ts`, never written inline at the call
site — three routes can hand a player their turn and five can invite them to a
game, so copy written per-route drifts. The "your move" body describes *what
actually happened* by reusing the recap engine (§9): it replays the game, takes
the events the player missed, and leads with the most recent one ("🪜 Priya
rolled 3, climbed a ladder"), falling back to the newest `gameState.history`
line for games with no recap adapter and to a generic prompt for games with no
history yet. Because these builders run *after* the turn has been saved, a
recap failure is caught and downgraded — it can cost a nicer sentence, never
the move. Notification artwork comes from `gameNotificationImage`, which reads
the game's own `meta.ts`, so a push can never carry another game's icon.

**Token registration.** On the client, `useFcmToken` (`src/utils/hooks/`) requests
notification permission, gets an FCM token, and POSTs it to
`/api/notificationtoken`, which stores it in the user's Clerk private metadata.
Each stored token (`TimedToken`) keeps the time it was first registered
(`timestamp`), the last time that device re-registered (`lastSeen`), and a
`device` summary parsed from the request's user-agent header by
`src/utils/firebase/deviceInfo.ts`.

**Device management.** The same route also serves `GET` (list the user's
devices — id, name, type and timestamps, never the raw token) and `DELETE`
(unregister one device by id). Devices are identified to the client by
`deviceIdForToken`, the token's last 12 characters, so tokens never leave the
server. `NotificationDeviceList` renders the list on the settings page and lets
a player remove a device; that device stops receiving pushes until it next
opens the app and re-registers. Reading/writing the stored list lives in
`deviceTokens.ts` (server-only, touches Clerk); `deviceInfo.ts` stays pure so
the client can import it too.

**Forgetting revoked devices.** Every send is a liveness check: `sendEach`
returns a per-token result, and `sendPushToUsers` feeds it to
`deadTokensByUser` (`revokedTokens.ts`), which picks out only the codes that mean the token is gone
for good (app uninstalled, permission revoked, token rotated) and drops those
registrations. Transient failures and payload errors never cost a player a
device. Cleanup errors are logged, never thrown — the push has already gone.

**Forgetting old devices.** `pruneStaleTokens` drops registrations unused for
`STALE_DEVICE_DAYS` (90). It runs on every registration, and nightly for
everyone via the `/api/cron/staledevices` cron (`vercel.json`, same
`CRON_SECRET` bearer auth as the turn timer), which pages through Clerk users
and rewrites only the metadata that actually changed.

**Device → UI.**
- *Background:* `public/firebase-messaging-sw.js` (a service worker) shows OS
  notifications and handles clicks.
- *Foreground:* `FcmTokenComp` (`src/components/FirebaseForeground.tsx`) listens
  with `onMessage` and re-dispatches each push as a `window` `CustomEvent` named
  after its `event` field. Game pages listen for events like `YourTurn` and
  re-fetch game state — this is how a board updates without a socket.

Common event names: `NewInvite`, `InviteAccepted`, `GameStart`, `YourTurn`,
`TurnExpiringSoon`, `GameOver`. `YourTurn` is also sent when a game starts, to
whoever won the roll for turn order — everyone else just gets the silent
`GameStart` refresh.

**No silent pushes on the turn path.** `TurnTaken` and `TurnExpired` were once
sent to every player carrying no notification, purely to drive a refetch. WebKit
revokes a push subscription after three pushes that display nothing, so on iOS
they cost players their notifications within a few turns of installing. They
were removed: a tab coming back to the foreground refetches via
`usePushEvents`' `refreshOnVisible`, and a board being watched live polls via
its `pollWhileWatching` (see `useGameData`) — every 10s, only while the tab is in
the foreground and only within 10 minutes of the viewer last interacting, so a
forgotten tab stops on its own. Prefer either over adding a new silent push.

## 9. Turn recap & planning (replay engine)

Because state is a single mutable snapshot, per-turn boards don't exist — they are
**recomputed by replaying `commandHistory`** from a fresh initial state.
`src/utils/games/replay.ts`'s `buildTimeline()` mirrors the command pipeline
(`Execute → CheckGameOver → CheckEndTurn`) but never persists or notifies,
producing an array of per-turn snapshots. Planning appends hypothetical commands
on top of the real history using the same engine.

Determinism is preserved by **recording RNG outcomes** into the command the first
time it executes (e.g. `recordedRoll`), so replays reproduce the original result.
Per-game `IReplayAdapter`s supply the deterministic initial state and the
response-shape converter.

This subsystem — including per-game support status and how to add recap to a new
game — is documented fully in
[`docs/turn-recap-and-planning.md`](./docs/turn-recap-and-planning.md).

## 10. Auth & access gating

- **Clerk** provides authentication. `src/middleware.ts` wraps the app in
  `clerkMiddleware()`; the root layout wraps everything in `<ClerkProvider>`.
- API routes read the session with `await auth()` / `currentUser()` from
  `@clerk/nextjs/server` and reject unauthenticated requests.
- **Access gating.** Beyond sign-in, the app checks `user.publicMetadata.unlocked`.
  Pages redirect users to `/login` if signed out and `/unlockaccess` if not
  unlocked. `/unlockaccess` posts an `ACCESS_PASSWORD` to `/api/unlock` to flip
  the flag — an optional invite-only gate.
- **The public landing page** is the one exception to the first redirect: `/`
  mounts `useAuthGuard({ allowSignedOut: true })`, so a visitor with no account
  gets `components/Landing.tsx` — the pitch, plus the same `GameLibrary` browser
  the signed-in library uses, pointed at sign-up — instead of a bounce to
  `/login`. Locked-out accounts still go to `/unlockaccess`.
- User records themselves live in **Clerk**, not MongoDB. The app only stores
  Clerk `userId`s and resolves display names on demand.

## 11. Frontend structure & design system

The app is a **mobile-first PWA** (`public/manifest.json`, PWA meta in the root
layout) rendered inside a centred `.ag-app` column.

- **Screens** live under `src/app/**/page.tsx` and are mostly client components
  (`'use client'`) that fetch from the API and render. A typical game page (e.g.
  `src/app/games/snakesandladders/[gameid]/page.tsx`) fetches game data, renders
  the board + an action panel, submits commands via `/api/game/command`, and
  re-fetches on `YourTurn` events. It also wires in `useTurnNavigation` +
  `TurnNavControls` for recap/planning.
- **Design system.** UI was moved off stock Bootstrap onto a small custom
  system — the `ag-*` classes and CSS custom-property tokens in
  `src/app/ag-theme.css` (warm cream + terracotta, Bricolage Grotesque). Bootstrap
  remains a dependency and is still used for the in-game board screens only. Clerk's in-app components are themed from the same tokens via
  `src/utils/ui/clerkAppearance.ts`; Clerk's *emails* can't read them at all and
  are covered by [`docs/email-theme.md`](./docs/email-theme.md).
- **Brand mark.** The "clock die" — four pips at 12, 3, 6 and 9, the brass one
  marking the seat in play. `scripts/generate-icons.mjs` (`npm run icons`) is
  the only place it is drawn: it emits the favicon, the iOS icon, the PWA and
  tile icons, the share card, and `public/icons/icon.svg`, which is the copy
  `Brand` puts on screen. Edit the mark there and re-run the script rather
  than hand-editing any of the assets.
- **Reusable pieces** (this is the most important contribution rule — see
  `AGENTS.md`):
  - `src/components/ui/` — presentational primitives (`Brand`, `Avatar`,
    `GameThumb`, `TurnTimerSelect`, `GameSetupLayout`, `GameLibrary`).
  - `src/utils/ui/` — pure helpers: `games.ts` (per-game metadata: name, art,
    accent, players), `avatar.ts`, `players.ts`.
  - `src/utils/hooks/` — shared stateful logic (`usePlayerList`, the invite
    picker; `useTurnNavigation`; `useNow`/`useNowToTheMinute`, the shared clock).
- **Reading the clock.** Components never call `Date.now()` while rendering — not
  even inside a helper, where `react-hooks/purity` can't see it. `useNow`
  (`src/utils/hooks/useNow.ts`) reads the wall clock as the external source it is
  via `useSyncExternalStore`, off one shared ticker, and returns `null` until
  hydration (the server's reading is already stale by the time the client paints).
  Pass that value into the pure formatters — `formatRelativeTime`,
  `formatRemainingTimeShort` — which render no label for a `null` now.
  `useNowToTheMinute` is the same clock at minute resolution, so lists of
  "14h ago"/"1h left" labels don't re-render every second.
- **Game metadata** (`src/utils/ui/games.ts`) is the single source of truth for a
  game's name, slug, art, accent colour, and player count across the library,
  home cards, and setup headers.

## 12. Adding a new game

The engine is designed so a new game is additive, and everything about it lives
in one new folder, `src/games/<Game>/`. Roughly:

> For a step-by-step checklist plus the practical gotchas (Mongoose `Mixed`
> field tracking, wiring a solo game through the invite/accept engine,
> isomorphic client/server rules modules, avoiding leaking hidden state over
> the wire), see [`docs/new-game.md`](./docs/new-game.md).

1. **Domain layer** — in `src/games/<Game>/`:
   - `<Game>Models.ts`: the `GameDataModel.discriminator` with a
     `specificGameState` sub-schema; the `InvitationModel.discriminator` with a
     `CreateGame()` that rolls turn order and seeds initial state; a
     `buildInitial<Game>State()` (reused by `CreateGame` *and* the replay
     adapter); and a `gameStateToModel()` response converter.
   - `apiModels.ts`: the response/DTO interfaces.
   - static data files as needed (`board.ts`, `cards.ts`, …).
2. **Rules** — add `src/games/<Game>/<Game>Logic.ts`: a `@serializable
   <Game>GameType implements IGameType` and one `@serializable` command class per
   move type, each `implements IGameCommand` (import the shared interfaces from
   `@/utils/apiModels/gameCommand`). Then add an
   `export * from "@/games/<Game>/<Game>Logic";` line to the
   `src/utils/apiModels/GameLogic.ts` barrel so the new classes register and stay
   importable from the usual `@/utils/apiModels/GameLogic` path.
3. **Register** the discriminator keys/models in
   `src/utils/mongodb/mongodb.ts` (the typed unions enforce this at compile time),
   and add the new command/type instances to the `registration` array in
   `src/app/api/game/command/route.ts`.
4. **Wire invite creation** — a `POST /api/newgame/<game>` route. Acceptance
   needs nothing: `startGameFromInvitation()` finds the game's model in
   `GAME_DATA_MODELS`, which step 3 already filled in.
5. **UI** — board/action components under `src/games/<Game>/components/` and
   (if the game needs bespoke rendering helpers) a `src/games/<Game>/ui.ts`;
   a `meta.ts` in the same folder with the library-card metadata, wired into
   `src/utils/ui/games.ts`'s `GAME_META` aggregator with one import + one line.
   The actual routed screens stay thin: a setup screen under
   `src/app/newgame/<game>/` and a board screen under
   `src/app/games/<game>/[gameid]/` that just import from `src/games/<Game>/`
   (App Router requires `page.tsx` to live under `src/app/**`, so these can't
   move into the game folder themselves). Reuse `GameSetupLayout`,
   `UserInviteList`, and `TurnTimerSelect` for setup.
6. *(Optional)* Add a replay `IReplayAdapter` for turn recap — see
   `docs/turn-recap-and-planning.md`.

### One-liners outside the game folder — and what guards each

Steps 2–5 above each add a single line to a shared file *outside*
`src/games/<Game>/`. Every one of them is enforced by an automated test, so a
game folder that's missing one fails CI instead of breaking silently at
runtime:

| Shared file | What to add | Guarded by |
|---|---|---|
| `src/utils/apiModels/GameLogic.ts` | `export * from "@/games/<Game>/<Game>Logic";` | `src/games/gameRegistry.test.ts` ("wires every game's rules module into the GameLogic barrel"); the classes it exports are additionally checked by `serializableRegistry.test.ts` |
| `src/utils/mongodb/mongodb.ts` | the discriminator key in both union types, and the model in both records (`GAME_DATA_MODELS` and `INVITATION_MODELS`) | TypeScript (the typed `Record`s are a compile-time exhaustiveness check) **and** `src/games/gameRegistry.test.ts` ("registers every game's Mongoose discriminator models") |
| `src/app/api/game/command/route.ts` | every command/game-type instance in the `registration` array | `serializableRegistry.test.ts` ("wires every command/game-type class into the command route's registration array") |
| `src/utils/ui/games.ts` | import the game's `meta.ts` and add it to `GAME_META` | `src/games/gameRegistry.test.ts` ("wires every game's metadata into GAME_META") |

`src/games/gameRegistry.test.ts` discovers games the same way
`serializableRegistry.test.ts` discovers `@serializable` classes: by scanning,
not a hand-maintained list (here, every subfolder of `src/games/` that has a
`meta.ts`), so a new game folder is picked up automatically and any missing
one-liner fails with a message naming the exact file and line to add.

## 13. Deployment, environment & CI

- **Hosting:** Vercel. `next.config.mjs` enables production browser source maps;
  `vercel.json` registers the daily cron backstop.
- **Node version:** 24 everywhere — `engines.node` in `package.json` (which is
  what Vercel builds with), `node-version` in the CI workflow, and the dev
  container's base image. Vercel's own **Node.js Version** project setting lives
  in the dashboard rather than the repo, so it has to be set to 24.x there too.
- **Environment variables** (see `.env.example`): `MONGODB_URI`; Clerk
  (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, injected via the Clerk
  Vercel integration); Firebase Admin (`FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`); `CRON_SECRET`; and optional
  `ACCESS_PASSWORD`. The Firebase **client** config (in
  `src/utils/firebase/firebase.ts` and the service worker) is public by design.
- **Environments:** production and preview/local each get their own **Clerk
  instance** *and* their own **MongoDB database**, and the two must split
  together. Clerk instances don't share a userbase, and Mongo stores nothing but
  Clerk `userId`s (§9), so a database shared across instances holds games whose
  players don't resolve — and the production turn-timer cron sweeps *every*
  unfinished game it can see, including a dev instance's. `dbConnect()` takes the
  database name straight from `MONGODB_URI`, so the split is one URI segment on
  one Atlas cluster, not a second cluster.
  [`docs/environments.md`](./docs/environments.md) has the full variable split
  and the Clerk production cut-over.
- **CI** (`.github/workflows/ci.yml`): on push/PR to `main`, runs
  `npx tsc --noEmit` (type check), `npm test` (Vitest), and `npx next build`. All
  must pass before merge. Locally, run `npm run build`, `npx tsc --noEmit`, and
  `npm test` before committing — the type checker, build, and test suite are the
  safety net.
- **Tests** run on [Vitest](https://vitest.dev) (`npm test`). The suite is
  deliberately small, and both tests in it work the same way — scan the source
  for what should exist per game, then assert every shared file that should
  reference it does — so a new game is checked automatically with no
  hand-maintained list to keep in sync:
  - `src/utils/apiModels/games/serializableRegistry.test.ts` guards the
    serialisation registry (§6) — it scans the source for every `@serializable`
    class and asserts each is registered when the `GameLogic` barrel is imported
    and wired into the command route, so a game whose rules module is never
    imported fails CI instead of breaking at runtime.
  - `src/games/gameRegistry.test.ts` guards the other one-line registrations a
    new game needs outside its own folder (§12): the `GameLogic` barrel export,
    `mongodb.ts`'s discriminator models, the invite-accept route's game-start
    branch, and `games.ts`'s `GAME_META` entry. It discovers games by scanning
    `src/games/` for folders with a `meta.ts`, so a new game folder missing any
    of these fails CI with a message naming the exact file to edit.

## 14. Data flow at a glance

```
                 ┌─────────────┐        push (FCM)        ┌─────────────┐
                 │   Clerk     │◄──── userId ⇄ username ──►│  API routes │
                 │  (identity) │                           │ (Next.js)   │
                 └─────────────┘                           └──────┬──────┘
                                                                  │ dbConnect()
  Browser (React)                                                 ▼
  ┌────────────────┐   POST /api/game/command   ┌──────────────────────────┐
  │ game page      │ ─────────────────────────► │ command.Execute(gameData)│
  │  render board  │                            │ CheckGameOver/CheckEndTurn│
  │  submit command│ ◄───────────────────────── │  save + notify next player│
  └──────┬─────────┘   { outcome, gameData }    └────────────┬─────────────┘
         │  onMessage(YourTurn) → re-fetch                   │  Mongoose
         │                                                   ▼
         │                                          ┌──────────────────┐
         └──────── GET /api/game/[gameid] ────────► │ MongoDB          │
                                                    │  GameData (+disc) │
   ┌──────────────────────────┐  every ~15 min     │  Invitation       │
   │ external cron ──► /cron/  │ ─────────────────► │  Friendship       │
   │  turntimer (advance turns)│                    └──────────────────┘
   └──────────────────────────┘
```

## 15. Related docs

- [`AGENTS.md`](./AGENTS.md) — contribution conventions and the component-reuse rules.
- [`docs/new-game.md`](./docs/new-game.md) — step-by-step checklist for adding a new game, plus practical gotchas.
- [`docs/turn-recap-and-planning.md`](./docs/turn-recap-and-planning.md) — the replay engine in depth.
- [`docs/profile-pictures.md`](./docs/profile-pictures.md) — how a player's avatar is resolved, and the roadmap for uploads/unlockables.
- [`docs/account-less-play.md`](./docs/account-less-play.md) — plan for Jackbox-style join-by-code lobbies and guest players: what the five identity choke points cost, and the commit-by-commit build order.
- [`docs/games/`](./docs/games/) — per-game rules notes (Smartthink, Settlements & Cities).
- [`docs/environments.md`](./docs/environments.md) — the dev/production split (Clerk instances, databases, env vars) and how to take Clerk to production.
- [`docs/email-theme.md`](./docs/email-theme.md) — the design system restated for email (hex palette, type, table-based components), for styling Clerk's transactional emails.
- [`docs/deployment.png`](./docs/deployment.png) — deployment diagram.
- [`README.md`](./README.md) — getting started, env vars, and cron setup.
</content>
