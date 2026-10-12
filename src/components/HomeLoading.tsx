import AppRail from "@/components/ui/AppRail";
import Section from "@/components/ui/Section";
import Skeleton, { SkeletonRow, SkeletonTurnCard } from "@/components/ui/Skeleton";
import WhatsNew from "@/components/ui/WhatsNew";

/**
 * What Next shows instantly on a navigation to a route that has to be built
 * for the request, instead of leaving the click looking like it did nothing
 * until the response streams back. Each of those routes re-exports this as its
 * own `loading.tsx` (`lobby/`, `kingdombuilder/`, `games/kingdombuilder/`,
 * `profile/[userId]/`); `/join` has a shaped-to-it one of its own.
 *
 * There is deliberately no `app/loading.tsx`. A loading file is a Suspense
 * boundary round everything below it, and React only inlines a boundary that
 * fits in about 13kB: a bigger page is sent as this fallback plus the real
 * thing in a hidden block, swapped in by a script a third of a second after the
 * first paint — and never, with JavaScript off. Home is prerendered, far over
 * that, and picks its own screen before first paint (`HomeScreen`), so a root
 * boundary put a dashboard skeleton in front of every landing-page visitor.
 * It did the same to every other static page. Give a route a `loading.tsx`
 * only if it is built per request.
 *
 * Shaped after `Dashboard`, the most common destination, so the handover
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
 * The rail's loading bar is already sweeping, as `Dashboard`'s is until its
 * first response lands, so the handover doesn't blink it off and on.
 *
 * `WhatsNew` is rendered for real rather than skeletoned, as the rail is: it
 * waits on no request, so there is nothing for a placeholder to stand in for,
 * and it holds open the region the grid puts under the queue.
 */
export default function HomeLoading() {
    return (
        <main className="ag-desk">
            <AppRail busy />

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
