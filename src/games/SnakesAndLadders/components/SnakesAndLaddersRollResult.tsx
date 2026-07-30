import Dice from "@/components/ui/Dice";
import { ISnakesAndLaddersDiceRollOutcome } from "@/utils/apiModels/GameLogic";
import { useEffect, useState } from "react";

export type Verdict = 'snake' | 'ladder' | 'plain' | 'nomove' | 'win';

export interface RollResult {
    /** The rolling command's id — two bonus rolls can otherwise look identical. */
    id: string;
    roll: number;
    from: number;
    landing: number;
    newPosition: number;
    verdict: Verdict;
    /** Re-roll-on-6 games: the die comes straight back to this player. */
    extraRoll: boolean;
}

const VERDICT_ICON: Record<Verdict, string> = {
    snake: '🐍', ladder: '🪜', plain: '👣', nomove: '🎯', win: '🏁',
};

const VERDICT_TITLE: Record<Verdict, string> = {
    snake: 'Oof — a snake!',
    ladder: 'Up you go — a ladder!',
    plain: 'On the move',
    nomove: 'So close!',
    win: 'You reached 100! 🎉',
};

/** Turn a raw dice-roll outcome + the pre-roll square into a display result. */
export function buildRollResult(id: string, from: number, outcome: ISnakesAndLaddersDiceRollOutcome): RollResult {
    const landing = from + outcome.roll;
    let verdict: Verdict = 'plain';
    if (outcome.newPosition === 100) verdict = 'win';
    else if (outcome.landedOnSnake) verdict = 'snake';
    else if (outcome.landedOnLadder) verdict = 'ladder';
    else if (outcome.newPosition === from) verdict = 'nomove';
    return {
        id,
        roll: outcome.roll,
        from,
        landing,
        newPosition: outcome.newPosition,
        verdict,
        extraRoll: outcome.extraRoll === true,
    };
}

/**
 * The async payoff screen: the die tumbles for a beat, then settles on the
 * real roll and reveals the move, the snake/ladder verdict and the new square.
 * Rendered at page level so it survives the turn advancing to the next player.
 */
export default function SnakesAndLaddersRollResult({ result, onDismiss }: { result: RollResult; onDismiss: () => void }) {
    const { roll, from, landing, newPosition, verdict, extraRoll } = result;

    // Tumble the die, cycling random faces, then settle on the real roll and
    // reveal the outcome — so the roll actually animates.
    const [rolling, setRolling] = useState(true);
    const [face, setFace] = useState(roll);
    // The page gives this component a key per roll, so a new roll arrives as a
    // fresh mount with `rolling` already true — no need to reset it here (which
    // would be a synchronous setState inside an effect).
    useEffect(() => {
        const cycle = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
        const settle = setTimeout(() => {
            clearInterval(cycle);
            setFace(roll);
            setRolling(false);
        }, 950);
        return () => { clearInterval(cycle); clearTimeout(settle); };
    }, [roll]);

    const stageClass = rolling
        ? 'ag-sl-roll-stage ag-sl-roll-stage--plain'
        : verdict === 'snake' ? 'ag-sl-roll-stage ag-sl-roll-stage--snake'
            : verdict === 'ladder' || verdict === 'win' ? 'ag-sl-roll-stage ag-sl-roll-stage--ladder'
                : 'ag-sl-roll-stage ag-sl-roll-stage--plain';

    // The square shown on the right of the move pill: for a snake/ladder that's
    // the square you *landed* on before the slide/climb; otherwise your new one.
    const pillTo = verdict === 'snake' || verdict === 'ladder' ? Math.min(landing, 100) : newPosition;

    let sub: React.ReactNode;
    if (verdict === 'snake') sub = <>You landed on {Math.min(landing, 100)} and slid down to <b>square {newPosition}</b>.</>;
    else if (verdict === 'ladder') sub = <>You landed on {Math.min(landing, 100)} and climbed up to <b>square {newPosition}</b>.</>;
    else if (verdict === 'win') sub = <>You raced home to <b>square 100</b> and won the game!</>;
    else if (verdict === 'nomove') sub = <>You need exactly {100 - from} to finish — you stay on <b>square {from}</b>.</>;
    else sub = <>You moved up to <b>square {newPosition}</b>.</>;
    if (extraRoll) sub = <>{sub} <b>A 6 — roll again!</b></>;

    return (
        <div className="ag-sl-roll">
            <div className="ag-game-topbar">
                <button className="ag-game-topbar-btn" onClick={onDismiss} aria-label="Close">←</button>
                <div className="ag-game-topbar-main">
                    <div className="ag-game-topbar-title">Snakes &amp; Ladders</div>
                    <div className="ag-game-topbar-sub">{rolling ? 'Rolling the die…' : `You rolled a ${roll}`}</div>
                </div>
            </div>

            <div className={stageClass}>
                <div className="ag-sl-roll-die">
                    <Dice values={[face]} rolling={rolling} />
                    <div className="ag-sl-roll-num">{face}</div>
                </div>

                {rolling ? (
                    <div className="ag-sl-verdict-title">Rolling…</div>
                ) : (
                    <>
                        <div className="ag-sl-move-pill ag-sl-reveal">
                            <span className="ag-sl-move-from">{from}</span>
                            <span>→</span>
                            <span>{pillTo}</span>
                        </div>
                        <div className="ag-sl-verdict-icon ag-sl-reveal">{VERDICT_ICON[verdict]}</div>
                        <div className="ag-sl-reveal">
                            <div className="ag-sl-verdict-title">{VERDICT_TITLE[verdict]}</div>
                            <div className="ag-sl-verdict-sub">{sub}</div>
                        </div>
                        <div className="ag-sl-newsquare ag-sl-reveal">
                            <span className="ag-sl-newsquare-label">New square</span>
                            <span className="ag-sl-newsquare-num">{newPosition}</span>
                        </div>
                    </>
                )}
            </div>

            <div className="ag-sl-roll-sheet">
                <div className="ag-sl-roll-grip" />
                <div className="ag-sl-roll-note">
                    <span style={{ fontSize: 20 }}>🎲</span>
                    <span>{extraRoll
                        ? 'A 6 — the die stays with you. Tap below to take another roll.'
                        : 'Nothing to decide here — the die did it. Tap below to hand the roll to the next player.'}</span>
                </div>
                <button className="ag-btn ag-btn--success ag-btn--block" onClick={onDismiss} disabled={rolling}>
                    {extraRoll ? '🎲 Roll again' : '✓ End turn'}
                </button>
                <div className="ag-sl-roll-foot">
                    {extraRoll ? 'Your turn carries on until you roll something else' : 'We’ll let the next player know it’s their roll'}
                </div>
            </div>
        </div>
    );
}
