import Image from 'next/image';
import type { IDiceCitiesCard } from '@/games/DiceCities/apiModels';

// The card illustrations are portrait PNGs of this size in /public. Passing the
// real dimensions lets next/image serve an appropriately optimised copy — the
// board draws these at ~85–190px tall, the enlarged view at the full width of
// the popup, and the source files are ~75KB each. Exported because the portrait
// ratio is also what shapes the tappable slot in ZoomableCardArt.
export const ART_WIDTH = 162;
export const ART_HEIGHT = 248;

interface CardArtProps {
    /** A themed card — `theme.cards[id]`, whose `art` is already the path to
     *  that theme's face for it (see themes.ts). Nothing here has to know
     *  which theme that was. */
    card: IDiceCitiesCard;
    /** The ag-* class that sizes the slot this art sits in. */
    className: string;
}

// One card's illustration. Every board and action surface that shows card art
// goes through here so the sizing and loading behaviour stays in one place.
export default function CardArt({ card, className }: CardArtProps) {
    return (
        <Image
            className={className}
            src={card.art}
            alt=""
            width={ART_WIDTH}
            height={ART_HEIGHT}
        />
    );
}
