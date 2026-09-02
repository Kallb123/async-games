'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import OptionSection from "@/components/ui/OptionSection";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { IFiresOutInvitationRequest } from "@/games/FiresOut/FiresOutModels";
import { DIFFICULTY_TIERS, DifficultyId, RulesetId } from "@/games/FiresOut/rules";

function NewGameFiresOutForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [ruleset, setRuleset] = useState<RulesetId>('family');
  const [difficulty, setDifficulty] = useState<DifficultyId>('recruit');
  const gameMeta = GAME_META.firesout;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'FiresOut',
    invitePath: '/api/newgame/firesout',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: IFiresOutInvitationRequest = {
      userList: players,
      turnTimer,
      ruleset,
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

      {/* §17.6 step 8 — a mutually-exclusive picker via re-asserting
          OptionToggleRow, the same stopgap Outbreak's difficulty picker uses
          until an OptionRadioRow primitive exists. */}
      <OptionSection label="Ruleset" footer={<p className="ag-hint">Experienced adds a rolled, already-compromised building, hazmats and hot spots.</p>}>
        <OptionToggleRow
          title="Family"
          description="The printed starting fire and setup — quicker to learn."
          on={ruleset === 'family'}
          onToggle={() => setRuleset('family')}
          ariaLabel="Play the Family game"
        />
        <OptionToggleRow
          title="Experienced"
          description="A rolled, randomised setup — harder, and different every game."
          on={ruleset === 'experienced'}
          onToggle={() => setRuleset('experienced')}
          ariaLabel="Play the Experienced game"
        />
      </OptionSection>

      {ruleset === 'experienced' && (
        <OptionSection label="Difficulty">
          {DIFFICULTY_TIERS.map(d => (
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
      )}

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameFiresOut() {
  return (
    <Suspense fallback={null}>
      <NewGameFiresOutForm />
    </Suspense>
  );
}
