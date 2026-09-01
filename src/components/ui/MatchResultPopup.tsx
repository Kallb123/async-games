'use client'

import { Modal } from 'react-bootstrap';
import Link from 'next/link';
import moment from 'moment';
import GameResultStats from "@/components/ui/GameResultStats";
import Skeleton, { SkeletonRow } from "@/components/ui/Skeleton";
import { useGameResult } from "@/utils/hooks/useGameResult";
import { useCloseRequest } from "@/utils/hooks/useCloseRequest";
import { GAME_META } from "@/utils/ui/games";
import { pluralize } from "@/utils/ui/text";
import { lengthUnit } from "@/utils/games/turnCount";
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
    useCloseRequest(true, onClose);
    const meta = result ? GAME_META[result.url] : undefined;

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{meta?.name ?? "Match result"} · {OUTCOME_TITLE[outcome]}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {isLoading || !result
                    ? (
                        <>
                            {/* The shape the body is about to be — a date line
                                over a couple of stat rows — so the popup fills
                                in rather than swapping one thing for another. */}
                            <Skeleton width="55%" height={12} style={{ marginBottom: 10 }} />
                            <div className="ag-list" aria-busy="true">
                                <SkeletonRow icon="none" />
                                <SkeletonRow icon="none" />
                            </div>
                        </>
                    )
                    : (
                        <>
                            <div className="ag-list-row-sub" style={{ marginBottom: 10 }}>
                                {moment(result.endedAt).fromNow()} · {pluralize(result.totalTurns, lengthUnit(result.playerIds.length))}
                            </div>
                            {result.stats.length > 0
                                ? <GameResultStats groups={result.stats} />
                                : <div className="ag-empty">No extra stats for this game.</div>}
                        </>
                    )}
            </Modal.Body>
            <Modal.Footer>
                <Link href={`/games/result/${gameId}`} className="ag-btn ag-btn--light">Full result</Link>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    );
}
