'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import OptionSection from '@/components/ui/OptionSection';
import OptionToggleRow from '@/components/ui/OptionToggleRow';
import Section from '@/components/ui/Section';
import UndoButton from '@/components/ui/UndoButton';
import { isStanding, REACTION_COST, weaponOf, type Fighter } from '@/games/RealmArena/rules';
import { CHARACTER_MARK, fighterName } from '@/games/RealmArena/ui';

interface RealmArenaTurnEndProps {
    fighters: readonly Fighter[];
    player: string;
    /** Ids of the player's characters to keep still rather than go on watch. */
    keepStill: readonly number[];
    onKeepStill: (keepStill: number[]) => void;
    onEndTurn: () => void;
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
 * The end of a battle turn (docs/games/realm-arena.md §17.3 PR 7): a switch for
 * each character with AP enough to go on watch — on, as a timed-out turn would
 * leave it (§17.2), or off to keep it still — and End turn, with Undo beside it
 * while the last action can still be taken back.
 */
export default function RealmArenaTurnEnd({ fighters, player, keepStill, onKeepStill, onEndTurn, canUndo, onUndo, undoPending, pending, disabled }: RealmArenaTurnEndProps) {
    const watchers = fighters.filter(fighter => fighter.owner === player && isStanding(fighter) && fighter.ap >= REACTION_COST);
    const endTurn = (
        <div className="ag-action-grid" data-tour="ra-turn-end">
            {canUndo && <UndoButton pending={undoPending} disabled={disabled} onClick={onUndo} />}
            <ActionButton className="ag-btn ag-btn--primary" pending={pending} pendingLabel="Ending turn…" disabled={disabled} onClick={onEndTurn}>
                End turn
            </ActionButton>
        </div>
    );
    if (watchers.length === 0) {
        return <Section label="End your turn">{endTurn}</Section>;
    }

    const footer = (
        <>
            <p className="ag-hint">Anyone with {REACTION_COST} AP or more left goes on watch when the turn ends, unless you keep them still.</p>
            {endTurn}
        </>
    );
    return (
        <OptionSection label="End your turn" footer={footer}>
            {watchers.map(fighter => {
                const still = keepStill.includes(fighter.id);
                const stance = weaponOf(fighter).kind === 'ranged' ? 'overwatch' : 'guard';
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
