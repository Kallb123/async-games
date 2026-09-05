'use client'

import { ReactNode } from "react";

interface ListRowProps {
    /** Leads the row. A string is treated as a glyph and boxed in an
     *  `ag-icon-box`; anything else (an `Avatar`, a `GameThumb`) renders
     *  as given. */
    icon?: ReactNode;
    title: ReactNode;
    /** The line under the title. Pass it — even as a falsy value that is
     *  still loading — to keep the row's height stable. */
    sub?: ReactNode;
    /** Trailing control: a remove button, a timestamp, an accept pill. */
    action?: ReactNode;
    /** The tighter, quieter row: title only, no icon and no sub-line. For the
     *  tail of a long list, where the older rows are still worth listing but
     *  no longer worth a paragraph each. */
    compact?: boolean;
}

/**
 * One row of an `ag-list`: icon, title, sub-line, trailing control.
 *
 * The shape every list in the app repeats — device lists, the landing page's
 * "how it works" steps, the home page's release notes — so the four divs and
 * their classes live here once rather than in each caller. The `ag-list` card
 * around the rows belongs to `ListSection`.
 */
export default function ListRow({ icon, title, sub, action, compact = false }: ListRowProps) {
    return (
        <div className={`ag-list-row${compact ? " ag-list-row--compact" : ""}`}>
            {!compact && (typeof icon === "string"
                ? <span className="ag-icon-box" aria-hidden>{icon}</span>
                : icon)}
            <div className="ag-list-row-main">
                <div className="ag-list-row-title">{title}</div>
                {!compact && sub !== undefined && <div className="ag-list-row-sub">{sub}</div>}
            </div>
            {action}
        </div>
    );
}
