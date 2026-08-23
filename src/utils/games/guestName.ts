// A guest-typed display name is text a real player sees, so this is the one
// floor it has to clear before a lobby seat can be claimed under it — length
// and character set, not moderation (docs/account-less-play.md §8). Callers
// pass an already-trimmed name; whitespace-only input reads as too short.
export const MIN_GUEST_NAME_LENGTH = 1;
export const MAX_GUEST_NAME_LENGTH = 20;

// Letters (any script), digits, spaces and the handful of marks real names
// actually use — nothing that reads as markup or control text.
const VALID_GUEST_NAME = /^[\p{L}\p{N} '.-]+$/u;

export function isValidGuestName(name: string): boolean {
    return name.length >= MIN_GUEST_NAME_LENGTH
        && name.length <= MAX_GUEST_NAME_LENGTH
        && VALID_GUEST_NAME.test(name);
}

// "Dave" -> "Dave", or "Dave (2)", "Dave (3)"... against names already
// seated at the lobby: display names aren't unique the way Clerk usernames
// are (docs/account-less-play.md §5), and two guests both typing "Dave"
// would otherwise be indistinguishable in the same seat list.
export function uniqueGuestName(name: string, takenNames: string[]): string {
    const taken = new Set(takenNames);
    if (!taken.has(name)) {
        return name;
    }
    let suffix = 2;
    while (taken.has(`${name} (${suffix})`)) {
        suffix++;
    }
    return `${name} (${suffix})`;
}

// Adjective+Animal, e.g. "AgitatedApe" — what a guest's name field
// auto-populates with before they've typed their own, and what the dice
// button beside it rerolls to. Kept short by design: every combination
// clears MAX_GUEST_NAME_LENGTH, so the result is always a valid guest name.
const GUEST_NAME_ADJECTIVES = [
    'Agitated', 'Amiable', 'Bouncy', 'Brave', 'Curious', 'Clumsy', 'Daring', 'Dizzy',
    'Eager', 'Elegant', 'Fuzzy', 'Feisty', 'Grumpy', 'Giddy', 'Happy', 'Hasty',
    'Itchy', 'Icy', 'Jumping', 'Jolly', 'Kooky', 'Keen', 'Lazy', 'Lively',
    'Mighty', 'Merry', 'Nimble', 'Noisy', 'Odd', 'Orderly', 'Playful', 'Plucky',
    'Quirky', 'Quiet', 'Rowdy', 'Rusty', 'Sneaky', 'Silly', 'Tiny', 'Tidy',
    'Upbeat', 'Unruly', 'Vexed', 'Vivid', 'Wobbly', 'Witty', 'Yawning', 'Yappy',
    'Zany', 'Zealous',
];

const GUEST_NAME_ANIMALS = [
    'Ape', 'Antelope', 'Bear', 'Badger', 'Cat', 'Coyote', 'Dolphin', 'Duck',
    'Eagle', 'Elk', 'Fox', 'Ferret', 'Goat', 'Gecko', 'Hippo', 'Hare',
    'Iguana', 'Impala', 'Jackal', 'Jaguar', 'Koala', 'Kiwi', 'Lion', 'Lynx',
    'Moose', 'Mole', 'Newt', 'Narwhal', 'Otter', 'Owl', 'Panda', 'Puma',
    'Quail', 'Quokka', 'Rabbit', 'Raccoon', 'Skunk', 'Sloth', 'Tiger', 'Toad',
    'Urchin', 'Uakari', 'Viper', 'Vulture', 'Walrus', 'Wombat', 'Yak', 'Zebra',
];

function pick<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

/**
 * A random Adjective+Animal name. Prefers alliteration (AgitatedApe,
 * JumpingJackal) — falling back to any adjective once every alliterative
 * pairing for the animal it tried has already come up. `exclude` holds
 * names already offered in this reroll sequence (see the dice button on
 * /join), so mashing it doesn't hand back the same name twice in a row.
 */
export function randomGuestName(exclude: string[] = []): string {
    const taken = new Set(exclude);
    for (let attempt = 0; attempt < 50; attempt++) {
        const animal = pick(GUEST_NAME_ANIMALS);
        const alliterative = GUEST_NAME_ADJECTIVES.filter(adjective => adjective[0] === animal[0]);
        const candidates = alliterative.length > 0 ? alliterative : GUEST_NAME_ADJECTIVES;
        const untried = candidates.filter(adjective => !taken.has(`${adjective}${animal}`));
        if (untried.length > 0) {
            return `${pick(untried)}${animal}`;
        }
    }
    // Every pairing this loop tried was already excluded — an exclude list
    // this large only happens in a determined reroll spree, so a numeric
    // suffix keeps things moving instead of retrying forever.
    return `${pick(GUEST_NAME_ADJECTIVES)}${pick(GUEST_NAME_ANIMALS)}${Math.floor(Math.random() * 100)}`;
}
