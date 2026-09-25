import NamedChip from '@/components/ui/NamedChip';
import { BannedIsletCardId, cardGlyph, cardName } from '@/games/BannedIslet/board';

export default function BannedIsletCardChip({ card }: { card: BannedIsletCardId }) {
    return (
        <NamedChip
            indicator={<span className="ag-hand-card-emoji" aria-hidden="true">{cardGlyph(card)}</span>}
            label={cardName(card)}
        />
    );
}
