'use client'
import React, { useState } from 'react';
import type { ITrainTimeTicketView } from '@/games/TrainTime/apiModels';
import TrainTimeTicket from './TrainTimeTicket';
import ActionButton from '@/components/ui/ActionButton';
import { pluralize } from '@/utils/ui/text';

interface TrainTimeTicketSheetProps {
    tickets: ITrainTimeTicketView[];
    /** The fewest that can be kept — 2 at setup, 1 for a mid-game draw (§4, §5). */
    mustKeep: number;
    /** True for the opening deal, which happens before the player's first action. */
    settingUp: boolean;
    onKeep: (ticketIds: number[]) => void;
    pending: boolean;
}

/**
 * The keep-or-return choice, and the one screen in the game where the downside
 * is the point: a ticket you don't connect is subtracted at the end (§6), so
 * the sheet prices both directions before anything is committed.
 */
export default function TrainTimeTicketSheet({ tickets, mustKeep, settingUp, onKeep, pending }: TrainTimeTicketSheetProps) {
    const [chosen, setChosen] = useState<number[]>([]);
    const toggle = (id: number) =>
        setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));

    const enough = chosen.length >= mustKeep;
    const atStake = tickets.filter(t => chosen.includes(t.id)).reduce((sum, t) => sum + t.points, 0);

    return (
        <>
            <div className="ag-tt-sheet-head">
                <div className="ag-tt-sheet-title">
                    {settingUp ? 'Your opening tickets' : 'Fresh from the ticket deck'}
                </div>
                <p className="ag-tt-sheet-sub">
                    Keep at least {mustKeep} of {tickets.length}. Connect the two cities with your own track and
                    the points are yours at the end — leave one unfinished and they come off your score.
                </p>
            </div>

            <div className="ag-actionsheet">
                <div className="ag-tt-ticket-list">
                    {tickets.map(ticket => (
                        <TrainTimeTicket
                            key={ticket.id}
                            ticket={ticket}
                            selected={chosen.includes(ticket.id)}
                            onToggle={() => toggle(ticket.id)}
                        />
                    ))}
                </div>

                <div className="ag-tt-after">
                    <div className="ag-tt-after-row">
                        <span>Keeping</span>
                        <span className="ag-tt-after-value">{pluralize(chosen.length, 'ticket')}</span>
                    </div>
                    <div className="ag-tt-after-row">
                        <span>At stake</span>
                        <span className="ag-tt-after-value">
                            <span className="ag-tt-after-to">+{atStake}</span> or −{atStake}
                        </span>
                    </div>
                    <p className="ag-tt-pay-note">
                        {settingUp
                            ? 'Choose before you take your first turn — the tickets you hand back go to the bottom of the deck.'
                            : 'Drawing tickets was this turn’s action; the ones you hand back go to the bottom of the deck.'}
                    </p>
                </div>

                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block"
                    style={{ marginTop: 14 }}
                    disabled={!enough}
                    pending={pending}
                    pendingLabel="Filing…"
                    onClick={() => onKeep(chosen)}
                >
                    {enough ? `Keep ${pluralize(chosen.length, 'ticket')}` : `Pick at least ${mustKeep}`}
                </ActionButton>
            </div>
        </>
    );
}
