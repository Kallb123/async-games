'use client'

import { ReactNode } from "react";
import { buildRematchHref } from "@/utils/ui/rematch";

interface GameFinishBannerProps {
    message: ReactNode;
    gameId: string;
    gameUrl: string;
    invitees: string[];
    turnTimer: string;
    extraParams?: Record<string, string>;
}

// Shown in place of the board once a game is complete: the result headline,
// a link to the full GameResults page, and a "Rematch" link that jumps to
// the New Game setup screen pre-filled with the same players and options.
export default function GameFinishBanner({ message, gameId, gameUrl, invitees, turnTimer, extraParams }: GameFinishBannerProps) {
    const rematchHref = buildRematchHref(gameUrl, { invitees, turnTimer, extraParams });

    return (
        <div className="ag-game-result">
            <h2>{message}</h2>
            <div className="ag-game-result-actions">
                <a href={`/games/result/${gameId}`} className="ag-btn ag-btn--light">View result</a>
                <a href={rematchHref} className="ag-btn ag-btn--primary">Rematch</a>
            </div>
        </div>
    );
}
