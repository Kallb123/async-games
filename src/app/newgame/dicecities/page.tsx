'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import OptionSection from "@/components/ui/OptionSection";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { DiceCitiesInvitationRequest } from "@/games/DiceCities/DiceCitiesModels";

function NewGameDiceCitiesForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [enabledDocks, setEnabledDocks] = useState(false);
  const [enabledBillionaireRow, setEnabledBillionaireRow] = useState(false);
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const gameMeta = GAME_META.dicecities;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'DiceCities',
    invitePath: '/api/newgame/dicecities',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: DiceCitiesInvitationRequest = {
      userList: players,
      enabledDocks,
      enabledBillionaireRow,
      turnTimer
    };
    await submit(data);
  }

  return (
    <GameSetupLayout
      meta={gameMeta}
      onSubmit={handleSubmit}
      actionLabel={actionLabel}
      actionDisabled={!canSubmit}
      footnote={footnote}
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />

      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint meta={gameMeta} total={partySize} />

      <OptionSection label="Dice Cities options">
        <OptionToggleRow
          title="Docks"
          description="Coming soon. Adds ports and a wider die spread"
          on={enabledDocks}
          onToggle={() => setEnabledDocks(v => !v)}
          ariaLabel="Toggle docks expansion"
          disabled={true}
        />
        <OptionToggleRow
          title="Billionaire&apos;s Row"
          description="Coming soon. Higher-value landmark cards"
          on={enabledBillionaireRow}
          onToggle={() => setEnabledBillionaireRow(v => !v)}
          ariaLabel="Toggle Billionaire's Row expansion"
          disabled={true}
        />
      </OptionSection>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameDiceCities() {
  return (
    <Suspense fallback={null}>
      <NewGameDiceCitiesForm />
    </Suspense>
  );
}
