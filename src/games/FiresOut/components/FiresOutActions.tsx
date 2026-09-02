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

// The one row shape every action in this sheet renders as — an icon, a
// name/cost pair, and a trailing tag — whether it arms the board for a tap
// (MODE_DEFS), fires immediately (a §11 quick action below), or swaps a
// Specialist card (the crew-change list). Factored once rather than copied
// per call site, the caveman review's own note on this file.
interface BuildRowProps {
    icon?: string;
    name: string;
    cost: string;
    tag: React.ReactNode;
    tagMuted?: boolean;
    disabled?: boolean;
    active?: boolean;
    onClick: () => void;
}

function BuildRow({ icon, name, cost, tag, tagMuted, disabled, active, onClick }: BuildRowProps) {
    return (
        <button
            type="button"
            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}${active ? ' ag-build-row--active' : ''}`}
            disabled={disabled}
            onClick={onClick}
        >
            {icon && <span className="ag-icon-box">{icon}</span>}
            <span className="ag-build-main">
                <span className="ag-build-name">{name}</span>
                <span className="ag-build-cost">{cost}</span>
            </span>
            <span className={`ag-build-tag${tagMuted ? ' ag-build-tag--muted' : ''}`}>{tag}</span>
        </button>
    );
}

interface FiresOutActionsProps {
    apLeft: number;
    bankedAp: number;
    mode: FiresOutBoardMode | null;
    onModeChange: (mode: FiresOutBoardMode | null) => void;
    /** How many board spaces each mode can currently target — 0 disables its row. */
    targetCounts: Record<FiresOutBoardMode, number>;
    /** A revealed victim, or a hazmat, sits on the (possibly directed — see `directingName`) mover's own space, not yet picked up. Null when there's nothing to pick up. */
    carryToggleKind: 'victim' | 'hazmat' | null;
    carryOnMove: boolean;
    onCarryOnMoveChange: (carry: boolean) => void;
    onEndTurn: () => void;
    submitting: boolean;
    endTurnPending: boolean;
    /** §6.1 step 7: Drive, the deck gun and every Specialist ability only exist once vehicles/cards are in play. */
    experienced: boolean;
    specialist: SpecialistId;
    /** §11: set to a teammate's name while a Fire Captain is directing their firefighter instead of moving their own. */
    directingName: string | null;
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
    carryToggleKind, carryOnMove, onCarryOnMoveChange,
    onEndTurn, submitting, endTurnPending, experienced, specialist, directingName,
    showTreat, onTreat, treatPending,
    showDisposeHazmat, onDisposeHazmat, disposeHazmatPending,
    showCrewChange, onCrewChange, crewChangePending,
}: FiresOutActionsProps) {
    // §11 one-shot abilities with no board target — data, the same way
    // MODE_DEFS is, rather than a parallel show*/on*/*Pending prop for every
    // new one that arrives later.
    const quickActions = [
        { key: 'treat', icon: '🩹', name: 'Treat the victim', cost: `${AP_COSTS.treat} AP — they walk alongside instead of being carried`, show: showTreat, onClick: onTreat, pending: treatPending },
        { key: 'disposeHazmat', icon: '☣️', name: 'Remove the hazmat on the spot', cost: `${AP_COSTS.disposeHazmatOnSite} AP`, show: showDisposeHazmat, onClick: onDisposeHazmat, pending: disposeHazmatPending },
    ];

    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>
                {apLeft} AP left{bankedAp > 0 ? ` · ${bankedAp} banked` : ''} — tap an action, then a space on the board.
                {directingName && ` Directing ${directingName}'s move — tap their pill above again to move yourself instead.`}
                {!directingName && specialist === 'fireCaptain' && mode === 'move' && ' Tap a teammate above to direct their move instead.'}
            </p>

            <div className="ag-build-list">
                {MODE_DEFS
                    .filter(def => (experienced || !def.experiencedOnly) && (!def.specialistOnly || def.specialistOnly === specialist))
                    .map(def => {
                        const count = targetCounts[def.mode];
                        const disabled = count === 0;
                        return (
                            <BuildRow
                                key={def.mode}
                                icon={def.icon}
                                name={def.name}
                                cost={def.hint(specialist)}
                                disabled={disabled || submitting}
                                active={mode === def.mode}
                                onClick={() => onModeChange(mode === def.mode ? null : def.mode)}
                                tag={disabled ? 'No targets' : `${count} ${count === 1 ? 'space' : 'spaces'}`}
                                tagMuted={disabled}
                            />
                        );
                    })}

                {quickActions.filter(a => a.show).map(a => (
                    <BuildRow
                        key={a.key}
                        icon={a.icon}
                        name={a.name}
                        cost={a.cost}
                        disabled={submitting}
                        onClick={a.onClick}
                        tag={a.pending ? '…' : 'Go'}
                    />
                ))}
            </div>

            {carryToggleKind && mode === 'move' && (
                <OptionToggleRow
                    title={carryToggleKind === 'victim' ? 'Carry the victim here' : 'Carry the hazmat here'}
                    description="Leave it, or bring it along at 2 AP a space"
                    on={carryOnMove}
                    onToggle={() => onCarryOnMoveChange(!carryOnMove)}
                />
            )}

            {showCrewChange && (
                <>
                    <p className="ag-action-hint">At the Engine — swap Specialist cards for {AP_COSTS.crewChange} AP:</p>
                    <div className="ag-build-list">
                        {SPECIALISTS.filter(s => s.id !== specialist).map(s => (
                            <BuildRow
                                key={s.id}
                                name={s.label}
                                cost={s.ability}
                                disabled={submitting}
                                onClick={() => onCrewChange(s.id)}
                                tag={crewChangePending ? '…' : 'Swap'}
                            />
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
