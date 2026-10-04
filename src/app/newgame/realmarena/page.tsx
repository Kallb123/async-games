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
import { RealmArenaInvitationRequest } from "@/games/RealmArena/RealmArenaModels";

// docs/games/realm-arena.md §17.3 PR 4: reachable by URL only until the game
// is turned on (§17.1). The party's size picks the map (§17.4 B2), so the
// choices are who, how fast, and whether the battle is fought in fog of war
// (§27).
function NewGameRealmArenaForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [fog, setFog] = useState(true);
  const gameMeta = GAME_META.realmarena;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
    gameType: 'RealmArena',
    invitePath: '/api/newgame/realmarena',
    invitedCount: players.length,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: RealmArenaInvitationRequest = {
      userList: players,
      turnTimer,
      fog,
    };
    await submit(data);
  };

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
      <OptionSection label="Realm Arena options">
        <OptionToggleRow
          title="Fog of war"
          description="Each player sees only what their squad can"
          on={fog}
          onToggle={() => setFog(v => !v)}
          ariaLabel="Toggle fog of war"
        />
      </OptionSection>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameRealmArena() {
  return (
    <Suspense fallback={null}>
      <NewGameRealmArenaForm />
    </Suspense>
  );
}
