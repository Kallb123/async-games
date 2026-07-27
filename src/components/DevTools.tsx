'use client'

export default function DevTools() {
    const clearLive = async () => {
        await fetch('/api/dev/clearlive');
    }
    const clearResults = async () => {
        await fetch('/api/dev/clearresults');
    }

    return (
        <>
            <div style={{ marginTop: 10 }}>
                <button
                    type="button"
                    onClick={clearLive}
                    style={{
                        background: "none",
                        border: "none",
                        font: "500 11px var(--ag-font)",
                        color: "var(--ag-ink-softer)",
                        textDecoration: "underline",
                        cursor: "pointer",
                    }}
                >
                    Dev: clear live games and invites
                </button>
            </div>
            <div style={{ marginTop: 10 }}>
                <button
                    type="button"
                    onClick={clearResults}
                    style={{
                        background: "none",
                        border: "none",
                        font: "500 11px var(--ag-font)",
                        color: "var(--ag-ink-softer)",
                        textDecoration: "underline",
                        cursor: "pointer",
                    }}
                >
                    Dev: clear results
                </button>
            </div>
        </>
    );
}
