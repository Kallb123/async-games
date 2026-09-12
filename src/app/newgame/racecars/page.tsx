'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import OptionChoiceSection from "@/components/ui/OptionChoiceSection";
import OptionSection from "@/components/ui/OptionSection";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { RaceCarsInvitationRequest } from "@/games/RaceCars/RaceCarsModels";
import {
  DEFAULT_DISTANCE,
  DEFAULT_SPEC,
  RACE_DISTANCES,
  RaceCarsDistanceId,
  RaceCarsSpecId,
  SPECS,
  WEAR_TOKENS_PER_CAR,
} from "@/games/RaceCars/board";

// §6's first two choices, in the shape OptionChoiceSection takes. Built once
// at module scope: both tables are static, and a spec's three pools are the
// whole of what the choice means, so they read on the row rather than in a
// footnote underneath it.
const DISTANCE_CHOICES = RACE_DISTANCES.map(distance => ({
  id: distance.id,
  label: distance.name,
  description: distance.readsAs,
}));

const SPEC_CHOICES = SPECS.map(spec => ({
  id: spec.id,
  label: spec.name,
  description: `${spec.tyres} tyres · ${spec.brakes} brakes · ${spec.gearbox} gearbox — ${spec.readsAs}`,
}));

function NewGameRaceCarsForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [distance, setDistance] = useState<RaceCarsDistanceId>(DEFAULT_DISTANCE);
  const [spec, setSpec] = useState<RaceCarsSpecId>(DEFAULT_SPEC);
  const [oilSpills, setOilSpills] = useState(false);
  const gameMeta = GAME_META.racecars;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'RaceCars',
    invitePath: '/api/newgame/racecars',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const data: RaceCarsInvitationRequest = {
      userList: players,
      turnTimer,
      distance,
      spec,
      oilSpills,
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

      <OptionChoiceSection
        label="Race distance"
        value={distance}
        onChange={setDistance}
        choices={DISTANCE_CHOICES}
      />

      <OptionChoiceSection
        label="Car spec"
        footer={<p className="ag-hint">
          Every car runs the same spec — {WEAR_TOKENS_PER_CAR} wear tokens, split three ways.
        </p>}
        value={spec}
        onChange={setSpec}
        choices={SPEC_CHOICES}
      />

      {/* Genuinely on/off, so a plain toggle row rather than a third
          pick-one block (see OptionChoiceSection's own note). */}
      <OptionSection label="Optional module">
        <OptionToggleRow
          title="Oil spills"
          description="Hard braking leaves a slick behind you; a car that enters one rolls to stay on the road."
          on={oilSpills}
          onToggle={() => setOilSpills(on => !on)}
        />
      </OptionSection>

      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameRaceCars() {
  return (
    <Suspense fallback={null}>
      <NewGameRaceCarsForm />
    </Suspense>
  );
}
