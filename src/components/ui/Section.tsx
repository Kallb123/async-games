import { ReactNode } from "react";

interface SectionProps {
    /** Heading text. Omit for a section whose content titles itself. */
    label?: string;
    /** Appended to the heading as `· N` once there is one to show. */
    count?: number;
    /** Control rendered on the right of the heading. */
    action?: ReactNode;
    /** Marks the section busy while placeholders stand in for real content. */
    isLoading?: boolean;
    children: ReactNode;
}

/**
 * A block of the page: the padded `ag-section` box, and — when it has one —
 * the heading row above its content.
 *
 * Those five lines of heading markup were hand-rolled in a dozen places, from
 * Settings' "Notifications" to a game setup screen's "Turn timer", so a change
 * to the shape of a section heading meant a dozen edits. Everything that wants
 * a heading and a body goes through here now; `CollapsingSection` is this plus
 * the animation a section that comes and goes needs. A section with no heading
 * at all is still welcome to be a plain `<div className="ag-section">` — there
 * is nothing there to share.
 */
export default function Section({ label, count, action, isLoading, children }: SectionProps) {
    return (
        <div className="ag-section" aria-busy={isLoading || undefined}>
            {label !== undefined && (
                <div className="ag-section-head">
                    <h2 className="ag-section-label">{label}{count ? ` · ${count}` : ""}</h2>
                    {action}
                </div>
            )}
            {children}
        </div>
    );
}
