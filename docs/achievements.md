# Achievements — plan

**Status: shipped for the platform, Dice Cities and Settlements & Cities; PR 4
brings the rest.** PRs 1–3 of §13 are on `main`: the shapes, the registry, the
`AchievementUnlock` collection, the two-turn "played" rule, both judging
checkpoints, the reads, the toaster, the pushes, the profile and results-page
sections, and the first nine achievements. What PR 3 settled differently from
the text below is noted under §13's PR 3.
The design has been through all five reviewers, and the product owner has
settled its open questions; §15 records both.

An **achievement** is something a player unlocks by doing a particular thing,
either inside one game or across many:

- across games: "Play 5 games of Settlements & Cities", "Win 5 games of Dice
  Cities", "Play 5 different games";
- inside one game: "Own all six Mines in a game of Dice Cities".

Each has:

- a **title**;
- an **icon**: an emoji, or a drawn picture when one exists;
- a **description**: the requirement, in the player's words;
- **criteria**: the same requirement, in code;
- optionally, a **notify** flag: whether earning it mid-game sends a push.

Games write their own, in an `achievements.ts` beside `guide.ts` and
`tutorial.ts`, collected into a registry the same way. The platform owns a few
more that no single game can.

**Achievements are checked at two points:**

- **at the end of every turn**, so they unlock at the moment they're earned,
  rather than saved up for a game end at which that moment may be forgotten;
- **when the game ends**, because some only become true then: a win, a count
  of games played.

Wherever the player is when one unlocks, whether that's the board, the results
page or the home screen, a toast tells them.

This document settles:

- what an achievement *is* as data (§3);
- how each check gets the game state or player record it needs (§4.1);
- when the server decides one has been earned (§4);
- where an unlock is kept, and how it points back at the game that earned it
  (§5);
- what a check is allowed to see (§9);
- what the player sees (§7);
- how it ships (§13).

## Contents

1. [What a player gets](#1-what-a-player-gets)
2. [What already exists to build on](#2-what-already-exists-to-build-on)
3. [An achievement, as data](#3-an-achievement-as-data)
4. [When an achievement is judged, and what each check is given](#4-when-an-achievement-is-judged-and-what-each-check-is-given)
5. [Storage: one flat collection of unlocks](#5-storage-one-flat-collection-of-unlocks)
6. [API](#6-api)
7. [UI](#7-ui)
8. [Who can earn one, and which games count](#8-who-can-earn-one-and-which-games-count)
9. [Hidden information: a check sees what the table saw](#9-hidden-information-a-check-sees-what-the-table-saw)
10. [Robustness](#10-robustness)
11. [Writing a game's achievements](#11-writing-a-games-achievements)
12. [Tests](#12-tests)
13. [Implementation: the PRs and their commits](#13-implementation-the-prs-and-their-commits)
14. [Upkeep](#14-upkeep)
15. [Decisions](#15-decisions)
16. [Rejected, and why](#16-rejected-and-why)

---

## 1. What a player gets

### A toast, wherever they are

When an achievement unlocks, the player gets the app's toast, *"🏆
Achievement unlocked · Mine Baron"*, on whichever screen they're on: the board,
the results page, the home screen, a profile. A single `AchievementToaster` is
mounted for the whole app, rather than one per screen (§7.3).

- **In the game**, it shows at the earner's next fetch of the board after the
  turn that earned it.
- **When the game ends**, it shows the moment the game-over push lands, on
  whatever screen the player is on.
- **Otherwise**, it shows the next time they open or return to the app.

Every unlock is celebrated once per browser, for as long as it's still news: a
week.

**The phone buzzes too**, if the achievement says so. An achievement marked
`notify` also pushes the earner, on a new *Achievements* channel they can turn
off in Settings. It's for the big moments, and for the ones a player can earn
on somebody else's turn, while they aren't looking.

### When the game ends

- **The game-over push** names anything the game's *ending* unlocked, after the
  copy it already has: *"You beat Priya in 14 turns. Line up a rematch? 🏆
  Unlocked Mayor"*. Anything earned earlier in the game has already had its
  moment.
- **The results page lists every achievement anyone at the table unlocked in
  that game**: mid-game or at the end, the game's own or the platform's,
  everyone's and not just the viewer's. Each is one row: who, which
  achievement, and what it asked for.

### On profiles

**Your profile** has an *Achievements* section. It opens with a count (how many
you've unlocked, out of how many exist), then lists every achievement, one row
each, grouped:

- the platform's own first;
- then one group per game you've played;
- then the games you haven't played, folded away.

Every row is an ordinary `ListRow`: icon, title, the requirement underneath,
and on the right either the date it was unlocked or how far along you are.
Locked rows are muted. **An unlocked row links to the results page of the game
that earned it**, once that game has finished (§5.1).

```
  ┌──────────────────────────────────────┐
  │ Achievements · 7 of 31               │
  │                                      │
  │ Everything                           │
  │ [🏆] First win               3 Oct › │
  │      Win a game.                     │
  │ [🧭] Explorer                    3/5 │
  │      Play 5 different games.         │
  │                                      │
  │ Dice Cities                          │
  │ [🏙️] Mayor                  12 Oct › │
  │      Win 5 games of Dice Cities.     │
  │ [⛏️] Mine Baron                  —   │
  │      Own all six Mines at the end…   │
  │                                      │
  │ › 8 games you haven't played         │
  └──────────────────────────────────────┘
```

**A friend's profile** shows the same section, read-only. It's shown to
exactly the people who can already see that player's stats.

## 2. What already exists to build on

Most of this rests on pieces the repo already has. The new work is:

- a registry;
- one small collection;
- one small read route;
- a judging step at two points the server already runs;
- a handful of UI changes.

| What | Where | What achievements use it for |
|---|---|---|
| **The end of a turn, after the save** | `POST /api/game/command`'s `after()`, the block that sends `YourTurn` | The turn-end checkpoint (§4.2). It already runs after the response has gone, only on a turn-ending move, and it already loads the roster from Clerk, so checking for guests costs nothing extra. |
| **The one place a game ends** | `finishGame()` / `announceGameOver()` in `src/utils/games/finishGame.ts` | The game-end checkpoint (§4.3). Every ending goes through here: the command route's game-over branch, `POST /api/game/end`, and both of the turn-timer cron's paths (its abandon, and `finishPlayedOut`). |
| **`GameResult`**, one per finished game | `src/utils/mongodb/GameResultData.ts` | The player's record. Games played and won per game come out of one aggregation (`getPlayerStats` → `byGame`), and `outcomeFor` is the single rule for what a game was worth to a player. |
| **`RESULT_COUNTS_FILTER`** | same | Which games count. A game with a guest who hasn't claimed their account is an exhibition match. It counts toward nobody's stats (`docs/account-less-play.md` §8), and so toward nobody's achievements. |
| **Every game's response builder, with a null viewer** | each game's `IReplayAdapter.toResponseState(…, null, …)`, pinned today for Train Time, World Domination, Settlements & Cities, Fires Out and Race Cars in `src/utils/apiModels/games/hiddenHands.test.ts`, and for Banned Islet in its own models test (for a seated viewer only) | The game state a check gets (§9): the game as everyone at the table sees it, with nobody's hand in it. Every game that gets a match achievement also gets its null view pinned (§12, test 5). |
| **Per-game registries with guard tests** | `src/utils/games/recap.ts` (one import per game), `GAME_GUIDES` / `GAME_TUTORIALS` / `GAME_THEMES`, `src/games/gameRegistry.test.ts` | The shape of `GAME_ACHIEVEMENTS`. Each game owns its file, the registry gets one import and one line per game, and a test fails CI if a game ships the file but misses the line. |
| **App-wide providers, and the app's toast** | `src/components/Providers.tsx` (which already mounts `NotificationDeclinedPopup` once for every screen), `ToastContext` | The toaster that celebrates an unlock on any screen (§7.3). |
| **Push events as window events** | `dispatchPushEvent`, `usePushEvents`, `useRefreshableData` | Refreshing the toaster when an `AchievementUnlocked`, `YourTurn` or `GameOver` push arrives. |
| **Profile screens and their gate** | `src/app/profile/page.tsx`, `src/app/profile/[userId]/page.tsx`, `/api/stats`, `/api/profile/[userId]` (`areFriends`) | Where achievements are listed, and who may see them. Both screens already fetch `byGame`. |
| **The game response** | `GET /api/game/[gameid]` and the command route's response, which attach reactions the same way; `useGameData` | Telling the board about its viewer's unlocks in this game, promptly (§7.3). |
| **The results page and its gate** | `src/app/games/result/[gameId]/page.tsx`, `gameResultResponse` | Every achievement unlocked in that game. It's open to the game's players and their friends, and already built from `ListSection` + `ListRow`. |
| **Push copy and channels** | `notificationContent.ts`, `notificationPreferences.ts` (`ALL_NOTIFICATION_CHANNELS`) | The `AchievementUnlocked` push, its channel, and the game-over clause. |
| **A deadline for non-fetch work** | `withTimeout` (`src/utils/withTimeout.ts`) | Keeping a slow judgment from holding anything else up (§4). |
| **The art pipeline** | `/art-masters`, `npm run optimise-art`, `public/art/` | Drawn icons (§7.2). |
| **Account deletion** | `POST /api/user/delete` | Removing a player's unlocks with the rest of their data. |
| **UI pieces** | `ListSection`, `ListRow` (which already takes an `href`), the `ag-disclosure` fold in `WhatsNew` | All of §7. The only new visual pieces are the icon and the toaster. |

**A correction to the other docs.** `docs/social-features.md` §5 described a
`UserProfile` collection of incrementally updated aggregates as built. It never
was: stats are aggregated from `GameResult` whenever a profile is read. That
doc and `docs/profile-pictures.md` are corrected in the same PR as this plan.

## 3. An achievement, as data

### 3.1 The shape

The shapes and the registry live in `src/utils/games/achievements.ts`, beside
`recap.ts`, which follows the same idiom: a cross-game registry with one
import per game. They don't go in `src/utils/ui/` with the guide and tutorial
registries, because part of an achievement is a rule that the server runs, and
that folder is for presentation.

```ts
// src/utils/games/achievements.ts
import type { IGameStats, MatchOutcome } from "@/utils/mongodb/GameResultData";

/** What every achievement has, whoever owns it. */
interface AchievementBase {
    /**
     * Stable for ever: it is stored on every unlock. `<game slug>.<name>` for a
     * game's own, `platform.<name>` for the cross-game ones. Never change or
     * reuse one (§11).
     */
    id: string;
    /** Short enough to fit in a row: "Mine Baron". */
    title: string;
    /**
     * One emoji. Always required: it is the icon until a drawn one exists, the
     * fallback if that fails to load, and the icon's text form in push copy.
     */
    icon: string;
    /**
     * A drawn icon, as a path under /art/achievements/, shown wherever the icon
     * is, in place of the emoji. Optional; nothing else changes when one is
     * added (§7.2).
     */
    art?: string;
    /** The requirement, in the player's words: "Own all six Mines at the end of a turn." */
    description: string;
    /**
     * Push the earner when this unlocks mid-game. The toast celebrates every
     * unlock either way; this is for the ones worth buzzing a phone over.
     * Only meaningful on an `at: 'turnEnd'` achievement (§12, test 1).
     */
    notify?: boolean;
}

/** One of a game's own: judged on that game's state, or on the player's record at that game. */
export interface GameAchievement<R> extends AchievementBase {
    criteria: MatchCriteria<R> | CareerCriteria<GameRecord>;
}

/** One of the platform's: judged on the player's record across every game. */
export interface PlatformAchievement extends AchievementBase {
    criteria: CareerCriteria<CareerRecord>;
}

export type Achievement = GameAchievement<any> | PlatformAchievement;
```

`description` is the requirement written for the player, and `criteria` is the
same requirement written for the server. Keeping both is what lets a locked row
say what it's asking for, without the UI having to turn a predicate into prose.

Both imports from `GameResultData` are `import type`, and they have to be. This
file is loaded in the browser too (§7), and `GameResultData` brings Mongoose
with it at runtime. §12's test 1 walks the imports to check.

There are two kinds of criteria, because an achievement is decided by one of
two kinds of data: **a game's state**, or **a player's record**. Which one a
criterion is typed to take decides what it gets (§4.1).

### 3.2 Career criteria: decided by the player's record

"Play 5 games of Settlements & Cities", "Win 5 games of Dice Cities", "Play 5
different games". These are about a player's record (which games they've
played and won), so they are **a function over that record, plus a target**:

```ts
/** A player's record at one game: its counted games, after this one (§8). */
export interface GameRecord {
    played: number;
    won: number;
}

/** A player's record across every game. */
export interface CareerRecord extends GameRecord {
    /** Keyed by GAME_META slug. */
    games: Record<string, GameRecord>;
}

export interface CareerCriteria<Rec> {
    kind: 'career';
    /** How far along the record is. Unlocked once this reaches `target`. */
    progress: (record: Rec) => number;
    target: number;
}
```

**The type decides what it can see.** A game's own career achievement is typed
to take a `GameRecord`: the player's record *at this game*, and nothing else.
The platform's take the `CareerRecord` across every game. So:

- "Win 5 games of Dice Cities" can't accidentally count Settlements & Cities
  wins;
- the judge knows which achievements a finishing game could possibly have
  advanced (§4.3), without anyone having to declare it.

**`progress` plus `target` is what a locked row shows.** "3 / 5" is
`progress` over `target`, worked out on the profile from the `byGame` the
screen already fetches. It's the same function the server runs to decide the
unlock, so the two can never disagree.

**Any count the record can express is one line**, and adding one never needs a
new criteria kind:

```ts
record => record.won                                              // Win 5 games of Dice Cities
record => record.played                                           // Play 5 games of Settlements & Cities
career => Object.values(career.games).filter(g => g.played > 0).length  // Play 5 different games
career => Math.min(career.games.dicecities?.won ?? 0,
                   career.games.settlementsandcities?.won ?? 0)  // Win 5 of each
```

Both records are built by one pure function, `careerRecord(byGame)`, which runs
on the server when judging and on the client when drawing progress. Two things
it counts deserve a note:

- **A win** is whatever `outcomeFor` says it is: a co-op team win counts, and
  a dropped player's game doesn't. `byGame` is already folded through
  `outcomeFor`, so that rule isn't written out a second time.
- **"Played"** is `IGameStats.played`. It differs from the `total` the profile
  shows in one way: a game ended by a surrender or an abandonment only counts
  as played once it has lasted two turns (§8). So an achievement's progress
  can sit a game or two behind the profile's match count, because it skips the
  games somebody ended almost as soon as they began. `careerRecord` reads
  `played`, not `total`.

### 3.3 Match criteria: decided by the game's state

"Own all six Mines in a game of Dice Cities", "Win holding both Longest Road
and Largest Army". These are about the state of one game, so they are **a
function over that game's state**, specifically, over the state *as the table
saw it*:

```ts
export type MatchCriteria<R> =
    /** Checked at the end of every turn, and once more on the finished game. */
    | { kind: 'match'; at: 'turnEnd'; check: (view: R, seat: Seat) => boolean }
    /** Checked once, when the rules end the game: for anything that needs the result. */
    | { kind: 'match'; at: 'end'; check: (view: R, seat: FinishedSeat) => boolean };

export interface Seat {
    userId: string;
}

export interface FinishedSeat extends Seat {
    /** From outcomeFor: the same answer the player's profile gives. */
    outcome: MatchOutcome;
    /** How long the game ran: turns, or moves for a solo game (gameLength). */
    turns: number;
}
```

`R` is the game's **response** type, from its browser-safe `apiModels.ts`. The
check gets what that game's own response builder gives a viewer who holds no
seat, and never the server's internal state.

- **One function builds that view.** It's `tableView`, and the `null` viewer
  is written into it (§4.2, step 4).
- **The type alone isn't the guard.** The response type also describes each
  viewer's own private fields; §9 explains why that matters.
- **This is what makes a mid-game announcement safe.** A check can only pass
  on what the whole table can already see.

The two `at` values split the work:

- **`turnEnd` is the default.** It's for anything about the state of the board
  ("own all six Mines", "have four cities"). It unlocks the moment it's true
  at the end of a turn, and a later surrender can't take it away (§4.1).
- **`end` is for anything that needs the result** ("win holding…", "win in
  under 20 turns"), which doesn't exist until the game is over. Only an `end`
  check is handed the seat's `outcome` and the game's length.

A check is **pure, synchronous and fast**: no I/O, no clock, no randomness.
The type makes most of that true, because it returns a `boolean` and not a
promise. §11 covers the rest.

### 3.4 An example, end to end

The Dice Cities file:

```ts
// src/games/DiceCities/achievements.ts
import type { GameAchievement } from "@/utils/games/achievements";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesCardIds } from "./cards";

/** Every establishment in the base market comes six to a pile. */
const MINES_IN_THE_GAME = 6;

function owned(view: IDiceCitiesGameStateResponse, userId: string, card: string): number {
    return playerByUserId(view, userId)?.cards.find(c => c.card === card)?.amount ?? 0;
}

export const achievements: GameAchievement<IDiceCitiesGameStateResponse>[] = [
    {
        id: 'dicecities.mayor',
        title: 'Mayor',
        icon: '🏙️',
        description: 'Win 5 games of Dice Cities.',
        criteria: { kind: 'career', progress: record => record.won, target: 5 },
    },
    {
        id: 'dicecities.mine-baron',
        title: 'Mine Baron',
        icon: '⛏️',
        description: 'Own all six Mines at the end of a turn.',
        notify: true,
        criteria: {
            kind: 'match',
            at: 'turnEnd',
            check: (view, { userId }) => owned(view, userId, DiceCitiesCardIds.MINE) >= MINES_IN_THE_GAME,
        },
    },
];
```

Five things to notice:

- **Mayor reads a record, and Mine Baron reads a game.** Neither fetches
  anything. The judge hands each one the slice of data its kind is typed to
  take (§4.1).
- **Mine Baron counts to six rather than asking "does anyone else hold one?"**
  The second version looks more general, but it goes wrong once a player has
  been dropped. Dice Cities' dropout adapter takes a dropped seat's cards out
  of the game rather than returning them to the bank, so "nobody else has any"
  can be true for a player holding three.
- **It's `turnEnd`, and `notify`.** It unlocks at the end of the turn in which
  the sixth Mine arrived. That might be the earner's own purchase, or an
  opponent's Business Center swap that handed them one while they weren't
  looking, which is why it pushes. A later swap taking a Mine away doesn't
  matter: the achievement is for having owned them all.
- **Dice Cities has no hidden state.** Every viewer already gets `bankCards`
  and every seat's `cards`, so the table's view is the whole game.
- **Every runtime import is browser-safe.** `cards.ts` is static data,
  `GameDataApi`'s `playerByUserId` imports only types, and the rest is
  `import type`.

### 3.5 The registry

It follows the same idiom as `recap.ts` and `GAME_GUIDES`: one import and one
line per game.

```ts
// src/utils/games/achievements.ts
import { achievements as diceCitiesAchievements } from "@/games/DiceCities/achievements";
import { achievements as settlementsAndCitiesAchievements } from "@/games/SettlementsAndCities/achievements";

/** Keyed by GAME_META slug. A game with no achievements.ts has no entry. */
export const GAME_ACHIEVEMENTS: Record<string, GameAchievement<any>[]> = {
    dicecities: diceCitiesAchievements,
    settlementsandcities: settlementsAndCitiesAchievements,
};

/** The cross-game ones. Owned by the platform, not by any game. Career only, by type. */
export const PLATFORM_ACHIEVEMENTS: PlatformAchievement[] = [
    { id: 'platform.first-win', title: 'First win', icon: '🏆',
      description: 'Win a game.',
      criteria: { kind: 'career', progress: career => career.won, target: 1 } },
    { id: 'platform.regular', title: 'Regular', icon: '🎲',
      description: 'Play 25 games.',
      criteria: { kind: 'career', progress: career => career.played, target: 25 } },
    { id: 'platform.explorer', title: 'Explorer', icon: '🧭',
      description: 'Play 5 different games.',
      criteria: { kind: 'career',
                   progress: career => Object.values(career.games).filter(g => g.played > 0).length,
                   target: 5 } },
];

/** Both registries as one value. Every helper below that reads the catalogue
 *  takes it as an optional last parameter, defaulting to `ACHIEVEMENT_CATALOGUE`,
 *  so it can be tested against a catalogue that isn't the (at first empty) real one. */
export interface AchievementCatalogue {
    games: Record<string, GameAchievement<any>[]>;
    platform: PlatformAchievement[];
}
export const ACHIEVEMENT_CATALOGUE: AchievementCatalogue = {
    games: GAME_ACHIEVEMENTS,
    platform: PLATFORM_ACHIEVEMENTS,
};

/** Every achievement, by id. An unknown id comes back undefined, and readers drop it. */
export function achievementById(id: string, catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE): Achievement | undefined;

/** Both records, from the byGame the server and the client already have. */
export function careerRecord(byGame: IGameStats[]): CareerRecord;

/** The record at one game: what a game's own career achievement is judged on.
 *  Zeroes for a game never played, so a `progress` needn't guard for a missing entry. */
export function gameRecord(career: CareerRecord, slug: string): GameRecord;

/** Every career achievement, across the catalogue, that `career` already meets. */
export function careerMet(career: CareerRecord, catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE): Achievement[];

/** The record as it stood before a game that has just finished: one off `played`
 *  and/or `won` at the top level and under `games[slug]`, never below zero (§4.3). */
export function withoutThisGame(career: CareerRecord, slug: string, thisGame: { played: boolean; won: boolean }): CareerRecord;

/** Stored unlocks, plus every career achievement `byGame` already meets (§5.3). */
export function unlockedIds(stored: string[], byGame: IGameStats[], catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE): Set<string>;
```

`achievementById` never throws, the same as `themeIdFor`
(`docs/game-themes.md` §4). A stored id the catalogue no longer knows is
dropped quietly, never treated as an error.

## 4. When an achievement is judged, and what each check is given

### 4.1 Checkpoints, and what each one hands a check

**An achievement never fetches anything.** Achievements are judged at a handful
of **checkpoints**. At each one, the judge gathers what that moment knows (the
game's state as the table sees it, the result, the player's record), and hands
each achievement exactly the slice its criteria are typed to take. That's how
one achievement can need the game's state and another the player's stats
without either knowing where its data comes from. It's also why the types, not
a convention, decide what each one can read.

| Checkpoint | Runs when | Judges | Hands each check |
|---|---|---|---|
| **Turn end** (§4.2) | A move ends a turn (`turnOver`, or `timerRestarts`) | This game's `turnEnd` achievements, for every seat | `tableView(game)` of the live game, and `{ userId }` |
| **Game end, the rules ended it** (§4.3) | `endReason` is `win`, `teamwin` or `teamloss` | Any `turnEnd` achievements a seat still lacks, on the final state; this game's `end` achievements | `tableView(game)` of the finished game, and `{ userId, outcome, turns }` |
| **Game end, however it ended** (§4.3) | A game that counts ends, once its result is recorded | This game's career achievements; the platform's | The player's `GameRecord` for this game, or their `CareerRecord`, both counting this game |
| **Profile read** (§5.3) | A profile is opened | Nothing is written. Career progress, and career achievements already met, are *derived* for display | The same records, built on the client from `byGame` |

Which checkpoint judges which achievement follows from its kind:

| Kind | Checked | Why there |
|---|---|---|
| Match, `turnEnd` | At the end of every turn, and once more on the final state of a game the rules ended | So it unlocks while the moment is fresh, and a later surrender can't take it away |
| Match, `end` | When the rules end the game | It needs the result, which only exists then |
| Career | When the game ends, however it ended | It counts finished games, and a game only becomes one when it ends |

**Why the end of a turn, and not after every command:**

- **Undo.** A Dice Cities purchase can be taken back inside its ten-second
  hold, and a Settlements & Cities placement can be taken back until the
  player moves on (`docs/undo.md`). A player who bought a sixth Mine and undid
  it never owned six Mines.
  - The end of a turn comes after every undo that turn could make. So judging
    only there means an undone state can never be rewarded, without any check
    having to think about undo.
  - It also means an unlock never has to be taken back, which can't be done
    kindly once a phone has buzzed.
- **The moment is still fresh.** Most turns are one move (Snakes & Ladders,
  most of Dice Cities), so the end of the turn *is* the moment of the event.
  In a multi-move turn (a Settlements & Cities roll, build, build), the unlock
  arrives when the player hands the turn on: seconds later, and while the turn
  is still in their head.

**Why only a rules ending runs the match checks at game end:**

- **A surrender can stop anywhere.** Any seated player can `POST
  /api/game/end` at any time: mid-turn, on someone else's turn, inside an undo
  hold. The state at that moment is one a player chose, not one the game
  settled, so nothing is judged on it.
- **Nothing earned is lost to a surrender.** Every `turnEnd` achievement has
  already been judged at every turn end before the surrender, so whatever a
  player had earned was awarded when they earned it. That, together with
  counting a surrendered game as played once it has lasted two turns (§8), is
  how an opponent ending the game can't take away anyone's chance of an
  achievement.

**Hidden information** is the reason this needed care. An unlock announced
mid-game is a statement about a game that's still being played. §9 makes it
safe by construction: a check sees only what the whole table can see, so an
unlock can never reveal more than the board already shows.

**Could an achievement need both the game and the record?** "Win 5 games of
Dice Cities holding the Harbour" is a *count of games in which a state held*.
Neither kind above can express it, because once a game is over its state is
gone. It would take a third kind: a match check that, each time it passes in a
game, adds one to a stored tally for that player. That's a progress row, and
nothing else in this plan needs one, so it's left open (§15).

### 4.2 At the end of a turn

The command route already has a block for a move that ends the turn. It runs
after the save, in `after()`, and it's where the `YourTurn` push is built and
sent. Judging joins it, and the block is restructured so the two halves run side
by side:

```
POST /api/game/command: an on-turn move whose outcome has turnOver or timerRestarts
  … save, respond …
  after():
    userList = usersById(gameData.userIdList)         (already there; hoisted out of the push's try)
    await Promise.all([
      notifyNextPlayer(userList),                      (already there; turnOver only; its own try)
      withTimeout(                                     NEW; its own try
        () => judgeTurnEnd(gameData, userList).then(pushNotifyUnlocks),
        TURN_END_BUDGET_MS, NO_UNLOCKS, `Judging achievements for ${gameId}`),
    ])
```

- **Side by side, not queued.** The `YourTurn` half replays the whole game to
  write its body, and it sends through FCM with no deadline of its own.
  - Queued behind that, judging could run out of the function's time before
    it even started, and nothing would say so.
  - Beside it, judging usually finishes first: one read, one view, a few
    checks, perhaps one write. So the next player's board, refreshed by that
    push, often already carries the unlock.
  - `toResponseState` is synchronous, so the two halves never interleave on
    the shared document.
  - The existing `!turnUser` early return now guards only the push half.
- **The push rides inside the timed work.** `withTimeout` stops *waiting* at
  `TURN_END_BUDGET_MS` (5 s), but it lets the work finish. The `notify` push is
  chained onto that work, so a judgment that lands late still pushes.
  Otherwise it would write a row whose push nobody sends, and the next turn end
  would see that row as already held.
- **`timerRestarts` counts too.** Fires Out's solitaire crew hands the turn
  from figure to figure without ever reporting `turnOver`. Its boundary is
  `timerRestarts`, which the route already treats as a turn boundary for the
  clock.
  - Judging on either flag means a solo Fires Out game is judged as it goes,
    like any other.
  - On a boundary that is only `timerRestarts`, there's no `YourTurn` push, so
    `Promise.all` holds just the judging half.
  - The route enters `after()` for such a boundary only when
    `hasTurnEndAchievements(gameData)` is true. That's step 0's own test, so the
    two can't disagree. A solo Fires Out game with nothing to judge pays no
    Clerk lookup on any figure hand-off.

`judgeTurnEnd` lives in `src/utils/games/awardAchievements.ts` and is
server-only. It runs these steps:

0. **Is there anything to judge?** If this game has no `turnEnd` achievements
   (`hasTurnEndAchievements`), return. It costs nothing until a game has some.
1. **Does the game count?** Ask `resultCounts`, which is exported beside
   `RESULT_COUNTS_FILTER` so the rule has one home, about the unclaimed guests
   `unclaimedGuestsOf(userList)` finds. **It fails closed**: a seat whose id
   Clerk didn't return counts as an unclaimed guest.
   - The stale-guest sweeper can delete a guest who is still seated (§15), and
     `usersById` then quietly leaves them out. Without failing closed, an
     exhibition table would look registered.
   - If the game doesn't count, stop: an exhibition match earns nobody
     anything (§8).
2. **Who's being judged?** The roster, minus `droppedPlayers`. That's every
   seat, not just the mover, because a move can hand someone else their
   achievement (the Business Center swap).
3. **What do they already hold?** One read:
   `AchievementUnlock.find({ userId: { $in: seats }, achievementId: { $in: <this game's turnEnd ids> } }, { userId: 1, achievementId: 1 })`.
   It's narrowed to the candidates and projected to the two fields, and it's
   still served by the unique index. A seat that holds all of this game's
   `turnEnd` achievements is done.
4. **The view.** `tableView(gameData)` builds it once, from the live document
   the move just saved. It's the one function that builds a check's view:
   `toResponseState(state, identityMap, null, commandHistory)`, with the
   `null` written in and no viewer parameter to pass. That `null` is the
   guarantee §9 rests on. There's no replay.
   - **The view is a frozen JSON copy of that null response**, not the response
     itself.
   - It's detached from the live document, which the `YourTurn` half is reading
     at the same time.
   - A check that mutates it (sorts an array, say) throws into its own `try`
     (step 5), so it costs only itself.
5. **Check.** For each seat, and each `turnEnd` achievement it lacks, run
   `check(view, { userId })`, each in its own `try`. A broken check costs only
   its own achievement for this turn, plus a warning.
6. **Write.** `recordUnlocks` (§5.2) upserts what passed, with this game's
   `gameId` and `url`, and an `unlockedAt` from the judge's own clock. It hands
   back only the rows it actually inserted, and only those are celebrated and
   pushed.
   - `unlockedAt` is never copied from the command that ended the turn.
     Settlements & Cities deliberately gives its follow-up end-turn a fresh
     timestamp so nothing pairs it with the move that triggered it, and an
     unlock shouldn't undo that.

**Turns no checkpoint sees.** Two other things end turns:

- **the turn-timer cron**, which plays a stalled turn out through the game's
  own commands, or advances past it;
- **`POST /api/game/taketurn`**, a live route no client calls, which ends turns
  for a game without a timeout adapter, in its own `after()`.

Neither judges. A state that's still true is caught at the next turn end the
command route sees, or on the final state. Only a state that exists *solely*
at the end of a timed-out turn is missed. That's rare, and cheaper to accept
than adding a Clerk lookup and a push to every cron sweep.

**A move made out of turn** (a card played "at any time",
`docs/out-of-turn-actions.md`) never ends a turn. What it changes is judged at
the end of the turn it landed in.

### 4.3 When the game ends

In `announceGameOver`, the part of `finishGame` that runs after the finished
game has been saved:

```
announceGameOver(gameData)
  1. usersById(gameData.userIdList)                  (already there)
  2. try { recordGameResult(...) } → recorded        (already there)
  3. unlocked = await withTimeout(                   NEW
         () => judgeGameEnd(gameData, userList, { recorded }),
         GAME_END_BUDGET_MS, NO_UNLOCKS, `Judging achievements for ${gameId}`)
  4. the GameOver pushes, one per player, each naming that player's
     `unlocked` (§7.4), sent together with Promise.all
```

`judgeGameEnd` shares `judgeTurnEnd`'s steps 1 (the fail-closed count), 2, 4,
5 and 6. Steps 0 and 3 are about `turnEnd` achievements only, so it has its own
versions. Shared as written, they'd skip career and `end` judging for any game
without `turnEnd` achievements of its own. That would be Solitaire, and every
game from PR 3 until PR 4 gives it a catalogue.

- **Is there anything to judge?** Yes if this game has `turnEnd` or `end`
  achievements, or if any career achievement exists, whether it's this game's
  own or the platform's. From PR 3 on the platform list is non-empty, so a
  game with no catalogue of its own still gets its platform career unlocks
  stored, dated, announced and listed on its results page.
- **Done**, for a seat, means holding all of this game's `turnEnd` and `end`
  achievements, all its career ones, and all the platform's.

**Match, on a rules ending only.** Each seat is handed the finished game's
`tableView` and a `FinishedSeat`: its `userId`, its `outcome` (from
`outcomeFor`), and the game's length (`gameLength`, the same count the results
page prints).

- Every `turnEnd` achievement the seat still lacks is judged once more, on the
  final view.
- Every `end` achievement is judged.
- The game-ending move is judged here rather than in §4.2, because it goes down
  the route's game-over branch instead of the turn-end block.

**Career, only if `recorded`.** The game that just finished has to be in the
record before "Win 5" is checked, and the record is read from `GameResult`. If
the record failed, career achievements catch up at the player's next finished
game, so they never get ahead of the stats beside them.

- **What it looks at.** For each seat, the career achievements this game
  *could* have advanced: this game's own (typed to take its `GameRecord`) and
  the platform's.
  - A seat that already holds all of them is skipped. That's the usual case
    for a heavy player, and it's how they avoid paying for a full-history
    aggregation every time a table they sit at finishes.
  - Otherwise, read `byGame` through `getGameStatsByPlayer(userId, gameType?)`,
    narrowed to the `{ playerIds: 1, gameType: 1 }` index when only this
    game's own achievements are missing. Then build the records with
    `careerRecord`, and run each achievement's `progress` against its
    `target`.
  - **The read carries `maxTimeMS`** (`CAREER_READ_MAX_MS`, 2.5 s, just under
    the game-end budget). `withTimeout` stops the judge *waiting* on the read but
    can't cancel it, so without a limit of its own a veteran's scan would keep
    running on Mongo after the judge had given up. A read that's cut off costs
    only that seat, who catches up at their next game.
- **Tipped by this game, or backfilled?** For each newly met achievement, run
  `progress` again on the record *without this game*. `withoutThisGame` takes
  one off `played` if this game counts as played, and one off `won` if it was
  a win, so it works for any `progress` function.
  - **Tipped by this game**: without this game, it's still short of `target`.
    It's stored with this `gameId` and `url`, announced in the push, and
    listed on this game's results page.
  - **Backfilled**: it was already met before this game, as happens to every
    veteran at launch. It's stored without a `gameId`, and it's neither
    announced nor listed, because this game didn't earn it (§5.3).

**Ordering and budget.**

- **What depends on what.** The career half depends on `recorded`. The match
  half reads `gameData`, not `GameResult`, so it doesn't.
- **Judging comes before the pushes.** That's so a push can name what the
  ending unlocked, and so the toaster's `GameOver` refresh finds the rows
  already written (§7.3).
- **The budget is 3 s.** `GAME_END_BUDGET_MS` is set against the cron: the
  sweep keeps 10 s of headroom for the last game it starts, and that game also
  has to fit a Clerk lookup, `recordGameResult` (whose stats are replayed),
  and the pushes.
- **The pushes go out together**, with `Promise.all`, not one after another.
  `sendPushToUsers` never throws.
- **A late judgment misses only the push.** Unlike at a turn end, a judgment
  that lands after the budget can't add its clause to pushes already sent.
  That's accepted: the results page and the toast still show it.

### 4.4 What it costs

- **At a turn end, in the common case**: one indexed read, one view built from
  the live document, and a handful of microsecond checks. This happens after
  the response, beside the `YourTurn` half, which replays the whole game to
  write the next player's body. By comparison it's noise.
- **A write only when something unlocks**, which is at most once per player
  per achievement, ever.
- **At game end**: the same, plus one aggregation per seat that could still
  earn a career achievement from this game.
- **On the game response**: one read, projected to `achievementId` and
  `unlockedAt`, served by the unique index's `userId` prefix.
  - It runs on every poll of a watched board and every command response, but
    only for a finished game or one whose game has `turnEnd` achievements
    (§6).
  - Every other game makes no read.
- **The toaster's own read (§6)**: once per app load, per return to the tab,
  and per `AchievementUnlocked`, `YourTurn` or `GameOver` push. It's one
  indexed read, bounded by the catalogue's size.
- **No replay, anywhere.** Judging live at each turn end is what makes one
  unnecessary. An earlier draft replayed each finished game to find "at any
  turn end" states, and paid for it three ways: in the cron's budget, in replay
  drift, and in a strict mode for `buildTimeline` (§16).
- **The cron**, which `await`s `announce()` inline against its deadline, pays
  only the game-end cost, capped at `GAME_END_BUDGET_MS`.

## 5. Storage: one flat collection of unlocks

### 5.1 `AchievementUnlock`, and the link back to the game

`src/utils/mongodb/AchievementUnlockData.ts` is a flat collection like
`ChatRead`. It isn't a discriminator, and it isn't a field on `GameData` or
`GameResult`.

```ts
interface IAchievementUnlockData {
    userId: string;         // Clerk userId
    achievementId: string;  // "dicecities.mine-baron"
    unlockedAt: string;     // ISO
    gameId?: string;        // the game that earned it; absent when backfilled (§4.3)
    url?: string;           // that game's GAME_META slug, kept for when its result is gone
}
```

**The unlock links to the game; the achievement doesn't.** An *achievement* is
a definition, the same for everyone: Mine Baron is Mine Baron. An *unlock* is
one player earning it, in one game, at one moment. So the link back to the game
that triggered it belongs on the unlock, as `gameId`. That link is what lets:

- the results page list everything that game unlocked (`{ gameId }`, §6);
- a profile row say "in a game of Dice Cities", and link to that game's
  results page;
- the push and the toast say which game it was.

Which unlocks carry the link:

- **Every match unlock**, whether earned mid-game or at the end, has a
  `gameId`: it can only be earned inside a game.
- **A career unlock** has one when a game tipped it over: the fifth Dice
  Cities win belongs to that fifth game.
- **Only a backfilled career unlock** has none. It was already true before
  achievements existed, so there's no game to point at. It shows on the
  profile with a date and no link.

**`url` is copied onto the row** rather than looked up later. When *any* player
at a table deletes their account, `api/user/delete` removes that game's
`GameResult` and `GameData`, and "in a game of Dice Cities" shouldn't vanish
with someone else's account. The *link* can outlive the page it points to, so
the profile only draws it where a result still exists (§6).

**`{ userId: 1, achievementId: 1 }`, unique.** A player holds each achievement
at most once. The index's `userId` prefix serves every read this collection
gets:

- the profile, and the toaster's recent unlocks;
- judging's "what do they hold" (§4.2 step 3);
- account deletion;
- the viewer's unlocks on the game response (`{ userId: viewerId, gameId }`);
- the results page (`{ userId: { $in: result.playerIds }, gameId }`, rather
  than a bare `{ gameId }` that no index would serve).

**Why not on `GameResult`?** A `GameResult` belongs to one game and doesn't
exist until the game ends. An unlock belongs to one player, and may be earned
mid-game.

**Why not in Clerk metadata?** It's an 8 KB blob that has to be read back whole
to write it (the race `/api/gameguides` has to work around), and a friend's
profile would need one Clerk call per friend.

### 5.2 Writing it: upserts, and only the new ones count

```ts
AchievementUnlockModel.bulkWrite(newlyMet.map(({ userId, achievementId, gameId, url }) => ({
    updateOne: {
        filter: { userId, achievementId },
        // Not the filter's own fields: an upsert copies those in by itself, and
        // setting them again would stop the server retrying the race below.
        update: { $setOnInsert: { unlockedAt, gameId, url } },
        upsert: true,
    },
})), { ordered: false });
```

**The *new* unlocks are the ones in `upsertedIds`.** Two judging passes can
decide the same player has just earned the same thing:

- two turn ends in quick succession, whose `after()`s overlap;
- two of a player's games finishing at once, both deciding "Win 5".

Both upsert, and one inserts. Only that one is celebrated, pushed and named.
Usually the server retries the loser as a quiet update. When it doesn't, the
loser comes back as an 11000 in a `MongoBulkWriteError`. `recordUnlocks`
catches that error and:

- treats `err.result`'s upserted ids as the new rows;
- treats duplicate-key write errors as "already held";
- rethrows anything else, including a batch where a row failed casting beside
  a lost race, because the error's indexes then count the rows Mongoose sent
  rather than the batch.

A plain `insertMany`, or catching the error with `isDuplicateKeyError`
(`duplicateKey.ts`, which only looks at the top-level code), would swallow the
answer to "which rows are new".

**The unique index has to exist before the first write.** The repo relies on
Mongoose's `autoIndex`, and a `bulkWrite` doesn't wait for an index build. If
two upserts of the same pair land before the index exists, both insert, the
build fails on the duplicate, and uniqueness is gone for good. The PR split
closes that window: PR 2 loads the model with nothing to write, and PR 3
checks the index exists in production before the catalogue ships (§13).
`recordUnlocks` also awaits `AchievementUnlockModel.init()` before its first
write, so a build that failed throws there instead of the write going ahead
without uniqueness; the promise is cached, so it costs nothing after the first
call.

### 5.3 Reading it: stored ∪ met

On the profile:

```
unlocked = stored unlock ids  ∪  careerMet(careerRecord(byGame))
```

That one line (`unlockedIds`) means three cases need no script:

- **Launch.** A player with twenty Dice Cities wins sees *Mayor* unlocked the
  moment achievements ship.
  - It shows with no date until their next finished game that could advance
    it, which stores it as backfilled: dated, with no game named, and not
    announced (§4.3).
  - So on launch day a veteran's first game-over push doesn't read "Unlocked
    First win and 4 more".
- **A guest claims their account.** Their exhibition games start counting the
  moment `api/user/claim` `$pull`s `unclaimedPlayerIds`. Their career
  achievements appear on the next profile read, and so do those of the other
  players in those games.
- **An opponent deletes their account.** `api/user/delete` removes every
  `GameResult` that player was in, so someone else's `byGame` can go *down*.
  A stored unlock stays: an achievement once *stored* is never taken away.
  That's why career unlocks are stored at all, rather than derived on every
  read (§16).

**One accepted exception.** An unlock that's only *derived* (met, but not yet
stored) can vanish if an opponent from the games that met it deletes their
account first. That needs an account deletion inside the window, and the
window closes as the player plays.

The alternative would be a profile read that writes, which is rejected (§16).
**No GET writes.** `getPlayerStats`, `unlockedIds`, the game response and the
toaster's read only read, so a friend viewing a profile can never cause a
write into somebody else's rows.

**Match achievements** have no "met" half. They're unlocked only if a row says
so.

### 5.4 Deletion

- **`POST /api/user/delete`** gains
  `AchievementUnlockModel.deleteMany({ userId }).exec()`, next to the reactions
  line, and its route test checks it.
  - It deletes by *user*, not by game. An unlock belongs to the player, not
    the table, so other players' unlocks from the same games stay theirs.
  - A judging pass still running in some `after()` can land a row after the
    delete. That's the same race `recordGameResult` already has on that route
    (§10).
- **`/api/dev/clearresults`** wipes this collection along with `GameResult`,
  so a dev database isn't left holding unlocks for results it no longer has.

## 6. API

There's one small new read, and fields on four existing ones.

**Nothing a client sends is read when deciding an unlock.** A turn-ending move,
a finishing move or a surrender can *start* judging. But judging reads only
server-built state, and randomness the server itself recorded, and there is no
write route.

| Route | Gains | Gate |
|---|---|---|
| **`GET /api/achievements/recent`** (new) | `{ unlocks: IAchievementUnlock[] }`: **the caller's own** unlocks from the last week | Signed in. It takes no parameters, so there's nothing to forge. |
| `GET /api/stats` | `achievements: IAchievementUnlock[]` | Signed in, your own (unchanged) |
| `GET /api/profile/[userId]` | `achievements: IAchievementUnlock[]` | Self or an accepted friend (`areFriends`, unchanged) |
| `GET /api/game/[gameid]`, and the command route's response | `unlockedHere: { id, unlockedAt }[]`: **the viewer's own** unlocks in this game | A player in the game (unchanged) |
| `GET /api/gameresult/[gameId]` (and `POST …/regenerate`, which shares `gameResultResponse`) | `achievements: { userId, id, unlockedAt }[]`: **every** unlock this game earned, for every player at the table | A player in the game, or a friend of one (unchanged) |

```ts
// src/utils/mongodb/GameResultData.ts, beside IPlayerStats,
// re-exported as a type from src/app/api/stats/route.ts like IGameStats.
export interface IAchievementUnlock {
    id: string;
    unlockedAt: string;
    gameId?: string;
    url?: string;
    /** Whether that game's results page still exists, so a profile row can link to it. */
    hasResult?: boolean;
}
```

- **The new route is the toaster's feed.** The toast has to work on every
  screen (§7.3), and no existing response is fetched on every screen. It's the
  smallest route that does the job:
  - signed-in, own-only, with no parameters;
  - one indexed read, bounded by the catalogue;
  - no write;
  - a week of history, which matches the toaster's window: anything older
    isn't news.
- **Both profile routes change.** `getPlayerStats` reads the unlocks, so that
  read has one home.
  - It adds `hasResult`, from one `$in` read over the unique `gameId` index of
    `GameResult`, so a row links only where there's a page to land on. A game
    still in play has no results page yet, and nor does one whose result went
    with someone's account deletion.
  - `api/stats/route.ts` and `api/profile/[userId]/route.ts` each pick
    `{ recent, byGame }` off `getPlayerStats` and build their own JSON, so
    each gains `achievements` explicitly.
- **Both game responses change, through one helper.** The game GET and the
  command route already build the game response and attach reactions the same
  way (`attachHistoryReactions`). One shared helper attaches `unlockedHere`
  beside that, in `Promise.all` with the reactions. This is the one addition
  to the most-polled route in the app, so three rules apply:
  - **It reads only when an unlock can exist**: for a finished game, or a live
    one whose game has `turnEnd` achievements. Mid-game, only a `turnEnd`
    unlock can exist, and a finished board no longer polls.
  - **It's one indexed read**, projected to `achievementId` and `unlockedAt`.
  - **It fails soft.** A failed read is logged and answers `[]`, and the
    client reads `unlockedHere ?? []`. On the command route that answer comes
    after `trySave` has already committed the move, so a 500 there would
    report a saved move as a failure.
- **`unlockedHere` is the viewer's own, and nobody else's.** It drives the
  toast, which is yours. What the other players unlocked is on the results
  page once the game is over.
- **The results page lists everything the game earned, for everyone at the
  table.** That means match unlocks (mid-game and at the end) and every career
  milestone the game tipped over. Every viewer the page lets in sees all of
  it. It's built in `gameResultResponse`, so the regenerate route gets the
  same list.
  - This is the product owner's decision (§15). One consequence: a viewer who
    is a friend of only one player at the table also sees the other players'
    career milestones ("Bob's fifth Dice Cities win"), which is a coarse fact
    about a stranger's record.
  - If that ever needs narrowing, it's one function in `gameResultResponse`:
    show a seat's career milestones only to that seat's friends. The route
    already works out friendship for its gate.
- **Regenerate never judges.** `POST /api/gameresult/[gameId]/regenerate`
  replays a game at a player's request. It must never call the judging
  functions, or it would become a way to get a game re-judged on demand.
- **Only ids go over the wire.** Title, icon, art and description are looked up
  from the catalogue on the client, so the copy has one home and a typo fix
  doesn't need a migration.

Every change to an existing route is additive: no existing client breaks, and
no request shape changes.

## 7. UI

### 7.1 The catalogue is on the client

The profile screens, the results page and the toaster import
`GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS`. That's why a game's
`achievements.ts`, and everything it imports, has to be browser-safe (§3.4,
§12 test 1).

The `check` and `progress` functions come along too. They're a handful of
small pure functions over response types and records the client already
holds, so they reveal nothing: they're rules, not state. And `progress` is
exactly what the profile needs to draw "3 / 5".

### 7.2 Icons, emoji or drawn: `AchievementIcon`

`AchievementIcon` (`src/components/ui/`) is the one place an achievement's icon
is drawn:

- **A drawn icon**, if `art` is set: `next/image` inside the same
  `ag-icon-box` that `ListRow` puts an emoji in, so the two are the same size in
  the same row. Its `onError` falls back to the emoji, so a missing file
  degrades to the emoji, never a broken image (the rule `Avatar` already
  follows).
- **Otherwise the emoji**, boxed the same way.

Drawn icons go through the same art pipeline as every game's art:

- **Masters** are saved to
  `art-masters/achievements/<game slug or platform>/<name>.png`.
- **Served copies** are written to `public/art/achievements/…` by
  `npm run optimise-art`.
- **Each is drawn square at 256 × 256**, which covers the 36 px row box at
  every pixel density, and the push image.

Adding a drawn icon to an achievement is then one file and one field. §12,
test 1 checks that every `art` path exists, so a typo fails CI rather than
quietly showing the emoji.

The push takes the drawn icon too (§7.4). The emoji stays wherever the icon has
to be a character: in the push's text, in the game-over clause and in the
toast.

### 7.3 The toast, on every screen: `AchievementToaster`

**One toaster for the whole app.** `AchievementToaster` (`src/components/`) is
mounted once in `Providers`, inside `ToastProvider`, the way
`NotificationDeclinedPopup` is. So an unlock is celebrated on whatever screen
the player is on, with the app's existing toast: *"🏆 Achievement unlocked ·
Mine Baron"*. It renders nothing for a signed-out visitor.

**One memory, three feeds.** The toaster alone decides what's new. Whichever
screen already knows about an unlock hands it over:

- **Its own feed, for every screen.** `GET /api/achievements/recent`, through
  `useRefreshableData`. It fetches on app load and on a return to the tab. It
  also refetches on these push events, which arrive on whatever screen is open:
  - `AchievementUnlocked`;
  - `GameOver`, which is sent after game-end judging, so the rows are already
    there;
  - `YourTurn`, which is sent beside turn-end judging, so it usually finds
    them.
- **The board.** `useGameData` hands each response's `unlockedHere` to the
  toaster (`offer(unlocks)`, from `useAchievementToaster`). That's what makes
  it prompt in the game, including for the mover, whom no push reaches.
- **The results page.** It hands over the viewer's own rows from its list, so
  arriving at a just-finished game's results celebrates what the ending
  unlocked, even before any push has landed.

**Only once, and only while it's news.** An unlock is toasted if it's younger
than a week and not yet celebrated in this browser.

- What's been celebrated is remembered with `useStoredValue`, as
  `gameId:achievementId` pairs, pruned by the same one-week age. So the age
  bounds the list, and nothing is evicted while it still matters.
- Reopening a screen doesn't celebrate an old unlock again. Coming back to the
  app after earning one while you were away (the swap case) does.
- A new device, cleared storage or a private window celebrates at most the
  last week's unlocks, not a whole history.

**How quickly it shows in the game.** At the earner's next fetch of the board:

- **Immediately, for a `notify` achievement.** Its push refreshes both the
  toaster and the board.
- **Within one poll, when it's now someone else's turn.** A watched board polls
  every ten seconds while somebody else holds the turn, and that's usually
  the mover's situation.
- **Otherwise, when it's now their own turn**, at their next fetch after
  judging lands. That's their next move's response, a return to the tab, or
  the `YourTurn` refresh when judging finished first (§4.2). It's the case
  for a player who earns something on the previous player's move, a Dice
  Cities doubles bonus turn, and any solo game.

**Unit-tested.** Deciding which unlocks are new is a pure function, so it gets
a plain unit test: a new one, one already celebrated, one already pruned, and
one older than the window.

### 7.4 Pushes

**The mid-game push**, for an achievement marked `notify`:

- **What it says.** An `AchievementUnlocked` event reading *"🏆 Achievement
  unlocked — Mine Baron: own all six Mines at the end of a turn."* It's built
  by `buildAchievementNotification` in `notificationContent.ts`, like every
  other piece of push copy.
- **Who gets it.** The earner only. If one turn end unlocks two `notify`
  achievements for one player, they get one push naming the first "and 1
  more".
- **Its channel.** A new **`achievements`** channel, added to
  `ALL_NOTIFICATION_CHANNELS` and to the Settings list (*"When you unlock an
  achievement during a game"*), and on by default. That file's rule is that
  every channel needs something that sends on it, and this one has.
- **Its image.** The achievement's drawn icon when there is one, and the game's
  own art otherwise.
- **Tapping it** opens the game's board.
- **Its tag.** `AchievementUnlocked:<gameId>`, so a second unlock in the same
  game replaces the first on the lock screen rather than stacking beside it.

**The game-over push.** The three builders (`buildGameWonNotification`,
`buildGameLostNotification`, `buildTeamResultNotification`) stay as they are.
`notificationContent.ts` gains one helper:

```ts
/** `notification` with "🏆 Unlocked Mayor" (or "… and 2 more") after its body. */
export function withUnlocked(notification: PushNotification, unlocked: Achievement[]): PushNotification;
```

- **It shortens the body first to make room for the clause.** `gamePush`
  truncates the whole body to `MAX_BODY_LENGTH` (140), so a clause added
  afterwards would be the first thing cut.
- **It names only what the ending unlocked** (§4.3). Anything earned mid-game
  has already had its moment.

**Every player gets their own game-over push**, in all three of
`announceGameOver`'s branches:

- the winner, as today;
- the losers, who today share one push;
- the co-op table, which today also shares one.

That way one seat's "Unlocked…" never lands on a teammate's lock screen. It
costs nothing that matters: `sendPushToUsers` already sends one FCM message per
device token, the largest table that reaches `finishGame` has six seats, and
the users are already loaded.

### 7.5 Profiles and the results page

**Every achievement is a `ListRow`**, on both screens:

- `icon` is `<AchievementIcon>`;
- `title` is its title;
- `sub` is its description (on the results page, prefixed with who earned it);
- `action` is the date or the progress ("3 / 5");
- `href` is the results page of the game that earned it, when there is one.

The row shows everything a badge and its detail modal would, without the tap,
so there's no badge grid and no modal.

- **`ListRow` gains `muted`** for a locked row: one boolean prop and one
  `ag-list-row--muted` class.
- **Profile rows link back to the game.** An unlocked row whose unlock has a
  `gameId` and `hasResult` (§6) links to `/games/result/<gameId>`. A friend
  can follow it, because the results page lets in friends of anyone who
  played. A backfilled unlock has no link, and nor does one from a game still
  in play (yet).
- **`AchievementsSection`** (`src/components/ui/`) is the profile block,
  shared by both profile screens the way `GameStatsList` and
  `RecentFormSection` are. It's one `ListSection` per group, with the "· 7 of
  31" count in the label, and the games not yet played folded into a
  disclosure.
- **`DisclosureSection`** (`src/components/ui/`) is that disclosure, extracted
  from `WhatsNew`. `WhatsNew` hand-writes the one `<details
  className="ag-disclosure">` with an `ag-section-head` summary, and the
  achievements fold would be the second copy. That's exactly the "never
  hand-roll an `ag-section-head` again" case in AGENTS.md, so it's extracted
  first, in its own commit, and both use it.
- **The results page's *Achievements* section** has one row per unlock in that
  game, for every player: the icon, the title, and *"Alice · Own all six Mines
  at the end of a turn"*.
  - The page is already built from `ListSection` + `ListRow`, so it gains one
    more section rather than a second way to draw an achievement.
  - Rows are grouped by player, in seat order, which is the order the stats
    table above them uses.
  - There's no section at all when the game unlocked nothing.
- **Progress** comes from each achievement's `progress`, over the records
  built from the `byGame` the screen already fetched. There's no second
  request.

### 7.6 Not in v1

- A game's achievements shown on its setup screen or in `GameLibrary`.
- A server-side "seen" marker, so the toast (and a "new" dot on the profile)
  follow a player across devices, not per browser. That's the `ChatRead`
  pattern, and a change of its own.
- A toast that links somewhere. The app's toast is text. The profile row and
  the results page are where an unlock links from.
- A badge grid, as an alternative look (§16).

## 8. Who can earn one, and which games count

- **Registered players, from games that count.** "Counts" means exactly what it
  means for stats (`RESULT_COUNTS_FILTER` / `resultCounts`). A game with an
  unclaimed guest in it earns nobody anything, at any checkpoint, including
  the registered players at that table. That stops an unclaimed guest from
  counting, but it doesn't stop farming (see below).
- **Guests** earn nothing while they're guests. Once they claim, their career
  achievements count everything they played (§5.3). Match achievements from
  exhibition games are never awarded, because nobody judged them at the time.
- **Which finished games count as "played"** (the `played` in `IGameStats`,
  §3.2):
  - **Every rules ending counts:** a win, a loss, a co-op win or loss.
  - **A surrender or an abandonment counts once the game has lasted two
    turns** (`MIN_TURNS_TO_COUNT = 2`, against `GameResult.totalTurns`). That
    stops the start-and-surrender pad, and it stops an opponent ending a game
    early to deny everyone else the game. It's a named constant, so raising it
    (to a full round, say) is one line.
  - **A surrendered or abandoned solo game never counts.** There's nobody else
    who could have ended it on the player, and two Solitaire moves are no bar at
    all.
  - **How it's recorded.** `recordGameResult` works out whether the game counts
    as played through one function, `countsAsPlayed(gameData)`, and stores the
    answer on the `GameResult` as a boolean. Three details matter:
    - **The field is declared on `GameResultSchema`.** Mongoose's strict mode
      silently drops an undeclared field on `create`. Every new record would
      then read as missing, and so count, and the two-turn rule would do
      nothing, with no test to notice.
    - **The `byGame` group key normalises it**, with
      `{ $ne: ['$countsAsPlayed', false] }`. So a missing field means true,
      and there's no third group for the fold to remember.
    - **Summing into `played` is a pure fold**, like `outcomeFor`, and it's
      tested with a row that has no field.
  - **Old records count.** A record written before the field existed counts, as
    it always has on the profile. That's a one-time grandfathering: an early
    surrender from before launch counts as played.
- **Wins are unaffected.** A surrender is a draw for everyone, and an
  abandonment is a loss for whoever went quiet.
- **Solo games** (Solitaire, Smartthink solo) count toward career achievements
  like any other game. Winning a game of Solitaire is a real win. Solitaire has
  no replay adapter, though, so it can't have match achievements until it
  does (§11).
- **Kingdom Builder is out of scope.** A world is a standalone, persistent
  thing that never goes through `finishGame` or the command route, so there
  are no checkpoints to judge at. A test keeps a Kingdom Builder
  `achievements.ts` from being registered (§12) until it has a trigger of its
  own, designed along with its seasons.

**Farming is still possible, and v1 lives with it**, because achievements grant
nothing but themselves. What's left once the two-turn rule is in:

- **Two turns and a surrender, with a willing friend.** Each farmer needs a
  second person, and it's slow.
  - **The friend needn't be active.** The two-turn bar counts turns the way
    `totalTurns` does, so a turn the idle seat never played themselves still
    counts: the turn-timer cron playing a stalled turn out for them, or an
    out-of-turn play stamped onto their turn.
  - So "two turns and a surrender" needs only a second *seated* registered
    account, not a second active player.
  - That's accepted while an unlock grants nothing. §15 row 17 lists it among
    what to revisit before any grant.
- **Beating your own guest, then claiming it.**
- **Keeping it after the evidence is gone.** A stored unlock outlives the
  results that earned it, by design (§5.3).

§15 lists what would have to change *before* an unlock is ever allowed to grant
something (an avatar, a theme).

## 9. Hidden information: a check sees what the table saw

**The rule:** a match check sees the game as everyone at the table saw it at
that moment, which is the game's response state for a null viewer, and nothing
else. A career check sees only the player's record, which is already on their
profile for their friends to read.

**What enforces it** is one function, not the type and not a sentence authors
have to remember:

- **`tableView(gameData)` is the only way a check's view is built** (§4.2
  step 4). It calls the game's own response builder with `viewerId = null`
  written in, and it takes no viewer parameter at all. So nobody can "fix" a
  check that never fires by passing the seat's id.
- **A test that can fail pins that `null`** (§12, test 4). It uses a
  Settlements & Cities fixture with sentinel values planted in one seat's hand
  and development cards, and asserts that no view any check received contains
  them.
- **Each game's null view is pinned** by a wire test before that game gets a
  match achievement (§12, test 5). The judging step has no redaction of its
  own: it relies on the one every game already has, so that one has to be
  tested.

**The type is not the guard.** `R`, the response type, also describes each
viewer's *own* private fields:

- Train Time's `myHand`, `myTickets` and `myPendingTickets`;
- Settlements & Cities' `resources`, `playerDevCards` and `playerNewDevCards`;
- World Domination's `cards`.

A check that reads one of these compiles, but on the null view it can never
pass. So it's dead code today, and exactly the check that would come alive if
the `null` were ever loosened. That's why reading one is a finding (below).

**Why this makes mid-game unlocks safe.** An unlock is a public statement about
a game that may still be in play. It goes to several places:

- the push, to the earner;
- the toast, to the earner;
- the earner's profile, to their friends, who may be at the table;
- the results page, to the players and their friends.

If a check could read the server's internal state, then an unlock announced
mid-game would publish whatever the check hinged on, at the moment it became
true. With the null view, whether a check passes is a function of what
everyone can already see. So an unlock tells the table nothing the board
didn't already show, including *when* it happened.

Each of these sounds like a plausible achievement, and each would have given
away something the game never reveals:

| Game | What a check could have leaked | Why it's hidden |
|---|---|---|
| Settlements & Cities | "Win holding an unplayed Knight" | Only `devCardCount` goes on the wire. |
| Settlements & Cities | "Hold 5 Ore at the end of a turn" | Hand *size* is public (`resourceCount`); what's in the hand isn't. |
| World Domination | "Win holding a set you never cashed" | Territory cards are never revealed. |
| Train Time | "Return a 20-point ticket" | The train-card hand and returned tickets go only to their owner. Scoring reveals every *kept* ticket. |
| Smartthink | "Win as codemaker with four different colours" | The code never goes on the wire. Only a four-black guess reveals it. |
| Outbreak, Banned Islet | "Win with an epidemic next in the deck" | The decks are stored shuffled, top first, and only their counts are sent. |
| Fires Out | Anything about an unrevealed point of interest | Its identity is hidden until it's revealed on the board. |

The worst variant is a check that hinges on *someone else's* hidden state ("win
while an opponent held a Knight"). That would publish their secret on *your*
profile, possibly mid-game.

On the null view, none of these can ever pass, because the field isn't there to
read. That's the design working, not a gap in it. It also covers a surrender:

- a surrendered game is never judged on its final state (§4.1);
- even if it were, its null view hides whatever it hid mid-game. Train Time's
  tickets stay hidden until `gs.gameOver`, not until `complete`.

**Three rules remain for authors**, and `croupier` reviews every game's
`achievements.ts` against them:

- **A check must not read a viewer-only field.** That's any `my*` field,
  `resources`, `playerDevCards` / `playerNewDevCards`, World Domination's
  `cards`, `canUndo` and `autoEndTurnAt`. Reading one is a finding even though
  it can't pass: either it's a check that never fires, or it's a leak waiting
  for the `null` to be loosened.
- **A description must not name a hidden specific**, even where the check
  can't read it. "Hold the Knight card at the end" is misleading, and it
  invites a check to go looking.
- **Secret achievements would need their text sent from the server.** The
  whole catalogue ships in the client bundle (§7.1), so a "???" row whose title
  sits in that bundle hides nothing. If secret achievements ever ship, their
  title and description come from the server, and only once unlocked (§15).

## 10. Robustness

| What could go wrong | What happens |
|---|---|
| A check or a `progress` function throws | It's skipped for this pass, with a warning. The other checks, the pushes, the move and the game are unaffected (§4.2 step 5). |
| A check mutates its view (sorts an array) | The view is a frozen copy, so the check throws into its own `try` and costs only itself. Neither the later checks nor the live document see a change (§4.2 steps 4 and 5). |
| Judging at a turn end fails or stalls (Mongo in its 30 s server selection, say) | It runs in `after()`, after the response, beside the `YourTurn` push rather than behind it, in its own `try` under `withTimeout` (§4.2). The move is already saved and the next player is told regardless. A condition that still holds is caught at the next turn end. A stall is logged: `withTimeout` warns when its deadline wins, so a budget that has come to be too short gets noticed. |
| `recordUnlocks` throws after some of its upserts landed (one row loses a race while another hits a real write error, or a write-concern error) | The rows that did land are stored, but the pass that wrote them never hears which, so they get no `notify` push and no game-over clause. The next pass sees them as already held, and the toaster still celebrates them from the recent-unlocks feed (§7.3). A batch where one row failed casting beside a lost race throws the same way, rather than name the wrong rows as new (§5.2). |
| The `YourTurn` half is slow (a long game's replay, an FCM send with no deadline) | Judging doesn't wait for it, because the two halves run side by side. Queued behind it, judging could lose the function's time without ever starting, and nothing would log it. |
| Judging at a turn end finishes after its budget | `withTimeout` stops waiting, and logs a warning, but the work runs on. The `notify` push is chained onto that work, and the route's `after()` waits `TURN_END_PUSH_GRACE_MS` (10 s) more for it before returning — `after()` ending is when the platform may stop the function — so a late unlock still pushes rather than leaving a row whose push is never sent. Only a judgment later than that loses its push; the toast still celebrates it. |
| A seat Clerk can't resolve (a guest the stale-guest sweeper deleted while still seated) | It's counted as an unclaimed guest, so the table counts as an exhibition and nothing is judged (§4.2 step 1). Failing open would let an exhibition table earn. The sweeper gap itself is a separate bug (§15). |
| Judging at game end fails or stalls | `withTimeout` answers with no unlocks after `GAME_END_BUDGET_MS` (3 s, set against the cron's 10 s of headroom), logs a warning, and the game-over pushes go out without the clause. Career achievements catch up at the player's next game. `turnEnd` achievements were already judged at every earlier turn end, so only what the final move alone earned, and `end` achievements, are lost. If the function is killed during judging (the cron's last game of a run), the game-over pushes are lost too, not only the clause, because judging runs before them (§4.3). The 3 s budget is what bounds that window, and the cron narrows it further: it hands `announce` its hard stop (`finishBy`), and judging gets only what leaves the pushes `PUSH_RESERVE_MS` (3 s), and is skipped with a warning when that is under `MIN_JUDGING_MS`. |
| A veteran's career read is slow | `maxTimeMS` (`CAREER_READ_MAX_MS`, 2.5 s) cuts it off on the server, so a read the judge has stopped waiting for doesn't keep running on Mongo. That seat's career catches up at their next game (§4.3). |
| `recordGameResult` fails | Career judging is skipped for this game and catches up at the player's next game (§4.3). Match judging doesn't depend on it, so it still runs. |
| A game with no `turnEnd` or `end` achievements of its own | Its game end is still judged for career achievements, the platform's included, because `judgeGameEnd` has its own "anything to judge?" (§4.3). |
| Two judging passes race (overlapping turn ends, or two games finishing at once) | Both upsert and one inserts. Only its unlock is celebrated and pushed, and neither throws (§5.2). |
| The first writes arrive before the unique index exists | Uniqueness could be lost for good (§5.2). The PR split prevents it, and PR 3 checks for the index before the catalogue ships. |
| A turn is ended by the cron, or by `POST /api/game/taketurn` | That turn end isn't judged. A state that persists is caught at the next turn end the command route sees, or on the final state (§4.2). |
| A game whose turns end with `timerRestarts` and never `turnOver` (Fires Out's solitaire crew) | It's judged on either flag, so it's judged as it goes like any other (§4.2). |
| A state is reached and then undone | It never reaches a turn end, so it's never judged (§4.1). |
| The game response's `unlockedHere` read fails | It's logged and answers `[]`, and the response still goes out with a 200. On the command route the move is already saved, so a 500 would misreport it. The read isn't made at all for a live game with no `turnEnd` achievements (§6). |
| The toaster's `recent` read fails | `useRefreshableData` keeps the last good body and retries on its usual backoff. The board and the results page still feed the toaster from their own responses, so an unlock in a game, or just after one, is still celebrated. |
| Toast memory: a new device, cleared storage, a private window, two tabs | At most the last week's unlocks are celebrated again. The list is bounded by age, not size, so nothing still news is evicted (§7.3). |
| `countsAsPlayed` never reaches the database | The field is declared on the schema. Undeclared, strict mode would drop it, and every new game would count as played (§8). |
| An opponent deletes their account | Stored unlocks stay. An unlock that's only derived can drop (§5.3, the accepted exception). "In a game of Dice Cities" survives because `url` is on the row, and the link goes away with the page (`hasResult`). |
| A player deletes their account while one of their games is being judged | The pass can upsert a row after `deleteMany`, leaving an orphan row with no account behind it. That's the same race `recordGameResult` already has there, and an orphan row is unreachable, because nothing reads it. |
| An achievement is withdrawn from the catalogue | Its stored rows become unknown ids, and readers drop them (`achievementById`). The id must never be reused (§11). |
| A player with thousands of games | At a turn end, career achievements aren't touched. At game end, a seat that already holds everything this game could advance is skipped. Otherwise it's the same `byGame` aggregation the profile runs, narrowed to one game where it can be. |

`gremlin` reviews all of PR 2 against this table, and PR 3's pushes and toaster
too.

## 11. Writing a game's achievements

For whoever writes the next game's `achievements.ts`:

- **Put it beside `meta.ts` and export `achievements`**, typed
  `GameAchievement<YourResponseState>[]`. Add one import and one line to
  `GAME_ACHIEVEMENTS`; the guard test fails if you forget.
- **Prefix every id with the game's slug** (`dicecities.mine-baron`). An id is
  permanent: rename the title as often as you like, but never change or reuse
  an id. Stored rows point at it, and a reused id would hand the new
  achievement to everyone who earned the old one.
- **Write the description as the requirement**, precisely enough to settle an
  argument: "at the end of a turn", "in one game", "win" versus "play".
- **Pick the kind by the data it needs** (§4.1):
  - about the board: match, `at: 'turnEnd'`;
  - about the result ("win…", "in under N turns"): match, `at: 'end'`;
  - about how many games: career, with a `progress` over the `GameRecord`.
    Counts across games go in `PLATFORM_ACHIEVEMENTS`, whose type takes the
    whole `CareerRecord`.
- **A match check reads only what every viewer gets.** Type it against your
  game's response type, from `./apiModels`, and never read its internal state.
  That rules out every `my*` field, `resources`, and the dev cards (§9). If a
  check can't be written against the null view, the achievement is asking
  about something the table never saw.
- **Pin your game's null view** in `hiddenHands.test.ts`, in the same commit
  as its first match achievement. Use a sentinel for a game with hidden state,
  and an exact key set for one that hides nothing (§12, test 5).
- **Match achievements need a replay adapter.** The view is built through it.
  Solitaire has none, so it gets career achievements only until it does.
- **Set `notify` for the ones worth a push**: rare ones, and ones that can be
  earned on somebody else's turn. The toast celebrates every unlock anyway, so
  a push for a small one is just noise.
- **Keep it browser-safe.** Use `import type` for anything from
  `<Game>Models.ts` or `src/utils/mongodb/`. Static data (`cards.ts`,
  `board.ts`), `./apiModels` and pure helpers are fine. The test walks your
  imports.
- **A drawn icon is optional.** Start with the emoji; when art arrives, follow
  §7.2's pipeline and set `art`.
- **Don't count on theme names.** Achievements belong to the account, not to
  one game's dressing, so they use the default theme's nouns. That's the same
  known gap the results page already has (`docs/game-themes.md` §7).
- **Aim for three to six per game**: a *played* and a *won* rung, plus a couple
  of match achievements that reward a distinctive way of playing, not a grind.
  Something a keen player gets in their first ten games is about right.

## 12. Tests

In the repo's existing style: unit tests over the pure parts, the integration
harness for the routes, and a structural guard for the registry.

1. **Catalogue integrity** (`src/utils/games/achievements.test.ts`):
   - every id is unique across the whole catalogue;
   - every `GAME_ACHIEVEMENTS` key is a `GAME_META` slug (the
     `gameThemes.test.ts` pattern), so a key and its ids can't share a typo
     and still pass;
   - every id is namespaced by its registry key or by `platform.`;
   - **`notify` appears only on `at: 'turnEnd'` achievements**, the only ones
     that unlock mid-game;
   - **every `art` path is under `/art/achievements/` and exists** under
     `public/`;
   - **no `engine: "standalone"` game has an entry**, since Kingdom Builder's
     would be drawn but never judged;
   - **every game with a `match` achievement has a registered replay adapter,
     and is on the list of games whose null view is pinned** (test 5). That
     list is explicit, the way `RESPONSE_BUILDERS` is in
     `publicGameState.test.ts`;
   - `target` is at least 1, and `title`, `icon` and `description` aren't
     empty;
   - **nothing reachable at runtime from `src/utils/games/achievements.ts` is
     server-only.** The test walks the runtime import graph (skipping
     `import type`) and fails on anything under `@/utils/mongodb/`, any
     `*Models.ts`, `mongoose` or `@clerk/nextjs/server`.
     - The walker already exists: `runtimeImports` and `reachableFrom` in
       `src/app/api/serverModuleGraph.test.ts`. They move to
       `src/utils/testing/`, and learn relative specifiers (they only follow
       `@/…` today, and a game file imports `./cards`).
     - Walking the whole graph also catches the indirect case,
       `achievements.ts → ./rules.ts → ./XModels.ts`.

   Two rules need no test, because the type system already enforces them: a
   platform achievement can't have match criteria, and a game's career
   achievement can't read another game's record (§3.2).
2. **The registry line** (`src/games/gameRegistry.test.ts`): "wires every
   game's achievements into GAME_ACHIEVEMENTS". It discovers games with an
   `achievements.ts` the same way the guide and tutorial rows do.
3. **Pure helpers:**
   - `careerRecord`, `careerMet` and `unlockedIds`, over hand-built
     `IGameStats[]`: an empty history, one game, several games, a game with no
     wins, and one where `played` and `total` differ;
   - `withoutThisGame`, and the *tipped* versus *backfilled* split (§4.3), with
     more than one shape of `progress` function;
   - `countsAsPlayed`: every rules ending counts; a surrender after one turn
     doesn't; a surrender after two does; an abandonment after two does; a
     solo surrender or abandonment never does;
   - the `played` fold: a row with no `countsAsPlayed` counts as played;
   - which unlocks the toaster celebrates (§7.3): a new one, one already
     celebrated, one already pruned, one older than a week.
4. **Judging** (`awardAchievements.test.ts`), with a test catalogue passed in.

   **The table view.** This uses a Settlements & Cities fixture, because Dice
   Cities' adapter ignores the viewer and so couldn't catch a loosened `null`:
   - plant sentinels in one seat's `resources` (ore 9173) and development
     cards;
   - give a test check that records `JSON.stringify(view)`;
   - run both judges;
   - assert that no recorded view, for any seat judged, contains a sentinel,
     and that `playerDevCards` is `{}`.

   **`judgeTurnEnd`**, against the Dice Cities `testHarness`:
   - a check passes and fails on the live view;
   - every seat is judged, not only the mover (the Business Center swap);
   - a dropped seat isn't judged;
   - an exhibition game judges nothing;
   - **a seat Clerk doesn't return judges nothing** (it fails closed);
   - it still runs when the next player can't be resolved;
   - an empty catalogue returns before any read.

   **`judgeGameEnd`:**
   - `end` checks get the right `outcome` and `turns`;
   - career achievements get the right record: a game's own gets its
     `GameRecord` for this game, the platform's get the `CareerRecord`, and
     both count this game;
   - a rules ending judges the final state;
   - **a game ended by `POST /api/game/end` judges no match achievement**, but
     still counts toward career ones once it has lasted two turns;
   - a failed `recordGameResult` skips career but not match;
   - **a game with no catalogue of its own still tips a platform career
     achievement**;
   - a seat holding every `turnEnd` achievement still has its `end` and career
     ones judged.

   **Both:**
   - a second run inserts nothing and returns nothing;
   - **two concurrent runs** for the same player (`Promise.all`): exactly one
     reports the unlock, and neither throws;
   - a throwing check costs only itself.
5. **Every match achievement's `check`, and every career `progress`**, gets a
   small unit test beside its game: one input that passes and one that
   doesn't.

   **Every game with a match achievement gets its null view pinned** in
   `hiddenHands.test.ts`, in the same commit as its first one:
   - **a sentinel** for a game with hidden state (a Smartthink code of 424242,
     which no guess row can hold; sentinel ids in both of Outbreak's decks);
   - **an exact key set** for a game that hides nothing (Dice Cities, Snakes &
     Ladders), on the pattern of the Race Cars test;
   - **Banned Islet's** existing models test gains the null viewer.

   Before this plan, a regression in a null view was a dev-tools leak. With
   mid-game unlocks it becomes a lock-screen sentence and a profile row.
6. **Routes:**
   - **a turn-ending move through `POST /api/game/command` writes a row when a
     check passes.** A `notify` achievement pushes its earner on the
     `achievements` channel, and a plain one doesn't. For this,
     `gameRoutes.test.ts`'s `GameResultData` mock is extended beyond
     `{ recordGameResult }`, and `src/utils/testing/apiRoute.ts` gains an
     `AchievementUnlock` fake store whose `bulkWrite` returns `upsertedIds`,
     modelled on its GIF catalogue fake;
   - **a mid-turn move that doesn't end the turn writes nothing**, even if the
     state it leaves would pass;
   - a Fires Out solitaire hand-off (`timerRestarts` without `turnOver`)
     judges;
   - a finishing move writes the game-end unlocks;
   - the game response carries `unlockedHere` for the viewer, and nobody
     else's unlocks;
   - the game GET and the command response still answer 200, with `[]`, when
     the unlock read throws;
   - a live game with no `turnEnd` achievements makes no unlock read;
   - **`GET /api/achievements/recent`** returns the caller's own unlocks from
     the last week, and nobody else's;
   - `/api/stats` and `/api/profile/[userId]` carry `achievements`, with
     `hasResult` true only where a `GameResult` exists;
   - **`/api/gameresult/[gameId]` lists every player's unlocks from that
     game** (match, and tipped career). It leaves out backfilled ones, and
     shows the same list to a player and to a friend of one player;
   - `POST /api/user/delete` removes the player's rows.
7. **Push copy:**
   - `buildAchievementNotification` uses the drawn icon as its image when
     there is one, and the game's art otherwise;
   - `withUnlocked` keeps its clause when the body is at the limit.

Plus the usual gates before every commit: `npm run build`, `npx tsc --noEmit`,
`npm run lint` (`--max-warnings 0`), and `npm test`.

## 13. Implementation: the PRs and their commits

Four PRs. The first two are inert (nothing a player can see changes), the third
turns the feature on, and the fourth brings in every other game.

| PR | What lands | Player-visible | "What's new" | Reviewers |
|---|---|---|---|---|
| **1** | Shapes, records, the empty registry, the unlock collection | No | None | `rulebook`, `gremlin`, `locksmith` |
| **2** | Both checkpoints, and the "played" rule | No: the catalogue is empty, so judging returns straight away | None | `gremlin`, `croupier`, `locksmith`, `rulebook` |
| **3** | The toaster, the pushes, drawn icons, profiles, the results page, and the first catalogue | Yes | One line, *Enhancements* | `caveman`, `locksmith`, `croupier`, `gremlin`, `rulebook` |
| **4** | Every other game's achievements | Yes | Widen PR 3's line, or add one of its own | `croupier`, `rulebook` |

The split exists so that the risky changes reach review on their own, in PR 2,
with nothing visible around them. Those changes are new steps on the turn-end
path and on the game-over path, and the cron awaits the second inline.

PR 2 doesn't prove the write path, though. With an empty catalogue, judging
returns at step 0, and Mongoose short-circuits an empty `bulkWrite` anyway. So
the write path first runs for real in PR 3, which is also where gremlin looks
again.

Each PR updates `ARCHITECTURE.md` for what it lands, so the doc describes
`main` at every point. Everything that invites authors to *write* achievements
waits for PR 3.

### PR 1 — Describe an achievement, and somewhere to keep one

1. **`Share the import walker between the module-graph guards`.** Move
   `runtimeImports` / `reachableFrom` out of `serverModuleGraph.test.ts` into
   `src/utils/testing/`, and teach them relative specifiers. That test keeps
   passing unchanged.
2. **`Describe an achievement`.** `src/utils/games/achievements.ts`, holding:
   - the types from §3: `GameAchievement`, `PlatformAchievement`, both
     criteria kinds, `GameRecord` / `CareerRecord`, `art` and `notify`;
   - an empty `GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS`;
   - `achievementById`, `careerRecord`, `gameRecord`, `careerMet`,
     `withoutThisGame` and `unlockedIds`, each of the ones that read the
     catalogue taking it as an optional last parameter, so they can be tested
     while the real one is empty.

   It comes with tests 1 and 3, except the `countsAsPlayed` cases, which come
   in PR 2. Nothing calls any of it yet.
3. **`Guard the achievements registry`.** The `gameRegistry.test.ts` row (test
   2). It passes trivially today, and exists so that the first game to add an
   `achievements.ts` can't be left out.
4. **`Keep a player's unlocked achievements`.**
   `src/utils/mongodb/AchievementUnlockData.ts`: the schema, the unique index,
   `recordUnlocks` with §5.2's upsert and error handling, and the fake store in
   `apiRoute.ts`. Alongside it:
   - account deletion removes a player's rows (with its route test);
   - `/api/dev/clearresults` wipes the collection;
   - ARCHITECTURE.md §5 gets an `AchievementUnlock` subsection beside
     `ChatRead`, covering the index, the deletion rule, and the link back to
     the game.

   The collection stays empty: nothing writes to it yet.

### PR 2 — Judge them

1. **`Tally a player's games without their recent form`.** Pull the `byGame`
   half of `getPlayerStats` out into `getGameStatsByPlayer(userId, gameType?)`.
   Judging can then ask for it (narrowed to one game where it can be) without
   also fetching the last ten matches. No behaviour change: `getPlayerStats`
   calls it.
2. **`Count a game as played once it has lasted two turns`.** This adds
   `countsAsPlayed(gameData)` and `MIN_TURNS_TO_COUNT`, and the declared
   `countsAsPlayed` field on `GameResultSchema`, which `recordGameResult`
   stores. It also adds `played` to `IGameStats`, from the normalised group
   key and a pure fold. The profile keeps showing `total`, so nothing a player
   sees changes. Tests: the `countsAsPlayed` and fold cases from test 3, plus
   an aggregation case.
3. **`Judge achievements`.** `src/utils/games/awardAchievements.ts`, holding:
   - `tableView`, with its `null` written in;
   - `judgeTurnEnd` and `judgeGameEnd` over one shared core, each with its own
     "anything to judge?" and "done" rules;
   - the per-checkpoint context: `{ userId }`, `{ userId, outcome, turns }`,
     and the records;
   - `resultCounts`, beside `RESULT_COUNTS_FILTER`, failing closed on a seat
     Clerk didn't return.

   The catalogue is a parameter that defaults to the real one. It comes with
   test 4, including the Settlements & Cities sentinel test that pins the
   `null`.
4. **`Judge achievements at the end of every turn`.** The command route's
   turn-end `after()` is restructured (§4.2):
   - `userList` is resolved once;
   - the `YourTurn` half and the judging half run side by side in
     `Promise.all`, each in its own `try`;
   - judging runs under `TURN_END_BUDGET_MS`, on `turnOver` or
     `timerRestarts`.

   Nothing is pushed or shown yet. Tests: test 6's turn-end cases, with a test
   catalogue and the extended mock.
5. **`Judge achievements when a game ends`.** The call in `announceGameOver`,
   under `GAME_END_BUDGET_MS` (§4.3). The pushes don't mention unlocks yet.
   Also:
   - the finishing-move case in `gameRoutes.test.ts`;
   - both checkpoints written up in ARCHITECTURE.md, in §5's `finishGame`
     bullet and §6's command pipeline.

### PR 3 — Show them, and the first ones to earn

The commits are ordered so that **the feature becomes visible at commit 10, and
not before**. Everything up to then renders nothing, because the catalogue is
still empty.

1. **`Send achievements to the screens that show them`.** This commit adds the
   achievement fields to existing routes:
   - `getPlayerStats` and both profile routes gain `achievements`, with
     `hasResult`;
   - `gameResultResponse` gains every unlock the game earned, for every
     player;
   - the game GET and the command response gain `unlockedHere`, through the
     one helper beside `attachHistoryReactions`. It reads only when an unlock
     can exist, and it fails soft to `[]` (§6).

   It comes with route tests.
2. **`List a player's recent unlocks`.** `GET /api/achievements/recent`: own
   only, no parameters, the last week (§6). It has its own route test, and the
   `malformedBody` / `serverModuleGraph` guards pick it up automatically.
3. **`Fold a section away in one place`.** Extract `DisclosureSection` from
   `WhatsNew`. No behaviour change.
4. **`Draw an achievement's icon`.** `AchievementIcon`, with its drawn-art
   path, its fallback to the emoji, and the `art` checks in test 1. This makes
   drawn icons usable before any exist.
5. **`Show achievements on profiles`.** `AchievementsSection` on both profile
   screens, rows linked back to their game's results, and `ListRow`'s
   `muted`.
6. **`Show every achievement a game unlocked on its results page`.** One more
   `ListSection`, grouped by player.
7. **`Celebrate an unlock on every screen`.** `AchievementToaster` in
   `Providers`, with its feed from the recent route, its one-week memory, and
   `useAchievementToaster().offer`.
   - Two screens call `offer`: `useGameData`, with `unlockedHere`, and the
     results page, with the viewer's own rows.
   - `AchievementUnlocked` joins the push events that refresh the board and
     the toaster.
   - It comes with the unit test for which unlocks are new.
8. **`Push the achievements worth a push`.** This commit covers both pushes:
   - the `achievements` channel, in preferences and in Settings;
   - `buildAchievementNotification`;
   - `pushNotifyUnlocks`, chained onto the timed turn-end work;
   - `withUnlocked`;
   - every player getting their own game-over push, in all three branches,
     sent together with `Promise.all` (§7.4).
9. **`Check the unlock index before anything writes`.** This is a checklist
   step in the PR description, not a code commit, but it gates the next one.
   Confirm that `{ userId: 1, achievementId: 1 }` exists in production. PR 2's
   deploy will have built it; if it hasn't, build it now (§5.2).
10. **`The first achievements`.** `PLATFORM_ACHIEVEMENTS`, and the two games
    from the original request:
    - **Dice Cities**: as in §3.4, plus one more match achievement. Its null
      view is pinned as an exact key set in `hiddenHands.test.ts` (test 5).
    - **Settlements & Cities**, whose null view is already pinned:
      - `settlementsandcities.settler` 🏘️ *"Play 5 games of Settlements &
        Cities"*: career, `record => record.played`, target 5;
      - `settlementsandcities.city-planner` 🏙️ *"Have four cities at the end
        of a turn"*: match, `turnEnd`, from the public board;
      - `settlementsandcities.double-honours` 🎖️ *"Win a game holding both
        Longest Road and Largest Army"*: match, `end`, with the check
        `outcome === 'win' && view.longestRoadOwner === userId &&
        view.largestArmyOwner === userId`. Every viewer sees both of those at
        every moment.

    **This is the commit that turns the feature on.**
11. **`Say what's new, and write it down`.** Everything that invites authors to
    add achievements:
    - the "What's new" line;
    - the AGENTS.md paragraph;
    - ARCHITECTURE.md: the `achievements` channel and the
      `AchievementUnlocked` event in §8, the toaster in §11, and in §12, step
      9, its one-liners table row, and "steps 7, 8 and 9";
    - `docs/new-game.md`: the §5 bullet and the §6 table row;
    - a short `achievements.ts` section in
      `.claude/skills/croupier-review/SKILL.md`;
    - this doc's status line: *shipped for the platform, Dice Cities and
      Settlements & Cities; PR 4 brings the rest*.

**As built, PR 3 differs from the list above in these ways**, each from a
review:

- `IAchievementUnlock` lives in `AchievementUnlockData.ts`, beside the reads
  (`unlocksOf`, `unlocksInGame`), and is re-exported from `GameResultData.ts`
  and `api/stats`. `unlockedHere` rides inside `gameData`, so the command
  response and the GET reach `useGameData` by the same path.
- On a profile, an unlock whose game has no results page keeps its `url` but
  drops its `gameId`: a friend has no use for the id of a game still in play.
- Every unlock read carries a server-side `maxTimeMS` and fails soft.
- Dice Cities' second match achievement is *Treasury* 💰, "Hold 30 coins at the
  end of a turn".
- The toaster's memory is keyed `userId:gameId:achievementId` (a browser can be
  shared), a batch toasts at most three and counts the rest, and a backfilled
  unlock is never toasted. The results page mounts `FcmTokenComp`, so a
  `GameOver` push landing there reaches the toaster.
- The turn-timer cron hands `announce` its hard stop (§10), and a late
  turn-end judgment keeps the function alive for its push (§10).
- `resultPath` joined `gamePath` in `utils/ui/games.ts`, and every
  `/games/result/<id>` goes through it.
- The catalogue's import walker allows a game's `apiModels.ts`, which its rule
  for `*Models.ts` had caught by name.

### PR 4 — Every other game

One commit per game: its `achievements.ts`, one registry line, and its tests.
Easiest first:

1. **Snakes & Ladders.** Its null view is pinned as an exact key set.
2. **Solitaire.** Career only, since it has no replay adapter, so no pin.
3. **Race Cars.** Already pinned.
4. **World Domination.** Already pinned.
5. **Train Time.** Already pinned.
6. **Smartthink.** Its null view is pinned with a code sentinel (424242) that no
   guess row can hold.
7. **Outbreak, Fires Out! and Banned Islet.** These are the co-ops. An
   achievement for the table's win is earned by every seat, which `outcomeFor`
   already gives.
   - Outbreak's view is pinned with sentinel ids in both decks, plus a key set.
   - Banned Islet's existing test gains the null viewer.
   - Fires Out is already pinned.

The later ones hide the most, so some ideas for them won't be expressible
against their view (§9). That's working as intended.

**If a game needs shared code to change, stop.** Change the shared piece in its
own commit and call it out in the PR description. It means the design in §3 was
wrong, not that the game is special.

**"What's new":** if PR 4 lands soon after PR 3, widen PR 3's line ("…in every
game") rather than adding a second. Otherwise, one new line of its own. Either
way it's one line for the whole PR, not one per game.

### Who reviews what, and why it isn't all of them

- **`locksmith`**:
  - PR 1 commit 4, which touches `src/app/api/user/delete`;
  - PR 2 commit 4, the command route;
  - PR 3 commits 1 and 2: four route responses change, and the recent route
    is added. The "own only" and "viewer's own" gates are this plan's.
- **`gremlin`**:
  - PR 1 commit 4: the index, the upsert, deletion;
  - all of PR 2;
  - PR 3 commits 7 and 8: the toaster's feeds, and the per-player sends that
    run inline in the cron.
- **`croupier`**:
  - PR 2 commit 3, where checks get the null view;
  - PR 3 commits 1, 8 and 10: the wire, the push copy, the first checks;
  - every commit in PR 4.
- **`caveman`**: PR 3 commits 3–7, where UI duplication would land.
- **`rulebook`**: every PR's registry line, docs and "What's new".

### If it has to be one PR

Keep the commits in exactly this order, and keep the boundaries: PR 1's four,
PR 2's five, PR 3's eleven. The unique-index step (PR 3 commit 9) then has no
earlier deploy to have built the index. It becomes "deploy with the catalogue
empty first", so the PR can't merge in one go. That's the strongest argument
for the split.

Files touched, all told:

```
PR 1  move   src/app/api/serverModuleGraph.test.ts → src/utils/testing/moduleGraph.ts (+ test)   (runtimeImports, reachableFrom)
PR 1  new    src/utils/games/achievements.ts (+ test)       (shapes, records, registry, helpers)
PR 1  edit   src/games/gameRegistry.test.ts                 (one row)
PR 1  new    src/utils/mongodb/AchievementUnlockData.ts
PR 1  edit   src/utils/mongodb/duplicateKey.ts, src/utils/gif/klipySearch.ts   (isOnlyDuplicateKeyErrors moves out of the GIF search so recordUnlocks shares it)
PR 1  edit   src/utils/testing/apiRoute.ts                  (fake store)
PR 1  edit   src/app/api/user/delete/route.ts (+ test), src/app/api/dev/clearresults/route.ts
PR 1  edit   ARCHITECTURE.md §5

PR 2  edit   src/utils/mongodb/GameResultData.ts (+ test)   (getGameStatsByPlayer, countsAsPlayed, played, resultCounts, matchResultOf, endedByHand)
PR 2  edit   src/utils/games/achievements.ts (+ test)       (recordOf reads played)
PR 2  new    src/utils/games/awardAchievements.ts (+ test)  (tableView, judgeTurnEnd, judgeGameEnd, hasTurnEndAchievements)
PR 2  edit   src/utils/games/replay.ts, src/games/RaceCars/RaceCarsModels.ts   (identityNameMap: one copy of the ids-as-names map)
PR 2  edit   src/utils/withTimeout.ts (+ test)              (warns when it gives up)
PR 2  edit   src/app/api/game/command/route.ts              (the turn-end checkpoint)
PR 2  edit   src/utils/games/finishGame.ts (+ test)         (the game-end checkpoint)
PR 2  edit   src/app/api/cron/turntimer/route.ts, src/app/api/game/end/route.ts   (comments only: their `announce` now judges too)
PR 2  new    src/utils/testing/achievementFixtures.ts       (test achievements, one line each)
PR 2  edit   src/utils/testing/apiRoute.ts                  (the fake store's find, gameResultDataStub)
PR 2  edit   src/app/api/game/gameRoutes.test.ts, src/app/api/game/command/outOfTurn.test.ts,
             src/app/api/gameresult/[gameId]/regenerate/route.test.ts, src/app/api/cron/turntimer/route.test.ts
             (their GameResultData mock now goes through gameResultDataStub; the out-of-turn and regenerate tests pin that neither judges)
PR 2  edit   docs/out-of-turn-actions.md
PR 2  edit   ARCHITECTURE.md §5, §6, §7

PR 3  edit   src/utils/mongodb/GameResultData.ts            (achievements + hasResult on getPlayerStats, IAchievementUnlock)
PR 3  edit   src/app/api/stats/route.ts, src/app/api/profile/[userId]/route.ts
PR 3  edit   src/utils/api/gameResultResponse.ts
PR 3  edit   src/app/api/game/[gameid]/route.ts, src/app/api/game/command/route.ts  (unlockedHere)
PR 3  new    src/app/api/achievements/recent/route.ts (+ test)
PR 3  new    src/components/ui/DisclosureSection.tsx        (out of WhatsNew)
PR 3  edit   src/components/WhatsNew.tsx
PR 3  new    src/components/ui/AchievementIcon.tsx
PR 3  new    src/components/ui/AchievementsSection.tsx
PR 3  edit   src/components/ui/ListRow.tsx, src/app/ag-theme.css   (muted)
PR 3  edit   src/app/profile/page.tsx, src/app/profile/[userId]/page.tsx
PR 3  edit   src/app/games/result/[gameId]/page.tsx
PR 3  new    src/components/AchievementToaster.tsx (+ test of its pure part)
PR 3  edit   src/components/Providers.tsx, src/utils/hooks/useGameData.ts
PR 3  edit   src/utils/firebase/notificationContent.ts, src/utils/firebase/notificationPreferences.ts,
             src/utils/games/finishGame.ts, src/app/api/game/command/route.ts
PR 3  new    src/games/DiceCities/achievements.ts, src/games/SettlementsAndCities/achievements.ts (+ tests)
PR 3  edit   src/utils/apiModels/games/hiddenHands.test.ts  (Dice Cities' key set)
PR 3  edit   src/utils/ui/whatsNew.ts, AGENTS.md, ARCHITECTURE.md §8 §11 §12, docs/new-game.md,
             .claude/skills/croupier-review/SKILL.md

PR 4  new    src/games/<Game>/achievements.ts (+ test)      (one commit per game)
PR 4  edit   src/utils/games/achievements.ts                (one registry line each)
PR 4  edit   src/utils/apiModels/games/hiddenHands.test.ts, src/games/BannedIslet/BannedIsletModels.test.ts
PR 4  edit   src/utils/ui/whatsNew.ts
```

## 14. Upkeep

- **"What's new"**: one line in *Enhancements*, in PR 3, something like
  *"Achievements: unlock them as you play (a toast tells you the moment you
  do), see every one a game earned on its results, and yours and your friends'
  on your profiles."*
  - PRs 1 and 2 get none, because a player can't tell they landed.
  - PR 4 widens PR 3's line, or adds one of its own (§13).
- **AGENTS.md** gets a paragraph beside the guide, tutorial and theme ones:
  most games also want an `achievements.ts`, registered in
  `GAME_ACHIEVEMENTS`, following §11. `AchievementIcon` and the toaster join
  the list of shared pieces.
- **ARCHITECTURE.md** is updated in the PR that makes each part true:
  - PR 1: the `AchievementUnlock` subsection in §5;
  - PR 2: the two checkpoints, in §5's `finishGame` bullet and §6's command
    pipeline;
  - PR 3: the `achievements` channel and the `AchievementUnlocked` event in
    §8, the toaster in §11, and in §12 step 9, its table row, and "7, 8 and
    9".

  §15 already links here: that link, and the pointer from
  `docs/profile-pictures.md` §2b, went in with this plan.
- **`docs/new-game.md`** gets a §5 bullet beside `guide.ts` / `tutorial.ts`,
  and this row in the §6 wiring table: *`src/utils/games/achievements.ts` —
  (only if you added an `achievements.ts`) import it and add it to
  `GAME_ACHIEVEMENTS`; without it the game's achievements are never judged or
  shown.*
- **`.claude/skills/croupier-review/SKILL.md`** gets a short section on
  `achievements.ts`:
  - a match check takes the response type;
  - it reads no viewer-only field (`my*`, `resources`, the dev cards, World
    Domination's `cards`, `canUndo`, `autoEndTurnAt`), even though it
    couldn't pass;
  - the view comes only from `tableView`;
  - a game's null view is pinned before it gets a match achievement;
  - descriptions name no hidden specific;
  - no secret achievement ships its text in the bundle.

## 15. Decisions

Rows 1–10 were settled with the product owner, over two rounds of questions.
Rows 11–15 are decided in this plan. Rows 16–18 are left open.

| # | Question | Decision | What reversing or extending it would take |
|---|---|---|---|
| 1 | When are achievements checked? | **At two checkpoints: the end of every turn, and the end of the game** (§4.1). Some achievements only become true as a game ends. | A further checkpoint is one more call to the same judge, with that moment's context. |
| 2 | Unlock mid-game? | **Yes, at the end of the turn it was earned in**, with an optional `notify` push per achievement (§7.4). | Judging after every command instead would need undo to take an unlock back, which is what the turn end avoids. |
| 3 | Where is an unlock celebrated? | **On every screen**, by one app-wide toaster (§7.3). | A server-side "seen" marker would make it follow the player across devices (§7.6). |
| 4 | What does the results page list? | **Every achievement anyone at the table unlocked in that game** (§6, §7.5). | Narrowing career milestones to the viewer's friends is one function in `gameResultResponse`; §6 has the trade-off. |
| 5 | Does an achievement link back to the game that triggered it? | **The unlock does, and the achievement doesn't** (§5.1). The unlock carries `gameId` and `url`, and profile rows link to that game's results once it has finished. | — |
| 6 | How does a check get the game state or the player's stats? | **The judge hands it over.** Each checkpoint gathers what it knows, and each achievement's criteria are typed to take either the table view (plus the result, at game end) or the player's record (§4.1). | A new kind of data is a new field on the context, and a new criteria kind to take it. |
| 7 | Do exhibition (guest) games count? | **No**, same as stats (§8). | A change to `RESULT_COUNTS_FILTER` / `resultCounts`, and the stats with them. |
| 8 | Who can see a player's achievements? | **Whoever can see their stats**, on the profile. On the results page, see row 4. | A privacy setting would gate both together, which is the question `docs/social-features.md` §7 already asks. |
| 9 | Icons | **Emoji, with drawn icons supported from the start** (§7.2). | Nothing further: drawing one is one file and one field. |
| 10 | Does a surrendered game count as played? | **Yes, once it has lasted two turns.** A surrendered or abandoned solo game never does. `turnEnd` achievements are awarded as they're earned, so a surrender can't take them away (§4.1, §8). | Raising `MIN_TURNS_TO_COUNT` is one line. |
| 11 | Backfill at launch | **Lazy**: derived at once for display, and stored as each player finishes a relevant game (§5.3). | A one-shot admin backfill when PR 3 deploys would close the gap where an opponent's account deletion takes back a derived unlock. |
| 12 | What a match check sees | The null-viewer response, built only by `tableView` (§9). | It's load-bearing for mid-game unlocks. Don't reverse it, and don't give `tableView` a viewer parameter. |
| 13 | Judge turns the cron (or `taketurn`) ends? | No (§4.2). | Call `judgeTurnEnd` from the cron after it saves a resolved turn, under `withTimeout`. That costs a Clerk lookup per swept game. |
| 14 | Toast memory across devices | Per browser, for a week (§7.3). | A server-side "seen" marker (the `ChatRead` pattern). |
| 15 | Kingdom Builder | Out of scope (§8). | Its own trigger, designed with seasons. |
| 16 | "Do X in N games" achievements (game state *and* a count)? | Open. | A third criteria kind: a match check whose passes are tallied, once per game, in a stored progress row, and which unlocks at `target`. It's the one thing here that would need progress stored rather than derived (§4.1). |
| 17 | Should achievements unlock anything: avatars, themes? | Open. | `docs/profile-pictures.md` §2b is the natural first. **Before any grant ships:** solo games left out of platform counts, a harder "played" bar (counting turns by the player's own on-turn commands, not `totalTurns`), and a grant re-checked against `GameResult` at selection rather than trusting the stored row. §8 lists the farming paths each of these closes. |
| 18 | Secret achievements, tiers, points? | Open. | A secret one's text has to come from the server once unlocked, not ship in the bundle (§9). Tiers and points are a presentation layer over the same rows. |

### Found while reviewing, outside this plan

Two existing bugs turned up during the reviews. Each needs its own PR, not a
place in this one:

- **The stale-guest sweeper can delete a guest who is still seated.**
  `/api/cron/staleguests` decides from `lastGameEndedAt` alone once a guest has
  any `GameResult`, and only asks `stillHasSomewhereToBe` when they have none.
  So a guest who finished a game more than a week ago, and is sitting in a
  live one, gets deleted. That contradicts `docs/account-less-play.md` §8.
  §4.2 step 1's fail-closed rule keeps achievements safe from it, but the
  sweep itself wants fixing.
- **Smartthink's secret code reaches the codebreaker.**
  `SmartthinkSetSecretCode.myString()` prints the code, `buildTimeline` copies
  it into every snapshot's `command.summary`, and `POST
  /api/game/[gameid]/timeline` checks only membership. So in a two-player game
  the codebreaker can read the code from the match review.

## 16. Rejected, and why

- **Judging only at game end.** This was the first draft's answer. It's
  simpler, but by then the moment is gone, and a surrender would take away
  every achievement a game hadn't yet been judged for.
- **Judging after every command.** It rewards states that can still be undone,
  and the only fix is taking an unlock back after the push has buzzed (§4.1).
- **Replaying each finished game to find "at any turn end" states.** This was
  the first draft's other half. It cost a replay per game end inside the
  cron's budget, it trusted a replay that can quietly drift from the game it
  replays, and it needed a strict mode in `buildTimeline`. Judging live at
  each turn end reads the real document at the real moment, for free.
- **Handing checks the internal state.** It's the easiest thing to write, and
  it's how "win holding an unplayed Knight" would publish a secret. Mid-game,
  it would publish it *during* the game. A sentence telling authors not to
  would be enforced only by review. Instead, `tableView` has the `null` viewer
  written in, and a test that plants sentinels proves it (§9).
- **Judging match achievements on a surrender.** Any player can end a game
  mid-turn, so the state judged would be a moment they chose, not one the game
  settled (§4.1).
- **Declared counts for career criteria** (`count: 'played' | 'won' |
  'differentGames'`, plus a `game` field). This was an earlier draft's form.
  Every new kind of count meant a new enum value in shared code, and nothing
  could stop a game's own achievement counting another game. A `progress`
  function over a typed record keeps the progress display, lets a new count be
  written in one line, and makes the scoping a matter of type (§3.2).
- **Storing nothing, and deriving every unlock on read.** An unlock would then
  vanish when an opponent deleted their account and took the shared results
  with them. There'd be no date and no game to link to, and match achievements
  couldn't be derived at all. So the unlock is stored, and only *progress* is
  derived (§5.3).
- **A profile read that writes the rows it derives.** It would close §5.3's
  accepted exception, but it makes a GET write, and a friend's GET would write
  into someone else's rows. No GET here writes.
- **Putting the link on the achievement.** An achievement is the same for
  everyone. The game that earned it is a fact about one player's unlock, so it
  lives on the unlock (§5.1).
- **Clerk `privateMetadata`.** It's an 8 KB blob, written back whole (a race
  `/api/gameguides` has to work around), and unreadable on a friend's profile
  without one Clerk call per friend (§5.1).
- **Counters on a `UserProfile` document.** There isn't one (§2). The counts it
  would hold already come out of one indexed aggregation over `GameResult`.
- **Progress rows, for anything v1 has.** Progress is `progress(record)`, free
  on both sides. A stored copy would be a second source of truth for a number
  the profile prints right beside it. The one exception would be "do X in N
  games" (§15, row 16).
- **Working out "played" in the Mongo pipeline.** The two-turn rule would then
  live in an aggregation expression as well as in the JS that decides whether
  *this* game tipped something. Stored once, by `countsAsPlayed`, it has one
  home.
- **A rules DSL for match criteria** (JSON conditions over state paths). A
  function over the game's own typed view is shorter, type-checked,
  refactor-safe and unit-testable.
- **A toast per screen.** Each screen that wanted to celebrate would need its
  own feed and its own memory of what it had shown, and they'd disagree. One
  toaster, fed by whichever screen already knows, has one memory (§7.3).
- **Feeding the toaster from push events alone.** The mover's own mid-game
  unlocks never get a push, and nor does any unlock not marked `notify`. The
  board's response and the results page's list are what make those prompt
  (§7.3).
- **A push for every unlock.** A small achievement isn't worth buzzing a phone
  mid-game. The toast is the default, and `notify` is the opt-in (§7.4).
- **A separate push for game-end unlocks.** It would be the third notification
  at the end of one game. The game-over push carries a clause instead (§7.4).
- **A badge grid with a detail modal.** That's a new component used by one
  screen, and a second way to draw an achievement beside the results page's
  rows. It also hides the requirement behind a tap on a phone. `ListRow`
  already shows everything a badge and its modal would (§7.5). A grid can come
  later, as a presentation change over the same data.
- **`NamedChip` on the results page.** It's the in-board hand chip:
  card-styled, with a tiny label, and a description in a hover `title` that a
  phone never shows.
- **Putting the registry in `src/utils/ui/`** with the guide and tutorial ones.
  Part of an achievement is a rule the server runs, and that folder is for
  presentation (§3.1).
