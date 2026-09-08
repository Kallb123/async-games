'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useState } from "react";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionToggleRow from "@/components/ui/OptionToggleRow";
import { GAME_META } from "@/utils/ui/games";
import { SolitaireDrawMode, SolitaireInvitationRequest } from "@/games/Solitaire/SolitaireModels";
import { useStartSoloGame } from "@/utils/hooks/useStartSoloGame";

export default function NewGameSolitaire() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();
  const [drawMode, setDrawMode] = useState<SolitaireDrawMode>('DRAW_1');
  const { starting, start } = useStartSoloGame('/api/newgame/solitaire');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: SolitaireInvitationRequest = { drawMode };
    await start(data);
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
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
