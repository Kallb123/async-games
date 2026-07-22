import { ReactNode } from "react";

interface OptionToggleRowProps {
    title: ReactNode;
    description?: ReactNode;
    on: boolean;
    onToggle: () => void;
    disabled?: boolean;
    ariaLabel?: string;
}

export default function OptionToggleRow({
    title,
    description,
    on,
    onToggle,
    disabled = false,
    ariaLabel
}: OptionToggleRowProps) {
    return (
        <div className="ag-option-row">
            <div style={{ flex: 1 }}>
                <div className="ag-option-title">{title}</div>
                {description && <div className="ag-option-desc">{description}</div>}
            </div>
            <button
                type="button"
                className={`ag-toggle ${on ? "ag-toggle--on" : ""}`}
                onClick={onToggle}
                aria-pressed={on}
                disabled={disabled}
                aria-label={ariaLabel ?? (typeof title === "string" ? `Toggle ${title}` : "Toggle option")}
            />
        </div>
    );
}
