'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import OptionToggleRow from '@/components/ui/OptionToggleRow';
import { AP_COSTS, chopApCost, deckGunApCost, extinguishApCost, SPECIALISTS, SpecialistId } from '@/games/FiresOut/rules';

export type FiresOutBoardMode = 'move' | 'door' | 'extinguish' | 'chop' | 'drive' | 'deckGun' | 'reveal';

interface ModeDef {
    mode: FiresOutBoardMode;
    icon: string;
    name: string;
    hint: (specialist: SpecialistId) => string;
    experiencedOnly?: boolean;
    /** Only this specialist can use the row at all (§11) — hidden from everyone else, not just disabled. */
    specialistOnly?: SpecialistId;
}

const MODE_DEFS: ModeDef[] = [
    { mode: 'move', icon: '🚶', name: 'Move', hint: () => `${AP_COSTS.move} AP (${AP_COSTS.moveIntoFire} into fire, ${AP_COSTS.carryPerSpace}/space carrying)` },
    { mode: 'door', icon: '🚪', name: 'Open / close a door', hint: () => `${AP_COSTS.door} AP` },
    { mode: 'extinguish', icon: '💧', name: 'Extinguish', hint: s => `${extinguishApCost({ specialist: s })} AP` },
    { mode: 'chop', icon: '🪓', name: 'Chop a wall', hint: s => `${chopApCost({ specialist: s })} AP` },
    // §12, §17.6 step 9 — Experienced only (§6.1 step 7 sets vehicles aside
    // in the Family game).
    { mode: 'drive', icon: '🚒', name: 'Drive', hint: () => `${AP_COSTS.drive} AP — from the Engine or Ambulance`, experiencedOnly: true },
    { mode: 'deckGun', icon: '💦', name: 'Fire the deck gun', hint: s => `${deckGunApCost({ specialist: s })} AP — from the Engine, into a quadrant with no one in it`, experiencedOnly: true },
    // §11, §17.6 step 10 — Imaging Technician only.
    { mode: 'reveal', icon: '📡', name: 'Reveal a POI remotely', hint: () => `${AP_COSTS.reveal} AP — anywhere on the board`, experiencedOnly: true, specialistOnly: 'imagingTechnician' },
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
    /** §6.1 step 7: Drive, the deck gun and every Specialist ability only exist once vehicles/cards are in play. */
    experienced: boolean;
    specialist: SpecialistId;
    /** §11 Paramedic: a revealed victim sits on their own space, untreated. */
    showTreat: boolean;
    onTreat: () => void;
    treatPending: boolean;
    /** §11 Hazmat Technician: a hazmat sits on their own space. */
    showDisposeHazmat: boolean;
    onDisposeHazmat: () => void;
    disposeHazmatPending: boolean;
    /** §8: swappable at the Engine for 2 AP. */
    showCrewChange: boolean;
    onCrewChange: (specialist: SpecialistId) => void;
    crewChangePending: boolean;
}

/**
 * The AP-spend picker (§8): one row per action, each showing what it costs
 * and how many spaces it can currently reach — tapping a row arms the board
 * (FiresOutBoard highlights the legal targets; a tap there submits the
 * command). There's no second decision point inside a row the way Outbreak's
 * move types need one, so this is a plain list, not per-mode sub-sheets.
 * Treat, dispose-on-site and crew change (§11, §17.6 step 10) target the
 * firefighter's own space or nothing at all, so they submit immediately
 * rather than arming the board for a tap that has only one possible target.
 */
export default function FiresOutActions({
    apLeft, bankedAp, mode, onModeChange, targetCounts,
    showCarryToggle, carryOnMove, onCarryOnMoveChange,
    onEndTurn, submitting, endTurnPending, experienced, specialist,
    showTreat, onTreat, treatPending,
    showDisposeHazmat, onDisposeHazmat, disposeHazmatPending,
    showCrewChange, onCrewChange, crewChangePending,
}: FiresOutActionsProps) {
    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>
                {apLeft} AP left{bankedAp > 0 ? ` · ${bankedAp} banked` : ''} — tap an action, then a space on the board.
            </p>

            <div className="ag-build-list">
                {MODE_DEFS
                    .filter(def => (experienced || !def.experiencedOnly) && (!def.specialistOnly || def.specialistOnly === specialist))
                    .map(def => {
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
                                    <span className="ag-build-cost">{def.hint(specialist)}</span>
                                </span>
                                {disabled
                                    ? <span className="ag-build-tag ag-build-tag--muted">No targets</span>
                                    : <span className="ag-build-tag">{count} {count === 1 ? 'space' : 'spaces'}</span>}
                            </button>
                        );
                    })}

                {showTreat && (
                    <button type="button" className="ag-build-row" disabled={submitting} onClick={onTreat}>
                        <span className="ag-icon-box">🩹</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">Treat the victim</span>
                            <span className="ag-build-cost">{AP_COSTS.treat} AP — they walk alongside instead of being carried</span>
                        </span>
                        <span className="ag-build-tag">{treatPending ? '…' : 'Go'}</span>
                    </button>
                )}

                {showDisposeHazmat && (
                    <button type="button" className="ag-build-row" disabled={submitting} onClick={onDisposeHazmat}>
                        <span className="ag-icon-box">☣️</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">Remove the hazmat on the spot</span>
                            <span className="ag-build-cost">{AP_COSTS.disposeHazmatOnSite} AP</span>
                        </span>
                        <span className="ag-build-tag">{disposeHazmatPending ? '…' : 'Go'}</span>
                    </button>
                )}
            </div>

            {showCarryToggle && mode === 'move' && (
                <OptionToggleRow
                    title="Carry the victim here"
                    description="Leave them, or bring them along at 2 AP a space"
                    on={carryOnMove}
                    onToggle={() => onCarryOnMoveChange(!carryOnMove)}
                />
            )}

            {showCrewChange && (
                <>
                    <p className="ag-action-hint">At the Engine — swap Specialist cards for {AP_COSTS.crewChange} AP:</p>
                    <div className="ag-build-list">
                        {SPECIALISTS.filter(s => s.id !== specialist).map(s => (
                            <button
                                key={s.id}
                                type="button"
                                className="ag-build-row"
                                disabled={submitting}
                                onClick={() => onCrewChange(s.id)}
                            >
                                <span className="ag-build-main">
                                    <span className="ag-build-name">{s.label}</span>
                                    <span className="ag-build-cost">{s.ability}</span>
                                </span>
                                <span className="ag-build-tag">{crewChangePending ? '…' : 'Swap'}</span>
                            </button>
                        ))}
                    </div>
                </>
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
