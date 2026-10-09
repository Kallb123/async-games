'use client'

import { ReactNode } from "react";
import Link from "next/link";

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
    /** Greys the row out: something listed that isn't yours yet, such as a
     *  locked achievement. Still readable — it says what it's asking for. */
    muted?: boolean;
    /** Makes the complete row a link without asking callers to duplicate its markup. */
    href?: string;
    onClick?: () => void;
}

/**
 * One row of an `ag-list`: icon, title, sub-line, trailing control.
 *
 * The shape every list in the app repeats — device lists, the landing page's
 * "how it works" steps, the home page's release notes — so the four divs and
 * their classes live here once rather than in each caller. The `ag-list` card
 * around the rows belongs to `ListSection`.
 */
export default function ListRow({ icon, title, sub, action, compact = false, muted = false, href, onClick }: ListRowProps) {
    const content = <>
            {!compact && (typeof icon === "string"
                ? <span className="ag-icon-box" aria-hidden>{icon}</span>
                : icon)}
            <div className="ag-list-row-main">
                <div className="ag-list-row-title">{title}</div>
                {!compact && sub !== undefined && <div className="ag-list-row-sub">{sub}</div>}
            </div>
            {action}
        </>;
    const className = `ag-list-row${compact ? " ag-list-row--compact" : ""}${muted ? " ag-list-row--muted" : ""}`;
    return href
        ? <Link className={className} href={href} onClick={onClick} data-perf-region="list-row">{content}</Link>
        : <div className={className} data-perf-region="list-row">{content}</div>;
}
