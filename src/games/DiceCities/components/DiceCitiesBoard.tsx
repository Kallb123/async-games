import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import {
    ACTIVATION_META,
    Activation,
    activationFor,
    rollLabel,
    yieldLabel,
} from "@/games/DiceCities/ui";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";

interface DiceCitiesBoardProps {
    /** The city being shown — usually the viewer's own. */
    playerState: IDiceCitiesPlayerStateResponse;
    /** Name to caption the tableau ("Your city" when it's the viewer's). */
    ownerLabel: string;
    /**
     * Fold this city away behind its own header. Set for everyone but the
     * viewer, whose city is always open where it has always been.
     */
    collapsible?: boolean;
}

/**
 * One player's city: the grid of establishments they own, colour-coded by when
 * each one pays out. The landmark track above the stack is shared by the whole
 * table and belongs to `DiceCitiesLandmarkTrack`.
 *
 * Presentational — every interactive control lives in DiceCitiesActions, bar
 * the tap-to-read on each card, which ZoomableCardArt owns.
 *
 * An opponent's city is a native `<details>`, whose `<summary>` is this same
 * header: nothing about the collapsed row has to be written twice, or kept in
 * step with the panel it opens. Being closed by default costs no state, so
 * whose city is open is the browser's business rather than the page's, and any
 * number of them can be open at once. See docs/games/dice-cities.md §11.5.
 */
export default function DiceCitiesBoard({ playerState, ownerLabel, collapsible = false }: DiceCitiesBoardProps) {
    // Establishments = every card the player owns, sorted by the number that
    // triggers them so the city reads left-to-right like the dice. The four
    // win-condition landmarks are tracked by flags (never in `cards`), so this
    // list is just regular establishments plus any purple majors bought.
    const establishments = [...playerState.cards]
        .filter((cc) => cc.amount > 0)
        .sort((a, b) => DiceCitiesCards[a.card].rollNumber[0] - DiceCitiesCards[b.card].rollNumber[0]);
    const establishmentCount = establishments.reduce((n, cc) => n + cc.amount, 0);

    const head = (
        <>
            <span className="ag-dc-city-title">
                {ownerLabel} · {establishmentCount} establishment{establishmentCount === 1 ? "" : "s"}
            </span>
            {/* The colour key is worth printing once, on the viewer's own city.
                A collapsed opponent wants the chevron in that corner instead. */}
            {collapsible ? (
                <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span>
            ) : (
                <span className="ag-dc-legend">
                    {(["any", "you", "steal"] as Activation[]).map((k) => (
                        <span key={k} className="ag-dc-legend-item">
                            <span className="ag-dc-legend-dot" style={{ background: ACTIVATION_META[k].color }} />
                            {ACTIVATION_META[k].label}
                        </span>
                    ))}
                </span>
            )}
        </>
    );

    const grid = (
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
    );

    if (collapsible) {
        return (
            <details className="ag-disclosure ag-dc-city">
                <summary className="ag-dc-city-head">{head}</summary>
                {grid}
            </details>
        );
    }

    return (
        <div className="ag-dc-city">
            <div className="ag-dc-city-head">{head}</div>
            {grid}
        </div>
    );
}
