// Dice Cities' own achievements (docs/achievements.md §3.4, §11), registered in
// GAME_ACHIEVEMENTS. Browser-safe, like everything the catalogue imports: the
// profile runs `progress` to draw "3 / 5", so a runtime import of anything
// server-only here would put it in every player's bundle.
//
// Dice Cities hides nothing — every viewer already gets the bank and every
// seat's cards and coins — so the table's view a check is handed is the whole
// game, and its key set is pinned in hiddenHands.test.ts.
import type { GameAchievement } from "@/utils/games/achievements";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import type { IDiceCitiesGameStateResponse } from "./apiModels";
import { DiceCitiesCardIds } from "./cards";

/** Every establishment in the base market comes six to a pile. */
export const MINES_IN_THE_GAME = 6;

/** Coins in hand at the end of a turn for a Treasury. */
export const TREASURY_COINS = 30;

function owned(view: IDiceCitiesGameStateResponse, userId: string, card: string): number {
    return playerByUserId(view, userId)?.cards.find(c => c.card === card)?.amount ?? 0;
}

export const achievements: GameAchievement<IDiceCitiesGameStateResponse>[] = [
    {
        id: "dicecities.mayor",
        title: "Mayor",
        icon: "🏙️",
        description: "Win 5 games of Dice Cities.",
        criteria: { kind: "career", progress: record => record.won, target: 5 },
    },
    {
        // Counts to six rather than asking "does anyone else hold one?": a dropped
        // player's cards leave the game rather than going back to the bank, so
        // "nobody else has any" can be true for a player holding three.
        id: "dicecities.mine-baron",
        title: "Mine Baron",
        icon: "⛏️",
        description: "Own all six Mines at the end of a turn.",
        // An opponent's Business Center swap can hand over the sixth while the
        // earner isn't looking, which is what the push is for.
        notify: true,
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) => owned(view, userId, DiceCitiesCardIds.MINE) >= MINES_IN_THE_GAME,
        },
    },
    {
        id: "dicecities.treasury",
        title: "Treasury",
        icon: "💰",
        description: "Hold 30 coins at the end of a turn.",
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) => (playerByUserId(view, userId)?.money ?? 0) >= TREASURY_COINS,
        },
    },
];
