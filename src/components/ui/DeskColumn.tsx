import { ReactNode } from "react";

/** The three regions of the dashboard's `.ag-desk` grid (see `Dashboard`). */
export type DeskArea = "main" | "side" | "notes";

/**
 * One column of the home dashboard: the queue, the panel beside it, or the
 * release notes under it. Written once so `Dashboard` and `HomeLoading` lay out
 * the same regions with the same markup, and so the `column` perf marker has
 * one home. While one is `loading`, `ag-theme.css` also holds back the root
 * layout's notification footer, for the same reason as the release notes.
 *
 * `loading` is the swap. While a column's lists are still on their skeletons, it
 * is a *different element* from the one that holds the real rows, so the first
 * response replaces the skeleton column rather than reshaping it. That is the
 * point: a column that is reshaped — two skeleton sections collapsing because
 * the player has no invites, the lists above it growing — drags the column
 * after it, and the notes under that, down or up the page, one animation frame
 * at a time, which is most of what the browser counts as this page's layout
 * shift. A column that is replaced moves nothing that was on screen. Every
 * later change to the lists (a poll bringing an invite, a turn played) is the
 * rows' own animation and keeps the one element.
 */
export default function DeskColumn({ area, loading = false, children }: {
    area: DeskArea;
    /** True until the lists in it have had their first answer. */
    loading?: boolean;
    children: ReactNode;
}) {
    const className = `ag-desk-col ag-desk-col--${area}${loading ? " ag-desk-col--loading" : ""}`;
    const Tag = area === "side" ? "aside" : "div";
    return <Tag key={loading ? "loading" : "loaded"} className={className} data-perf-region="column">{children}</Tag>;
}
