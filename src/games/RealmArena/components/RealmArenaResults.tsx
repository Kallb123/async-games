'use client'
import React from 'react';
import ListRow from '@/components/ui/ListRow';
import RollReadout from '@/components/ui/RollReadout';
import Section from '@/components/ui/Section';
import { ROLL_SIDES, type BattleEvent, type Fighter } from '@/games/RealmArena/rules';
import { eventLines, type EventLine } from '@/games/RealmArena/ui';

interface RealmArenaResultsProps {
    events: readonly BattleEvent[];
    fighters: readonly Fighter[];
    viewerId: string;
    nameFor: (userId: string) => string;
}

/**
 * What the player's last action did, as it came back from the server
 * (docs/games/realm-arena.md §17.3 PR 7): every shot with the roll that decided
 * it — its own, and each overwatch it set off — and every strike, knock-out and
 * score, in the order they happened.
 */
export default function RealmArenaResults({ events, fighters, viewerId, nameFor }: RealmArenaResultsProps) {
    // In the order it happened: each shot as its roll, and each run of
    // everything else between them as one list.
    const runs: EventLine[][] = [];
    for (const line of eventLines(events, fighters, viewerId, nameFor)) {
        const last = runs[runs.length - 1];
        if (line.roll === undefined && last && last[0].roll === undefined) last.push(line);
        else runs.push([line]);
    }
    if (runs.length === 0) return null;
    return (
        <Section label="What happened">
            {runs.map((run, index) => run[0].roll !== undefined ? (
                <RollReadout key={index} className="ag-ra-roll" values={[run[0].roll]} sides={[ROLL_SIDES]} headline={run[0].title} sub={run[0].sub} />
            ) : (
                <div key={index} className="ag-list">
                    {run.map((line, row) => <ListRow key={row} icon={line.icon} title={line.title} sub={line.sub} />)}
                </div>
            ))}
        </Section>
    );
}
