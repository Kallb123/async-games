'use client'

import { ReactNode } from "react";
import { GameMeta } from "@/utils/ui/games";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import BackLink from "@/components/ui/BackLink";

interface GameIdentityHeaderProps {
    backHref: string;
    backLabel: string;
    /** Leads the title with the game's thumb; omitted while it isn't known yet. */
    meta?: GameMeta;
    title: ReactNode;
    subtitle?: ReactNode;
}

/**
 * The `ag-topbar` identity block every game-scoped screen opens with: back
 * arrow, the game's thumb, a bold title over a softer subtitle. Shared by
 * `GameSetupLayout` (title "New <game>", subtitle the player count) and the
 * lobby screen (title "Your lobby", subtitle the game's name) rather than
 * each hand-rolling the same markup and inline styles a second time.
 */
export default function GameIdentityHeader({ backHref, backLabel, meta, title, subtitle }: GameIdentityHeaderProps) {
    return (
        <div className="ag-topbar">
            <div className="ag-topbar-title">
                <BackLink href={backHref} label={backLabel} />
                {meta && <GameThumb meta={meta} size={ROW_THUMB_SIZE} radius={ROW_THUMB_RADIUS} />}
                <div style={{ minWidth: 0 }}>
                    <div style={{ font: "800 20px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>{title}</div>
                    {subtitle && <div style={{ font: "500 11.5px var(--ag-font)", color: "var(--ag-ink-soft)" }}>{subtitle}</div>}
                </div>
            </div>
        </div>
    );
}
