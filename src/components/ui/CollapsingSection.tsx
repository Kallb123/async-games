'use client'

import { ReactNode } from "react";
import Collapse from "@/components/ui/Collapse";

/**
 * An `ag-section` that shrinks away when it has nothing left to show, instead
 * of dropping its heading and its padding in one step once the last row has
 * gone — which shunts everything below it up the page.
 *
 * `collapsed` is the caller's call: a list with an `empty` message to put in
 * the rows' place stays, one with nothing to say goes.
 */
export default function CollapsingSection({ collapsed, isLoading, children }: {
    collapsed: boolean;
    /** Marks the section busy while its placeholders stand in for real rows. */
    isLoading?: boolean;
    children: ReactNode;
}) {
    return (
        <Collapse phase={collapsed ? "exit" : undefined}>
            <div className="ag-section" aria-busy={isLoading || undefined}>{children}</div>
        </Collapse>
    );
}
