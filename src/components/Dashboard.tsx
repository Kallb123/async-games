'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import MyCompleteList from "@/components/MyCompleteList";
import { useDashboard } from "@/utils/hooks/useDashboard";
import Avatar from "@/components/ui/Avatar";
import Landing from "@/components/Landing";
import Brand from "@/components/ui/Brand";
import WhatsNew from "@/components/ui/WhatsNew";
import Link from "next/link";
import { profileImageUrl } from "@/utils/ui/avatar";

/**
 * The signed-in home screen. `app/page.tsx` decides on the server who gets
 * this and who gets `Landing`, from the session cookie, so a visitor with no
 * account never sees these skeletons flash past on their way to the landing
 * page — and someone with games waiting sees the skeletons in the first paint
 * rather than after Clerk has loaded in the browser.
 *
 * It still renders `Landing` itself for the one case the cookie can't settle:
 * a session that the server saw and Clerk then rejected in the browser
 * (signed out elsewhere, expired, revoked). Showing them the public page
 * beats bouncing them to /login from their own home screen.
 */
export default function Dashboard() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useAuthGuard({ allowSignedOut: true });
  // Above the Landing return so the hook order never changes. It costs a
  // signed-out visitor nothing: useRefreshableData doesn't fetch until the
  // viewer is authorised.
  const { dashboard, isLoading, isRefreshing, refresh } = useDashboard();

  if (isLoaded && !user) {
    return <Landing />;
  }

  const displayName = user?.firstName || user?.username || "there";

  return (
    <main>
      <FcmTokenComp />

      <div className="ag-topbar">
        <Brand />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "center" }}>
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
