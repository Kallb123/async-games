'use client'

import GameThumb from "@/components/ui/GameThumb";
import { GAME_META } from "@/utils/ui/games";
import { WHATS_NEW } from "@/utils/ui/whatsNew";
import packageJson from "@/../package.json";

/**
 * The release notes at the bottom of the home page — new games, enhancements
 * and bug fixes, tagged with the version they shipped in.
 *
 * The copy lives in `src/utils/ui/whatsNew.ts`; this only lays it out, so the
 * signed-in dashboard and the public landing page show the same notes.
 */
export default function WhatsNew() {
    const groups = WHATS_NEW.filter(group => group.items.length > 0);

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">What&rsquo;s new</h2>
                <span className="ag-list-row-time">v{packageJson.version}</span>
            </div>
            <div className="ag-stack">
                {groups.map(group => (
                    <div key={group.label}>
                        <div className="ag-section-head">
                            <h3 className="ag-section-label">{group.label}</h3>
                        </div>
                        <div className="ag-list">
                            {group.items.map(item => {
                                const meta = item.game ? GAME_META[item.game] : undefined;
                                return (
                                    <div key={item.title} className="ag-list-row">
                                        {meta
                                            ? <GameThumb meta={meta} size={38} radius={10} />
                                            : <div className="ag-icon-box">{group.icon}</div>}
                                        <div className="ag-list-row-main">
                                            <div className="ag-list-row-title">{item.title}</div>
                                            <div className="ag-list-row-sub">{item.detail}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
