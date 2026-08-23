'use client'
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import OptionSection from "@/components/ui/OptionSection";
import SeatCountSelect from "@/components/ui/SeatCountSelect";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { useCreateLobbyOrInvite } from "@/utils/hooks/useCreateLobbyOrInvite";
import { GAME_META } from "@/utils/ui/games";
import { readRematchPlayers, readRematchTurnTimer } from "@/utils/ui/rematch";
import { SettlementsAndCitiesInvitationRequest } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import {
  SACExpansionId,
  SACExpansions,
  SAC_EXPANSION_META,
  defaultExpansions,
  normaliseExpansions,
  validateExpansions,
} from "@/games/SettlementsAndCities/expansions";
import { useToast } from "@/components/ToastContext";

// A rematch link carries enabled expansion ids as a comma-separated list
// (see GameFinishBanner); decode it back into a full SACExpansions record.
function expansionsFromParam(param: string | null): SACExpansions {
  if (!param) return defaultExpansions();
  const enabled = Object.fromEntries(param.split(',').filter(Boolean).map(id => [id, true]));
  return normaliseExpansions(enabled as Partial<SACExpansions>);
}

// One expansion row — a title/description/source block plus the shared toggle.
function ExpansionToggle({
  title,
  source,
  desc,
  on,
  onToggle,
  disabled,
}: {
  title: string;
  source: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <OptionToggleRow
      title={
        <>
          {title}
          <span style={{ color: "var(--ag-ink-softer)", fontWeight: 600 }}> · {source}</span>
        </>
      }
      description={desc}
      on={on}
      onToggle={onToggle}
      ariaLabel={`Toggle ${title}`}
      disabled={disabled}
    />
  );
}

function NewGameSettlementsAndCitiesForm() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const searchParams = useSearchParams();
  const { userList, setItem, players } = usePlayerList(readRematchPlayers(searchParams));
  const [turnTimer, setTurnTimer] = useState(() => readRematchTurnTimer(searchParams, "1d"));
  const [expansions, setExpansions] = useState(() => expansionsFromParam(searchParams.get('expansions')));
  const { showToast } = useToast();
  const { maxPlayers } = GAME_META.settlementsandcities;
  const { seatCount, setSeatCount, submit } = useCreateLobbyOrInvite('SettlementsAndCities', '/api/newgame/settlementsandcities');

  // The sender is always a player, so the party size is invitees + open seats + 1.
  const totalPlayers = players.length + seatCount + 1;
  const validation = useMemo(
    () => validateExpansions(expansions, totalPlayers),
    [expansions, totalPlayers],
  );

  const toggle = (id: SACExpansionId) =>
    setExpansions(prev => ({ ...prev, [id]: !prev[id] }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validation.ok) {
      showToast(validation.errors[0] ?? 'Invalid game setup.', 'danger');
      return;
    }

    const data: SettlementsAndCitiesInvitationRequest = {
      userList: players,
      turnTimer,
      expansions,
    };
    await submit(data);
  };

  return (
    <GameSetupLayout
      meta={GAME_META.settlementsandcities}
      onSubmit={handleSubmit}
      actionLabel="Send invites & start"
      actionDisabled={players.length === 0 || !validation.ok}
      footnote="Game begins once everyone accepts"
    >
      <UserInviteList userList={userList} setItem={setItem} />
      <SeatCountSelect value={seatCount} onChange={setSeatCount} max={maxPlayers - players.length - 1} />
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />

      <OptionSection
        label="Expansions"
        footer={<>
          {/* Live compatibility + player-count feedback (design doc §8). */}
          <p className="ag-hint">
            Party size {totalPlayers} · supports {validation.min}–{validation.max} players · first to{' '}
            <span className="ag-hi">{validation.victoryTarget} VP</span> wins.
          </p>
          {validation.errors.map((msg, i) => (
            <p
              key={`e${i}`}
              className="ag-hint"
              style={{ color: "var(--ag-terracotta)", fontWeight: 700 }}
            >
              ⚠ {msg}
            </p>
          ))}
          {validation.warnings.map((msg, i) => (
            <p key={`w${i}`} className="ag-hint" style={{ color: "var(--ag-gold)" }}>
              ℹ {msg}
            </p>
          ))}
        </>}
      >
        {SAC_EXPANSION_META.map(meta => (
          <ExpansionToggle
            key={meta.id}
            title={meta.name}
            source={meta.source}
            desc={meta.tagline}
            on={expansions[meta.id]}
            onToggle={() => toggle(meta.id)}
            disabled={meta.disabled}
          />
        ))}
      </OptionSection>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}

export default function NewGameSettlementsAndCities() {
  return (
    <Suspense fallback={null}>
      <NewGameSettlementsAndCitiesForm />
    </Suspense>
  );
}
