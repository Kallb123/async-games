import { useState } from "react";
import { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";
import { IGameCommand, SmartthinkSetSecretCode, SmartthinkSubmitGuess } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import { SMARTTHINK_CODE_LENGTH, SMARTTHINK_PEGS } from "@/games/Smartthink/ui";

interface SmartthinkPlayerActionsProps {
    gameState: ISmartthinkGameStateResponse;
    isCodeSetter: boolean;
    isCodeBreaker: boolean;
    /** The in-progress code/guess, one peg value per slot (or null). */
    currentGuess: (number | null)[];
    setCurrentGuess: (next: (number | null)[]) => void;
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>;
}

export default function SmartthinkPlayerActions({
    gameState,
    isCodeSetter,
    isCodeBreaker,
    currentGuess,
    setCurrentGuess,
    submitCommand,
}: SmartthinkPlayerActionsProps) {
    const [submitDisabled, setSubmitDisabled] = useState(false);

    const settingSecret = !gameState.secretCodeSet && isCodeSetter;
    const guessing = gameState.secretCodeSet && isCodeBreaker;
    if (!settingSecret && !guessing) return null;

    const placePeg = (value: number) => {
        const next = [...currentGuess];
        const slot = next.findIndex(v => v === null || v === undefined);
        if (slot === -1) return; // all filled — Clear first
        next[slot] = value;
        setCurrentGuess(next);
    };

    const clear = () => setCurrentGuess(Array(SMARTTHINK_CODE_LENGTH).fill(null));

    const filled = currentGuess.every(v => v !== null && v !== undefined);

    const handleSubmit = async () => {
        if (submitDisabled || !filled) return;
        const code = currentGuess.map(v => v as number);
        const command = settingSecret ? new SmartthinkSetSecretCode() : new SmartthinkSubmitGuess();
        if (settingSecret) (command as SmartthinkSetSecretCode).secretCode = code;
        else (command as SmartthinkSubmitGuess).guess = code;

        setSubmitDisabled(true);
        await submitCommand(command, () => {
            setSubmitDisabled(false);
            clear();
        });
    };

    return (
        <>
            <div className="ag-st-palette-wrap">
                <div className="ag-st-palette-head">
                    <span className="ag-hand-title">{settingSecret ? 'Choose your code' : 'Peg palette'}</span>
                    <span className="ag-st-palette-note">tap to place · {SMARTTHINK_PEGS.length} colours</span>
                </div>
                <div className="ag-st-palette">
                    {SMARTTHINK_PEGS.map((peg, value) => (
                        <button
                            key={value}
                            type="button"
                            className="ag-st-palette-peg"
                            style={{ background: peg.hex }}
                            onClick={() => placePeg(value)}
                            disabled={filled}
                            aria-label={`Place ${peg.name} peg`}
                        />
                    ))}
                </div>
            </div>

            <div className="ag-actionsheet">
                {settingSecret && (
                    <p className="ag-action-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                        Pick {SMARTTHINK_CODE_LENGTH} pegs — only you will see it. Your opponent tries to crack it.
                    </p>
                )}
                <div className="ag-action-grid">
                    <button
                        className={`ag-btn ag-btn--block ${settingSecret ? 'ag-btn--success' : 'ag-btn--primary ag-btn--roll'}`}
                        onClick={handleSubmit}
                        disabled={submitDisabled || !filled}
                    >
                        {settingSecret ? '🔒 Set secret code' : '🔓 Submit guess'}
                    </button>
                    <button className="ag-btn ag-btn--light" onClick={clear} style={{ flex: '0 0 auto' }}>↺ Clear</button>
                </div>
            </div>
        </>
    );
}
