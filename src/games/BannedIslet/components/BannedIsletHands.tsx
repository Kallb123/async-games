'use client'
import React from 'react';
import PlayerHands, { PlayerHandSeat } from '@/components/ui/PlayerHands';
import BannedIsletChip from './BannedIsletChip';
import type { IBannedIsletPlayerStateResponse } from '@/games/BannedIslet/apiModels';
import { cardGlyph, cardName, roleDef } from '@/games/BannedIslet/board';

interface BannedIsletHandsProps {
    playerStates: { [userId: string]: IBannedIsletPlayerStateResponse };
    /** Every player id in join order — drives each seat's colour dot, so it matches the pawns on the board. */
    userIdList: string[];
    /** The real running order (`gameState.turnOrder`) — drives seating and the now/next markers. */
    turnOrder: string[];
    myUserId: string;
    /** Whose turn the board is showing, or null once the game is over. */
    activeUserId: string | null;
}

/**
 * Every hand on the table, face up — §2's "shared table, shared brain" pillar,
 * and the reason this game hides nothing but the two deck orders (§21.4).
 * Deliberately outside the page's `ReadOnlyPanel`: these panels are never
 * actionable on anyone's turn, so there is nothing here to take out of play
 * (AGENTS.md names this case).
 *
 * The stack itself is `PlayerHands`; what belongs to Banned Islet is the card
 * chip — a treasure's own figure and its name (§17: a silhouette, never a
 * colour), which is `BannedIsletChip`, shared with the flood discard — and the
 * role the seat is playing.
 */
export default function BannedIsletHands({ playerStates, userIdList, turnOrder, myUserId, activeUserId }: BannedIsletHandsProps) {
    const seats: PlayerHandSeat[] = Object.values(playerStates).map(ps => ({
        userId: ps.userId,
        username: ps.username,
        cardCount: ps.hand.length,
        // Keyed by position in the hand: the cards are interchangeable copies
        // (§10 — four Ember Crown cards are four of the same card), so there is
        // no id to key on and the index is what tells two of them apart.
        cards: ps.hand.map((card, index) => (
            <BannedIsletChip key={`${card}-${index}`} glyph={cardGlyph(card)} label={cardName(card)} />
        )),
        note: <span className="ag-hand-note">{roleDef(ps.role).name}</span>,
    }));

    return (
        <PlayerHands
            seats={seats}
            turnOrder={turnOrder}
            userIdList={userIdList}
            myUserId={myUserId}
            activeUserId={activeUserId}
        />
    );
}
