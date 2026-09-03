'use client'
import { useEffect, useState } from 'react';
import Dice from '@/components/ui/Dice';
import PayoffScreen from '@/components/ui/PayoffScreen';
import { spaceName } from '@/games/FiresOut/board';
import type { IFiresOutAdvanceFireOutcome } from '@/games/FiresOut/FiresOutLogic';

// fires-out-gdd.md §17.6 step 7: the fire is the antagonist (§2), so ending a
// turn shows what it just did rather than leaving it to a log line —
// SnakesAndLaddersRollResult.tsx's tumble-then-settle-then-reveal is the
// precedent (docs cite it by name). The shell (the fixed overlay, the stage
// frame, the bottom sheet) is shared via PayoffScreen; only the content here
// is bespoke, since it's genuinely different: two dice of different sizes,
// and a resolution with its own consequences instead of a board-square pill.
export interface AdvanceFireDisplay extends IFiresOutAdvanceFireOutcome {
    /** The endTurn command's id — a fresh roll needs a fresh mount even if the numbers repeat. */
    id: string;
    /** Display names for knockedDownOwnerIds, resolved by the page (which already has usernameList). */
    knockedDownNames: string[];
}

/** Turns the command's outcome into a display result — mirrors SnakesAndLaddersRollResult's buildRollResult. */
export function buildAdvanceFireDisplay(
    id: string,
    advance: IFiresOutAdvanceFireOutcome,
    nameFor: (ownerId: string) => string,
): AdvanceFireDisplay {
    return {
        ...advance,
        id,
        knockedDownNames: advance.knockedDownOwnerIds.map(nameFor),
    };
}

const RESOLUTION_ICON: Record<IFiresOutAdvanceFireOutcome['resolution'], string> = {
    smoke: '💨',
    fire: '🔥',
    explosion: '💥',
};

const RESOLUTION_TITLE: Record<IFiresOutAdvanceFireOutcome['resolution'], string> = {
    smoke: 'Smoke fills the room',
    fire: 'Fire catches!',
    explosion: 'Explosion!',
};

export default function FiresOutAdvanceFireResult({ result, onDismiss }: { result: AdvanceFireDisplay; onDismiss: () => void }) {
    const { rolls, target, resolution, knockedDownNames, victimsLost, poiPlaced } = result;

    // Tumble both dice for a beat, then settle on the real rolls and reveal
    // what Advance Fire did — the same two-stage reveal as
    // SnakesAndLaddersRollResult, keyed per roll by the parent so a repeat
    // roll still remounts and re-tumbles.
    const [rolling, setRolling] = useState(true);
    const [d6Face, setD6Face] = useState(rolls.d6);
    const [d8Face, setD8Face] = useState(rolls.d8);
    useEffect(() => {
        const cycle = setInterval(() => {
            setD6Face(1 + Math.floor(Math.random() * 6));
            setD8Face(1 + Math.floor(Math.random() * 8));
        }, 90);
        const settle = setTimeout(() => {
            clearInterval(cycle);
            setD6Face(rolls.d6);
            setD8Face(rolls.d8);
            setRolling(false);
        }, 950);
        return () => { clearInterval(cycle); clearTimeout(settle); };
    }, [rolls.d6, rolls.d8]);

    const stageClass = rolling ? 'ag-fo-advance-stage--plain' : `ag-fo-advance-stage--${resolution}`;

    const notes: string[] = [];
    if (knockedDownNames.length > 0) notes.push(`${knockedDownNames.join(', ')} knocked down`);
    if (victimsLost > 0) notes.push(`${victimsLost} victim${victimsLost === 1 ? '' : 's'} lost`);
    if (poiPlaced > 0) notes.push(`${poiPlaced} new POI marker${poiPlaced === 1 ? '' : 's'} placed`);

    return (
        <PayoffScreen
            title="Advance Fire"
            subtitle={rolling ? 'Rolling the d6 and d8…' : `Rolled ${rolls.d6}, ${rolls.d8}`}
            stageClassName={stageClass}
            ctaLabel="Continue"
            onCta={onDismiss}
            ctaDisabled={rolling}
        >
            <Dice values={[d6Face, d8Face]} sides={[6, 8]} rolling={rolling} />

            {rolling ? (
                <div className="ag-fo-advance-title">Rolling…</div>
            ) : (
                <>
                    <div className="ag-payoff-icon ag-fo-advance-reveal">{RESOLUTION_ICON[resolution]}</div>
                    <div className="ag-fo-advance-reveal">
                        <div className="ag-fo-advance-title">{RESOLUTION_TITLE[resolution]}</div>
                        <div className="ag-fo-advance-sub">{spaceName(target)}</div>
                    </div>
                    {notes.length > 0 && (
                        <div className="ag-fo-advance-notes ag-fo-advance-reveal">
                            {notes.map(note => <div key={note}>{note}</div>)}
                        </div>
                    )}
                </>
            )}
        </PayoffScreen>
    );
}
