'use client'
import { use, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useToast } from "@/components/ToastContext";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { INVITE_EVENTS } from "@/utils/hooks/usePushEvents";
import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { OPEN_SEAT_LABEL } from "@/utils/games/lobby";
import { buildJoinHref } from "@/utils/games/joinCode";
import { metaForGame, partySizeErrorMessage } from "@/utils/ui/games";
import { shareOrCopyLink } from "@/utils/ui/share";
import { fetchWithSessionRetry } from "@/utils/hooks/fetchWithSessionRetry";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import ListSection from "@/components/ui/ListSection";
import ListRow from "@/components/ui/ListRow";
import Avatar from "@/components/ui/Avatar";
import PartySizeHint from "@/components/ui/PartySizeHint";

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
  const [starting, setStarting] = useState(false);

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
  // Whether the screen is still here to be redirected. The lookup below can
  // resolve after the player has gone (fetchWithSessionRetry waits out a
  // transient 401 before retrying), and a toast and a push on an unmounted
  // screen would land them somewhere they didn't ask to be.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
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
      const response = await fetchWithSessionRetry(`/api/lobby/${inviteId}/game`, () => !mountedRef.current);
      const started = response?.ok ? await response.json() : null;
      if (!mountedRef.current) return;
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

  // What the card hands over is the code's second form: a link that opens
  // /join with the code already in the box (docs/account-less-play.md §4).
  // "Go to the site, tap Join, type PLUM" is three instructions a friend can
  // abandon at any one of them; a link is one tap, and it is a strict superset
  // of the code it contains — which is why this is a change to the control
  // that's already here rather than a second button beside it. The code stays
  // on screen, large, for whoever is sitting opposite and typing it.
  const handleShare = async () => {
    const joinCode = invite?.joinCode;
    if (!joinCode) return;
    const url = `${window.location.origin}${buildJoinHref(joinCode)}`;
    const result = await shareOrCopyLink(url, `Join my game — the code is ${joinCode}.`);
    if (result === 'copied') showToast('Link copied!', 'success');
    if (result === 'failed') showToast('Could not copy — share the code instead.', 'danger');
  };

  // The party if the host starts right now: every claimed seat plus the host,
  // which is what POST /api/lobby/start leaves once it drops the empty ones.
  const partySize = claimedSeats.length + 1;
  const startError = meta ? partySizeErrorMessage(meta, partySize) : null;

  // The way out of a lobby whose last friends never turned up. There is no
  // second start rule: the route drops the unclaimed seats and the existing
  // all-accepted predicate does the rest, so a lobby still waiting on a named
  // invitee stays put and says so.
  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const response = await fetch('/api/lobby/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId })
      });
      if (!response.ok) {
        showToast("Couldn't start the game just yet — try again.", 'danger');
        setStarting(false);
        return;
      }
      const { gameStarted, gameId, gameUrl } = await response.json();
      if (gameStarted) {
        // Claim the exit before the refresh loop sees the invitation vanish,
        // so the 404 above doesn't send them a second time.
        leavingRef.current = true;
        enterStartedGame(gameUrl, gameId);
      } else {
        showToast('Waiting on the players you invited by name.', 'success', 'Seats Closed');
        setStarting(false);
      }
    } catch (error) {
      console.error(error);
      showToast("Couldn't start the game just yet — try again.", 'danger');
      setStarting(false);
    }
  };

  return (
    <main>
      <GameIdentityHeader backHref="/" backLabel="Back home" meta={meta} title={isHost ? "Your lobby" : "The lobby"} subtitle={meta?.name} />

      <div className="ag-section">
        <button
          type="button"
          className="ag-card ag-joincode-card"
          onClick={handleShare}
          disabled={!invite?.joinCode}
        >
          <div className="ag-section-label">
            Tap to share
          </div>
          <div className="ag-joincode" style={{ "--ag-joincode-size": "44px", marginTop: 4 } as React.CSSProperties}>
            {invite?.joinCode ?? "····"}
          </div>
        </button>
        <p className="ag-hint" style={{ textAlign: "center" }}>Sends a link that opens straight onto an open seat — or read the code out.</p>
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

      {isHost && invite && (
        <div className="ag-section">
          <button
            type="button"
            className="ag-btn ag-btn--primary ag-btn--block"
            onClick={handleStart}
            disabled={starting || !!startError}
          >
            {starting ? 'Starting…' : 'Start now'}
          </button>
          {startError && meta
            ? <PartySizeHint meta={meta} total={partySize} />
            : <p className="ag-hint" style={{ textAlign: "center" }}>Begins with everyone who&apos;s here — the empty seats are dropped.</p>}
        </div>
      )}

      <FcmTokenComp />
    </main>
  );
}
