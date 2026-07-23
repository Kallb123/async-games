'use client'

import { Modal } from 'react-bootstrap';
import moment from 'moment';
import GameResultStats from "@/components/ui/GameResultStats";
import { useGameResult } from "@/utils/hooks/useGameResult";
import { GAME_META } from "@/utils/ui/games";
import { pluralize } from "@/utils/ui/text";
import type { MatchOutcome } from "@/app/api/stats/route";

const OUTCOME_TITLE: Record<MatchOutcome, string> = { win: "You won", loss: "You lost", draw: "Draw" };

interface MatchResultPopupProps {
    gameId: string;
    outcome: MatchOutcome;
    onClose: () => void;
}

// Compact popup shown when tapping a "recent form" match chip: the outcome
// plus a couple of game-specific stats. Links through to the full result
// page for the rest.
export default function MatchResultPopup({ gameId, outcome, onClose }: MatchResultPopupProps) {
    const { result, isLoading } = useGameResult(gameId);
    const meta = result ? GAME_META[result.url] : undefined;

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{meta?.name ?? "Match result"} · {OUTCOME_TITLE[outcome]}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isLoading || !result
                    ? <div className="ag-empty">Loading…</div>
                    : (
                        <>
                            <div className="ag-list-row-sub" style={{ marginBottom: 10 }}>
                                {moment(result.endedAt).fromNow()} · {pluralize(result.totalTurns, 'turn')}
                            </div>
                            {result.stats.length > 0
                                ? <GameResultStats groups={result.stats} />
                                : <div className="ag-empty">No extra stats for this game.</div>}
                        </>
                    )}
            </Modal.Body>
            <Modal.Footer>
                <a href={`/games/result/${gameId}`} className="ag-btn ag-btn--light">Full result</a>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    );
}
