'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import OptionSection from "@/components/ui/OptionSection";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { DiceCitiesInvitationRequest } from "@/games/DiceCities/DiceCitiesModels";
import { useToast } from "@/components/ToastContext";

function NewGameDiceCitiesForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [enabledDocks, setEnabledDocks] = useState(false);
  const [enabledBillionaireRow, setEnabledBillionaireRow] = useState(false);
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const router = useRouter();
  const { showToast } = useToast();

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
