import { ReactNode } from "react";

interface DisclosureSectionProps {
    /** What the heading says: the one line visible while it is folded away. */
    title: string;
    /**
     * `"block"` (the default) heads a whole block of the page in the large
     * `ag-block-title`, as the home page's release notes do. `"section"` heads a
     * fold inside a block in a section's own label, as a profile folds away the
     * achievements of the games a player hasn't played.
     */
    level?: "block" | "section";
    children: ReactNode;
}

/**
 * A heading you tap to unfold what's under it: the `ag-disclosure`, folded by
 * default. A native `<details>` does that without any state to hold, and the
 * `<summary>` wears the section-head row with a chevron that turns as it opens.
 *
 * Every fold of a block on a page goes through here, so the summary's classes
 * and its chevron are written once — the same reason `Section` exists for a
 * heading that doesn't fold.
 */
export default function DisclosureSection({ title, level = "block", children }: DisclosureSectionProps) {
    return (
        <details className="ag-disclosure" data-perf-region="disclosure">
            <summary className="ag-section ag-section-head">
                <h2 className={level === "block" ? "ag-block-title" : "ag-section-label"}>{title}</h2>
                <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span>
            </summary>
            {children}
        </details>
    );
}
