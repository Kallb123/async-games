import { isWarband, squadHp, type BattleState } from '../rules';

/** The team and currently visible enemy squads, using the same HP totals as the scoreboard. */
export default function RealmArenaTeamHealth({ battle }: { battle: BattleState }) {
    return <div className="ag-stat ag-ra-team-health">
        {[false, true].map(enemy => {
            const hp = squadHp(battle.fighters.filter(fighter => isWarband(fighter.owner) === enemy), battle);
            const label = enemy ? 'Enemies in sight' : 'Team';
            return <div key={label}>
                <span className="ag-stat-label">{label} · {hp.remaining}/{hp.total} HP</span>
                <meter aria-label={`${label} health`} min={0} max={hp.total || 1} value={hp.remaining} />
            </div>;
        })}
    </div>;
}
