'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import MyCompleteList from "@/components/MyCompleteList";
import { useDashboard } from "@/utils/hooks/useDashboard";
import Avatar from "@/components/ui/Avatar";
import Brand from "@/components/ui/Brand";
import WhatsNew from "@/components/ui/WhatsNew";
import Link from "next/link";
import { profileImageUrl } from "@/utils/ui/avatar";
import { personalName } from "@/utils/ui/players";

/**
 * The signed-in home screen. `HomeScreen` decides who gets this and who gets
 * `Landing` — starting from the session cookie the server read, so a visitor
 * with no account never sees these skeletons flash past on their way to the
 * landing page, and someone with games waiting sees them in the first paint
 * rather than after Clerk has loaded in the browser.
 *
 * The guard stays for the locked-out account it sends to /unlockaccess; the
 * signed-out case is `HomeScreen`'s, so this never renders `Landing` itself.
 */
export default function Dashboard() {
  const { user } = useAuthGuard({ allowSignedOut: true });
  const { dashboard, isLoading, isRefreshing, refresh } = useDashboard();

  // No fallback name: until Clerk hands us the user, the badge in the top bar
  // shows a silhouette rather than an initial taken from a placeholder word.
  const displayName = personalName(user);

  return (
    <main>
      <FcmTokenComp />

      <div className="ag-topbar">
        <Brand />
        <div className="ag-topbar-actions">
          <Link href="/newgame" aria-label="New game" style={{ borderRadius: "50%", background: "var(--ag-green)", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>+</Link>
          <Link href="/profile" aria-label="Your profile">
            <Avatar name={displayName} imageUrl={profileImageUrl(user)} size={40} ring="var(--ag-terracotta)" />
          </Link>
        </div>
      </div>

      <MyTurnList games={dashboard.myTurn} isLoading={isLoading} isRefreshing={isRefreshing} />
      <IncomingInviteList invites={dashboard.incoming} isLoading={isLoading} isRefreshing={isRefreshing} onChanged={refresh} />
      <TheirTurnList games={dashboard.theirTurn} isLoading={isLoading} isRefreshing={isRefreshing} />
      <OutgoingInviteList invites={dashboard.outgoing} isLoading={isLoading} isRefreshing={isRefreshing} onChanged={refresh} />
      <MyCompleteList games={dashboard.completed} isLoading={isLoading} isRefreshing={isRefreshing} limit={10} />

      <div className="ag-section ag-btn-row" style={{ marginTop: 8 }}>
        <Link href="/newgame" aria-label="New game" className="ag-cta ag-cta--dark">
          <div className="ag-cta-main">
            <div className="ag-cta-title">New game</div>
            <div className="ag-cta-sub">Pick from the library</div>
          </div>
        </Link>
        <Link href="/profile" aria-label="Your profile" className="ag-cta" style={{ border: "2px solid var(--ag-dark)", color: "var(--ag-ink)" }}>
          <div className="ag-cta-main">
            <div className="ag-cta-title">Friends</div>
            <div className="ag-cta-sub">Challenge someone</div>
          </div>
        </Link>
      </div>

      <WhatsNew />
    </main>
  );
}
