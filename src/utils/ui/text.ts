// Pluralizes a count-based noun phrase, e.g. pluralize(1, "turn") -> "1 turn",
// pluralize(3, "turn") -> "3 turns", pluralize(2, "guess", "guesses") -> "2 guesses".
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

// Formats a number as the swing it represents, e.g. signed(9) -> "+9",
// signed(-4) -> "-4". For scores that can go either way (Train Time's ticket
// haul, a bonus) where the sign is the point of the number.
export function signed(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
}
