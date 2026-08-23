'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionSection from "@/components/ui/OptionSection";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import PartySizeHint, { partySizeOutOfRange } from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { TrainTimeInvitationRequest } from "@/games/TrainTime/TrainTimeModels";
import { useToast } from "@/components/ToastContext";

function NewGameTrainTimeForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const { showToast } = useToast();
  const { minPlayers, maxPlayers } = GAME_META.traintime;
  const { seatCount, setSeatCount, submit } = useCreateLobbyOrInvite('TrainTime', '/api/newgame/traintime');

  // The sender is always a player, so the party size is invitees + open seats + 1.
  const totalPlayers = players.length + seatCount + 1;
  const badPartySize = partySizeOutOfRange(totalPlayers, minPlayers, maxPlayers);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (badPartySize) {
      showToast(`Train Time supports ${minPlayers}–${maxPlayers} players.`, 'danger');
      return;
    }

    const data: TrainTimeInvitationRequest = {
      userList: players,
      turnTimer
    };
    await submit(data);
  }

  return (
    <GameSetupLayout
      meta={GAME_META.traintime}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0 || badPartySize}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxPlayers - players.length - 1} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint total={totalPlayers} min={minPlayers} max={maxPlayers} gameName="Train Time" />

      {/* Continental (design doc §9) is the alternative Europe board — a whole
          second map plus tunnels, ferries and stations, and step 4 of the build
          order. The row is here so the option is discoverable, but there is
          nothing to enable yet, so it stays off and disabled. */}
      <OptionSection label="Expansions">
        <OptionToggleRow
          title="Continental"
          description="Coming soon. Swaps North America for a Europe map with tunnels, ferries and stations."
          on={false}
          onToggle={() => {}}
          disabled
        />
      </OptionSection>

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameTrainTime() {
  return (
    <Suspense fallback={null}>
      <NewGameTrainTimeForm />
    </Suspense>
  );
}
