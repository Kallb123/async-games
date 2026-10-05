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
import OptionChoiceSection, { type OptionChoice } from "@/components/ui/OptionChoiceSection";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META, partySizeRange } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import type { RealmArenaCoopInvite, RealmArenaInvitationRequest } from "@/games/RealmArena/RealmArenaModels";
import { COOP_PLAYERS, FACTION_IDS, FACTIONS, RANDOM_ENEMY } from "@/games/RealmArena/characters";

type Mode = 'freeForAll' | 'coop';
type Enemy = RealmArenaCoopInvite['enemy'];
type Mission = NonNullable<RealmArenaCoopInvite['mission']> | 'holdCentre';

// Co-op is for a team its battlefields are built for (§29.2), so the party's
// limits are its own while it's chosen.
const COOP_PARTY = { ...GAME_META.realmarena, name: `${GAME_META.realmarena.name} co-op`, minPlayers: COOP_PLAYERS.min, maxPlayers: COOP_PLAYERS.max };

// Whom a co-op team can fight (§29.3): every faction, or one drawn at random
// as the battle begins and unknown until it's seen.
const ENEMY_CHOICES: OptionChoice<Enemy>[] = [
  ...FACTION_IDS.map(id => ({ id, label: FACTIONS[id].name, description: `Fight ${FACTIONS[id].enemyName}.` })),
  { id: RANDOM_ENEMY, label: 'Random', description: 'Drawn as the battle begins, and unknown until one of its characters is seen.' },
];

// What a co-op team sets out to do (§30.3): the keep's points race, or surviving the waves.
const MISSION_CHOICES: OptionChoice<Mission>[] = [
  { id: 'holdCentre', label: 'Hold the Centre', description: 'Score points by controlling the keep and knocking enemies out.' },
  { id: 'holdOut', label: 'Hold Out', description: 'Survive repeated enemy waves until the last round.' },
];

// docs/games/realm-arena.md §17.3 PR 4. The party's size picks the map
// (§17.4 B2), so the choices are who, how fast, whether the battle is fought
// in fog of war (§27), and whether it's a free-for-all or the players
// together against the computer (§29.9) — and, in co-op, whom they fight.
function NewGameRealmArenaForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [fog, setFog] = useState(true);
  const [mode, setMode] = useState<Mode>('freeForAll');
  const [enemy, setEnemy] = useState<Enemy>(FACTION_IDS[0]);
  const [mission, setMission] = useState<Mission>('holdCentre');
  const coop = mode === 'coop';
  const gameMeta = GAME_META.realmarena;
  const partyMeta = coop ? COOP_PARTY : gameMeta;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: partyMeta,
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
      ...(coop ? { coop: { enemy, ...(mission === 'holdOut' ? { mission } : {}) } } : {}),
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
      <OptionChoiceSection
        label="Mode"
        value={mode}
        onChange={setMode}
        choices={[
          { id: 'freeForAll', label: 'Free-for-all', description: `Every squad for itself, for ${partySizeRange(gameMeta)}.` },
          { id: 'coop', label: 'Co-op against the computer', description: `Fight together as one team against the computer's warbands, for ${partySizeRange(COOP_PARTY)}.` },
        ]}
      />
      {/* Nothing to choose while there's one faction to fight (§29.3): the
          section appears the day a second is added. */}
      {coop && FACTION_IDS.length > 1 && (
        <OptionChoiceSection label="Enemy" value={enemy} onChange={setEnemy} choices={ENEMY_CHOICES} />
      )}
      {coop && (
        <OptionChoiceSection label="Mission" value={mission} onChange={setMission} choices={MISSION_CHOICES} />
      )}
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      <PartySizeHint meta={partyMeta} total={partySize} />
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
