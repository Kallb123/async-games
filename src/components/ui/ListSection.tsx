'use client'

import { Children } from "react";
import CollapsingSection from "@/components/ui/CollapsingSection";
import Refreshable from "@/components/ui/Refreshable";
import { SkeletonRow, type SkeletonRowIcon } from "@/components/ui/Skeleton";
import useAnimatedList from "@/utils/hooks/useAnimatedList";

interface ListSectionProps {
    label?: string;
    /** Appends the number of rows to the label as `· N` once there are any. */
    showCount?: boolean;
    /** First load only — the one case that gets a skeleton. */
    isLoading: boolean;
    /** A later refetch — rows stay put and shimmer instead. */
    isRefreshing?: boolean;
    /** `0` for a list that is usually empty: no skeleton, no section, until it has loaded. */
    skeletonRows?: number;
    /** What the skeleton rows lead with — match the real rows they stand in for. */
    skeletonIcon?: SkeletonRowIcon;
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
    skeletonIcon = "avatar",
    action,
    beforeList,
    empty,
    hint,
    children,
}: ListSectionProps) {
    // Rows the list still has on screen: the real ones, the skeletons standing
    // in for them while they load, and any that have been removed and are
    // shrinking away — so the section outlives its last row. Handing the
    // skeletons to the hook rather than rendering them separately is what makes
    // the hand-over move as little as it can: a skeleton with a row to become
    // just becomes it, and only the surplus on either side grows or collapses.
    const rows = useAnimatedList(children, {
        isLoading,
        placeholder: { node: <SkeletonRow icon={skeletonIcon} />, count: skeletonRows },
    });
    const rowCount = Children.toArray(children).length;
    const isEmpty = !isLoading && rowCount === 0;
    // The `empty` message goes through the same animation, so it grows in while
    // the rows it replaces are still collapsing — and collapses itself when a
    // row finally turns up — instead of the two swapping in one jump. A lone
    // node takes its slot key from its position, and it is never loading:
    // whatever the list is doing, the message is either wanted or it isn't.
    const emptyMessage = useAnimatedList(isEmpty ? empty : null);

    // A list that is usually empty (the profile's friend requests) opts out of
    // the skeleton with `skeletonRows={0}`: two placeholder rows for requests
    // that probably aren't there read as a promise the response then breaks.
    // The hook still gets the real `isLoading`, so whatever lands is a handover
    // and appears without animating — only later arrivals grow in.
    if (isLoading && skeletonRows === 0) {
        return null;
    }
    if (isEmpty && rows.length === 0 && emptyMessage.length === 0) {
        return null;
    }
    return (
        <CollapsingSection
            label={label}
            count={showCount ? rowCount : undefined}
            action={action}
            collapsed={isEmpty && !empty}
            isLoading={isLoading}
        >
            {beforeList}
            {rows.length > 0 && (
                <Refreshable className="ag-list" isRefreshing={isRefreshing}>{rows}</Refreshable>
            )}
            {emptyMessage}
            {hint && rows.length > 0 && <p className="ag-hint">{hint}</p>}
        </CollapsingSection>
    );
}
