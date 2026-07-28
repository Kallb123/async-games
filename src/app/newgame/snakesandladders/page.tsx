'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { SnakesAndLaddersInvitationRequest } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import { useToast } from "@/components/ToastContext";

function NewGameSnakesAndLaddersForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const data: SnakesAndLaddersInvitationRequest = {
        userList: players,
        turnTimer
      };
      const response = await fetch('/api/newgame/snakesandladders', {
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
      meta={GAME_META.snakesandladders}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
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
