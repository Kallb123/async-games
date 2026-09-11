import AppRail from "@/components/ui/AppRail";
import Section from "@/components/ui/Section";
import Skeleton, { SkeletonRow, SkeletonTurnCard } from "@/components/ui/Skeleton";
import WhatsNew from "@/components/ui/WhatsNew";

/**
 * `page.tsx` calls `auth()` to decide between `Dashboard` and `Landing`,
 * which makes `/` dynamic — Next shows this instantly on navigation while
 * that decision is made server-side, instead of leaving the click looking
 * like it did nothing until the response streams back.
 *
 * Shaped after `Dashboard`, the more common destination, so the handover
 * doesn't jump: the same `.ag-desk` shell and all four of its regions, so a
 * wide window lays this out exactly where the real screen will be, the same
 * `AppRail` (with no games to switch between yet), the "your move" hero and a
 * turn card, then
 * the same run of list sections in the same order — real labels, the same
 * `skeletonIcon` each list already shows itself while loading (`ListSection`'s
 * own `isLoading` skeleton), just rendered here a beat earlier. Still the right
 * first frame for `Landing`: skeletons and section labels, nothing a signed-out
 * visitor could mistake for real content. The rail is the one live thing here
 * — its links work before anyone has been identified — but it names no games
 * and no player, and a visitor who follows one lands on /login, which is where
 * they were going anyway.
 *
 * `WhatsNew` is rendered for real rather than skeletoned, as the rail is: it
 * waits on no request, so there is nothing for a placeholder to stand in for,
 * and it holds open the region the grid puts under the queue.
 */
export default function Loading() {
    return (
        <main className="ag-desk">
            <AppRail />

            <div className="ag-desk-col ag-desk-col--main">
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
            </div>

            <div className="ag-desk-col ag-desk-col--side">
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
            </div>

            <div className="ag-desk-col ag-desk-col--notes">
                <WhatsNew />
            </div>
        </main>
    );
}
