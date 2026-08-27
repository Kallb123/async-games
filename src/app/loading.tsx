import Brand from "@/components/ui/Brand";
import Section from "@/components/ui/Section";
import Skeleton, { SkeletonRow, SkeletonTurnCard } from "@/components/ui/Skeleton";

/**
 * `page.tsx` calls `auth()` to decide between `Dashboard` and `Landing`,
 * which makes `/` dynamic — Next shows this instantly on navigation while
 * that decision is made server-side, instead of leaving the click looking
 * like it did nothing until the response streams back.
 *
 * Shaped after `Dashboard`, the more common destination, so the handover
 * doesn't jump: same topbar (brand + the "new game"/avatar circles), the
 * "your move" hero and a turn card, then the same run of list sections in
 * the same order — real labels, the same `skeletonIcon` each list already
 * shows itself while loading (`ListSection`'s own `isLoading` skeleton), just
 * rendered here a beat earlier. Still the right first frame for `Landing`:
 * skeletons and section labels, nothing a signed-out visitor could mistake
 * for real content.
 */
export default function Loading() {
    return (
        <main>
            <div className="ag-topbar">
                <Brand />
                <div className="ag-topbar-actions" aria-hidden>
                    <Skeleton width={40} height={40} radius="50%" />
                    <Skeleton width={40} height={40} radius="50%" />
                </div>
            </div>

            <div className="ag-hero" aria-hidden>
                <Skeleton width="55%" height={28} />
                <Skeleton width="75%" height={16} style={{ marginTop: 10 }} />
            </div>
            <div className="ag-section">
                <div className="ag-stack" aria-hidden>
                    <SkeletonTurnCard />
                </div>
            </div>

            <Section label="Invites" isLoading>
                <div className="ag-list">
                    <SkeletonRow icon="avatar" />
                    <SkeletonRow icon="avatar" />
                </div>
            </Section>
            <Section label="Waiting on others" isLoading>
                <div className="ag-list">
                    <SkeletonRow icon="dot" />
                    <SkeletonRow icon="dot" />
                </div>
            </Section>
            <Section label="Awaiting response" isLoading>
                <div className="ag-list">
                    <SkeletonRow icon="dot" />
                    <SkeletonRow icon="dot" />
                </div>
            </Section>
            <Section label="Finished" isLoading>
                <div className="ag-list">
                    <SkeletonRow icon="dot" />
                    <SkeletonRow icon="dot" />
                    <SkeletonRow icon="dot" />
                    <SkeletonRow icon="dot" />
                </div>
            </Section>
        </main>
    );
}
