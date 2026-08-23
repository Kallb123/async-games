'use client'
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useToast } from "@/components/ToastContext";
import BackLink from "@/components/ui/BackLink";
import { normaliseJoinCode } from "@/utils/games/joinCode";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";

// What a code that opens nothing gets told — the same sentence whether the
// route refused it or the request never landed, so it's written once.
const BAD_CODE_MESSAGE = "That code doesn't work — check it and try again.";

// A code-holder with an account, landing here from a link or by typing the
// URL. A guest with no account belongs on this same route, but goes through
// its own signed-out lockup (AuthScreen) — step 13, not this commit.
export default function Join() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const router = useRouter();
  const { showToast } = useToast();
  const enterStartedGame = useEnterStartedGame();
  const [code, setCode] = useState("");
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
        <h1 className="ag-hero-title">Got a code?</h1>
        <p className="ag-hero-sub">Enter the code your host shared to grab an open seat.</p>
      </div>

      <form onSubmit={handleSubmit} className="ag-section">
        <input
          className="ag-input"
          style={{ font: "800 26px var(--ag-font)", letterSpacing: "0.3em", textAlign: "center", textTransform: "uppercase" }}
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
