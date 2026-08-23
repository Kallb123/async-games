'use client'
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
// The classic isLoaded/signIn/setActive shape, not @clerk/nextjs's default
// signals-based useSignIn — this is a one-off custom sign-in flow (the
// ticket strategy a guest's claim hands back), and every other Clerk usage
// in the app is the declarative <SignIn/>/<SignUp/> component, so there's no
// existing custom-flow convention this needs to match either way.
import { useSignIn } from "@clerk/nextjs/legacy";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useToast } from "@/components/ToastContext";
import AuthScreen from "@/components/ui/AuthScreen";
import BackLink from "@/components/ui/BackLink";
import { JOIN_CODE_LENGTH, normaliseJoinCode, readJoinCode } from "@/utils/games/joinCode";
import { MAX_GUEST_NAME_LENGTH, isValidGuestName } from "@/utils/games/guestName";
import { readResumeTicket } from "@/utils/users/resumeLink";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";
import ResumeLinkOffer from "@/components/ui/ResumeLinkOffer";
import type { ILobbyPreviewResponse } from "@/app/api/lobby/code/[code]/route";

// What a code that opens nothing gets told — the same sentence whether the
// route refused it or the request never landed, so it's written once.
const BAD_CODE_MESSAGE = "That code doesn't work — check it and try again.";

// The code field and submit button, shared by the signed-in form below and
// the signed-out guest form beside it — same field, same button, on two
// screens that otherwise differ in what else they ask for.
function JoinCodeField({ code, onChange }: { code: string; onChange: (value: string) => void }) {
  return (
    <input
      className="ag-input ag-joincode"
      type="text"
      autoComplete="off"
      autoCapitalize="characters"
      maxLength={8}
      value={code}
      onChange={(e) => onChange(e.target.value)}
      placeholder="PLUM"
      aria-label="Join code"
    />
  );
}

function JoinButton({ joining, disabled }: { joining: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      className="ag-btn ag-btn--primary ag-btn--block"
      style={{ marginTop: 12 }}
      disabled={disabled}
    >
      {joining ? 'Joining…' : 'Join game'}
    </button>
  );
}

interface JoinResult {
    gameStarted: boolean;
    gameId?: string;
    gameUrl?: string;
    inviteId: string;
    alreadySeated?: boolean;
    // Present only when the join minted a guest (docs/account-less-play.md
    // §14) — the client's one round trip through Clerk to turn a brand-new
    // guest account into a signed-in session.
    ticket?: string;
    // Present alongside `ticket`: the guest's resume fallback
    // (docs/account-less-play.md §2/§15), shown once before they leave this
    // screen.
    resumeUrl?: string;
}

// A code-holder with an account, landing here from a link or by typing the
// URL. A guest with no account belongs on this same route, but goes through
// its own signed-out lockup (AuthScreen) below — the join link isn't a
// convenience for them, it's the whole flow.
function JoinForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useAuthGuard({ allowSignedOut: true });
  const { signIn, setActive } = useSignIn();
  const router = useRouter();
  const { showToast } = useToast();
  const enterStartedGame = useEnterStartedGame();
  const searchParams = useSearchParams();
  // A shared link carries the code (docs/account-less-play.md §4) — it lands
  // in the field rather than joining on arrival, because arriving at a URL is
  // a read and link unfurlers, prefetchers and stray taps all perform reads.
  // The player still takes the seat with the tap the screen already has, and
  // sees what they're joining first.
  const linkedCode = readJoinCode(searchParams);
  const [code, setCode] = useState(linkedCode);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  // A guest's saved resume link (docs/account-less-play.md §2/§15) lands here
  // instead of a join code — signing back in is the whole flow, so it's
  // handled before anything below asks for a code. `resuming` starts true
  // only when there's a ticket to consume, and stays true (rather than being
  // read straight off the URL a second time) so the effect below can clear it
  // once without racing a re-render.
  const resumeTicket = readResumeTicket(searchParams);
  const [resuming, setResuming] = useState(!!resumeTicket);
  // The same resume link, offered back once right after a brand-new guest's
  // ticket sign-in completes (below) — nothing persists it, so this is the
  // only time it's ever on screen.
  const [resumeOffer, setResumeOffer] = useState<{ url: string; result: JoinResult } | null>(null);

  useEffect(() => {
    if (!resuming || !isLoaded) return;
    if (user) {
      // Already signed in — on this device, or a second tap on the same
      // link — so there's no ticket to consume.
      setResuming(false);
      return;
    }
    if (!signIn || !setActive) return;
    (async () => {
      try {
        const attempt = await signIn.create({ strategy: 'ticket', ticket: resumeTicket! });
        if (attempt.status === 'complete' && attempt.createdSessionId) {
          await setActive({ session: attempt.createdSessionId });
        } else {
          showToast("That link has expired.", 'danger');
        }
      } catch (error) {
        console.error(error);
        showToast("That link has expired.", 'danger');
      } finally {
        setResuming(false);
        router.replace('/');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resuming, isLoaded, user, signIn, setActive]);
  // Tagged with the code it was fetched for, rather than cleared directly:
  // setting it from inside the effect below on an incomplete code would be a
  // synchronous setState in an effect body (react-hooks/set-state-in-effect),
  // and deriving `preview` from the tag also means a code someone is still
  // editing never shows a stale lobby's details (see useGameResult.ts, same
  // shape).
  const [fetchedPreview, setFetchedPreview] = useState<{ joinCode: string; preview: ILobbyPreviewResponse | null } | null>(null);

  // The lobby preview §4 deferred: a guest with no account of their own is
  // being asked for a name by a site they've never used, and deserves to
  // know whose game it is before they hand it over. Only matters for the
  // signed-out screen below — fetched as soon as a complete code is on
  // screen, whether it arrived by link or by typing.
  useEffect(() => {
    if (user) return;
    const joinCode = normaliseJoinCode(code);
    if (joinCode.length !== JOIN_CODE_LENGTH) return;
    let cancelled = false;
    fetch(`/api/lobby/code/${joinCode}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!cancelled) setFetchedPreview({ joinCode, preview: data }); })
      .catch(() => { if (!cancelled) setFetchedPreview({ joinCode, preview: null }); });
    return () => { cancelled = true; };
  }, [code, user]);

  const preview = fetchedPreview?.joinCode === normaliseJoinCode(code) ? fetchedPreview.preview : null;

  // Shared by both submit handlers below: post the code (and, for a guest, a
  // name) and turn a failed response into the one toast either flow shows.
  const submitJoin = async (joinCode: string, guestName?: string): Promise<JoinResult | null> => {
    const response = await fetch('/api/lobby/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(guestName === undefined ? { joinCode } : { joinCode, name: guestName })
    });
    if (!response.ok) {
      // A full lobby reads differently from a code that opens nothing: the
      // code was right, there was just nowhere to sit. Branch on the status
      // rather than the route's statusText, which HTTP/2 doesn't carry.
      showToast(response.status === 409
        ? "That lobby's full — every seat is taken."
        : BAD_CODE_MESSAGE, 'danger');
      return null;
    }
    return response.json();
  };

  // Into the lobby with the host and whoever else has claimed a seat, rather
  // than home: the remaining seats fill live there, and it takes everyone
  // waiting on it straight into the game once they do.
  const enterLobby = (result: JoinResult) => {
    if (result.gameStarted) {
      enterStartedGame(result.gameUrl!, result.gameId!);
      return;
    }
    const { title, body } = result.alreadySeated
      ? { title: 'Already In', body: "You're already in this one — here's the lobby." }
      : { title: 'Seat Claimed', body: "You're in! Waiting for the rest of the party." };
    showToast(body, 'success', title);
    router.push(`/lobby/${result.inviteId}`);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const joinCode = normaliseJoinCode(code);
    if (!joinCode || joining) return;
    setJoining(true);

    try {
      const result = await submitJoin(joinCode);
      if (!result) {
        setJoining(false);
        return;
      }
      enterLobby(result);
    } catch (error) {
      console.error(error);
      showToast(BAD_CODE_MESSAGE, 'danger');
      setJoining(false);
    }
  };

  const handleGuestSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const joinCode = normaliseJoinCode(code);
    const guestName = name.trim();
    if (!joinCode || !isValidGuestName(guestName) || joining || !signIn || !setActive) return;
    setJoining(true);

    try {
      const result = await submitJoin(joinCode, guestName);
      if (!result?.ticket) {
        setJoining(false);
        return;
      }
      // The seat is already claimed server-side; this is just turning the
      // brand-new guest account it minted into a session on this device.
      const signInAttempt = await signIn.create({ strategy: 'ticket', ticket: result.ticket });
      if (signInAttempt.status !== 'complete' || !signInAttempt.createdSessionId) {
        throw new Error('Guest sign-in did not complete');
      }
      await setActive({ session: signInAttempt.createdSessionId });
      // The resume link is this guest's only way back if they close the tab
      // (docs/account-less-play.md §2/§15) — offered once, here, before
      // they're carried on into the lobby.
      if (result.resumeUrl) {
        setResumeOffer({ url: result.resumeUrl, result });
      } else {
        enterLobby(result);
      }
    } catch (error) {
      console.error(error);
      showToast(BAD_CODE_MESSAGE, 'danger');
      setJoining(false);
    }
  };

  if (!isLoaded || resuming) {
    return null;
  }

  if (resumeOffer) {
    return (
      <AuthScreen title="You're in!" subtitle="Save your way back before you go any further.">
        <div className="ag-section" style={{ width: "100%" }}>
          <ResumeLinkOffer url={resumeOffer.url} />
          <button
            type="button"
            className="ag-btn ag-btn--primary ag-btn--block"
            style={{ marginTop: 12 }}
            onClick={() => enterLobby(resumeOffer.result)}
          >
            Continue to lobby
          </button>
        </div>
      </AuthScreen>
    );
  }

  if (!user) {
    const seatsLeft = preview
      ? `${preview.openSeatCount} seat${preview.openSeatCount === 1 ? '' : 's'} left`
      : '';
    const title = preview ? "You're invited!" : (linkedCode ? "You've been invited" : "Got a code?");
    const subtitle = preview
      ? `${preview.sender} invited you to ${preview.gameFriendlyName} — ${seatsLeft}.`
      : "Enter your host's code and pick a name to grab an open seat.";

    return (
      <AuthScreen title={title} subtitle={subtitle}>
        <form onSubmit={handleGuestSubmit} className="ag-section" style={{ width: "100%" }}>
          <JoinCodeField code={code} onChange={setCode} />
          <input
            className="ag-input"
            type="text"
            autoComplete="off"
            maxLength={MAX_GUEST_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            style={{ marginTop: 12 }}
          />
          <JoinButton joining={joining} disabled={joining || !normaliseJoinCode(code) || !isValidGuestName(name.trim())} />
        </form>
      </AuthScreen>
    );
  }

  return (
    <main>
      <div className="ag-topbar">
        <div className="ag-topbar-title">
          <BackLink href="/" label="Back home" />
          <span className="ag-wordmark">Join a game</span>
        </div>
      </div>

      <div className="ag-hero">
        {/* One screen, not two: a link and a bare URL differ in the copy that
            greets them and nothing else. Branching on the code the link
            carried rather than the field means it doesn't change as they type. */}
        <h1 className="ag-hero-title">{linkedCode ? "You've been invited" : "Got a code?"}</h1>
        <p className="ag-hero-sub">
          {linkedCode
            ? "Your seat is waiting — tap below to take it."
            : "Enter the code your host shared to grab an open seat."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ag-section">
        <JoinCodeField code={code} onChange={setCode} />
        <JoinButton joining={joining} disabled={joining || !normaliseJoinCode(code)} />
      </form>

      <FcmTokenComp />
    </main>
  );
}

// useSearchParams needs a Suspense boundary to be read during rendering, the
// same wrapper every `newgame` setup screen uses to read a rematch link.
export default function Join() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}
