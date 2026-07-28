'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { DiceCitiesInvitationRequest } from "@/games/DiceCities/DiceCitiesModels";
import { useToast } from "@/components/ToastContext";

export default function NewGameDiceCities() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const { userList, setItem, players } = usePlayerList();
  const [enabledDocks, setEnabledDocks] = useState(false);
  const [enabledBillionaireRow, setEnabledBillionaireRow] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const data: DiceCitiesInvitationRequest = {
        userList: players,
        enabledDocks,
        enabledBillionaireRow,
        turnTimer
      };
      const response = await fetch('/api/newgame/dicecities', {
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
      meta={GAME_META.dicecities}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />

      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />

      <div className="ag-section">
        <div className="ag-section-head">
          <h2 className="ag-section-label">Dice Cities options</h2>
        </div>
        <div className="ag-card" style={{ padding: "4px 16px" }}>
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
        </div>
      </div>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
