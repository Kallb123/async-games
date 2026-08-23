// Uppercase letters and digits, minus the glyphs that are easy to misread or
// mistype for one another: I/O (look like the letters L/D or the digits 1/0)
// and the digits 0/1 themselves.
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const JOIN_CODE_LENGTH = 4;

export function generateJoinCode(): string {
    let code = '';
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
        code += JOIN_CODE_ALPHABET[Math.floor(Math.random() * JOIN_CODE_ALPHABET.length)];
    }
    return code;
}

// Someone typing `plum` or `pl um` must land in the same lobby as someone
// typing `PLUM`, so joining tolerates case and stray whitespace.
export function normaliseJoinCode(joinCode: string): string {
    return joinCode.toUpperCase().replace(/\s+/g, '');
}
