'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import { GAME_META } from "@/utils/ui/games";
import { SolitaireDrawMode, SolitaireInvitationRequest } from "@/games/Solitaire/SolitaireModels";
import { useToast } from "@/components/ToastContext";

export default function NewGameSolitaire() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const [drawMode, setDrawMode] = useState<SolitaireDrawMode>('DRAW_1');
  const [starting, setStarting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);

    try {
      const data: SolitaireInvitationRequest = { drawMode };
      const createResponse = await fetch('/api/newgame/solitaire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!createResponse.ok) {
        throw new Error('Failed to start game');
      }
      const { inviteId } = await createResponse.json();

      // Solo game: nobody else to accept, so this completes immediately.
      const acceptResponse = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId })
      });
      if (!acceptResponse.ok) {
        throw new Error('Failed to deal the game');
      }
      const { gameStarted, gameId, gameUrl } = await acceptResponse.json();
      if (!gameStarted) {
        throw new Error('Game did not start');
      }
      router.push(`/games/${gameUrl}/${gameId}`);
    } catch (error) {
      console.error(error);
      showToast('Failed to start the game. Please try again.', 'danger');
      setStarting(false);
    }
  }

  return (
    <GameSetupLayout
      meta={GAME_META.solitaire}
      onSubmit={handleSubmit}
      actionLabel={starting ? 'Dealing…' : 'Deal a new game'}
      actionDisabled={starting}
    >
      <div className="ag-section">
        <OptionToggleRow
          title="Draw 3 at a time"
          description="Draw three cards from the stock per turn instead of one. Only the top card is playable either way."
          on={drawMode === 'DRAW_3'}
          onToggle={() => setDrawMode(m => (m === 'DRAW_3' ? 'DRAW_1' : 'DRAW_3'))}
          disabled={starting}
        />
      </div>
      <div className="ag-footer"><CurrentUserInfo /></div>
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
