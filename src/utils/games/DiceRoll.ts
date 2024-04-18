export async function DiceRollRequest(diceNumber: number): Promise<number> {
    return new Promise((resolve) => {
        fetch(`/api/utils/rolldice/${diceNumber}`)
        .then(response => {
            if (response.ok) {
                return response.json();
            }
        })
        .then(data => {
            if (data.roll) {
                resolve(data.roll);
            }
        });
    });
}

export function DiceRoll(diceNumber: number): number {
    return 1 + Math.floor(Math.random() * diceNumber);
}