import React, { useState } from 'react';
import type { IOutbreakPlayerStateResponse } from '@/games/Outbreak/apiModels';
import { roleDef, type OutbreakRoleDef } from '@/games/Outbreak/board';
import { playerColourForId } from '@/utils/ui/playerColours';
import { seatOrderFrom } from '@/utils/ui/players';
import OutbreakCardChip from './OutbreakCardChip';
import OutbreakRoleInfoPopup from './OutbreakRoleInfoPopup';

interface OutbreakHandsProps {
    playerStates: { [userId: string]: IOutbreakPlayerStateResponse };
    /** Every player id, in the app's stable seat order (join order) — not
     *  necessarily turn order. Only drives each seat's colour dot, so it
     *  matches the pawn colours on the board and the scoreboard. */
    userIdList: string[];
    /** Player seats in the real turn order (`gameState.turnOrder`), drawn at
     *  random at setup and not necessarily the same as userIdList. Drives
     *  seating and the "now"/"next" markers below. */
    turnOrder: string[];
    myUserId: string;
    /** Whose turn the board is showing — the turn under review, not
     *  necessarily the live one, and null once the game is over. Drives the
     *  "now"/"next" markers. */
    activeUserId: string | null;
    /** Tapping a city card rings that city on the board. */
    onCardTap?: (cityId: number) => void;
    highlightedCityId?: number | null;
}

/**
 * Every player's hand, rendered for everyone — §2's "shared table, shared
 * brain" pillar means the board itself shows what everyone is holding, so a
 * teammate never has to be *told* (§21.6 step 11). The game does now have a chat
 * window like every other one (see docs/in-game-chat.md §9), but that pillar is
 * untouched: the board's job is to make coordinating over your hand unnecessary,
 * not to stop the table talking. One `ag-hand` panel per seat, the same wrapper
 * Settlements & Cities and Train Time use for a single "your hand" — looped,
 * since a co-op table needs every hand at once.
 *
 * The stack reads from the viewer outwards: your own hand heads the list and
 * carries the `--me` tint, then the seats that play after you, so finding your
 * cards never means hunting the middle of the list. Whose turn it is travels
 * with the seat instead of the position (the top scoreboard is long off-screen
 * by the time you have scrolled down here), so each panel says so itself.
 */
export default function OutbreakHands({
    playerStates,
    userIdList,
    turnOrder,
    myUserId,
    activeUserId,
    onCardTap,
    highlightedCityId = null,
}: OutbreakHandsProps) {
    const [infoRole, setInfoRole] = useState<OutbreakRoleDef | null>(null);

    // Turn markers and seating follow the real turn order, not userIdList's
    // join order (they need not match — see the prop docs above).
    const activeSeat = activeUserId ? turnOrder.indexOf(activeUserId) : -1;
    const nextUserId = activeSeat >= 0 && turnOrder.length > 1
        ? turnOrder[(activeSeat + 1) % turnOrder.length]
        : null;

    return (
        <>
            {infoRole && <OutbreakRoleInfoPopup role={infoRole} onClose={() => setInfoRole(null)} />}
            {seatOrderFrom(turnOrder, myUserId).map(userId => {
                const ps = playerStates[userId];
                if (!ps) return null;
                const isMe = userId === myUserId;
                const isActive = userId === activeUserId;
                const role = roleDef(ps.role);
                const cardCount = ps.hand.length + (ps.contingencyCard !== null ? 1 : 0);

                return (
                    <div className={`ag-hand${isMe ? ' ag-hand--me' : ''}${isActive ? ' ag-hand--active' : ''}`} key={userId}>
                        <div className="ag-hand-head">
                            <span className="ag-hand-title">
                                <span className="ag-hand-dot" style={{ background: playerColourForId(userId, userIdList) }} />
                                {isMe ? 'Your hand' : `${ps.username}’s hand`} · {cardCount} card{cardCount !== 1 ? 's' : ''}
                                {isActive && <span className="ag-tag">Playing now</span>}
                                {!isActive && userId === nextUserId && <span className="ag-tag ag-tag--quiet">Up next</span>}
                            </span>
                            {role && (
                                <button
                                    type="button"
                                    className="ag-hand-note"
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                    onClick={() => setInfoRole(role)}
                                >
                                    {role.name} ⓘ
                                </button>
                            )}
                        </div>
                        <div className="ag-hand-cards ag-hand-cards--wrap">
                            {cardCount === 0
                                ? <span className="ag-hand-note">No cards.</span>
                                : (
                                    <>
                                        {ps.hand.map(cardId => (
                                            <OutbreakCardChip
                                                key={cardId}
                                                cardId={cardId}
                                                onTap={onCardTap}
                                                highlighted={cardId === highlightedCityId}
                                            />
                                        ))}
                                        {ps.contingencyCard !== null && <OutbreakCardChip cardId={ps.contingencyCard} stored />}
                                    </>
                                )}
                        </div>
                    </div>
                );
            })}
        </>
    );
}
