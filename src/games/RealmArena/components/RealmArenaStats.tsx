'use client'
import type { RulesContext } from "@/games/RealmArena/rulesets";
import React from 'react';
import InfoModal from '@/components/ui/InfoModal';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { ALL_UNITS, STATS_FOOTNOTE, statsFootnote, unitStats, type ActionStats, type UnitRef, type UnitStats } from '@/games/RealmArena/stats';

/** One row of a `StatsTable`: a name with a line under it, a cell per column, and a note on a row of its own. */
interface StatsRow {
    key: string;
    name: string;
    sub?: string;
    cells: readonly string[];
    note?: string;
}

/**
 * A table of stats on the result screen's chart-table look: a row per thing,
 * its name leading, and — for an action — a line under the row for what else
 * it does. Both the per-unit action tables and the admin screen's
 * side-by-side table are this.
 */
function StatsTable({ head, columns, rows }: { head: string; columns: readonly string[]; rows: readonly StatsRow[] }) {
    return (
        <div className="ag-chart-table-wrap">
            <table className="ag-chart-table">
                <thead>
                    <tr>
                        <th>{head}</th>
                        {columns.map(label => <th key={label}>{label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <React.Fragment key={row.key}>
                            <tr className={row.note ? 'ag-ra-stats-noted' : undefined}>
                                <td className="ag-ra-stats-name">
                                    {row.name}
                                    {row.sub && <div className="ag-ra-stats-kind">{row.sub}</div>}
                                </td>
                                {row.cells.map((cell, i) => <td key={columns[i]}>{cell}</td>)}
                            </tr>
                            {row.note && (
                                <tr>
                                    <td className="ag-ra-stats-note" colSpan={columns.length + 1}>{row.note}</td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** The numbers each action's row gives, headed short enough to fit a phone. */
const ACTION_COLUMNS = [['ap', 'AP'], ['damage', 'Dmg'], ['range', 'Range'], ['hit', 'Hit'], ['cooldown', 'CD']] as const satisfies readonly [keyof ActionStats, string][];

function ActionsTable({ actions }: { actions: readonly ActionStats[] }) {
    return (
        <StatsTable
            head="Action"
            columns={ACTION_COLUMNS.map(([, label]) => label)}
            rows={actions.map(action => ({
                key: action.key,
                name: action.name,
                sub: action.kind,
                cells: ACTION_COLUMNS.map(([field]) => action[field]),
                note: [...action.extras, action.description].filter(Boolean).join(' · '),
            }))}
        />
    );
}

/**
 * Everything there is to know about one character or item before buying it:
 * its headline numbers as `Stat` tiles, what it's for, and the table of what
 * it does — and, for a character, of the options mastery can swap in
 * (§23.2). The muster's info card and the admin balance screen both show it.
 */
function RealmArenaUnitStats({ stats }: { stats: UnitStats }) {
    const { summary, tiles, actions, options } = stats;
    return (
        <>
            <div className="ag-info-section">
                <div className="ag-stat-row">
                    {tiles.map(tile => <Stat key={tile.label} value={tile.value} label={tile.label} />)}
                </div>
                <p className="ag-hint ag-hint--tight">{summary}</p>
                <ActionsTable actions={actions} />
            </div>
            {options.length > 0 && (
                <div className="ag-info-section">
                    <div className="ag-info-section-title">Mastery options</div>
                    <ActionsTable actions={options} />
                </div>
            )}
        </>
    );
}

interface RealmArenaUnitInfoProps {
    context?: RulesContext;
    unit: UnitRef;
    onClose: () => void;
}

/** The muster's info card for one character or item: its stats, and the fine print the numbers leave out. */
export default function RealmArenaUnitInfo({ unit, onClose, context }: RealmArenaUnitInfoProps) {
    const stats = unitStats(unit, context);
    return (
        <InfoModal title={stats.name} onClose={onClose} closeLabel="Close">
            <RealmArenaUnitStats stats={stats} />
            <p className="ag-hint ag-hint--tight">{statsFootnote(context)}</p>
        </InfoModal>
    );
}

/**
 * Every character and item at once, for balancing (docs/admin-tools.md): the
 * characters' headline numbers side by side in one table, then each sheet the
 * muster's info card shows, one after another.
 */
export function RealmArenaStatsSheet() {
    const units = ALL_UNITS.map(unit => ({ unit, stats: unitStats(unit) }));
    const characters = units.filter(({ unit }) => unit.kind === 'character');
    const labels = [...new Set(characters.flatMap(({ stats }) => stats.tiles.map(tile => tile.label)))];
    return (
        <>
            <Section label="Characters side by side">
                <StatsTable
                    head="Character"
                    columns={labels}
                    rows={characters.map(({ unit, stats }) => ({
                        key: unit.id,
                        name: stats.name,
                        cells: labels.map(label => stats.tiles.find(tile => tile.label === label)?.value ?? '—'),
                    }))}
                />
                <p className="ag-hint ag-hint--tight">{STATS_FOOTNOTE}</p>
            </Section>
            {units.map(({ unit, stats }) => (
                <Section key={unit.id} label={stats.name}>
                    <RealmArenaUnitStats stats={stats} />
                </Section>
            ))}
        </>
    );
}
