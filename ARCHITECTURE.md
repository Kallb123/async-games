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
│   ├── page.tsx                # Home dashboard (my turn / their turn / invites)
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
├── components/                 # React components
│   ├── ui/                     # reusable presentational primitives (Avatar, GameThumb, …)
│   ├── games/<Game>/           # per-game board + action components
│   └── *.tsx                   # dashboard lists, providers, toasts, dev tools
│
├── games/<Game>/               # per-game DOMAIN layer (persistence + wire shapes)
│   ├── <Game>Models.ts         # Mongoose discriminator + CreateGame + state builders
│   ├── apiModels.ts            # response/DTO interfaces sent to the client
│   └── (board.ts / cards.ts …) # static game data
│
├── utils/
│   ├── apiModels/              # the generic game engine (see §6)
│   │   ├── gameCommand.ts      # shared contracts: ICommandOutcome / IGameCommand / IGameType
│   │   ├── GameLogic.ts        # barrel: re-exports gameCommand + every game's rules module
│   │   ├── games/              # per-game rules (one module per game)
│   │   │   ├── DiceCitiesLogic.ts
│   │   │   ├── SmartthinkLogic.ts
│   │   │   ├── SnakesAndLaddersLogic.ts
│   │   │   ├── SettlementsAndCitiesLogic.ts
│   │   │   └── serializableRegistry.test.ts  # asserts every @serializable class is wired
│   │   ├── GameDataApi.ts      # shared response/DTO types + uuidString
│   │   └── Serialisable.ts     # @serializable registry + deserializeJSON reviver
│   ├── mongodb/                # base schemas: GameData, InvitationData, FriendshipData, connection
│   ├── firebase/               # client app + admin SDK + push helper
│   ├── games/                  # cross-game helpers: DiceRoll, TurnTimer, replay engine
│   ├── hooks/                  # usePlayerList, useFcmToken, useTurnNavigation
│   └── ui/                     # pure presentation helpers: games.ts, avatar.ts, players.ts
│
└── middleware.ts               # Clerk auth middleware
```

Two things are worth internalising about this layout:

- **`src/games/<Game>/` vs `src/components/games/<Game>/`** — the former is the
  *domain/persistence* layer (Mongoose models, DTO shapes, static data); the
  latter is the *presentation* layer (React board + action panels). They are kept
  separate on purpose.
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
   has accepted, the invitation's `CreateGame()` builds the initial game document
   (rolling for turn order, seeding the initial state), the correct game
   discriminator model is saved, the invitation is deleted, and a `GameStart`
   push goes out.
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

`dbConnect()` also calls `initialiseDiscriminators()`, which *references* every
game's discriminator model so Mongoose has registered them. The discriminator
key unions there double as a **compile-time exhaustiveness check** — add a game
to the union but forget to wire its model and TypeScript fails the build.

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

## 6. The game engine: command pattern

Game rules are expressed as classes implementing two interfaces. The two
interfaces themselves live in `src/utils/apiModels/gameCommand.ts`; each game's
rule classes live in its own module under `src/utils/apiModels/games/`
(`DiceCitiesLogic.ts`, `SmartthinkLogic.ts`, `SnakesAndLaddersLogic.ts`,
`SettlementsAndCitiesLogic.ts`). `src/utils/apiModels/GameLogic.ts` is a **barrel**
that re-exports the shared contracts plus every game module, so the rest of the
app imports rules from that one path regardless of which game they belong to.

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
8. if gameType.CheckGameOver(gameData):  save, push win/lose notifications, return
9. gameType.CheckEndTurn(gameData, outcome)
10. if turnOver: bump lastTurnTimestamp, reset warning flag
11. save
12. if turnOver: push 'TurnTaken' to all + 'YourTurn' to the next player
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
and `formatRemainingTime`.

`GET /api/cron/turntimer` (`src/app/api/cron/turntimer/route.ts`) is the
enforcement job. It:

- authenticates via `Authorization: Bearer $CRON_SECRET`,
- loads all `complete: false` games, and for each:
  - if the turn is **expired**, advances `currentTurn`, resets the timer, sends a
    silent `TurnExpired` refresh to all + a `YourTurn` push to the new player;
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

**Token registration.** On the client, `useFcmToken` (`src/utils/hooks/`) requests
notification permission, gets an FCM token, and POSTs it to
`/api/notificationtoken`, which stores it in the user's Clerk private metadata.

**Device → UI.**
- *Background:* `public/firebase-messaging-sw.js` (a service worker) shows OS
  notifications and handles clicks.
- *Foreground:* `FcmTokenComp` (`src/components/FirebaseForeground.tsx`) listens
  with `onMessage` and re-dispatches each push as a `window` `CustomEvent` named
  after its `event` field. Game pages listen for events like `TurnTaken` and
  re-fetch game state — this is how a board updates without a socket.

Common event names: `NewInvite`, `InviteAccepted`, `GameStart`, `TurnTaken`,
`YourTurn`, `TurnExpired`, `TurnExpiringSoon`, `GameOver`.

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
- User records themselves live in **Clerk**, not MongoDB. The app only stores
  Clerk `userId`s and resolves display names on demand.

## 11. Frontend structure & design system

The app is a **mobile-first PWA** (`public/manifest.json`, PWA meta in the root
layout) rendered inside a centred `.ag-app` column.

- **Screens** live under `src/app/**/page.tsx` and are mostly client components
  (`'use client'`) that fetch from the API and render. A typical game page (e.g.
  `src/app/games/snakesandladders/[gameid]/page.tsx`) fetches game data, renders
  the board + an action panel, submits commands via `/api/game/command`, and
  re-fetches on `TurnTaken` events. It also wires in `useTurnNavigation` +
  `TurnNavControls` for recap/planning.
- **Design system.** UI was moved off stock Bootstrap onto a small custom
  system — the `ag-*` classes and CSS custom-property tokens in
  `src/app/ag-theme.css` (warm cream + terracotta, Bricolage Grotesque). Bootstrap
  remains a dependency and is still used for the in-game board screens only.
- **Reusable pieces** (this is the most important contribution rule — see
  `AGENTS.md`):
  - `src/components/ui/` — presentational primitives (`Avatar`, `GameThumb`,
    `TurnTimerSelect`, `GameSetupLayout`).
  - `src/utils/ui/` — pure helpers: `games.ts` (per-game metadata: name, art,
    accent, players), `avatar.ts`, `players.ts`.
  - `src/utils/hooks/` — shared stateful logic (`usePlayerList`, the invite
    picker; `useTurnNavigation`).
- **Game metadata** (`src/utils/ui/games.ts`) is the single source of truth for a
  game's name, slug, art, accent colour, and player count across the library,
  home cards, and setup headers.

## 12. Adding a new game

The engine is designed so a new game is additive. Roughly:

1. **Domain layer** — `src/games/<Game>/`:
   - `<Game>Models.ts`: the `GameDataModel.discriminator` with a
     `specificGameState` sub-schema; the `InvitationModel.discriminator` with a
     `CreateGame()` that rolls turn order and seeds initial state; a
     `buildInitial<Game>State()` (reused by `CreateGame` *and* the replay
     adapter); and a `gameStateToModel()` response converter.
   - `apiModels.ts`: the response/DTO interfaces.
   - static data files as needed (`board.ts`, `cards.ts`, …).
2. **Rules** — add `src/utils/apiModels/games/<Game>Logic.ts`: a `@serializable
   <Game>GameType implements IGameType` and one `@serializable` command class per
   move type, each `implements IGameCommand` (import the shared interfaces from
   `../gameCommand`). Then add an `export * from "./games/<Game>Logic";` line to the
   `src/utils/apiModels/GameLogic.ts` barrel so the new classes register and stay
   importable from the usual `@/utils/apiModels/GameLogic` path.
3. **Register** the discriminator keys/models in
   `src/utils/mongodb/mongodb.ts` (the typed unions enforce this at compile time),
   and add the new command/type instances to the `registration` array in
   `src/app/api/game/command/route.ts`. (The serializable-registry test fails if you
   miss either the barrel export or the `registration` entry.)
4. **Wire invite creation & acceptance** — a `POST /api/newgame/<game>` route and
   a branch in `src/app/api/invite/accept/route.ts` that instantiates the right
   game model.
5. **UI** — a setup screen under `src/app/newgame/<game>/`, a board screen under
   `src/app/games/<game>/[gameid]/`, board/action components under
   `src/components/games/<Game>/`, and an entry in `src/utils/ui/games.ts`.
   Reuse `GameSetupLayout`, `UserInviteList`, and `TurnTimerSelect` for setup.
6. *(Optional)* Add a replay `IReplayAdapter` for turn recap — see
   `docs/turn-recap-and-planning.md`.

## 13. Deployment, environment & CI

- **Hosting:** Vercel. `next.config.mjs` enables production browser source maps;
  `vercel.json` registers the daily cron backstop.
- **Environment variables** (see `.env.example`): `MONGODB_URI`; Clerk
  (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, injected via the Clerk
  Vercel integration); Firebase Admin (`FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`); `CRON_SECRET`; and optional
  `ACCESS_PASSWORD`. The Firebase **client** config (in
  `src/utils/firebase/firebase.ts` and the service worker) is public by design.
- **CI** (`.github/workflows/ci.yml`): on push/PR to `main`, runs
  `npx tsc --noEmit` (type check), `npm test` (Vitest), and `npx next build`. All
  must pass before merge. Locally, run `npm run build`, `npx tsc --noEmit`, and
  `npm test` before committing — the type checker, build, and test suite are the
  safety net.
- **Tests** run on [Vitest](https://vitest.dev) (`npm test`). The suite is
  deliberately small; the flagship test,
  `src/utils/apiModels/games/serializableRegistry.test.ts`, guards the
  serialisation registry (§6) — it scans the source for every `@serializable`
  class and asserts each is registered when the `GameLogic` barrel is imported and
  wired into the command route, so a game whose rules module is never imported
  fails CI instead of breaking at runtime.

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
         │  onMessage(TurnTaken) → re-fetch                  │  Mongoose
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
- [`docs/turn-recap-and-planning.md`](./docs/turn-recap-and-planning.md) — the replay engine in depth.
- [`docs/games/`](./docs/games/) — per-game rules notes (Smartthink, Settlements & Cities).
- [`docs/deployment.png`](./docs/deployment.png) — deployment diagram.
- [`README.md`](./README.md) — getting started, env vars, and cron setup.
</content>
