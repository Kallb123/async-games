'use client'
import SettlementsAndCitiesBoard from '@/games/SettlementsAndCities/components/SettlementsAndCitiesBoard';
import type { ISACBoardResponse } from '@/games/SettlementsAndCities/apiModels';
import type { ResultBoardProps } from '@/components/games/ResultBoard';
import { playerColourForId } from '@/utils/ui/playerColours';

// The board as a Settlements & Cities game ended, on its result page: the
// game's own board with nothing to tap, coloured by the same seat order the
// game was.
export default function SACResultBoard({ board, playerIds }: ResultBoardProps<ISACBoardResponse>) {
    return (
        <SettlementsAndCitiesBoard
            {...board}
            colorForOwner={owner => playerColourForId(owner, playerIds)}
        />
    );
}
