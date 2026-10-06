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
import { useStartSoloGame } from "@/utils/hooks/useStartSoloGame";
import { GAME_META, partySizeRange } from "@/utils/ui/games";
import { readRematchFlag, readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import type { RealmArenaCoopInvite, RealmArenaInvitationRequest } from "@/games/RealmArena/RealmArenaModels";
import { factionRosterLine } from "@/games/RealmArena/roster";
import { BATTLE_SIZE_NAMES, COOP_PLAYERS, DIFFICULTY_NAMES, FACTION_IDS, FACTIONS, RA_SOLO_PARAM, RANDOM_ENEMY, type BattleSize, type Difficulty, type FactionId } from "@/games/RealmArena/characters";

type Mode = 'freeForAll' | 'coop' | 'solo';
type Enemy = RealmArenaCoopInvite['enemy'];
type Mission = NonNullable<RealmArenaCoopInvite['mission']> | 'holdCentre';
type Battlefield = NonNullable<RealmArenaCoopInvite['map']> | 'line';

const INVITE_PATH = '/api/newgame/realmarena';

// Co-op is for a team its battlefields are built for (§29.2), so the party's
// limits are its own while it's chosen. A team of one is Solo, which invites
// nobody (§30.6), so the team this screen invites starts at two.
const COOP_PARTY = { ...GAME_META.realmarena, name: `${GAME_META.realmarena.name} co-op`, minPlayers: GAME_META.realmarena.minPlayers, maxPlayers: COOP_PLAYERS.max };

// Whom a co-op team can fight (§29.3): every faction, or one drawn at random
// as the battle begins and unknown until it's seen.
const ENEMY_CHOICES: OptionChoice<Enemy>[] = [
  ...FACTION_IDS.map(id => ({ id, label: FACTIONS[id].name, description: `Fight ${FACTIONS[id].enemyName}.` })),
  { id: RANDOM_ENEMY, label: 'Random', description: 'Drawn as the battle begins, and unknown until one of its characters is seen.' },
];

// What a co-op team sets out to do (§30.3): the keep's points race, or surviving the waves.
const MISSION_CHOICES: OptionChoice<Mission>[] = [
  { id: 'holdCentre', label: 'Hold the Centre', description: 'Score points by controlling the keep and knocking enemies out.' },
  { id: 'holdOut', label: 'Hold Out', description: 'Survive enemy waves, each bigger than the last, until the last round.' },
];

// Where Hold Out is fought (§30.9): the fort built for it, or the line battle Hold the Centre is fought on.
const BATTLEFIELD_CHOICES: OptionChoice<Battlefield>[] = [
  { id: 'sackedFort', label: 'Sacked Fort', description: 'Start in the ruined keep in the middle, with the enemy closing in, and landing its waves, all round the edges.' },
  { id: 'line', label: 'Gate Fort', description: 'The Twin- or Three-Gate Fort, as in Hold the Centre: start along one edge, with the enemy opposite.' },
];

// How many points every squad musters (§30.5), for any mode.
const SIZE_CHOICES: OptionChoice<BattleSize>[] = [
  { id: 'small', label: BATTLE_SIZE_NAMES.small, description: 'Fewer points for every squad: smaller squads and quicker turns.' },
  { id: 'normal', label: BATTLE_SIZE_NAMES.normal, description: 'The usual points for the number of players.' },
  { id: 'large', label: BATTLE_SIZE_NAMES.large, description: 'More points for every squad: bigger squads and longer turns.' },
];

// How strong the computer's warbands are (§30.5): their size against the team's.
const DIFFICULTY_CHOICES: OptionChoice<Difficulty>[] = [
  { id: 'easy', label: DIFFICULTY_NAMES.easy, description: 'Each warband musters fewer points than each of you.' },
  { id: 'normal', label: DIFFICULTY_NAMES.normal, description: 'Each warband musters as many points as each of you.' },
  { id: 'hard', label: DIFFICULTY_NAMES.hard, description: 'Each warband musters more points than each of you.' },
];

// docs/games/realm-arena.md §17.3 PR 4. The party's size picks the map
// (§17.4 B2) — but for Hold Out's own battlefield (§30.9) — so the choices are who, how fast, whether the battle is fought
// in fog of war (§27), and whether it's a free-for-all or the players
// together against the computer (§29.9) — and, in co-op, whom they fight,
// and in Hold Out on which battlefield (§30.9) —
// and how big the battle is, and in co-op how strong the enemy (§30.5) —
// and which factions the players may muster from (B6), at least one. Solo
// (§30.6) is co-op with a team of one: nobody to invite and no turn timer,
// fought on the Ruined Fort, and started at once.
function NewGameRealmArenaForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [fog, setFog] = useState(true);
  // A rematch of a solo battle comes back to Solo rather than to an empty invite list.
  const [mode, setMode] = useState<Mode>(() => readRematchFlag(searchParams, RA_SOLO_PARAM) ? 'solo' : 'freeForAll');
  const [enemy, setEnemy] = useState<Enemy>(FACTION_IDS[0]);
  const [mission, setMission] = useState<Mission>('holdCentre');
  const [battlefield, setBattlefield] = useState<Battlefield>('sackedFort');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [size, setSize] = useState<BattleSize>('normal');
  const [factions, setFactions] = useState<readonly FactionId[]>(FACTION_IDS);
  const solo = mode === 'solo';
  // Solo is fought against the computer too, with every co-op choice but the battlefield.
  const coop = mode === 'coop' || solo;
  const gameMeta = GAME_META.realmarena;
  const partyMeta = coop ? COOP_PARTY : gameMeta;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: partyMeta,
    gameType: 'RealmArena',
    invitePath: INVITE_PATH,
    invitedCount: players.length,
  });
  const { starting, start } = useStartSoloGame(INVITE_PATH);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: RealmArenaInvitationRequest = {
      userList: solo ? [] : players,
      turnTimer,
      fog,
      factions: [...factions],
      ...(size !== 'normal' ? { size } : {}),
      ...(coop ? { coop: {
        enemy,
        ...(mission === 'holdOut' ? { mission, ...(battlefield !== 'line' && !solo ? { map: battlefield } : {}) } : {}),
        ...(difficulty !== 'normal' ? { difficulty } : {}),
      } } : {}),
      ...(solo ? { solo } : {}),
    };
    // Solo skips useCreateLobbyOrInvite's submit, which rightly refuses a
    // party the host is the only member of: its invitation is accepted at once.
    if (solo) await start(data);
    else await submit(data);
  };

  return (
    <GameSetupLayout
      meta={gameMeta}
      onSubmit={handleSubmit}
      actionLabel={solo ? (starting ? 'Mustering…' : 'Start the battle') : actionLabel}
      actionDisabled={solo ? starting : !canSubmit}
      footnote={solo ? 'Take your turns whenever you like: there is no turn timer' : footnote}
    >
      {!solo && (
        <>
          <UserInviteList userList={userList} setItem={setItem} />
          <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
          <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
          <PartySizeHint meta={partyMeta} total={partySize} />
        </>
      )}
      <OptionChoiceSection
        label="Mode"
        value={mode}
        onChange={setMode}
        disabled={starting}
        choices={[
          { id: 'freeForAll', label: 'Free-for-all', description: `Every squad for itself, for ${partySizeRange(gameMeta)}.` },
          { id: 'coop', label: 'Co-op against the computer', description: `Fight together as one team against the computer's warbands, for ${partySizeRange(COOP_PARTY)}.` },
          { id: 'solo', label: 'Solo', description: "Fight one of the computer's warbands on your own, on the Ruined Fort." },
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
      {/* Solo has the one battlefield, the Ruined Fort (§30.6). */}
      {coop && !solo && mission === 'holdOut' && (
        <OptionChoiceSection label="Battlefield" value={battlefield} onChange={setBattlefield} choices={BATTLEFIELD_CHOICES} />
      )}
      {coop && (
        <OptionChoiceSection label="Difficulty" value={difficulty} onChange={setDifficulty} choices={DIFFICULTY_CHOICES} />
      )}
      <OptionChoiceSection label="Battle size" value={size} onChange={setSize} choices={SIZE_CHOICES} />
      <OptionSection label="Factions" footer={<p className="ag-hint">Each player picks one of these as they muster. At least one stays on.</p>}>
        {FACTION_IDS.map(id => {
          const on = factions.includes(id);
          return (
            <OptionToggleRow
              key={id}
              title={FACTIONS[id].name}
              description={factionRosterLine(id)}
              on={on}
              // The last faction left on can't go: the players need one to muster from.
              disabled={on && factions.length === 1}
              onToggle={() => setFactions(on ? factions.filter(other => other !== id) : [...factions, id])}
            />
          );
        })}
      </OptionSection>
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
