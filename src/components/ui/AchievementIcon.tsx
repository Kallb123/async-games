'use client'

import Image from "next/image";
import { useState } from "react";
import { ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import type { Achievement } from "@/utils/games/achievements";

/**
 * The one place an achievement's icon is drawn (docs/achievements.md §7.2): its
 * drawn art where it has some, and its emoji otherwise, both in the same
 * `ag-icon-box` a `ListRow` puts a glyph in, so the two are the same size in the
 * same list.
 *
 * A drawn icon that fails to load falls back to the emoji, never a broken image
 * — the rule `Avatar` follows for a profile picture. The emoji is always there to
 * fall back to: every achievement has one, and it is the icon's text form
 * wherever the icon has to be a character (a push, a toast).
 *
 * Decorative: the row's title names the achievement, so the icon is hidden from
 * a screen reader rather than read out a second time.
 */
export default function AchievementIcon({ achievement }: { achievement: Pick<Achievement, "icon" | "art"> }) {
    const [artFailed, setArtFailed] = useState(false);
    const art = artFailed ? undefined : achievement.art;
    return (
        <span className="ag-icon-box" aria-hidden="true">
            {art
                ? <Image src={art} alt="" width={ROW_THUMB_SIZE} height={ROW_THUMB_SIZE} onError={() => setArtFailed(true)} />
                : achievement.icon}
        </span>
    );
}
