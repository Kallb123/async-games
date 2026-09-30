# Achievements — plan

**Status: plan, nothing built yet.** §13 is the build order: four PRs. The
first two change nothing a player can see, the third turns the feature on, and
the fourth brings in the rest of the games. The plan has been through all five
reviewers (caveman, gremlin, croupier, rulebook, locksmith), and their findings
are folded in below. §9 changed the most as a result.

An **achievement** is something a player unlocks by doing a particular thing,
either inside one game or across many:

- across games: "Play 5 games of Settlements & Cities", "Win 5 games of Dice
  Cities", "Finish a game of 5 different games";
- inside one game: "Own all six Mines in a game of Dice Cities".

Each one has four parts:

- a **title**;
- an **icon**;
- a **description**: the requirement, in the player's words;
- **criteria**: the same requirement, in code.

Games write their own achievements, in a file beside their `guide.ts` and
`tutorial.ts`, and a registry collects them the same way it collects guides and
tutorials. The platform owns a few more that no single game can.

This document settles six things:

- what an achievement *is*, as data (§3);
- when the server decides one has been earned (§4);
- where an unlock is kept (§5);
- what an achievement check is allowed to see (§9);
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
8. [Who can earn one, and from which games](#8-who-can-earn-one-and-from-which-games)
9. [Hidden information: a check sees what the table saw](#9-hidden-information-a-check-sees-what-the-table-saw)
10. [Robustness](#10-robustness)
11. [Writing a game's achievements](#11-writing-a-games-achievements)
12. [Tests](#12-tests)
13. [Implementation: the PRs and their commits](#13-implementation-the-prs-and-their-commits)
14. [Upkeep](#14-upkeep)
15. [Decisions taken, and open questions](#15-decisions-taken-and-open-questions)
16. [Rejected, and why](#16-rejected-and-why)

---

## 1. What a player gets

**On their profile**, an *Achievements* section. It gives a count (how many
they've unlocked out of how many exist), then lists every achievement, one row
each, grouped:

- the platform's own achievements first;
- then one group per game the player has played;
- then the games they haven't played, folded away.

Each row is the same `ListRow` every list in the app uses: the icon, the title,
the requirement underneath, and on the right either the date it was unlocked
or how far along the player is. A locked row is muted.

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

**On a friend's profile**: the same section, read-only. It is shown to exactly
the people who can already see that player's stats.

**When a game ends**, two places mention what it unlocked:

- **The game-over push** names anything the game unlocked for that player,
  after the copy it already has: *"You beat Priya in 14 turns. Line up a
  rematch? 🏆 Unlocked Mine Baron"*.
- **The game's result page** lists what the game unlocked. Anyone the page lets
  in sees the achievements *won in that game* (§6); a milestone the game tipped
  over ("your fifth Dice Cities win") is shown only to the player who earned it.

**Never during a game.** An achievement is judged when the game ends (§4), so
nothing pops up mid-turn. This is a deliberate v1 limit: §4.1 explains why, and
§15 keeps it as an open question.

## 2. What already exists to build on

Most of what this needs is already in place. What's new is:

- a registry;
- one small collection;
- one server pass when a game ends;
- a handful of UI changes.

| What | Where | What achievements use it for |
|---|---|---|
| **The one place a game ends** | `finishGame()` / `announceGameOver()` in `src/utils/games/finishGame.ts` | The hook. Every ending goes through here, so one call covers them all: the command route's game-over branch, `POST /api/game/end`, and the turn-timer cron's two paths (its abandon, and `finishPlayedOut` for a forced move or dropout that ends the game). |
| **`GameResult`**, written once per finished game | `src/utils/mongodb/GameResultData.ts` | Counting achievements. Games played and won per game already come out of one aggregation (`getPlayerStats` → `byGame`), and `outcomeFor` is the single rule for what a game was worth to a player. |
| **`RESULT_COUNTS_FILTER`** | same | Which games count. A game with a guest who hasn't claimed their account is an exhibition match. It counts toward nobody's stats (`docs/account-less-play.md` §8), and so toward nobody's achievements either. |
| **The replay engine** | `src/utils/games/replay.ts`: `buildTimeline`, and `lastOfEachTurn` behind `computePerTurnStat` | "At the end of any turn" achievements. The result charts already replay a finished game turn by turn, reading a null-viewer snapshot at every turn end. |
| **Every game's response builder, with a null viewer** | each game's `IReplayAdapter.toResponseState(…, null, …)`, pinned by `src/utils/apiModels/games/hiddenHands.test.ts` | What a check is allowed to see (§9): the game as everyone at the table saw it, with no one's hand in it. |
| **Per-game registries with guard tests** | `src/utils/games/recap.ts` (one import per game, beside the engine), `GAME_GUIDES` / `GAME_TUTORIALS` / `GAME_THEMES`, and `src/games/gameRegistry.test.ts` | The shape of `GAME_ACHIEVEMENTS`. Each game owns its own file, the registry adds one import and one line per game, and a test fails CI when a game ships the file but misses the line. |
| **Profile screens and their gate** | `src/app/profile/page.tsx`, `src/app/profile/[userId]/page.tsx`, `/api/stats`, `/api/profile/[userId]` (`areFriends`) | Where achievements show, and who may see them. Both screens already fetch `byGame`, which is all a progress count needs. |
| **The result page and its gate** | `src/app/games/result/[gameId]/page.tsx`, `gameResultResponse` | "Unlocked in this game". The page is open to the game's players and their friends, and is already built from `ListSection` + `ListRow`. |
| **Push copy in one place** | `src/utils/firebase/notificationContent.ts` | The "🏆 Unlocked Mine Baron" clause on the game-over push. |
| **A deadline for non-fetch work** | `withTimeout` in `src/utils/withTimeout.ts` | Keeping a slow award pass from holding up the game-over push (§4.2). |
| **Account deletion** | `POST /api/user/delete` | Removing a player's unlocks along with the rest of their data. |
| **UI pieces** | `ListSection`, `ListRow`, the `ag-disclosure` fold in `WhatsNew` | All of §7. There's no new visual component. |

**A correction to the other docs.** `docs/social-features.md` §5 described a
`UserProfile` collection of incrementally updated aggregates as built. It never
was: stats are aggregated from `GameResult` whenever a profile is read. That doc
and `docs/profile-pictures.md` have been corrected in the same PR as this plan.
Counting achievements deliberately reads the same `byGame` the profile does
(§3.2), so "5 games played" on an achievement always matches the number printed
beside it.

## 3. An achievement, as data

### 3.1 The shape

The shapes and the registry live in `src/utils/games/achievements.ts`, beside
`recap.ts`, which is the same idiom: a cross-game registry, one import per
game. It doesn't go in `src/utils/ui/` with the guide and tutorial registries,
because part of an achievement is a rule the server runs, and that folder is
for presentation.

```ts
// src/utils/games/achievements.ts
import type { IGameStats, MatchOutcome } from "@/utils/mongodb/GameResultData";

/** One thing a player can unlock. Authored as data, one list per game. */
export interface Achievement<R = unknown> {
    /**
     * Stable for ever, because it is stored on every unlock.
     * `<game slug>.<name>` for a game's own, `platform.<name>` for the
     * cross-game ones. Never change or reuse one (§11).
     */
    id: string;
    /** Short enough to fit in a row: "Mine Baron". */
    title: string;
    /** One emoji. `ListRow` boxes it. */
    icon: string;
    /** The requirement, in the player's words: "Own all six Mines at the end of a turn." */
    description: string;
    criteria: CareerCriteria | MatchCriteria<R>;
}
```

`description` is the requirement written for the player, and `criteria` is the
same requirement written for the server. Keeping both means a locked row can
show what it's asking for without the UI having to turn a predicate into prose.

Both imports from `GameResultData` are `import type`, and they have to be. This
file is loaded in the browser (§7), and `GameResultData` brings Mongoose with it
at runtime. §12's test 1 checks this.

There are two kinds of criteria, because there are two kinds of achievement,
and each is judged differently.

### 3.2 Career criteria: counted across games

"Play 5 games of Settlements & Cities", "Win 5 games of Dice Cities", "Finish a
game of 5 different games". These are counts, so they're **declared as data,
not written as code**:

```ts
export interface CareerCriteria {
    kind: 'career';
    /** Games finished, games won, or different games finished. */
    count: 'played' | 'won' | 'differentGames';
    /** How many it takes. */
    target: number;
    /** A GAME_META slug. Absent counts every game. Unused by 'differentGames'. */
    game?: string;
}
```

They're data rather than a function because a locked counting achievement has
to show how far along the player is. That number has to be worked out in two
places: on the server, to decide whether to unlock it, and on the profile, to
draw the progress. Both places already have the same input, the `IGameStats[]`
(`byGame`) that `getPlayerStats` returns and both profile screens already fetch.
So there's one pure function over it:

```ts
/** How far `byGame` has got toward `criteria`. Met once it reaches `target`. */
export function careerProgress(criteria: CareerCriteria, byGame: IGameStats[]): number {
    const games = criteria.game ? byGame.filter(g => g.url === criteria.game) : byGame;
    switch (criteria.count) {
        case 'played': return games.reduce((n, g) => n + g.total, 0);
        case 'won': return games.reduce((n, g) => n + g.wins, 0);
        // byGame only holds games with at least one counted result.
        case 'differentGames': return byGame.length;
    }
}

/** The career achievements in `catalogue` that `byGame` already meets. */
export function careerMet(catalogue: Achievement[], byGame: IGameStats[]): Achievement[];
```

A win is whatever `outcomeFor` says it is: a co-op team win counts, and a
dropped player's game doesn't. `byGame` has already been folded through
`outcomeFor`, so the rule isn't written out a second time here. `careerMet` is
the single place that asks "which of these does this history meet?". Both the
profile read (§5.3) and the award pass (§4.3) call it.

### 3.3 Match criteria: decided inside one game

"Own all six Mines in a game of Dice Cities", "Win holding both Longest Road
and Largest Army". These depend on the state of one game, so they're **a
function over that game's state**. Specifically, over the state *as the table
saw it*:

```ts
export interface MatchCriteria<R> {
    kind: 'match';
    /**
     * 'end': judged once, on the finished game.
     * 'anyTurnEnd': judged at the end of every turn, and earned if any one of
     * them passes. This costs a replay (§4.3), so use it only when the end
     * can't answer.
     */
    at: 'end' | 'anyTurnEnd';
    /** `view` is the game's response state for a null viewer: what everyone could see. */
    check: (view: R, player: MatchPlayer) => boolean;
}

export interface MatchPlayer {
    userId: string;
    /** From outcomeFor: the same answer the player's profile gives. */
    outcome: MatchOutcome;
}
```

`R` is the game's **response** type, from its browser-safe `apiModels.ts`. The
check receives what that game's own response builder gives a viewer who holds
no seat, and never the server's internal state. §9 explains why this matters:
it's what makes "a check can only reward what the table could see" a property
of the types, rather than a sentence a reviewer has to remember.

A check is **pure, synchronous and fast**: no I/O, no clock, no randomness. The
type makes most of that true, since it returns a `boolean` and not a promise.
§11 covers the rest.

Both `at` values read the game at a **settled** point: the end of a turn, or
the end of a game the rules finished. Never the middle of a turn. That matters
because of undo (`docs/undo.md`). A Dice Cities purchase can be taken back
inside its ten-second hold, and a player who bought a sixth Mine and then undid
it never owned six Mines. A turn's end comes after every undo that turn could
make, so reading only there means an undone state can never be rewarded,
without any check having to think about undo. A game ended by a surrender or an
abandonment can stop mid-turn, and that's why only a game the rules finished is
judged this way (§4.1).

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
        criteria: {
            kind: 'match',
            at: 'anyTurnEnd',
            check: (view, { userId }) => owned(view, userId, DiceCitiesCardIds.MINE) >= MINES_IN_THE_GAME,
        },
    },
];
```

Four things are worth noticing:

- **It counts to six rather than asking "does anyone else hold one?".** The
  second version looks more general, but it's wrong in a game with a dropped
  player. Dice Cities' dropout adapter takes a dropped seat's cards out of the
  game rather than returning them to the bank, so "nobody else has any" can be
  true for a player holding three.
- **It's `anyTurnEnd`, not `end`.** A Business Center swap can take a Mine away
  again before the game finishes, and the achievement is for having owned them
  all, not for still owning them at the finish.
- **Dice Cities has no hidden state.** Every viewer already gets `bankCards`
  and every seat's `cards`. So the table's view is the whole game, and the
  check loses nothing by being handed it.
- **Every runtime import is safe in the browser.** `cards.ts` is static data,
  `GameDataApi`'s `playerByUserId` imports only types, and the rest is
  `import type`. That matters because this file is also loaded in the browser
  (§7).

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
      description: 'Finish 25 games.',
      criteria: { kind: 'career', count: 'played', target: 25 } },
    { id: 'platform.explorer', title: 'Explorer', icon: '🧭',
      description: 'Finish a game of 5 different games.',
      criteria: { kind: 'career', count: 'differentGames', target: 5 } },
];

/** Every achievement, by id. An unknown id comes back undefined, and readers drop it. */
export function achievementById(id: string): Achievement | undefined;

/** Stored unlocks, plus every career achievement `byGame` already meets (§5.3). */
export function unlockedIds(stored: string[], byGame: IGameStats[]): Set<string>;
```

`achievementById` never throws, in the same way `themeIdFor` never throws
(`docs/game-themes.md` §4). If a stored id is one the catalogue no longer
knows, it's dropped quietly rather than treated as an error.

## 4. When an achievement is judged

### 4.1 Once, when the game is over

Achievements are judged in `announceGameOver`: the part of `finishGame` that
runs after the finished game has been saved. They're never judged on an
ordinary move. **Match achievements are judged only when the rules ended the
game**: when `endReason` is `win`, `teamwin` or `teamloss`. A surrender
(`ended`) or an abandonment (`abandoned`) still counts toward career
achievements, because it's in the stats, but no match achievement is judged on
it.

Why at game over and not on every move:

1. **It's the one place every game ends.** Moves, surrenders and both of the
   cron's finishing paths all go through here, so one call covers them all and
   the command route doesn't change.
2. **Hidden information.** An unlock announced mid-game is a side channel into
   the game. If *"Alice unlocked Ore Baron: hold 5 Ore"* appeared on the
   table's screens during a Settlements & Cities game, everyone would learn
   what was in her hand. Her hand *size* is public, but its contents aren't.
   §9 makes this impossible at any point, and judging only at the end adds a
   second line of defence.
3. **Undo.** Mid-game, a state can still be taken back (§3.3). At a finish the
   rules decided, it can't.
4. **Cost.** The command route runs on every move. `announceGameOver` runs once
   per game, in `after()`, once the response has already gone back.

Why only rules endings, for match achievements:

- **A surrender can stop anywhere.** Any seated player can `POST
  /api/game/end` at any time: mid-turn, on someone else's turn, or during an
  undo hold. So "the final state" there is a moment a player chose, not one
  the game settled. And the last stretch of play, which the replay counts as a
  turn, may never have finished.
- **A surrender reveals nothing.** A game's own reveal (Train Time turning its
  tickets face up at scoring) runs only when the rules end it. With a null
  viewer, a surrendered game's view still hides everything it hid mid-game, so
  there's nothing new for a check to see anyway.

The cost of all this is that there's no "Achievement unlocked!" moment during
play. §15 keeps that open for a later phase, and says what it would need.

### 4.2 Where it sits in `announceGameOver`

```
announceGameOver(gameData)
  1. usersById(gameData.userIdList)                      (already there)
  2. try { recordGameResult(...) } → recorded            (already there)
  3. unlocked = await withTimeout(                       NEW
         () => awardAchievements(gameData, { recorded, unclaimedPlayerIds }),
         AWARD_BUDGET_MS, NO_UNLOCKS, `Awarding achievements for ${gameId}`)
  4. the GameOver pushes, each naming that player's `unlocked` (§7.4)
```

- **After the result is written, because career counts read it.** The game
  that just finished has to be in `byGame` before "Win 5" is checked, and
  `byGame` is read from `GameResult`. So **the career half runs only if
  `recorded`**. If the record failed, the counts don't include this game, and
  skipping means achievements never get ahead of the stats beside them. A
  duplicate from `recordGameResult` (a retried request) counts as recorded,
  and awarding is idempotent (§5.2).
- **The match half doesn't depend on the result.** It reads `gameData`, not
  `GameResult`, so a failed stats write (say, a stats document that no longer
  matches its schema) doesn't take this game's match unlocks down with it.
- **Before the pushes, with a deadline.** A push can only mention an unlock
  that's already been awarded. But the pass must never be the reason a table
  doesn't hear its game has ended. `withTimeout` is the repo's existing idiom
  for this: it catches a throw *and* a stall, answering with `NO_UNLOCKS`
  either way, and it logs whatever the late work eventually does.
  `AWARD_BUDGET_MS` sits well inside the cron's ten seconds of headroom (§4.4).
  If it times out, the pushes go out without the clause.

### 4.3 The award pass

`awardAchievements` lives in `src/utils/games/awardAchievements.ts`, beside
`finishGame.ts`, and is server-only. For a finished game it goes through these
steps:

0. **Is there anything to judge?** If the catalogue has no achievements, return
   straight away. That's PR 2's state (§13), so the pass costs nothing until
   there's something to award.
1. **Does the game count?** `resultCounts(unclaimedPlayerIds)` is exported
   beside `RESULT_COUNTS_FILTER` so the rule has one home. If it says no, stop:
   nobody earns anything from an exhibition match (§8).
2. **Who's being judged?** The roster, minus `droppedPlayers`. A player who
   left before the end isn't judged on how the game ended. What happens to a
   dropped seat's state varies by game: World Domination, Snakes & Ladders and
   Fires Out keep it, while Dice Cities and Settlements & Cities delete it. The
   rule here is the same either way. A dropped player's career numbers still
   move, because the game counts as their loss.
3. **What do they already hold?** One read, served by the unique index:
   `AchievementUnlock.find({ userId: { $in: seats } })`.
4. **Career** (only if `recorded`):
   - For each seat, the achievements this game *could* have advanced are the
     platform's career ones plus this game's own.
   - If the seat already holds all of those, skip it. That's the usual case
     for a heavy player, and it's how they avoid paying a full-history
     aggregation every time a table they sit at finishes.
   - Otherwise, read `byGame` through `getGameStatsByPlayer(userId, gameType?)`.
     Pass `gameType`, which narrows the read to the `{ playerIds: 1, gameType: 1 }`
     index, when only this game's own achievements are missing.
   - Then `careerMet`, and sort each newly met achievement into one of two
     kinds:
     - **Tipped by this game.** Progress *without* this game is still under
       `target` (played − 1; won − 1 if this was a win; for `differentGames`,
       whether this game's total is 1). Stored with this `gameId` and `url`,
       and announced.
     - **Backfilled.** It was already met before this game, as happens to every
       veteran at launch. Stored without a `gameId`, and not announced
       (§5.3).
5. **Match `at: 'end'`** (rules endings only). For each seat, and each of this
   game's match achievements it doesn't hold, run `check(view, player)`. Here
   `view` is `adapter.toResponseState(gameData.specificGameState,
   identityMap, null, commandHistory)`, built once and shared by every check.
6. **Match `at: 'anyTurnEnd'`** (rules endings only, and only if a seat still
   lacks one):
   - Run **one** replay, however many achievements are waiting. It uses
     `lastOfEachTurn`, the reader `computePerTurnStat` already uses, which
     collects each turn's final null-viewer snapshot (`step.next.specificGameState`).
     It's a fresh object at every step, so it can be kept until the replay is
     done.
   - The replay runs **strict** (§10): a recorded command the replay refuses
     means the replay has drifted from the real game, so every `anyTurnEnd`
     check counts as not met, with one warning.
   - Once the replay has finished, the checks run over the collected
     turn-end views. They run *outside* the replay callback, so a throw can't
     abort the replay for everyone. A (seat, achievement) pair stops being
     checked the first time it passes, or the first time it throws (logged
     once).
7. **Write.** `recordUnlocks` does one `bulkWrite` of upserts (§5.2), and hands
   back the rows it actually inserted, grouped by player. Rows that already
   existed and backfilled rows are dropped. What's left is the only thing the
   push and the result page talk about.

Each check runs inside its own `try`. A check that breaks costs only its own
achievement for this game, plus a warning. It never costs the other
achievements, the pushes, or the game.

### 4.4 The cron

The turn-timer cron `await`s `announce()` inline instead of handing it to
`after()`, and it runs to a deadline (`ARCHITECTURE.md` §7). That applies to
both of its finishing paths: an abandoned game, and `finishPlayedOut` when a
forced move or a dropout ends the game. `withTimeout` caps what awarding can
cost there (§4.2).

Inside that cap, the pass costs:

- nothing, for a table whose seats hold everything this game could advance;
- otherwise, one aggregation per seat that doesn't;
- plus one replay, for a game with `anyTurnEnd` checks.

For comparison, the result stats already replay the game as it finishes, and
how many times depends on the game:

| Game | Replays today at game end |
|---|---|
| Settlements & Cities | once |
| Dice Cities | three times |
| Outbreak, Banned Islet, Race Cars | four times |
| Smartthink, Snakes & Ladders, Solitaire | never (their stats read the final state) |

So for most games the achievement replay is one more on top of existing ones.
For the last three rows it would be the first, which is one reason to prefer
`at: 'end'` (§11). If the achievement replay ever shows up in the cron's
budget, fold the achievement readers into a replay the result stats already
make, rather than adding another (§15).

## 5. Storage: one flat collection of unlocks

### 5.1 `AchievementUnlock`

`src/utils/mongodb/AchievementUnlockData.ts` is a flat collection, like
`ChatRead`: not a discriminator, and not a field on `GameData` or `GameResult`.

```ts
interface IAchievementUnlockData {
    userId: string;         // Clerk userId
    achievementId: string;  // "dicecities.mine-baron"
    unlockedAt: string;     // ISO
    gameId?: string;        // the game that earned it; absent when backfilled (§4.3 step 4)
    url?: string;           // that game's GAME_META slug, kept for when its result is gone
}
```

- **`{ userId: 1, achievementId: 1 }`, unique.** A player holds each
  achievement at most once. The index's `userId` prefix serves every read this
  collection gets:
  - the profile's read;
  - the award pass's "what do they hold" read (§4.3 step 3);
  - account deletion;
  - the result page's read, which asks for
    `{ userId: { $in: result.playerIds }, gameId }` rather than a bare
    `{ gameId }` that no index would serve.
- **`gameId` and `url` on every row but a backfilled one.** A career unlock
  belongs to the game that tipped it over ("your fifth Dice Cities win"). That
  lets the result page say *"unlocked in this game"* for either kind.
  - `url` is copied onto the row, not looked up later. That's because
    `api/user/delete` removes a game's `GameResult` and `GameData` when *any*
    player at that table deletes their account, and "in a game of Dice Cities"
    shouldn't disappear with someone else's account.
- **Why not on `GameResult`?** A `GameResult` belongs to one game, while an
  achievement belongs to one player, and a career one spans many games.
- **Why not in Clerk metadata?** It's an 8 KB blob that has to be read back
  whole to write it, which is the race `/api/gameguides` has to work around. A
  friend's profile would also need one Clerk call per friend just to read it.

### 5.2 Writing it: upserts, and only the new ones count

```ts
AchievementUnlockModel.bulkWrite(newlyMet.map(({ userId, achievementId, gameId, url }) => ({
    updateOne: {
        filter: { userId, achievementId },
        // Not the filter's own fields. An upsert copies those in by itself, and
        // setting them again would stop the server retrying the race below.
        update: { $setOnInsert: { unlockedAt, gameId, url } },
        upsert: true,
    },
})), { ordered: false });
```

The *new* unlocks are the ones in `upsertedIds`. That matters when two of a
player's games finish at the same moment and both decide they've just earned
"Win 5". Both upsert, and only one inserts. Usually the server retries the
loser as a quiet update. When it doesn't, the loser comes back as an 11000 in a
`MongoBulkWriteError`.

`recordUnlocks` handles that case itself:

- it catches the `MongoBulkWriteError`;
- it treats `err.result`'s upserted ids as the new rows;
- it treats duplicate-key write errors as "already held";
- it rethrows anything else.

So one race costs one push its clause, never every seat's.

Two nearby approaches go wrong. A plain `insertMany`, or catching the error with
`isDuplicateKeyError` (`duplicateKey.ts`, which only looks at the top-level
code), would both swallow the answer to "which rows are new".

**The unique index has to exist before the first write.** The repo relies on
Mongoose's `autoIndex`, and a `bulkWrite` doesn't wait for an index build. If
two upserts of the same pair land first, both insert, the build then fails on
the duplicate, and uniqueness is gone for good. The PR split closes this window
(PR 2 loads the model with nothing to write), and PR 3 checks the index exists
in production before the commit that gives the catalogue its first entries
deploys (§13).

### 5.3 Reading it: stored ∪ met

On the profile:

```
unlocked = stored unlock ids  ∪  careerMet(catalogue, byGame)
```

That one line (`unlockedIds`) means three cases need no script:

- **Launch.** A player with twenty Dice Cities wins sees *Mayor* unlocked the
  moment achievements ship. It shows as unlocked with no date until they next
  finish a game that could advance it, which stores it as backfilled: dated,
  with no game named, and not announced (§4.3 step 4).
  - So on launch day, every veteran's first push *doesn't* read "Unlocked First
    win and 4 more".
- **A guest claims their account.** Their exhibition games start counting the
  moment `api/user/claim` `$pull`s `unclaimedPlayerIds`. Their career
  achievements appear on the next profile read, and so do the other players'
  in those games.
- **An opponent deletes their account.** `api/user/delete` removes every
  `GameResult` that player was in, so someone else's `byGame` can go *down*. A
  stored unlock stays, so an achievement once *stored* is never taken away.
  That's why career unlocks are stored at all, rather than derived on every
  read (§16).

There's one exception, and it's accepted: an unlock that is only *derived* (met
but not yet stored) can vanish if an opponent from the games that met it
deletes their account first. Two things make this rare:

- it only affects unlocks derived and not yet stored, and those get stored as
  the player finishes more games;
- it needs an account deletion in exactly that window.

The alternatives were a one-shot backfill when PR 3 deploys, or a profile read
that writes. The first is kept open in §15. The second is rejected in §16,
because **no GET writes**: `getPlayerStats` and `unlockedIds` only read, so a
friend viewing a profile can never cause a write into somebody else's rows.

**Match achievements** have no "met" half. They're unlocked only if a row says
so, because the state that earned one is gone once the game is over.

### 5.4 Deletion

- **`POST /api/user/delete`** gains
  `AchievementUnlockModel.deleteMany({ userId }).exec()` next to the reactions
  line, and its route test checks it.
  - It deletes by *user* rather than by game. An unlock belongs to the player,
    not the table, so other players' unlocks from the same games stay theirs.
  - An award pass still running in some `after()` can land a row after the
    delete. This is the same kind of race `recordGameResult` already has on
    that route (§10).
- **`/api/dev/clearresults`** wipes this collection along with `GameResult`,
  so a dev database isn't left holding unlocks for results it no longer has.

## 6. API: no new routes

The three reads that need achievements already exist, and each already carries
the right gate. So this plan adds fields, not routes.

**Nothing a client sends is read when deciding an unlock.** A finishing move or
a surrender *starts* the award pass, but the pass only reads server-built state
and server-recorded randomness. There's no write route at all.

| Route | Gains | Gate (unchanged) |
|---|---|---|
| `GET /api/stats` | `achievements: IAchievementUnlock[]` | Signed in, your own |
| `GET /api/profile/[userId]` | `achievements: IAchievementUnlock[]` | Self or an accepted friend (`areFriends`) |
| `GET /api/gameresult/[gameId]` (and `POST …/regenerate`, which shares `gameResultResponse`) | `achievements: { userId, id }[]`: this game's match unlocks for every seat, and this game's career unlocks **for the viewer's own seat only** | A player in the game, or a friend of one |

```ts
// src/utils/mongodb/GameResultData.ts, beside IPlayerStats,
// and re-exported as a type from src/app/api/stats/route.ts like IGameStats.
export interface IAchievementUnlock {
    id: string;
    unlockedAt: string;
    gameId?: string;
    url?: string;
}
```

- **Both profile routes change.** `getPlayerStats` reads the unlocks, so that
  read has one home. But `api/stats/route.ts` and `api/profile/[userId]/route.ts`
  each pick `{ recent, byGame }` off the result and build their own JSON, so
  each gains `achievements` explicitly.
- **The result page filters career unlocks, inside `gameResultResponse`** (so
  the regenerate route gets the same filter). The page is open to a friend of
  *any* player, including someone who isn't friends with the player whose
  milestone it is. Here's what goes wrong without the filter:
  - Carol can't see Bob's stats.
  - But she can see game G, because she's friends with Alice, who played in
    it.
  - If G's result said *"Bob unlocked Mayor"*, Carol would know Bob had
    exactly five Dice Cities wins when G ended.
  - Match unlocks are a fact about *this* game, judged on what the table saw
    (§9), so they go to everyone the page lets in.
  - A career milestone goes only to the player who earned it. Their friends
    can see it on their profile, where `gameId` says where it was earned.
- **Regenerate never awards.** `POST /api/gameresult/[gameId]/regenerate`
  replays a game when a player asks for it. It must never call
  `awardAchievements`, so it can't become a way for a player to get a game
  re-judged on demand.
- **Only ids go over the wire.** The title, icon and description are looked up
  from the catalogue on the client. That keeps the copy in one place, and a
  typo fix doesn't need a migration.

Every change is additive: no existing client breaks and no request shape
changes.

## 7. UI

### 7.1 The catalogue is on the client

Both profile screens import `GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS` to
draw every row, locked ones included. That's why a game's `achievements.ts`,
and everything it imports, has to be browser-safe (§3.4, §12 test 1). The
`check` functions come along too. They're a handful of small pure functions
over response types the client already holds, so they reveal nothing: they're
rules, not state.

### 7.2 Reused, with one new modifier and one extraction

- **Every achievement is a `ListRow`**, on the profile and on the result page
  alike:
  - `icon` is the emoji, which `ListRow` already boxes in `ag-icon-box`;
  - `title` is the title;
  - `sub` is the description;
  - `action` is the date or the progress ("3 / 5").
  
  The row already shows everything a badge-and-modal would have hidden behind
  a tap, so there's no modal and no new badge component. The result page is
  already built from `ListSection` + `ListRow`, so it gains one more section
  without introducing a second way to draw an achievement.
- **`ListRow` gains `muted`**, for a locked row: one boolean prop and one
  `ag-list-row--muted` class. This is the only CSS this feature adds.
- **`AchievementsSection`** (`src/components/ui/`) is the whole profile block,
  shared by both profile screens the way `GameStatsList` and
  `RecentFormSection` already are.
  - It has one `ListSection` per group, and the "· 7 of 31" count goes in its
    label.
  - Games the player hasn't played fold into a disclosure.
- **`DisclosureSection`** (`src/components/ui/`) is extracted from `WhatsNew`,
  which today hand-writes the one `<details className="ag-disclosure">` with an
  `ag-section-head` summary. The achievements fold would be the second copy,
  which is exactly the "never hand-roll an `ag-section-head` again" case in
  AGENTS.md. So it's extracted first, in its own commit, and both places use
  it.

### 7.3 Progress

Progress is `careerProgress` over the `byGame` the screen has already fetched,
so there's no second request.

### 7.4 The game-over push

The three builders (`buildGameWonNotification`, `buildGameLostNotification`,
`buildTeamResultNotification`) stay exactly as they are. Instead,
`notificationContent.ts` gains one helper:

```ts
/** `notification` with "🏆 Unlocked Mine Baron" (or "… and 2 more") after its body. */
export function withUnlocked(notification: PushNotification, unlocked: Achievement[]): PushNotification;
```

- **It shortens the body to make room for the clause first**, so the clause is
  never the part cut off. `gamePush` truncates the whole body to
  `MAX_BODY_LENGTH` (140), and a clause appended afterwards would be the first
  thing to go.
- **The title and image don't change.** The image stays the game's own art,
  as on every push.

**Every player gets their own push** now, in all three of `announceGameOver`'s
branches:

- **The winner**, as today.
- **The losers**, who today share one push.
- **The co-op table**, which today also shares one push. One seat's "Unlocked
  …" must not land on a teammate's lock screen.

This costs nothing that matters. `sendPushToUsers` already sends one FCM message
per device token (`sendEach`). The largest table that reaches `finishGame` has
six seats, and those users are already loaded, so there are no extra Clerk
calls.

**There's no separate "achievement unlocked" push.** Three notifications at the
end of one game (it's over, you lost, you unlocked something) is how a player
learns to mute a channel (§16).

### 7.5 Not in v1

- **A game's achievements on its setup screen or in `GameLibrary`.**
- **A "new" dot for unlocks the player hasn't looked at yet.** That needs a
  read marker of its own (the `ChatRead` pattern), so it's a separate change.
- **Unlocks on the `GameFinishBanner`.** The board's final response goes out
  before `after()` has awarded anything, so the banner would need a second
  fetch. Its "View result" button already leads to the page that lists them.
- **A badge grid, as an alternative look** (§16).

## 8. Who can earn one, and from which games

- **Registered players, from games that count.** "Counts" means exactly what it
  means for stats (`RESULT_COUNTS_FILTER` / `resultCounts`). A game with an
  unclaimed guest in it earns nobody anything, including the registered players
  at that table. That keeps an unclaimed guest from counting. It doesn't stop
  farming, which is covered below.
- **Guests** earn nothing while they're guests. Once they claim, their career
  achievements count everything they played (§5.3). Match achievements from
  those exhibition games are never awarded: nobody judged them at the time,
  and the state that would have earned them is gone.
- **Every ending counts toward "played"**, surrender and abandonment included,
  because the profile counts them and the two numbers should agree. **Only a
  rules ending is judged for match achievements** (§4.1).
- **Solo games** (Solitaire, Smartthink solo) count toward career achievements
  like any other game. Winning a game of Solitaire is a real win.
  - Solitaire has no replay adapter, so it can't be given match achievements
    (§11).
- **Kingdom Builder** is out of scope. A world is a standalone, persistent
  thing that never goes through `finishGame`, so there's no game over to judge
  at. A test keeps a Kingdom Builder `achievements.ts` from being registered
  (§12) until it has a trigger of its own, designed along with its seasons.

**Farming is possible, and v1 lives with it.** Achievements grant nothing but
the badge, and every path below is effort for nothing more than that. The paths
that exist today:

- **Solo padding.** Start a solo game and surrender it, twenty-five times.
  That's "Finish 25 games" in a few minutes, without a second account.
- **Guest then claim.** Beat your own guest five times. That earns nothing
  while they're a guest. Then claim the guest account, and all five games
  start counting.
- **Keeping it after the evidence is gone.** Deleting the other accounts
  removes the shared results, but a stored unlock stays by design (§5.3).

§15 lists what would have to change *before* an unlock is ever allowed to grant
something (an avatar, a theme).

## 9. Hidden information: a check sees what the table saw

**The rule:** a match check sees the game as everyone at the table saw it at
that moment. That's the game's response state for a null viewer, and a check
sees nothing more.

That's enforced by the check's parameter type (§3.3), not by a sentence authors
have to remember. The view a check gets is built by the game's own response
builder with `viewerId = null`:

- **at the end**, from `toResponseState(…, null, …)` over the final state;
- **at each turn end**, from the replay's snapshots, which are already built
  with a null viewer.

`hiddenHands.test.ts` already pins that projection for each game with hidden
state. The award pass doesn't need a redaction of its own: it relies on the one
every game already has.

Why this is needed. An unlock is a public statement about a game:

- it appears on the earner's profile, for their friends;
- it appears on the result page, for the players and their friends;
- it appears in the push.

So a check that could read the server's internal state would publish whatever
it hinged on. Achievements that sound reasonable would each have given
something away that the game never reveals, even when it ends normally:

| Game | What a check could have leaked | Why it's hidden |
|---|---|---|
| Settlements & Cities | "Win holding an unplayed Knight" | Only `devCardCount` goes on the wire. |
| Settlements & Cities | "Hold 5 Ore at the end of a turn" | Hand *size* is public (`resourceCount`); what's in the hand isn't. |
| World Domination | "Win holding a set you never cashed" | Territory cards are never revealed. |
| Train Time | "Return a 20-point ticket" | The train-card hand and returned tickets are only ever sent to their owner. Scoring does reveal every *kept* ticket. |
| Smartthink | "Win as codemaker with four different colours" | The code never goes on the wire. Only a 4-black guess reveals it. |
| Outbreak, Banned Islet | "Win with an epidemic next in the deck" | The decks are stored shuffled, top first, and only their counts are sent. |
| Fires Out | Anything about an unrevealed point of interest | Its identity is hidden until it's revealed on the board. |

The worst variant is a check that hinges on *someone else's* hidden state,
such as "win while an opponent held a Knight". That would publish their secret
on *your* profile.

With the null viewer, none of these can be written: the field simply isn't
there to read. That's the design doing its job, not a gap in it. The same view
also covers a surrendered game: a null viewer's view of it hides whatever it
hid mid-game. Train Time's tickets stay hidden until `gs.gameOver`, not until
`complete`.

Two rules remain for authors, and `croupier` reviews every game's
`achievements.ts` against them:

- **A description must not name a hidden specific**, even where the check
  can't read it ("Hold the Knight card at the end" is misleading, and it
  invites a check to go looking).
- **Secret achievements would need server-side text.** The whole catalogue
  ships to the client (§7.1), so a "???" badge whose title sits in the bundle
  hides nothing. If secret achievements ever ship, their title and description
  come from the server, and only once unlocked (§15).

## 10. Robustness

| What could go wrong | What happens |
|---|---|
| A check throws | It's retired for this game on its first throw and logged once. The other checks, the pushes and the game are unaffected (§4.3 step 6). |
| The award pass stalls: Mongo in its 30s server selection, a slow aggregation, a long replay | `withTimeout` answers with no unlocks when the budget runs out. The pushes go without the clause, and the late work finishes and is logged. If the function is killed first (the cron's last game of a run), career unlocks catch up at that player's next game. Match unlocks from this game are lost, because it is never announced again. |
| The replay throws (a game from before its snapshot existed, a broken adapter, no adapter at all) | Every `anyTurnEnd` check counts as not met, with a warning, the same way the result charts degrade (`replayTurnByTurn`). `end` checks and career achievements don't depend on it. |
| The replay *drifts*: a recorded command the replay refuses | `buildTimeline` quietly `continue`s past a refused command today, so a drifted replay goes on producing turn ends that never happened. The award pass replays **strict**: a refused recorded command throws, `replayTurnByTurn` downgrades it as above, and no `anyTurnEnd` check is judged on a game that never happened (§13, PR 2 commit 2). |
| `recordGameResult` fails | Career awarding is skipped for this game (§4.2), and catches up at the player's next game. Match awarding doesn't depend on it and still runs. |
| Mongo is unavailable during the write | `withTimeout` catches it, and the pushes go out without the clause. Each upsert stands alone, so nothing is half-written. |
| The request is retried, or `announce` somehow runs twice | The unique index and the upserts mean nothing is inserted twice, and a second push would name nothing, because nothing new was inserted. In practice `finishGame` only saves a live game, so `announce` can't run twice. |
| Two of a player's games finish at once | Both upsert and one inserts. Only its push names the unlock, and neither throws (§5.2). |
| The first writes arrive before the unique index exists | Uniqueness could be lost for good (§5.2). The PR split prevents it, and PR 3 checks for the index before the catalogue goes live. |
| An opponent deletes their account | Stored unlocks stay. An unlock that is only derived can drop (§5.3, the accepted exception). "In a game of Dice Cities" survives, because `url` is on the row. |
| A player deletes their account while one of their games is being announced | The award can upsert a row after `deleteMany` has run, leaving an orphan with no account behind it. That's the same race `recordGameResult` already has there. An orphan row is unreachable: no profile reads it. |
| An achievement is withdrawn from the catalogue | Its stored rows become unknown ids, and readers drop them (`achievementById`). The id must never be reused (§11). |
| A player with thousands of games | A seat that already holds everything this game could advance is skipped (§4.3 step 4). Otherwise the read is the same `byGame` aggregation the profile runs, narrowed to one game where it can be. |

`gremlin` reviews PR 2 against this table, and PR 3's push changes too, because
the cron `await`s them.

## 11. Writing a game's achievements

For whoever writes the next game's `achievements.ts`:

- **Put it beside `meta.ts`, and export `achievements`.** Add one import and
  one line to `GAME_ACHIEVEMENTS`; the guard test fails if you forget.
- **Prefix every id with the game's slug**, as in `dicecities.mine-baron`.
  - An id is permanent. Rename the title as often as you like, but never change
    or reuse an id. Stored rows point at it, and a reused id would hand the new
    achievement to everyone who earned the old one.
- **Write the description as the requirement**, precisely enough to settle an
  argument: "at the end of a turn", "in one game", "win" versus "finish".
- **Type the check against your game's response type**, from `./apiModels`,
  not its internal state (§9). If a check can't be written against the view,
  the achievement is asking about something the table never saw.
- **A game's career achievements count that game** (`game: '<its slug>'`).
  Cross-game counts go in `PLATFORM_ACHIEVEMENTS`, which holds no match
  achievements, because a match check reads one game's state.
- **Match achievements need a replay adapter.** Both kinds of view are built
  through it. Solitaire has no adapter, so it gets career achievements only
  until it has one.
- **Prefer `at: 'end'`.** Reach for `anyTurnEnd` only when the end can't
  answer, because it costs a replay (§4.4).
- **Keep it browser-safe.** Use `import type` for anything from
  `<Game>Models.ts` or `src/utils/mongodb/`. Static data (`cards.ts`,
  `board.ts`), `./apiModels` and pure helpers are fine. The test walks your
  imports.
- **Don't rely on theme names.** Achievements belong to the account, not to one
  game's dressing, so they use the default theme's nouns. That's the same known
  gap the result page already has (`docs/game-themes.md` §7).
- **Aim for three to six per game:** a *played* and a *won* rung, and a couple
  of match achievements that reward a distinctive way of playing, not a grind.
  Something a keen player gets within their first ten games is about right.

## 12. Tests

In the repo's existing style: unit tests for the pure parts, the integration
harness for the routes, and a structural guard for the registry.

1. **Catalogue integrity** (`src/utils/games/achievements.test.ts`):
   - every id is unique across the whole catalogue;
   - every `GAME_ACHIEVEMENTS` key is a `GAME_META` slug, following the pattern
     in `gameThemes.test.ts`. Without this, a key and its ids could share a
     typo and pass;
   - every id is namespaced by the slug it's registered under, or by
     `platform.`;
   - every career `game` is a real slug, and a game's own list names only
     itself;
   - `PLATFORM_ACHIEVEMENTS` holds no `match` criteria;
   - **no `engine: "standalone"` game has an entry**, so Kingdom Builder's
     would be drawn but never judged;
   - **every game with a `match` achievement has a registered replay
     adapter**;
   - `target` is at least 1, and `title`, `icon` and `description` aren't
     empty;
   - **nothing reachable at runtime from `src/utils/games/achievements.ts` is
     server-only.** The test walks the runtime import graph (skipping
     `import type`) and fails on:
     - anything under `@/utils/mongodb/`;
     - any `*Models.ts`;
     - `mongoose`;
     - `@clerk/nextjs/server`.

     The walker already exists: `runtimeImports` and `reachableFrom` in
     `src/app/api/serverModuleGraph.test.ts`. They move to `src/utils/testing/`
     and gain relative specifiers (they only follow `@/…` today, and a game
     file imports `./cards`). Walking the whole graph also catches the indirect
     case, `achievements.ts → ./rules.ts → ./XModels.ts`, which a scan of
     direct imports would miss.
2. **The registry line** (`src/games/gameRegistry.test.ts`): "wires every
   game's achievements into GAME_ACHIEVEMENTS". It finds games with an
   `achievements.ts` the same way the guide and tutorial rows do.
3. **`careerProgress`, `careerMet` and `unlockedIds`** are pure, and tested over
   hand-built `IGameStats[]`: an empty history, one game, several games, and a
   game with no wins. Add a test that separates *tipped* from *backfilled*
   (§4.3 step 4).
4. **The award pass** (`awardAchievements.test.ts`), run against the Dice
   Cities `testHarness`, with a test catalogue passed in:
   - what a check receives deep-equals `toResponseState(…, null, …)`;
   - an `end` check passes and fails on the final view;
   - an `anyTurnEnd` check is earned by a turn end where it held and not lost
     at a later one (the Business Center swap);
   - a sixth Mine bought and then undone is **not** earned;
   - a game ended by `POST /api/game/end` awards no match achievement;
   - **a replay that refuses a recorded command awards no `anyTurnEnd`
     achievement**;
   - a dropped seat is not match-judged;
   - an exhibition game awards nothing;
   - a second run inserts nothing and returns nothing;
   - two concurrent runs for the same player (`Promise.all`): exactly one
     reports the unlock, and neither throws;
   - a throwing check costs only itself, and is logged once;
   - an empty catalogue returns before any read.
5. **Every match achievement's `check`** gets a small unit test beside its
   game: one view that passes and one that fails.
   - For each game with hidden state, also plant a sentinel value in the
     internal state (the `hiddenHands` technique) and assert it never reaches
     the view a check receives.
6. **Routes:**
   - `/api/stats` and `/api/profile/[userId]` carry `achievements`;
   - `/api/gameresult/[gameId]` carries this game's unlocks, and **a friend of
     one player sees the other players' match unlocks but not their career
     ones**;
   - a finishing move through `POST /api/game/command` writes a row. That needs
     `gameRoutes.test.ts`'s `GameResultData` mock extended beyond
     `{ recordGameResult }`, and an `AchievementUnlock` fake store added to
     `src/utils/testing/apiRoute.ts`. The fake's `bulkWrite` returns
     `upsertedIds`, modelled on its GIF catalogue fake;
   - `POST /api/user/delete` removes the player's rows.

Plus the usual gates before every commit: `npm run build`, `npx tsc --noEmit`,
`npm run lint` (`--max-warnings 0`), and `npm test`.

## 13. Implementation: the PRs and their commits

Four PRs. The first two are inert (nothing a player can see changes), the third
turns the feature on, and the fourth brings in every other game.

| PR | What lands | Player-visible | "What's new" | Reviewers |
|---|---|---|---|---|
| **1** | Shapes, the empty registry, the unlock collection | No | None | `rulebook`, `gremlin`, `locksmith` |
| **2** | The award pass, wired into game over | No: the catalogue is empty, so it returns straight away | None | `gremlin`, `croupier`, `rulebook` |
| **3** | Profiles, the result page, the push, and the first catalogue | Yes | One line, *Enhancements* | `caveman`, `locksmith`, `croupier`, `gremlin`, `rulebook` |
| **4** | Every other game's achievements | Yes | Widen PR 3's line, or add one new one | `croupier`, `rulebook` |

The point of the split is that the risky change reaches review on its own, in
PR 2, with nothing visible around it. That risky change is a new step on the
game-over path, a path the cron awaits inline.

Be clear about what PR 2 doesn't prove, though. With an empty catalogue, step 0
of the award pass returns immediately, and even without it Mongoose
short-circuits a `bulkWrite` with no operations. So the write path first runs
for real in PR 3, and PR 3 is also where gremlin looks at it again.

Each PR updates `ARCHITECTURE.md` for what it lands, so the doc describes what
is on `main` at every point. Everything that invites authors to *write*
achievements waits for PR 3.

### PR 1 — Describe an achievement, and somewhere to keep one

1. **`Share the import walker between the module-graph guards`.** Move
   `runtimeImports` / `reachableFrom` out of `serverModuleGraph.test.ts` into
   `src/utils/testing/`, and teach them relative specifiers. That test keeps
   passing unchanged.
2. **`Describe an achievement`.** Add `src/utils/games/achievements.ts`:
   - the types from §3;
   - an empty `GAME_ACHIEVEMENTS` and an empty `PLATFORM_ACHIEVEMENTS`;
   - `achievementById`, `careerProgress`, `careerMet` and `unlockedIds`.

   Tests 1 and 3 from §12. Nothing calls any of it yet.
3. **`Guard the achievements registry`.** Add the `gameRegistry.test.ts` row
   (§12, test 2). It passes trivially today, because no game has the file yet;
   it exists so the first one can't be left out.
4. **`Keep a player's unlocked achievements`.** Add
   `src/utils/mongodb/AchievementUnlockData.ts`:
   - the schema and the unique index;
   - `recordUnlocks`, with the upsert and error handling from §5.2;
   - the fake store in `apiRoute.ts`.

   Also: account deletion removes a player's rows (with the route test);
   `/api/dev/clearresults` wipes the collection; and ARCHITECTURE.md §5 gains
   an `AchievementUnlock` subsection beside `ChatRead` (the index, and the
   deletion rule). The collection stays empty, because nothing writes to it
   yet.

### PR 2 — Judge a finished game

1. **`Tally a player's games without their recent form`.** Pull the `byGame`
   half of `getPlayerStats` out into `getGameStatsByPlayer(userId, gameType?)`,
   so the award pass can ask for it, narrowed to one game where it can be,
   without also fetching the last ten matches. No behaviour change:
   `getPlayerStats` now calls it.
2. **`Refuse to follow a replay that has left the game`.**
   - `buildTimeline` gains a `strict` option, which throws on a recorded
     command the replay refuses, where today it `continue`s past it.
     `replayTurnByTurn` downgrades that throw, as it already does for any
     other.
   - `lastOfEachTurn` is exported. It's the reader `computePerTurnStat`
     already uses, so there's no new replay code.
   - The comment on `buildTimeline`'s `onStep` widens to name achievement
     checks, and `docs/turn-recap-and-planning.md`'s engine table gains the
     strict option.

   This changes shared code, so the PR description says so.
3. **`Judge a finished game's achievements`.** Add
   `src/utils/games/awardAchievements.ts`: the pass from §4.3, with its
   catalogue as a parameter that defaults to the real one. `resultCounts`
   sits beside `RESULT_COUNTS_FILTER`. Test 4 from §12.
4. **`Award achievements when a game ends`.** Add the `withTimeout` call in
   `announceGameOver` (§4.2). The pushes don't mention unlocks yet. Add the
   `gameRoutes.test.ts` case (run with a test catalogue, and with the mock
   extended), and add the award step to ARCHITECTURE.md §5's `finishGame`
   bullet.

### PR 3 — Show them, and the first ones to earn

The commits are ordered so that **the feature becomes visible at commit 7 and
not before**. Everything up to then renders nothing, because the catalogue is
still empty.

1. **`Send a player's achievements with their stats`.** `getPlayerStats` and
   both profile routes gain `achievements`, and `gameResultResponse` gains this
   game's unlocks, filtered as in §6. Route tests, including the
   friend-of-one-player case.
2. **`Fold a section away in one place`.** Extract `DisclosureSection` from
   `WhatsNew`. No behaviour change.
3. **`Show achievements on profiles`.** Add `AchievementsSection` to both
   profile screens, and `ListRow`'s `muted`.
4. **`Show what a game unlocked on its result page`.** One more `ListSection`.
5. **`Say so in the game-over push`.** Add `withUnlocked`, and give every
   player their own push in all three of `announceGameOver`'s branches (§7.4).
6. **`Check the unlock index before anything writes`.** Confirm
   `{ userId: 1, achievementId: 1 }` exists in production. PR 2's deploy will
   have built it. If it hasn't, build it by hand now (§5.2). This is a
   checklist step in the PR description, not a code commit, but it gates the
   next one.
7. **`The first achievements`.** Add `PLATFORM_ACHIEVEMENTS`, and the two games
   from the original request:
   - Dice Cities (§3.4, plus one more match achievement);
   - Settlements & Cities, with this starter set:
     - `settlementsandcities.settler` 🏘️ *"Play 5 games of Settlements &
       Cities"* (career, played, 5);
     - `settlementsandcities.double-honours` 🎖️ *"Win a game holding both
       Longest Road and Largest Army"* (match, `end`:
       `outcome === 'win' && view.longestRoadOwner === userId &&
       view.largestArmyOwner === userId`). Both owners are in every viewer's
       response at every moment.

   **This is the commit that turns the feature on.**
8. **`Say what's new, and write it down`.** Everything that invites authors to
   add achievements:
   - the "What's new" line;
   - the AGENTS.md paragraph;
   - in ARCHITECTURE.md §12: step 9, its one-liners table row, and "steps 7,
     8 and 9" in the sentence above that table;
   - in `docs/new-game.md`: the §5 bullet and the §6 table row;
   - a short `achievements.ts` section in
     `.claude/skills/croupier-review/SKILL.md`;
   - this doc's status line: *shipped for the platform, Dice Cities and
     Settlements & Cities; PR 4 brings the rest*.

### PR 4 — Every other game

One commit per game. Each is an `achievements.ts`, one registry line, and its
checks' tests (including the sentinel test, for games with hidden state). The
games go easiest first:

1. **Snakes & Ladders.**
2. **Solitaire**: career only, since it has no replay adapter.
3. **Race Cars.**
4. **World Domination.**
5. **Train Time.**
6. **Smartthink.**
7. **Outbreak, Fires Out! and Banned Islet.** These are the co-ops: an
   achievement for the table's win is earned by every seat, which `outcomeFor`
   already gives.

The later ones hide the most, so some ideas for them won't be expressible
against their view (§9). That's working as intended.

**If a game needs shared code to change, stop.** Change the shared piece in its
own commit and call it out in the PR description. That means the design in §3
was wrong, not that the game is special.

**"What's new":** if PR 4 lands soon after PR 3, widen PR 3's line ("…in every
game") rather than adding a second one. Otherwise, give it one new line of its
own. Either way it's one line for the whole PR, not one per game.

### Who reviews what, and why it isn't all of them

- **`locksmith`**:
  - PR 1 commit 4, because it touches `src/app/api/user/delete`;
  - PR 3 commit 1, because it changes three route responses, and the result
    page's career filter is the one gate this plan adds.
- **`gremlin`**:
  - PR 1 commit 4 (the index, the upsert, deletion);
  - all of PR 2;
  - PR 3 commit 5, because the per-player sends run inline in the cron.
- **`croupier`**:
  - PR 2 commit 3, where checks get the null-viewer view;
  - PR 3 commits 1 and 7;
  - every commit in PR 4.
- **`caveman`**: PR 3 commits 2–5, where any UI duplication would land.
- **`rulebook`**: every PR's registry line, docs and "What's new".

### If it has to be one PR

Keep the commits in exactly this order and keep the boundaries: PR 1's four,
then PR 2's four, then PR 3's eight.

The unique-index step (PR 3 commit 6) then has no deploy before it to have
built the index, so it becomes "deploy with the catalogue empty first". The
PR can't merge in one go, which is the strongest argument for the split.

Files touched, all told:

```
PR 1  move   src/app/api/serverModuleGraph.test.ts → src/utils/testing/ (runtimeImports, reachableFrom)
PR 1  new    src/utils/games/achievements.ts (+ test)       (shapes, registry, careerProgress/Met, unlockedIds)
PR 1  edit   src/games/gameRegistry.test.ts                 (one row)
PR 1  new    src/utils/mongodb/AchievementUnlockData.ts
PR 1  edit   src/utils/testing/apiRoute.ts                  (fake store)
PR 1  edit   src/app/api/user/delete/route.ts (+ test), src/app/api/dev/clearresults/route.ts
PR 1  edit   ARCHITECTURE.md §5

PR 2  edit   src/utils/mongodb/GameResultData.ts            (getGameStatsByPlayer, resultCounts)
PR 2  edit   src/utils/games/replay.ts                      (strict, export lastOfEachTurn)
PR 2  edit   docs/turn-recap-and-planning.md
PR 2  new    src/utils/games/awardAchievements.ts (+ test)
PR 2  edit   src/utils/games/finishGame.ts                  (one guarded call)
PR 2  edit   src/app/api/game/gameRoutes.test.ts
PR 2  edit   ARCHITECTURE.md §5

PR 3  edit   src/utils/mongodb/GameResultData.ts            (achievements on getPlayerStats, IAchievementUnlock)
PR 3  edit   src/app/api/stats/route.ts, src/app/api/profile/[userId]/route.ts
PR 3  edit   src/utils/api/gameResultResponse.ts
PR 3  new    src/components/ui/DisclosureSection.tsx        (out of WhatsNew)
PR 3  edit   src/components/WhatsNew.tsx
PR 3  new    src/components/ui/AchievementsSection.tsx
PR 3  edit   src/components/ui/ListRow.tsx, src/app/ag-theme.css   (muted)
PR 3  edit   src/app/profile/page.tsx, src/app/profile/[userId]/page.tsx
PR 3  edit   src/app/games/result/[gameId]/page.tsx
PR 3  edit   src/utils/firebase/notificationContent.ts, src/utils/games/finishGame.ts
PR 3  new    src/games/DiceCities/achievements.ts, src/games/SettlementsAndCities/achievements.ts (+ tests)
PR 3  edit   src/utils/ui/whatsNew.ts, AGENTS.md, ARCHITECTURE.md §12, docs/new-game.md,
             .claude/skills/croupier-review/SKILL.md

PR 4  new    src/games/<Game>/achievements.ts (+ test)      (one commit per game)
PR 4  edit   src/utils/games/achievements.ts                (one registry line each)
PR 4  edit   src/utils/ui/whatsNew.ts
```

## 14. Upkeep

- **"What's new"** gets one line in *Enhancements*, in PR 3. Something like:
  *"Achievements: unlock them by playing, and see yours and your friends' on
  your profiles."*
  - PRs 1 and 2 get none, because a player can't tell they landed.
  - PR 4 widens PR 3's line, or adds one of its own (§13).
- **AGENTS.md** gets a paragraph beside the guide, tutorial and theme ones:
  most games also want an `achievements.ts`, registered in
  `GAME_ACHIEVEMENTS`, and written following §11.
- **ARCHITECTURE.md**, in the PR that makes each part true:
  - the `AchievementUnlock` subsection in §5 (PR 1);
  - the award step in §5's `finishGame` bullet (PR 2);
  - in §12, step 9, its table row, and "7, 8 and 9" (PR 3).

  §15 already links here: that link, and the pointer from
  `docs/profile-pictures.md` §2b, went in with this plan.
- **`docs/new-game.md`** gets the §5 bullet beside `guide.ts` / `tutorial.ts`,
  and this row in the §6 wiring table: *`src/utils/games/achievements.ts` —
  (only if you added an `achievements.ts`) import it and add it to
  `GAME_ACHIEVEMENTS`. Without it the game's achievements are never judged or
  shown.*
- **`docs/turn-recap-and-planning.md`** gets the strict replay option (PR 2).
- **`.claude/skills/croupier-review/SKILL.md`** gets a short section on
  `achievements.ts`:
  - checks take the response type;
  - descriptions name no hidden specific;
  - no secret achievement ships its text in the bundle.

## 15. Decisions taken, and open questions

The first four rows are decided in this plan, and each could be reversed
without redesigning the rest. The others are left open.

| # | Question | Taken for v1 | What reversing or answering it would take |
|---|---|---|---|
| 1 | Mid-game unlocks? | **No.** Judged at game over only (§4.1). | A per-command hook in `runCommand`, for a whitelisted subset of checks, judged on the same null view. Worth it only for achievements that are fun *in the moment*, and it needs a croupier pass on each one, because the timing of the announcement itself tells the table something. |
| 2 | Do exhibition (guest) games count? | **No**, same as stats (§8). | Nothing in this doc. It would mean changing `RESULT_COUNTS_FILTER` / `resultCounts`, and the stats with them. |
| 3 | Who can see someone's achievements? | **Whoever can see their stats**: themselves and their friends (§6). On the result page, a game's match unlocks go to everyone the page lets in, and career milestones only to the player who earned them. | A privacy setting would gate the achievements and the stats together, which is the question `docs/social-features.md` §7 already asks. |
| 4 | Icons | **One emoji** per achievement. | An optional `art` path, the way `GameMeta` has art, preferred by the row's icon slot. Nothing stored changes. |
| 5 | Should a surrendered or abandoned game count toward "played"? | Yes, to match the profile (§8). | A `count: 'completed'` variant that skips `ended` and `abandoned`. It's cheap to add, and it becomes necessary under 5b. |
| 5b | Should achievements unlock anything: avatars, themes? | Not in v1. | `docs/profile-pictures.md` §2b is the natural first. **Before any grant ships**: a completed-only count (5), solo games left out of platform counts, and a grant re-checked against `GameResult` when the reward is selected rather than trusting the stored row. §8 lists the farming paths each of these closes. |
| 6 | Secret achievements, tiers, points? | Not in v1. | Secret ones need their text sent from the server once unlocked, not shipped in the bundle (§9). Tiers and points are a presentation layer over the same rows. |
| 7 | Kingdom Builder | Out of scope (§8). | Its own trigger, designed with seasons. |
| 8 | An extra replay at game over | Accepted (§4.4). | Fold the `anyTurnEnd` readers into a replay the result stats already make, if the cron's budget ever says so. |
| 9 | Store derived-only career unlocks eagerly? | No: they're stored as each player finishes a relevant game (§5.3). | A one-shot backfill when PR 3 deploys, as an admin route that pages through players with results. It closes the "an opponent's account deletion takes back a derived unlock" gap. |

## 16. Rejected, and why

- **Judging on every command.** It puts work on the hot path of every move,
  announces facts about a game while it's still being played, and rewards
  states that can still be undone (§4.1).
- **Handing checks the internal state.** It's the easiest thing to write, and
  it's how "win holding an unplayed Knight" would publish a secret on a
  profile. A sentence telling authors not to do that would be enforced only
  by review. Instead, the type rules it out (§9).
- **Judging match achievements on a surrender or an abandonment.** Any player
  can end a game mid-turn, so the state judged would be a moment they chose,
  not one the game settled (§4.1).
- **Storing nothing, and deriving every unlock on read.** An unlock would then
  vanish whenever an opponent deleted their account and took the shared
  results with them. There'd be no date or game to point at, and the push
  couldn't tell a new unlock from an old one. Match achievements couldn't be
  derived at all. So the unlock is stored, and only the *progress* is derived
  (§5.3).
- **A profile read that writes the rows it derives.** It would close §5.3's
  accepted exception, but it would make a GET write, and a friend's GET write
  into someone else's rows. No GET here writes.
- **Clerk `privateMetadata`.** An 8 KB blob, written back whole (a race
  `/api/gameguides` has to work around), and unreadable on a friend's profile
  without one Clerk call per friend (§5.1).
- **Counters on a `UserProfile` document.** There isn't one (§2). The counts
  it would hold already come out of one indexed aggregation over `GameResult`,
  which the profile runs anyway.
- **Progress rows.** Progress is `careerProgress(byGame)`, which is free on
  both sides. A stored copy would be a second source of truth for a number the
  profile prints right beside it.
- **A rules DSL for match criteria** (JSON conditions over state paths). A
  function over the game's own typed view is shorter, type-checked, safe to
  refactor, and easy to unit-test. Only career criteria are declarative,
  because only they need to be read back for progress (§3.2).
- **A badge grid with a detail modal.** It would mean one new component used
  by one screen and a second way to draw an achievement beside the result
  page's rows, and it hides the requirement behind a tap on a phone. `ListRow`
  already shows everything a badge and its modal would (§7.2). A grid can come
  later as a presentation change over the same data.
- **`NamedChip` on the result page.** It's the in-board hand chip: it's
  styled as a card, its label is tiny, and its description sits in a hover
  `title` a phone never shows.
- **A separate "achievement unlocked" push.** It would be the third
  notification at the end of one game, and more noise on the bus the whole
  app depends on (§7.4).
- **A new `/api/achievements` route.** The three reads that need achievements
  already exist and carry the right gates. A fourth route would be one more
  gate to get wrong, for data those responses can carry (§6).
- **One replay per `anyTurnEnd` achievement**, and an early exit from the one
  replay there is. One pass serves them all (§4.3). Stopping part-way would
  mean adding an abort path to a replay core that recap, planning and the
  result stats all share, for checks that are cheap anyway.
- **A new turn-by-turn replay helper.** `lastOfEachTurn` already collects the
  null-viewer snapshot at every turn end, for `computePerTurnStat`. Exporting
  it is the whole change.
- **Putting the registry in `src/utils/ui/`** with the guide and tutorial
  ones. Part of an achievement is a rule the server runs, and that folder is
  for presentation (§3.1).
