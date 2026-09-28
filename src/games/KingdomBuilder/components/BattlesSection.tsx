'use client'

import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";

import { formatCaravans, subtractUnits, unitCount } from "../armies";
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

/** "2 caravans and their load and 1 settler" — whatever changed hands in a raid, or off a fallen escort, and any commander killed with them. */
function changedHands(caravans = 0, settlers = 0, commanders = 0): string {
    return [
        caravans ? `${formatCaravans(caravans)} and ${caravans === 1 ? "its" : "their"} load` : "",
        settlers ? `${settlers} settler${settlers === 1 ? "" : "s"}` : "",
        commanders ? `${commanders} commander${commanders === 1 ? "" : "s"}, killed` : "",
    ].filter(Boolean).join(" and ");
}

function titleOf(report: KingdomBuilderBattleReport, place: string | undefined): string {
    if (report.kind === "barbarian") return "Your attack on a barbarian village";
    const where = place ? ` at ${place}` : " on the road";
    if (report.kind === "raid") {
        const what = [report.caravansTaken || report.caravansLost ? "caravans" : "", report.settlersTaken || report.settlersLost ? "settlers" : ""]
            .filter(Boolean).join(" and ");
        // Nothing taken is a raid that only killed commanders (§6.5) — which the taker isn't told of.
        if (!what) return report.started ? `An unguarded party cut down${where}` : `Your commander${report.commandersLost === 1 ? "" : "s"}, killed${where}`;
        return report.started ? `${what[0].toUpperCase()}${what.slice(1)} taken${where}` : `Your ${what}, taken${where}`;
    }
    if (report.kind === "skirmish") {
        if (report.started) return report.outcome === "won" ? `Rival scouts beaten${where}` : `Rival scouts fought${where}`;
        return report.outcome === "lost" ? `Your scouts beaten${where}` : `Your scouts attacked${where}`;
    }
    if (report.kind === "push") return report.started ? `Your attack on ${place}` : "An attack on your town";
    return report.started ? "Your sally out" : `A sally against your siege of ${place}`;
}

/** What went in and what was lost — or, for a raid nobody fought, only what changed hands. */
function detailOf(report: KingdomBuilderBattleReport): string {
    const took = changedHands(report.caravansTaken, report.settlersTaken);
    const gone = changedHands(report.caravansLost, report.settlersLost, report.commandersLost);
    const taken = took ? ` You took ${took}.` : "";
    const lost = gone ? ` You lost ${gone}.` : "";
    if (report.kind === "raid") {
        return report.started
            ? `Tick ${report.tick} · your ${unitsOrNone(report.sent)} came on ${report.caravansTaken ? "caravans" : report.settlersTaken ? "settlers" : "a rival party"} with no escort.${taken}`
            : `Tick ${report.tick} · a rival's army came on them with no escort.${lost}`;
    }
    return `Tick ${report.tick} · you sent ${unitsOrNone(report.sent)} against ${unitsOrNone(report.faced)}.`
        + ` You lost ${unitsOrNone(subtractUnits(report.sent, report.left))}; they lost ${unitsOrNone(subtractUnits(report.faced, report.faceLeft))}.${taken}${lost}`;
}

/**
 * The player's latest battles (GDD §7.6), from either side — the ones they
 * started, and the ones fought against them while they were away — each with
 * what went in, what was lost, and the fight casualty by casualty. Hidden until
 * there has been one.
 */
export default function BattlesSection({ view, placeName }: BattlesSectionProps) {
    return (
        <ListSection label="Battles" isLoading={false} skeletonRows={0}
            hint="Battles open with defending archers, who target spearmen. Attacking horsemen charge next, but opposing spearmen intercept them before they hit; then the remaining spearmen, militia and infantry fight with defenders first. An army at a barbarian village fights it every tick until one side is gone. Caravans and settlers with no escort are taken by any rival army that meets them, and commanders with no escort are killed. Scouts are cheap, not safe: a rival army with soldiers fights any it meets, and takes whatever they guarded once the last scout falls. An escort that falls leaves its caravans to whoever beat it.">
            {view.battles.map(report => (
                <ListRow key={report.battleId} icon={report.started ? "⚔️" : "🛡️"}
                    title={titleOf(report, report.nodeId === undefined ? undefined : placeName(report.nodeId))}
                    action={<span className="ag-tag ag-tag--quiet">{OUTCOMES[report.outcome]}</span>}
                    sub={<>
                        {detailOf(report)}
                        {report.rounds.length > 0 && <details className="ag-disclosure">
                            <summary className="ag-hint">Casualty by casualty <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span></summary>
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
