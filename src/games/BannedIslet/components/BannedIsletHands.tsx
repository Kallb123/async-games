'use client'
import React from 'react';
import PlayerHands, { PlayerHandSeat } from '@/components/ui/PlayerHands';
import RoleNote from '@/components/ui/RoleNote';
import type { IBannedIsletPlayerStateResponse } from '@/games/BannedIslet/apiModels';
import { roleDef, sortHand } from '@/games/BannedIslet/board';
import BannedIsletCardChip from './BannedIsletCardChip';

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
 * colour) — and the role the seat is playing. The chip itself is the shared
 * `NamedChip`, which the flood-discard panel wears too.
 *
 * Every role name is the shared `RoleNote`, tappable for what that seat can do
 * (§12). Not a nicety: §12 calls the roles "the first thing a team plans
 * around", and a plan needs the *other* seats' abilities as much as your own —
 * the action sheet only ever teaches you yours.
 */
export default function BannedIsletHands({ playerStates, userIdList, turnOrder, myUserId, activeUserId }: BannedIsletHandsProps) {
    const seats: PlayerHandSeat[] = Object.values(playerStates).map(ps => ({
        userId: ps.userId,
        username: ps.username,
        cardCount: ps.hand.length,
        // Grouped by colour (sortHand) so identical cards sit together rather
        // than in draw order. Keyed by position in the sorted hand: the cards
        // are interchangeable copies (§10 — four Ember Crown cards are four of
        // the same card), so there is no id to key on and the index is what
        // tells two of them apart.
        cards: sortHand(ps.hand).map((card, index) => (
            <BannedIsletCardChip key={`${card}-${index}`} card={card} />
        )),
        note: <RoleNote role={roleDef(ps.role)} />,
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
