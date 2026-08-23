'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META, gamePath } from "@/utils/ui/games";
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
  const gameMeta = GAME_META.smartthink;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'Smartthink',
    invitePath: '/api/newgame/smartthink',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: SmartthinkInvitationRequest = {
      userList: players,
      turnTimer
    };
    await submit(data);
  };

  const handlePlaySolo = async () => {
    try {
      const response = await fetch('/api/newgame/smartthink/solo', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to start solo game');
      }
      const data = await response.json();
      router.push(gamePath(data.gameUrl, data.gameId));
    } catch (error) {
      console.error(error);
      showToast('Failed to start the solo game. Please try again.', 'danger');
    }
  };

  return (
    <GameSetupLayout
      meta={gameMeta}
      onSubmit={handleSubmit}
      actionLabel={actionLabel}
      actionDisabled={!canSubmit}
      footnote={footnote}
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
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint meta={gameMeta} total={partySize} />
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
