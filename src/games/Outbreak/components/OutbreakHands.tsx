import React, { useState } from 'react';
import type { IOutbreakPlayerStateResponse } from '@/games/Outbreak/apiModels';
import { roleDef, type OutbreakRoleDef } from '@/games/Outbreak/board';
import { playerColourForId } from '@/utils/ui/playerColours';
import { seatOrderFrom } from '@/utils/ui/players';
import OutbreakCardChip from './OutbreakCardChip';
import OutbreakRoleInfoPopup from './OutbreakRoleInfoPopup';

interface OutbreakHandsProps {
    playerStates: { [userId: string]: IOutbreakPlayerStateResponse };
    /** Player seats in turn order (userIds). */
    userIdList: string[];
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
 * brain" pillar means there is no chat window telling teammates what you're
 * holding, so the board has to (§21.6 step 11). One `ag-hand` panel per seat,
 * the same wrapper Settlements & Cities and Train Time use for a single
 * "your hand" — looped, since a co-op table needs every hand at once.
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
    myUserId,
    activeUserId,
    onCardTap,
    highlightedCityId = null,
}: OutbreakHandsProps) {
    const [infoRole, setInfoRole] = useState<OutbreakRoleDef | null>(null);

    // Turn markers follow the real seating order, whatever order the panels
    // are drawn in — the seat after the current one, wrapping at the table.
    const activeSeat = activeUserId ? userIdList.indexOf(activeUserId) : -1;
    const nextUserId = activeSeat >= 0 && userIdList.length > 1
        ? userIdList[(activeSeat + 1) % userIdList.length]
        : null;

    return (
        <>
            {infoRole && <OutbreakRoleInfoPopup role={infoRole} onClose={() => setInfoRole(null)} />}
            {seatOrderFrom(userIdList, myUserId).map(userId => {
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
