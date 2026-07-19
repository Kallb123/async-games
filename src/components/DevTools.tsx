'use client'

export default function DevTools() {
    const clearAll = async () => {
        await fetch('/api/dev/clearall');
    }

    return (
        <div style={{ marginTop: 10 }}>
            <button
                type="button"
                onClick={clearAll}
                style={{
                    background: "none",
                    border: "none",
                    font: "500 11px var(--ag-font)",
                    color: "var(--ag-ink-softer)",
                    textDecoration: "underline",
                    cursor: "pointer",
                }}
            >
                Dev: clear all
            </button>
        </div>
    );
}
