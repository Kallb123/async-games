# Achievements — plan

**Status: plan, nothing built yet.** §13 has the build order: four PRs, the
first two changing nothing a player can see, the third turning the feature on.
The design has been reviewed by all five reviewers, and the product owner has
settled its open questions; §15 records both.

An **achievement** is something a player unlocks by doing a particular thing,
either inside one game or across many:

- across games: "Play 5 games of Settlements & Cities", "Win 5 games of Dice
  Cities", "Finish a game of 5 different games";
- inside one game: "Own all six Mines in a game of Dice Cities".

Every achievement has:

- a **title**;
- an **icon**: an emoji, or a drawn picture when one exists;
- a **description**: the requirement, in the player's words;
- **criteria**: the same requirement, in code;
- optionally, a **notify** flag: whether earning it mid-game sends a push.

Games write their own, in an `achievements.ts` beside `guide.ts` and
`tutorial.ts`, and a registry collects them the same way. The platform owns a
few more that no single game can.

**Achievements unlock during the game, at the moment they're earned**, not
saved up for the end, where the moment that earned one may have been
forgotten. This document settles:

- what an achievement *is*, as data (§3);
- when the server decides one has been earned (§4);
- where an unlock is kept (§5);
- what a check is allowed to see (§9);
- what the player sees (§7);
- how it ships (§13).

## Contents

1. [What a player gets](#1-what-a-player-gets)
2. [What already exists to build on](#2-what-already-exists-to-build-on)
3. [An achievement, as data](#3-an-achievement-as-data)
4. [When an achievement is judged](#4-when-an-achievement-is-judged)
5. [Storage: one flat collection of unlocks](#5-storage-one-flat-collection-of-unlocks)
6. [API: no new routes](#6-api-no-new-routes)
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

### In the game, at the moment it happens

When a turn ends with a player having earned something, **the achievement
unlocks there and then**:

- **The board celebrates it.** The next time the earner's board refreshes
  (straight away for a push-driven refresh, or within one poll), it shows the
  app's toast: *"🏆 Achievement unlocked · Mine Baron"*. Every unlock gets
  this, and it's shown once per browser.
- **The phone buzzes**, if the achievement says so. An achievement marked
  `notify` also sends the earner a push, on a new *Achievements* channel they
  can switch off in Settings. That's the one to use for the big moments, and
  for the ones a player can earn on somebody else's turn, while they aren't
  looking.

"The end of a turn" is precise on purpose. It's the moment the turn can no
longer be taken back (§4.1): in a one-move turn it's straight away, and in a
Dice Cities turn it's once the ten-second undo hold has passed.

### When the game ends

- **The game-over push** names anything the game's *ending* unlocked, after
  the copy it already has: *"You beat Priya in 14 turns. Line up a rematch? 🏆
  Unlocked Mayor"*. Unlocks earned earlier in the game have already had their
  moment, so the push doesn't repeat them.
- **The result page** lists everything that game unlocked. Anyone the page
  lets in sees what was *won in that game*. A milestone the game tipped over
  ("your fifth Dice Cities win") is shown only to the player who earned it
  (§6).

### On profiles

**Your profile** has an *Achievements* section. It starts with a count (how
many you've unlocked, out of how many exist), then lists every achievement one
row each, grouped:

- the platform's own first;
- then one group per game you've played;
- then the games you haven't played, folded away.

Every row is the ordinary `ListRow`: icon, title, requirement underneath, and
on the right the date it was unlocked or how far along you are. Locked rows are
muted.

```
  ┌──────────────────────────────────────┐
  │ Achievements · 7 of 31               │
  │                                      │
  │ Everything                           │
  │ [🏆] First win                 3 Oct │
  │      Win a game.                     │
  │ [🧭] Explorer                    3/5 │
  │      Finish a game of 5 different…   │
  │                                      │
  │ Dice Cities                          │
  │ [🏙️] Mayor                    12 Oct │
  │      Win 5 games of Dice Cities.     │
  │ [⛏️] Mine Baron                  —   │
  │      Own all six Mines at the end…   │
  │                                      │
  │ › 8 games you haven't played         │
  └──────────────────────────────────────┘
```

**A friend's profile** shows the same section, read-only. Achievements are
shown to exactly the people who can already see that player's stats.

## 2. What already exists to build on

Most of this rests on pieces the repo already has. The new work is:

- a registry;
- one small collection;
- a judging step at two points the server already runs;
- a handful of UI changes.

| What | Where | What achievements use it for |
|---|---|---|
| **The end of a turn, after the save** | `POST /api/game/command`'s `after()`, the block that sends `YourTurn` | Mid-game judging (§4.2). It already runs after the response has gone, only on a turn-ending move, and it already loads the roster from Clerk. So checking for guests there costs nothing extra. |
| **The one place a game ends** | `finishGame()` / `announceGameOver()` in `src/utils/games/finishGame.ts` | Judging at game end (§4.3). Every ending goes through here: the command route's game-over branch, `POST /api/game/end`, and the turn-timer cron's two paths (its abandon, and `finishPlayedOut`). |
| **`GameResult`**, one per finished game | `src/utils/mongodb/GameResultData.ts` | Counting achievements. Games played and won per game come out of one aggregation (`getPlayerStats` → `byGame`), and `outcomeFor` is the single rule for what a game was worth to a player. |
| **`RESULT_COUNTS_FILTER`** | same | Which games count. A game with a guest who hasn't claimed their account is an exhibition match. It counts toward nobody's stats (`docs/account-less-play.md` §8), and so toward nobody's achievements. |
| **Every game's response builder, with a null viewer** | each game's `IReplayAdapter.toResponseState(…, null, …)`, pinned by `src/utils/apiModels/games/hiddenHands.test.ts` | What a check is allowed to see (§9): the game as everyone at the table sees it, with nobody's hand in it. |
| **Per-game registries with guard tests** | `src/utils/games/recap.ts` (one import per game), `GAME_GUIDES` / `GAME_TUTORIALS` / `GAME_THEMES`, `src/games/gameRegistry.test.ts` | The shape of `GAME_ACHIEVEMENTS`. Each game owns its file, the registry gets one import and one line per game, and a test fails CI if a game ships the file but misses the line. |
| **Profile screens and their gate** | `src/app/profile/page.tsx`, `src/app/profile/[userId]/page.tsx`, `/api/stats`, `/api/profile/[userId]` (`areFriends`) | Where achievements show, and who may see them. Both screens already fetch `byGame`. |
| **The game response, and the hook every board reads it through** | `GET /api/game/[gameid]` and the command route's response, which both attach reactions the same way; `useGameData` | Handing the viewer their own unlocks from this game, and celebrating the new ones, on every board at once (§7.3). |
| **The result page and its gate** | `src/app/games/result/[gameId]/page.tsx`, `gameResultResponse` | "Unlocked in this game". Open to the game's players and their friends, and already built from `ListSection` + `ListRow`. |
| **Push copy, channels and the toast** | `notificationContent.ts`, `notificationPreferences.ts` (`ALL_NOTIFICATION_CHANNELS`), `ToastContext` | The `AchievementUnlocked` push, its channel, the game-over clause and the in-game toast. |
| **A deadline for non-fetch work** | `withTimeout` (`src/utils/withTimeout.ts`) | Keeping a slow judging step from holding anything else up (§4). |
| **The art pipeline** | `/art-masters`, `npm run optimise-art`, `public/art/` | Drawn icons (§3.1, §7.2). |
| **Account deletion** | `POST /api/user/delete` | Removing a player's unlocks along with the rest of their data. |
| **UI pieces** | `ListSection`, `ListRow`, the `ag-disclosure` fold in `WhatsNew` | All of §7. There's no new visual component beyond the icon. |

**A correction to the other docs.** `docs/social-features.md` §5 described a
`UserProfile` collection of incrementally updated aggregates as built. It never
was: stats are aggregated from `GameResult` whenever a profile is read. That doc
and `docs/profile-pictures.md` are corrected in the same PR as this plan.

## 3. An achievement, as data

### 3.1 The shape

The shapes and the registry live in `src/utils/games/achievements.ts`, beside
`recap.ts`, which is the same idiom: a cross-game registry with one import per
game. They don't go in `src/utils/ui/` with the guide and tutorial registries,
because part of an achievement is a rule the server runs, and that folder is
for presentation.

```ts
// src/utils/games/achievements.ts
import type { IGameStats, MatchOutcome } from "@/utils/mongodb/GameResultData";

/** One thing a player can unlock. Authored as data, one list per game. */
export interface Achievement<R = unknown> {
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
     * A drawn icon, as a path under /art/achievements/ — shown wherever the
     * icon is, in place of the emoji. Optional, and nothing else changes when
     * one is added (§7.2).
     */
    art?: string;
    /** The requirement, in the player's words: "Own all six Mines at the end of a turn." */
    description: string;
    /**
     * Push the earner when this unlocks mid-game. The board celebrates every
     * unlock either way; this is for the ones worth buzzing a phone over.
     * Only meaningful on an `at: 'turnEnd'` achievement (§12 test 1).
     */
    notify?: boolean;
    criteria: CareerCriteria | MatchCriteria<R>;
}
```

`description` is the requirement written for the player, and `criteria` is the
same requirement written for the server. Having both means a locked row can say
what it's waiting for without the UI turning a predicate into prose.

Both imports from `GameResultData` are `import type`, and they must stay that
way. This file is also loaded in the browser (§7), and `GameResultData` pulls
in Mongoose at runtime. §12's test 1 checks for this.

There are two kinds of criteria, for two kinds of achievement, and each is
judged differently.

### 3.2 Career criteria: counted across games

"Play 5 games of Settlements & Cities", "Win 5 games of Dice Cities", "Finish
a game of 5 different games". These are counts, so they're **declared, not
coded**:

```ts
export interface CareerCriteria {
    kind: 'career';
    /** Games played (§8), games won, or different games played. */
    count: 'played' | 'won' | 'differentGames';
    /** How many it takes. */
    target: number;
    /** A GAME_META slug. Absent counts every game. Unused by 'differentGames'. */
    game?: string;
}
```

A counting achievement has to be data, not a function, because while it's
locked the profile shows how far along the player is. That number is needed in
two places, from data both already have:

- the server, deciding whether to unlock it;
- the profile, drawing the progress.

Both have the `IGameStats[]` (`byGame`) that `getPlayerStats` returns, so one
pure function works it out for both:

```ts
/** How far `byGame` has got toward `criteria`. Met once it reaches `target`. */
export function careerProgress(criteria: CareerCriteria, byGame: IGameStats[]): number {
    const games = criteria.game ? byGame.filter(g => g.url === criteria.game) : byGame;
    switch (criteria.count) {
        case 'played': return games.reduce((n, g) => n + g.played, 0);
        case 'won': return games.reduce((n, g) => n + g.wins, 0);
        case 'differentGames': return byGame.filter(g => g.played > 0).length;
    }
}

/** The career achievements in `catalogue` that `byGame` already meets. */
export function careerMet(catalogue: Achievement[], byGame: IGameStats[]): Achievement[];
```

A win is whatever `outcomeFor` says: a co-op team win counts, and a dropped
player's game doesn't. `byGame` has already been folded through `outcomeFor`,
so the rule isn't written a second time.

**"Played" is `played`, not `total`.** `IGameStats` gains a `played` count
beside the `total` the profile shows. The two differ in one case: a game ended
by a surrender or an abandonment counts as played only once it has lasted two
turns (§8). So an achievement's progress can sit one or two short of the
profile's match count, because it skips the games somebody ended almost as
soon as they began.

`careerMet` is the one place that answers "which of these does this history
meet?". Both the profile read (§5.3) and the game-end judging (§4.3) call it.

### 3.3 Match criteria: decided inside one game

"Own all six Mines in a game of Dice Cities", "Win holding both Longest Road
and Largest Army". These depend on the state of one game, so they're **a
function over that game's state**, specifically, over the state *as the table
saw it*:

```ts
export type MatchCriteria<R> =
    /** Judged live at the end of every turn, and once more on the finished game. */
    | { kind: 'match'; at: 'turnEnd'; check: (view: R, userId: string) => boolean }
    /** Judged once, when the rules end the game: for anything that needs the result. */
    | { kind: 'match'; at: 'end'; check: (view: R, userId: string, outcome: MatchOutcome) => boolean };
```

`R` is the game's **response** type, from its browser-safe `apiModels.ts`. The
check is handed what that game's own response builder gives a viewer who holds
no seat, and never the server's internal state. §9 explains why that matters.
In short, it turns "a check can only reward what the table could see" into a
property of the types, not a sentence for reviewers to remember. It's also what
makes announcing an unlock mid-game safe.

- **`turnEnd` is the default.** It's for anything about the state of the board
  ("own all six Mines", "have ten cities"). It unlocks the moment it's true at
  a turn's end, and it can't be lost to a surrender later (§4).
- **`end` is for anything that needs the result** ("win holding…"), which
  doesn't exist until the game is over. Its check is the only one handed the
  player's `outcome`.

A check is **pure, synchronous and fast**: no I/O, no clock, no randomness. The
type makes most of that true (it returns a `boolean`, not a promise), and §11
covers the rest.

### 3.4 An example, end to end

The Dice Cities file:

```ts
// src/games/DiceCities/achievements.ts
import type { Achievement } from "@/utils/games/achievements";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesCardIds } from "./cards";

/** Every establishment in the base market comes six to a pile. */
const MINES_IN_THE_GAME = 6;

function owned(view: IDiceCitiesGameStateResponse, userId: string, card: string): number {
    return playerByUserId(view, userId)?.cards.find(c => c.card === card)?.amount ?? 0;
}

export const achievements: Achievement<IDiceCitiesGameStateResponse>[] = [
    {
        id: 'dicecities.mayor',
        title: 'Mayor',
        icon: '🏙️',
        description: 'Win 5 games of Dice Cities.',
        criteria: { kind: 'career', count: 'won', target: 5, game: 'dicecities' },
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
            check: (view, userId) => owned(view, userId, DiceCitiesCardIds.MINE) >= MINES_IN_THE_GAME,
        },
    },
];
```

Five things are worth noticing:

- **It counts to six, rather than asking "does anyone else hold one?"** The
  second version looks more general, but it goes wrong once a player has been
  dropped. Dice Cities' dropout adapter takes a dropped seat's cards out of the
  game rather than returning them to the bank, so "nobody else has any" can be
  true for a player holding three.
- **It's `turnEnd`.** It unlocks at the end of the turn in which the sixth Mine
  arrived. That turn might be the earner's own purchase, or an opponent's
  Business Center swap that handed them one. A later swap taking a Mine away
  doesn't matter, because the achievement is for having owned them all.
- **It's `notify`.** Owning every Mine is rare enough to deserve a push, and
  the swap case means it can happen while the earner isn't looking.
- **Dice Cities has no hidden state.** Every viewer already gets `bankCards`
  and every seat's `cards`, so the table's view is the whole game, and the
  check loses nothing by being handed it.
- **Every runtime import is browser-safe.** `cards.ts` is static data,
  `GameDataApi`'s `playerByUserId` imports only types, and the rest is
  `import type`.

### 3.5 The registry

The same idiom as `recap.ts` and `GAME_GUIDES`: one import and one line per
game.

```ts
// src/utils/games/achievements.ts
import { achievements as diceCitiesAchievements } from "@/games/DiceCities/achievements";
import { achievements as settlementsAndCitiesAchievements } from "@/games/SettlementsAndCities/achievements";

/** Keyed by GAME_META slug. A game with no achievements.ts has no entry. */
export const GAME_ACHIEVEMENTS: Record<string, Achievement<any>[]> = {
    dicecities: diceCitiesAchievements,
    settlementsandcities: settlementsAndCitiesAchievements,
};

/** The cross-game ones. Owned by the platform, not by any game. Career only (§11). */
export const PLATFORM_ACHIEVEMENTS: Achievement[] = [
    { id: 'platform.first-win', title: 'First win', icon: '🏆',
      description: 'Win a game.',
      criteria: { kind: 'career', count: 'won', target: 1 } },
    { id: 'platform.regular', title: 'Regular', icon: '🎲',
      description: 'Play 25 games.',
      criteria: { kind: 'career', count: 'played', target: 25 } },
    { id: 'platform.explorer', title: 'Explorer', icon: '🧭',
      description: 'Play 5 different games.',
      criteria: { kind: 'career', count: 'differentGames', target: 5 } },
];

/** Every achievement, by id. An unknown id comes back undefined, and readers drop it. */
export function achievementById(id: string): Achievement | undefined;

/** Stored unlocks, plus every career achievement `byGame` already meets (§5.3). */
export function unlockedIds(stored: string[], byGame: IGameStats[]): Set<string>;
```

`achievementById` never throws, the same as `themeIdFor`
(`docs/game-themes.md` §4). A stored id the catalogue no longer knows is
dropped quietly, never an error.

## 4. When an achievement is judged

### 4.1 At the end of every turn, and when the game ends

There are two judging points, and every achievement kind has its place:

| Kind | Judged | Why there |
|---|---|---|
| Match, `at: 'turnEnd'` | **At the end of every turn**, and once more on the final state of a game the rules ended | So it unlocks while the moment is fresh, and a later surrender can't take it away |
| Match, `at: 'end'` | When the rules end the game (`endReason` `win`, `teamwin` or `teamloss`) | It needs the result, which only exists then |
| Career | When the game ends, however it ended | It counts finished games, and a game becomes one only when it ends |

**Why the end of a turn, and not after every command:**

- **Undo.** A Dice Cities purchase can be taken back inside its ten-second
  hold, and a Settlements & Cities placement can be taken back until the
  player moves on (`docs/undo.md`). A player who bought a sixth Mine and undid
  it never owned six Mines.
  - The end of a turn comes after every undo that turn could make. Judging
    only there means an undone state can never be rewarded, without any check
    having to think about undo.
  - It also means an unlock never has to be taken back. That can't be done
    kindly once a phone has buzzed.
- **"When the event occurs" still holds.** Most turns are one move (Snakes &
  Ladders, most of Dice Cities), so the end of the turn is the moment of the
  event. In a multi-move turn (a Settlements & Cities turn that rolls, builds
  and builds again), it arrives when the player hands the turn on: seconds
  later, and while the turn is still in their head.

**Why only a rules ending judges `end`, and the final state:**

- **A surrender can stop anywhere.** Any seated player can `POST
  /api/game/end` at any time: mid-turn, on someone else's turn, or inside an
  undo hold. The state at that moment is one a player picked, not one the game
  settled, so nothing is judged on it.
- **Nothing earned is lost to a surrender.** Every `turnEnd` achievement has
  already been judged at every turn end before it. Whatever a player had
  earned was awarded when they earned it, and an opponent ending the game
  can't take it back. That, and counting a surrendered game as played once it
  has lasted two turns (§8), are the two answers to "someone could end the
  game to take away your chance of an achievement".

**Hidden information** is the reason this design needed care. An unlock
announced mid-game is a statement about a game still being played. §9 makes it
safe by construction: a check sees only what the whole table can see, so an
unlock can never reveal more than the board already shows.

### 4.2 At the end of a turn

The command route already has a block that runs only on a turn-ending move,
after the save, in `after()`. It's where the `YourTurn` push is built and sent.
Judging goes into that block, after the push, in its own `try`, under
`withTimeout`:

```
POST /api/game/command, a move that ends the turn:
  … save, respond …
  after():
    1. usersById(gameData.userIdList)                (already there)
    2. send YourTurn to the next player              (already there)
    3. unlocked = await withTimeout(                 NEW
           () => judgeTurnEnd(gameData, userList),
           TURN_END_BUDGET_MS, NO_UNLOCKS, `Judging achievements for ${gameId}`)
    4. push AchievementUnlocked to each earner of a `notify` achievement
```

`judgeTurnEnd` lives in `src/utils/games/awardAchievements.ts` and is
server-only. It goes through these steps:

0. **Is there anything to judge?** If this game has no `turnEnd` achievements,
   return. This costs nothing until a game has some.
1. **Does the game count?** Ask `resultCounts` about the unclaimed guests
   `unclaimedGuestsOf(userList)` finds. `resultCounts` is exported beside
   `RESULT_COUNTS_FILTER` so the rule has one home.
   The roster is already loaded, so this costs nothing. If it doesn't count,
   stop: an exhibition match earns nobody anything (§8).
2. **Who's being judged?** The roster, minus `droppedPlayers`. That's every
   seat, not just the mover, because a move can hand someone else their
   achievement (the Business Center swap).
3. **What do they already hold?** One read, served by the unique index:
   `AchievementUnlock.find({ userId: { $in: seats } })`. A seat that holds all
   of this game's `turnEnd` achievements is done.
4. **The view.** Build `adapter.toResponseState(gameData.specificGameState,
   identityMap, null, commandHistory)` once, from the live document the move
   just saved. There's no replay.
5. **Check.** For each seat, and each `turnEnd` achievement it lacks, run
   `check(view, userId)`, each in its own `try`. One broken check costs only
   its own achievement for this turn, and a warning.
6. **Write.** `recordUnlocks` (§5.2) upserts what passed, with this game's
   `gameId` and `url`, and hands back only the rows it actually inserted.
   Those, and only those, get celebrated and pushed.

**Turns the route doesn't see.** The turn-timer cron also ends turns: it plays
a stalled turn out through the game's own commands, or advances past it. Those
turn ends aren't judged. A state that's still true is caught at the next turn
end the route sees, or on the final state. Only a state that exists *solely*
at the end of a timed-out turn is missed. That's rare, and it's cheaper than
adding a Clerk lookup and a push to every cron sweep.

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
  4. the GameOver pushes, each naming that player's `unlocked` (§7.4)
```

`judgeGameEnd` shares steps 0 to 3 and 6 with `judgeTurnEnd`. In between:

- **Match**, on a rules ending only: every `turnEnd` achievement a seat still
  lacks, judged once more on the finished game's view, and every `end`
  achievement, judged with that seat's `outcome`. The game-ending move is
  judged here rather than in §4.2, because it goes down the route's game-over
  branch instead of the turn-end block.
- **Career**, only if `recorded`: the game that just finished must be in
  `byGame` before "Win 5" is checked, and `byGame` is read from `GameResult`.
  If the record failed, career achievements catch up at the player's next
  finished game, so they never get ahead of the stats beside them.
  - **Which achievements.** For each seat, the career achievements this game
    *could* have advanced: the platform's, plus this game's own. A seat that
    already holds all of them is skipped. That's the usual case for a heavy
    player, and it's how they avoid paying a full-history aggregation every
    time a table they sit at finishes.
  - **The read.** Otherwise, read `byGame` through
    `getGameStatsByPlayer(userId, gameType?)`, narrowed to the
    `{ playerIds: 1, gameType: 1 }` index when only this game's own
    achievements are missing. Then run `careerMet`.
  - **Tipped or backfilled?** Sort each newly met achievement into one of two
    kinds:
    - **Tipped by this game.** Progress *without* this game is still short of
      `target`. That means played − 1 (if this game counts as played), won − 1
      (if this game was a win), and for `differentGames`, whether this game's
      `played` is 1. These are stored with this `gameId` and `url`, and
      announced.
    - **Backfilled.** It was already met before this game, as happens to
      every veteran at launch. These are stored without a `gameId`, and not
      announced (§5.3).
- **Ordering.** The career half depends on `recorded`; the match half reads
  `gameData`, not `GameResult`, so it doesn't. Judging comes before the pushes,
  so a push can name what the ending unlocked. It's under `withTimeout`, so it
  can never be the reason a table doesn't hear its game has ended: on a throw
  or a stall it answers with no unlocks, the pushes go out without the clause,
  and the late work is logged.

### 4.4 What it costs

- **At a turn end, in the common case:**
  - one indexed read;
  - one view built from the live document;
  - a handful of microsecond checks.

  This happens after the response, in the same `after()` that already replays
  the whole game to write the next player's `YourTurn` body. By comparison
  it's noise.
- **A write only when something unlocks**, which is at most once per player
  per achievement, ever.
- **At game end:** the same, plus one aggregation per seat that could still
  earn a career achievement from this game.
- **No replay, anywhere.** Judging live at each turn end is what makes one
  unnecessary. An earlier draft replayed each finished game to find "at any
  turn end" states, and paid for it in the cron's budget, in replay drift and
  in a strict mode for `buildTimeline` (§16).
- **The cron**, which `await`s `announce()` inline against its deadline, pays
  only the game-end cost, and that's capped by `withTimeout`.

## 5. Storage: one flat collection of unlocks

### 5.1 `AchievementUnlock`

`src/utils/mongodb/AchievementUnlockData.ts` is a flat collection, like
`ChatRead`: not a discriminator, and not a field on `GameData` or `GameResult`.

```ts
interface IAchievementUnlockData {
    userId: string;         // Clerk userId
    achievementId: string;  // "dicecities.mine-baron"
    unlockedAt: string;     // ISO
    gameId?: string;        // the game that earned it; absent when backfilled (§4.3)
    url?: string;           // that game's GAME_META slug, kept for when its result is gone
}
```

- **`{ userId: 1, achievementId: 1 }`, unique.** A player holds each
  achievement at most once. The index's `userId` prefix serves every read this
  collection gets:
  - the profile;
  - judging's "what do they hold" (§4.2 step 3);
  - account deletion;
  - the viewer's unlocks on the game response
    (`{ userId: viewerId, gameId }`, §7.3);
  - the result page (`{ userId: { $in: result.playerIds }, gameId }`, rather
    than a bare `{ gameId }` that no index would serve).
- **`gameId` and `url` are on every row except a backfilled one.** Every match
  unlock, and every career unlock a game tipped over, belongs to that game,
  and that's what lets the result page say *"unlocked in this game"*.
  - `url` is copied onto the row rather than looked up later. When *any*
    player at a table deletes their account, `api/user/delete` removes that
    game's `GameResult` and `GameData`. "In a game of Dice Cities" shouldn't
    vanish with someone else's account.
- **Why not on `GameResult`?** A `GameResult` belongs to one game, and it
  doesn't exist until the game ends. An achievement belongs to one player,
  unlocks mid-game, and a career one spans many games.
- **Why not in Clerk metadata?** It's an 8 KB blob that has to be read back
  whole to write it, which is the race `/api/gameguides` has to work around.
  A friend's profile would also need one Clerk call per friend.

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

The *new* unlocks are the ones in `upsertedIds`. That matters because two
judging passes can decide the same player has just earned the same thing:

- two turn ends in quick succession, whose `after()`s overlap;
- two of a player's games finishing at once, both deciding "Win 5".

Both upsert, one inserts, and only that one gets celebrated, pushed and named.
Usually the server retries the loser as a quiet update. When it doesn't, the
loser comes back as an 11000 in a `MongoBulkWriteError`. `recordUnlocks`
catches that error and:

- treats `err.result`'s upserted ids as the new rows;
- treats duplicate-key write errors as "already held";
- rethrows anything else.

So one race costs one duplicate nothing, not every seat its unlocks. A plain
`insertMany`, or catching the error with `isDuplicateKeyError`
(`duplicateKey.ts`, which only looks at the top-level code), would swallow the
answer to "which rows are new".

**The unique index has to exist before the first write.** The repo relies on
Mongoose's `autoIndex`, and a `bulkWrite` doesn't wait for an index build. If
two upserts of the same pair land before the index exists, both insert, the
build fails on the duplicate, and uniqueness is gone for good. The PR split
closes that window: PR 2 loads the model with nothing to write. PR 3 then
checks the index exists in production before the catalogue ships (§13).

### 5.3 Reading it: stored ∪ met

On the profile:

```
unlocked = stored unlock ids  ∪  careerMet(catalogue, byGame)
```

That one line (`unlockedIds`) means three cases need no script:

- **Launch.** A player with twenty Dice Cities wins sees *Mayor* unlocked the
  moment achievements ship. It shows with no date until their next finished
  game that could advance it stores it as backfilled: dated, with no game
  named, and not announced (§4.3). So on launch day, a veteran's first
  game-over push doesn't read "Unlocked First win and 4 more".
- **A guest claims their account.** Their exhibition games start counting the
  moment `api/user/claim` `$pull`s `unclaimedPlayerIds`. Their career
  achievements appear on the next profile read, and so do the other players'
  in those games.
- **An opponent deletes their account.** `api/user/delete` removes every
  `GameResult` that player was in, so someone else's `byGame` can go *down*.
  A stored unlock stays: an achievement once *stored* is never taken away.
  That's why career unlocks are stored at all, rather than derived on every
  read (§16).

**One accepted exception.** An unlock that's only *derived* (met, but not yet
stored) can vanish if an opponent from the games that met it deletes their
account first. It needs an account deletion inside that window, and the window
closes as the player plays. The alternative, a profile read that writes, is
rejected in §16. **No GET writes.** `getPlayerStats`, `unlockedIds` and the
game response only read, so a friend viewing a profile can never cause a write
into somebody else's rows.

**Match achievements** have no "met" half. They're unlocked only if a row says
so.

### 5.4 Deletion

- **`POST /api/user/delete`** gains
  `AchievementUnlockModel.deleteMany({ userId }).exec()`, next to the reactions
  line, and its route test checks it.
  - It deletes by *user*, not by game: an unlock belongs to the player, not
    the table, so other players' unlocks from the same games stay theirs.
  - A judging pass still running in some `after()` can land a row after the
    delete. That's the same race `recordGameResult` already has on that route
    (§10).
- **`/api/dev/clearresults`** wipes this collection along with `GameResult`,
  so a dev database isn't left holding unlocks for results it no longer has.

## 6. API: no new routes

Every read that needs achievements already exists and already carries the
right gate. So this plan adds fields, not routes.

**Nothing a client sends is read when deciding an unlock.** A turn-ending
move, a finishing move or a surrender can *start* judging. But judging reads
only server-built state, and randomness the server itself recorded. There is
no write route at all.

| Route | Gains | Gate (unchanged) |
|---|---|---|
| `GET /api/stats` | `achievements: IAchievementUnlock[]` | Signed in, your own |
| `GET /api/profile/[userId]` | `achievements: IAchievementUnlock[]` | Self or an accepted friend (`areFriends`) |
| `GET /api/game/[gameid]`, and the command route's response | `unlockedHere: string[]`: **the viewer's own** unlocks in this game, by id | A player in the game |
| `GET /api/gameresult/[gameId]` (and `POST …/regenerate`, which shares `gameResultResponse`) | `achievements: { userId, id }[]`: this game's match unlocks for every seat, and its career unlocks **for the viewer's own seat only** | A player in the game, or a friend of one |

```ts
// src/utils/mongodb/GameResultData.ts, beside IPlayerStats,
// re-exported as a type from src/app/api/stats/route.ts like IGameStats.
export interface IAchievementUnlock {
    id: string;
    unlockedAt: string;
    gameId?: string;
    url?: string;
}
```

- **Both profile routes change.** `getPlayerStats` reads the unlocks, so that
  read has one home. But `api/stats/route.ts` and `api/profile/[userId]/route.ts`
  each pick `{ recent, byGame }` off it and build their own JSON, so each gains
  `achievements` explicitly.
- **Both game responses change, through one helper.** The game GET and the
  command route already build the game response and attach reactions the same
  way (`attachHistoryReactions`). `unlockedHere` is attached beside it by one
  shared helper. It's skipped entirely, with no read, for a game with no
  achievements registered. This is the one addition to the most-polled route
  in the app, so it's one indexed read, bounded by the size of the catalogue.
- **`unlockedHere` is the viewer's own and nobody else's.** What *you*
  unlocked this game is yours to be shown. What the others unlocked is on the
  result page, once the game is over.
- **The result page filters career unlocks, inside `gameResultResponse`**
  (so the regenerate route gets the same filter). The page is open to a friend
  of *any* player, and that friend might not be a friend of the player whose
  milestone it is. For example:
  - Carol is friends with Alice, so she can see game G, which Alice and Bob
    played.
  - She isn't friends with Bob, so she can't see Bob's stats.
  - If G's result said *"Bob unlocked Mayor"*, it would tell her Bob had
    exactly five Dice Cities wins when G ended.

  So a career milestone goes only to its earner. Match unlocks are a fact
  about *this* game, judged on what the table saw (§9), so they go to everyone
  the page lets in.
- **Regenerate never judges.** `POST /api/gameresult/[gameId]/regenerate`
  replays a game when a player asks it to. It must never call the judging
  functions, or it would become a way to get a game re-judged on demand.
- **Only ids go over the wire.** Title, icon, art and description are looked
  up from the catalogue on the client, so the copy has one home and a typo fix
  doesn't need a migration.

Every change is additive: no existing client breaks and no request shape
changes.

## 7. UI

### 7.1 The catalogue is on the client

The profile screens, the result page and the in-game toast import
`GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS`. That's why a game's
`achievements.ts`, and everything it imports, has to be browser-safe (§3.4,
§12 test 1). The `check` functions come along too. They're a handful of small
pure functions over response types the client already holds, so they reveal
nothing: they're rules, not state.

### 7.2 Icons, emoji or drawn: `AchievementIcon`

`AchievementIcon` (`src/components/ui/`) is the one place an achievement's
icon is drawn:

- **A drawn icon**, if `art` is set: `next/image` inside the same
  `ag-icon-box` that `ListRow` puts an emoji in, so the two are the same size
  in the same row. Its `onError` falls back to the emoji, so a missing file
  degrades to the emoji and never to a broken image (the rule `Avatar` already
  follows).
- **Otherwise the emoji**, boxed the same way.

Drawn icons go through the art pipeline every game's art does:

- **Masters** are saved to `art-masters/achievements/<game slug or platform>/<name>.png`.
- **The served copies** are written to `public/art/achievements/…` by
  `npm run optimise-art`.
- **Size:** drawn square at 256 × 256, which covers the 36 px row box at
  every pixel density and the push image.

Adding a drawn icon to an achievement is then one file and one field. §12
test 1 checks every `art` path exists, so a typo fails CI rather than quietly
showing the emoji.

The push takes the drawn icon too (§7.4). The emoji stays in the push's text,
in the game-over clause and in the toast, wherever the icon has to be a
character.

### 7.3 In the game: the toast

- **Where the data comes from.** Every board already reads its game through
  `useGameData`, and the response now carries `unlockedHere` (§6).
- **What shows it.** `useUnlockToasts` (`src/utils/hooks/`) is called once
  inside `useGameData`, so every board gets the moment without adding a line
  of its own. It shows the app's existing toast (`ToastContext`) for each id
  it hasn't celebrated before: *"🏆 Achievement unlocked · Mine Baron"*.
- **Only once.** What's been celebrated is remembered per browser with
  `useStoredValue`, as a bounded list of `gameId:achievementId` pairs. So
  reopening a board doesn't celebrate an old unlock again, but coming back to
  one you earned while you were away (the swap case) does.
- **How quickly it shows.** The earner's board fetches after the turn ends:
  - immediately, for a `notify` achievement: its push fires an
    `AchievementUnlocked` window event, which joins the events `useGameData`
    refreshes on;
  - otherwise within one poll, since the turn has just passed to somebody
    else and a watched board polls every ten seconds.
- **Unit-tested.** The decision of which ids are new is a pure function, so it
  gets a plain unit test.

### 7.4 Pushes

**The mid-game push**, for an achievement marked `notify`:

- **Event and copy.** It's an `AchievementUnlocked` event with this copy:
  *"🏆 Achievement unlocked — Mine Baron: own all six Mines at the end of a
  turn."* The copy comes from `buildAchievementNotification` in
  `notificationContent.ts`, like every other piece of push copy.
- **Recipient.** It goes only to the earner. If one turn end unlocks two
  `notify` achievements for the same player, they get one push naming the
  first "and 1 more".
- **Channel.** It uses a new **`achievements`** channel, added to
  `ALL_NOTIFICATION_CHANNELS` and the Settings list (*"When you unlock an
  achievement during a game"*), on by default. That file's rule is that every
  channel needs something that sends on it, and this one has.
- **Image.** It's the achievement's drawn icon when there is one, and the
  game's own art otherwise.
- **Link.** Tapping it opens the game's board, where the toast is waiting.
- **Tag.** Its notification tag is `AchievementUnlocked:<gameId>`, so a
  second unlock in the same game replaces the first on the lock screen instead
  of stacking beside it.

**The game-over push.** The three builders (`buildGameWonNotification`,
`buildGameLostNotification`, `buildTeamResultNotification`) stay as they are.
`notificationContent.ts` gains one helper:

```ts
/** `notification` with "🏆 Unlocked Mayor" (or "… and 2 more") after its body. */
export function withUnlocked(notification: PushNotification, unlocked: Achievement[]): PushNotification;
```

- **The clause survives truncation.** `gamePush` truncates the whole body to
  `MAX_BODY_LENGTH` (140), and a clause added afterwards would be the first
  thing cut. So `withUnlocked` shortens the body first to make room.
- **It names only what the ending unlocked** (§4.3). Mid-game unlocks have
  already had their moment.

**Every player gets their own game-over push**, in all three of
`announceGameOver`'s branches: the winner (as today), the losers (who today
share one), and the co-op table (which today also shares one). One seat's
"Unlocked…" mustn't land on a teammate's lock screen. This costs nothing that
matters:

- `sendPushToUsers` already sends one FCM message per device token;
- the largest table that reaches `finishGame` has six seats;
- the users are already loaded.

### 7.5 On profiles and the result page

- **Every achievement is a `ListRow`**:
  - `icon` is `<AchievementIcon>`;
  - `title` is the achievement's title;
  - `sub` is its description;
  - `action` is the date or the progress ("3 / 5").

  The row shows everything a badge and its detail modal would, without the
  tap, so there's no badge grid and no modal. The result page is already built
  from `ListSection` + `ListRow`, so it gains one more section rather than a
  second way to draw an achievement.
- **`ListRow` gains `muted`** for a locked row: one boolean prop and one
  `ag-list-row--muted` class.
- **`AchievementsSection`** (`src/components/ui/`) is the profile block, shared
  by both profile screens the way `GameStatsList` and `RecentFormSection`
  are. It holds one `ListSection` per group, with the "· 7 of 31" count in the
  label. Games the player hasn't played fold into a disclosure.
- **`DisclosureSection`** (`src/components/ui/`) is that disclosure, extracted
  from `WhatsNew`. `WhatsNew` hand-writes the one `<details
  className="ag-disclosure">` with an `ag-section-head` summary, and the
  achievements fold would be its second copy. That's exactly the "never
  hand-roll an `ag-section-head` again" case in AGENTS.md, so it's extracted
  first, in its own commit, and both use it.
- **Progress** is `careerProgress` over the `byGame` the screen has already
  fetched, so there's no second request.

### 7.6 Not in v1

- A game's achievements shown on its setup screen or in `GameLibrary`.
- A server-side "seen" marker, so that the toast (and a "new" dot on the
  profile) follow a player across devices instead of per browser. That's the
  `ChatRead` pattern, and a change of its own.
- A badge grid, as an alternative look (§16).

## 8. Who can earn one, and which games count

- **Registered players, from games that count.** "Counts" means exactly what
  it means for stats (`RESULT_COUNTS_FILTER` / `resultCounts`). A game with an
  unclaimed guest in it earns nobody anything, at any turn end or at the end,
  and that includes the registered players at that table. This keeps an
  unclaimed guest from counting; it doesn't stop farming (see below).
- **Guests** earn nothing while they're guests. Once they claim, their career
  achievements count everything they played (§5.3). Match achievements from
  exhibition games are never awarded: nobody judged them at the time.
- **Which finished games count as "played"** (the `played` in `IGameStats`,
  §3.2):
  - **Every rules ending counts:** a win, a loss, a co-op win or loss.
  - **A surrender or an abandonment counts once the game has lasted two
    turns** (`MIN_TURNS_TO_COUNT = 2`, against `GameResult.totalTurns`). Two
    turns stops the start-and-surrender pad, and it also stops an opponent
    ending a game early to deny everyone else the game. The number is a named
    constant, so raising it (to a full round, say) is a one-line change.
  - **A surrendered solo game never counts.** There's nobody else who could
    have ended it on the player, and two Solitaire moves are no bar at all.
  - **How it's recorded.** `recordGameResult` works out whether the game
    counts as played, through one function, `countsAsPlayed(gameData)`, and
    stores the answer on the `GameResult` as a boolean. The `byGame`
    aggregation adds it to its group key (it's bounded, being a boolean) and
    sums it into `played`. A record written before the field existed counts,
    as it always has on the profile.
- **Wins are unaffected.** A surrender is a draw for everyone, and an
  abandonment is a loss for whoever went quiet.
- **Solo games** (Solitaire, Smartthink solo) count toward career achievements
  like any other: winning a game of Solitaire is a real win. Solitaire has no
  replay adapter, so it can't have match achievements until it does (§11).
- **Kingdom Builder** is out of scope. A world is a standalone, persistent
  thing that never goes through `finishGame` or the command route, so there's
  nothing to judge at. A test keeps a Kingdom Builder `achievements.ts` from
  being registered (§12) until it has a trigger of its own, designed along
  with its seasons.

**Farming is still possible, and v1 lives with it**, because achievements
grant nothing but themselves. What's left once the two-turn rule is in:

- **Two turns and a surrender, with a willing friend.** Each farmer has to find
  a second person, and it's slow.
- **Beating your own guest, then claiming it.** The guest's exhibition games
  start counting once it's claimed.
- **Keeping it after the evidence is gone.** A stored unlock outlives the
  results that earned it, by design (§5.3).

§15 lists what would have to change *before* an unlock is ever allowed to
grant something (an avatar, a theme).

## 9. Hidden information: a check sees what the table saw

**The rule:** a match check sees the game as everyone at the table saw it at
that moment (the game's response state for a null viewer), and nothing else.

That's enforced by the check's parameter type (§3.3), not by a sentence authors
have to remember. The view is built by the game's own response builder with
`viewerId = null`, from the live document at a turn end or the finished
document at the end. `hiddenHands.test.ts` already pins that projection for
every game with hidden state. The judging step doesn't need a redaction of its
own; it relies on the one every game already has.

**Why this is what makes mid-game unlocks safe.** An unlock is a public
statement about a game that may still be in play. It shows up in three places:

- **in the push**, to the earner;
- **on the earner's profile**, to their friends, who may be at the table;
- **on the result page**, to the players and their friends.

If a check could read the server's internal state, then an unlock announced
mid-game would publish whatever the check hinged on, at the moment it became
true. Checking against the null view closes that off: whether a check passes
is a function of what everyone can already see. So an unlock tells the table
nothing the board didn't already show, including *when* it happened. Each of
the following sounds like a plausible achievement, and each would have given
something away that the game never reveals:

| Game | What a check could have leaked | Why it's hidden |
|---|---|---|
| Settlements & Cities | "Win holding an unplayed Knight" | Only `devCardCount` goes on the wire. |
| Settlements & Cities | "Hold 5 Ore at the end of a turn" | Hand *size* is public (`resourceCount`); what's in the hand isn't. |
| World Domination | "Win holding a set you never cashed" | Territory cards are never revealed. |
| Train Time | "Return a 20-point ticket" | The train-card hand and returned tickets go only to their owner. Scoring reveals every *kept* ticket. |
| Smartthink | "Win as codemaker with four different colours" | The code never goes on the wire; only a four-black guess reveals it. |
| Outbreak, Banned Islet | "Win with an epidemic next in the deck" | The decks are stored shuffled, top first, and only their counts are sent. |
| Fires Out | Anything about an unrevealed point of interest | Its identity is hidden until it's revealed on the board. |

The worst variant is a check that hinges on *someone else's* hidden state
("win while an opponent held a Knight"), which would publish their secret on
*your* profile, possibly mid-game.

With the null view, none of these can even be written, because the field isn't
there to read. That's the design working, not a gap in it. It also covers a
surrender: a surrendered game is never judged on its final state (§4.1), and
even if it were, its null view hides whatever it hid mid-game. Train Time's
tickets stay hidden until `gs.gameOver`, not until `complete`.

Two rules remain for authors, and `croupier` reviews every game's
`achievements.ts` against them:

- **A description must not name a hidden specific**, even where the check
  can't read it. "Hold the Knight card at the end" is misleading, and it
  invites a check to go looking.
- **Secret achievements would need their text sent from the server.** The
  whole catalogue ships in the client bundle (§7.1), so a "???" row whose
  title sits in that bundle hides nothing. If secret achievements ever ship,
  their title and description come from the server, and only once unlocked
  (§15).

## 10. Robustness

| What could go wrong | What happens |
|---|---|
| A check throws | It's skipped for this judging pass, with a warning. The other checks, the pushes, the move and the game are unaffected (§4.2 step 5). |
| Judging at a turn end fails or stalls (Mongo stuck in its 30s server selection, say) | It's in `after()`, after the response and after the `YourTurn` push, in its own `try` under `withTimeout`. The move is already saved and the next player already told. A condition that still holds is caught at the next turn end. |
| Judging at game end fails or stalls | `withTimeout` answers with no unlocks, and the game-over pushes go out without the clause. Career achievements catch up at the player's next game. `turnEnd` achievements were already judged at every earlier turn end, so only what the final move alone earned, and `end` achievements, are lost. If the function is killed first (the cron's last game of a run), the same applies. |
| `recordGameResult` fails | Career judging is skipped for this game and catches up at the player's next game (§4.3). Match judging doesn't depend on it, and still runs. |
| Two judging passes race: overlapping turn ends, or two games finishing at once | Both upsert, one inserts, and only its unlock is celebrated and pushed. Neither throws (§5.2). |
| The first writes arrive before the unique index exists | Uniqueness could be lost for good (§5.2). The PR split prevents it, and PR 3 checks for the index before the catalogue ships. |
| A turn is ended by the cron | That turn end isn't judged. A state that persists is caught at the next turn end the route sees, or on the final state (§4.2). |
| A state is reached and then undone | It never reaches a turn end, so it's never judged (§4.1). |
| An opponent deletes their account | Stored unlocks stay. An unlock that's only derived can drop (§5.3, the accepted exception). "In a game of Dice Cities" survives, because `url` is on the row. |
| A player deletes their account while one of their games is being judged | The pass can upsert a row after `deleteMany`, leaving an orphan with no account. That's the same race `recordGameResult` already has there, and an orphan row is unreachable: nothing reads it. |
| An achievement is withdrawn from the catalogue | Its stored rows become unknown ids, and readers drop them (`achievementById`). The id must never be reused (§11). |
| A player with thousands of games | At a turn end, career achievements aren't touched at all. At game end, a seat that already holds everything this game could advance is skipped. Otherwise it's the same `byGame` aggregation the profile runs, narrowed to one game where it can be. |
| The game response's `unlockedHere` read fails | It's attached beside reactions and fails the same way reactions would, so it gets the same handling as that read. For a game with no achievements it's never made. |

`gremlin` reviews all of PR 2 against this table, and PR 3's pushes too.

## 11. Writing a game's achievements

For whoever writes the next game's `achievements.ts`:

- **Put it beside `meta.ts` and export `achievements`.** Add one import and one
  line to `GAME_ACHIEVEMENTS`; the guard test fails if you forget.
- **Prefix every id with the game's slug**, e.g. `dicecities.mine-baron`.
  - An id is permanent. Rename the title as often as you like, but never
    change or reuse an id. Stored rows point at it, and a reused id would
    hand the new achievement to everyone who earned the old one.
- **Write the description as the requirement**, precisely enough to settle an
  argument: "at the end of a turn", "in one game", "win" versus "play".
- **Type the check against your game's response type**, from `./apiModels`,
  never its internal state (§9). If a check can't be written against the view,
  the achievement is asking about something the table never saw.
- **Use `at: 'turnEnd'` for anything about the board**, and `at: 'end'` only
  when the check needs the result. A `turnEnd` achievement unlocks when it
  happens, and can't be lost to a surrender.
- **Set `notify` for the ones worth a push.** That means rare ones, and ones
  that can be earned on somebody else's turn. The board celebrates every
  unlock anyway, so a push for a small one is just noise.
- **A game's career achievements count that game** (`game: '<its slug>'`).
  Cross-game counts go in `PLATFORM_ACHIEVEMENTS`, which holds no match
  achievements, because a match check reads one game's state.
- **Match achievements need a replay adapter.** The view is built through it.
  Solitaire has none, so it gets career achievements only until it does.
- **Keep it browser-safe.** Use `import type` for anything from
  `<Game>Models.ts` or `src/utils/mongodb/`. Static data (`cards.ts`,
  `board.ts`), `./apiModels` and pure helpers are fine. The test walks your
  imports.
- **A drawn icon is optional.** Start with the emoji. When art arrives, follow
  §7.2's pipeline and set `art`.
- **Don't count on theme names.** Achievements belong to the account, not to
  one game's dressing, so they use the default theme's nouns. That's the same
  known gap the result page already has (`docs/game-themes.md` §7).
- **Aim for three to six per game.** A *played* and a *won* rung, plus a
  couple of match achievements that reward a distinctive way of playing, not a
  grind. Something a keen player gets in their first ten games is about right.

## 12. Tests

In the repo's existing style: unit tests over the pure parts, the integration
harness for the routes, and a structural guard for the registry.

1. **Catalogue integrity** (`src/utils/games/achievements.test.ts`):
   - every id is unique across the whole catalogue;
   - every `GAME_ACHIEVEMENTS` key is a `GAME_META` slug (the pattern
     `gameThemes.test.ts` uses). Without this, a key and its ids could share a
     typo and still pass;
   - every id is namespaced by its registry key or by `platform.`;
   - every career `game` is a real slug, and a game's own list names only
     itself;
   - `PLATFORM_ACHIEVEMENTS` holds no `match` criteria;
   - **`notify` appears only on `at: 'turnEnd'` achievements**, the only ones
     that unlock mid-game;
   - **every `art` path is under `/art/achievements/` and exists** under
     `public/`;
   - **no `engine: "standalone"` game has an entry**, since Kingdom Builder's
     would be drawn but never judged;
   - **every game with a `match` achievement has a registered replay
     adapter**;
   - `target` is at least 1, and `title`, `icon` and `description` are
     non-empty;
   - **nothing reachable at runtime from `src/utils/games/achievements.ts` is
     server-only.** The test walks the runtime import graph (skipping
     `import type`) and fails on anything under `@/utils/mongodb/`, any
     `*Models.ts`, `mongoose` or `@clerk/nextjs/server`.
     - The walker already exists: `runtimeImports` and `reachableFrom` in
       `src/app/api/serverModuleGraph.test.ts`. They move to
       `src/utils/testing/`, and learn to follow relative specifiers (today
       they only follow `@/…`, and a game file imports `./cards`).
     - Walking the whole graph, rather than one file's imports, also catches
       the indirect case: `achievements.ts → ./rules.ts → ./XModels.ts`.
2. **The registry line** (`src/games/gameRegistry.test.ts`): "wires every
   game's achievements into GAME_ACHIEVEMENTS". It discovers games with an
   `achievements.ts` the same way the guide and tutorial rows do.
3. **Pure helpers:**
   - `careerProgress`, `careerMet` and `unlockedIds`, over hand-built
     `IGameStats[]`: an empty history, one game, several games, a game with no
     wins, and one where `played` and `total` differ;
   - the *tipped* versus *backfilled* split (§4.3);
   - `countsAsPlayed`: every rules ending counts; a surrender after one turn
     doesn't; a surrender after two does; an abandonment after two does; a
     solo surrender never does.
4. **Judging** (`awardAchievements.test.ts`), against the Dice Cities
   `testHarness`, with a test catalogue passed in.

   **`judgeTurnEnd`:**
   - what a check receives deep-equals `toResponseState(…, null, …)`;
   - a check passes and fails on the live view;
   - every seat is judged, not only the mover (the Business Center swap);
   - a dropped seat isn't judged;
   - an exhibition game judges nothing;
   - an empty catalogue returns before any read.

   **`judgeGameEnd`:**
   - `end` checks get the right `outcome`;
   - a rules ending judges the final state;
   - **a game ended by `POST /api/game/end` judges no match achievement**, but
     still counts toward career ones once it has lasted two turns;
   - a failed `recordGameResult` skips career but not match.

   **Both:**
   - a second run inserts nothing and returns nothing;
   - **two concurrent runs** for the same player (`Promise.all`): exactly one
     reports the unlock, and neither throws;
   - a throwing check costs only itself.
5. **Every match achievement's `check`** gets a small unit test beside its
   game: one view that passes, one that fails. For each game with hidden
   state, also plant a sentinel value in the internal state (the
   `hiddenHands` idiom), and assert it never reaches the view a check gets.
6. **Routes:**
   - **a turn-ending move through `POST /api/game/command` writes a row when a
     check passes**, and a `notify` achievement pushes its earner on the
     `achievements` channel while a plain one doesn't. For this, extend
     `gameRoutes.test.ts`'s `GameResultData` mock beyond
     `{ recordGameResult }`, and add an `AchievementUnlock` fake store to
     `src/utils/testing/apiRoute.ts` whose `bulkWrite` returns `upsertedIds`,
     modelled on its GIF catalogue fake;
   - **a mid-turn move that doesn't end the turn writes nothing**, even if the
     state it leaves would pass;
   - a finishing move writes the game-end unlocks;
   - the game response carries `unlockedHere` for the viewer, and nobody
     else's unlocks;
   - `/api/stats` and `/api/profile/[userId]` carry `achievements`;
   - `/api/gameresult/[gameId]`: **a friend of one player sees the other
     players' match unlocks but not their career ones**;
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
| **1** | Shapes, the empty registry, the unlock collection | No | None | `rulebook`, `gremlin`, `locksmith` |
| **2** | Judging at every turn end and at game end, and the "played" rule | No: the catalogue is empty, so judging returns straight away | None | `gremlin`, `croupier`, `locksmith`, `rulebook` |
| **3** | The toast, the pushes, drawn icons, profiles, the result page, and the first catalogue | Yes | One line, *Enhancements* | `caveman`, `locksmith`, `croupier`, `gremlin`, `rulebook` |
| **4** | Every other game's achievements | Yes | Widen PR 3's line, or add one of its own | `croupier`, `rulebook` |

The split exists so that the risky changes reach review on their own, in
PR 2, with nothing visible around them. Those risky changes are new steps on
the turn-end path and the game-over path, and the cron awaits the latter
inline.

PR 2 doesn't prove the write path, though. With an empty catalogue, judging
returns at step 0, and Mongoose short-circuits an empty `bulkWrite` anyway. So
the write path first runs for real in PR 3, and PR 3 is also where gremlin
looks again.

Each PR updates `ARCHITECTURE.md` for what it lands, so the doc describes
`main` at every point. Everything that invites authors to *write* achievements
waits for PR 3.

### PR 1 — Describe an achievement, and somewhere to keep one

1. **`Share the import walker between the module-graph guards`.** Move
   `runtimeImports` / `reachableFrom` out of `serverModuleGraph.test.ts` into
   `src/utils/testing/`, and teach them relative specifiers. That test keeps
   passing unchanged.
2. **`Describe an achievement`.** `src/utils/games/achievements.ts`:
   - the types from §3, including `art` and `notify`;
   - an empty `GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS`;
   - `achievementById`, `careerProgress`, `careerMet` and `unlockedIds`.

   Tests 1 and 3 (minus `countsAsPlayed`, which comes in PR 2). Nothing calls
   any of it yet.
3. **`Guard the achievements registry`.** The `gameRegistry.test.ts` row (test
   2). It passes trivially today, and exists so the first game to add an
   `achievements.ts` can't be left out.
4. **`Keep a player's unlocked achievements`.**
   `src/utils/mongodb/AchievementUnlockData.ts`: the schema, the unique index,
   `recordUnlocks` with §5.2's upsert and error handling, and the fake store in
   `apiRoute.ts`. Beyond the model:
   - account deletion removes a player's rows (with its route test);
   - `/api/dev/clearresults` wipes the collection;
   - ARCHITECTURE.md §5 gets an `AchievementUnlock` subsection beside
     `ChatRead`, covering the index and the deletion rule.

   The collection stays empty: nothing writes to it yet.

### PR 2 — Judge them

1. **`Tally a player's games without their recent form`.** Pull the `byGame`
   half of `getPlayerStats` out into `getGameStatsByPlayer(userId, gameType?)`.
   That way judging can ask for it, narrowed to one game where it can be,
   without also fetching the last ten matches. No behaviour change:
   `getPlayerStats` calls it.
2. **`Count a game as played once it has lasted two turns`.** This commit:
   - adds `countsAsPlayed(gameData)` and `MIN_TURNS_TO_COUNT`;
   - adds the `countsAsPlayed` boolean `recordGameResult` stores;
   - adds `played` to `IGameStats`, summed from that boolean with missing
     counted as true.

   The profile keeps showing `total`, so nothing a player sees changes.
   Covered by test 3's `countsAsPlayed` cases, plus an aggregation case.
3. **`Judge achievements`.** `src/utils/games/awardAchievements.ts`, with
   `judgeTurnEnd` and `judgeGameEnd` over one shared core, and
   `resultCounts` beside `RESULT_COUNTS_FILTER`. The catalogue is a parameter
   that defaults to the real one. Test 4.
4. **`Judge achievements at the end of every turn`.** The `withTimeout` call in
   the command route's turn-end `after()`, after the `YourTurn` push (§4.2).
   Nothing is pushed or shown yet. Test 6's turn-end cases, run with a test
   catalogue and the extended mock.
5. **`Judge achievements when a game ends`.** The `withTimeout` call in
   `announceGameOver` (§4.3). The pushes don't mention unlocks yet. Also adds
   the finishing-move case to `gameRoutes.test.ts`, and the judging steps to
   ARCHITECTURE.md §5's `finishGame` bullet and §6's command pipeline.

### PR 3 — Show them, and the first ones to earn

The commits are ordered so that **the feature becomes visible at commit 9 and
not before**. Everything up to then renders nothing, because the catalogue is
still empty.

1. **`Send achievements to the screens that show them`.** This commit:
   - `getPlayerStats` and both profile routes gain `achievements`;
   - `gameResultResponse` gains this game's unlocks, filtered as §6 says;
   - the game GET and the command response gain `unlockedHere`, through the
     one helper beside `attachHistoryReactions`.

   Route tests, including the friend-of-one-player case and "the viewer's own
   only".
2. **`Fold a section away in one place`.** Extract `DisclosureSection` from
   `WhatsNew`. No behaviour change.
3. **`Draw an achievement's icon`.** `AchievementIcon`, with its drawn-art
   path, its fallback to the emoji, and the `art` checks in test 1. This makes
   drawn icons usable before any exist.
4. **`Show achievements on profiles`.** `AchievementsSection` on both profile
   screens, and `ListRow`'s `muted`.
5. **`Show what a game unlocked on its result page`.** One more `ListSection`.
6. **`Celebrate an unlock on the board`.** `useUnlockToasts`, called from
   `useGameData`, and its unit test.
7. **`Push the achievements worth a push`.** This commit:
   - adds the `achievements` channel to preferences and Settings;
   - adds `buildAchievementNotification`;
   - makes the turn-end `after()` send it for `notify` unlocks;
   - adds `withUnlocked`;
   - makes `announceGameOver` send every player their own game-over push, in
     all three branches (§7.4).
8. **`Check the unlock index before anything writes`.** This is a checklist
   step in the PR description, not a code commit, but it gates the next one:
   confirm `{ userId: 1, achievementId: 1 }` exists in production. PR 2's
   deploy will have built it; if it hasn't, build it now (§5.2).
9. **`The first achievements`.** `PLATFORM_ACHIEVEMENTS`, and the two games
   from the original request:
   - **Dice Cities**: as in §3.4, plus one more match achievement;
   - **Settlements & Cities**:
     - `settlementsandcities.settler` 🏘️ *"Play 5 games of Settlements &
       Cities"* (career, played, 5);
     - `settlementsandcities.city-planner` 🏙️ *"Have four cities at the end of
       a turn"* (match, `turnEnd`, from the public board);
     - `settlementsandcities.double-honours` 🎖️ *"Win a game holding both
       Longest Road and Largest Army"* (match, `end`: `outcome === 'win' &&
       view.longestRoadOwner === userId && view.largestArmyOwner === userId`,
       both of which every viewer sees at every moment).

   **This is the commit that turns the feature on.**
10. **`Say what's new, and write it down`.** Everything that invites authors to
    add achievements:
    - the "What's new" line;
    - the AGENTS.md paragraph;
    - in ARCHITECTURE.md §12: step 9, its row in the one-liners table, and
      "steps 7, 8 and 9" in the sentence above it;
    - in `docs/new-game.md`: the §5 bullet and the §6 table row;
    - a short `achievements.ts` section in
      `.claude/skills/croupier-review/SKILL.md`;
    - this doc's status line: *shipped for the platform, Dice Cities and
      Settlements & Cities; PR 4 brings the rest*.

### PR 4 — Every other game

One commit per game: its `achievements.ts`, one registry line, and its checks'
tests (including the sentinel test for games with hidden state). The easiest
go first:

1. Snakes & Ladders.
2. Solitaire: career only, since it has no replay adapter.
3. Race Cars.
4. World Domination.
5. Train Time.
6. Smartthink.
7. Outbreak, Fires Out! and Banned Islet. These are the co-ops: an achievement
   for the table's win is earned by every seat, which `outcomeFor` already
   gives.

The later ones hide the most, so some ideas for them won't be expressible
against their view (§9). That's working as intended.

**If a game needs shared code to change, stop.** Change the shared piece in its
own commit and call it out in the PR description: that means the design in §3
was wrong, not that the game is special.

**"What's new":** if PR 4 lands soon after PR 3, widen PR 3's line ("…in every
game") rather than adding a second. Otherwise, one new line of its own. Either
way it's one line for the whole PR, not one per game.

### Who reviews what, and why it isn't all of them

- **`locksmith`**:
  - PR 1 commit 4 (it touches `src/app/api/user/delete`);
  - PR 2 commit 4 (the command route);
  - PR 3 commit 1: four route responses change, and the result page's career
    filter and `unlockedHere`'s "viewer's own" are the gates this plan adds.
- **`gremlin`**:
  - PR 1 commit 4: the index, the upsert, deletion;
  - all of PR 2;
  - PR 3 commit 7, because the per-player sends run inline in the cron.
- **`croupier`**:
  - PR 2 commit 3, where checks get the null view;
  - PR 3 commits 1, 7 and 9: the wire, the push copy, the first checks;
  - every commit in PR 4.
- **`caveman`**: PR 3 commits 2–6, where UI duplication would land.
- **`rulebook`**: every PR's registry line, docs and "What's new".

### If it has to be one PR

Keep the commits in exactly this order and keep the boundaries: PR 1's four,
PR 2's five, PR 3's ten. The unique-index step (PR 3 commit 8) then has no
deploy before it to have built the index. It becomes "deploy with the
catalogue empty first", so the PR can't merge in one go, which is the
strongest argument for the split.

Files touched, all told:

```
PR 1  move   src/app/api/serverModuleGraph.test.ts → src/utils/testing/ (runtimeImports, reachableFrom)
PR 1  new    src/utils/games/achievements.ts (+ test)       (shapes, registry, careerProgress/Met, unlockedIds)
PR 1  edit   src/games/gameRegistry.test.ts                 (one row)
PR 1  new    src/utils/mongodb/AchievementUnlockData.ts
PR 1  edit   src/utils/testing/apiRoute.ts                  (fake store)
PR 1  edit   src/app/api/user/delete/route.ts (+ test), src/app/api/dev/clearresults/route.ts
PR 1  edit   ARCHITECTURE.md §5

PR 2  edit   src/utils/mongodb/GameResultData.ts            (getGameStatsByPlayer, countsAsPlayed, played, resultCounts)
PR 2  new    src/utils/games/awardAchievements.ts (+ test)  (judgeTurnEnd, judgeGameEnd)
PR 2  edit   src/app/api/game/command/route.ts              (turn-end judging in after())
PR 2  edit   src/utils/games/finishGame.ts                  (game-end judging)
PR 2  edit   src/app/api/game/gameRoutes.test.ts
PR 2  edit   ARCHITECTURE.md §5, §6

PR 3  edit   src/utils/mongodb/GameResultData.ts            (achievements on getPlayerStats, IAchievementUnlock)
PR 3  edit   src/app/api/stats/route.ts, src/app/api/profile/[userId]/route.ts
PR 3  edit   src/utils/api/gameResultResponse.ts
PR 3  edit   src/app/api/game/[gameid]/route.ts, src/app/api/game/command/route.ts  (unlockedHere)
PR 3  new    src/components/ui/DisclosureSection.tsx        (out of WhatsNew)
PR 3  edit   src/components/WhatsNew.tsx
PR 3  new    src/components/ui/AchievementIcon.tsx
PR 3  new    src/components/ui/AchievementsSection.tsx
PR 3  edit   src/components/ui/ListRow.tsx, src/app/ag-theme.css   (muted)
PR 3  edit   src/app/profile/page.tsx, src/app/profile/[userId]/page.tsx
PR 3  edit   src/app/games/result/[gameId]/page.tsx
PR 3  new    src/utils/hooks/useUnlockToasts.ts (+ test)
PR 3  edit   src/utils/hooks/useGameData.ts
PR 3  edit   src/utils/firebase/notificationContent.ts, src/utils/firebase/notificationPreferences.ts,
             src/utils/games/finishGame.ts, src/app/api/game/command/route.ts
PR 3  new    src/games/DiceCities/achievements.ts, src/games/SettlementsAndCities/achievements.ts (+ tests)
PR 3  edit   src/utils/ui/whatsNew.ts, AGENTS.md, ARCHITECTURE.md §12, docs/new-game.md,
             .claude/skills/croupier-review/SKILL.md

PR 4  new    src/games/<Game>/achievements.ts (+ test)      (one commit per game)
PR 4  edit   src/utils/games/achievements.ts                (one registry line each)
PR 4  edit   src/utils/ui/whatsNew.ts
```

## 14. Upkeep

- **"What's new"** gets one line in *Enhancements* in PR 3, something like:
  *"Achievements: unlock them as you play (the board tells you the moment you
  do), and see yours and your friends' on your profiles."*
  - PRs 1 and 2 get none, because a player can't tell they landed.
  - PR 4 widens PR 3's line, or adds one of its own (§13).
- **AGENTS.md** gets a paragraph beside the guide, tutorial and theme ones.
  Most games also want an `achievements.ts`, registered in
  `GAME_ACHIEVEMENTS`, following §11. `AchievementIcon` goes in the list of
  shared pieces.
- **ARCHITECTURE.md** is updated in the PR that makes each part true:
  - the `AchievementUnlock` subsection in §5 (PR 1);
  - the judging steps in §5's `finishGame` bullet and §6's command pipeline
    (PR 2);
  - the `achievements` channel and the `AchievementUnlocked` event in §8's
    list of events (PR 3);
  - step 9, its table row, and "7, 8 and 9" in §12 (PR 3).

  §15 already links here. That link, and the pointer from
  `docs/profile-pictures.md` §2b, went in with this plan.
- **`docs/new-game.md`** gets a §5 bullet beside `guide.ts` / `tutorial.ts`,
  and this row in the §6 wiring table: *`src/utils/games/achievements.ts` —
  (only if you added an `achievements.ts`) import it and add it to
  `GAME_ACHIEVEMENTS`; without it the game's achievements are never judged or
  shown.*
- **`.claude/skills/croupier-review/SKILL.md`** gets a short section on
  `achievements.ts`:
  - checks take the response type;
  - descriptions name no hidden specific;
  - no secret achievement ships its text in the bundle.

## 15. Decisions

The product owner answered the first draft's open questions (rows 1–6). Rows
7–10 are decided in this plan, and row 11 onwards are left open.

| # | Question | Decision | What reversing or extending it would take |
|---|---|---|---|
| 1 | Unlock mid-game? | **Yes: at the end of the turn it was earned in** (§4.1), with an optional `notify` push per achievement (§7.4). The board celebrates every unlock. | Judging after every command instead would need undo to take an unlock back, which is what the turn end avoids. |
| 2 | Do exhibition (guest) games count? | **No**, same as stats (§8). | Nothing in this doc: it would be a change to `RESULT_COUNTS_FILTER` / `resultCounts`, and the stats with it. |
| 3 | Who can see someone's achievements? | **Whoever can see their stats.** On the result page, a game's match unlocks go to everyone the page lets in, and career milestones only to their earner (§6). | A privacy setting would gate both together. That's the question `docs/social-features.md` §7 already asks. |
| 4 | Icons | **Emoji, with drawn icons supported from the start**: `art` on the achievement, `AchievementIcon`, the art pipeline, and a guard test (§7.2). | Nothing further. Drawing one is one file and one field. |
| 5 | Does a surrendered game count as played? | **Yes, once it has lasted two turns** (`MIN_TURNS_TO_COUNT`). A surrendered solo game never does. `turnEnd` achievements are awarded as they're earned, so a surrender can't take them away (§4.1, §8). | Raising the constant (to a full round, say) is one line. |
| 6 | Backfill at launch | **Lazy**: derived at once for display, stored as each player finishes a relevant game (§5.3). | A one-shot admin backfill when PR 3 deploys would close the "an opponent's account deletion takes back a derived unlock" gap. |
| 7 | What a check sees | The null-viewer response (§9). | This is load-bearing for mid-game unlocks. Don't reverse it. |
| 8 | Judge turns the cron ends? | No (§4.2). | Call `judgeTurnEnd` from the cron after it saves a resolved turn, under `withTimeout`. It costs a Clerk lookup per swept game. |
| 9 | Toasts across devices | Per browser (§7.3). | A server-side "seen" marker (the `ChatRead` pattern). |
| 10 | Kingdom Builder | Out of scope (§8). | Its own trigger, designed with seasons. |
| 11 | Should achievements unlock anything: avatars, themes? | Open. | `docs/profile-pictures.md` §2b is the natural first. **Before any grant ships**: solo games left out of platform counts, a harder "played" bar, and a grant re-checked against `GameResult` when it's selected, rather than trusting the stored row. §8 lists the farming paths these close. |
| 12 | Secret achievements, tiers, points? | Open. | Secret ones need their text sent from the server once unlocked, not shipped in the bundle (§9). Tiers and points are a presentation layer over the same rows. |

## 16. Rejected, and why

- **Judging only at game end.** This was the first draft's answer. It's
  simpler, but the moment is long gone by the time the game ends. A surrender
  would also have taken away every achievement a game hadn't yet been judged
  for.
- **Judging after every command.** This rewards states that can still be
  undone. The only way to fix that is to take an unlock back after the push has
  already buzzed (§4.1).
- **Replaying each finished game to find "at any turn end" states.** This was
  the first draft's other half. It cost a replay per game end in the cron's
  budget. It trusted a replay that can quietly drift from the game it
  replays, and it needed a strict mode added to `buildTimeline`. Judging live
  at each turn end reads the real document, at the real moment, for free.
- **Handing checks the internal state.** It's the easiest thing to write, and
  it's how "win holding an unplayed Knight" would publish a secret. Mid-game,
  it would publish it *during* the game. A sentence telling authors not to is
  enforced only by review. The type rules it out instead (§9).
- **Judging match achievements on a surrender.** Any player can end a game
  mid-turn, so the state judged would be a moment they chose, not one the game
  settled (§4.1).
- **Storing nothing, and deriving every unlock on read.** An unlock would then
  vanish when an opponent deleted their account and took the shared results
  with them. There'd be no date or game to point at, and match achievements
  couldn't be derived at all. So the unlock is stored, and only *progress* is
  derived (§5.3).
- **A profile read that writes the rows it derives.** It would close §5.3's
  accepted exception, but it makes a GET write, and a friend's GET write into
  someone else's rows. No GET here writes.
- **Clerk `privateMetadata`.** An 8 KB blob, written back whole (a race
  `/api/gameguides` has to work around), and unreadable on a friend's profile
  without one Clerk call per friend (§5.1).
- **Counters on a `UserProfile` document.** There isn't one (§2). The counts
  it would hold already come out of one indexed aggregation over `GameResult`.
- **Progress rows.** Progress is `careerProgress(byGame)`, free on both sides.
  A stored copy would be a second source of truth for a number the profile
  prints right beside it.
- **Working out "played" in the Mongo pipeline.** The two-turn rule would then
  live in an aggregation expression as well as in the JS that decides whether
  *this* game tipped something. Stored once, by `countsAsPlayed`, it has one
  home.
- **A rules DSL for match criteria** (JSON conditions over state paths). A
  function over the game's own typed view is shorter, type-checked,
  refactor-safe and unit-testable. Only career criteria are declarative,
  because only they have to be read back for progress (§3.2).
- **A `GameShell` prop for the toast.** That would be one more line on every
  board screen, for something every board wants. It's a call inside
  `useGameData`, which every board already goes through (§7.3).
- **A push for every unlock.** A small achievement isn't worth buzzing a phone
  mid-game. The board's toast is the default, and `notify` is the opt-in
  (§7.4).
- **A separate push for game-end unlocks.** It would be the third
  notification at the end of one game. The game-over push carries a clause
  instead (§7.4).
- **A badge grid with a detail modal.** That's a new component used by one
  screen, and a second way to draw an achievement beside the result page's
  rows. It also hides the requirement behind a tap on a phone. `ListRow`
  already shows everything a badge and its modal would (§7.5). A grid can come
  later as a presentation change over the same data.
- **`NamedChip` on the result page.** It's the in-board hand chip: card-styled,
  with a tiny label and a description in a hover `title` a phone never shows.
- **A new `/api/achievements` route.** The reads that need achievements
  already exist and carry the right gates. A new route would be one more gate
  to get wrong (§6).
- **Putting the registry in `src/utils/ui/`** with the guide and tutorial
  ones. Part of an achievement is a rule the server runs, and that folder is
  for presentation (§3.1).
