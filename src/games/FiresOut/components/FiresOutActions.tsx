'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import OptionToggleRow from '@/components/ui/OptionToggleRow';
import { AP_COSTS } from '@/games/FiresOut/rules';

export type FiresOutBoardMode = 'move' | 'door' | 'extinguish' | 'chop';

const MODE_DEFS: { mode: FiresOutBoardMode; icon: string; name: string; hint: string }[] = [
    { mode: 'move', icon: '🚶', name: 'Move', hint: `${AP_COSTS.move} AP (${AP_COSTS.moveIntoFire} into fire, ${AP_COSTS.carryPerSpace}/space carrying)` },
    { mode: 'door', icon: '🚪', name: 'Open / close a door', hint: `${AP_COSTS.door} AP` },
    { mode: 'extinguish', icon: '💧', name: 'Extinguish', hint: `${AP_COSTS.extinguish} AP` },
    { mode: 'chop', icon: '🪓', name: 'Chop a wall', hint: `${AP_COSTS.chop} AP` },
];

interface FiresOutActionsProps {
    apLeft: number;
    bankedAp: number;
    mode: FiresOutBoardMode | null;
    onModeChange: (mode: FiresOutBoardMode | null) => void;
    /** How many board spaces each mode can currently target — 0 disables its row. */
    targetCounts: Record<FiresOutBoardMode, number>;
    /** A revealed victim sits on the firefighter's own space, not yet picked up. */
    showCarryToggle: boolean;
    carryOnMove: boolean;
    onCarryOnMoveChange: (carry: boolean) => void;
    onEndTurn: () => void;
    submitting: boolean;
    endTurnPending: boolean;
}

/**
 * The AP-spend picker (§8): one row per action, each showing what it costs
 * and how many spaces it can currently reach — tapping a row arms the board
 * (FiresOutBoard highlights the legal targets; a tap there submits the
 * command). There's no second decision point inside a row the way Outbreak's
 * move types need one, so this is a plain list, not per-mode sub-sheets.
 */
export default function FiresOutActions({
    apLeft, bankedAp, mode, onModeChange, targetCounts,
    showCarryToggle, carryOnMove, onCarryOnMoveChange,
    onEndTurn, submitting, endTurnPending,
}: FiresOutActionsProps) {
    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>
                {apLeft} AP left{bankedAp > 0 ? ` · ${bankedAp} banked` : ''} — tap an action, then a space on the board.
            </p>

            <div className="ag-build-list">
                {MODE_DEFS.map(def => {
                    const count = targetCounts[def.mode];
                    const disabled = count === 0;
                    const active = mode === def.mode;
                    return (
                        <button
                            key={def.mode}
                            type="button"
                            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}${active ? ' ag-build-row--active' : ''}`}
                            disabled={disabled || submitting}
                            onClick={() => onModeChange(active ? null : def.mode)}
                        >
                            <span className="ag-icon-box">{def.icon}</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{def.name}</span>
                                <span className="ag-build-cost">{def.hint}</span>
                            </span>
                            {disabled
                                ? <span className="ag-build-tag ag-build-tag--muted">No targets</span>
                                : <span className="ag-build-tag">{count} {count === 1 ? 'space' : 'spaces'}</span>}
                        </button>
                    );
                })}
            </div>

            {showCarryToggle && mode === 'move' && (
                <OptionToggleRow
                    title="Carry the victim here"
                    description="Leave them, or bring them along at 2 AP a space"
                    on={carryOnMove}
                    onToggle={() => onCarryOnMoveChange(!carryOnMove)}
                />
            )}

            <ActionButton
                className="ag-btn ag-btn--primary ag-btn--block"
                onClick={onEndTurn}
                disabled={submitting}
                pending={endTurnPending}
                pendingLabel="Ending turn…"
            >
                🔔 End turn
            </ActionButton>
        </div>
    );
}
