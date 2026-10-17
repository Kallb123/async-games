'use client'
import type { RulesContext } from "@/games/RealmArena/rulesets";
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import OptionSection from '@/components/ui/OptionSection';
import OptionToggleRow from '@/components/ui/OptionToggleRow';
import UndoButton from '@/components/ui/UndoButton';
import { isStanding, REACTION_COST, shoots, type Fighter } from '@/games/RealmArena/rules';
import { fighterName } from '@/games/RealmArena/ui';
import { CHARACTER_MARK } from '@/games/RealmArena/roster';

interface RealmArenaTurnEndProps {
    onEndTurn: () => void;
    /** Lets go of the selected character, while one is selected. */
    onDeselect?: () => void;
    /** The player's last action can still be taken back (docs/undo.md). */
    canUndo: boolean;
    onUndo: () => void;
    /** The undo is in flight. */
    undoPending: boolean;
    /** The end of the turn is in flight. */
    pending: boolean;
    /** Something else is in flight. */
    disabled: boolean;
}

/**
 * End turn, with Undo beside it while the last action can still be taken back
 * and Deselect while a character is selected (docs/games/realm-arena.md §17.3
 * PR 7): the first row under the board, so a turn ends without a scroll past
 * the squad. Who goes on watch as it does is `RealmArenaWatchSwitches`,
 * further down.
 */
export default function RealmArenaTurnEnd({ onEndTurn, onDeselect, canUndo, onUndo, undoPending, pending, disabled }: RealmArenaTurnEndProps) {
    return (
        <div className="ag-action-grid" data-tour="ra-turn-end">
            {canUndo && <UndoButton pending={undoPending} disabled={disabled} onClick={onUndo} />}
            {onDeselect && (
                <button type="button" className="ag-btn ag-btn--light" disabled={disabled} onClick={onDeselect}>
                    Deselect
                </button>
            )}
            <ActionButton className="ag-btn ag-btn--primary" pending={pending} pendingLabel="Ending turn…" disabled={disabled} onClick={onEndTurn}>
                End turn
            </ActionButton>
        </div>
    );
}

interface RealmArenaWatchSwitchesProps {
    context?: RulesContext;
    fighters: readonly Fighter[];
    player: string;
    /** Ids of the player's characters to keep still rather than go on watch. */
    keepStill: readonly number[];
    onKeepStill: (keepStill: number[]) => void;
    /** Something is in flight. */
    disabled: boolean;
}

/**
 * Who goes on watch when the turn ends: a switch for each character with AP
 * enough to — on, as a timed-out turn would leave it (§17.2), or off to keep
 * it still. Nothing at all while nobody has the AP.
 */
export function RealmArenaWatchSwitches({ fighters, player, keepStill, onKeepStill, disabled, context }: RealmArenaWatchSwitchesProps) {
    const watchers = fighters.filter(fighter => fighter.owner === player && isStanding(fighter) && fighter.ap >= REACTION_COST);
    if (watchers.length === 0) return null;
    const footer = <p className="ag-hint">Anyone with {REACTION_COST} AP or more left goes on watch when the turn ends, unless you keep them still.</p>;
    return (
        <OptionSection label="When your turn ends" footer={footer}>
            {watchers.map(fighter => {
                const still = keepStill.includes(fighter.id);
                const stance = shoots(fighter, context) ? 'overwatch' : 'guard';
                return (
                    <OptionToggleRow
                        key={fighter.id}
                        title={`${CHARACTER_MARK[fighter.character]} ${fighterName(fighters, fighter)}`}
                        description={still ? `Keeps still · its ${fighter.ap} AP are lost` : `Goes on ${stance} with ${fighter.ap} AP`}
                        on={!still}
                        disabled={disabled}
                        ariaLabel={`${fighterName(fighters, fighter)} goes on ${stance}`}
                        onToggle={() => onKeepStill(still ? keepStill.filter(id => id !== fighter.id) : [...keepStill, fighter.id])}
                    />
                );
            })}
        </OptionSection>
    );
}
