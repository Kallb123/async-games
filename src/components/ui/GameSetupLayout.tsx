'use client'

import { ReactNode } from "react";
import { GameMeta } from "@/utils/ui/games";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";

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
                <GameIdentityHeader
                    backHref="/newgame"
                    backLabel="Back to library"
                    meta={meta}
                    title={`New ${meta.name}`}
                    subtitle={meta.players}
                />

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
