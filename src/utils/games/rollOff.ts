import { DiceRoll } from "./DiceRoll";
import { IHistoryEntry, userToken } from "./history";

/**
 * The opening roll-off every multiplayer game settles its turn order with:
 * everyone rolls, highest goes first, and anyone tied re-rolls among themselves
 * until the tie breaks.
 *
 * Returns the turn order and the setup lines to seed the game's history with —
 * tokenised like every other history line, so the roll-off still names people
 * correctly after a rename. The lines come back in reading order, highest roll
 * first, like every other setup block — `startGameFromInvitation` flips the
 * whole block into the newest-first order the log is stored in (asStoredHistory,
 * utils/games/history.ts), so a game seeds its history with these as they are.
 *
 * Five games had their own copy of this, differing only in whitespace.
 */
export function rollOffTurnOrder(userIdList: string[], dieToRoll = 6): {
    turnOrder: string[],
    history: IHistoryEntry[]
} {
    const turnOrder: string[] = [];
    const history: IHistoryEntry[] = [];
    sortUsersByRoll(userIdList, turnOrder, history, dieToRoll);
    return { turnOrder, history };
}

function sortUsersByRoll(userIdList: string[], turnOrder: string[], history: IHistoryEntry[], dieToRoll: number, isReRoll = false) {
    const distinctRolls = new Map<number, string[]>();
    userIdList.forEach(userId => {
        const roll = DiceRoll(dieToRoll);
        const bucket = distinctRolls.get(roll);
        if (bucket) bucket.push(userId);
        else distinctRolls.set(roll, [userId]);
    });

    // Says which throw a number came off, because a re-roll's result sits right
    // under the tie that caused it: without this, a 6 thrown to break a tie on
    // 3 reads as a 6 that somehow tied with the opening 6.
    const threw = isReRoll ? "re-rolled" : "rolled";

    // Highest roll first, so the winner is the first player pushed.
    [...distinctRolls.keys()].sort((a, b) => b - a).forEach(roll => {
        const users = distinctRolls.get(roll)!;
        if (users.length > 1) {
            history.push({ text: `Setup: ${users.map(userToken).join(" & ")} ${threw} a ${roll} and are re-rolling` });
            sortUsersByRoll(users, turnOrder, history, dieToRoll, true);
        } else {
            turnOrder.push(users[0]);
            // The first player settled into turnOrder is the roll-off winner.
            history.push({ text: `Setup: ${userToken(users[0])} ${threw} a ${roll}${turnOrder.length === 1 ? " and goes first" : ""}` });
        }
    });
}
