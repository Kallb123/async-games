// Whether two display names are the *same name to a reader*, which is the only
// question a seat list cares about. Two players whose names differ by a byte
// nobody can see are two rows a player reads as one person, and telling them
// apart is what `namesFor` exists to do — so it counts collisions on what this
// returns rather than on the strings themselves.
//
// A display name is free text in any script (see displayName.ts), so the gap
// between "different string" and "different name" is wide and deliberately
// reachable: `Dave`, `dave`, `D a v e`, `Dáve` and a `Dave` whose `a` is
// Cyrillic U+0430 are five strings and one name.
//
// The result is a comparison key and nothing else. It is never shown, never
// stored, and never what a player is called — each name is displayed exactly
// as its owner wrote it.

// The Latin letters that another script draws the same way. Not a full
// UTS-39 confusables table, which is a data file rather than a rule: this is
// the set that gets used, the lowercase Cyrillic and Greek letters that are
// homoglyphs of ASCII. Applied after lowercasing, so only lowercase forms
// need to be here.
const LOOKALIKES: Record<string, string> = {
    // Cyrillic
    'а': 'a', 'б': 'b', 'в': 'b', 'г': 'r', 'ԁ': 'd', 'е': 'e', 'ё': 'e', 'ѕ': 's',
    'і': 'i', 'ї': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'п': 'n',
    'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'ү': 'y', 'ф': 'o', 'х': 'x', 'ц': 'u',
    'ч': 'y', 'ъ': 'b', 'ь': 'b', 'э': 'e', 'ԛ': 'q', 'ѡ': 'w',
    // Greek
    'α': 'a', 'β': 'b', 'γ': 'y', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'n', 'θ': 'o',
    'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'u', 'ν': 'v', 'ο': 'o', 'π': 'n', 'ρ': 'p',
    'ς': 'c', 'σ': 'o', 'τ': 't', 'υ': 'u', 'φ': 'o', 'χ': 'x', 'ψ': 'y', 'ω': 'w',
    // Latin small capitals, which have no compatibility decomposition of their
    // own, so NFKD leaves them looking like the letters they imitate.
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ғ': 'f', 'ɢ': 'g', 'ʜ': 'h',
    'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p',
    'ǫ': 'q', 'ʀ': 'r', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
};

export function sameName(name: string): string {
    return name
        // NFKD splits an accented letter into letter + mark and flattens the
        // compatibility forms — full-width, ligatures, the circled and
        // superscript letters — onto the plain ones they imitate.
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        // Spaces and punctuation carry no identity of their own: "Dave",
        // "D.a.v.e" and "D a v e" are one name, and a lobby-suffixed
        // "Dave (2)" is not, because the digit survives.
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .replace(/./gu, character => LOOKALIKES[character] ?? character);
}
