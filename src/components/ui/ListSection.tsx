'use client'

import { SkeletonRow } from "@/components/ui/Skeleton";

interface ListSectionProps {
    label: string;
    isLoading: boolean;
    hasItems: boolean;
    skeletonRows?: number;
    children: React.ReactNode;
}

// An `ag-section` that hides itself once loaded with nothing to show, and
// swaps in `SkeletonRow`s while loading. Shared by profile screens' list
// sections (stats by game, reactions received, …) that all follow the same
// "loading skeleton, then an ag-list of rows, or nothing" shape.
export default function ListSection({ label, isLoading, hasItems, skeletonRows = 2, children }: ListSectionProps) {
    if (!isLoading && !hasItems) {
        return null;
    }
    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">{label}</h2>
            </div>
            {isLoading
                ? (
                    <div className="ag-list" aria-busy="true">
                        {Array.from({ length: skeletonRows }).map((_, i) => <SkeletonRow key={i} />)}
                    </div>
                )
                : children}
        </div>
    );
}
