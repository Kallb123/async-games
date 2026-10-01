// Dice Cities' own achievements (docs/achievements.md §3.4, §11), registered in
// GAME_ACHIEVEMENTS. Browser-safe, like everything the catalogue imports: the
// profile runs `progress` to draw "3 / 5", so a runtime import of anything
// server-only here would put it in every player's bundle.
//
// Dice Cities hides nothing — every viewer already gets the bank and every
// seat's cards and coins — so the table's view a check is handed is the whole
// game, and its key set is pinned in hiddenHands.test.ts.
import type { FinishedSeat, GameAchievement } from "@/utils/games/achievements";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import type { IDiceCitiesCard, IDiceCitiesGameStateResponse } from "./apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "./cards";

/** Every establishment in the base market comes six to a pile. */
export const MINES_IN_THE_GAME = 6;

/** Coins in hand at the end of a turn for a Treasury. */
export const TREASURY_COINS = 30;

/** The priciest establishment a Small Business may ever own. */
export const SMALL_BUSINESS_MAX_COST = 3;

/** Big Dice Energy wants every establishment gained to pay above this roll. */
export const BIG_DICE_MIN_ROLL = 6;

function owned(view: IDiceCitiesGameStateResponse, userId: string, card: string): number {
    return playerByUserId(view, userId)?.cards.find(c => c.card === card)?.amount ?? 0;
}

/**
 * The establishments that have come into the player's city since the opening
 * deal (bought or swapped in, kept or not) - or null for a game that started
 * before that was tallied, which can't earn a "never owned" achievement. The
 * landmarks bought towards the win aren't establishments and aren't counted.
 */
function acquiredEstablishments(view: IDiceCitiesGameStateResponse, userId: string): IDiceCitiesCard[] | null {
    const acquired = playerByUserId(view, userId)?.acquiredCards;
    if (!acquired) return null;
    return acquired.map(id => DiceCitiesCards[id]).filter(card => card && card.rollNumber.length > 0);
}

/**
 * A win in which every establishment the player gained passed `test` - and,
 * with `atLeastOne`, in which they gained one at all.
 */
function wonOnlyGaining(
    view: IDiceCitiesGameStateResponse,
    { userId, outcome }: FinishedSeat,
    test: (card: IDiceCitiesCard) => boolean,
    { atLeastOne = false } = {},
): boolean {
    const acquired = acquiredEstablishments(view, userId);
    return outcome === "win" && acquired !== null && (!atLeastOne || acquired.length > 0) && acquired.every(test);
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
        title: "They call it a Mine!",
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
    {
        // The Harbour is a public flag on every seat. Requiring a rival who has
        // one keeps a game nobody built it in (or a base game) from counting.
        id: "dicecities.what-dock",
        title: "What Dock?",
        icon: "⚓",
        description: "Win a game on the Docks expansion where you're the only player without the Dock.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => {
                if (outcome !== "win" || !view.enabledDocks) return false;
                const me = playerByUserId(view, userId);
                const others = Object.values(view.playerStates).filter(p => p.userId !== userId);
                return !!me && !me.harbourUnlocked && others.length > 0 && others.every(p => p.harbourUnlocked);
            },
        },
    },
    {
        id: "dicecities.last-coin",
        title: "Down to the Last Coin",
        icon: "🪙",
        description: "Win a game with no coins left.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, { userId, outcome }) => outcome === "win" && playerByUserId(view, userId)?.money === 0,
        },
    },
    {
        // "Ever owned", so a Business Center can spoil it by swapping one in.
        id: "dicecities.small-business",
        title: "Small Business",
        icon: "🏪",
        description: "Win a game without ever owning an establishment that costs more than 3.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, seat) => wonOnlyGaining(view, seat, card => card.cost <= SMALL_BUSINESS_MAX_COST),
        },
    },
    {
        // The Wheat Field and Bakery dealt at the start don't count, but buying
        // another of either does.
        id: "dicecities.big-dice-energy",
        title: "Big Dice Energy",
        icon: "🎯",
        description: "Win a game without gaining any establishment that pays on a 6 or lower, beyond the two you start with.",
        criteria: {
            kind: "match",
            at: "end",
            check: (view, seat) => wonOnlyGaining(view, seat, card => Math.min(...card.rollNumber) > BIG_DICE_MIN_ROLL),
        },
    },
    {
        id: "dicecities.dine-and-dash",
        title: "Dine & Dash",
        icon: "🍽️",
        description: "Win a game where every establishment you gained was a restaurant.",
        criteria: {
            kind: "match",
            at: "end",
            // At least one, or a win on the starting cards alone would count.
            check: (view, seat) => wonOnlyGaining(view, seat, card => card.type === "dining", { atLeastOne: true }),
        },
    },
    {
        // The market lists every establishment this game stocks - the Docks'
        // only when it is in play - and keeps a sold-out pile's entry, so it is
        // the list to collect against.
        id: "dicecities.collector",
        title: "Collector",
        icon: "📚",
        description: "Own at least one of every establishment in the market at the end of a turn.",
        // A Business Center swap can complete the set on someone else's turn.
        notify: true,
        criteria: {
            kind: "match",
            at: "turnEnd",
            check: (view, { userId }) =>
                !!playerByUserId(view, userId) &&
                view.bankCards.every(pile => owned(view, userId, pile.card) > 0),
        },
    },
];
