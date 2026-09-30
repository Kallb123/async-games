# Achievements — plan

**Status: plan. Nothing here is built yet.** §13 has the build order: four PRs,
the first two with no visible change, the third the one that turns the feature
on.

An achievement is something a player unlocks by doing a particular thing,
either in one game or across many:

- **across games** — "Play 5 games of Settlements & Cities", "Win 5 games of
  Dice Cities", "Finish a game of 5 different games";
- **inside one game** — "Own every Mine in a game of Dice Cities".

Each has a **title**, an **icon**, a **description** (the requirement, in the
player's words) and **criteria** (the requirement, in code). Games author their
own, one file per game beside `guide.ts` and `tutorial.ts`, collected into a
registry the same way. The platform owns a few more that no single game can.

This document settles five things: what an achievement *is* as data (§3), when
the server decides that one has been earned (§4), where an unlock is kept (§5),
what the player sees (§7), and how it ships (§13).

## Contents

1. [What a player gets](#1-what-a-player-gets)
2. [What already exists to build on](#2-what-already-exists-to-build-on)
3. [An achievement, as data](#3-an-achievement-as-data)
4. [When an achievement is judged](#4-when-an-achievement-is-judged)
5. [Storage: one flat collection of unlocks](#5-storage-one-flat-collection-of-unlocks)
6. [API: no new routes](#6-api-no-new-routes)
7. [UI](#7-ui)
8. [Who can earn one, and from which games](#8-who-can-earn-one-and-from-which-games)
9. [Hidden information](#9-hidden-information)
10. [Robustness](#10-robustness)
11. [Writing a game's achievements](#11-writing-a-games-achievements)
12. [Tests](#12-tests)
13. [Implementation: the PRs and their commits](#13-implementation-the-prs-and-their-commits)
14. [Upkeep](#14-upkeep)
15. [Decisions taken, and open questions](#15-decisions-taken-and-open-questions)
16. [Rejected, and why](#16-rejected-and-why)

---

## 1. What a player gets

**On their profile**, an *Achievements* section: how many they've unlocked out
of how many exist, then every achievement as a badge. The platform's own come
first, then one group per game, with the games they've played ahead of the
ones they haven't. An unlocked badge is in colour. A locked one is greyed out
with its requirement under it, and a counted one shows how far they've got
("3 / 5 wins").

```
  ┌──────────────────────────────────┐
  │ Achievements            7 of 31  │
  │                                  │
  │ Everything                       │
  │  (🏆)   (🧭)   (🎲)               │
  │ First   Explo- Regu-             │
  │  win    rer    lar               │
  │         3/5    12/25             │
  │                                  │
  │ ▣ Dice Cities                    │
  │  (🏙️)   (⛏️)                      │
  │ Mayor  Mine                      │
  │  5/5   Baron                     │
  │                                  │
  │ ▣ Settlements & Cities           │
  │  (🏘️)   (🎖️)                      │
  │ Settl- Double                    │
  │  er    Honours                   │
  │  2/5                             │
  │                                  │
  │ ▸ 8 games you haven't played     │
  └──────────────────────────────────┘
```

Tapping a badge opens it: the icon, title and description, and either when and
where it was unlocked ("12 Oct, in a game of Dice Cities") or how far the
player has got.

**On a friend's profile**, the same section, read-only. It is shown to exactly
the people who can already see that player's stats.

**When a game ends**:

- the game-over push names anything it unlocked for that player: *"You won
  against Priya · 🏆 Unlocked Mine Baron"*;
- the game's result page lists, per player, what that game unlocked.

**Never during a game.** An achievement is judged once the game is over (§4),
so nothing pops up mid-turn. That is a deliberate v1 limit, not an oversight:
§4 explains why and §15 lists it as an open question.

## 2. What already exists to build on

Almost everything this needs is already in place. The new work is a registry,
one small collection, one server pass at game over, and the UI.

| What | Where | What achievements use it for |
|---|---|---|
| **The one place a game ends** | `finishGame()` / `announceGameOver()` in `src/utils/games/finishGame.ts` | The hook. All three ways a game ends (the command pipeline, `POST /api/game/end`, the turn-timer cron's abandon) go through it, so one call here covers every ending. |
| **`GameResult`**, written once per finished game | `src/utils/mongodb/GameResultData.ts` | Counting achievements. Games played and won per game already come out of one aggregation (`getPlayerStats` → `byGame`), and `outcomeFor` is the single rule for what a game was worth to one player. |
| **`RESULT_COUNTS_FILTER`** | same | Which games count. A game with a guest who hasn't claimed their account is an exhibition match: it counts toward nobody's stats (`docs/account-less-play.md` §8), so it counts toward nobody's achievements either. |
| **The replay engine** | `src/utils/games/replay.ts` — `buildTimeline`, and `lastOfEachTurn` behind `computePerTurnInternalStats` | "At the end of any turn" achievements. The result charts already replay a finished game turn by turn against its internal state, one pass at game end. |
| **Per-game registries with guard tests** | `GAME_GUIDES`, `GAME_TUTORIALS`, `GAME_THEMES`, and `src/games/gameRegistry.test.ts` | The shape of `GAME_ACHIEVEMENTS`: each game owns its own file, the shared file adds one import and one line, and a test fails CI when a game ships the file and misses the line. |
| **Profile screens and their gate** | `src/app/profile/page.tsx`, `src/app/profile/[userId]/page.tsx`, `/api/stats`, `/api/profile/[userId]` (`areFriends`) | Where achievements show, and who may see them. Both screens already fetch `byGame`, which is all a progress bar needs. |
| **The result page and its gate** | `src/app/games/result/[gameId]/page.tsx`, `gameResultResponse` | "Unlocked in this game". Open to the game's players and their friends. |
| **Push copy in one place** | `src/utils/firebase/notificationContent.ts` | The "· 🏆 Unlocked Mine Baron" line on the game-over push. |
| **Account deletion** | `POST /api/user/delete` | Removing a player's unlocks with the rest of their data. |
| **UI pieces** | `Section`, `CollapsingSection`, `Stat`, `InfoModal`, `NamedChip`, `GameThumb` in `src/components/ui/` | Nearly all of §7. The new pieces are one badge component and a few `ag-achievement*` classes. |

One correction to the other docs while we're here: `docs/social-features.md`
§5 and its §1 table describe a `UserProfile` collection holding incrementally
updated aggregates. **There isn't one.** `src/utils/mongodb/` has no such model;
stats are aggregated from `GameResult` whenever a profile is read. Nothing in
this plan depends on `UserProfile`, and counting achievements deliberately reads
the same `byGame` aggregate the profile does (§3.2), so "5 games played" on an
achievement always matches the number printed beside it.

## 3. An achievement, as data

### 3.1 The shape

The shapes and the registry live in `src/utils/games/achievements.ts`, beside
the other cross-game registries in that folder (`playerDropout.ts`,
`turnTimeout.ts`). Not `src/utils/ui/`, where the guide and tutorial registries
live: part of an achievement is a rule, and that folder is for presentation.

```ts
// src/utils/games/achievements.ts

/** One thing a player can unlock. Authored as data, one list per game. */
export interface Achievement<S = unknown> {
    /**
     * Stable for ever: it is stored on every unlock. `<game slug>.<name>` for
     * a game's own, `platform.<name>` for the cross-game ones. Never reuse one
     * (§11).
     */
    id: string;
    /** Short enough to sit under a badge: "Mine Baron". */
    title: string;
    /** One emoji. The badge draws it. */
    icon: string;
    /** The requirement, in the player's words: "Own every Mine in a game." */
    description: string;
    criteria: CareerCriteria | MatchCriteria<S>;
}
```

`description` is what the user asked for as the achievement's *criteria* in
words; `criteria` is the same thing in code. Keeping both is what lets a locked
badge say what it wants without the UI having to turn a predicate into prose.

There are two kinds of criteria, because there are two kinds of achievement,
and they are judged in different ways.

### 3.2 Career criteria: counted across games

"Play 5 games of Settlements & Cities", "Win 5 games of Dice Cities", "Finish
a game of 5 different games". These are counts, so they are **declared, not
coded**:

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

Declared rather than a function, because a locked counting achievement has to
show how far along the player is, and that number has to be computed in two
places (the server, deciding whether to unlock it, and the profile, drawing its
progress) from data both already have. So the counting is one pure function
over the `IGameStats[]` (`byGame`) that `getPlayerStats` already returns and
both profile screens already fetch:

```ts
/** How far `byGame` has got toward `criteria`. Unlocked once it reaches `target`. */
export function careerProgress(criteria: CareerCriteria, byGame: IGameStats[]): number {
    const games = criteria.game ? byGame.filter(g => g.url === criteria.game) : byGame;
    switch (criteria.count) {
        case 'played': return sum(games, g => g.total);
        case 'won': return sum(games, g => g.wins);
        case 'differentGames': return byGame.filter(g => g.total > 0).length;
    }
}
```

A win is whatever `outcomeFor` says it is (a co-op team win counts, a dropped
player's game doesn't). `byGame` is already folded through it, so there is no
second copy of that rule here.

### 3.3 Match criteria: decided inside one game

"Own every Mine in a game of Dice Cities", "Win holding both Longest Road and
Largest Army". These depend on the game's own state, so they are **a function
over that state**:

```ts
export interface MatchCriteria<S> {
    kind: 'match';
    /**
     * 'end': judged once, on the finished game's final state.
     * 'anyTurnEnd': judged on the state at the end of every turn, and earned if
     * any one of them passes. Costs a replay (§4.3), so use it only when the
     * final state can't answer.
     */
    at: 'end' | 'anyTurnEnd';
    check: (state: S, player: MatchPlayer) => boolean;
}

export interface MatchPlayer {
    userId: string;
    /** From outcomeFor: the same answer the player's profile gives. */
    outcome: MatchOutcome;
    playerCount: number;
}
```

`S` is the game's **internal** `specificGameState`: the server's own copy, with
every hand in it, never a response shape. Checks only ever run on the server
after the game is over (§4), and §9 has the rule that keeps a check from giving
away something a player couldn't see.

A check is **pure, synchronous and fast**: no I/O, no clock, no randomness. The
type makes most of that true (it returns a `boolean`, not a promise), and §11
has the rest.

Both `at` values read the state at a **settled** point, the end of a turn or
the end of the game, never in the middle of one. That matters because of undo
(`docs/undo.md`): a Dice Cities purchase can be taken back inside its
ten-second hold, and a player who bought the sixth Mine and then undid it
never owned six Mines. A turn's end is after every undo that turn could make,
so reading only there makes an undone state impossible to reward, without any
check having to think about undo.

### 3.4 An example, end to end

The Dice Cities file:

```ts
// src/games/DiceCities/achievements.ts
import type { Achievement } from "@/utils/games/achievements";
import type { IDiceCitiesGameState } from "./DiceCitiesModels";
import { DiceCitiesCardIds } from "./cards";

function owned(state: IDiceCitiesGameState, userId: string, card: string): number {
    return state.playerStates.get(userId)?.cards.find(c => c.card === card)?.amount ?? 0;
}

/** This player has at least one, and nobody else, the bank included, has any. */
function ownsEvery(state: IDiceCitiesGameState, userId: string, card: string): boolean {
    return owned(state, userId, card) > 0
        && !state.bankCards.some(c => c.card === card && c.amount > 0)
        && [...state.playerStates.keys()].every(id => id === userId || owned(state, id, card) === 0);
}

export const achievements: Achievement<IDiceCitiesGameState>[] = [
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
        description: 'Own every Mine in a game of Dice Cities at the end of a turn.',
        criteria: {
            kind: 'match',
            at: 'anyTurnEnd',
            check: (state, { userId }) => ownsEvery(state, userId, DiceCitiesCardIds.MINE),
        },
    },
];
```

Three details are worth noticing:

- `ownsEvery` asks "does anyone else have one?" rather than "have I got six?".
  The supply is six today, but a check that hard-codes the supply goes wrong
  the day an expansion changes it.
- It is `anyTurnEnd`, not `end`. A Business Center swap can take a Mine away
  again before the game finishes, and the achievement is for having owned them
  all, not for still owning them at the finish.
- The only imports that do anything at runtime are `cards.ts`, which is static
  data. `DiceCitiesModels.ts` is imported with `import type`, which is erased
  on compile. That matters because this file is also loaded in the browser
  (§7), and `DiceCitiesModels.ts` would bring Mongoose with it. §12 has a test
  for it.

### 3.5 The registry

The same idiom as `GAME_GUIDES`: one import and one line per game.

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

/** Every achievement, by id. Unknown ids come back undefined, and readers drop them. */
export function achievementById(id: string): Achievement | undefined;

/** Stored unlocks, plus every career achievement `byGame` already meets (§5.3). */
export function unlockedIds(stored: string[], byGame: IGameStats[]): Set<string>;
```

`achievementById` is total, in the same way `themeIdFor` is (`docs/game-themes.md`
§4): a stored id the catalogue no longer knows is dropped quietly, never an
error.

## 4. When an achievement is judged

### 4.1 Once, when the game is over

Achievements are judged in `announceGameOver`, the part of `finishGame` that
runs after the finished game has been saved. They are never judged on an
ordinary move. There are four reasons:

1. **It's the one place every game ends.** A move that wins, a surrender, and
   the cron abandoning a stalled game all pass through here, so one call covers
   all of them, and the command route doesn't change at all.
2. **Hidden information.** An unlock announced mid-game is a side channel. If
   *"Alice unlocked Hoarder: hold 10 cards"* appears on the table's screens
   during a Settlements & Cities game, everyone now knows the size of her hand.
   Once the game is over, the hand is no longer a secret worth keeping (§9).
3. **Undo.** Mid-game, a state can still be taken back (§3.3). At game over,
   nothing can.
4. **Cost.** The command route runs on every move. `announceGameOver` runs once
   per game, and runs in `after()`, once the response has already gone back.

The cost of that choice is that there's no "Achievement unlocked!" moment
during play. §15 keeps that open for a later phase, and says what it would
need.

### 4.2 Where it sits in `announceGameOver`

```
announceGameOver(gameData)
  1. usersById(gameData.userIdList)                  (already there)
  2. try { recordGameResult(...) }                   (already there)
  3. try { unlocked = awardAchievements(...) }       NEW: only if 2 succeeded
  4. the GameOver pushes, now naming `unlocked`      (copy changes, §7.4)
```

- **After the result, because career counts read it.** The game that just
  finished has to be counted in `byGame` before "win 5" is checked, and
  `byGame` is read from `GameResult`.
- **Only if the result was written.** If the record failed, the counts don't
  include this game, and skipping keeps achievements from ever getting ahead of
  the stats beside them. If `recordGameResult` found a duplicate (a retried
  request), that counts as written: awarding is idempotent (§5.2), so running
  it again unlocks nothing new.
- **Before the pushes, and in its own `try`.** A push can only mention an unlock
  that's already been awarded, and a failure here must not cost the table its
  game-over push, which is exactly why step 2 already has a `try` of its own.

### 4.3 The award pass

`awardAchievements(gameData, counted)` lives in
`src/utils/games/awardAchievements.ts` and is server-only. For a finished game:

1. **Does the game count?** If it has an unclaimed guest (`unclaimedPlayerIds`
   is non-empty), stop: nobody earns anything from an exhibition match (§8).
2. **Who's being judged?** The roster minus `droppedPlayers`. A dropped player
   still has the game counted as a loss (their career numbers move, and step 4
   catches that next time they finish a game), but their seat has left
   `specificGameState`, so there's nothing for a match check to read.
3. **What do they already hold?** One indexed read:
   `AchievementUnlock.find({ userId: { $in: seats } })`.
4. **Career.** For each seat, `byGame` (the same aggregation the profile uses),
   and every career achievement across the whole catalogue that
   `careerProgress` says is met but isn't held yet. The whole catalogue, and not
   just this game's list, because that's what makes the launch backfill and a
   guest's claim settle without a script of their own (§5.3).
5. **Match, `at: 'end'`.** For each seat, and each of this game's match
   achievements it doesn't hold, `check(gameData.specificGameState, player)`.
   No replay: this is the live document.
6. **Match, `at: 'anyTurnEnd'`.** Only if a seat still lacks one of these: **one**
   replay, whatever the number of achievements, with a new `forEachTurnEnd`
   helper in `replay.ts` (it's `lastOfEachTurn` with the internal state read
   eagerly, the way `computePerTurnInternalStats` already does). Each
   (seat, achievement) pair stops being checked once it has passed.
7. **Write.** One `bulkWrite` of upserts (§5.2), and hand back only the rows it
   actually inserted, grouped by player. Those are what the push and the
   result page talk about.

Each check runs inside its own `try`. One broken check costs its own
achievement for this game and logs a warning. It never costs the others, the
pushes, or the game.

### 4.4 What about the cron?

The turn-timer cron `await`s `announce()` inline rather than handing it to
`after()`, and it has a deadline (`ARCHITECTURE.md` §7). Awarding adds at most
one aggregation per seat and, only for a game with `anyTurnEnd` checks, one
replay. At that same moment the result stats already replay the game between
one time (Settlements & Cities) and four (Outbreak and Banned Islet), and Dice
Cities three. So this adds one more replay to those, which doesn't
change the order of the cost, and only on the one sweep where a game is
abandoned. If it ever shows up in the cron's budget, the fix is to pass the
achievement readers into one of the replays the result stats already do,
rather than adding another (§15).

## 5. Storage: one flat collection of unlocks

### 5.1 `AchievementUnlock`

`src/utils/mongodb/AchievementUnlockData.ts` is a flat collection, like
`ChatRead`: not a discriminator, and not a field on `GameData` or `GameResult`.

```ts
interface IAchievementUnlockData {
    userId: string;         // Clerk userId
    achievementId: string;  // "dicecities.mine-baron"
    gameId: string;         // the game whose ending awarded it
    unlockedAt: string;     // ISO
}
```

- **`{ userId: 1, achievementId: 1 }`, unique.** Each player holds each
  achievement at most once. That index is also the only read the profile makes.
- **`gameId` on every row, career ones included.** A career unlock belongs to
  the game that tipped it over ("your fifth Dice Cities win"), which is what
  lets the result page say *"unlocked in this game"* for both kinds. The
  launch backfill is the one exception to "the game that tipped it" (§5.3).
- **Why not on `GameResult`?** A `GameResult` is one game. An achievement is
  one player's, and career ones span games. That's also why it isn't in Clerk
  metadata: that's an 8 KB blob that has to be read back whole to write it
  (the race `/api/gameguides` has to work around), and a friend's profile would
  need one Clerk call per friend just to read it.

### 5.2 Writing it: upserts, and only the new ones count

```ts
AchievementUnlockModel.bulkWrite(newlyMet.map(({ userId, achievementId }) => ({
    updateOne: {
        filter: { userId, achievementId },
        update: { $setOnInsert: { userId, achievementId, gameId, unlockedAt } },
        upsert: true,
    },
})), { ordered: false });
```

The *new* unlocks are the ones in `upsertedIds`. That matters when two of a
player's games finish at the same moment and both decide they've just earned
"Win 5". Both upsert, one inserts, and only that one's push says so. An
`insertMany` would do the same work, but it reports its duplicates by throwing
a `MongoBulkWriteError`, and the caller then has to dig out of the error which
rows did go in. `isDuplicateKeyError` (`duplicateKey.ts`) looks only at the
top-level code, so catching it that way would swallow the error along with the
answer to "which rows are new".

### 5.3 Reading it: stored ∪ met

On the profile:

```
unlocked = stored unlock ids  ∪  { career achievements careerProgress says are met now }
```

With that one line, three cases need nothing extra:

- **Launch.** A player with twenty Dice Cities wins sees *Mayor* unlocked the
  moment achievements ship: no backfill script, no admin route. It shows as
  unlocked without a date until their next finished game writes the row (step 4
  of §4.3), and after that it has one. That first row names that game as where
  it was unlocked, even though the fifth win came long before. Accept it: it
  happens once per player, at launch, and it's still true that this is when the
  app recognised it.
- **A guest claims their account.** Their exhibition games start counting the
  moment `unclaimedPlayerIds` is `$pull`ed (`api/user/claim`), so their career
  achievements, and the other players' in those games, appear on the next
  profile read, again with no script.
- **An opponent deletes their account.** `api/user/delete` removes every
  `GameResult` that player was in, so a counterparty's `byGame` can go *down*.
  A stored unlock stays, so an achievement once earned is never taken away.
  That's the reason career unlocks are stored at all, rather than derived on
  read every time (§16).

**Match achievements** have no "met now" half. They are unlocked only if a row
says so, because the state that earned one is gone once the game is over.

### 5.4 Deletion

`POST /api/user/delete` gains
`AchievementUnlockModel.deleteMany({ userId }).exec()`, next to the reactions
line, and its route test gains the assertion. It deletes by *user* and not by
game, because an unlock belongs to the player, not the table. Other players'
unlocks from the same games stay theirs.

## 6. API: no new routes

The three reads that need achievements already exist, and each already carries
the right gate. So this plan adds fields, not routes, and nothing a client can
send can create an unlock. There is no write route at all.

| Route | Gains | Gate (unchanged) |
|---|---|---|
| `GET /api/stats` | `achievements: IAchievementUnlock[]` | Signed in, and it's your own |
| `GET /api/profile/[userId]` | `achievements: IAchievementUnlock[]` | Self or an accepted friend (`areFriends`) |
| `GET /api/gameresult/[gameId]` | `achievements: { userId, id }[]`, unlocks whose `gameId` is this game | A player in the game, or a friend of one |

```ts
export interface IAchievementUnlock {
    id: string;
    unlockedAt: string;
    gameId: string;
}
```

Both profile routes build their response from `getPlayerStats`, so that's
where the unlock read goes. That keeps it in one place rather than two call
sites. The response carries only **ids**: the title, icon and description are
looked up from the catalogue on the client, so the copy has one home and a
typo fix doesn't need a migration.

Every change here is additive, so no existing client breaks and no request
shape changes.

## 7. UI

### 7.1 The catalogue is on the client

The profile imports `GAME_ACHIEVEMENTS` and `PLATFORM_ACHIEVEMENTS` to draw
every badge, locked ones included. That's why a game's `achievements.ts` has to
be isomorphic (§3.4, §11). The `check` functions go along with them. They're a
few small pure functions, and they reveal nothing: they're rules, not state.

### 7.2 New shared pieces

- **`AchievementBadge`** (`src/components/ui/`) draws one badge: the icon in a
  disc, the title under it, greyed and desaturated when locked, with an
  optional progress caption ("3 / 5"). New classes: `.ag-achievement`,
  `.ag-achievement--locked`, `.ag-achievement-grid`, all in `ag-theme.css`
  and built from the existing tokens. There's no new colour.
- **`AchievementsSection`** (`src/components/ui/`) is the whole profile block,
  used by both profile screens, the way `GameStatsList` and
  `RecentFormSection` already are. It's a `Section` with the "7 of 31" count,
  one grid per group, and the games not yet played folded into a
  `CollapsingSection`. Tapping a badge opens it in `InfoModal`, with the
  requirement as one section and when and where it was unlocked (or how far
  along the player is) as another. `InfoModal` takes plain-text sections, so
  a link through to that game's result page would mean giving it an optional
  action. That's a small change if it's wanted, but it isn't needed for v1.

### 7.3 Reused as they are

- **The result page** lists what the game unlocked, per player, as a row of
  `NamedChip`s. That component is already "a mark and a name": the icon is the
  mark, the title is the name, the description goes in the chip's `title`.
- **The group headers** on the profile use `GameThumb`, as `GameStatsList`
  does.
- **Progress** is `careerProgress` over the `byGame` the screen has already
  fetched. There's no second request.

### 7.4 The game-over push

`buildGameWonNotification`, `buildGameLostNotification` and
`buildTeamResultNotification` each take an optional `unlocked: Achievement[]`,
and add one clause to the body: *"· 🏆 Unlocked Mine Baron"*, or *"· 🏆
Unlocked Mine Baron and 2 more"*. The title stays as it is, and so does the
image (the game's own art, as every push has).

`announceGameOver` currently sends one push to all the losers together. From
now on, a loser who unlocked something gets their own push, and everyone else
still shares one. With at most eight seats that's at most eight sends, and
those sends are to users already loaded, so no extra Clerk calls.

There's **no separate "achievement unlocked" push.** Three notifications at the
end of a game (it's over, you lost, you unlocked something) is how a player
learns to mute a channel (§16).

### 7.5 Not in v1

- Achievements listed on a game's setup screen or in `GameLibrary`.
- A "new" dot for unlocks the player hasn't looked at yet. That needs a read
  marker of its own (the `ChatRead` pattern), so it's a separate change.
- Showing unlocks on the `GameFinishBanner`. The board's final response goes
  out before `after()` has awarded anything, so the banner would need a second
  fetch. Its "View result" button already leads to the page that lists them.

## 8. Who can earn one, and from which games

- **Registered players, from games that count.** "Counts" means exactly what
  it means for stats: `RESULT_COUNTS_FILTER`. A game with an unclaimed guest in
  it earns nobody anything, including the registered players at that table.
  Anything looser would let one person farm "Win 5" by beating guest accounts
  they made themselves.
- **Guests** earn nothing while they're guests. Once they claim, their career
  achievements count everything they played (§5.3). Match achievements from
  those exhibition games are never awarded: nobody judged them at the time,
  and the state that would have earned them has gone.
- **Every way a game ends counts toward "played"**, including a surrender and
  an abandonment. That's the same as the profile, so the two numbers always
  agree. §15 records the obvious objection (you could start a game and
  surrender it to pad "played") and why v1 lives with it.
- **Solo games** (Solitaire) count like any other. Winning a game of Solitaire
  is a real win.
- **Kingdom Builder** is out of scope. A world is a persistent thing that
  never goes through `finishGame`, so there's no game over to judge at. It
  would need its own trigger (a world ending, a season closing), designed along
  with its seasons.

## 9. Hidden information

A check reads the internal state, which includes every hand. That's safe
because of *when* it runs and *what the unlock tells people*:

- **Never before the game is over.** §4 ensures that. Nothing is judged while
  there's still a game for a secret to matter to.
- **An unlock is still a statement about the game.** It's visible on the
  earner's profile to their friends, and on the result page to the players and
  their friends. So the rule for authors is: **if the result page wouldn't
  show it, an achievement must not hinge on it.** A final score, a longest
  road, the landmarks bought, the cards on the table — fine. The exact tickets
  a Train Time player failed to complete, if scoring never revealed which ones
  they were — not fine, because the unlock itself would reveal them.
- **The description must not name a hidden specific** ("Hold the 🗡️ Knight
  card at the end") for the same reason.

`croupier` reviews every game's `achievements.ts` against that rule (§13).

## 10. Robustness

| What could go wrong | What happens |
|---|---|
| A check throws | That achievement is skipped for this game, with a warning. The others, the pushes and the game are unaffected (§4.3). |
| The replay fails (a game from before its snapshot existed, a broken adapter) | Every `anyTurnEnd` check counts as not met, and there's a warning, the same way the result charts degrade (`replayTurnByTurn`). `end` checks and career achievements don't depend on it. |
| `recordGameResult` fails | Awarding is skipped for this game (§4.2). Career achievements catch up at the player's next finished game, because the whole catalogue is reconciled each time. |
| Mongo is unavailable during awarding | The `try` around step 3 catches it, and the pushes go out without the unlock clause. Nothing is half-written that matters: each upsert stands on its own. |
| The request is retried, or `announce` runs twice | The unique index plus upserts means nothing is inserted twice, and the second push (if there is one) names nothing, because nothing new was inserted. |
| Two of a player's games finish at once | Both upsert, one inserts, and only its push names the unlock (§5.2). |
| An achievement is withdrawn from the catalogue | Its stored rows become unknown ids, and readers drop them (`achievementById`). The id must never be reused (§11). |
| A player with thousands of games | The career read is the same bounded `byGame` aggregation the profile already runs: one group per game per ending, not one per match. |
| The cron's deadline | At most one aggregation per seat and one replay per abandoned game (§4.4). |

`gremlin` reviews PR 2 against this table.

## 11. Writing a game's achievements

For whoever writes the next game's `achievements.ts`:

- **Put it beside `meta.ts`**, and export `achievements`. Add one import and
  one line to `GAME_ACHIEVEMENTS`. The guard test will fail if you forget.
- **Prefix every id with the game's slug**: `dicecities.mine-baron`. An id is
  permanent. Rename the title as often as you like, but never change or reuse
  an id: the stored rows point at it, and a reused id hands the new
  achievement to everyone who earned the old one.
- **Write the description as the requirement**, precisely enough to settle an
  argument: "at the end of a turn", "in one game", "win" versus "finish".
- **A game's career achievements count that game** (`game: '<its slug>'`).
  Cross-game counts go in `PLATFORM_ACHIEVEMENTS`. The platform list has no
  match achievements, because a match check reads one game's state.
- **Prefer `at: 'end'`.** Use `anyTurnEnd` only when the final state genuinely
  can't answer, because it costs a replay.
- **Only `import type` from `<Game>Models.ts`.** Static data (`cards.ts`,
  `board.ts`) and pure helpers are fine. The file is loaded in the browser.
- **Don't count on theme names.** Achievements belong to the account, not to
  one game's dressing, so they use the default theme's nouns. That's the same
  known edge the result page already has (`docs/game-themes.md` §7).
- **Mind §9**: nothing that the result page wouldn't show.
- **Aim for three to six per game**: a *played* and a *won* rung, and a couple
  of match achievements that reward a distinctive way of playing the game, not
  a grind. Something a keen player gets in their first ten games is about
  right.

## 12. Tests

In the repo's existing idiom: the pure parts get unit tests, the routes get the
integration harness, and the registry gets a structural guard.

1. **Catalogue integrity** (`src/utils/games/achievements.test.ts`):
   - every id is unique across the whole catalogue;
   - every id is namespaced by the slug it's registered under, or by
     `platform.`;
   - every career `game` is a real `GAME_META` slug, and a game's own list
     names only itself;
   - `PLATFORM_ACHIEVEMENTS` holds no `match` criteria;
   - `target` ≥ 1, and `title`, `icon` and `description` aren't empty;
   - **no `achievements.ts` has a runtime import of a `*Models.ts` file or of
     `mongoose`.** This is a source scan, like `serializableRegistry.test.ts`,
     that allows `import type` and fails on anything else. Without it, the
     first check that reached for a helper out of `Models.ts` would ship
     Mongoose to the browser.
2. **The registry line** (`src/games/gameRegistry.test.ts`): "wires every
   game's achievements into GAME_ACHIEVEMENTS", which discovers games with an
   `achievements.ts` the same way the guide and tutorial rows do.
3. **`careerProgress` and `unlockedIds`**: pure, over hand-built `IGameStats[]`
   fixtures, covering an empty history, one game, several games, and a game
   with no wins.
4. **The award pass** (`awardAchievements.test.ts`), against the Dice Cities
   `testHarness`, with a test catalogue passed in so it doesn't depend on
   whatever the real one holds. It checks that:
   - an `end` check passes and fails on the final state;
   - an `anyTurnEnd` check is earned by a state held at one turn end and lost
     by the next (the Business Center swap);
   - a sixth Mine bought and then undone is **not** earned;
   - a dropped seat is not match-judged;
   - an exhibition game awards nothing;
   - a second run inserts nothing and returns nothing;
   - a throwing check costs only itself.
5. **Every match achievement's `check`** gets a small unit test beside its
   game, with one hand-built state that passes and one that fails.
6. **Routes**:
   - `/api/stats` and `/api/profile/[userId]` carry `achievements`;
   - `/api/gameresult/[gameId]` carries this game's unlocks;
   - a finishing move through `POST /api/game/command` writes a row (extend
     `gameRoutes.test.ts`);
   - `POST /api/user/delete` removes the player's rows.

Plus the usual gates before every commit: `npm run build`, `npx tsc --noEmit`,
`npm run lint` (`--max-warnings 0`), and `npm test`.

## 13. Implementation: the PRs and their commits

Four PRs. The first two are inert, meaning nobody can see them, the third turns
the feature on, and the fourth brings every other game in.

| PR | What lands | Player-visible | "What's new" | Reviewers |
|---|---|---|---|---|
| **1** | Shapes, the empty registry, the unlock collection | No | None | `rulebook`, `gremlin` |
| **2** | The award pass, wired into game over | No: the catalogue is still empty | None | `gremlin`, `croupier`, `rulebook` |
| **3** | Profiles, the result page, the push, and the first catalogue | Yes | One line, *Enhancements* | `caveman`, `locksmith`, `croupier`, `rulebook` |
| **4** | Every other game's achievements | Yes | Widen PR 3's line | `croupier`, `rulebook` |

The point of the split is that the risky part of this, a new write on the
game-over path, reaches review in PR 2 on its own, with nothing visible around
it, and runs in production against an empty catalogue before any player can
see a result of it.

### PR 1 — Describe an achievement, and somewhere to keep one

1. **`Describe an achievement`.** `src/utils/games/achievements.ts`: the types
   from §3, an empty `GAME_ACHIEVEMENTS`, an empty `PLATFORM_ACHIEVEMENTS`,
   `achievementById`, `careerProgress` and `unlockedIds`. Tests 1 and 3 from §12.
   Nothing calls any of it.
2. **`Guard the achievements registry`.** The `gameRegistry.test.ts` row (§12,
   test 2). It passes trivially today, since no game has the file yet, and
   exists so the first one can't be left out.
3. **`Keep a player's unlocked achievements`.**
   `src/utils/mongodb/AchievementUnlockData.ts`: the schema, the unique index,
   and `recordUnlocks(gameId, newlyMet)`, the upsert from §5.2 that returns what
   it inserted. Account deletion removes a player's rows, with the route
   test's assertion. The collection is empty and nothing writes to it yet.

### PR 2 — Judge a finished game

1. **`Tally a player's games without their recent form`.** Pull the `byGame`
   half of `getPlayerStats` out into `getGameStatsByPlayer(userId)`, so the
   award pass can ask for it without also fetching the last ten matches. No
   behaviour change: `getPlayerStats` calls it.
2. **`Replay a finished game turn by turn, for a check`.** `forEachTurnEnd` in
   `replay.ts`: `lastOfEachTurn`, reading the internal state eagerly, with
   early exit once every caller is satisfied. Unit-tested against the Dice
   Cities harness.
3. **`Judge a finished game's achievements`.**
   `src/utils/games/awardAchievements.ts`, the pass from §4.3, with its catalogue
   as a parameter that defaults to the real one. Test 4 from §12.
4. **`Award achievements when a game ends`.** The call in `announceGameOver`,
   in its own `try`, only after a written result, before the pushes (§4.2). The
   pushes don't mention unlocks yet. The `gameRoutes.test.ts` case, run with a
   test catalogue.

### PR 3 — Show them, and the first ones to earn

Commit order is chosen so that **the feature becomes visible at commit 6 and
not before**. Everything up to then renders nothing, because the catalogue is
still empty.

1. **`Send a player's achievements with their stats`.** `getPlayerStats` gains
   `achievements`, and `gameResultResponse` gains this game's unlocks (§6).
   Route tests.
2. **`Draw an achievement`.** `AchievementBadge` and the `.ag-achievement*`
   classes.
3. **`Show achievements on profiles`.** `AchievementsSection` on both profile
   screens, and the badge's `InfoModal`.
4. **`Show what a game unlocked on its result page`.** The `NamedChip` row.
5. **`Say so in the game-over push`.** The `unlocked` parameter on the three
   builders, and the per-player split in `announceGameOver` (§7.4).
6. **`The first achievements`.** `PLATFORM_ACHIEVEMENTS`, and the two games
   from the original request: Dice Cities (§3.4, plus one more match
   achievement) and Settlements & Cities, whose starter set is
   `settlementsandcities.settler` 🏘️ *"Play 5 games of Settlements & Cities"*
   (career, played, 5) and `settlementsandcities.double-honours` 🎖️ *"Win a game
   holding both Longest Road and Largest Army"* (match, `end`:
   `outcome === 'win' && state.longestRoadOwner === userId &&
   state.largestArmyOwner === userId`). Both are public at game end (§9).
   **This is the commit that turns the feature on.**
7. **`Say what's new, and write it down`.** The "What's new" line, the AGENTS.md
   paragraph, the ARCHITECTURE.md rows, the `docs/new-game.md` row (§14), and
   this doc's status line flipped from plan to shipped.

### PR 4 — Every other game

One commit per game, each one an `achievements.ts`, one registry line, and the
checks' unit tests. Easiest first:

1. Snakes & Ladders
2. Smartthink
3. Solitaire
4. Race Cars
5. World Domination
6. Train Time (§9 matters most here: tickets are hidden until scoring)
7. Outbreak, Fires Out!, Banned Islet (co-ops: an achievement for the table's
   win is earned by every seat, which `outcomeFor` already gives)

**If a game needs shared code to change, stop.** Change the shared piece in
its own commit and call it out in the PR description, because that means the
design in §3 was wrong, not that the game is special.

There's one "What's new" line for the whole PR. If it lands soon after PR 3,
**widen PR 3's line** instead ("…in every game").

### If it has to be one PR

Keep the commits in exactly this order and keep the boundaries: PR 1's three,
then PR 2's four, then PR 3's seven. The review then has to be read commit by
commit rather than as one diff, which is worse, and is the reason for the
split.

Files touched, all told:

```
PR 1  new    src/utils/games/achievements.ts              (shapes, registry, careerProgress, unlockedIds)
PR 1  new    src/utils/games/achievements.test.ts
PR 1  edit   src/games/gameRegistry.test.ts               (one row)
PR 1  new    src/utils/mongodb/AchievementUnlockData.ts
PR 1  edit   src/app/api/user/delete/route.ts (+ test)    (deleteMany by userId)

PR 2  edit   src/utils/mongodb/GameResultData.ts          (getGameStatsByPlayer out of getPlayerStats)
PR 2  edit   src/utils/games/replay.ts                    (forEachTurnEnd)
PR 2  new    src/utils/games/awardAchievements.ts (+ test)
PR 2  edit   src/utils/games/finishGame.ts                (one guarded call)
PR 2  edit   src/app/api/game/gameRoutes.test.ts

PR 3  edit   src/utils/mongodb/GameResultData.ts          (achievements on getPlayerStats)
PR 3  edit   src/utils/api/gameResultResponse.ts
PR 3  new    src/components/ui/AchievementBadge.tsx
PR 3  new    src/components/ui/AchievementsSection.tsx
PR 3  edit   src/app/ag-theme.css                         (.ag-achievement*)
PR 3  edit   src/app/profile/page.tsx, src/app/profile/[userId]/page.tsx
PR 3  edit   src/app/games/result/[gameId]/page.tsx
PR 3  edit   src/utils/firebase/notificationContent.ts, src/utils/games/finishGame.ts
PR 3  new    src/games/DiceCities/achievements.ts, src/games/SettlementsAndCities/achievements.ts (+ tests)
PR 3  edit   src/utils/ui/whatsNew.ts, AGENTS.md, ARCHITECTURE.md, docs/new-game.md

PR 4  new    src/games/<Game>/achievements.ts (+ test)    (one commit per game)
PR 4  edit   src/utils/games/achievements.ts              (one registry line each)
PR 4  edit   src/utils/ui/whatsNew.ts                     (widen PR 3's line)
```

## 14. Upkeep

- **"What's new"**: one line in *Enhancements* in PR 3, something like
  *"Achievements — unlock them by playing, and see yours and your friends' on
  your profiles."* PRs 1 and 2 get none, since a player can't tell they
  landed, and PR 4 widens that line rather than adding another.
- **AGENTS.md** gets a paragraph beside the guide, tutorial and theme ones:
  most games also want an `achievements.ts`, registered in
  `GAME_ACHIEVEMENTS`, following §11.
- **ARCHITECTURE.md**: the `AchievementUnlock` collection in §5, beside
  `ChatRead`; the award step in §5's `finishGame` bullet; and step 9 and a row
  in §12's one-liners table. §15 already links here: that link, and the pointer
  from `docs/profile-pictures.md` §2b, went in with this plan.
- **`docs/new-game.md`** gets a checklist row beside `guide.ts` and
  `tutorial.ts`.

## 15. Decisions taken, and open questions

The first four are decided in this plan, and each could be reversed without
redesigning the rest. The last four are left open.

| # | Question | Taken for v1 | What reversing it would take |
|---|---|---|---|
| 1 | Mid-game unlocks? | **No**: judged at game over only (§4) | A per-command hook in `runCommand` for a whitelisted subset of `at: 'end'`-style checks that read only public state, plus a croupier review of each. Worth doing only for achievements that are fun *in the moment*. |
| 2 | Do exhibition (guest) games count? | **No**, same as stats (§8) | Nothing in this doc: it would mean changing `RESULT_COUNTS_FILTER`, and the stats with it. |
| 3 | Who can see someone's achievements? | **Whoever can see their stats**: themselves and friends (§6) | A privacy setting would gate both at once, which is the question `docs/social-features.md` §7 already asks. |
| 4 | Icons | **One emoji** per achievement | Add an optional `art` path, the way `GameMeta` has art, and let `AchievementBadge` prefer it. Nothing stored changes. |
| 5 | Should a surrendered or abandoned game count toward "played"? | Yes, to match the profile's numbers (§8) | A `count: 'completed'` variant that skips `ended` and `abandoned`. That's cheap to add if "play 25" turns out to get padded. It only matters once achievements *grant* something (5b). |
| 5b | Should achievements unlock anything: avatars, themes? | Not in v1 | `docs/profile-pictures.md` §2b is the natural first. Unlocks would then need server-side checks on selection, and question 5 would stop being academic. |
| 6 | Secret achievements, tiers, points? | Not in v1 | `secret?: boolean` hides a locked badge's title and description as "???". Tiers and points are a presentation layer over the same rows. |
| 7 | Kingdom Builder | Out of scope (§8) | Its own trigger, designed with seasons. |
| 8 | A second replay at game over | Accepted (§4.4) | Pass the `anyTurnEnd` readers into the result charts' replay, if the cron's budget ever says so. |

## 16. Rejected, and why

- **Judging on every command.** It puts work on the hot path of every move, it
  announces facts about hidden hands while they're still hidden, and it rewards
  states that can still be undone (§4.1).
- **Storing nothing, and deriving every unlock on read.** Career achievements
  could be derived entirely from `GameResult`, but then one would disappear if
  an opponent deleted their account and took the shared results with them.
  There'd be no date and no game to point at, and the game-over push couldn't
  tell a new unlock from an old one. Match achievements couldn't be derived at
  all. Storing the unlock and deriving only the *progress* gets the best of
  both (§5.3).
- **Clerk `privateMetadata`.** It's an 8 KB blob, written back whole (a race
  that `/api/gameguides` has to work around), and unreadable for a friend's
  profile without a Clerk call per friend (§5.1).
- **Counters on a `UserProfile` document.** There isn't one (§2). The counts
  it would hold already come out of one indexed aggregation over `GameResult`,
  which the profile runs anyway.
- **Progress rows.** Progress is `careerProgress(byGame)`, which is free on
  both sides. A stored copy would be a second source of truth for a number the
  profile prints beside it.
- **A rules DSL for match criteria** (JSON conditions over state paths). A
  function over the game's own typed state is shorter, type-checked,
  refactor-safe and unit-testable. Only career criteria are declarative,
  because only they need to be read back for progress (§3.2).
- **A separate "achievement unlocked" push.** It would be the third
  notification at the end of a game, and extra noise on the bus the whole app
  depends on (§7.4).
- **A new `/api/achievements` route.** The three reads that need achievements
  already exist and already carry the right gates. A fourth route would be one
  more gate to get wrong, for data those responses can simply carry (§6).
- **One replay per `anyTurnEnd` achievement.** One pass serves all of them
  (§4.3).
- **Putting the registry in `src/utils/ui/`** with the guide and tutorial
  ones. Part of an achievement is a rule that the server runs, and that folder
  is for presentation (§3.1).
