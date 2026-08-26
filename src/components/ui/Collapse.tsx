'use client'

import { ReactNode } from "react";

/** Growing in from nothing, or shrinking away to nothing. */
export type CollapsePhase = "enter" | "exit";

/**
 * A box that animates between its natural height and nothing.
 *
 * The grid-rows trick behind `.ag-anim-item` in `ag-theme.css` needs two nested
 * elements, so they live here once rather than at each call site.
 * `useAnimatedList` wraps every row in one; `ListSection` wraps its whole
 * section in another, so a section that runs out of rows takes its heading and
 * padding down with them instead of blinking out from under the page.
 */
export default function Collapse({ phase, children }: { phase?: CollapsePhase; children: ReactNode }) {
    return (
        <div className={`ag-anim-item${phase ? ` ag-anim-item--${phase}` : ""}`}>
            <div className="ag-anim-item-inner">{children}</div>
        </div>
    );
}
