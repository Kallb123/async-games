'use client'

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import Brand from "@/components/ui/Brand";
import GameThumb from "@/components/ui/GameThumb";
import type { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { profileImageUrl } from "@/utils/ui/avatar";
import { gamePath, metaForGame } from "@/utils/ui/games";
import { personalName } from "@/utils/ui/players";

interface AppRailProps {
    /** Games it is the viewer's move in — the rail marks these with a live dot. */
    myTurn?: IGameResponse[];
    /** Games someone else is holding up. */
    theirTurn?: IGameResponse[];
}

// Where the rail can take you that isn't a game. Deliberately short: the
// "＋ New game" button and the account row at the foot carry the other two
// destinations, so nothing is listed twice.
const NAV = [
    { href: "/", label: "Home", glyph: "🏠" },
    { href: "/profile", label: "Friends", glyph: "👥" },
    { href: "/games/completed", label: "Finished", glyph: "🏁" },
];

/**
 * The platform chrome: the app's own name, where you can go, and every game
 * you have on the go.
 *
 * One element, two shapes (design §16, rule one). On a phone it is the top bar
 * it has always been — the brand lockup, the "new game" circle and your avatar
 * — and everything below that is hidden. Past `--ag-desk-min` it stands up as
 * the dark left rail: the same lockup, then the navigation and the "in play"
 * switcher, which are only worth the room a wide window has. There is no second
 * copy of the top bar for small screens and no second copy of the rail for
 * large ones, so neither can drift from the other.
 *
 * The switcher is the rail's reason to exist rather than a repeat of the lists
 * beside it: it is sticky and it holds *every* live game — the ones waiting on
 * you and the ones waiting on somebody else — so a player who has scrolled to
 * the bottom of a long dashboard is still one click from any board.
 */
export default function AppRail({ myTurn = [], theirTurn = [] }: AppRailProps) {
    const pathname = usePathname();
    const { user } = useIsAuthorised();

    // No fallback name: until Clerk hands us the user, the badge shows a
    // silhouette rather than an initial taken from a placeholder word.
    const displayName = personalName(user);

    const games = [
        ...myTurn.map((game) => ({ game, isYours: true })),
        ...theirTurn.map((game) => ({ game, isYours: false })),
    ];

    return (
        <div className="ag-rail">
            {/* The rail's dark column stretches the whole page; this is the
                part that stays on screen while the dashboard scrolls past it. */}
            <div className="ag-rail-inner">
                <div className="ag-topbar">
                    <Brand />
                    <div className="ag-topbar-actions">
                        <Link href="/newgame" aria-label="New game" className="ag-topbar-add">+</Link>
                        <Link href="/profile" aria-label="Your profile">
                            <Avatar name={displayName} imageUrl={profileImageUrl(user)} size={40} ring="var(--ag-terracotta)" />
                        </Link>
                    </div>
                </div>

                <nav className="ag-rail-nav" aria-label="Sections">
                    {NAV.map((item) => {
                        const current = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`ag-rail-link${current ? " ag-rail-link--on" : ""}`}
                                aria-current={current ? "page" : undefined}
                            >
                                <span aria-hidden>{item.glyph}</span>
                                {item.label}
                                {item.href === "/" && myTurn.length > 0 && (
                                    <span className="ag-rail-count">{myTurn.length}</span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {games.length > 0 && (
                    <div className="ag-rail-games">
                        <h2 className="ag-rail-label">In play</h2>
                        {/* Scrolls rather than stopping at some number of rows: a
                            switcher that quietly omitted a game would be worse than
                            no switcher. */}
                        <div className="ag-rail-list">
                            {games.map(({ game, isYours }) => {
                                const meta = metaForGame({ url: game.url, friendlyName: game.friendlyName });
                                return (
                                    <Link
                                        key={game.gameId}
                                        href={gamePath(game.url, game.gameId)}
                                        className={`ag-rail-game${isYours ? " ag-rail-game--yours" : ""}`}
                                    >
                                        {meta
                                            ? <GameThumb meta={meta} size={22} radius={6} />
                                            : <span className="ag-rail-game-blank" />}
                                        <span className="ag-rail-game-name">{game.friendlyName}</span>
                                        {isYours && <span className="ag-rail-game-dot" aria-label="Your move" />}
                                        {!isYours && game.currentTurnUsername && (
                                            <span className="ag-rail-game-who">{game.currentTurnUsername}</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="ag-rail-foot">
                    <Link href="/newgame" className="ag-rail-cta">＋ New game</Link>
                    <div className="ag-rail-user">
                        <Link href="/profile" className="ag-rail-user-main">
                            <Avatar name={displayName} imageUrl={profileImageUrl(user)} size={30} />
                            <span className="ag-rail-user-name">{displayName ?? "Your profile"}</span>
                        </Link>
                        <Link href="/settings" className="ag-rail-gear" aria-label="Settings">⚙</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
