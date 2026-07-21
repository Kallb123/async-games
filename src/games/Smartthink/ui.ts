// Smartthink peg palette — the six code colours, indexed by their engine value
// (0–5). Shared by the board, the player actions and the recap so the colour of
// a given peg value is defined in exactly one place.

export interface SmartthinkPeg {
    /** Human-readable colour name (used for aria labels / position hints). */
    name: string;
    /** Fill colour for the tactile peg. */
    hex: string;
}

export const SMARTTHINK_PEGS: SmartthinkPeg[] = [
    { name: 'red', hex: '#e74c3c' },
    { name: 'blue', hex: '#3498db' },
    { name: 'green', hex: '#2ecc71' },
    { name: 'yellow', hex: '#f4d03f' },
    { name: 'orange', hex: '#e67e22' },
    { name: 'purple', hex: '#9b59b6' },
];

/** How many pegs make up a code / guess. */
export const SMARTTHINK_CODE_LENGTH = 4;
