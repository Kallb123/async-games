'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useState } from "react";
import GameSetupLayout from "@/components/ui/GameSetupLayout";
import OptionChoiceSection, { type OptionChoice } from "@/components/ui/OptionChoiceSection";
import { GAME_META } from "@/utils/ui/games";
import { SolitaireDrawMode, SolitaireInvitationRequest } from "@/games/Solitaire/SolitaireModels";
import { useStartSoloGame } from "@/utils/hooks/useStartSoloGame";

const DRAW_CHOICES: OptionChoice<SolitaireDrawMode>[] = [
  { id: 'DRAW_1', label: 'Draw 1', description: 'Turn one card from the stock at a time.' },
  { id: 'DRAW_3', label: 'Draw 3', description: 'Turn three cards from the stock at a time — harder.' },
];

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
      <OptionChoiceSection
        label="Draw"
        footer={<p className="ag-hint">Only the top card of what you draw is playable either way.</p>}
        value={drawMode}
        onChange={setDrawMode}
        disabled={starting}
        choices={DRAW_CHOICES}
      />
      <FcmTokenComp />
    </GameSetupLayout>
  );
}
