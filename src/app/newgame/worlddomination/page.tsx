'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint, { partySizeOutOfRange } from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { WorldDominationInvitationRequest } from "@/games/WorldDomination/WorldDominationModels";
import { useToast } from "@/components/ToastContext";

function NewGameWorldDominationForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const { showToast } = useToast();
  const { minPlayers, maxPlayers } = GAME_META.worlddomination;
  const { seatCount, setSeatCount, submit } = useCreateLobbyOrInvite('WorldDomination', '/api/newgame/worlddomination');

  // The sender is always a player, so the party size is invitees + open seats + 1.
  const totalPlayers = players.length + seatCount + 1;
  const badPartySize = partySizeOutOfRange(totalPlayers, minPlayers, maxPlayers);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (badPartySize) {
      showToast(`World Domination supports ${minPlayers}–${maxPlayers} players.`, 'danger');
      return;
    }

    const data: WorldDominationInvitationRequest = {
      userList: players,
      turnTimer
    };
    await submit(data);
  }

  return (
    <GameSetupLayout
      meta={GAME_META.worlddomination}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0 || badPartySize}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxPlayers - players.length - 1} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint total={totalPlayers} min={minPlayers} max={maxPlayers} gameName="World Domination" />
      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameWorldDomination() {
  return (
    <Suspense fallback={null}>
      <NewGameWorldDominationForm />
    </Suspense>
  );
}
