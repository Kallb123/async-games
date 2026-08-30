// What a guest is called at the table they join under, and how that name is
// picked. The rule such a name has to clear is not here: it is every player's
// rule now, so it lives in users/displayName.ts beside the handle rule, and
// guestName.test.ts holds this module to it.
import { MAX_DISPLAY_NAME_LENGTH } from "@/utils/users/displayName";

// "Dave" -> "Dave", or "Dave (2)", "Dave (3)"... against names already
// seated at the lobby: display names aren't unique the way Clerk usernames
// are (docs/account-less-play.md §5), and two guests both typing "Dave"
// would otherwise be indistinguishable in the same seat list.
//
// What comes out is stored as the guest's display name, so it has to clear the
// same rule a typed one does — the suffix is made room for rather than added
// on top, or a guest who took the longest allowed name would be seated under
// one their own profile editor then refused to save.
export function uniqueGuestName(name: string, takenNames: string[]): string {
    const taken = new Set(takenNames);
    if (!taken.has(name)) {
        return name;
    }
    let suffix = 2;
    let suffixed = withSuffix(name, suffix);
    while (taken.has(suffixed)) {
        suffixed = withSuffix(name, ++suffix);
    }
    return suffixed;
}

function withSuffix(name: string, suffix: number): string {
    const tail = ` (${suffix})`;
    return `${name.slice(0, MAX_DISPLAY_NAME_LENGTH - tail.length).trim()}${tail}`;
}

// Adjective+Animal, e.g. "AgitatedApe" — what a guest's name field
// auto-populates with before they've typed their own, and what the dice
// button beside it rerolls to. Kept short by design: every combination
// clears MAX_DISPLAY_NAME_LENGTH, so the result is always a valid name.
const GUEST_NAME_ADJECTIVES = [
    'Agitated', 'Amiable', 'Awkward', 'Ancient', 'Bouncy', 'Brave', 'Bold', 'Breezy',
    'Curious', 'Clumsy', 'Cheeky', 'Chill', 'Daring', 'Dizzy', 'Dapper', 'Drowsy',
    'Eager', 'Elegant', 'Excited', 'Earnest', 'Fuzzy', 'Feisty', 'Frisky', 'Friendly',
    'Grumpy', 'Giddy', 'Goofy', 'Gentle', 'Happy', 'Hasty', 'Handsome', 'Hungry',
    'Itchy', 'Icy', 'Impish', 'Iconic', 'Jumping', 'Jolly', 'Jaunty', 'Jazzy',
    'Kooky', 'Keen', 'Klutzy', 'Kind', 'Lazy', 'Lively', 'Loud', 'Loyal',
    'Mighty', 'Merry', 'Moody', 'Muddy', 'Nimble', 'Noisy', 'Naughty', 'Nervous',
    'Odd', 'Orderly', 'Outgoing', 'Oafish', 'Playful', 'Plucky', 'Peppy', 'Prickly',
    'Quirky', 'Quiet', 'Quaint', 'Quick', 'Rowdy', 'Rusty', 'Ready', 'Rare',
    'Sneaky', 'Silly', 'Spry', 'Sturdy', 'Tiny', 'Tidy', 'Tender', 'Tough',
    'Upbeat', 'Unruly', 'Uneasy', 'Useful', 'Vexed', 'Vivid', 'Valiant', 'Velvety',
    'Wobbly', 'Witty', 'Weary', 'Wacky', 'Yawning', 'Yappy', 'Young', 'Yummy',
    'Zany', 'Zealous', 'Zippy', 'Zesty',
];

const GUEST_NAME_ANIMALS = [
    'Ape', 'Antelope', 'Alpaca', 'Armadillo', 'Bear', 'Badger', 'Beaver', 'Bison',
    'Cat', 'Coyote', 'Cheetah', 'Cobra', 'Dolphin', 'Duck', 'Deer', 'Donkey',
    'Eagle', 'Elk', 'Emu', 'Egret', 'Fox', 'Ferret', 'Falcon', 'Flamingo',
    'Goat', 'Gecko', 'Gorilla', 'Giraffe', 'Hippo', 'Hare', 'Hedgehog', 'Heron',
    'Iguana', 'Impala', 'Ibis', 'Ibex', 'Jackal', 'Jaguar', 'Jay', 'Jerboa',
    'Koala', 'Kiwi', 'Kangaroo', 'Kestrel', 'Lion', 'Lynx', 'Llama', 'Leopard',
    'Moose', 'Mole', 'Manatee', 'Meerkat', 'Newt', 'Narwhal', 'Nutria', 'Numbat',
    'Otter', 'Owl', 'Ocelot', 'Orca', 'Panda', 'Puma', 'Penguin', 'Pelican',
    'Quail', 'Quokka', 'Quetzal', 'Quoll', 'Rabbit', 'Raccoon', 'Rhino', 'Robin',
    'Skunk', 'Sloth', 'Seal', 'Squirrel', 'Tiger', 'Toad', 'Turtle', 'Tapir',
    'Urchin', 'Uakari', 'Urial', 'Umbrellabird', 'Viper', 'Vulture', 'Vole', 'Vervet',
    'Walrus', 'Wombat', 'Weasel', 'Wolf', 'Yak', 'Yabby', 'Yeti', 'Zebra',
    'Zorilla', 'Zokor',
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
