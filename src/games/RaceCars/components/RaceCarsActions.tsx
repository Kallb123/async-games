'use client'
import React from 'react';
import BuildRow from '@/components/ui/BuildRow';
import PendingTag from '@/components/ui/PendingTag';
import ReadOnlyPanel from '@/components/ui/ReadOnlyPanel';
import RollReadout from '@/components/ui/RollReadout';
import Stepper from '@/components/ui/Stepper';
import { pluralize } from '@/utils/ui/text';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { RaceCarsShift, RaceCarsSlipstream } from '@/utils/apiModels/GameLogic';
import type { IRaceCarsSpecificGameStateResponse } from '@/games/RaceCars/apiModels';
import {
    cornerAt,
    cornerReaches,
    gearDef,
    gearName,
    MIN_MOVE_STEPS,
    nextCornerReach,
    SLIPSTREAM_STEPS,
    trackById,
    type RaceCarsCorner,
    type RaceCarsCornerReach,
    type RaceCarsGear,
} from '@/games/RaceCars/board';
import { legalGears, type IRaceCarsPlayerState, type RaceCarsMoveOptions } from '@/games/RaceCars/rules';
import { rulesState } from '@/games/RaceCars/ui';

/**
 * §23.5's **reach band**, which is what this game ships instead of a planner.
 *
 * A planner would resolve one hypothetical roll and show a driver a concrete
 * board they will not get, answering "where do I end up" when the decision this
 * game asks for is "which band do I bet on". So each gear names the span it can
 * roll, where that span lands relative to the next corner, and what an
 * overshoot from it would cost — one `reachableSpaces`-shaped reading of the
 * pure rules, client-side, and true about a range rather than persuasive about
 * a number.
 *
 * Everything here counts in **spaces**, which is the one currency the driver is
 * spending: the die is thrown in spaces, §10 charges an overshoot in spaces,
 * and a row is a rank round the lap rather than a distance (§5.1). `reaches`
 * says how many spaces out each corner is, walked once per render rather than
 * once per gear.
 */
function reachBand(
    ps: IRaceCarsPlayerState,
    reaches: Map<string, RaceCarsCornerReach>,
    here: RaceCarsCorner | null,
    gear: RaceCarsGear,
): string {
    const { min, max } = gearDef(gear);
    return `rolls ${min}–${max} · ${cornerVerdict(ps, reaches, here, min, max)}`;
}

/** `min`/`max` are the spaces the gear's band rolls — its dice faces, in full. */
function cornerVerdict(
    ps: IRaceCarsPlayerState,
    reaches: Map<string, RaceCarsCornerReach>,
    here: RaceCarsCorner | null,
    min: number,
    max: number,
): string {
    const owed = here ? here.stops - ps.cornerStops : 0;

    // The corner under the car still owes a stop, so the band is measured
    // against getting out of it rather than into the next one.
    if (here && owed > 0) {
        // The longest a move can stay inside this corner, in spaces — the
        // outside line, where the corner has one.
        const last = reaches.get(here.id)?.last ?? 0;
        // §10's waiver: a car with nowhere left inside the corner has taken it
        // as slowly as the road allows, so what it still owes is written off.
        if (last === 0) return `leaves ${here.name} — the road out waives the stop it owes`;
        if (min > last) return `overshoots ${here.name} by ${min - last}–${max - last} spaces${tyreCost(ps, max - last)}`;
        return max > last
            ? `can bank a stop in ${here.name} — over ${last} and it overshoots${tyreCost(ps, max - last)}`
            : `stays in ${here.name} and banks a stop`;
    }

    const next = nextCornerReach(reaches);
    if (!next) return 'clear road';

    if (max < next.enter) return `clear road — ${next.corner.name} is ${next.enter} spaces out`;
    if (min > next.last) return `overshoots ${next.corner.name} by ${min - next.last}–${max - next.last} spaces${tyreCost(ps, max - next.last)}`;
    return max > next.last
        ? `can stop in ${next.corner.name} — over ${next.last} and it overshoots${tyreCost(ps, max - next.last)}`
        : `can stop in ${next.corner.name}`;
}

/**
 * What an overshoot costs, in the currency §10 charges it in.
 *
 * `qualifier` is what separates the two readers: the reach band is quoting the
 * worst of a range, §12's tow is quoting an exact number of spaces.
 */
function tyreCost(ps: IRaceCarsPlayerState, spaces: number, qualifier = 'up to '): string {
    if (spaces <= 0) return '';
    return spaces > ps.tyres
        ? ` — more tyres than you have left: a spin`
        : ` — ${qualifier}${pluralize(spaces, 'tyre')}`;
}

/**
 * §12's offer, priced. Three spaces are free on an open road and are three
 * spaces of overshoot in a braking zone, which is the whole decision — so the
 * prompt names the corner and what leaving it would cost rather than saying
 * "free".
 */
function towPrompt(
    ps: IRaceCarsPlayerState,
    reaches: Map<string, RaceCarsCornerReach>,
    here: RaceCarsCorner | null,
    options: RaceCarsMoveOptions,
): string {
    if (options.blockedShort) {
        return `Traffic — the tow only runs ${pluralize(options.distance, 'space')}. Tap a highlighted space to take what there is and scuff a tyre.`;
    }
    // The worst the tow can do, which is what a warning should quote: three
    // steps against the longest the corner can still hold the car.
    const past = here && here.stops > ps.cornerStops
        ? Math.max(0, SLIPSTREAM_STEPS - (reaches.get(here.id)?.last ?? 0))
        : 0;
    if (past > 0) {
        // §12: a tow out of a corner is charged in full — §10's waiver forgives
        // a corner you could not avoid leaving, and declining this costs
        // nothing.
        return `Three spaces — but they push you out of ${here!.name} by ${pluralize(past, 'space')}, charged in full${tyreCost(ps, past, '')}.`;
    }
    return `Three free spaces. Tap a highlighted space to take the tow.`;
}

/** What the move the driver is lining up will actually do, in their language. */
function movePrompt(options: RaceCarsMoveOptions): string {
    if (options.boxedIn) return 'Boxed in — nothing is reachable, so tap your own space to stay put. No damage, and the gear drops to first.';
    if (options.blockedShort) return `Traffic — the road runs out ${pluralize(options.distance, 'space')} along. Tap a highlighted space to stop short and scuff a tyre.`;
    return `Tap one of the ${options.spaces.length} highlighted spaces on the circuit.`;
}

/** The `target` a declined tow wears while it is in flight — shared with the board page's own tow taps. */
export const TOW_DECLINE = 'tow:decline';

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
 * The turn sheet: §7's shift, then its brake-and-destination, then §12's tow.
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
    // Where every corner sits from where this car stands, in spaces — one walk
    // of the road per render, read by every gear's band and by the tow prompt.
    const reaches = cornerReaches(track, { row: ps.row, lane: ps.lane }, track.rows);
    const here = cornerAt(track, ps.row, ps.lane);

    // Off-turn the gear ladder is the one thing worth reading, and a turn that
    // has already been driven still holds its own spent `roll` (§23.4 keeps
    // both on the player, so they can never be spent by anybody else). Showing
    // that stale roll back as though it were live is what the read-only branch
    // avoids — the ladder from where the car now sits is the honest answer.
    //
    // Off-turn this is where the `slipstream` phase lands too — the branch
    // below answers it only on the driver's own turn, because a tow nobody can
    // take is not a control, and the ladder is what a waiting driver reads.
    const roll = ps.roll;

    // §12 step 3 of the turn: the move is driven and the one decision left is
    // the tow. Taking it is a tap on the circuit — the same board tap the move
    // was — so the only control here is the one the board cannot offer.
    if (!readOnly && ps.phase === 'slipstream' && options !== null) {
        return (
            <div className="ag-actionsheet">
                <div className="ag-callout">{towPrompt(ps, reaches, here, options)}</div>
                <div className="ag-build-list">
                    <BuildRow
                        icon={<span className="ag-rc-gearmark">🌀</span>}
                        name="Wave the tow away"
                        cost="Costs nothing, and ends your turn here"
                        tag={pendingTarget === TOW_DECLINE ? <PendingTag label="Declining…" /> : 'Decline'}
                        pending={pendingTarget === TOW_DECLINE}
                        onClick={() => {
                            const command = new RaceCarsSlipstream();
                            command.tow = null;
                            submitCommand(command, undefined, TOW_DECLINE);
                        }}
                    />
                </div>
            </div>
        );
    }

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
                                cost={`${reachBand(ps, reaches, here, gear)}${gearboxCost > 0 ? ` · ⚙️${gearboxCost}` : ''}`}
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
    const maxBrake = Math.min(ps.brakes, roll - MIN_MOVE_STEPS);
    const distance = roll - Math.min(brake, maxBrake);
    const die = gearDef(ps.gear).faces.length;

    return (
        <ReadOnlyPanel readOnly={readOnly}>
            <div className="ag-actionsheet">
                <RollReadout
                    values={[roll]}
                    sides={[die]}
                    headline={`${gearName(ps.gear)} · ${roll}`}
                    sub={brake > 0 ? `Braking ${pluralize(brake, 'space')} off — ${pluralize(distance, 'space')} to drive` : `${pluralize(distance, 'space')} to drive`}
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
