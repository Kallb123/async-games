'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint, { partySizeOutOfRange } from "@/components/ui/PartySizeHint";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { WorldDominationInvitationRequest } from "@/games/WorldDomination/WorldDominationModels";
import { useToast } from "@/components/ToastContext";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

function NewGameWorldDominationForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const router = useRouter();
  const { showToast } = useToast();

  // The sender is always a player, so the party size is invitees + 1.
  const totalPlayers = players.length + 1;
  const badPartySize = partySizeOutOfRange(totalPlayers, MIN_PLAYERS, MAX_PLAYERS);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (badPartySize) {
      showToast(`World Domination supports ${MIN_PLAYERS}–${MAX_PLAYERS} players.`, 'danger');
      return;
    }

    try {
      const data: WorldDominationInvitationRequest = {
        userList: players,
        turnTimer
      };
      const response = await fetch('/api/newgame/worlddomination', {
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
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint total={totalPlayers} min={MIN_PLAYERS} max={MAX_PLAYERS} gameName="World Domination" />
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
