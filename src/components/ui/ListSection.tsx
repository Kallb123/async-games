'use client'

import Refreshable from "@/components/ui/Refreshable";
import { SkeletonRow } from "@/components/ui/Skeleton";
import useAnimatedList from "@/utils/hooks/useAnimatedList";

interface ListSectionProps {
    label: string;
    /** Appends the number of rows to the label as `· N` once there are any. */
    showCount?: boolean;
    /** First load only — the one case that gets a skeleton. */
    isLoading: boolean;
    /** A later refetch — rows stay put and shimmer instead. */
    isRefreshing?: boolean;
    /** `0` for a list that is usually empty: no skeleton, no section, until it has loaded. */
    skeletonRows?: number;
    /** Skeleton rows lead with an avatar circle; false gives the small status dot. */
    skeletonAvatar?: boolean;
    /** Control rendered on the right of the section heading. */
    action?: React.ReactNode;
    /** Rendered between the heading and the list (e.g. an inline form). */
    beforeList?: React.ReactNode;
    /** Shown instead of hiding the section when there is nothing to list. */
    empty?: React.ReactNode;
    /** Optional note rendered under the list (an `ag-hint`). */
    hint?: React.ReactNode;
    /** The `ag-list-row`s themselves — the `ag-list` card is this component's. */
    children: React.ReactNode;
}

// An `ag-section` that hides itself once loaded with nothing to show (unless
// given an `empty` message), shows `SkeletonRow`s on first load, shimmers its
// existing rows during a background refresh, and grows rows in and out as they
// come and go. Shared by every "heading + ag-list of rows" section: the home
// dashboard's turn/invite lists, the profile screens' friends, stats and
// reactions, the settings device list.
export default function ListSection({
    label,
    showCount = false,
    isLoading,
    isRefreshing = false,
    skeletonRows = 2,
    skeletonAvatar = true,
    action,
    beforeList,
    empty,
    hint,
    children,
}: ListSectionProps) {
    // Rows the list still has on screen — which includes any that have been
    // removed and are shrinking away, so the section outlives its last row.
    const rows = useAnimatedList(children, isLoading);

    // A list that is usually empty (the profile's friend requests) opts out of
    // the skeleton with `skeletonRows={0}`: two placeholder rows for requests
    // that probably aren't there read as a promise the response then breaks.
    // The hook still gets the real `isLoading`, so whatever lands is a handover
    // and appears without animating — only later arrivals grow in.
    if (isLoading && skeletonRows === 0) {
        return null;
    }
    if (!isLoading && rows.length === 0 && !empty) {
        return null;
    }
    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">{label}{showCount && rows.length ? ` · ${rows.length}` : ""}</h2>
                {action}
            </div>
            {beforeList}
            {isLoading
                ? (
                    <div className="ag-list" aria-busy="true">
                        {Array.from({ length: skeletonRows }).map((_, i) => <SkeletonRow key={i} avatar={skeletonAvatar} />)}
                    </div>
                )
                : rows.length === 0
                ? empty
                : (
                    <>
                        <Refreshable className="ag-list" isRefreshing={isRefreshing}>{rows}</Refreshable>
                        {hint && <p className="ag-hint">{hint}</p>}
                    </>
                )}
        </div>
    );
}
