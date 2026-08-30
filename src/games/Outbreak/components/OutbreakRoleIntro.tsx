'use client'

import { roleDef } from '@/games/Outbreak/board';
import type { OutbreakRoleId } from '@/games/Outbreak/board';
import { useDismissibleBanner } from '@/utils/hooks/useDismissibleBanner';
import OutbreakRoleInfoPopup from './OutbreakRoleInfoPopup';

interface OutbreakRoleIntroProps {
    gameId: string;
    myUserId: string;
    role: OutbreakRoleId | null;
}

/**
 * The welcome a player gets the first time they open a game they're in: a
 * popup naming the role they've been dealt and explaining what it lets them
 * do. It reuses OutbreakRoleInfoPopup — the same card that opens when anyone
 * taps a role name in OutbreakHands — with a lead-in, and remembers per
 * browser (via useDismissibleBanner) that this player has met their role, so
 * it greets them once and never again.
 *
 * Rendered only once both the game id and the player's own seat (with a role)
 * are known, so the storage key is stable from the first mount and the
 * "seen" flag reads correctly.
 */
export default function OutbreakRoleIntro({ gameId, myUserId, role }: OutbreakRoleIntroProps) {
    const { dismissed, dismiss } = useDismissibleBanner(`outbreak-role-intro:${gameId}:${myUserId}`);
    const def = roleDef(role);
    if (dismissed || !def) return null;

    return (
        <OutbreakRoleInfoPopup
            role={def}
            intro={`Welcome to the crew! You’ve been dealt the ${def.name} — here’s what only you can do. Forgot it? Tap your role name (ⓘ) in your hand to see this again any time.`}
            onClose={dismiss}
        />
    );
}
