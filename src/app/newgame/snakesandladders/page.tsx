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
import { readRematchFlag, readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { SnakesAndLaddersInvitationRequest } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import { SL_REROLL_PARAM } from "@/games/SnakesAndLadders/ui";

function NewGameSnakesAndLaddersForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [reRollOnSix, setReRollOnSix] = useState(() => readRematchFlag(searchParams, SL_REROLL_PARAM));
  const gameMeta = GAME_META.snakesandladders;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'SnakesAndLadders',
    invitePath: '/api/newgame/snakesandladders',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: SnakesAndLaddersInvitationRequest = {
      userList: players,
      turnTimer,
      reRollOnSix
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

      <OptionSection label="House rules">
        <OptionToggleRow
          title="Re-roll on a 6"
          description="Roll a 6 and you keep the die for another roll."
          on={reRollOnSix}
          onToggle={() => setReRollOnSix(v => !v)}
        />
      </OptionSection>

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameSnakesAndLadders() {
  return (
    <Suspense fallback={null}>
      <NewGameSnakesAndLaddersForm />
    </Suspense>
  );
}
