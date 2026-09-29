'use client'
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import Section from '@/components/ui/Section';
import ChartLegend from '@/components/ui/ChartLegend';
import type { IGameResultResponse } from '@/utils/api/gameResultResponse';
import { playerChartSeries } from '@/utils/ui/playerColours';

// What every result-page board is handed: the final board its game's result
// kept (GAME_RESULT_STATS' `board`, in GameResultData.ts), and the result's
// roster in seat order, which is what the game coloured its players by.
export interface ResultBoardProps<Board> {
    board: Board;
    playerIds: string[];
}

// The board each game draws on its result page, keyed by gameType. Loaded only
// when a result needs it, so the result page doesn't carry every game's board.
// A game joins by keeping its final board on its result (a `board` on its
// GAME_RESULT_STATS entry) and adding one line here.
const RESULT_BOARDS: Record<string, ComponentType<ResultBoardProps<any>>> = {
    SettlementsAndCities: dynamic(() => import('@/games/SettlementsAndCities/components/SACResultBoard')),
};

// The "Final board" section of a result page — the board as the game ended,
// with a key to whose colour is whose. Renders nothing for a game that keeps
// no board, or a result recorded before its game kept one.
export default function ResultBoard({ result }: { result: IGameResultResponse }) {
    const Board = RESULT_BOARDS[result.gameType];
    if (!Board || result.board === undefined) return null;
    return (
        <Section label="Final board">
            <Board board={result.board} playerIds={result.playerIds} />
            <ChartLegend series={playerChartSeries(result.players, result.playerIds)} />
        </Section>
    );
}
