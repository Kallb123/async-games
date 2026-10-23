'use client'
import React from 'react';
import { ruleValuesOf, type RulesContext } from '../rulesets';
import { type Fighter } from '@/games/RealmArena/rules';
import { ODDS_FLANK_WORD, whoseName } from '@/games/RealmArena/ui';
import type { ReachAfter } from '@/games/RealmArena/useTurnDraft';
import { capitalise, pluralize } from '@/utils/ui/text';
import RealmArenaCrosshair from './RealmArenaCrosshair';

/**
 * How many targets the list names, likeliest first: it floats over the board,
 * and any more would cover the squares a phone player is trying to read.
 */
const SHOWN = 3;

interface RealmArenaTargetsProps {
    /** What the viewer's selected character could hit (`reachAfter`). */
    reach: ReachAfter;
    context?: RulesContext;
    fighters: readonly Fighter[];
    viewerId: string;
    nameFor: (userId: string) => string;
}

/**
 * The selected character's targets, floating over the foot of the board: the
 * likeliest `SHOWN` its main weapon could hit, each with its chance to. While
 * a move is lined up it reads from the end of the move, so a player sees what
 * a square would put in reach before they go there — and whether they'd have
 * the AP left to attack from it.
 */
export default function RealmArenaTargets({ reach: { options, previewing, ap }, fighters, viewerId, nameFor, context }: RealmArenaTargetsProps) {
    const where = previewing ? 'from there' : 'in reach';
    const short = options.length > 0 && ap !== undefined && ap < ruleValuesOf(context).ATTACK_AP ? ' · no AP to attack' : '';
    return (
        <div className="ag-board-tag ag-ra-targets" data-tour="ra-targets">
            <div className="ag-ra-targets-head">
                <RealmArenaCrosshair />
                {options.length === 0 ? `No targets ${where}` : `${pluralize(options.length, 'target')} ${where}${short}`}
            </div>
            {options.slice(0, SHOWN).map(({ target, chance, flanked }) => (
                <div key={target.id} className="ag-ra-targets-row">
                    <RealmArenaCrosshair />
                    <span className="ag-ra-targets-name">{capitalise(whoseName(fighters, target.id, viewerId, nameFor, context))}</span>
                    {flanked && <span className="ag-tag ag-ra-targets-flank">{ODDS_FLANK_WORD}</span>}
                    <b>{chance}%</b>
                </div>
            ))}
        </div>
    );
}
