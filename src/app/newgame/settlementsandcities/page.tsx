'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import UserInviteList from "@/components/UserInviteList";
import TurnTimerSelect from "@/components/ui/TurnTimerSelect";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import usePlayerList from "@/utils/hooks/usePlayerList";
import { GAME_META } from "@/utils/ui/games";
import { SettlementsAndCitiesInvitationRequest } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import {
  SACExpansionId,
  SAC_EXPANSION_META,
  defaultExpansions,
  validateExpansions,
} from "@/games/SettlementsAndCities/expansions";
import { useToast } from "@/components/ToastContext";

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

export default function NewGameSettlementsAndCities() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const { userList, setItem, players } = usePlayerList();
  const [turnTimer, setTurnTimer] = useState("1d");
  const [expansions, setExpansions] = useState(defaultExpansions());
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (isLoaded) {
      if (!user) {
        router.push('/login');
      }
      const unlocked = user?.publicMetadata.unlocked;
      if (unlocked !== true) {
        router.push('/unlockaccess');
      }
    }
  }, [isLoaded]);

  // The sender is always a player, so the party size is invitees + 1.
  const totalPlayers = players.length + 1;
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

    try {
      const data: SettlementsAndCitiesInvitationRequest = {
        userList: players,
        turnTimer,
        expansions,
      };
      const response = await fetch('/api/newgame/settlementsandcities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to send invite');
      }
      showToast('Invitation sent! Waiting for players to accept.', 'success', 'Invite Sent');
      router.push('/');
    } catch (error) {
      console.error(error);
      showToast('Failed to send the invitation. Please try again.', 'danger');
    }
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
      <TurnTimerSelect value={turnTimer} onChange={setTurnTimer} />

      <div className="ag-section">
        <div className="ag-section-head">
          <h2 className="ag-section-label">Expansions</h2>
        </div>
        <div className="ag-card" style={{ padding: "4px 16px" }}>
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
        </div>

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
      </div>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
