'use client'

import RoleInfoPopup, { RoleInfo } from '@/components/ui/RoleInfoPopup';
import { useDismissibleBanner } from '@/utils/hooks/useDismissibleBanner';

interface RoleIntroPopupProps {
    /** The game's url slug — namespaces the per-browser "met your role" flag. */
    gameUrl: string;
    gameId: string;
    myUserId: string;
    /** The viewer's own role, or null while their seat isn't known yet. */
    role: RoleInfo | null;
}

/**
 * The welcome a player gets the first time they open a game they're in: a
 * popup naming the role they've been dealt and explaining what it lets them
 * do. It reuses `RoleInfoPopup` — the same card `RoleNote` opens when anyone
 * taps a role name in a hands panel — with a lead-in, and remembers per
 * browser (via useDismissibleBanner) that this player has met their role, so
 * it greets them once and never again.
 *
 * Started as Outbreak's `OutbreakRoleIntro`; Banned Islet's six roles wanted
 * the same greeting, and there was nothing game-specific left in it once the
 * slug namespacing the flag was a prop — so it lives here rather than being
 * copied (AGENTS.md: a second copy is the signal to extract the first).
 *
 * A game should render this only once the game id and the viewer's own seat
 * are known, so the storage key is stable from the first mount and the "seen"
 * flag reads correctly — and after its game guide has had the floor, because
 * you need to know the game before your role in it (see useGameGuide).
 */
export default function RoleIntroPopup({ gameUrl, gameId, myUserId, role }: RoleIntroPopupProps) {
    const { dismissed, dismiss } = useDismissibleBanner(`${gameUrl}-role-intro:${gameId}:${myUserId}`);
    if (dismissed || !role) return null;

    return (
        <RoleInfoPopup
            role={role}
            intro={`Welcome to the crew! You’ve been dealt the ${role.name} — here’s what only you can do. Forgot it? Tap your role name (ⓘ) in your hand to see this again any time.`}
            onClose={dismiss}
        />
    );
}
