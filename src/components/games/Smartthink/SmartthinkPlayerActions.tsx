import { useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";
import { IGameCommand, SmartthinkSetSecretCode, SmartthinkSubmitGuess } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";

const COLOURS = [
    { name: 'Red', value: 0, hex: '#e74c3c' },
    { name: 'Blue', value: 1, hex: '#3498db' },
    { name: 'Green', value: 2, hex: '#2ecc71' },
    { name: 'Yellow', value: 3, hex: '#f1c40f' },
    { name: 'Black', value: 4, hex: '#34495e' },
    { name: 'White', value: 5, hex: '#ecf0f1' }
];

interface SmartthinkPlayerActionsProps {
    gameState: ISmartthinkGameStateResponse;
    isCodeSetter: boolean;
    isCodeBreaker: boolean;
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>;
}

export default function SmartthinkPlayerActions({ gameState, isCodeSetter, isCodeBreaker, submitCommand }: SmartthinkPlayerActionsProps) {
    const [selectedPegs, setSelectedPegs] = useState<number[]>([0, 0, 0, 0]);
    const [submitDisabled, setSubmitDisabled] = useState(false);

    const role = useMemo(() => {
        if (!gameState.secretCodeSet && isCodeSetter) return 'Set secret code';
        if (gameState.secretCodeSet && isCodeBreaker) return 'Submit guess';
        return 'Waiting';
    }, [gameState.secretCodeSet, isCodeSetter, isCodeBreaker]);

    const handleSelectPeg = (index: number, value: number) => {
        const next = [...selectedPegs];
        next[index] = value;
        setSelectedPegs(next);
    };

    const handleSubmit = async () => {
        if (submitDisabled) return;
        if (!gameState.secretCodeSet && !isCodeSetter) return;
        if (gameState.secretCodeSet && !isCodeBreaker) return;

        const command = gameState.secretCodeSet ? new SmartthinkSubmitGuess() : new SmartthinkSetSecretCode();
        if (gameState.secretCodeSet) {
            (command as SmartthinkSubmitGuess).guess = [...selectedPegs];
        } else {
            (command as SmartthinkSetSecretCode).secretCode = [...selectedPegs];
        }

        setSubmitDisabled(true);
        await submitCommand(command, () => {
            setSubmitDisabled(false);
        });
    };

    return (
        <div style={{ marginTop: '16px' }}>
            <h3>{role}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(48px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                {selectedPegs.map((selected, index) => (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: COLOURS[selected].hex, border: '2px solid #333', marginBottom: '8px' }} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                            {COLOURS.map((colour) => (
                                <button
                                    key={colour.value}
                                    type="button"
                                    onClick={() => handleSelectPeg(index, colour.value)}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        border: selected === colour.value ? '2px solid #000' : '1px solid #555',
                                        backgroundColor: colour.hex,
                                        cursor: 'pointer'
                                    }}
                                    aria-label={`${colour.name} peg for position ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <Button onClick={handleSubmit} disabled={submitDisabled || role === 'Waiting'}>
                {gameState.secretCodeSet ? 'Submit Guess' : 'Set Secret Code'}
            </Button>
        </div>
    );
}
