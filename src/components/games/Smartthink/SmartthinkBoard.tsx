import { ISmartthinkGuessRowResponse } from "@/games/Smartthink/apiModels";

const COLOUR_SWATCHES = [
    { name: 'Red', color: '#e74c3c' },
    { name: 'Blue', color: '#3498db' },
    { name: 'Green', color: '#2ecc71' },
    { name: 'Yellow', color: '#f1c40f' },
    { name: 'Black', color: '#34495e' },
    { name: 'White', color: '#ecf0f1', border: '1px solid #7f8c8d' }
];

interface SmartthinkBoardProps {
    guessRows: ISmartthinkGuessRowResponse[];
    maxGuesses: number;
    codeSetterUsername: string;
    codeBreakerUsername: string;
}

export default function SmartthinkBoard({ guessRows, maxGuesses, codeSetterUsername, codeBreakerUsername }: SmartthinkBoardProps) {
    const rows = [];
    for (let i = 0; i < maxGuesses; i++) {
        const guessRow = guessRows[i];
        rows.push(
            <tr key={i} style={{ height: '54px' }}>
                <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{i + 1}</td>
                <td style={{ padding: '4px' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {Array.from({ length: 4 }).map((_, j) => {
                            const pegValue = guessRow?.guess?.[j];
                            const swatch = pegValue !== undefined ? COLOUR_SWATCHES[pegValue] : null;
                            return (
                                <div key={j} style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: swatch?.color ?? '#bdc3c7', border: swatch?.border ?? '1px solid #7f8c8d' }} />
                            );
                        })}
                    </div>
                </td>
                <td style={{ padding: '4px', textAlign: 'center' }}>
                    {guessRow ? `${guessRow.black} black / ${guessRow.white} white` : ''}
                </td>
            </tr>
        );
    }

    return (
        <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: '12px' }}>
                <div><strong>Codemaker:</strong> {codeSetterUsername}</div>
                <div><strong>Codebreaker:</strong> {codeBreakerUsername}</div>
            </div>
            <div style={{ marginBottom: '12px', fontSize: '0.9em', color: '#555' }}>
                <div><strong>Black:</strong> a peg is the right colour in the right position</div>
                <div><strong>White:</strong> a peg is the right colour but in the wrong position</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
                <thead>
                    <tr>
                        <th style={{ width: '40px', padding: '4px' }}>#</th>
                        <th style={{ padding: '4px' }}>Guess</th>
                        <th style={{ width: '160px', padding: '4px' }}>Feedback</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>
    );
}
