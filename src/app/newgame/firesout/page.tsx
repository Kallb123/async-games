'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import PartySizeHint from "@/components/ui/PartySizeHint";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import CountSelect from "@/components/ui/CountSelect";
import OptionChoiceSection from "@/components/ui/OptionChoiceSection";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { useStartSoloGame } from "@/utils/hooks/useStartSoloGame";
import { GAME_META } from "@/utils/ui/games";
import { pluralize } from "@/utils/ui/text";
import { readRematchFlag, readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { IFiresOutInvitationRequest } from "@/games/FiresOut/FiresOutModels";
import { crewSizeFor, DEFAULT_SOLO_CREW, DIFFICULTY_TIERS, DifficultyId, FO_CREW_PARAM, FO_SOLO_PARAM, MAX_PLAYERS, MAX_SOLO_CREW, MIN_PLAYERS, MIN_SOLO_CREW, RulesetId } from "@/games/FiresOut/board";

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
  const [solo, setSolo] = useState(() => readRematchFlag(searchParams, FO_SOLO_PARAM));
  const [crewSize, setCrewSize] = useState(() => crewSizeFor(1, searchParams.get(FO_CREW_PARAM) ?? DEFAULT_SOLO_CREW));
  const gameMeta = GAME_META.firesout;
  const { seatCount, setSeatCount, maxSeats, partySize, canSubmit, actionLabel, footnote, submit } = useCreateLobbyOrInvite({
    meta: gameMeta,
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
      <OptionChoiceSection
        label="Mode"
        value={solo ? 'solo' : 'crew'}
        onChange={(mode) => setSolo(mode === 'solo')}
        disabled={starting}
        choices={[
          {
            id: 'crew',
            label: 'Crew',
            description: `Play with ${MIN_PLAYERS}–${MAX_PLAYERS} people, one firefighter each.`,
            ariaLabel: 'Play with a crew of other people',
          },
          {
            id: 'solo',
            label: 'Solo',
            description: 'Play on your own, running the whole crew yourself.',
            ariaLabel: 'Play solo, running the whole crew',
          },
        ]}
      />

      {solo ? (
        <CountSelect
          label="Crew size"
          value={crewSize}
          onChange={setCrewSize}
          min={MIN_SOLO_CREW}
          max={MAX_SOLO_CREW}
          optionLabel={(size) => pluralize(size, 'firefighter')}
          hint="Every firefighter gets their own turn and their own 4 AP — and the fire advances after each one, so a bigger crew is more to spend and more to survive."
          disabled={starting}
        />
      ) : (
        <>
          <UserInviteList userList={userList} setItem={setItem} />
          <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxSeats} />
        </>
      )}

      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />
      {!solo && <PartySizeHint meta={gameMeta} total={partySize} />}

      {/* §17.6 step 8 */}
      <OptionChoiceSection
        label="Ruleset"
        footer={<p className="ag-hint">Experienced adds a rolled, already-compromised building, hazmats and hot spots.</p>}
        value={ruleset}
        onChange={setRuleset}
        choices={[
          { id: 'family', label: 'Family', description: 'The printed starting fire and setup — quicker to learn.', ariaLabel: 'Play the Family game' },
          { id: 'experienced', label: 'Experienced', description: 'A rolled, randomised setup — harder, and different every game.', ariaLabel: 'Play the Experienced game' },
        ]}
      />

      {ruleset === 'experienced' && (
        // DIFFICULTY_TIERS is already {id, label, description}.
        <OptionChoiceSection label="Difficulty" value={difficulty} onChange={setDifficulty} choices={DIFFICULTY_TIERS} />
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
