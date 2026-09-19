// Turn recap for Race Cars — docs/games/race-cars.md §23.5 and §23.7 PR 8.
//
// The away-time story is the order changing, not a driver's own choices: §6a's
// getaway is a row only when it was not the ordinary one, a
// shift and its roll are read together off the move that follows them
// (`RaceCarsShift` itself produces no row — §7's number is only interesting
// once it has been spent), and every row below comes straight off the
// `RaceCarsArrivalEvent`s `RaceCarsMove`/`RaceCarsSlipstream` already return on
// their outcome (see `IRaceCarsArrivalOutcome`, RaceCarsLogic.ts) rather than a
// second reading of the state. Corner wording is `narration.ts`'s own — the
// move-reveal screen and this recap are two readers of one vocabulary, so a
// corner never gets described two different ways.
import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IRaceCarsSpecificGameStateResponse } from "./apiModels";
import type { IRaceCarsArrivalOutcome, IRaceCarsStartOutcome } from "./RaceCarsLogic";
import type { RaceCarsArrivalEvent } from "./rules";
import { arrivalLine, cornerName, RaceCarsArrivalSummary, startLine } from "./narration";
import { cornerAt, RaceCarsTrack, spaceKey, trackById } from "./board";
import { positionOf, rowsBehindLeader, standings } from "./ui";
import { pluralize } from "@/utils/ui/text";

type RCState = IRaceCarsSpecificGameStateResponse;

function state(snapshot: ITurnSnapshot): RCState {
    return snapshot.specificGameState as RCState;
}

const RC_CORNERSTOP = "rc_cornerstop";
const RC_OVERSHOOT = "rc_overshoot";
const RC_SPIN = "rc_spin";
const RC_TOW = "rc_tow";
const RC_OILLAID = "rc_oillaid";
const RC_LAP = "rc_lap";
const RC_FINISH = "rc_finish";
const RC_LEAD = "rc_lead";
const RC_STALL = "rc_stall";
const RC_FLIER = "rc_flier";
const RC_UNDO = "rc_undo";

/**
 * One arrival event as a recap row, or null for one that reads as "a plain
 * move down a straight" (§23.5) — blocked, boxed in, clearing a corner and an
 * oil check that passed all say nothing on their own, the same set
 * `narration.ts`'s `arrivalLine` returns null for plus the three this recap
 * additionally has no use for.
 *
 * `cornerStop`/`overshoot` borrow `arrivalLine`'s own words rather than a
 * second phrasing of the same corner; `spin` writes its own, because the
 * reveal doesn't distinguish an unpayable overshoot from a lost-control oil
 * check and the recap's stat list asks for both ("spins" and "oil hit") to be
 * readable apart.
 */
function arrivalRow(
    track: RaceCarsTrack,
    event: RaceCarsArrivalEvent,
    arrival: RaceCarsArrivalSummary,
    name: string,
): { type: string; glyph: string; title: string } | null {
    switch (event.type) {
        case 'cornerStop':
        case 'overshoot': {
            const line = arrivalLine(track, event, arrival);
            if (!line) return null;
            return { type: event.type === 'cornerStop' ? RC_CORNERSTOP : RC_OVERSHOOT, glyph: line.glyph, title: `${name} ${line.text}` };
        }
        case 'spin': {
            // Where the car is put, not the row it is put on: a row is a rank
            // round the lap rather than somewhere a driver can point at (§5.1),
            // and the live log says the same thing (`arrivalLine`). The cause
            // is spelled out here rather than borrowed, because the recap does
            // distinguish an unpayable overshoot from a slick and the log does
            // not (see the note above).
            const cause = event.cause === 'oil' ? 'hit a slick and spun' : 'spun';
            const where = event.cornerId ? ` back into ${cornerName(track, event.cornerId)}` : '';
            return { type: RC_SPIN, glyph: '💥', title: `${name} ${cause}${where} and misses their next turn` };
        }
        case 'lap':
            return { type: RC_LAP, glyph: '🔁', title: `${name} completed ${pluralize(event.lapsCompleted, 'lap')}` };
        case 'finish':
            return { type: RC_FINISH, glyph: '🏁', title: `${name} takes the chequered flag!` };
        default:
            return null;
    }
}

/**
 * Turns one replayed Race Cars command into its recap row(s). `RaceCarsShift`
 * itself carries no arrival — the number it rolled is only a story once the
 * move that follows spends it — so only the two moving commands produce
 * anything here.
 */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome,
): IGameEvent[] {
    if (command.className !== "RaceCarsLaunch"
        && command.className !== "RaceCarsMove"
        && command.className !== "RaceCarsSlipstream"
        && command.className !== "RaceCarsUndo") return [];

    const name = command.senderUsername;
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    // docs/undo.md §10: without this, an undone move's own event would stand
    // with nothing on the board to show for it — the anchor means an undo can
    // only ever reach the leg directly behind it, so there is exactly one
    // thing being taken back.
    if (command.className === "RaceCarsUndo") {
        return [{ ...base, id: `${command.id}:undo`, type: RC_UNDO, glyph: '↩️', title: `${name} took back their last move` }];
    }

    const prevState = state(prev);
    const nextState = state(next);

    // §6a: a getaway is a row only when it was not the ordinary one. A car that
    // came away cleanly in first is the grid doing what the grid does — the
    // same "plain move down a straight" this recap leaves out everywhere else —
    // while bogging down and flying are the two a rival wants to have been told.
    if (command.className === "RaceCarsLaunch") {
        const start = (outcome as Partial<IRaceCarsStartOutcome>).start;
        if (!start || start.outcome === 'away') return [];
        const line = startLine(start);
        return [{
            ...base,
            id: `${command.id}:start`,
            type: start.outcome === 'stalled' ? RC_STALL : RC_FLIER,
            glyph: line.glyph,
            title: `${name} ${line.text}`,
        }];
    }

    const track = trackById(nextState.trackId);
    const events: IGameEvent[] = [];

    // §12: the tow itself is a row, not just whatever it resolved to — nothing
    // in `arrival.events` says a tow was taken at all.
    if (command.className === "RaceCarsSlipstream") {
        const tow = (command as unknown as { tow: { row: number; lane: number } | null }).tow;
        if (tow) {
            events.push({ ...base, id: `${command.id}:tow`, type: RC_TOW, glyph: '💨', title: `${name} took the tow` });
        }
    }

    // A declined tow (§12) carries no arrival at all — nothing moved, so
    // there is nothing further below for this command to report.
    const arrival = (outcome as Partial<IRaceCarsArrivalOutcome>).arrival;
    if (!arrival) return events;

    for (const event of arrival.events) {
        const row = arrivalRow(track, event, arrival, name);
        if (row) events.push({ ...base, id: `${command.id}:${events.length}`, ...row });
    }

    // §14: a slick that wasn't there before is a new one laid (either a spin's
    // landing spot or three-or-more brakes spent); one refreshed in place is
    // the same (row, lane) key, so it never reads as new.
    if (nextState.oilSpills) {
        const known = new Set(prevState.slicks.map(slick => spaceKey(slick.row, slick.lane)));
        for (const slick of nextState.slicks) {
            const key = spaceKey(slick.row, slick.lane);
            if (!known.has(key)) {
                events.push({ ...base, id: `${command.id}:oil:${key}`, type: RC_OILLAID, glyph: '🛢️', title: `${name} left oil behind` });
            }
        }
    }

    // §15: roundOrder only changes at a round's own wrap, so this only ever
    // fires on the one command that actually ends a round with a new leader.
    const prevLeader = prevState.roundOrder[0];
    const nextLeader = nextState.roundOrder[0];
    if (prevLeader && nextLeader && prevLeader !== nextLeader) {
        const leaderName = nextState.playerStates[nextLeader]?.username ?? nextLeader;
        events.push({ ...base, id: `${command.id}:lead`, type: RC_LEAD, glyph: '🏆', title: `${leaderName} takes the lead` });
    }

    return events;
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const finished = events.some(event => event.type === RC_FINISH);
    const spins = events.filter(event => event.type === RC_SPIN).length;
    const leadChanges = events.some(event => event.type === RC_LEAD);
    const overshoots = events.filter(event => event.type === RC_OVERSHOOT).length;
    const tows = events.some(event => event.type === RC_TOW);
    const cornerStops = events.some(event => event.type === RC_CORNERSTOP);
    const stalls = events.some(event => event.type === RC_STALL);

    let tail = '.';
    if (finished) {
        tail = ' — the chequered flag is out!';
    } else if (spins > 0) {
        tail = spins > 1 ? ' — there have been some spins.' : ' — somebody spun.';
    } else if (leadChanges) {
        tail = ' — the lead changed hands.';
    } else if (overshoots > 0) {
        tail = ' — a corner got overshot.';
    } else if (tows) {
        tail = ' — someone picked up a tow.';
    } else if (cornerStops) {
        tail = ' — the field bunched at a corner.';
    } else if (stalls) {
        tail = ' — somebody bogged down on the grid.';
    }

    return {
        headline: 'Your move 👋',
        subline: `${pluralize(events.length, 'thing', 'things')} happened while you were away${tail}`,
    };
}

/**
 * The standings, since a planner would be misleading here (§23.5): "You're
 * P3, nine rows off the lead, and The Kink still owes you a stop."
 */
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const gs = liveState as RCState | undefined;
    const me = gs?.playerStates[forUserId];
    if (!gs || !me) return null;

    const order = standings(gs);
    const position = positionOf(order, forUserId);
    const gap = rowsBehindLeader(gs, forUserId);
    const positionText = position === 1 ? "You're leading" : `You're P${position}, ${pluralize(gap, 'row')} off the lead`;

    const corner = cornerAt(trackById(gs.trackId), me.row, me.lane);
    const owed = corner ? corner.stops - me.cornerStops : 0;
    const cornerText = corner && owed > 0 ? `, and ${corner.name} still owes you ${pluralize(owed, 'stop')}` : '';

    return { glyph: '🏎️', text: `${positionText}${cornerText}.` };
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const raceCarsRecapAdapter: IRecapAdapter = {
    className: "RaceCarsGameType",
    toEvents,
    summarize,
    tip,
};
