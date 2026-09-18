'use client'
import TurnRecap, { TurnRecapEvent } from '@/components/games/TurnRecap';
import type { IRaceCarsArrivalOutcome } from '@/games/RaceCars/RaceCarsLogic';
import { arrivalHeadline, arrivalLine } from '@/games/RaceCars/narration';
import { gearDef, gearName, trackById, type RaceCarsGear } from '@/games/RaceCars/board';
import { meta } from '@/games/RaceCars/meta';
import { pluralize } from '@/utils/ui/text';

interface RaceCarsEndMoveScreenProps {
    trackId: string;
    /**
     * The gear and number this leg was driven on, or null for §12's tow —
     * which is a fixed three rows and no roll at all. A null `gear` is §6a's
     * flying start: four spaces off no die, with the car in first.
     */
    roll: { gear: RaceCarsGear | null; value: number } | null;
    arrival: IRaceCarsArrivalOutcome['arrival'];
    onDismiss: () => void;
}

// Two dots, read alongside the glyph rather than instead of it: the road the
// car drove, and the money it cost. A spin, an overshoot and a scuffed tyre are
// all the second one.
const ROAD_DOT = meta.accent;
const DAMAGE_DOT = '#a8391f';

/** Damage reads red; everything else is the road. */
function dotFor(type: string): string {
    return type === 'spin' || type === 'overshoot' || type === 'blocked' ? DAMAGE_DOT : ROAD_DOT;
}

/** Where this leg's spaces came from: a gear's die, §6a's flying start, or §12's tow. */
function legSummary(roll: { gear: RaceCarsGear | null; value: number } | null): string {
    if (!roll) return 'Slipstream · three spaces';
    if (roll.gear === null) return `Flying start · ${pluralize(roll.value, 'space')}`;
    return `${gearName(roll.gear)} · d${gearDef(roll.gear).faces.length} · rolled ${roll.value}`;
}

/**
 * The end-of-move reveal (§23.7 PR 5): the roll, what the corner made of it,
 * and whether a tow is on offer — shown the instant `RaceCarsMove` (or the
 * `RaceCarsSlipstream` that follows it) comes back, before the board moves on.
 *
 * Reuses the "since you were last here" recap shell rather than a bespoke
 * screen, the same way `OutbreakEndTurnScreen` does: a move is already a small
 * timeline — entered the corner, banked a stop, crossed the line — and that is
 * exactly the picture `TurnRecap` draws. `PayoffScreen` is the other shape this
 * could have taken and is the wrong one here: it reveals *one* number, and a
 * Race Cars move is a sequence.
 */
export default function RaceCarsEndMoveScreen({ trackId, roll, arrival, onDismiss }: RaceCarsEndMoveScreenProps) {
    const track = trackById(trackId);
    const events: TurnRecapEvent[] = arrival.events.flatMap((event, index) => {
        const line = arrivalLine(track, event, arrival);
        if (!line) return [];
        return [{ id: `${index}`, glyph: line.glyph, title: line.text, dotColour: dotFor(event.type) }];
    });

    const spent = arrival.tyresSpent > 0
        ? `${pluralize(arrival.tyresSpent, 'tyre')} gone. `
        : '';
    const summary = arrivalHeadline(arrival);

    return (
        <TurnRecap
            header={{ name: meta.name, accent: meta.accent, glyph: meta.glyph }}
            since={legSummary(roll)}
            summary={{ headline: summary.headline, subline: `${spent}${summary.subline}` }}
            events={events}
            tip={arrival.towOffered ? {
                glyph: '🌀',
                text: 'You finished in another car’s tow — three rows, if you want them. Tap a highlighted space on the circuit to take the slipstream, or wave it away.',
            } : null}
            cta={{ label: arrival.towOffered ? 'Choose the tow' : 'Back to the board', onClick: onDismiss }}
        />
    );
}
