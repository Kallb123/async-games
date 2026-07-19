'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import { GAME_META } from "@/utils/ui/games";
import { SettlementsAndCitiesInvitationRequest } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import { useToast } from "@/components/ToastContext";

export default function NewGameSettlementsAndCities() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const [userList, setUserList] = useState([""] as string[]);
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

  const setUserListItem = (index: number, value: string) => {
    const changedList = userList.map((u, i) => (i === index ? value : u));
    const filteredList = changedList.filter(u => u !== "");
    if (filteredList.length === 0) {
      setUserList([""]);
    } else if (filteredList[filteredList.length - 1] === "") {
      setUserList(filteredList);
    } else {
      setUserList([...filteredList, ""]);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const filteredUserList = userList.filter(u => u !== "");

    try {
      const data: SettlementsAndCitiesInvitationRequest = {
        userList: filteredUserList,
        turnTimer,
      };
      const response = await fetch('/api/newgame/settlementsandcities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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

  return (
    <GameSetupLayout
      meta={GAME_META.settlementsandcities}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={userList.filter(u => u !== "").length === 0}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setUserListItem} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <div className="ag-footer"><CurrentUserInfo /></div>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
