// A game's real achievements, taken apart for its own achievements.test.ts:
// each check and progress function by id, and the view the judge really hands
// a check — the game's replay adapter, asked for no viewer (docs/achievements.md
// §9, §12 test 5). Every game's test reads its catalogue through these rather
// than restating the criteria casts.
//
// Kept apart from achievementFixtures.ts, which builds made-up achievements and
// imports only types so it can sit either side of a `vi.mock`: this one reaches
// the replay registry, and with it every game's models.
//
// Test-only: test files import it; app code never does.

import type { CareerCriteria, FinishedSeat, GameAchievement, GameRecord, MatchCriteria } from "@/utils/games/achievements";
import { getReplayAdapter } from "@/utils/games/replay";

type TurnEndCheck<View> = Extract<MatchCriteria<View>, { at: "turnEnd" }>["check"];
type EndCheck<View> = Extract<MatchCriteria<View>, { at: "end" }>["check"];

/** Each of a game's achievements' criteria, by id. An id the catalogue doesn't hold throws. */
export function criteriaOf<View>(achievements: GameAchievement<View>[]) {
    const criteria = (id: string) => {
        const found = achievements.find(achievement => achievement.id === id);
        if (!found) throw new Error(`No achievement ${id}`);
        return found.criteria;
    };
    return {
        turnEndCheck: (id: string) => (criteria(id) as Extract<MatchCriteria<View>, { at: "turnEnd" }>).check as TurnEndCheck<View>,
        endCheck: (id: string) => (criteria(id) as Extract<MatchCriteria<View>, { at: "end" }>).check as EndCheck<View>,
        progress: (id: string) => (criteria(id) as CareerCriteria<GameRecord>).progress,
    };
}

/** The table's view of `state`: what the judge's `tableView` builds, with no viewer. */
export function tableViewOf<View>(className: string, state: unknown, names: Record<string, string>): View {
    return getReplayAdapter(className)!.toResponseState(state, names, null, []) as View;
}

/** A seat as the game-end checkpoint hands it to an `end` check. */
export const finishedSeat = (userId: string, outcome: FinishedSeat["outcome"], turns = 30): FinishedSeat =>
    ({ userId, outcome, turns });
