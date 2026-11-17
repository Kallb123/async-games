'use client'
import React, { useState } from 'react';
import BuildRow from '@/components/ui/BuildRow';
import PendingTag from '@/components/ui/PendingTag';
import { rulesetOf } from '@/games/RealmArena/rulesets';
import { fighterName } from '@/games/RealmArena/ui';
import { CHARACTER_MARK } from '@/games/RealmArena/roster';
import { RALLY_LOOK, rallyOptionsOf, rallyTotal, reinforcedHp, resupplyItems, type RallyAction, type RallyChoice } from '@/games/RealmArena/rally';
import type { BattleState } from '@/games/RealmArena/rules';
import { andList, capitalise } from '@/utils/ui/text';

/** The `target` a rally choice wears while it's in flight: its own row, and for a Reinforce the downed character it names. */
export const rallyTarget = (choice: RallyChoice, fighter?: number): string => fighter === undefined ? `rally:${choice}` : `rally:${choice}:${fighter}`;

interface RealmArenaRallySheetProps {
    battle: BattleState;
    /** The players in seat order, which a deployment zone is read by. */
    seats: readonly string[];
    player: string;
    /** The `target` of whatever command is in flight, or null. */
    pendingTarget: string | null;
    onChoose: (action: RallyAction) => void;
}

/** Where a reinforcement stands, and what it can do. */
const RETURNS = "Who rejoins the fight? They return on a free square of your deployment zone with a full turn of AP to spend at once.";

/** The trailing verb of each choice's row. */
const TAG: Readonly<Record<RallyChoice, string>> = { rally: 'Rally', reinforce: 'Choose', resupply: 'Resupply' };

/**
 * A fresh wave has landed and the viewer owes the team a rally choice
 * (docs/games/realm-arena.md §39.4): the sheet shows it alone, ahead of every
 * action, as three rows. Reinforce opens a second list to pick whom it brings
 * back, with a way back to the three.
 */
export default function RealmArenaRallySheet({ battle, seats, player, pendingTarget, onChoose }: RealmArenaRallySheetProps) {
    const [picking, setPicking] = useState(false);
    const busy = pendingTarget !== null;
    const options = rallyOptionsOf(battle, seats, player);
    const { ITEMS } = rulesetOf(battle);

    if (picking) {
        const downed = options.find(option => option.choice === 'reinforce')?.downed ?? [];
        return (
            <>
                <p className="ag-hint ag-hint--tight">{RETURNS}</p>
                <div className="ag-build-list">
                    {downed.map(fighter => {
                        const pending = pendingTarget === rallyTarget('reinforce', fighter.id);
                        return (
                            <BuildRow
                                key={fighter.id}
                                icon={CHARACTER_MARK[fighter.character]}
                                name={capitalise(fighterName(battle.fighters, fighter, battle))}
                                cost={`Returns at ${reinforcedHp(fighter, battle)} HP`}
                                tag={pending ? <PendingTag label="Sending…" /> : 'Bring back'}
                                disabled={busy}
                                pending={pending}
                                onClick={() => onChoose({ kind: 'rally', choice: 'reinforce', fighter: fighter.id })}
                            />
                        );
                    })}
                </div>
                <button type="button" className="ag-btn ag-btn--light" disabled={busy} onClick={() => setPicking(false)}>Back</button>
            </>
        );
    }

    const cost = (choice: RallyChoice): string => {
        switch (choice) {
            case 'rally': {
                const total = rallyTotal(battle, player);
                return total > 0 ? `Your standing characters regain ${total} HP in all` : 'Nobody of yours is hurt';
            }
            case 'reinforce': return 'One downed character returns at half HP and acts at once';
            case 'resupply': {
                const names = resupplyItems(battle, player).map(item => ITEMS[item].name);
                return names.length > 0 ? `Gets back: ${andList(names)}` : 'Each standing character gets back the item it mustered with';
            }
        }
    };

    return (
        <>
            <p className="ag-hint ag-hint--tight">A fresh wave has landed. Choose how your squad rallies before you act.</p>
            <div className="ag-build-list">
                {options.map(option => {
                    const look = RALLY_LOOK[option.choice];
                    const pending = pendingTarget === rallyTarget(option.choice);
                    return (
                        <BuildRow
                            key={option.choice}
                            icon={look.icon}
                            name={look.name}
                            cost={option.available ? cost(option.choice) : option.reason}
                            tag={pending ? <PendingTag label="Sending…" /> : option.available ? TAG[option.choice] : 'Unavailable'}
                            tagMuted={!option.available}
                            disabled={busy || !option.available}
                            pending={pending}
                            onClick={() => option.choice === 'reinforce' ? setPicking(true) : onChoose({ kind: 'rally', choice: option.choice })}
                        />
                    );
                })}
            </div>
        </>
    );
}
