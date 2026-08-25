'use client'
import React from 'react';
import type { ITrainTimeTicketView } from '@/games/TrainTime/apiModels';
import { cityName } from '@/games/TrainTime/board';

interface TrainTimeTicketProps {
    ticket: ITrainTimeTicketView;
    /** Whether it's picked out — kept in the keep-or-return choice, or the one
     *  being read against the map in the tickets panel. Omit elsewhere. */
    selected?: boolean;
    /** Given only where a ticket is tappable — otherwise it renders flat. */
    onToggle?: () => void;
    /** Draw the keep tick. Only the keep-or-return choice keeps anything. */
    showKeepTick?: boolean;
    /** After scoring, a ticket is worth ±its value rather than "still open". */
    scored?: boolean;
}

/**
 * One Destination Ticket: the two cities it names, what it's worth, and where
 * the holder's network has got to. The same card does the keep-or-return
 * choice, the "your tickets" panel and the end-of-game reveal, so a ticket
 * looks the same everywhere it appears.
 */
export default function TrainTimeTicket({ ticket, selected, onToggle, showKeepTick, scored }: TrainTimeTicketProps) {
    const status = ticket.complete ? 'Connected' : scored ? 'Missed' : 'Not connected yet';
    // Once the game is scored the value reads as the swing it actually was.
    const value = scored
        ? `${ticket.complete ? '+' : '−'}${ticket.points}`
        : ticket.points;

    const className = 'ag-tt-ticket'
        + (ticket.complete ? ' ag-tt-ticket--done' : '')
        + (selected ? ' ag-tt-ticket--on' : '')
        + (showKeepTick ? ' ag-tt-ticket--tick' : '');

    const body = (
        <>
            <div className="ag-tt-ticket-route">
                <span className="ag-tt-ticket-city">{cityName(ticket.cityA)}</span>
                <span className="ag-tt-ticket-line" />
                <span className="ag-tt-ticket-city">{cityName(ticket.cityB)}</span>
            </div>
            <div className="ag-tt-ticket-foot">
                <span className={`ag-tt-ticket-status${ticket.complete ? ' ag-tt-ticket-status--done' : ''}`}>
                    {status}
                </span>
                <span className={`ag-tt-ticket-points${scored && !ticket.complete ? ' ag-tt-ticket-points--miss' : ''}`}>
                    {value}
                </span>
            </div>
        </>
    );

    if (!onToggle) return <div className={className}>{body}</div>;
    return (
        <button type="button" className={className} aria-pressed={selected} onClick={onToggle}>
            {body}
            {showKeepTick && <span className="ag-tt-ticket-tick">{selected ? '✓' : ''}</span>}
        </button>
    );
}
