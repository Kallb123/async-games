'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
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
  const { maxPlayers } = GAME_META.snakesandladders;
  const { seatCount, setSeatCount, submit } = useCreateLobbyOrInvite('SnakesAndLadders', '/api/newgame/snakesandladders');

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
      meta={GAME_META.snakesandladders}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxPlayers - players.length - 1} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />

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
