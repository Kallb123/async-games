'use client'
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useNowToTheMinute } from "@/utils/hooks/useNow";
import { formatRelativeTime } from "@/utils/ui/time";
import { playerColourForId } from "@/utils/ui/playerColours";
import { pluralize } from "@/utils/ui/text";

// The subset of the navigation hook this control needs, kept game-agnostic.
type TurnNav = ReturnType<typeof useTurnNavigation>;

interface TurnNavControlsProps {
    nav: TurnNav;
    // Rendered inside planning mode so the user can add hypothetical moves
    // (e.g. the game's normal action panel wired to nav.planMove).
    planningActions?: React.ReactNode;
    canPlan?: boolean;
    /** The game's players in seat order, used to colour the reviewed turn's swatch. */
    userIdList?: string[];
}

// The war-room scrubber from the design: a dark dock carrying the transport
// buttons, a turn track showing where in the match you are standing, and a line
// naming the turn you are looking at. Themed like the rest of the shell — the
// panel is the app's dark ink, the key control its brass, never stock Bootstrap.
export default function TurnNavControls({ nav, planningActions, canPlan = true, userIdList = [] }: TurnNavControlsProps) {
    const now = useNowToTheMinute();

    if (nav.isLive) {
        return (
            <div className="ag-actionsheet">
                <div className="ag-btn-row">
                    <button type="button" className="ag-btn ag-btn--light" onClick={nav.enterRecap} disabled={nav.loading}>
                        🕐 Review turns
                    </button>
                    {canPlan && (
                        <button type="button" className="ag-btn ag-btn--light" onClick={nav.enterPlanning} disabled={nav.loading}>
                            🧭 Plan ahead
                        </button>
                    )}
                </div>
                {nav.error && <div className="ag-review-error">{nav.error}</div>}
            </div>
        );
    }

    // How far the viewed turn is from the live current state.
    const delta = nav.viewIndex - nav.currentIndex;
    const relativeLabel =
        delta === 0
            ? "Current turn"
            : delta < 0
              ? `${pluralize(-delta, 'turn')} ago`
              : `Planning ${pluralize(delta, 'turn')} ahead`;

    // Secondary absolute position, e.g. "Turn 2 of 5" or "Start of game".
    const positionLabel = nav.isPlannedView
        ? `Planned move ${delta} of ${nav.plannedCount}`
        : nav.viewIndex === 0
          ? "Start of game"
          : `Turn ${nav.viewIndex} of ${nav.currentIndex}`;

    const command = nav.displayedCommand;
    const when = command ? formatRelativeTime(command.timestamp, now) : null;
    const swatch = playerColourForId(command?.senderId, userIdList);

    // One tick per point on the timeline, index 0 (the opening position) first.
    const ticks = Array.from({ length: nav.totalTurns + 1 }, (_, i) =>
        i === nav.viewIndex ? "now" : i > nav.currentIndex ? "planned" : i < nav.viewIndex ? "played" : "ahead"
    );

    return (
        <>
            <div className="ag-review">
                <div className="ag-review-head">
                    <div className="ag-review-title">{nav.mode === "planning" ? "🧭 Planning ahead" : "🕐 Match review"}</div>
                    <div className="ag-review-rule" />
                    <div className="ag-review-pos">{positionLabel}</div>
                </div>

                <div className="ag-review-transport">
                    <button type="button" className="ag-review-btn" onClick={nav.jumpToStart} disabled={!nav.canBack} aria-label="Jump to start of game" title="Jump to start of game">⏮</button>
                    <button type="button" className="ag-review-btn" onClick={nav.stepBack} disabled={!nav.canBack} aria-label="Previous turn" title="Previous turn">◀</button>
                    <button type="button" className="ag-review-btn ag-review-btn--key" onClick={nav.stepForward} disabled={!nav.canForward} aria-label="Next turn" title="Next turn">▶</button>
                    <button type="button" className="ag-review-btn" onClick={nav.jumpToCurrent} disabled={!nav.canForward} aria-label="Jump to current turn" title="Jump to current turn">⏭</button>
                </div>

                <div className="ag-review-track" aria-hidden="true">
                    {ticks.map((state, i) => (
                        <span key={i} className={`ag-review-tick${state === "ahead" ? "" : ` ag-review-tick--${state}`}`} />
                    ))}
                </div>

                <div className="ag-review-now">
                    <span className="ag-review-swatch" style={{ background: swatch }} />
                    <div className="ag-review-now-text">
                        {command ? (
                            <>
                                <b>{command.senderUsername}</b> · {command.summary}
                                {when && <span className="ag-review-now-when"> · {when}</span>}
                            </>
                        ) : (
                            "Initial position"
                        )}
                    </div>
                    <div className="ag-review-delta">{relativeLabel}</div>
                </div>

                {nav.error && <div className="ag-review-error">{nav.error}</div>}
            </div>

            {nav.mode === "planning" && (
                <>
                    {nav.atCurrent && !nav.isPlannedView && (
                        <div className="ag-review-hint">
                            You&apos;re at the current position. Make a hypothetical move to plan ahead.
                        </div>
                    )}
                    {planningActions}
                    {nav.plannedCount > 0 && (
                        <div className="ag-actionsheet">
                            <button type="button" className="ag-btn ag-btn--danger ag-btn--block" onClick={nav.clearPlan} title="Remove your hypothetical moves and start the plan over">
                                Discard plan
                            </button>
                        </div>
                    )}
                </>
            )}

            <div className="ag-actionsheet">
                <button type="button" className="ag-btn ag-btn--primary ag-btn--block" onClick={nav.returnToLive} title="Leave this view and resume the live game">
                    Back to live game →
                </button>
            </div>
        </>
    );
}
