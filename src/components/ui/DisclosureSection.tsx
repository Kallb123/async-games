import { ReactNode } from "react";

interface DisclosureSectionProps {
    /** What the heading says: the one line visible while it is folded away. */
    title: string;
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
export default function DisclosureSection({ title, children }: DisclosureSectionProps) {
    return (
        <details className="ag-disclosure">
            <summary className="ag-section ag-section-head">
                <h2 className="ag-block-title">{title}</h2>
                <span className="ag-disclosure-chevron" aria-hidden="true">&rsaquo;</span>
            </summary>
            {children}
        </details>
    );
}
