'use client'
import type { IDashboardResponse } from "@/utils/apiModels/GameDataApi";
import { DASHBOARD_EVENTS } from "./usePushEvents";
import { useRefreshableData } from "./useRefreshableData";

// What the lists render before the first response lands. Shared rather than
// built per render: `games` and `invites` are props, and a fresh [] every
// render would restart the card animations (see useAnimatedList).
const NOTHING_YET: IDashboardResponse = {
    myTurn: [], theirTurn: [], incoming: [], outgoing: [], completed: []
};

/**
 * The home screen's one fetch. Every list on it reads from this — see
 * `buildDashboard` for why they share a read rather than each owning one.
 *
 * Polls while the viewer is watching, because most of what changes a dashboard
 * no longer pushes: a seat being claimed, an invite being cancelled, a game
 * starting for somebody who isn't first to move. Those are not worth a
 * notification and there is no silent kind to send (see usePushEvents), so the
 * screen asks. One request per tick now, where five lists would have been five.
 */
export function useDashboard() {
    const { data, isLoading, isRefreshing, refresh } = useRefreshableData<IDashboardResponse>(
        '/api/dashboard',
        DASHBOARD_EVENTS,
        { pollWhileWatching: true }
    );

    return { dashboard: data ?? NOTHING_YET, isLoading, isRefreshing, refresh };
}
