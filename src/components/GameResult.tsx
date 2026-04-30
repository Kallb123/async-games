interface GameResultProps {
    complete: boolean;
    winnerId: string;
    currentUserId: string | undefined;
    winnerDisplayName: string;
}

export default function GameResult({ complete, winnerId, currentUserId, winnerDisplayName }: GameResultProps) {
    if (!complete) {
        return null;
    }

    const currentUserWon = currentUserId !== undefined && currentUserId === winnerId;

    return (
        <div>
            {currentUserWon ? (
                <h2>You won! 🎉</h2>
            ) : (
                <h2>{winnerDisplayName} won! Better luck next time.</h2>
            )}
        </div>
    );
}
