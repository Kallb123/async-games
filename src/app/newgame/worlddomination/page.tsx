'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { WorldDominationInvitationRequest } from "@/games/WorldDomination/WorldDominationModels";
import { useToast } from "@/components/ToastContext";

const MAX_PLAYERS = 6;

export default function NewGameWorldDomination() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const { userList, setItem, players } = usePlayerList();
  const [turnTimer, setTurnTimer] = useState("1d");
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        router.push('/login');
      }
      const unlocked = user?.publicMetadata.unlocked;
      if (unlocked !== true) {
        router.push('/unlockaccess');
      }
    }
  }, [isLoaded]);

  // The sender is always a player, so the party size is invitees + 1.
  const totalPlayers = players.length + 1;
  const tooManyPlayers = totalPlayers > MAX_PLAYERS;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (tooManyPlayers) {
      showToast(`World Domination supports at most ${MAX_PLAYERS} players.`, 'danger');
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
      actionDisabled={players.length === 0 || tooManyPlayers}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <p className="ag-hint" style={tooManyPlayers ? { color: "var(--ag-terracotta)", fontWeight: 700 } : undefined}>
        {tooManyPlayers
          ? `⚠ Party size ${totalPlayers} · World Domination supports up to ${MAX_PLAYERS} players.`
          : `Party size ${totalPlayers} · supports 2–${MAX_PLAYERS} players.`}
      </p>
      <div className="ag-footer"><CurrentUserInfo /></div>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
