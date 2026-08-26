'use client'

import { ReactNode } from "react";
import Collapse from "@/components/ui/Collapse";

/**
 * The `ag-section` every loading-aware section is built from: the heading and
 * its action, the busy flag, and a box that shrinks away when it has nothing
 * left to show instead of dropping its heading and its padding in one step
 * once the last row has gone — which shunts everything below it up the page.
 *
 * Only the body differs between the sections that use it: `ListSection` puts
 * an animated `ag-list` in it, `RecentFormSection` its row of result chips,
 * the home page's "your move" its stack of cards. Everything round that body
 * is decided here once.
 */
export default function CollapsingSection({ label, count, action, collapsed = false, isLoading, children }: {
    /** Heading text. Omit for a section that titles itself, like the home page's "your move". */
    label?: string;
    /** Appended to the heading as `· N` once there is one to show. */
    count?: number;
    /** Control rendered on the right of the heading. */
    action?: ReactNode;
    /**
     * Shrinks the section away. The caller's call: a section with an `empty`
     * message to put in the rows' place stays, one with nothing to say goes.
     */
    collapsed?: boolean;
    /** Marks the section busy while its placeholders stand in for real content. */
    isLoading?: boolean;
    children: ReactNode;
}) {
    return (
        <Collapse phase={collapsed ? "exit" : undefined}>
            <div className="ag-section" aria-busy={isLoading || undefined}>
                {label && (
                    <div className="ag-section-head">
                        <h2 className="ag-section-label">{label}{count ? ` · ${count}` : ""}</h2>
                        {action}
                    </div>
                )}
                {children}
            </div>
        </Collapse>
    );
}
