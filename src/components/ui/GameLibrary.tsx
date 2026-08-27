'use client'

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GAME_META, COMING_SOON, GAME_CATEGORIES, GameCategory, GameMeta } from "@/utils/ui/games";
import GameThumb, { GAME_ART_SIZE } from "@/components/ui/GameThumb";
import Section from "@/components/ui/Section";
import { accentVar } from "@/utils/ui/colours";

const FILTERS: ("All" | GameCategory)[] = ["All", ...GAME_CATEGORIES];

// The game shown as the big card at the top of the browser.
const FEATURED = GAME_META.dicecities;

interface GameLibraryProps {
    /**
     * Where a game's card points. The signed-in library sends you to that
     * game's setup screen; the public landing page sends you to sign-up
     * instead, since there's nothing to set up until you have an account.
     */
    hrefFor: (game: GameMeta) => string;
    /** Label on the featured card's button. */
    featuredCta?: string;
    /** Optional heading rendered above the filter chips. */
    label?: string;
}

/**
 * The game browser: category filter chips, the featured game, and the grid of
 * everything else. Shared by `/newgame` (the library you start a game from)
 * and the public landing page (the same browse experience, pointed at
 * sign-up), so the two can't drift apart.
 */
export default function GameLibrary({ hrefFor, featuredCta = "Start a game", label }: GameLibraryProps) {
    const [filter, setFilter] = useState<"All" | GameCategory>("All");

    const otherGames = Object.values(GAME_META)
        .filter(g => g.url !== FEATURED.url)
        // A game mid-build (meta.available: false) has no working command
        // surface yet — starting one would create a game nobody can play.
        .filter(g => g.available)
        .filter(g => filter === "All" || g.categories.includes(filter));
    const featuredVisible = filter === "All" || FEATURED.categories.includes(filter);

    return (
        <>
            <Section label={label}>
                <div className="ag-chips">
                    {FILTERS.map(f => (
                        <button
                            key={f}
                            type="button"
                            className={`ag-chip ${filter === f ? "ag-chip--active" : ""}`}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </Section>

            {featuredVisible && (
                <div className="ag-section">
                    <Link href={hrefFor(FEATURED)} className="ag-featured" style={{ background: accentVar(FEATURED.accent) }}>
                        {FEATURED.art && <Image src={FEATURED.art} alt="" width={GAME_ART_SIZE} height={GAME_ART_SIZE} className="ag-featured-art" />}
                        <div className="ag-featured-eyebrow">Featured this week</div>
                        <div className="ag-featured-title">{FEATURED.name}</div>
                        <div className="ag-featured-desc">{FEATURED.tagline}</div>
                        <div className="ag-featured-row">
                            <span className="ag-featured-btn">{featuredCta}</span>
                            <span className="ag-featured-meta">{FEATURED.players}</span>
                        </div>
                    </Link>
                </div>
            )}

            <div className="ag-section">
                <div className="ag-game-grid">
                    {otherGames.map(game => (
                        <Link key={game.url} href={hrefFor(game)} className="ag-game-card">
                            <div className="ag-game-thumb" style={{ background: accentVar(game.accent) }}>
                                {game.art
                                    ? <GameThumb meta={game} size={74} radius={0} />
                                    : game.glyph}
                            </div>
                            <div className="ag-game-body">
                                <div className="ag-game-name">{game.name}</div>
                                <div className="ag-game-meta">{game.categories.join(", ")} · {game.players.replace(" players", "")}</div>
                            </div>
                        </Link>
                    ))}

                    {filter === "All" && (
                        <div className="ag-game-card ag-game-card--soon">
                            <div className="ag-game-soon-title">
                                {COMING_SOON.slice(0, 2).join(", ")} &amp;<br />more coming
                            </div>
                            <div className="ag-game-soon-cta">Suggest a game →</div>
                        </div>
                    )}
                </div>

                {otherGames.length === 0 && !featuredVisible && (
                    <div className="ag-empty">No games in this category yet.</div>
                )}
            </div>
        </>
    );
}
