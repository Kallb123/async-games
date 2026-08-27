'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import OptionSection from "@/components/ui/OptionSection";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { OutbreakInvitationRequest } from "@/games/Outbreak/OutbreakModels";
import { DIFFICULTIES, OutbreakDifficulty } from "@/games/Outbreak/board";

function NewGameOutbreakForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [difficulty, setDifficulty] = useState<OutbreakDifficulty>("standard");
  const gameMeta = GAME_META.outbreak;
  const { partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'Outbreak',
    invitePath: '/api/newgame/outbreak',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: OutbreakInvitationRequest = {
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
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint meta={gameMeta} total={partySize} />

      {/* No mutually-exclusive picker exists in components/ui/ yet — every
          other OptionToggleRow use is an independent flag. Three rows whose
          onToggle re-asserts "I'm the chosen one" is a stopgap; worth an
          OptionRadioRow primitive if a second setup screen needs this shape. */}
      <OptionSection label="Difficulty" footer={<p className="ag-hint">Sets the number of epidemic cards shuffled into the deck.</p>}>
        {DIFFICULTIES.map(d => (
          <OptionToggleRow
            key={d.id}
            title={d.label}
            description={d.description}
            on={difficulty === d.id}
            onToggle={() => setDifficulty(d.id)}
            ariaLabel={`Set difficulty to ${d.label}`}
          />
        ))}
      </OptionSection>

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameOutbreak() {
  return (
    <Suspense fallback={null}>
      <NewGameOutbreakForm />
    </Suspense>
  );
}
