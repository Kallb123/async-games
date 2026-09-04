import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import {
    ACTIVATION_META,
    Activation,
    activationFor,
    buildableLandmarks,
    LANDMARKS,
    rollLabel,
    yieldLabel,
} from "@/games/DiceCities/ui";
import { DiceCitiesCardIds } from "@/games/DiceCities/cards";
import type { DiceCitiesTheme } from "@/games/DiceCities/themes";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";
import { capitalise, pluralize } from "@/utils/ui/text";
import type { CSSProperties } from "react";

interface DiceCitiesBoardProps {
    /** The city being shown — usually the viewer's own. */
    playerState: IDiceCitiesPlayerStateResponse;
    /** Name to caption the tableau ("Your city" when it's the viewer's). */
    ownerLabel: string;
    /** Docks games add the Harbour to the landmark track. */
    enabledDocks: boolean;
    /**
     * The theme this game is played in: it names every card on the board, the
     * nouns the captions use, and the sky the whole thing sits under.
     */
    theme: DiceCitiesTheme;
}

/**
 * A player's city tableau: the landmark track (build all four to win) above the
 * grid of establishments they own, colour-coded by when each one pays out.
 * Presentational — every interactive control lives in DiceCitiesActions, bar
 * the tap-to-read on each card, which ZoomableCardArt owns.
 */
export default function DiceCitiesBoard({ playerState, ownerLabel, enabledDocks, theme }: DiceCitiesBoardProps) {
    // Establishments = every card the player owns, sorted by the number that
    // triggers them so the city reads left-to-right like the dice. The four
    // win-condition landmarks are tracked by flags (never in `cards`), so this
    // list is just regular establishments plus any purple majors bought.
    const establishments = [...playerState.cards]
        .filter((cc) => cc.amount > 0)
        .sort((a, b) => theme.cards[a.card].rollNumber[0] - theme.cards[b.card].rollNumber[0]);
    const establishmentCount = establishments.reduce((n, cc) => n + cc.amount, 0);
    const words = theme.words;

    return (
        // The sky is the one part of the board a theme repaints without any
        // art: `--ag-dc-sky-*` are the two stops of the gradient .ag-dc-area
        // draws, which falls back to the original blue if they're ever unset.
        <div
            className="ag-board-area ag-dc-area"
            style={{ "--ag-dc-sky-1": theme.sky[0], "--ag-dc-sky-2": theme.sky[1] } as CSSProperties}
        >
            {/* ── Landmark track ─────────────────────────────────────────── */}
            <div className="ag-dc-landmarks">
                <div className="ag-dc-landmarks-head">
                    {capitalise(words.landmarks)} · build all {LANDMARKS.length} to win
                    {enabledDocks ? ` · the ${theme.cards[DiceCitiesCardIds.HARBOUR].title} is a bonus` : ""}
                </div>
                <div className="ag-dc-landmark-row">
                    {buildableLandmarks(enabledDocks).map(({ cardId, flag }) => {
                        const card = theme.cards[cardId];
                        const built = Boolean(playerState[flag]);
                        return (
                            <div
                                key={cardId}
                                className={`ag-dc-landmark${built ? " ag-dc-landmark--built" : ""}`}
                            >
                                <ZoomableCardArt card={card} theme={theme} className="ag-dc-landmark-icon" />
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
                        {ownerLabel} · {pluralize(establishmentCount, words.establishment, words.establishments)}
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
                        const card = theme.cards[cc.card];
                        const color = ACTIVATION_META[activationFor(card)].color;
                        return (
                            <div
                                key={cc.card}
                                className="ag-dc-est"
                                style={{ borderTopColor: color }}
                            >
                                <span className="ag-dc-est-roll">{rollLabel(card)}</span>
                                {cc.amount > 1 && <span className="ag-dc-est-count">×{cc.amount}</span>}
                                <ZoomableCardArt card={card} theme={theme} className="ag-dc-est-icon" />
                                <div className="ag-dc-est-name">{card.title}</div>
                                <div className="ag-dc-est-yield">{yieldLabel(card)}</div>
                            </div>
                        );
                    })}
                    {establishments.length === 0 && (
                        <div className="ag-dc-city-empty">No {words.establishments} yet — roll and build one.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
