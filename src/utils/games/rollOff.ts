import { DiceRoll } from "./DiceRoll";
import { IHistoryEntry, userToken } from "./history";

/**
 * The opening roll-off every multiplayer game settles its turn order with:
 * everyone rolls, highest goes first, and anyone tied re-rolls among themselves
 * until the tie breaks.
 *
 * Returns the turn order and the setup lines to seed the game's history with —
 * tokenised like every other history line, so the roll-off still names people
 * correctly after a rename.
 *
 * Five games had their own copy of this, differing only in whitespace.
 */
export function rollOffTurnOrder(userIdList: string[], dieToRoll: number): {
    turnOrder: string[],
    history: IHistoryEntry[]
} {
    const turnOrder: string[] = [];
    const history: IHistoryEntry[] = [];
    sortUsersByRoll(userIdList, turnOrder, history, dieToRoll);
    return { turnOrder, history };
}

function sortUsersByRoll(userIdList: string[], turnOrder: string[], history: IHistoryEntry[], dieToRoll: number) {
    const distinctRolls = new Map<number, string[]>();
    userIdList.forEach(userId => {
        const roll = DiceRoll(dieToRoll);
        const bucket = distinctRolls.get(roll);
        if (bucket) bucket.push(userId);
        else distinctRolls.set(roll, [userId]);
    });

    // Highest roll first, so the winner is the first player pushed.
    [...distinctRolls.keys()].sort((a, b) => b - a).forEach(roll => {
        const users = distinctRolls.get(roll)!;
        if (users.length > 1) {
            history.push({ text: `Setup: ${users.map(userToken).join(" & ")} rolled a ${roll} and are re-rolling` });
            sortUsersByRoll(users, turnOrder, history, dieToRoll);
        } else {
            turnOrder.push(users[0]);
            // The first player settled into turnOrder is the roll-off winner.
            history.push({ text: `Setup: ${userToken(users[0])} rolled a ${roll}${turnOrder.length === 1 ? " and goes first" : ""}` });
        }
    });
}
