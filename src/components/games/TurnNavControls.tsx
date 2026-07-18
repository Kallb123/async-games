import { Button, ButtonGroup } from "react-bootstrap";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";

// The subset of the navigation hook this control needs, kept game-agnostic.
type TurnNav = ReturnType<typeof useTurnNavigation>;

interface TurnNavControlsProps {
    nav: TurnNav;
    // Rendered inside planning mode so the user can add hypothetical moves
    // (e.g. the game's normal action panel wired to nav.planMove).
    planningActions?: React.ReactNode;
    canPlan?: boolean;
}

export default function TurnNavControls({ nav, planningActions, canPlan = true }: TurnNavControlsProps) {
    const containerStyle: React.CSSProperties = {
        margin: "12px 0",
        padding: "12px",
        border: "1px solid #dee2e6",
        borderRadius: "8px",
        background: nav.isPlannedView ? "#fff8e1" : "#f8f9fa",
    };

    if (nav.isLive) {
        return (
            <div style={containerStyle}>
                <ButtonGroup>
                    <Button variant="outline-secondary" size="sm" onClick={nav.enterRecap} disabled={nav.loading}>
                        🕐 Review turns
                    </Button>
                    {canPlan && (
                        <Button variant="outline-primary" size="sm" onClick={nav.enterPlanning} disabled={nav.loading}>
                            🧭 Plan ahead
                        </Button>
                    )}
                </ButtonGroup>
                {nav.error && <div style={{ color: "#c0392b", marginTop: "6px" }}>{nav.error}</div>}
            </div>
        );
    }

    const label = nav.isPlannedView
        ? `Planned move ${nav.viewIndex - nav.currentIndex} of ${nav.plannedCount}`
        : nav.viewIndex === 0
          ? "Start of game"
          : `Turn ${nav.viewIndex} of ${nav.currentIndex}`;

    const commandText = nav.displayedCommand
        ? `${nav.displayedCommand.senderUsername}: ${nav.displayedCommand.summary}`
        : nav.viewIndex === 0
          ? "Initial position"
          : "";

    return (
        <div style={containerStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <strong>{nav.mode === "planning" ? "🧭 Planning" : "🕐 Review"}</strong>
                <ButtonGroup size="sm">
                    <Button variant="outline-secondary" onClick={nav.jumpToStart} disabled={!nav.canBack}>⏮</Button>
                    <Button variant="outline-secondary" onClick={nav.stepBack} disabled={!nav.canBack}>◀</Button>
                    <Button variant="outline-secondary" onClick={nav.stepForward} disabled={!nav.canForward}>▶</Button>
                    <Button variant="outline-secondary" onClick={nav.jumpToCurrent} disabled={nav.atCurrent}>Now</Button>
                </ButtonGroup>
                <span style={{ fontSize: "0.9rem" }}>{label}</span>
                <Button variant="secondary" size="sm" onClick={nav.returnToLive} style={{ marginLeft: "auto" }}>
                    Return to current
                </Button>
            </div>

            {commandText && (
                <div style={{ marginTop: "8px", fontSize: "0.9rem", color: "#555" }}>{commandText}</div>
            )}

            {nav.mode === "planning" && (
                <div style={{ marginTop: "10px" }}>
                    {nav.atCurrent && !nav.isPlannedView && (
                        <div style={{ fontSize: "0.85rem", color: "#777", marginBottom: "6px" }}>
                            You&apos;re at the current position. Make a hypothetical move to plan ahead.
                        </div>
                    )}
                    {planningActions}
                    {nav.plannedCount > 0 && (
                        <Button variant="outline-danger" size="sm" onClick={nav.clearPlan} style={{ marginTop: "8px" }}>
                            Clear plan
                        </Button>
                    )}
                </div>
            )}

            {nav.error && <div style={{ color: "#c0392b", marginTop: "6px" }}>{nav.error}</div>}
        </div>
    );
}
