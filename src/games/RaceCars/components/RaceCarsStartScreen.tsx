'use client'
import TurnRecap from '@/components/games/TurnRecap';
import { startHeadline, startLine, type RaceCarsStartSummary } from '@/games/RaceCars/narration';
import { START_DIE_SIDES } from '@/games/RaceCars/board';
import { meta } from '@/games/RaceCars/meta';

interface RaceCarsStartScreenProps {
    start: RaceCarsStartSummary;
    onDismiss: () => void;
}

/**
 * The startup-round reveal (§6a): the d20 that decided how this car got away,
 * and what it means for the turn that follows.
 *
 * The same `TurnRecap` shell `RaceCarsEndMoveScreen` uses rather than a second
 * full-screen reveal of its own — a getaway is the same beat as an arrival, one
 * line of what happened under a headline, and the shell already draws it. The
 * words are `narration.ts`'s, so the log and this screen describe a stall the
 * same way.
 */
export default function RaceCarsStartScreen({ start, onDismiss }: RaceCarsStartScreenProps) {
    const summary = startHeadline(start);
    const line = startLine(start);

    return (
        <TurnRecap
            header={{ name: meta.name, accent: meta.accent, glyph: meta.glyph }}
            since={`Start · d${START_DIE_SIDES} · rolled ${start.roll}`}
            summary={summary}
            events={[{ id: 'start', glyph: line.glyph, title: line.text, dotColour: meta.accent }]}
            cta={{
                label: start.outcome === 'stalled' ? 'Back to the board' : 'Pick your line',
                onClick: onDismiss,
            }}
        />
    );
}
