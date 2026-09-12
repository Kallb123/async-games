import React from 'react';
import { playerColourForId } from '@/utils/ui/playerColours';
import { reorderByIds, seatOrderFrom } from '@/utils/ui/players';
import { pluralize } from '@/utils/ui/text';

/** One seat's contribution to the stack: who it belongs to and what it is holding. */
export interface PlayerHandSeat {
    userId: string;
    /** What to call this player — shown to everyone but the viewer, who reads "Your hand". */
    username: string;
    /** What the heading announces. Not always the number of chips in `cards`:
     *  Outbreak's stored Contingency card is a chip outside the hand limit. */
    cardCount: number;
    /** The chips themselves. Only the game knows what one of its cards looks
     *  like, so the card is passed in rather than described here. */
    cards: React.ReactNode;
    /** Trailing note on the head row — a role name, or a button opening its details. */
    note?: React.ReactNode;
}

interface PlayerHandsProps {
    /** Every seat with a hand to show, in any order — this seats them itself. */
    seats: PlayerHandSeat[];
    /** Player seats in the real turn order (`gameState.turnOrder`), which is
     *  rolled off or shuffled at setup and need not match `userIdList`'s join
     *  order. Drives the seating and the "now"/"next" markers. Falls back to
     *  the order `seats` arrives in before it has loaded. */
    turnOrder: string[];
    /** Every player id in the app's stable seat order (join order) — not
     *  necessarily turn order. Only drives each seat's colour dot, so it
     *  matches the pawn colours on the board and the scoreboard. */
    userIdList: string[];
    myUserId: string;
    /** Whose turn the board is showing — the turn under review, not necessarily
     *  the live one, and null once the game is over. Drives the markers. */
    activeUserId: string | null;
    /** What an empty hand says in place of its chips. */
    emptyLabel?: string;
}

/**
 * Every player's hand, rendered for everyone — the shape a co-op table takes
 * when nothing is hidden, so a teammate never has to be *told* what they are
 * looking at. One `ag-hand` panel per seat, the same wrapper Settlements &
 * Cities and Train Time use for a single "your hand", looped.
 *
 * Deliberately **not** wrapped in `ReadOnlyPanel` by its callers: a panel
 * nobody can ever act on has nothing to take out of play (AGENTS.md carves
 * this case out by name).
 *
 * The stack reads from the viewer outwards: your own hand heads the list and
 * carries the `--me` tint, then the seats that play after you, so finding your
 * cards never means hunting the middle of the list. Whose turn it is travels
 * with the seat instead of the position (the top scoreboard is long off-screen
 * by the time you have scrolled down here), so each panel says so itself.
 *
 * What differs between games is one chip, so that is the one thing passed in.
 */
export default function PlayerHands({
    seats,
    turnOrder,
    userIdList,
    myUserId,
    activeUserId,
    emptyLabel = 'No cards.',
}: PlayerHandsProps) {
    // Turn markers and seating follow the real turn order, not userIdList's
    // join order (they need not match — see the prop docs above), and fall back
    // to the seats themselves so a hand still draws before turnOrder lands.
    const order = seatOrderFrom(turnOrder.length ? turnOrder : seats.map(s => s.userId), myUserId);
    const activeSeat = activeUserId ? turnOrder.indexOf(activeUserId) : -1;
    const nextUserId = activeSeat >= 0 && turnOrder.length > 1
        ? turnOrder[(activeSeat + 1) % turnOrder.length]
        : null;

    return (
        <>
            {reorderByIds(seats, order, seat => seat.userId).map(seat => {
                const isMe = seat.userId === myUserId;
                const isActive = seat.userId === activeUserId;

                return (
                    <div className={`ag-hand${isMe ? ' ag-hand--me' : ''}${isActive ? ' ag-hand--active' : ''}`} key={seat.userId}>
                        <div className="ag-hand-head">
                            <span className="ag-hand-title">
                                <span className="ag-hand-dot" style={{ background: playerColourForId(seat.userId, userIdList) }} />
                                {isMe ? 'Your hand' : `${seat.username}’s hand`} · {pluralize(seat.cardCount, 'card')}
                                {isActive && <span className="ag-tag">Playing now</span>}
                                {!isActive && seat.userId === nextUserId && <span className="ag-tag ag-tag--quiet">Up next</span>}
                            </span>
                            {seat.note}
                        </div>
                        <div className="ag-hand-cards ag-hand-cards--wrap">
                            {seat.cardCount === 0
                                ? <span className="ag-hand-note">{emptyLabel}</span>
                                : seat.cards}
                        </div>
                    </div>
                );
            })}
        </>
    );
}
