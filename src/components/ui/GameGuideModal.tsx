'use client'

import InfoModal from '@/components/ui/InfoModal';
import type { GameGuide } from '@/utils/ui/gameGuides';

interface GameGuideModalProps {
    guide: GameGuide;
    onClose: () => void;
}

/**
 * The how-to-play popup shared by every game: a title plus a handful of
 * headed sections. Driven by `useGameGuide`, which opens this automatically
 * the first time a game not yet in the account's seen list is entered, and
 * on demand from the game-options menu's "Game guide" row.
 *
 * The popup itself is `InfoModal`, which every explainer in the app shares —
 * this is the game-shaped way in, so a caller passes a `GameGuide` rather
 * than unpacking one.
 */
export default function GameGuideModal({ guide, onClose }: GameGuideModalProps) {
    return <InfoModal title={guide.title} sections={guide.sections} onClose={onClose} />;
}
