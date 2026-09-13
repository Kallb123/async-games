'use client'

import { isDevDeployment } from "@/utils/devEnvironment";

/** One-click wipes, so they never reach the production deployment —
 *  `/api/dev/*` refuses the calls there too, this just hides the buttons.
 *
 *  The last one clears Clerk rather than Mongo: nothing sweeps guests off a
 *  dev instance (the cron only fires on production), so they pile up there
 *  until somebody removes them — see the route. */
const DEV_ACTIONS = [
    { label: 'Dev: clear live games and invites', path: '/api/dev/clearlive' },
    { label: 'Dev: clear results', path: '/api/dev/clearresults' },
    { label: 'Dev: sweep guest accounts', path: '/api/dev/clearguests' },
];

export default function DevTools() {
    if (!isDevDeployment) {
        return null;
    }

    return (
        <>
            {DEV_ACTIONS.map(action => (
                <div key={action.path} className="ag-footer-action">
                    <button
                        type="button"
                        className="ag-link-muted"
                        onClick={() => { fetch(action.path); }}
                    >
                        {action.label}
                    </button>
                </div>
            ))}
        </>
    );
}
