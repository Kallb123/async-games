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
import { fetchWithSessionRetry } from "@/utils/hooks/fetchWithSessionRetry";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import ListSection from "@/components/ui/ListSection";
import ListRow from "@/components/ui/ListRow";
import Avatar from "@/components/ui/Avatar";

// Where everyone with a seat waits: the host who opened the lobby and each
// player who has claimed a seat with the code. Same screen for both — the code
// to share, and the seats filling up live — because they are waiting for the
// same thing, and it takes them all into the game the moment the last seat
// goes.
export default function Lobby({ params }: { params: Promise<{ inviteId: string }> }) {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { inviteId } = use(params);
  useAuthGuard();
  const router = useRouter();
  const { showToast } = useToast();
  const enterStartedGame = useEnterStartedGame();

  // One lobby, whichever seat the viewer holds — the host's own invitation and
  // a seat-holder's are the same document, but they arrive in different lists
  // (/api/user/outgoinginvites vs incominginvites), so this screen reads the
  // one it is about directly.
  const { data, isLoading, isRefreshing, status } = useRefreshableData<{ invite: IInvitationResponse, isHost: boolean }>(
    `/api/lobby/${inviteId}`,
    INVITE_EVENTS,
  );

  const invite = data?.invite;
  const isHost = data?.isHost === true;

  // Once the lobby has been seen, a 404 means the last seat was just claimed
  // and the game started (invitations are deleted on start — see
  // startGameFromInvitation). Never having been seen at all means the code was
  // wrong, or the lobby already expired.
  const everSeenRef = useRef(false);
  // Set the moment we start leaving, so a refresh landing while the lookup
  // below is still in flight doesn't kick off a second one.
  const leavingRef = useRef(false);
  useEffect(() => {
    if (invite) {
      everSeenRef.current = true;
    }
    // Only a 404 means the lobby is over: a network blip or a 500 leaves the
    // player where they are. Read before `invite`, which deliberately holds
    // the last good response (see useRefreshableData) and so survives it.
    if (status !== 404 || leavingRef.current) return;
    leavingRef.current = true;
    if (!everSeenRef.current) {
      showToast("That lobby isn't open any more.", 'danger');
      router.push('/');
      return;
    }
    // The game exists by the time the invitation is gone (it is saved first),
    // so ask which game this lobby became and go straight to the board — the
    // same landing a joiner gets from /api/lobby/join. A lobby that was
    // cancelled or expired rather than started has no game: fall back home.
    (async () => {
      const response = await fetchWithSessionRetry(`/api/lobby/${inviteId}/game`, () => false);
      const started = response?.ok ? await response.json() : null;
      if (started?.gameId) {
        enterStartedGame(started.gameUrl, started.gameId);
      } else {
        showToast('Game is starting! Look for it on your home screen.', 'success', 'Game Started');
        router.push('/');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, invite]);

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
      <GameIdentityHeader backHref="/" backLabel="Back home" meta={meta} title={isHost ? "Your lobby" : "The lobby"} subtitle={meta?.name} />

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
        {!invite || claimedSeats.length === 0 ? [] : [
          // The host holds no seat in the invitation (they're its sender), so
          // they'd otherwise be missing from their own lobby — and from a
          // seat-holder's view of it, where that reads as the host having left.
          <ListRow
            key="host"
            icon={<Avatar name={invite.sender} imageUrl={invite.senderImageUrl} size={34} />}
            title={invite.sender}
            sub="Host"
          />,
          ...seats.map((name, i) => (
            name === OPEN_SEAT_LABEL ? (
              <ListRow
                key={`seat-${i}`}
                icon="🪑"
                title={
                  // .ag-dashed-add is styled as a button (cursor, hover) elsewhere;
                  // this seat isn't clickable, so pointer-events:none keeps the
                  // dashed-pill look without the borrowed interactivity cues.
                  <span className="ag-dashed-add" style={{ cursor: "default", pointerEvents: "none" }}>Open seat</span>
                }
                sub="Waiting for a player"
              />
            ) : (
              <ListRow
                key={`seat-${i}`}
                icon={<Avatar name={name} size={34} />}
                title={name}
              />
            )
          )),
        ]}
      </ListSection>

      <FcmTokenComp />
    </main>
  );
}
