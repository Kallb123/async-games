'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import OptionChoiceSection from "@/components/ui/OptionChoiceSection";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { BannedIsletInvitationRequest } from "@/games/BannedIslet/BannedIsletModels";
import { DIFFICULTIES, BannedIsletDifficulty } from "@/games/BannedIslet/board";

function NewGameBannedIsletForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [difficulty, setDifficulty] = useState<BannedIsletDifficulty>("normal");
  const gameMeta = GAME_META.bannedislet;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'BannedIslet',
    invitePath: '/api/newgame/bannedislet',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: BannedIsletInvitationRequest = {
      userList: players,
      turnTimer,
      difficulty,
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

      {/* §13's single dial: DIFFICULTIES is already {id, label, description}. */}
      <OptionChoiceSection
        label="Difficulty"
        footer={<p className="ag-hint">Sets the water level the island starts at — and how fast it floods.</p>}
        value={difficulty}
        onChange={setDifficulty}
        choices={DIFFICULTIES}
      />

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameBannedIslet() {
  return (
    <Suspense fallback={null}>
      <NewGameBannedIsletForm />
    </Suspense>
  );
}
