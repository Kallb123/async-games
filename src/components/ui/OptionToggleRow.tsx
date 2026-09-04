import { ReactNode } from "react";
import Skeleton from "@/components/ui/Skeleton";

interface OptionToggleRowProps {
    title: ReactNode;
    description?: ReactNode;
    on: boolean;
    onToggle: () => void;
    disabled?: boolean;
    /**
     * The row's label is known up front but its position isn't — we're still
     * fetching whether it's on or off. Shows a pulsing placeholder in the
     * toggle's place instead of guessing "off" and popping over on arrival.
     */
    loading?: boolean;
    ariaLabel?: string;
}

export default function OptionToggleRow({
    title,
    description,
    on,
    onToggle,
    disabled = false,
    loading = false,
    ariaLabel
}: OptionToggleRowProps) {
    return (
        <div className="ag-option-row" aria-busy={loading || undefined}>
            <div className="ag-option-main">
                <div className="ag-option-title">{title}</div>
                {description && <div className="ag-option-desc">{description}</div>}
            </div>
            {loading ? (
                // Shaped like `.ag-toggle` but with no knob to read a state
                // from, and not a button: there is nothing to press until we
                // know what pressing it would do.
                <Skeleton width={44} height={26} radius={99} style={{ flex: "none" }} />
            ) : (
                <button
                    type="button"
                    className={`ag-toggle ${on ? "ag-toggle--on" : ""}`}
                    onClick={onToggle}
                    aria-pressed={on}
                    disabled={disabled}
                    aria-label={ariaLabel ?? (typeof title === "string" ? `Toggle ${title}` : "Toggle option")}
                />
            )}
        </div>
    );
}
