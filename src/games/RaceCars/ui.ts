// Pure presentation helpers for the Race Cars in-game screens (AGENTS.md —
// per-game presentation helpers live in games/<Game>/ui.ts).
//
// Everything here is a reading of the state the response already ships, not a
// rule: the board, the turn sheet and the scoreboard all need the same three
// answers, and deriving them in each of the three is how the standings on the
// scoreboard come to disagree with the gap in the stat row.

import { gearName, trackById, type RaceCarsGear } from './board';
import { recomputeRoundOrder, type IRaceCarsSpecificGameState } from './rules';
import type { IRaceCarsSpecificGameStateResponse } from './apiModels';

/**
 * The response's state as `rules.ts` reads it.
 *
 * `rules.ts` is isomorphic by design (§23.4) — the command classes and the
 * board import the same functions — and it already accepts a plain record for
 * `players`, because Mongoose hands its map back as a real `Map` on a live
 * document and a plain object once it has been through JSON. The DTO's
 * `playerStates` is that object under a name the wire uses, carrying the
 * username the server resolved on top of every field the rules read, so this
 * is a rename and not a conversion.
 */
export function rulesState(gs: IRaceCarsSpecificGameStateResponse): IRaceCarsSpecificGameState {
    return { ...gs, players: gs.playerStates };
}

/**
 * The field in classification order, leader first (§4.2) — laps, then row, then
 * the round order for an exact tie, which is §15's own ordering re-read.
 *
 * `recomputeRoundOrder` is that sort and is pure, so this is the same answer
 * the engine will reach at the top of the next round rather than a second
 * spelling of it.
 */
export function standings(gs: IRaceCarsSpecificGameStateResponse): string[] {
    return recomputeRoundOrder(rulesState(gs));
}

/** A driver's place on the road, 1-based — `P3` on the scoreboard. */
export function positionOf(order: string[], userId: string): number {
    const index = order.indexOf(userId);
    return index >= 0 ? index + 1 : order.length;
}

/**
 * Rows between this driver and whoever leads, or 0 for the leader themselves.
 *
 * Measured across laps as well as rows, so a leader a lap up reads as the whole
 * lap they are up rather than as a negative row number — and it is only ever
 * subtraction because `standings` has already established who is in front.
 */
export function rowsBehindLeader(gs: IRaceCarsSpecificGameStateResponse, userId: string): number {
    const order = standings(gs);
    const leader = gs.playerStates[order[0]];
    const me = gs.playerStates[userId];
    if (!leader || !me || order[0] === userId) return 0;
    const rows = trackById(gs.trackId).rows;
    return (leader.lapsCompleted - me.lapsCompleted) * rows + (leader.row - me.row);
}

/**
 * The wear a car has left, as the scoreboard's one-line sub: the gear it is in
 * and what is in the three pools. Emoji per pool rather than words because the
 * line is 80px wide on a phone — and they carry no identity, which is the test
 * §19.1 sets for where an emoji may appear.
 */
export function wearSummary(gear: RaceCarsGear, tyres: number, brakes: number, gearbox: number): string {
    return `${gearName(gear)} · 🛞${tyres} 🛑${brakes} ⚙️${gearbox}`;
}
