import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import {
    ACTIVATION_META,
    Activation,
    activationFor,
    buildableLandmarks,
    rollLabel,
    yieldLabel,
} from "@/games/DiceCities/ui";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";

interface DiceCitiesBoardProps {
    /** The city being shown — usually the viewer's own. */
    playerState: IDiceCitiesPlayerStateResponse;
    /** Name to caption the tableau ("Your city" when it's the viewer's). */
    ownerLabel: string;
    /** Docks games add the Harbour to the landmark track. */
    enabledDocks: boolean;
}

/**
 * A player's city tableau: the landmark track (build all four to win) above the
 * grid of establishments they own, colour-coded by when each one pays out.
 * Presentational — every interactive control lives in DiceCitiesActions, bar
 * the tap-to-read on each card, which ZoomableCardArt owns.
 */
export default function DiceCitiesBoard({ playerState, ownerLabel, enabledDocks }: DiceCitiesBoardProps) {
    // Establishments = every card the player owns, sorted by the number that
    // triggers them so the city reads left-to-right like the dice. The four
    // win-condition landmarks are tracked by flags (never in `cards`), so this
    // list is just regular establishments plus any purple majors bought.
    const establishments = [...playerState.cards]
        .filter((cc) => cc.amount > 0)
        .sort((a, b) => DiceCitiesCards[a.card].rollNumber[0] - DiceCitiesCards[b.card].rollNumber[0]);
    const establishmentCount = establishments.reduce((n, cc) => n + cc.amount, 0);

    return (
        <div className="ag-board-area ag-dc-area">
            {/* ── Landmark track ─────────────────────────────────────────── */}
            <div className="ag-dc-landmarks">
                <div className="ag-dc-landmarks-head">
                    Landmarks · build all 4 to win{enabledDocks ? " · the Harbour is a bonus" : ""}
                </div>
                <div className="ag-dc-landmark-row">
                    {buildableLandmarks(enabledDocks).map(({ cardId, flag }) => {
                        const card = DiceCitiesCards[cardId];
                        const built = Boolean(playerState[flag]);
                        return (
                            <div
                                key={cardId}
                                className={`ag-dc-landmark${built ? " ag-dc-landmark--built" : ""}`}
                            >
                                <ZoomableCardArt card={card} className="ag-dc-landmark-icon" />
                                <div className="ag-dc-landmark-name">{card.title}</div>
                                <div className="ag-dc-landmark-cost">{built ? "✓ built" : `${card.cost}🪙`}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Establishments ─────────────────────────────────────────── */}
            <div className="ag-dc-city">
                <div className="ag-dc-city-head">
                    <span className="ag-dc-city-title">
                        {ownerLabel} · {establishmentCount} establishment{establishmentCount === 1 ? "" : "s"}
                    </span>
                    <span className="ag-dc-legend">
                        {(["any", "you", "steal"] as Activation[]).map((k) => (
                            <span key={k} className="ag-dc-legend-item">
                                <span className="ag-dc-legend-dot" style={{ background: ACTIVATION_META[k].color }} />
                                {ACTIVATION_META[k].label}
                            </span>
                        ))}
                    </span>
                </div>
                <div className="ag-dc-grid">
                    {establishments.map((cc) => {
                        const card = DiceCitiesCards[cc.card];
                        const color = ACTIVATION_META[activationFor(card)].color;
                        return (
                            <div
                                key={cc.card}
                                className="ag-dc-est"
                                style={{ borderTopColor: color }}
                            >
                                <span className="ag-dc-est-roll">{rollLabel(card)}</span>
                                {cc.amount > 1 && <span className="ag-dc-est-count">×{cc.amount}</span>}
                                <ZoomableCardArt card={card} className="ag-dc-est-icon" />
                                <div className="ag-dc-est-name">{card.title}</div>
                                <div className="ag-dc-est-yield">{yieldLabel(card)}</div>
                            </div>
                        );
                    })}
                    {establishments.length === 0 && (
                        <div className="ag-dc-city-empty">No establishments yet — roll and build one.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
