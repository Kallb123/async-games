'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import Section from "@/components/ui/Section";
import OptionSection from "@/components/ui/OptionSection";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { useStartSoloGame } from "@/utils/hooks/useStartSoloGame";
import { GAME_META } from "@/utils/ui/games";
import { pluralize } from "@/utils/ui/text";
import { readRematchFlag, readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { IFiresOutInvitationRequest } from "@/games/FiresOut/FiresOutModels";
import { crewSizeFor, DEFAULT_SOLO_CREW, DIFFICULTY_TIERS, DifficultyId, MAX_PLAYERS, MAX_SOLO_CREW, MIN_PLAYERS, MIN_SOLO_CREW, RulesetId } from "@/games/FiresOut/board";

const INVITE_PATH = '/api/newgame/firesout';

function NewGameFiresOutForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [ruleset, setRuleset] = useState<RulesetId>('family');
  const [difficulty, setDifficulty] = useState<DifficultyId>('recruit');
  // fires-out-gdd.md §17.6 step 12, docs/new-game.md's solo gotcha: the two
  // modes of §1 are two forms over the same options, so this screen is
  // mode-dependent rather than growing a second page. Solo drops the invite
  // list, the open seats and the party-size hint — there is nobody to
  // invite — and picks a crew size instead; the turn timer and the ruleset
  // and difficulty pickers below mean exactly the same thing in both.
  //
  // Both come pre-filled from a rematch link, so "play that again" after a
  // solo game returns to the solo form with the same crew rather than to an
  // empty crew form nobody can submit. The crew size goes through the same
  // clamp CreateGame uses, since it arrives off the query string.
  const [solo, setSolo] = useState(() => readRematchFlag(searchParams, 'solo'));
  const [crewSize, setCrewSize] = useState(() => crewSizeFor(1, searchParams.get('crew') ?? DEFAULT_SOLO_CREW));
  const gameMeta = GAME_META.firesout;
  // GAME_META now says "1–6 players", because solo is one of the two modes —
  // but the invite flow this hint and this hook police is the crew one, whose
  // floor is MIN_PLAYERS. Passing the game's own meta here would tell a host
  // with nobody invited that a party of one is supported while the button
  // stayed dead.
  const crewMeta = { ...gameMeta, minPlayers: MIN_PLAYERS, players: `${MIN_PLAYERS}–${MAX_PLAYERS} players` };
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: crewMeta,
    gameType: 'FiresOut',
    invitePath: INVITE_PATH,
    invitedCount: players.length,
  });
  const { starting, start } = useStartSoloGame(INVITE_PATH);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (solo) {
      // No invitee list and no open seats: the invitation is created empty and
      // accepted immediately (useStartSoloGame), which is why this doesn't go
      // through useCreateLobbyOrInvite's submit at all — that one refuses a
      // party the host is the only member of, and rightly so for a crew game.
      const data: IFiresOutInvitationRequest = {
        userList: [],
        turnTimer,
        ruleset,
        difficulty,
        crewSize,
      };
      await start(data);
      return;
    }

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
      actionLabel={solo ? (starting ? 'Rolling out…' : 'Start the shift') : actionLabel}
      actionDisabled={solo ? starting : !canSubmit}
      footnote={solo ? 'You take every firefighter in the crew, one turn at a time' : footnote}
    >
      {/* A mutually-exclusive picker via re-asserting OptionToggleRow — the
          same stopgap the Ruleset picker below uses until an OptionRadioRow
          primitive exists. */}
      <OptionSection label="Mode">
        <OptionToggleRow
          title="Crew"
          description={`Play with ${MIN_PLAYERS}–${MAX_PLAYERS} people, one firefighter each.`}
          on={!solo}
          onToggle={() => setSolo(false)}
          disabled={starting}
          ariaLabel="Play with a crew of other people"
        />
        <OptionToggleRow
          title="Solo"
          description="Play on your own, running the whole crew yourself."
          on={solo}
          onToggle={() => setSolo(true)}
          disabled={starting}
          ariaLabel="Play solo, running the whole crew"
        />
      </OptionSection>

      {solo ? (
        <Section label="Crew size">
          <select
            className="ag-select"
            value={crewSize}
            onChange={(e) => setCrewSize(Number(e.target.value))}
            disabled={starting}
          >
            {Array.from({ length: MAX_SOLO_CREW - MIN_SOLO_CREW + 1 }, (_, i) => MIN_SOLO_CREW + i).map(size => (
              <option key={size} value={size}>{pluralize(size, 'firefighter')}</option>
            ))}
          </select>
          <p className="ag-hint">
            Every firefighter gets their own turn and their own 4 AP — and the fire advances after each
            one, so a bigger crew is more to spend and more to survive.
          </p>
        </Section>
      ) : (
        <>
          <UserInviteList userList={userList} setItem={setItem} />
          <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
        </>
      )}

      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      {!solo && <PartySizeHint meta={crewMeta} total={partySize} />}

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
