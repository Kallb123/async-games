'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { SmartthinkInvitationRequest } from "@/games/Smartthink/SmartthinkModels";
import { useToast } from "@/components/ToastContext";

function NewGameSmartthinkForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const router = useRouter();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const data: SmartthinkInvitationRequest = {
        userList: players,
        turnTimer
      };
      const response = await fetch('/api/newgame/smartthink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        throw new Error('Failed to send invite');
      }
      showToast('Invitation sent! Waiting for players to accept.', 'success', 'Invite Sent');
      router.push('/');
    } catch (error) {
      console.error(error);
      showToast('Failed to send the invitation. Please try again.', 'danger');
    }
  };

  const handlePlaySolo = async () => {
    try {
      const response = await fetch('/api/newgame/smartthink/solo', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to start solo game');
      }
      const data = await response.json();
      router.push(`/games/${data.gameUrl}/${data.gameId}`);
    } catch (error) {
      console.error(error);
      showToast('Failed to start the solo game. Please try again.', 'danger');
    }
  };

  return (
    <GameSetupLayout
      meta={GAME_META.smartthink}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0}
      footnote="Game begins once everyone accepts"
    >
      <div className="ag-section">
        <div className="ag-cta" style={{ background: "var(--ag-green)", color: "var(--ag-on-dark)" }}>
          <div className="ag-cta-main">
            <div className="ag-cta-title">Play solo</div>
            <div className="ag-cta-sub">Guess an auto-generated code, right away</div>
          </div>
          <button type="button" className="ag-btn ag-btn--light" onClick={handlePlaySolo}>Start</button>
        </div>
      </div>

      <UserInviteList userList={userList} setItem={setItem} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameSmartthink() {
  return (
    <Suspense fallback={null}>
      <NewGameSmartthinkForm />
    </Suspense>
  );
}
