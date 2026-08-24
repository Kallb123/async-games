'use client'
import React from 'react';
import type { ITrainTimeTicketView } from '@/games/TrainTime/apiModels';
import TrainTimeTicket from './TrainTimeTicket';

export interface TrainTimeTicketGroup {
    title: string;
    tickets: ITrainTimeTicketView[];
}

interface TrainTimeTicketPanelProps {
    groups: TrainTimeTicketGroup[];
    /** The ticket whose two cities are lit up on the map, if any. */
    selectedTicketId: number | null;
    onSelectTicket: (ticketId: number) => void;
    /** True once the game is scored, when tickets read as ± their value. */
    scored?: boolean;
}

/**
 * A read-only list of tickets, grouped by holder. One group while you're
 * playing (your own, which nobody else can see), one per player at the end
 * when the whole table's tickets are turned face up (design doc §10). Tapping
 * one lights its two cities up on the map; tapping it again puts them out.
 */
export default function TrainTimeTicketPanel({ groups, selectedTicketId, onSelectTicket, scored }: TrainTimeTicketPanelProps) {
    return (
        <div className="ag-hand">
            {groups.map(group => (
                <div key={group.title} className="ag-tt-ticket-group">
                    <div className="ag-hand-head">
                        <span className="ag-hand-title">{group.title}</span>
                        <span className="ag-hand-note">
                            {group.tickets.filter(t => t.complete).length}/{group.tickets.length} connected
                        </span>
                    </div>
                    <div className="ag-tt-ticket-list">
                        {group.tickets.map(ticket => (
                            <TrainTimeTicket
                                key={ticket.id}
                                ticket={ticket}
                                selected={ticket.id === selectedTicketId}
                                onToggle={() => onSelectTicket(ticket.id)}
                                scored={scored}
                            />
                        ))}
                        {group.tickets.length === 0 && <p className="ag-tt-pay-note">No tickets kept.</p>}
                    </div>
                </div>
            ))}
        </div>
    );
}
