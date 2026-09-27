'use client'
import { PULL_THRESHOLD_PX, usePullToRefresh } from "@/utils/hooks/usePullToRefresh";

/**
 * Pull down from the top of the page to refresh it (see `usePullToRefresh`).
 *
 * Draws only the gesture: a round badge that follows the finger down, its arrow
 * turning over once the pull has gone far enough that letting go will refresh.
 * The wait after that is shown where the screen already shows it — the
 * dashboard's loading bar under the header — so there is still only one sign
 * that it is waiting on the network.
 */
export default function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
    const pull = usePullToRefresh(onRefresh);
    const armed = pull >= PULL_THRESHOLD_PX;
    return (
        <div
            className={`ag-pull${pull > 0 ? " ag-pull--dragging" : ""}${armed ? " ag-pull--armed" : ""}`}
            style={{ transform: `translate(-50%, ${pull}px)`, opacity: Math.min(1, pull / PULL_THRESHOLD_PX) }}
            aria-hidden="true"
        >
            <span className="ag-pull-arrow">↓</span>
        </div>
    );
}
