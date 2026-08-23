'use client'
import { use, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useToast } from "@/components/ToastContext";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { INVITE_EVENTS } from "@/utils/hooks/usePushEvents";
import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { OPEN_SEAT_LABEL } from "@/utils/games/lobby";
import { metaForGame } from "@/utils/ui/games";
import BackLink from "@/components/ui/BackLink";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import ListSection from "@/components/ui/ListSection";
import ListRow from "@/components/ui/ListRow";
import Avatar from "@/components/ui/Avatar";

// The host's view of a lobby they just created: the code to share, and the
// seats filling up live. Reuses /api/user/outgoinginvites — the same list
// OutgoingInviteList already renders a lobby's open seats into — rather than
// a single-invite endpoint of its own.
export default function Lobby({ params }: { params: Promise<{ inviteId: string }> }) {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { inviteId } = use(params);
  useAuthGuard();
  const router = useRouter();
  const { showToast } = useToast();

  const { data, isLoading, isRefreshing } = useRefreshableData<{ inviteList: IInvitationResponse[] }>(
    '/api/user/outgoinginvites',
    INVITE_EVENTS,
  );

  const invite = data?.inviteList.find(i => i.inviteId === inviteId);

  // Once the lobby has been seen, its disappearing means the last seat was
  // just claimed and the game started (invitations are deleted on start —
  // see startGameFromInvitation). Never having been seen at all means the
  // code was wrong, or the lobby already expired.
  const everSeenRef = useRef(false);
  useEffect(() => {
    if (!data) return;
    if (invite) {
      everSeenRef.current = true;
      return;
    }
    if (everSeenRef.current) {
      showToast('Game is starting! Look for it on your home screen.', 'success', 'Game Started');
    } else {
      showToast("That lobby isn't open any more.", 'danger');
    }
    router.push('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, invite]);

  const meta = invite ? metaForGame({ friendlyName: invite.gameFriendlyName }) : undefined;
  const seats = invite?.userList ?? [];
  const claimedSeats = seats.filter(name => name !== OPEN_SEAT_LABEL);

  const handleCopy = () => {
    if (!invite?.joinCode) return;
    navigator.clipboard.writeText(invite.joinCode)
      .then(() => showToast('Copied!', 'success'))
      .catch(() => showToast('Could not copy — copy it by hand instead.', 'danger'));
  };

  return (
    <main>
      <div className="ag-topbar">
        <div className="ag-topbar-title">
          <BackLink href="/" label="Back home" />
          {meta && <GameThumb meta={meta} size={ROW_THUMB_SIZE} radius={ROW_THUMB_RADIUS} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 20px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>Your lobby</div>
            {meta && <div style={{ font: "500 11.5px var(--ag-font)", color: "var(--ag-ink-soft)" }}>{meta.name}</div>}
          </div>
        </div>
      </div>

      <div className="ag-section">
        <button
          type="button"
          className="ag-card"
          onClick={handleCopy}
          disabled={!invite?.joinCode}
          style={{
            width: "100%", padding: "22px 16px", textAlign: "center",
            border: "1.5px dashed var(--ag-line)", background: "var(--ag-surface)", cursor: "pointer",
          }}
        >
          <div style={{ font: "800 12px var(--ag-font)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ag-ink-soft)" }}>
            Tap to copy
          </div>
          <div style={{ font: "800 44px/1.1 var(--ag-font)", letterSpacing: "0.16em", color: "var(--ag-ink)", marginTop: 4 }}>
            {invite?.joinCode ?? "····"}
          </div>
        </button>
        <p className="ag-hint" style={{ textAlign: "center" }}>Share this code — anyone who enters it grabs an open seat.</p>
      </div>

      <ListSection
        label="Seats"
        showCount
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        empty={<div className="ag-empty">No one&apos;s joined yet — share your code above.</div>}
      >
        {claimedSeats.length === 0 ? [] : seats.map((name, i) => (
          name === OPEN_SEAT_LABEL ? (
            <ListRow
              key={`seat-${i}`}
              icon="🪑"
              title={<span className="ag-dashed-add">Open seat</span>}
              sub="Waiting for a player"
            />
          ) : (
            <ListRow
              key={`seat-${i}`}
              icon={<Avatar name={name} size={34} />}
              title={name}
            />
          )
        ))}
      </ListSection>

      <FcmTokenComp />
    </main>
  );
}
