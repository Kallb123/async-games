'use client'

import { ReactNode } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { GameMeta } from "@/utils/ui/games";
import { isGuest } from "@/utils/ui/players";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import OfferCard from "@/components/ui/OfferCard";

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
//
// A guest can explore this screen freely — every server-side create route
// rejects them (docs/account-less-play.md §8: every lobby needs a real,
// registered host) — so rather than let that surface as a failed submit,
// the primary action stays greyed out for them here and an `OfferCard`
// points at Settings, where `ClaimAccountForm` already lives. One guard in
// the shell every setup screen shares, instead of seven copies of the check.
export default function GameSetupLayout({ meta, children, actionLabel, actionDisabled, onSubmit, footnote }: GameSetupLayoutProps) {
    const { user } = useUser();
    const guest = !!user && isGuest(user);

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
                    <button type="submit" className="ag-btn ag-btn--primary ag-btn--block" disabled={actionDisabled || guest}>
                        {actionLabel}
                    </button>
                    {guest ? (
                        <div style={{ marginTop: 12 }}>
                            <OfferCard
                                title="Sign up to host a game"
                                action={
                                    <Link href="/settings" className="ag-btn ag-btn--light">
                                        Sign up
                                    </Link>
                                }
                            >
                                Guests can set this game up, but only a registered
                                player can send the invites. Sign up to host.
                            </OfferCard>
                        </div>
                    ) : footnote && (
                        <p className="ag-hint" style={{ textAlign: "center" }}>{footnote}</p>
                    )}
                </div>
            </form>
        </main>
    );
}
