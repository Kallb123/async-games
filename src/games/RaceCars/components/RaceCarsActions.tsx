'use client'
import React from 'react';
import BuildRow from '@/components/ui/BuildRow';
import PendingTag from '@/components/ui/PendingTag';
import ReadOnlyPanel from '@/components/ui/ReadOnlyPanel';
import RollReadout from '@/components/ui/RollReadout';
import Stepper from '@/components/ui/Stepper';
import { pluralize } from '@/utils/ui/text';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { RaceCarsShift } from '@/utils/apiModels/GameLogic';
import type { IRaceCarsSpecificGameStateResponse } from '@/games/RaceCars/apiModels';
import {
    cornerAt,
    gearDef,
    gearName,
    MIN_MOVE_ROWS,
    rowsBetween,
    trackById,
    type RaceCarsGear,
    type RaceCarsTrack,
} from '@/games/RaceCars/board';
import { legalGears, type IRaceCarsPlayerState, type RaceCarsMoveOptions } from '@/games/RaceCars/rules';
import { rulesState } from '@/games/RaceCars/ui';

/**
 * §23.5's **reach band**, which is what this game ships instead of a planner.
 *
 * A planner would resolve one hypothetical roll and show a driver a concrete
 * board they will not get, answering "where do I end up" when the decision this
 * game asks for is "which band do I bet on". So each gear names the span it can
 * reach, where that span lands relative to the next corner, and what an
 * overshoot from it would cost — one `reachableSpaces`-shaped reading of the
 * pure rules, client-side, and true about a range rather than persuasive about
 * a number.
 */
function reachBand(track: RaceCarsTrack, ps: IRaceCarsPlayerState, gear: RaceCarsGear): string {
    const { min, max } = gearDef(gear);
    const span = `${min}–${max} rows → rows ${(ps.row + min) % track.rows}–${(ps.row + max) % track.rows}`;
    return `${span} · ${cornerVerdict(track, ps, min, max)}`;
}

function cornerVerdict(track: RaceCarsTrack, ps: IRaceCarsPlayerState, min: number, max: number): string {
    const here = cornerAt(track, ps.row);
    const owed = here ? here.stops - ps.cornerStops : 0;

    // The corner under the car still owes a stop, so the band is measured
    // against getting out of it rather than into the next one.
    if (here && owed > 0) {
        const toEnd = rowsBetween(track, ps.row, here.to);
        // §10's waiver: a car on a corner's last row has taken it as slowly as
        // the road allows, so what it still owes is written off as it leaves.
        if (toEnd === 0) return `leaves ${here.name} — the last row waives the stop it owes`;
        if (min > toEnd) return `overshoots ${here.name} by ${min - toEnd}–${max - toEnd} rows${tyreCost(ps, max - toEnd)}`;
        return max > toEnd
            ? `can bank a stop in ${here.name} — over ${toEnd} and it overshoots${tyreCost(ps, max - toEnd)}`
            : `stays in ${here.name} and banks a stop`;
    }

    const next = track.corners
        .map(corner => ({ corner, start: rowsBetween(track, ps.row, corner.from), end: rowsBetween(track, ps.row, corner.to) }))
        .filter(ahead => ahead.start > 0)
        .sort((a, b) => a.start - b.start)[0];
    if (!next) return 'clear road';

    if (max < next.start) return `clear road — ${next.corner.name} is ${next.start} rows out`;
    if (min > next.end) return `overshoots ${next.corner.name} by ${min - next.end}–${max - next.end} rows${tyreCost(ps, max - next.end)}`;
    return max > next.end
        ? `can stop in ${next.corner.name} — over ${next.end} and it overshoots${tyreCost(ps, max - next.end)}`
        : `can stop in ${next.corner.name}`;
}

/** What the worst of an overshoot costs, in the currency §10 charges it in. */
function tyreCost(ps: IRaceCarsPlayerState, rows: number): string {
    if (rows <= 0) return '';
    return rows > ps.tyres
        ? ` — more tyres than you have left: a spin`
        : ` — up to ${pluralize(rows, 'tyre')}`;
}

/** What the move the driver is lining up will actually do, in their language. */
function movePrompt(options: RaceCarsMoveOptions): string {
    if (options.boxedIn) return 'Boxed in — nothing is reachable, so tap your own space to stay put. No damage, and the gear drops to first.';
    if (options.blockedShort) return `Traffic — the road runs out ${pluralize(options.distance, 'row')} along. Tap a highlighted space to stop short and scuff a tyre.`;
    return `Tap one of the ${options.spaces.length} highlighted spaces on the circuit.`;
}

interface RaceCarsActionsProps {
    gs: IRaceCarsSpecificGameStateResponse;
    myUserId: string;
    /**
     * Brake points dialled in for this move (§11). Owned by the board page
     * rather than by this sheet, because the set of spaces the board makes
     * tappable is the rolled distance *minus* this — one number, one owner.
     */
    brake: number;
    setBrake: (brake: number) => void;
    /**
     * Where this move may finish, and which of §9's three cases it is — worked
     * out by the page from the same `moveOptions` that decides which spaces the
     * board makes tappable. Handed down rather than recomputed here so the
     * board's highlights and this sheet's "tap one of N" can never disagree
     * about a road traffic has closed. Null whenever no move is being lined up.
     */
    options: RaceCarsMoveOptions | null;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so only the tapped row spins. */
    pendingTarget: string | null;
    /** Off-turn: the same sheet, inert, showing what this car could do next. */
    readOnly: boolean;
}

/**
 * The turn sheet: §7's shift, then §7's brake-and-destination.
 *
 * Wrapped in `ReadOnlyPanel` rather than hidden off-turn — a waiting driver
 * wants to read their own gear ladder and what each band would reach, which is
 * the same panel their turn opens with. There is no second read-only copy of
 * it, and `disabled` on the fieldset is what takes it out of play.
 */
export default function RaceCarsActions({ gs, myUserId, brake, setBrake, options, submitCommand, pendingTarget, readOnly }: RaceCarsActionsProps) {
    const ps = gs.playerStates[myUserId];
    if (!ps) return null;

    const track = trackById(gs.trackId);

    // Off-turn the gear ladder is the one thing worth reading, and a turn that
    // has already been driven still holds its own spent `roll` (§23.4 keeps
    // both on the player, so they can never be spent by anybody else). Showing
    // that stale roll back as though it were live is what the read-only branch
    // avoids — the ladder from where the car now sits is the honest answer.
    //
    // Anything that is not §7 step 2 lands here too, which today means only the
    // `slipstream` phase PR 3 never reaches: PR 5 adds the tow's own branch
    // below alongside the command that answers it.
    const roll = ps.roll;
    const picking = readOnly || ps.phase !== 'move' || roll === null || options === null;

    if (picking) {
        const gears = legalGears(rulesState(gs), myUserId);
        return (
            <ReadOnlyPanel readOnly={readOnly}>
                <div className="ag-actionsheet">
                    <div className="ag-build-list">
                        {gears.map(({ gear, gearboxCost }) => (
                            <BuildRow
                                key={gear}
                                icon={<span className="ag-rc-gearmark">{gear}</span>}
                                name={`${gearName(gear)} · d${gearDef(gear).faces.length}`}
                                cost={`${reachBand(track, ps, gear)}${gearboxCost > 0 ? ` · ⚙️${gearboxCost}` : ''}`}
                                tag={pendingTarget === `shift:${gear}` ? <PendingTag label="Shifting…" /> : 'Shift'}
                                pending={pendingTarget === `shift:${gear}`}
                                onClick={() => {
                                    const command = new RaceCarsShift();
                                    command.gear = gear;
                                    submitCommand(command, undefined, `shift:${gear}`);
                                }}
                            />
                        ))}
                    </div>
                    {gears.length === 0 && (
                        <div className="ag-callout">No gear is available — the gearbox cannot pay for a shift from here.</div>
                    )}
                </div>
            </ReadOnlyPanel>
        );
    }

    // §11: braking shortens the roll a row a point, and never below one row —
    // a car always moves. Both bounds are the command's own (RaceCarsMove
    // refuses anything outside them); this control just cannot offer them.
    const maxBrake = Math.min(ps.brakes, roll - MIN_MOVE_ROWS);
    const distance = roll - Math.min(brake, maxBrake);
    const die = gearDef(ps.gear).faces.length;

    return (
        <ReadOnlyPanel readOnly={readOnly}>
            <div className="ag-actionsheet">
                <RollReadout
                    values={[roll]}
                    sides={[die]}
                    headline={`${gearName(ps.gear)} · ${roll}`}
                    sub={brake > 0 ? `Braking ${pluralize(brake, 'row')} off — ${pluralize(distance, 'row')} to drive` : `${pluralize(distance, 'row')} to drive`}
                />

                {maxBrake > 0 && (
                    <div className="ag-rc-brake">
                        <div className="ag-rc-brake-label">🛑 Brake — {pluralize(ps.brakes, 'point')} left</div>
                        <Stepper value={Math.min(brake, maxBrake)} min={0} max={maxBrake} onChange={setBrake} label="brake points" />
                    </div>
                )}

                <div className="ag-callout">{movePrompt(options)}</div>
            </div>
        </ReadOnlyPanel>
    );
}
