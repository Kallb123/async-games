// Pluralizes a count-based noun phrase, e.g. pluralize(1, "turn") -> "1 turn",
// pluralize(3, "turn") -> "3 turns", pluralize(2, "guess", "guesses") -> "2 guesses".
export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
}
