'use client'

import { isDevDeployment } from "@/utils/devEnvironment";

/** One-click database wipes, so they never reach the production deployment —
 *  `/api/dev/*` refuses the calls there too, this just hides the buttons. */
const DEV_ACTIONS = [
    { label: 'Dev: clear live games and invites', path: '/api/dev/clearlive' },
    { label: 'Dev: clear results', path: '/api/dev/clearresults' },
];

export default function DevTools() {
    if (!isDevDeployment) {
        return null;
    }

    return (
        <>
            {DEV_ACTIONS.map(action => (
                <div key={action.path} style={{ marginTop: 10 }}>
                    <button
                        type="button"
                        className="ag-link-muted"
                        style={{ textDecoration: "underline" }}
                        onClick={() => { fetch(action.path); }}
                    >
                        {action.label}
                    </button>
                </div>
            ))}
        </>
    );
}
