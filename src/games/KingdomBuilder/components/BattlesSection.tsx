'use client'

import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";

import { subtractUnits, unitCount } from "../armies";
import type { KingdomBuilderBattleReport } from "../battleReports";
import { formatUnits, type KingdomBuilderGarrison } from "../units";
import type { KingdomBuilderWorldView } from "../worldView";

interface BattlesSectionProps {
    view: KingdomBuilderWorldView;
    /** What the map calls a node — "Your town", "Open site", "Forest". */
    placeName: (nodeId: string) => string;
}

const OUTCOMES: Record<KingdomBuilderBattleReport["outcome"], string> = { won: "Won", lost: "Lost", held: "Stand-off" };

const unitsOrNone = (units: Partial<KingdomBuilderGarrison>) => unitCount(units) > 0 ? formatUnits(units) : "nothing";

function titleOf(report: KingdomBuilderBattleReport, place: string): string {
    if (report.kind === "barbarian") return "Your attack on a barbarian village";
    if (report.kind === "push") return report.started ? `Your attack on ${place}` : "An attack on your town";
    return report.started ? "Your sally out" : `A sally against your siege of ${place}`;
}

/**
 * The player's latest battles (GDD §7.6), from either side — the ones they
 * started, and the ones fought against them while they were away — each with
 * what went in, what was lost, and the fight round by round. Hidden until
 * there has been one.
 */
export default function BattlesSection({ view, placeName }: BattlesSectionProps) {
    return (
        <ListSection label="Battles" isLoading={false} skeletonRows={0}
            hint="Battles are fought out over up to six rounds, both sides striking at once. Militia stop cavalry, cavalry ride down infantry, and infantry break militia. An army at a barbarian village fights it every tick until one side is gone.">
            {view.battles.map(report => (
                <ListRow key={report.battleId} icon={report.started ? "⚔️" : "🛡️"}
                    title={titleOf(report, placeName(report.nodeId))}
                    action={<span className="ag-tag ag-tag--quiet">{OUTCOMES[report.outcome]}</span>}
                    sub={<>
                        Tick {report.tick} · you sent {unitsOrNone(report.sent)} against {unitsOrNone(report.faced)}.
                        {" "}You lost {unitsOrNone(subtractUnits(report.sent, report.left))}; they lost {unitsOrNone(subtractUnits(report.faced, report.faceLeft))}.
                        {report.rounds.length > 0 && <details className="ag-disclosure">
                            <summary className="ag-hint">Round by round <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span></summary>
                            <ol className="ag-hint">
                                {report.rounds.map((round, number) => (
                                    <li key={number}>{round.lost && <>You lost {unitsOrNone(round.lost)}; </>}{round.lost ? "they" : "They"} lost {unitsOrNone(round.killed)}.</li>
                                ))}
                            </ol>
                        </details>}
                    </>} />
            ))}
        </ListSection>
    );
}
