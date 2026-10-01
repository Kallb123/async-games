'use client'

export interface TabItem<T extends string> {
    id: T;
    label: string;
    /** A small count or flag after the label, e.g. waiting friend requests. */
    badge?: number;
}

interface TabsProps<T extends string> {
    label: string;
    tabs: TabItem<T>[];
    value: T;
    onChange: (id: T) => void;
}

/** The panel for one tab; renders nothing unless it is the active one. */
export function TabPanel<T extends string>({ id, active, children }: { id: T; active: T; children: React.ReactNode }) {
    if (id !== active) return null;
    return <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>;
}

/** A row of page tabs; pair each with a `TabPanel`. */
export default function Tabs<T extends string>({ label, tabs, value, onChange }: TabsProps<T>) {
    return (
        <div className="ag-section">
            <div className="ag-tabs" role="tablist" aria-label={label}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`tab-${tab.id}`}
                        aria-selected={value === tab.id}
                        aria-controls={`tabpanel-${tab.id}`}
                        className={`ag-tab ${value === tab.id ? "ag-tab--active" : ""}`}
                        onClick={() => onChange(tab.id)}
                    >
                        {tab.label}
                        {!!tab.badge && <span className="ag-tab-badge">{tab.badge}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}
