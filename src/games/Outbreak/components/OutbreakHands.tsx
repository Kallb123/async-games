import React, { useState } from 'react';
import type { IOutbreakPlayerStateResponse } from '@/games/Outbreak/apiModels';
import { roleDef, type OutbreakRoleDef } from '@/games/Outbreak/board';
import OutbreakCardChip from './OutbreakCardChip';
import OutbreakRoleInfoPopup from './OutbreakRoleInfoPopup';

interface OutbreakHandsProps {
    playerStates: { [userId: string]: IOutbreakPlayerStateResponse };
    /** Player seats in turn order (userIds). */
    userIdList: string[];
    myUserId: string;
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
 */
export default function OutbreakHands({ playerStates, userIdList, myUserId, onCardTap, highlightedCityId = null }: OutbreakHandsProps) {
    const [infoRole, setInfoRole] = useState<OutbreakRoleDef | null>(null);

    return (
        <>
            {infoRole && <OutbreakRoleInfoPopup role={infoRole} onClose={() => setInfoRole(null)} />}
            {userIdList.map(userId => {
                const ps = playerStates[userId];
                if (!ps) return null;
                const isMe = userId === myUserId;
                const role = roleDef(ps.role);
                const cardCount = ps.hand.length + (ps.contingencyCard !== null ? 1 : 0);

                return (
                    <div className="ag-hand" key={userId}>
                        <div className="ag-hand-head">
                            <span className="ag-hand-title">
                                {isMe ? 'Your hand' : `${ps.username}’s hand`} · {cardCount} card{cardCount !== 1 ? 's' : ''}
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
