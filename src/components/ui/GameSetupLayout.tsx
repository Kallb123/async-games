'use client'

import { ReactNode } from "react";
import { GameMeta } from "@/utils/ui/games";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import BackLink from "@/components/ui/BackLink";

interface GameSetupLayoutProps {
    meta: GameMeta;
    children: ReactNode;
    actionLabel: string;
    actionDisabled?: boolean;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    footnote?: string;
}

// Shared shell for the "new game" setup screens: back arrow + game identity,
// scrollable options, and one sticky primary action.
export default function GameSetupLayout({ meta, children, actionLabel, actionDisabled, onSubmit, footnote }: GameSetupLayoutProps) {
    return (
        <main style={{ display: "flex", flexDirection: "column" }}>
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div className="ag-topbar">
                    <div className="ag-topbar-title">
                        <BackLink href="/newgame" label="Back to library" />
                        <GameThumb meta={meta} size={ROW_THUMB_SIZE} radius={ROW_THUMB_RADIUS} />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ font: "800 20px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>New {meta.name}</div>
                            <div style={{ font: "500 11.5px var(--ag-font)", color: "var(--ag-ink-soft)" }}>{meta.players}</div>
                        </div>
                    </div>
                </div>

                <div style={{ flex: 1 }}>
                    {children}
                </div>

                <div className="ag-sticky-action">
                    <button type="submit" className="ag-btn ag-btn--primary ag-btn--block" disabled={actionDisabled}>
                        {actionLabel}
                    </button>
                    {footnote && (
                        <p className="ag-hint" style={{ textAlign: "center" }}>{footnote}</p>
                    )}
                </div>
            </form>
        </main>
    );
}
