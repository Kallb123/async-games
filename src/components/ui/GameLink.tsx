'use client'

import Link from "next/link";
import type { ComponentProps } from "react";
import { useGamePrefetch } from "@/utils/hooks/useGamePrefetch";

type GameLinkProps = ComponentProps<typeof Link> & {
    /** The game the link opens: its board is fetched when the player shows intent. */
    gameId: string;
};

/**
 * A `<Link>` to a game's board that starts fetching the board as the player
 * reaches for it (`useGamePrefetch`): a press, the mouse arriving, focus. The
 * dashboard's your-turn cards, its waiting rows and the rail's game rows are
 * all one of these, so the prefetch is wired here once rather than at each of
 * them. It owns the pointer-down, pointer-enter and focus handlers.
 */
export default function GameLink({ gameId, ...linkProps }: GameLinkProps) {
    const prefetch = useGamePrefetch(gameId);
    return <Link {...linkProps} {...prefetch} />;
}
