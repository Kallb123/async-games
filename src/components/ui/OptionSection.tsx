import { ReactNode } from "react";

interface OptionSectionProps {
    label: string;
    children: ReactNode;
    /** Notes shown under the card but still inside the section, e.g. hints. */
    footer?: ReactNode;
}

/**
 * The labelled card a setup screen puts its `OptionToggleRow`s in — the
 * "Expansions" / "House rules" block every game's New Game form shares.
 */
export default function OptionSection({ label, children, footer }: OptionSectionProps) {
    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">{label}</h2>
            </div>
            <div className="ag-card ag-option-card">{children}</div>
            {footer}
        </div>
    );
}
