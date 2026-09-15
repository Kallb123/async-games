// What arriving somewhere *meant*, in the player's language — one home for the
// wording, read twice.
//
// `resolveArrival` reports a move as a list of events (docs/games/race-cars.md
// §10, §13). The match-history log joins them into one sentence, and the
// end-of-move reveal draws them as a timeline; Banned Islet's and Outbreak's
// `narration.ts` exist for exactly the same reason. Two spellings of "overshot
// Gravel Bend by four rows" is how the log and the screen come to disagree
// about the turn a player just took.

import type { RaceCarsArrivalEvent } from "./rules";
import type { RaceCarsTrack } from "./board";
import { pluralize } from "@/utils/ui/text";

/** One event, said once: the glyph the reveal dots it with and the words both readers use. */
export interface RaceCarsArrivalLine {
    glyph: string;
    text: string;
}

/**
 * The part of an arrival the wording reads.
 *
 * Narrower than `RaceCarsArrival` on purpose: the reveal is handed the copy
 * that travelled on the command outcome, not the resolver's own return value,
 * and the two readers should be reading the same words off the same fields.
 */
export interface RaceCarsArrivalSummary {
    events: RaceCarsArrivalEvent[];
    row: number;
    spun: boolean;
    finished: boolean;
}

/** A corner by name, for any line that has an id and wants words. */
export function cornerName(track: RaceCarsTrack, cornerId: string): string {
    return track.corners.find(corner => corner.id === cornerId)?.name ?? 'the corner';
}

/**
 * One arrival event as a line, or null for an event that says nothing on its
 * own — an oil check that passed is the roll of a die nothing came of, and the
 * spin one fails is its own event.
 */
export function arrivalLine(
    track: RaceCarsTrack,
    event: RaceCarsArrivalEvent,
    arrival: RaceCarsArrivalSummary,
): RaceCarsArrivalLine | null {
    switch (event.type) {
        case 'blocked':
            return { glyph: '🚧', text: 'was blocked and had to lift' };
        case 'boxedIn':
            return { glyph: '🚗', text: 'was boxed in and stayed put' };
        case 'cornerStop':
            return {
                glyph: '🅿️',
                text: `banked a stop in ${cornerName(track, event.cornerId)} (${event.banked} of ${event.owed})`,
            };
        case 'cornerCleared':
            return { glyph: '✅', text: `cleared ${cornerName(track, event.cornerId)}` };
        case 'overshoot':
            return event.waived
                ? { glyph: '🐢', text: `left ${cornerName(track, event.cornerId)} as slowly as the road allows` }
                : { glyph: '🛞', text: `overshot ${cornerName(track, event.cornerId)} by ${pluralize(event.spaces, 'space')}` };
        case 'lap':
            return { glyph: '🔁', text: `completed ${pluralize(event.lapsCompleted, 'lap')}` };
        case 'finish':
            return { glyph: '🏁', text: 'crossed the line' };
        case 'spin':
            // Named by where the car is put rather than by a row number: a row
            // is a rank round the lap, not somewhere a driver can point at
            // (§5.1), and a spin always ends inside a corner or on the slick.
            return {
                glyph: '💥',
                text: event.cornerId
                    ? `spun back into ${cornerName(track, event.cornerId)} and misses their next turn`
                    : 'spun on the oil and misses their next turn',
            };
        case 'oilCheck':
            return null;
    }
}

/**
 * What arriving cost and banked, as history clauses in the order it happened.
 *
 * No clause claims a tyre. An overshoot the car could not pay charges nothing
 * at all (§10: you pay nothing, and the car spins), so the events alone cannot
 * say what was spent — the caller totals it from the pools instead, which is
 * the one reading that is true of every path through here.
 */
export function arrivalClauses(track: RaceCarsTrack, arrival: RaceCarsArrivalSummary): string[] {
    return arrival.events
        .map(event => arrivalLine(track, event, arrival))
        .filter((line): line is RaceCarsArrivalLine => line !== null)
        .map(line => line.text);
}

/** The headline the reveal opens with: the loudest thing the move did, not a list of them. */
export function arrivalHeadline(arrival: RaceCarsArrivalSummary): { headline: string; subline: string } {
    if (arrival.finished) {
        return { headline: '🏁 Chequered flag!', subline: 'You crossed the line and took the race.' };
    }
    if (arrival.spun) {
        return { headline: '💥 Spin!', subline: 'The car is put back in neutral, and you miss your next turn.' };
    }
    const overshot = arrival.events.find(event => event.type === 'overshoot' && !event.waived);
    if (overshot?.type === 'overshoot') {
        return {
            headline: '🛞 Overshot',
            subline: `${pluralize(overshot.spaces, 'space')} past the corner, and the tyres paid for it.`,
        };
    }
    const banked = arrival.events.find(event => event.type === 'cornerStop');
    if (banked?.type === 'cornerStop') {
        return {
            headline: '🅿️ Stop banked',
            subline: banked.banked >= banked.owed
                ? 'That is every stop this corner owes — the road out is clear.'
                : `${banked.banked} of ${banked.owed}. One more turn inside the corner before you may leave.`,
        };
    }
    if (arrival.events.some(event => event.type === 'boxedIn')) {
        return { headline: '🚗 Boxed in', subline: 'Nowhere to go, so the car stayed put and dropped to first.' };
    }
    if (arrival.events.some(event => event.type === 'blocked')) {
        return { headline: '🚧 Traffic', subline: 'The road ran out early — a lifted throttle and a scuffed tyre.' };
    }
    return { headline: '🏎️ Clean run', subline: 'Nothing to pay, and the road ahead is clear.' };
}
