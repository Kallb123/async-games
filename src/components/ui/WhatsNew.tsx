'use client'

import ListSection from "@/components/ui/ListSection";
import ListRow from "@/components/ui/ListRow";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import { GAME_META } from "@/utils/ui/games";
import { WHATS_NEW } from "@/utils/ui/whatsNew";

/**
 * The release notes at the bottom of the home page — new games, enhancements
 * and bug fixes.
 *
 * Collapsed by default: the notes are worth having but are not why anyone opens
 * the app, so they sit behind a heading you tap to unfold. A native `<details>`
 * does that without any state to hold.
 *
 * The copy lives in `src/utils/ui/whatsNew.ts`; this only lays it out, so the
 * signed-in dashboard and the public landing page show the same notes.
 */
export default function WhatsNew() {
    return (
        <details className="ag-disclosure">
            <summary className="ag-section ag-section-head">
                <h2 className="ag-block-title">What&rsquo;s new</h2>
                <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span>
            </summary>

            {WHATS_NEW.map(group => (
                <ListSection key={group.label} label={group.label} isLoading={false}>
                    {group.items.map(item => {
                        const meta = item.game ? GAME_META[item.game] : undefined;
                        return (
                            <ListRow
                                key={item.title}
                                icon={meta
                                    ? <GameThumb meta={meta} size={ROW_THUMB_SIZE} radius={ROW_THUMB_RADIUS} />
                                    : group.icon}
                                title={item.title}
                                sub={item.detail}
                            />
                        );
                    })}
                </ListSection>
            ))}
        </details>
    );
}
