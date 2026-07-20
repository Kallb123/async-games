import { ISmartthinkGuessRowResponse } from "@/games/Smartthink/apiModels";
import { SMARTTHINK_CODE_LENGTH, SMARTTHINK_PEGS } from "@/utils/ui/smartthink";

interface SmartthinkBoardProps {
    guessRows: ISmartthinkGuessRowResponse[];
    maxGuesses: number;
    /** In-progress guess for the breaker's live turn: peg value per slot or null. */
    currentGuess?: (number | null)[];
    /** Whether to render the highlighted in-progress guess row at the bottom. */
    showCurrentRow?: boolean;
}

// The four feedback pegs for a scored guess: `black` right-spot dots first,
// then `white` right-colour rings, padded with neutral "none" dots.
function feedbackDots(black: number, white: number) {
    const dots: string[] = [];
    for (let i = 0; i < black; i++) dots.push('ag-st-fb--black');
    for (let i = 0; i < white; i++) dots.push('ag-st-fb--white');
    while (dots.length < SMARTTHINK_CODE_LENGTH) dots.push('ag-st-fb--none');
    return dots.slice(0, SMARTTHINK_CODE_LENGTH);
}

function Peg({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined) return <div className="ag-st-peg ag-st-peg--empty" />;
    return <div className="ag-st-peg" style={{ background: SMARTTHINK_PEGS[value]?.hex }} />;
}

/**
 * The Smartthink deduction board: a masked SECRET row, the scored guess history
 * (each guess plus its feedback pegs) and — on the breaker's live turn — the
 * highlighted in-progress guess. Presentational; all state comes from props.
 */
export default function SmartthinkBoard({ guessRows, maxGuesses, currentGuess, showCurrentRow }: SmartthinkBoardProps) {
    const guessNumber = Math.min(guessRows.length + 1, maxGuesses);

    return (
        <div className="ag-st-area">
            <div className="ag-st-frame">
                <div className="ag-st-frame-head">
                    <div className="ag-st-secret">
                        <span className="ag-st-secret-label">SECRET</span>
                        <div className="ag-st-secret-pegs">
                            {Array.from({ length: SMARTTHINK_CODE_LENGTH }).map((_, i) => (
                                <div key={i} className="ag-st-secret-peg">?</div>
                            ))}
                        </div>
                    </div>
                    <div className="ag-st-progress">Guess {guessNumber} of {maxGuesses}</div>
                </div>

                <div className="ag-st-rows">
                    {guessRows.map((row, i) => (
                        <div key={i} className="ag-st-row">
                            <div className="ag-st-row-num">{i + 1}</div>
                            <div className="ag-st-guess">
                                {Array.from({ length: SMARTTHINK_CODE_LENGTH }).map((_, j) => (
                                    <Peg key={j} value={row.guess?.[j]} />
                                ))}
                            </div>
                            <div className="ag-st-feedback">
                                {feedbackDots(row.black, row.white).map((cls, k) => (
                                    <div key={k} className={`ag-st-fb ${cls}`} />
                                ))}
                            </div>
                        </div>
                    ))}

                    {showCurrentRow && (
                        <div className="ag-st-row ag-st-row--current">
                            <div className="ag-st-row-num">{guessNumber}</div>
                            <div className="ag-st-guess">
                                {Array.from({ length: SMARTTHINK_CODE_LENGTH }).map((_, j) => (
                                    <Peg key={j} value={currentGuess?.[j] ?? null} />
                                ))}
                            </div>
                            <div className="ag-st-row-hint">tap to fill</div>
                        </div>
                    )}
                </div>

                <div className="ag-st-legend">
                    <span><span className="ag-st-legend-dot ag-st-fb--black" />right spot</span>
                    <span><span className="ag-st-legend-dot ag-st-legend-dot--white" />right colour</span>
                </div>
            </div>
        </div>
    );
}
