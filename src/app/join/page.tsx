'use client'
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useToast } from "@/components/ToastContext";
import BackLink from "@/components/ui/BackLink";
import { normaliseJoinCode, readJoinCode } from "@/utils/games/joinCode";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";

// What a code that opens nothing gets told — the same sentence whether the
// route refused it or the request never landed, so it's written once.
const BAD_CODE_MESSAGE = "That code doesn't work — check it and try again.";

// A code-holder with an account, landing here from a link or by typing the
// URL. A guest with no account belongs on this same route, but goes through
// its own signed-out lockup (AuthScreen) — step 13, not this commit.
function JoinForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
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
  const [joining, setJoining] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const joinCode = normaliseJoinCode(code);
    if (!joinCode || joining) return;
    setJoining(true);

    try {
      const response = await fetch('/api/lobby/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode })
      });
      if (!response.ok) {
        // A full lobby reads differently from a code that opens nothing: the
        // code was right, there was just nowhere to sit. Branch on the status
        // rather than the route's statusText, which HTTP/2 doesn't carry.
        showToast(response.status === 409
          ? "That lobby's full — every seat is taken."
          : BAD_CODE_MESSAGE, 'danger');
        setJoining(false);
        return;
      }
      const { gameStarted, gameId, gameUrl, inviteId, alreadySeated } = await response.json();
      if (gameStarted) {
        enterStartedGame(gameUrl, gameId);
      } else {
        // Into the lobby with the host and whoever else has claimed a seat,
        // rather than home: the remaining seats fill live there, and it takes
        // everyone waiting on it straight into the game once they do. Someone
        // who already has a place here (their other device, or the host with
        // their own code) lands on the same screen — one seat each — so only
        // the wording changes.
        const { title, body } = alreadySeated
          ? { title: 'Already In', body: "You're already in this one — here's the lobby." }
          : { title: 'Seat Claimed', body: "You're in! Waiting for the rest of the party." };
        showToast(body, 'success', title);
        router.push(`/lobby/${inviteId}`);
      }
    } catch (error) {
      console.error(error);
      showToast(BAD_CODE_MESSAGE, 'danger');
      setJoining(false);
    }
  };

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
        <input
          className="ag-input ag-joincode"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="PLUM"
          aria-label="Join code"
        />
        <button
          type="submit"
          className="ag-btn ag-btn--primary ag-btn--block"
          style={{ marginTop: 12 }}
          disabled={joining || !normaliseJoinCode(code)}
        >
          {joining ? 'Joining…' : 'Join game'}
        </button>
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
